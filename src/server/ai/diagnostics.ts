import "server-only";
import { gte, sql } from "drizzle-orm";
import { AI_TOOL_BY_ID } from "@/lib/ai/registry";
import type { Db } from "../db/client";
import { aiUsageEvents } from "../db/schema";
import type { Env } from "../env";
import { priceFor } from "./pricing";
import { generationStatus, providerStatus } from "./provider";

/**
 * Lightweight AI operations view (AI-02): configuration state, today's spend
 * against the budget, and request outcomes. Built from usage metadata only —
 * no prompts or generated text exist to show. Never includes the API key.
 */

export interface AiToolStats {
  toolId: string;
  name: string;
  requests: number;
  ok: number;
  failed: number;
  invalid: number;
  quotaRejected: number;
  budgetRejected: number;
  spendMicros: number;
  avgLatencyMs: number | null;
}

const startOfUtcDay = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

export async function aiDiagnostics(db: Db, env: Env) {
  const provider = providerStatus(env);
  const generation = generationStatus(env);
  const today = startOfUtcDay();
  const week = new Date(today.getTime() - 6 * 86_400_000);

  const byTool = async (since: Date) => {
    const rows = await db
      .select({
        toolId: aiUsageEvents.toolId,
        requests: sql<number>`count(*)::int`,
        ok: sql<number>`count(*) filter (where ${aiUsageEvents.status} = 'ok')::int`,
        failed: sql<number>`count(*) filter (where ${aiUsageEvents.status} in ('provider_error', 'timeout'))::int`,
        invalid: sql<number>`count(*) filter (where ${aiUsageEvents.status} = 'invalid_output')::int`,
        quotaRejected: sql<number>`count(*) filter (where ${aiUsageEvents.status} = 'rejected_quota')::int`,
        budgetRejected: sql<number>`count(*) filter (where ${aiUsageEvents.status} = 'rejected_budget')::int`,
        spendMicros: sql<number>`coalesce(sum(${aiUsageEvents.costMicros}) filter (where ${aiUsageEvents.status} <> 'pending'), 0)::bigint`,
        avgLatencyMs: sql<number | null>`round(avg(${aiUsageEvents.latencyMs}) filter (where ${aiUsageEvents.status} = 'ok'))::int`,
      })
      .from(aiUsageEvents)
      .where(gte(aiUsageEvents.createdAt, since))
      .groupBy(aiUsageEvents.toolId);
    return rows.map((r): AiToolStats => ({ ...r, spendMicros: Number(r.spendMicros), name: AI_TOOL_BY_ID[r.toolId]?.name ?? r.toolId })).sort((a, b) => b.requests - a.requests);
  };

  const [todayTools, weekTools] = await Promise.all([byTool(today), byTool(week)]);
  const [{ reserved }] = await db
    .select({ reserved: sql<number>`coalesce(sum(${aiUsageEvents.costMicros}) filter (where ${aiUsageEvents.status} = 'pending'), 0)::bigint` })
    .from(aiUsageEvents)
    .where(gte(aiUsageEvents.createdAt, today));
  const failures = await db
    .select({ at: aiUsageEvents.createdAt, toolId: aiUsageEvents.toolId, status: aiUsageEvents.status, errorCode: aiUsageEvents.errorCode })
    .from(aiUsageEvents)
    .where(sql`${aiUsageEvents.status} in ('provider_error', 'timeout', 'invalid_output') and ${aiUsageEvents.createdAt} >= ${week}`)
    .orderBy(sql`${aiUsageEvents.createdAt} desc`)
    .limit(10);

  const sum = (rows: AiToolStats[], k: keyof Omit<AiToolStats, "toolId" | "name" | "avgLatencyMs">) => rows.reduce((n, r) => n + r[k], 0);
  return {
    config: {
      provider: env.AI_PROVIDER,
      model: env.AI_MODEL ?? null,
      priced: Boolean(priceFor(env)),
      providerReady: provider.ok,
      generationEnabled: env.AI_GENERATION_ENABLED,
      live: generation.ok,
      reason: generation.ok ? null : generation.reason,
      timeoutMs: env.AI_TIMEOUT_MS,
      anonymousEnabled: env.AI_ANONYMOUS_ENABLED,
    },
    budget: { dailyMicros: env.AI_DAILY_BUDGET_MICROS, spentMicros: sum(todayTools, "spendMicros"), reservedMicros: Number(reserved) },
    today: { tools: todayTools, requests: sum(todayTools, "requests"), ok: sum(todayTools, "ok"), failed: sum(todayTools, "failed"), invalid: sum(todayTools, "invalid"), quotaRejected: sum(todayTools, "quotaRejected"), budgetRejected: sum(todayTools, "budgetRejected") },
    week: { tools: weekTools, requests: sum(weekTools, "requests"), ok: sum(weekTools, "ok"), failed: sum(weekTools, "failed"), spendMicros: sum(weekTools, "spendMicros") },
    recentFailures: failures.map((f) => ({ ...f, at: f.at.toISOString(), name: AI_TOOL_BY_ID[f.toolId]?.name ?? f.toolId })),
  };
}

export type AiDiagnostics = Awaited<ReturnType<typeof aiDiagnostics>>;
