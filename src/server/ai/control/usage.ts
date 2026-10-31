import "server-only";
import { and, desc, eq, gte, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { AI_PROVIDER_BY_ID, AI_PROVIDERS, providerDisplayState } from "@/lib/ai/provider-catalog";
import { AI_TOOL_BY_ID } from "@/lib/ai/registry";
import type { Executor } from "../../db/client";
import { aiCredentials, aiToolAssignments, aiUsageEvents } from "../../db/schema";
import type { Env } from "../../env";
import { generationStatus } from "../provider";
import { type Controls, loadControls } from "./controls";

/*
 * Usage, costs and the overview for the Control Center, read from the
 * existing ai_usage_events records (metadata only). Costs are Sociotix's
 * estimates from recorded token counts and configured prices, or the
 * reservation ceiling when a provider didn't report usage. No provider
 * billing data is imported, and nothing is projected or invented.
 */

export const usageQuery = z.object({
  days: z.coerce.number().int().refine((n) => [1, 7, 30].includes(n)).optional().default(7),
  provider: z.string().max(40).optional().default(""),
  tool: z.string().max(60).optional().default(""),
});

const ERROR_STATUSES = sql`('provider_error', 'timeout', 'invalid_output')`;

export async function usageReport(db: Executor, raw: z.input<typeof usageQuery>) {
  const q = usageQuery.parse(raw);
  const since = new Date(Date.now() - q.days * 86_400_000);
  const filters: SQL[] = [gte(aiUsageEvents.createdAt, since)];
  if (q.provider) filters.push(eq(aiUsageEvents.provider, q.provider));
  if (q.tool) filters.push(eq(aiUsageEvents.toolId, q.tool));
  const where = and(...filters);
  const agg = {
    requests: sql<number>`count(*)::int`,
    succeeded: sql<number>`count(*) filter (where ${aiUsageEvents.status} = 'ok')::int`,
    errors: sql<number>`count(*) filter (where ${aiUsageEvents.status} in ${ERROR_STATUSES})::int`,
    blocked: sql<number>`count(*) filter (where ${aiUsageEvents.status} in ('rejected_quota', 'rejected_budget'))::int`,
    inputTokens: sql<number>`coalesce(sum(${aiUsageEvents.inputTokens}), 0)::bigint`,
    outputTokens: sql<number>`coalesce(sum(${aiUsageEvents.outputTokens}), 0)::bigint`,
    tokenRows: sql<number>`count(${aiUsageEvents.inputTokens})::int`,
    costMicros: sql<number>`coalesce(sum(${aiUsageEvents.costMicros}) filter (where ${aiUsageEvents.status} <> 'pending'), 0)::bigint`,
    lastSuccess: sql<Date | null>`max(${aiUsageEvents.createdAt}) filter (where ${aiUsageEvents.status} = 'ok')`,
  };
  const shape = (r: Record<string, unknown>) => ({
    requests: Number(r.requests),
    succeeded: Number(r.succeeded),
    errors: Number(r.errors),
    blocked: Number(r.blocked),
    inputTokens: Number(r.tokenRows) ? Number(r.inputTokens) : null,
    outputTokens: Number(r.tokenRows) ? Number(r.outputTokens) : null,
    costMicros: Number(r.costMicros),
    lastSuccess: r.lastSuccess ? new Date(r.lastSuccess as string).toISOString() : null,
  });
  const [byProvider, byModel, byTool, [total], recentErrors] = await Promise.all([
    db.select({ key: aiUsageEvents.provider, ...agg }).from(aiUsageEvents).where(where).groupBy(aiUsageEvents.provider),
    db.select({ provider: aiUsageEvents.provider, key: aiUsageEvents.model, ...agg }).from(aiUsageEvents).where(where).groupBy(aiUsageEvents.provider, aiUsageEvents.model),
    db.select({ key: aiUsageEvents.toolId, ...agg }).from(aiUsageEvents).where(where).groupBy(aiUsageEvents.toolId),
    db.select(agg).from(aiUsageEvents).where(where),
    db
      .select({ tool: aiUsageEvents.toolId, provider: aiUsageEvents.provider, status: aiUsageEvents.status, code: aiUsageEvents.errorCode, at: aiUsageEvents.createdAt })
      .from(aiUsageEvents)
      .where(and(where, sql`${aiUsageEvents.status} in ${ERROR_STATUSES}`))
      .orderBy(desc(aiUsageEvents.createdAt))
      .limit(10),
  ]);
  return {
    filters: q,
    total: shape(total),
    byProvider: byProvider.map((r) => ({ id: r.key ?? "none", name: r.key ? (AI_PROVIDER_BY_ID[r.key]?.name ?? r.key) : "Not sent to a provider", ...shape(r) })),
    byModel: byModel.filter((r) => r.key).map((r) => ({ provider: r.provider ?? "", model: r.key!, ...shape(r) })),
    byTool: byTool.map((r) => ({ id: r.key, name: AI_TOOL_BY_ID[r.key]?.name ?? r.key, ...shape(r) })),
    recentErrors: recentErrors.map((e) => ({ tool: AI_TOOL_BY_ID[e.tool]?.name ?? e.tool, provider: e.provider, status: e.status, code: e.code, at: e.at.toISOString() })),
  };
}

const startOfUtcDay = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const startOfUtcMonth = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

/** Budget consumption against every configured limit (estimates, including in-flight reservations). */
export async function budgetUsage(db: Executor, c: Controls, env: Env) {
  const sum = async (since: Date, extra?: SQL) => {
    const [{ spent }] = await db
      .select({ spent: sql<number>`coalesce(sum(${aiUsageEvents.costMicros}), 0)::bigint` })
      .from(aiUsageEvents)
      .where(extra ? and(gte(aiUsageEvents.createdAt, since), extra) : gte(aiUsageEvents.createdAt, since));
    return Number(spent);
  };
  const day = startOfUtcDay();
  const dailyLimit = c.dailyBudgetMicros === null ? env.AI_DAILY_BUDGET_MICROS : Math.min(c.dailyBudgetMicros, env.AI_DAILY_BUDGET_MICROS);
  return {
    today: { spent: await sum(day), limit: dailyLimit, envLimit: env.AI_DAILY_BUDGET_MICROS },
    month: { spent: await sum(startOfUtcMonth()), limit: c.monthlyBudgetMicros },
  };
}

/** The Overview: real states only. */
export async function overview(db: Executor, env: Env) {
  const controls = await loadControls(db);
  const [keys, assignments, budget] = await Promise.all([
    db.select({ providerId: aiCredentials.providerId, status: aiCredentials.status }).from(aiCredentials),
    db.select({ status: aiToolAssignments.status }).from(aiToolAssignments),
    budgetUsage(db, controls, env),
  ]);
  const activeProviders = new Set(keys.filter((k) => k.status === "active").map((k) => k.providerId));
  const gen = generationStatus(env);
  return {
    generation: { enabled: env.AI_GENERATION_ENABLED, live: gen.ok, reason: gen.ok ? null : gen.reason },
    emergencyDisabled: controls.emergencyDisabled,
    envProvider: env.AI_PROVIDER,
    providers: AI_PROVIDERS.map((p) => ({ id: p.id, name: p.name, product: p.product, state: providerDisplayState(p, { disabled: controls.disabledProviders.includes(p.id), activeVerified: activeProviders.has(p.id) }) })),
    keys: { total: keys.length, active: activeProviders.size },
    assignments: { active: assignments.filter((a) => a.status === "active").length, draft: assignments.filter((a) => a.status === "draft").length },
    budget,
  };
}
