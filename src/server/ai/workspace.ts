import "server-only";
import { and, count, desc, eq, gte, min, ne, or, sql } from "drizzle-orm";
import { AI_TOOL_BY_ID, AI_TOOLS, WORKSPACE_TOOLS } from "@/lib/ai/registry";
import {
  type AiProfileView,
  type CommandCenterData,
  cleanGoals,
  cleanPersona,
  DESTINATION_BY_ID,
  DESTINATIONS,
  profileInputSchema,
  type ToolUsageRow,
  USAGE_OUTCOMES,
  type UsageData,
  type UsageOutcome,
  type WorkspaceSnapshot,
} from "@/lib/ai/workspace";
import type { Db } from "../db/client";
import { aiProfiles, automationInbox, automations, socialConnections, socialPosts } from "../db/schema";
import type { Env } from "../env";
import { logger } from "../log";
import { planFor } from "./plans";
import { allowanceFor, effectiveAvailability, usageEventsToday } from "./run";

/*
 * Sociotix AI workspace (AI-09): the customer's AI preferences, the Command
 * Center snapshot and the usage dashboard. Read-only over existing records,
 * always scoped to the signed-in customer; nothing here changes accounting.
 */

export interface AiViewer {
  customerId: string;
  userId: string;
  name: string;
}

// Read when called, not at module load, so the result never depends on module evaluation order.
const allTools = () => [...AI_TOOLS, ...WORKSPACE_TOOLS];

export async function aiProfile(db: Db, customerId: string): Promise<AiProfileView | null> {
  const [row] = await db.select().from(aiProfiles).where(eq(aiProfiles.customerId, customerId)).limit(1);
  if (!row) return null;
  return { persona: cleanPersona(row.persona), goals: cleanGoals(row.goals), onboarding: row.onboarding === "completed" ? "completed" : "skipped", updatedAt: row.updatedAt.toISOString() };
}

/**
 * Saves the onboarding choices for the signed-in customer only. Skipping keeps
 * any earlier choices, so "not now" never erases preferences.
 */
export async function saveAiProfile(db: Db, customerId: string, raw: unknown, now = new Date()): Promise<AiProfileView> {
  const input = profileInputSchema.parse(raw);
  if (input.action === "complete") {
    const goals = cleanGoals(input.goals);
    await db
      .insert(aiProfiles)
      .values({ customerId, persona: input.persona, goals, onboarding: "completed", completedAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: aiProfiles.customerId, set: { persona: input.persona, goals, onboarding: "completed", completedAt: now, updatedAt: now } });
  } else {
    await db
      .insert(aiProfiles)
      .values({ customerId, onboarding: "skipped", updatedAt: now })
      .onConflictDoUpdate({ target: aiProfiles.customerId, set: { updatedAt: now, onboarding: sql`case when ${aiProfiles.persona} is null then 'skipped' else ${aiProfiles.onboarding} end` } });
  }
  return (await aiProfile(db, customerId))!;
}

const postTitle = sql<string>`coalesce(nullif(${socialPosts.title}, ''), left(${socialPosts.body}, 80))`;

/** Counts and a few recent items from the customer's own Social workspace. */
export async function workspaceSnapshot(db: Db, customerId: string, now = new Date()): Promise<WorkspaceSnapshot> {
  const mine = eq(socialPosts.customerId, customerId);
  const drafts = and(mine, eq(socialPosts.status, "draft"));
  const upcoming = and(mine, ne(socialPosts.status, "cancelled"), or(gte(socialPosts.scheduledAt, now), gte(socialPosts.plannedAt, now)));
  const plannedAt = sql<Date>`coalesce(${socialPosts.scheduledAt}, ${socialPosts.plannedAt})`;
  const [[draftCount], recent, [plannedCount], [next], [auto], [inbox], [accounts]] = await Promise.all([
    db.select({ n: count() }).from(socialPosts).where(drafts),
    db.select({ id: socialPosts.id, title: postTitle, updatedAt: socialPosts.updatedAt }).from(socialPosts).where(drafts).orderBy(desc(socialPosts.updatedAt)).limit(3),
    db.select({ n: count() }).from(socialPosts).where(upcoming),
    db.select({ id: socialPosts.id, title: postTitle, at: plannedAt }).from(socialPosts).where(upcoming).orderBy(plannedAt).limit(1),
    db
      .select({ total: count(), active: sql<number>`count(*) filter (where ${automations.status} = 'active')::int`, nextRunAt: min(sql<Date>`case when ${automations.status} = 'active' then ${automations.nextRunAt} end`) })
      .from(automations)
      .where(eq(automations.customerId, customerId)),
    db.select({ n: count() }).from(automationInbox).where(and(eq(automationInbox.customerId, customerId), eq(automationInbox.status, "open"))),
    db.select({ n: count() }).from(socialConnections).where(and(eq(socialConnections.customerId, customerId), ne(socialConnections.status, "disconnected"))),
  ]);
  const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
  return {
    drafts: { total: draftCount.n, recent: recent.map((r) => ({ id: r.id, title: r.title || "Untitled draft", updatedAt: r.updatedAt.toISOString() })) },
    planned: { total: plannedCount.n, next: next ? { id: next.id, title: next.title || "Untitled post", at: iso(next.at)! } : null },
    automations: { total: auto.total, active: Number(auto.active), nextRunAt: iso(auto.nextRunAt), openInbox: inbox.n },
    accounts: { connected: accounts.n },
  };
}

const toolAvailability = (env: Env) => Object.fromEntries(allTools().map((t) => [t.id, effectiveAvailability(t, { env })]));

/** Today's usage per tool. Unknown tool ids (retired tools) are left out; unreadable usage returns null. */
async function usageRows(db: Db, viewer: AiViewer, env: Env, tools: Record<string, ReturnType<typeof effectiveAvailability>>): Promise<ToolUsageRow[] | null> {
  const subject = { kind: "account" as const, userId: viewer.userId, customerId: viewer.customerId };
  let events: { toolId: string; status: string; n: number }[];
  try {
    events = await usageEventsToday(db, subject, env);
  } catch (e) {
    logger().warn({ err: e instanceof Error ? e.message : String(e) }, "ai usage could not be read");
    return null;
  }
  const byTool = new Map<string, Partial<Record<UsageOutcome, number>>>();
  for (const e of events) {
    if (!AI_TOOL_BY_ID[e.toolId] || !(e.status in USAGE_OUTCOMES)) continue;
    const o = byTool.get(e.toolId) ?? {};
    o[e.status as UsageOutcome] = (o[e.status as UsageOutcome] ?? 0) + Number(e.n);
    byTool.set(e.toolId, o);
  }
  const groupOf = new Map(DESTINATIONS.filter((d) => d.toolId).map((d) => [d.toolId!, d]));
  return allTools().filter((t) => t.free && t.availability !== "unavailable").map((t) => {
    const outcomes = byTool.get(t.id) ?? {};
    const used = (outcomes.ok ?? 0) + (outcomes.pending ?? 0);
    const allowance = allowanceFor(t, subject, env);
    // The Workflow Assistant lives inside Automation Studio, so it's listed with the social workspace.
    const d = groupOf.get(t.id) ?? (t.id === "automation-assistant" ? DESTINATION_BY_ID.automations : undefined);
    return { toolId: t.id, name: d?.toolId === t.id ? d.name : t.name, href: d?.href ?? null, group: d?.group ?? "assist", availability: tools[t.id], allowance, used, remaining: Math.max(0, allowance - used), outcomes };
  });
}

const nextUtcMidnight = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

export async function usageData(db: Db, viewer: AiViewer, env: Env, now = new Date()): Promise<UsageData> {
  const tools = toolAvailability(env);
  const plan = planFor(viewer.customerId);
  const rows = await usageRows(db, viewer, env, tools);
  const all = rows ?? [];
  const sum = (counted: boolean) => all.reduce((n, r) => n + Object.entries(r.outcomes).reduce((m, [k, v]) => m + (USAGE_OUTCOMES[k as UsageOutcome].counted === counted ? v : 0), 0), 0);
  return {
    plan: { id: plan.id, name: plan.name },
    readable: rows !== null,
    generation: Object.values(tools).includes("available"),
    resetAt: nextUtcMidnight(now).toISOString(),
    tools: all,
    totals: { counted: sum(true), notCounted: sum(false) },
  };
}

export async function commandCenterData(db: Db, viewer: AiViewer, env: Env): Promise<CommandCenterData> {
  const tools = toolAvailability(env);
  const plan = planFor(viewer.customerId);
  const [profile, workspace, rows] = await Promise.all([aiProfile(db, viewer.customerId), workspaceSnapshot(db, viewer.customerId), usageRows(db, viewer, env, tools)]);
  return {
    firstName: viewer.name.split(/\s+/)[0] || viewer.name,
    profile,
    tools,
    generation: Object.values(tools).includes("available"),
    workspace,
    runsToday: rows ? rows.reduce((n, r) => n + r.used, 0) : null,
    plan: { id: plan.id, name: plan.name },
  };
}
