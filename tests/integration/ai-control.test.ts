import { and, count, eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { z } from "zod";
import { GET as controlGet } from "@/app/api/admin/ai-control/route";
import { POST as keysPost } from "@/app/api/admin/ai-control/keys/route";
import { POST as keyAction } from "@/app/api/admin/ai-control/keys/[id]/[action]/route";
import { POST as emergencyPost } from "@/app/api/admin/ai-control/controls/route";
import { AI_PROVIDER_BY_ID, AI_PROVIDERS } from "@/lib/ai/provider-catalog";
import { freeKeyTest, makeProvider } from "@/server/ai/control/adapters";
import { activateAssignment, checkDraft, disableAssignment, saveDraft } from "@/server/ai/control/assignments";
import { loadControls, saveControls, setEmergency } from "@/server/ai/control/controls";
import { activateCredential, activeKey, disableCredential, listCredentials, saveCredential, testCredential } from "@/server/ai/control/credentials";
import { listModels, saveModel } from "@/server/ai/control/models";
import { resolveRoute } from "@/server/ai/control/routing";
import { type Generator, runTool } from "@/server/ai/run";
import { markReauthenticated } from "@/server/auth/sessions";
import { createDb, type Db } from "@/server/db/client";
import { aiCredentials, aiToolAssignments, aiUsageEvents, auditLog } from "@/server/db/schema";
import { envSchema, getEnv, resetEnvCache } from "@/server/env";
import { AppError } from "@/server/errors";
import { runMigrations } from "../../scripts/db/migrate";
import { seedReferenceData } from "../../scripts/db/seed";
import { makeCustomer, makeStaff, signInAs } from "./auth-helpers";
import { sqlState } from "./helpers";

vi.mock("next/headers", async () => (await import("./auth-helpers")).jarMock());
vi.mock("next/server", () => ({ connection: async () => {} }));

/*
 * Admin AI Control Center against its own scratch database. Every provider
 * call goes to an in-memory fetch mock; no real key exists and nothing is
 * billed. Generation is switched on only through per-test env overrides.
 */
const scratch = `socivanta_ai_control_test_${Date.now()}`;
let db: Db;
let admin: Client;

beforeAll(async () => {
  admin = new Client({ connectionString: inject("adminUrl") });
  await admin.connect();
  await admin.query(`create database ${scratch}`);
  const u = new URL(inject("adminUrl"));
  u.pathname = `/${scratch}`;
  await runMigrations(u.toString());
  process.env.DATABASE_URL = u.toString();
  resetEnvCache();
  db = createDb(u.toString());
  await seedReferenceData(db);
}, 120_000);
afterAll(async () => {
  await db.$client.end();
  process.env.DATABASE_URL = inject("databaseUrl");
  resetEnvCache();
  await admin.query(`drop database if exists ${scratch} with (force)`);
  await admin.end();
});

const ORIGIN = "http://localhost:3000";
const call = (fn: unknown, init: RequestInit = {}, ctx: unknown = {}) =>
  (fn as (r: Request, c: unknown) => Promise<Response>)(new Request(ORIGIN + "/api/x", { ...init, headers: { "content-type": "application/json", origin: ORIGIN, ...(init.headers ?? {}) } }), ctx);
const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "resolved",
    (e) => (e instanceof AppError ? e.code : e?.name === "ZodError" ? "ZOD" : `other:${String(e)}`),
  );
const FAKE = (n: number) => `sk-test-FAKE-not-real-${String(n).padStart(4, "0")}-abcdefgh`;
const owner = async () => {
  const s = await makeStaff(db, "owner");
  return { ...s, actor: { userId: s.user.id } };
};

/** An in-memory provider: records every request and answers like the real APIs would. */
function mockFetch(handler: (url: string, init: RequestInit) => { status: number; body?: unknown } | "throw") {
  const calls: { url: string; headers: Record<string, string>; body: unknown }[] = [];
  const f = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, headers: (init.headers ?? {}) as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : null });
    const r = handler(url, init);
    if (r === "throw") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { f, calls };
}
const openAiModels = mockFetch(() => ({ status: 200, body: { data: [{ id: "gpt-test-a" }, { id: "gpt-test-b" }, { id: "bad id with spaces" }] } }));

async function verifiedKey(o: Awaited<ReturnType<typeof owner>>, provider = "openai", n = 1) {
  const { id } = await saveCredential(db, o.actor, { providerId: provider, key: FAKE(n) });
  await testCredential(db, o.actor, id, {}, getEnv(), { fetch: openAiModels.f });
  return id;
}

describe("provider catalog", () => {
  it("lists the requested providers with honest adapter states", () => {
    for (const id of ["openai", "anthropic", "gemini", "xai", "deepseek", "mistral", "cohere", "groq", "openrouter", "together", "fireworks", "moonshot", "azure-openai", "bedrock", "vertex", "custom-openai"]) expect(AI_PROVIDER_BY_ID[id]).toBeTruthy();
    expect(AI_PROVIDERS.filter((p) => p.generation === "native").map((p) => p.id)).toEqual(["anthropic", "openai", "gemini"]);
    for (const p of AI_PROVIDERS) {
      if (p.baseUrl) expect(p.baseUrl).toMatch(/^https:\/\//);
      if (p.group === "enterprise") expect(p.generation).toBe("pending");
    }
  });
});

describe("access control", () => {
  it("support can't see it; admins can view and manage but not touch keys; owners need re-auth for keys", async () => {
    const support = await makeStaff(db, "support");
    signInAs("staff", support.token);
    expect((await call(controlGet)).status).toBe(403);
    const adminStaff = await makeStaff(db, "admin");
    signInAs("staff", adminStaff.token);
    const view = await call(controlGet);
    expect(view.status).toBe(200);
    expect(((await view.json()) as { can: { sensitive: boolean } }).can.sensitive).toBe(false);
    expect((await call(keysPost, { method: "POST", body: JSON.stringify({ providerId: "openai", key: FAKE(9) }) })).status).toBe(403);
    // Pausing is a fast safety action for managers; resuming isn't.
    expect((await call(emergencyPost, { method: "POST", body: JSON.stringify({ paused: true }) })).status).toBe(200);
    expect((await call(emergencyPost, { method: "POST", body: JSON.stringify({ paused: false }) })).status).toBe(403);
    const o = await owner();
    signInAs("staff", o.token);
    const r = await call(keysPost, { method: "POST", body: JSON.stringify({ providerId: "openai", key: FAKE(10) }) });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe("REAUTH_REQUIRED");
    await markReauthenticated(db, o.sessionId);
    expect((await call(keysPost, { method: "POST", body: JSON.stringify({ providerId: "openai", key: FAKE(10) }), headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await call(keysPost, { method: "POST", body: JSON.stringify({ providerId: "openai", key: FAKE(10) }) })).status).toBe(201);
    expect((await call(emergencyPost, { method: "POST", body: JSON.stringify({ paused: false }) })).status).toBe(200);
    expect((await loadControls(db)).emergencyDisabled).toBe(false);
    expect((await call(keyAction, { method: "POST", body: "{}" }, { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000", action: "teleport" }) })).status).toBe(404);
    expect((await call(keyAction, { method: "POST", body: JSON.stringify({ confirm: true }) }, { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000", action: "activate" }) })).status).toBe(404);
  });
});

describe("credentials", () => {
  it("are encrypted, write-only, masked and immutable", async () => {
    const o = await owner();
    const { id } = await saveCredential(db, o.actor, { providerId: "anthropic", key: FAKE(1), label: "Primary" });
    const [row] = await db.select().from(aiCredentials).where(eq(aiCredentials.id, id));
    expect(JSON.stringify(row)).not.toContain(FAKE(1));
    expect(row.hint).toBe("sk-…efgh");
    expect(row.status).toBe("saved");
    const listed = JSON.stringify(await listCredentials(db));
    expect(listed).not.toMatch(/sk-test|ciphertext|authTag/);
    signInAs("staff", o.token);
    expect(await (await call(controlGet)).text()).not.toContain("sk-test");
    expect(JSON.stringify(await db.select().from(auditLog))).not.toContain("sk-test");
    expect(await sqlState(db.update(aiCredentials).set({ ciphertext: "x" }).where(eq(aiCredentials.id, id)))).toBe("SV001");
    expect(await sqlState(db.delete(aiCredentials).where(eq(aiCredentials.id, id)))).toBe("SV001");
    expect(await codeOf(saveCredential(db, o.actor, { providerId: "openai", key: "short" }))).toBe("ZOD");
    expect(await codeOf(saveCredential(db, o.actor, { providerId: "custom-openai", key: FAKE(2) }))).toBe("NOT_FOUND");
  });

  it("tests use the documented auth header and classify failures without storing responses", async () => {
    const o = await owner();
    const { id } = await saveCredential(db, o.actor, { providerId: "openai", key: FAKE(3) });
    const r = await testCredential(db, o.actor, id, {}, getEnv(), { fetch: openAiModels.f });
    expect(r).toMatchObject({ code: "ok", billable: false, discovered: 2 });
    const last = openAiModels.calls.at(-1)!;
    expect(last.url).toBe("https://api.openai.com/v1/models");
    expect(last.headers.authorization).toBe(`Bearer ${FAKE(3)}`);
    expect((await db.select().from(aiCredentials).where(eq(aiCredentials.id, id)))[0]).toMatchObject({ status: "verified", lastTestCode: "ok", lastTestBillable: false });
    // Discovered models start unverified, with no assumed capabilities.
    expect((await listModels(db)).find((m) => m.modelId === "gpt-test-a")).toMatchObject({ source: "discovered", status: "unverified", capabilities: {} });

    const gem = mockFetch(() => ({ status: 200, body: { models: [{ name: "models/gem-test", displayName: "Gem", inputTokenLimit: 1000, outputTokenLimit: 500 }] } }));
    const g = await freeKeyTest(AI_PROVIDER_BY_ID.gemini, FAKE(4), { fetch: gem.f });
    expect(g.models).toEqual([{ id: "gem-test", name: "Gem", contextTokens: 1000, maxOutputTokens: 500 }]);
    expect(gem.calls[0].headers["x-goog-api-key"]).toBe(FAKE(4));
    const ant = mockFetch(() => ({ status: 200, body: { data: [] } }));
    await freeKeyTest(AI_PROVIDER_BY_ID.anthropic, FAKE(5), { fetch: ant.f });
    expect(ant.calls[0].headers).toMatchObject({ "x-api-key": FAKE(5), "anthropic-version": "2023-06-01" });

    for (const [status, code] of [[401, "invalid_key"], [403, "permission"], [429, "rate_limited"], [503, "provider_unavailable"]] as const) {
      expect((await freeKeyTest(AI_PROVIDER_BY_ID.openai, FAKE(6), { fetch: mockFetch(() => ({ status })).f })).code).toBe(code);
    }
    expect((await freeKeyTest(AI_PROVIDER_BY_ID.openai, FAKE(6), { fetch: mockFetch(() => "throw").f })).code).toBe("network");
    expect((await freeKeyTest(AI_PROVIDER_BY_ID.fireworks, FAKE(6))).code).toBe("no_free_check");

    const bad = await saveCredential(db, o.actor, { providerId: "openai", key: FAKE(7) });
    const fail = await testCredential(db, o.actor, bad.id, {}, getEnv(), { fetch: mockFetch(() => ({ status: 401 })).f });
    expect(fail.code).toBe("invalid_key");
    expect((await db.select().from(aiCredentials).where(eq(aiCredentials.id, bad.id)))[0].status).toBe("failed");
    expect(await codeOf(activateCredential(db, o.actor, bad.id, { confirm: true }))).toBe("CONFLICT");
  });

  it("a billable test needs explicit confirmation and a model, and is labelled billable", async () => {
    const o = await owner();
    const { id } = await saveCredential(db, o.actor, { providerId: "openai", key: FAKE(8) });
    expect(await codeOf(testCredential(db, o.actor, id, { billable: true }, getEnv(), {}))).toBe("VALIDATION_FAILED");
    const chat = mockFetch(() => ({ status: 200, body: { model: "gpt-test-a", choices: [{ message: { content: "{\"ok\":true}" } }], usage: { prompt_tokens: 9, completion_tokens: 3 } } }));
    const r = await testCredential(db, o.actor, id, { billable: true, modelId: "gpt-test-a" }, getEnv(), { fetch: chat.f });
    expect(r).toMatchObject({ code: "ok", billable: true });
    expect(chat.calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect((chat.calls[0].body as { max_completion_tokens: number }).max_completion_tokens).toBe(16);
    const mistral = await saveCredential(db, o.actor, { providerId: "mistral", key: FAKE(11) });
    expect(await codeOf(testCredential(db, o.actor, mistral.id, { billable: true, modelId: "m" }, getEnv(), {}))).toBe("FEATURE_DISABLED");
  });

  it("rotation is atomic: a failed new key never replaces the working one, and only one key is ever active", async () => {
    const o = await owner();
    const v1 = await verifiedKey(o, "groq", 21);
    await activateCredential(db, o.actor, v1, { confirm: true });
    expect(await codeOf(activateCredential(db, o.actor, v1, {}))).toBe("ZOD"); // explicit confirmation required
    const v2 = (await saveCredential(db, o.actor, { providerId: "groq", key: FAKE(22) })).id;
    await testCredential(db, o.actor, v2, {}, getEnv(), { fetch: mockFetch(() => ({ status: 401 })).f });
    expect(await codeOf(activateCredential(db, o.actor, v2, { confirm: true }))).toBe("CONFLICT");
    expect((await activeKey(db, "groq"))?.key).toBe(FAKE(21));
    const v3 = await verifiedKey(o, "groq", 23);
    const v4 = await verifiedKey(o, "groq", 24);
    await Promise.allSettled([activateCredential(db, o.actor, v3, { confirm: true }), activateCredential(db, o.actor, v4, { confirm: true })]);
    const active = await db.select().from(aiCredentials).where(and(eq(aiCredentials.providerId, "groq"), eq(aiCredentials.status, "active")));
    expect(active).toHaveLength(1);
    expect((await db.select().from(aiCredentials).where(eq(aiCredentials.id, v1)))[0].status).toBe("retired");
    await disableCredential(db, o.actor, active[0].id);
    expect(await activeKey(db, "groq")).toBeNull();
  });
});

describe("models and assignments", () => {
  it("never assumes capabilities; prices need a source", async () => {
    const o = await owner();
    expect(await codeOf(saveModel(db, o.actor, { providerId: "openai", modelId: "has space" }))).toBe("ZOD");
    expect(await codeOf(saveModel(db, o.actor, { providerId: "openai", modelId: "gpt-test-a", status: "available" }))).toBe("CONFLICT");
    expect(await codeOf(saveModel(db, o.actor, { providerId: "openai", modelId: "gpt-test-a", price: { input: 1, output: 2, source: "" } }))).toBe("ZOD");
    const models = await listModels(db);
    expect(models.filter((m) => m.source === "catalog").map((m) => m.modelId).sort()).toEqual(["claude-haiku-5-5", "claude-opus-5-5", "claude-sonnet-5-5"]);
  });

  it("checks compatibility and cost before activation, and activation needs an active key", async () => {
    const o = await owner();
    await saveDraft(db, o.actor, "caption-generator", { providerId: "openai", modelId: "gpt-test-b" });
    let r = await checkDraft(db, o.actor, "caption-generator");
    expect(r.passed).toBe(false);
    expect(r.problems.join(" ")).toMatch(/hasn't been verified[\s\S]*Structured JSON output isn't verified[\s\S]*No sourced price/);
    expect(await codeOf(activateAssignment(db, o.actor, "caption-generator"))).toBe("CONFLICT");
    // Too expensive for the tool's cost ceiling.
    await saveModel(db, o.actor, { providerId: "openai", modelId: "gpt-test-b", status: "available", capabilities: { structured_output: true }, price: { input: 500, output: 900, source: "Test fixture price list" } });
    r = await checkDraft(db, o.actor, "caption-generator");
    expect(r.problems.join(" ")).toMatch(/above this tool/);
    // Output limit too small.
    await saveModel(db, o.actor, { providerId: "openai", modelId: "gpt-test-b", status: "available", capabilities: { structured_output: true }, maxOutputTokens: 100, price: { input: 1, output: 2, source: "Test fixture price list" } });
    expect((await checkDraft(db, o.actor, "caption-generator")).problems.join(" ")).toMatch(/output tokens/);
    await saveModel(db, o.actor, { providerId: "openai", modelId: "gpt-test-b", status: "available", capabilities: { structured_output: true }, price: { input: 1, output: 2, source: "Test fixture price list" } });
    r = await checkDraft(db, o.actor, "caption-generator");
    expect(r.passed).toBe(true);
    expect(await codeOf(activateAssignment(db, o.actor, "caption-generator"))).toBe("CONFLICT"); // no active openai key
    expect(await codeOf(saveDraft(db, o.actor, "workflow-automation", { providerId: "openai", modelId: "gpt-test-b" }))).toBe("NOT_FOUND");
    expect(await sqlState(db.update(aiToolAssignments).set({ status: "active", testPassed: false }).where(eq(aiToolAssignments.toolId, "caption-generator")))).toBe("23514");
  });
});

describe("routing, generation and budgets", () => {
  const generator: Generator<{ topic: string }, { ok: boolean }> = { input: z.object({ topic: z.string().min(3) }).strict(), output: z.object({ ok: z.boolean() }).strict(), prompt: (i) => ({ system: "Answer as JSON.", input: i.topic }) };
  const liveEnv = (over: Record<string, string> = {}) => envSchema.parse({ ...process.env, AI_PROVIDER: "none", AI_GENERATION_ENABLED: "true", AI_DAILY_BUDGET_MICROS: "10000000", AI_TIMEOUT_MS: "2000", ...over });
  const chat = mockFetch(() => ({ status: 200, body: { model: "gpt-test-b", choices: [{ message: { content: "{\"ok\":true}" } }], usage: { prompt_tokens: 20, completion_tokens: 5 } } }));
  let o: Awaited<ReturnType<typeof owner>>;
  let subject: { kind: "account"; userId: string };

  beforeAll(async () => {
    o = await owner();
    const key = await verifiedKey(o, "openai", 31);
    await activateCredential(db, o.actor, key, { confirm: true });
    await saveDraft(db, o.actor, "caption-generator", { providerId: "openai", modelId: "gpt-test-b" });
    await checkDraft(db, o.actor, "caption-generator");
    await activateAssignment(db, o.actor, "caption-generator");
    subject = { kind: "account", userId: (await makeCustomer(db)).user.id };
  });

  it("customer generation stays off while the launch switch is off, even with an active assignment", async () => {
    const before = chat.calls.length;
    expect(await codeOf(runTool(db, "caption-generator", { topic: "autumn menu" }, subject, {}, { generator, fetch: chat.f, env: liveEnv({ AI_GENERATION_ENABLED: "false" }) }))).toBe("FEATURE_DISABLED");
    expect(await codeOf(runTool(db, "caption-generator", { topic: "autumn menu" }, subject, {}, { generator, fetch: chat.f }))).toBe("FEATURE_DISABLED");
    expect(chat.calls.length).toBe(before);
  });

  it("with the switch on, a run uses the active assignment and records provider, model and cost", async () => {
    const r = await runTool(db, "caption-generator", { topic: "autumn menu" }, subject, {}, { generator, fetch: chat.f, env: liveEnv() });
    expect(r.output).toEqual({ ok: true });
    const req = chat.calls.at(-1)!;
    expect(req.headers.authorization).toBe(`Bearer ${FAKE(31)}`);
    expect((req.body as { model: string }).model).toBe("gpt-test-b");
    const [ev] = await db.select().from(aiUsageEvents).where(and(eq(aiUsageEvents.toolId, "caption-generator"), eq(aiUsageEvents.status, "ok")));
    expect(ev).toMatchObject({ provider: "openai", inputTokens: 20, outputTokens: 5, costMicros: 30 });
  });

  it("new requests use the current active key version after a rotation", async () => {
    const v2 = await verifiedKey(o, "openai", 32);
    await activateCredential(db, o.actor, v2, { confirm: true });
    await runTool(db, "caption-generator", { topic: "winter menu" }, subject, {}, { generator, fetch: chat.f, env: liveEnv() });
    expect(chat.calls.at(-1)!.headers.authorization).toBe(`Bearer ${FAKE(32)}`);
    const route = await resolveRoute(db, "caption-generator", liveEnv(), await loadControls(db), { fetch: chat.f });
    expect(route.ok && route.keyVersion).toBeGreaterThan(1);
  });

  it("budgets block before any provider call, with clear reasons", async () => {
    const c = await loadControls(db);
    await saveControls(db, o.actor, { ...c, perTool: { "caption-generator": 1 } }, c.version);
    const before = chat.calls.length;
    const err = await runTool(db, "caption-generator", { topic: "spring menu" }, subject, {}, { generator, fetch: chat.f, env: liveEnv() }).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toMatch(/spending limit for this tool/);
    expect(chat.calls.length).toBe(before);
    const [blocked] = await db.select().from(aiUsageEvents).where(and(eq(aiUsageEvents.status, "rejected_budget"), eq(aiUsageEvents.errorCode, "tool_budget")));
    expect(blocked).toBeTruthy();
    const c2 = await loadControls(db);
    await saveControls(db, o.actor, { ...c2, perTool: {}, maxRequestMicros: 10 }, c2.version);
    expect(await codeOf(runTool(db, "caption-generator", { topic: "spring menu" }, subject, {}, { generator, fetch: chat.f, env: liveEnv() }))).toBe("FEATURE_DISABLED");
    const c3 = await loadControls(db);
    expect(await codeOf(saveControls(db, o.actor, { ...c3, maxRequestMicros: null }, c3.version - 1))).toBe("CONFLICT"); // stale version
    await saveControls(db, o.actor, { ...c3, maxRequestMicros: null, monthlyBudgetMicros: 0 }, c3.version);
    expect((await runTool(db, "caption-generator", { topic: "spring menu" }, subject, {}, { generator, fetch: chat.f, env: liveEnv() }).catch((e) => e)).message).toMatch(/This month/);
    const c4 = await loadControls(db);
    await saveControls(db, o.actor, { ...c4, monthlyBudgetMicros: null }, c4.version);
    expect(chat.calls.length).toBe(before);
  });

  it("disabled providers, disabled keys and the emergency pause fail closed with no fallback", async () => {
    const run = () => codeOf(runTool(db, "caption-generator", { topic: "summer menu" }, subject, {}, { generator, fetch: chat.f, env: liveEnv() }));
    const before = chat.calls.length;
    await setEmergency(db, o.actor, true);
    expect(await run()).toBe("FEATURE_DISABLED");
    // The pause applies to the env route too.
    expect(await codeOf(runTool(db, "caption-generator", { topic: "summer menu" }, subject, {}, { generator, provider: { id: "mock", generate: async () => ({ text: "{\"ok\":true}", model: "m", usage: { inputTokens: 1, outputTokens: 1, costMicros: 1 } }) } }))).toBe("FEATURE_DISABLED");
    await setEmergency(db, o.actor, false);
    const c = await loadControls(db);
    await saveControls(db, o.actor, { ...c, disabledProviders: ["openai"] }, c.version);
    expect(await run()).toBe("FEATURE_DISABLED");
    const c2 = await loadControls(db);
    await saveControls(db, o.actor, { ...c2, disabledProviders: [] }, c2.version);
    const active = (await db.select().from(aiCredentials).where(and(eq(aiCredentials.providerId, "openai"), eq(aiCredentials.status, "active"))))[0];
    await disableCredential(db, o.actor, active.id);
    expect(await run()).toBe("FEATURE_DISABLED");
    await disableAssignment(db, o.actor, "caption-generator");
    expect(await run()).toBe("FEATURE_DISABLED");
    expect(chat.calls.length).toBe(before);
    expect((await db.select({ n: count() }).from(auditLog).where(eq(auditLog.action, "ai_control.emergency_paused")))[0].n).toBeGreaterThan(0);
  });

  it("adapters send each provider's documented request shape", async () => {
    const gem = mockFetch(() => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2, thoughtsTokenCount: 3 } } }));
    const p = makeProvider(AI_PROVIDER_BY_ID.gemini, FAKE(40), "gem-test", { input: 1, output: 2 }, getEnv(), { fetch: gem.f })!;
    const out = await p.generate({ system: "s", input: "i", output: z.object({ ok: z.boolean() }), maxOutputTokens: 50, signal: AbortSignal.timeout(2000) });
    expect(gem.calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gem-test:generateContent");
    expect(out.usage).toEqual({ inputTokens: 7, outputTokens: 5, costMicros: 17 });
    const xai = mockFetch(() => ({ status: 429 }));
    const x = makeProvider(AI_PROVIDER_BY_ID.xai, FAKE(41), "grok-test", null, getEnv(), { fetch: xai.f })!;
    await expect(x.generate({ system: "s", input: "i", output: z.object({ ok: z.boolean() }), maxOutputTokens: 50, signal: AbortSignal.timeout(2000) })).rejects.toMatchObject({ kind: "rate_limited" });
    expect(xai.calls[0].url).toBe("https://api.x.ai/v1/chat/completions");
    expect((xai.calls[0].body as { max_tokens: number }).max_tokens).toBe(50);
    expect(makeProvider(AI_PROVIDER_BY_ID.mistral, FAKE(42), "m", null, getEnv())).toBeNull();
    expect(makeProvider(AI_PROVIDER_BY_ID.bedrock, FAKE(42), "m", null, getEnv())).toBeNull();
  });
});
