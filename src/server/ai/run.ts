import "server-only";
import { createHmac } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { AI_TOOL_BY_ID, type AiAvailability, type AiTool } from "@/lib/ai/registry";
import { hit } from "../auth/rate-limit";
import type { Db } from "../db/client";
import { aiUsageEvents } from "../db/schema";
import { type Env, getEnv } from "../env";
import { AppError, errors } from "../errors";
import { logger } from "../log";
import { CONTENT_STUDIO, GROWTH_INTELLIGENCE, ORDER_SUPPORT, SMART_ASSISTANCE, CAMPAIGN_STUDIO } from "./generators";
import { OutputRuleError } from "./generators/shared";
import { type AiProvider, generationStatus, ProviderError } from "./provider";
import { redact } from "./redact";
import { budgetBlock, loadControls } from "./control/controls";
import { resolveRoute } from "./control/routing";

/**
 * The single execution pipeline every AI tool goes through.
 *
 *   tool exists & implemented → access policy → input validation & size
 *   → redaction → generation enabled → per-call cost ceiling → burst rate
 *   limit → daily quota and platform budget (reserved under a lock) →
 *   provider call(s) with timeout, cancellation and one safe retry →
 *   structured-output validation, tool rules & size → usage accounting
 *   (metadata only).
 *
 * Nothing here can place orders, move money or change accounts: generators
 * only return validated, sanitised data for display.
 */

/** One structured request to the model, validated against `output` before it's returned. */
export interface AskSpec<T> {
  system: string;
  input: string;
  output: z.ZodType<T>;
}
export type Ask = <T>(spec: AskSpec<T>) => Promise<T>;

/** Read-only context for generators that ground answers in Sociotix data (e.g. the public catalog). Never used to write. */
export interface GeneratorContext {
  db: Db;
  /** The configuration this run uses (live facts such as checkout or AI availability). */
  env: Env;
  /** The signed-in customer, set by the server from the session (AI-05 order context). Never taken from input. */
  customerId: string | null;
}

/** What a tool implementation supplies. */
export interface Generator<I = unknown, O = unknown> {
  input: z.ZodType<I>;
  /** The final result shape, checked once more before anything is returned. */
  output: z.ZodType<O>;
  /** Most provider calls this input can make (default 1); each reserves the tool's cost ceiling. */
  calls?(input: I): number;
  /** Single-call tools: fixed instructions plus delimited user content, answered in `output`'s shape. */
  prompt?(input: I): { system: string; input: string };
  /** Multi-step tools (e.g. a 30-day calendar a week at a time) and tools with extra output rules. */
  execute?(input: I, ask: Ask, ctx?: GeneratorContext): Promise<O>;
  /**
   * Read-only checks before anything is reserved (e.g. the order belongs to
   * the customer). Throwing an AppError here refuses the run without using
   * the allowance or budget.
   */
  precheck?(input: I, ctx: GeneratorContext): Promise<void>;
  /** Top-level fields that are schema-validated identifiers (e.g. an order reference) and must not be redacted. */
  identifiers?: string[];
}

/** Implemented generators, by tool id. */
export const GENERATORS: Record<string, Generator> = { ...CONTENT_STUDIO, ...GROWTH_INTELLIGENCE, ...SMART_ASSISTANCE, ...ORDER_SUPPORT, ...CAMPAIGN_STUDIO };

/** customerId comes from the verified session only; usage is keyed by userId. */
export type AiSubject = { kind: "account"; userId: string; customerId?: string | null } | { kind: "anonymous"; ip: string | null };

/** Test-only seam: automated tests inject a mock provider and generator. Routes never pass this. */
export interface RunDeps {
  provider?: AiProvider;
  generator?: Generator;
  env?: Env;
  /** Tests only: the transport used by Control Center routes. */
  fetch?: typeof fetch;
}

export const MAX_OUTPUT_CHARS = 20_000;
export const MAX_RESULT_CHARS = 60_000;
export const BURST_LIMIT = { limit: 5, windowSeconds: 60 };

const startOfUtcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

function subjectHash(subject: AiSubject, env: Env) {
  if (!env.AUTH_SECRET) throw new AppError("SERVICE_UNAVAILABLE", "AI tools aren't available right now.");
  const raw = subject.kind === "account" ? `account:${subject.userId}` : `anonymous:${subject.ip ?? "unknown"}`;
  return createHmac("sha256", Buffer.from(env.AUTH_SECRET, "base64")).update(`ai-usage:${raw}`).digest("hex");
}

/** Redacts every string in the validated input, so no generator can forward personal data. */
function redactDeep<T>(value: T): T {
  if (typeof value === "string") return redact(value).text as T;
  if (Array.isArray(value)) return value.map(redactDeep) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v)])) as T;
  return value;
}

/** The tool's availability right now: "available" only when it's implemented and generation is enabled. */
export function effectiveAvailability(tool: AiTool, deps: RunDeps = {}): AiAvailability {
  if (tool.availability === "unavailable") return "unavailable";
  const implemented = Boolean(deps.generator ?? GENERATORS[tool.id]);
  const ready = deps.provider ? true : generationStatus(deps.env ?? undefined).ok;
  return implemented && ready ? "available" : tool.availability;
}

/**
 * Operator overrides of the registry's daily allowances (AI-05):
 * AI_DAILY_ALLOWANCES="order-explanation=20,support-assistant=15".
 * Signed-in allowance only; unknown tools and malformed entries are ignored.
 */
export function allowanceOverrides(raw: string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of (raw ?? "").split(",")) {
    const m = /^\s*([a-z0-9-]+)\s*=\s*(\d{1,4})\s*$/.exec(part);
    if (m && AI_TOOL_BY_ID[m[1]]) out[m[1]] = Math.min(1_000, Number(m[2]));
  }
  return out;
}

export function allowanceFor(tool: AiTool, subject: AiSubject, env?: Env) {
  if (!tool.free) return 0;
  if (subject.kind !== "account") return tool.free.anonymousPerDay;
  const override = env ? allowanceOverrides(env.AI_DAILY_ALLOWANCES)[tool.id] : undefined;
  return override ?? tool.free.signedInPerDay;
}

/** Counted usage today for a subject and tool. */
export async function usageToday(db: Db, tool: AiTool, subject: AiSubject, env: Env = getEnv()) {
  const hash = subjectHash(subject, env);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiUsageEvents)
    .where(and(eq(aiUsageEvents.subjectHash, hash), eq(aiUsageEvents.toolId, tool.id), inArray(aiUsageEvents.status, ["ok", "pending"]), gte(aiUsageEvents.createdAt, startOfUtcDay())));
  return { used: n, allowance: allowanceFor(tool, subject, env) };
}

/**
 * Read-only: today's usage events for a subject, grouped by tool and status
 * (AI-09 usage dashboard). The same subject hash and UTC day as the quota check.
 */
export async function usageEventsToday(db: Db, subject: AiSubject, env: Env = getEnv()) {
  const hash = subjectHash(subject, env);
  return db
    .select({ toolId: aiUsageEvents.toolId, status: aiUsageEvents.status, n: sql<number>`count(*)::int` })
    .from(aiUsageEvents)
    .where(and(eq(aiUsageEvents.subjectHash, hash), gte(aiUsageEvents.createdAt, startOfUtcDay())))
    .groupBy(aiUsageEvents.toolId, aiUsageEvents.status);
}

export async function runTool(db: Db, toolId: string, rawInput: unknown, subject: AiSubject, options: { signal?: AbortSignal } = {}, deps: RunDeps = {}) {
  const env = deps.env ?? getEnv();
  const tool = AI_TOOL_BY_ID[toolId];
  if (!tool) throw errors.notFound("That AI tool");
  const generator = deps.generator ?? GENERATORS[tool.id];
  if (!generator || tool.availability === "unavailable") throw new AppError("FEATURE_DISABLED", `${tool.name} isn't available yet. ${tool.status}`);

  // Admin AI Control Center: the emergency pause stops every request, whatever its route.
  const controls = await loadControls(db);
  if (controls.emergencyDisabled) throw new AppError("FEATURE_DISABLED", `${tool.name} is paused right now. Please try again later.`, { details: { reason: "AI is paused by an administrator." } });

  // Generation must be switched on before anything else is considered. The env provider is used as before;
  // a Control Center route (active assignment + active verified key) is used only when generation is switched
  // on and no env provider is configured. There is no fallback between routes.
  let status: { ok: true; provider: AiProvider } | { ok: false; reason: string } = deps.provider ? { ok: true as const, provider: deps.provider } : generationStatus(env);
  let routedModel: string | null = deps.provider ? null : (env.AI_MODEL ?? null);
  if (!deps.provider && !status.ok && env.AI_GENERATION_ENABLED && env.AI_PROVIDER === "none") {
    const route = await resolveRoute(db, tool.id, env, controls, { fetch: deps.fetch });
    status = route.ok ? { ok: true, provider: route.provider } : { ok: false, reason: route.reason };
    if (route.ok) routedModel = route.model;
  }
  if (!status.ok) throw new AppError("FEATURE_DISABLED", `${tool.name} isn't available yet. ${tool.status}`, { details: { reason: status.reason } });
  if (status.provider && controls.disabledProviders.includes(status.provider.id)) throw new AppError("FEATURE_DISABLED", `${tool.name} isn't available right now.`, { details: { reason: "The provider is disabled by an administrator." } });

  // Access policy.
  if (subject.kind === "anonymous") {
    if (tool.auth === "account") throw errors.unauthenticated();
    if (!env.AI_ANONYMOUS_ENABLED) throw new AppError("FEATURE_DISABLED", "Sign in to use this tool.");
  }
  const allowance = allowanceFor(tool, subject, env);
  if (allowance <= 0) throw new AppError("FEATURE_DISABLED", "This tool isn't included in free use.");

  // Input: schema, then size, then redaction of every string.
  const parsed = generator.input.parse(rawInput);
  const serialised = JSON.stringify(parsed);
  if (serialised.length > tool.guard.maxInputChars) throw new AppError("VALIDATION_FAILED", `Keep your input under ${tool.guard.maxInputChars.toLocaleString("en-US")} characters.`, { details: { field: "input" } });
  const input = redactDeep(parsed);
  for (const key of generator.identifiers ?? []) if (input && typeof input === "object" && key in input) (input as Record<string, unknown>)[key] = (parsed as Record<string, unknown>)[key];
  const ctx: GeneratorContext = { db, env, customerId: subject.kind === "account" ? (subject.customerId ?? null) : null };
  if (generator.precheck) await generator.precheck(input, ctx);
  const maxCalls = Math.max(1, Math.min(6, generator.calls?.(input) ?? 1));

  // The configured model must fit the tool's per-call cost ceiling (prompt and instructions included).
  const worst = status.provider.worstCaseMicros?.(tool.guard.maxInputChars + (tool.guard.promptChars ?? 4_000), tool.guard.maxOutputTokens);
  if (worst === null || (worst !== undefined && worst > tool.guard.maxCostMicros)) {
    logger().error({ tool: tool.id, worst, ceiling: tool.guard.maxCostMicros }, "ai model exceeds the tool's cost ceiling");
    throw new AppError("FEATURE_DISABLED", "AI generation isn't available right now.", { details: { reason: "The configured model exceeds this tool's cost ceiling." } });
  }

  const hash = subjectHash(subject, env);
  const burst = await hit(db, "ai-burst", hash, BURST_LIMIT);
  if (!burst.ok) throw new AppError("RATE_LIMITED", `You're going a little fast. Try again in ${burst.retryAfter} seconds.`);

  // Quota and budget, decided and reserved atomically per subject.
  const reserve = tool.guard.maxCostMicros * maxCalls;
  if (controls.maxRequestMicros !== null && reserve > controls.maxRequestMicros) throw new AppError("FEATURE_DISABLED", `${tool.name} isn't available right now.`, { details: { reason: "This tool's cost ceiling is above the maximum cost per request." } });
  const reservation = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai:${hash}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ai:budget'))`);
    const since = startOfUtcDay();
    const [{ used }] = await tx
      .select({ used: sql<number>`count(*)::int` })
      .from(aiUsageEvents)
      .where(and(eq(aiUsageEvents.subjectHash, hash), eq(aiUsageEvents.toolId, tool.id), inArray(aiUsageEvents.status, ["ok", "pending"]), gte(aiUsageEvents.createdAt, since)));
    const [{ spent }] = await tx
      .select({ spent: sql<number>`coalesce(sum(${aiUsageEvents.costMicros}), 0)::bigint` })
      .from(aiUsageEvents)
      .where(and(gte(aiUsageEvents.createdAt, since)));
    // Provider and model are recorded on the reservation, so per-provider and per-model limits count in-flight requests.
    const base = { toolId: tool.id, subjectHash: hash, subjectKind: subject.kind, inputChars: serialised.length, completedAt: new Date(), provider: status.provider.id, model: routedModel };
    if (used >= allowance) {
      await tx.insert(aiUsageEvents).values({ ...base, status: "rejected_quota" });
      return { error: new AppError("RATE_LIMITED", `You've used today's ${allowance} free ${allowance === 1 ? "run" : "runs"} of ${tool.name}. It resets at midnight UTC.`) };
    }
    if (Number(spent) + reserve > env.AI_DAILY_BUDGET_MICROS) {
      await tx.insert(aiUsageEvents).values({ ...base, status: "rejected_budget" });
      return { error: new AppError("FEATURE_DISABLED", "AI tools have reached today's limit. Please try again tomorrow.") };
    }
    const blocked = await budgetBlock(tx, controls, { toolId: tool.id, provider: status.provider.id, model: routedModel, reserve, env });
    if (blocked) {
      await tx.insert(aiUsageEvents).values({ ...base, status: "rejected_budget", errorCode: blocked.code });
      return { error: new AppError("FEATURE_DISABLED", `${blocked.reason} Please try again later.`) };
    }
    const [row] = await tx.insert(aiUsageEvents).values({ ...base, status: "pending", costMicros: reserve, completedAt: null }).returning({ id: aiUsageEvents.id });
    return { id: row.id, used: used + 1 };
  });
  if ("error" in reservation) throw reservation.error;

  const started = Date.now();
  const finish = (values: Partial<typeof aiUsageEvents.$inferInsert>) =>
    db.update(aiUsageEvents).set({ ...values, latencyMs: Date.now() - started, completedAt: new Date() }).where(eq(aiUsageEvents.id, reservation.id));

  // Usage across every call this run makes. Unreported cost is charged at the ceiling.
  const totals = { calls: 0, inputTokens: 0, outputTokens: 0, costMicros: 0, outputChars: 0, model: null as string | null, tokensKnown: true };

  const call = async (spec: AskSpec<unknown>) => {
    const timeout = AbortSignal.timeout(env.AI_TIMEOUT_MS);
    const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
    try {
      return await status.provider.generate({ system: spec.system, input: redact(spec.input).text, output: spec.output, maxOutputTokens: tool.guard.maxOutputTokens, signal });
    } catch (e) {
      if (signal.aborted) throw new ProviderError("timeout", "The AI service took too long to respond.");
      throw e instanceof ProviderError ? e : new ProviderError("outage");
    }
  };

  const ask: Ask = async <T,>(spec: AskSpec<T>): Promise<T> => {
    if (totals.calls >= maxCalls) throw new OutputRuleError("generator exceeded its declared calls");
    totals.calls++;
    let result;
    try {
      result = await call(spec as AskSpec<unknown>);
    } catch (e) {
      if (e instanceof ProviderError && e.retryable && !options.signal?.aborted) result = await call(spec as AskSpec<unknown>);
      else throw e;
    }
    totals.model = result.model;
    totals.costMicros += Math.max(0, result.usage.costMicros ?? tool.guard.maxCostMicros);
    if (result.usage.inputTokens === null || result.usage.outputTokens === null) totals.tokensKnown = false;
    totals.inputTokens += result.usage.inputTokens ?? 0;
    totals.outputTokens += result.usage.outputTokens ?? 0;
    totals.outputChars += result.text.length;
    if (result.text.length > MAX_OUTPUT_CHARS) throw new OutputRuleError("output too long");
    try {
      return spec.output.parse(JSON.parse(result.text));
    } catch {
      throw new OutputRuleError("output didn't match the schema");
    }
  };

  const usage = () => ({
    provider: status.provider.id,
    model: totals.model,
    inputTokens: totals.tokensKnown ? totals.inputTokens : null,
    outputTokens: totals.tokensKnown ? totals.outputTokens : null,
    costMicros: totals.costMicros,
    outputChars: totals.outputChars,
  });

  let output: unknown;
  try {
    const raw = generator.execute ? await generator.execute(input, ask, ctx) : await ask({ ...generator.prompt!(input), output: generator.output });
    output = generator.output.parse(raw);
    if (JSON.stringify(output).length > MAX_RESULT_CHARS) throw new OutputRuleError("result too long");
  } catch (e) {
    if (e instanceof ProviderError) {
      // Calls that did complete before the failure were paid for; nothing counts toward the customer's allowance.
      await finish({ ...usage(), status: e.kind === "timeout" ? "timeout" : "provider_error", errorCode: e.kind });
      logger().warn({ tool: tool.id, kind: e.kind }, "ai provider call failed");
      if (e.kind === "rejected") throw new AppError("SERVICE_UNAVAILABLE", "The AI couldn't help with that brief. Try rewording it. Nothing was taken from your free allowance.");
      throw new AppError("SERVICE_UNAVAILABLE", e.kind === "timeout" ? "The AI service took too long. Nothing was taken from your free allowance." : "The AI service isn't responding right now. Nothing was taken from your free allowance.");
    }
    // Invalid or rule-breaking output is never shown. Its cost counts toward the budget, not the allowance.
    await finish({ ...usage(), status: "invalid_output", errorCode: "invalid_output" });
    logger().warn({ tool: tool.id, reason: e instanceof OutputRuleError ? e.message : "unexpected" }, "ai output rejected");
    throw new AppError("SERVICE_UNAVAILABLE", "The AI returned something we couldn't use. Nothing was taken from your free allowance — please try again.");
  }
  if (totals.costMicros > reserve) logger().warn({ tool: tool.id, cost: totals.costMicros, reserve }, "ai run exceeded its reservation");
  await finish({ ...usage(), status: "ok" });
  return { output, usage: { used: reservation.used, allowance } };
}
