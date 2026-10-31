import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "../../audit";
import type { Db, Executor } from "../../db/client";
import { aiUsageEvents, platformSettings } from "../../db/schema";
import type { Env } from "../../env";
import { errors } from "../../errors";

/*
 * AI spending and safety controls (Admin AI Control Center). Stored in
 * platform_settings under one key, so every server instance reads the same
 * values. They only ever ADD limits: the env daily budget (AI_DAILY_BUDGET_MICROS),
 * per-subject allowances and the atomic reservation in runTool are unchanged.
 */

export const CONTROLS_KEY = "ai.controls";
const micros = z.number().int().min(0).max(1_000_000_000_000);
const limits = z.record(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*(\/[A-Za-z0-9._:\/@-]+)?$/).max(160), micros);

export const controlsSchema = z.strictObject({
  /** Emergency stop: every AI request is refused while on. */
  emergencyDisabled: z.boolean().default(false),
  /** Global daily limit; the effective limit is the lower of this and AI_DAILY_BUDGET_MICROS. */
  dailyBudgetMicros: micros.nullable().default(null),
  monthlyBudgetMicros: micros.nullable().default(null),
  /** Largest reservation one request may make (all of its calls). */
  maxRequestMicros: micros.nullable().default(null),
  /** Daily limits keyed by provider id, "provider/model" and tool id. */
  perProvider: limits.default({}),
  perModel: limits.default({}),
  perTool: limits.default({}),
  /** Providers switched off by an administrator: they fail closed. */
  disabledProviders: z.array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)).max(30).default([]),
});
export type Controls = z.infer<typeof controlsSchema>;
export const DEFAULT_CONTROLS: Controls = controlsSchema.parse({});

export async function loadControls(db: Executor): Promise<Controls & { version: number }> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, CONTROLS_KEY)).limit(1);
  if (!row) return { ...DEFAULT_CONTROLS, version: 0 };
  const parsed = controlsSchema.safeParse(row.value);
  // An unreadable stored value fails closed: everything paused until an admin saves valid controls.
  return parsed.success ? { ...parsed.data, version: row.version } : { ...DEFAULT_CONTROLS, emergencyDisabled: true, version: row.version };
}

/** Saves controls with optimistic concurrency: `version` must match what the admin read. */
export async function saveControls(db: Db, staff: { userId: string }, raw: unknown, version: number, client: { ip?: string | null; userAgent?: string | null } = {}) {
  // The read model carries `version`; it's checked separately, never stored inside the value.
  const value = raw && typeof raw === "object" ? Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "version")) : raw;
  const next = controlsSchema.parse(value);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(platformSettings).where(eq(platformSettings.key, CONTROLS_KEY)).for("update").limit(1);
    const current = row?.version ?? 0;
    if (current !== version) throw errors.conflict("Someone else changed these settings. Reload to see the latest values.");
    if (row) await tx.update(platformSettings).set({ value: next, version: current + 1, updatedBy: staff.userId, updatedAt: new Date() }).where(eq(platformSettings.key, CONTROLS_KEY));
    else await tx.insert(platformSettings).values({ key: CONTROLS_KEY, value: next, version: 1, updatedBy: staff.userId });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "ai_control.controls_saved", targetType: "setting", targetId: CONTROLS_KEY, before: row ? (row.value as Record<string, unknown>) : null, after: next, ip: client.ip, userAgent: client.userAgent });
  });
}

/** Emergency pause or resume, keeping every other value. */
export async function setEmergency(db: Db, staff: { userId: string }, disabled: boolean, client: { ip?: string | null; userAgent?: string | null } = {}) {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(platformSettings).where(eq(platformSettings.key, CONTROLS_KEY)).for("update").limit(1);
    const parsed = row ? controlsSchema.safeParse(row.value) : null;
    const value = { ...(parsed?.success ? parsed.data : DEFAULT_CONTROLS), emergencyDisabled: disabled };
    if (row) await tx.update(platformSettings).set({ value, version: row.version + 1, updatedBy: staff.userId, updatedAt: new Date() }).where(eq(platformSettings.key, CONTROLS_KEY));
    else await tx.insert(platformSettings).values({ key: CONTROLS_KEY, value, version: 1, updatedBy: staff.userId });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: disabled ? "ai_control.emergency_paused" : "ai_control.emergency_resumed", targetType: "setting", targetId: CONTROLS_KEY, ip: client.ip, userAgent: client.userAgent });
  });
}

const startOfUtcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const startOfUtcMonth = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/**
 * Checks the admin limits for one reservation. Called inside runTool's
 * reservation transaction, after its budget lock, so concurrent requests
 * can't overspend. Returns a plain-language reason when blocked.
 */
export async function budgetBlock(tx: Executor, c: Controls, r: { toolId: string; provider: string; model: string | null; reserve: number; env: Env }): Promise<{ code: string; reason: string } | null> {
  const day = startOfUtcDay();
  const sum = async (since: Date, extra?: ReturnType<typeof eq>) => {
    const [{ spent }] = await tx
      .select({ spent: sql<number>`coalesce(sum(${aiUsageEvents.costMicros}), 0)::bigint` })
      .from(aiUsageEvents)
      .where(extra ? and(gte(aiUsageEvents.createdAt, since), extra) : gte(aiUsageEvents.createdAt, since));
    return Number(spent);
  };
  if (c.dailyBudgetMicros !== null && (await sum(day)) + r.reserve > Math.min(c.dailyBudgetMicros, r.env.AI_DAILY_BUDGET_MICROS)) return { code: "daily_budget", reason: "Today's AI spending limit has been reached." };
  if (c.monthlyBudgetMicros !== null && (await sum(startOfUtcMonth())) + r.reserve > c.monthlyBudgetMicros) return { code: "monthly_budget", reason: "This month's AI spending limit has been reached." };
  const p = c.perProvider[r.provider];
  if (p !== undefined && (await sum(day, eq(aiUsageEvents.provider, r.provider))) + r.reserve > p) return { code: "provider_budget", reason: "Today's spending limit for this AI provider has been reached." };
  const m = r.model ? c.perModel[`${r.provider}/${r.model}`] : undefined;
  if (m !== undefined && (await sum(day, and(eq(aiUsageEvents.provider, r.provider), eq(aiUsageEvents.model, r.model!)) as ReturnType<typeof eq>)) + r.reserve > m) return { code: "model_budget", reason: "Today's spending limit for this model has been reached." };
  const t = c.perTool[r.toolId];
  if (t !== undefined && (await sum(day, eq(aiUsageEvents.toolId, r.toolId))) + r.reserve > t) return { code: "tool_budget", reason: "Today's spending limit for this tool has been reached." };
  return null;
}
