import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GET as toolsRoute } from "@/app/api/ai/tools/route";
import { POST as runRoute } from "@/app/api/ai/tools/[id]/run/route";
import { AI_CATEGORIES, AI_TOOLS, AI_TOOL_BY_ID } from "@/lib/ai/registry";
import { type AiProvider, type AiRequest, ProviderError, providerStatus } from "@/server/ai/provider";
import { redact } from "@/server/ai/redact";
import { effectiveAvailability, type Generator, runTool, usageToday } from "@/server/ai/run";
import type { Db } from "@/server/db/client";
import { aiUsageEvents } from "@/server/db/schema";
import { envSchema } from "@/server/env";
import { AppError } from "@/server/errors";
import { bindRequestDb, jar, makeCustomer } from "./auth-helpers";
import { testDb } from "./helpers";

vi.mock("next/headers", async () => (await import("./auth-helpers")).jarMock());
vi.mock("next/server", () => ({ connection: async () => {} }));

let db: Db;
beforeAll(() => {
  bindRequestDb();
  db = testDb();
});
afterAll(() => db.$client.end());

const env = (over: Record<string, string> = {}) => envSchema.parse({ ...process.env, AI_TIMEOUT_MS: "1000", AI_DAILY_BUDGET_MICROS: "10000000", ...over });
const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "resolved",
    (e) => (e instanceof AppError ? e.code : e?.name === "ZodError" ? "ZOD" : `other:${String(e)}`),
  );

/* Test doubles — used only in this file through the explicit RunDeps seam. */
const generator: Generator<{ topic: string }, { captions: string[] }> = {
  input: z.object({ topic: z.string().min(3).max(600) }).strict(),
  output: z.object({ captions: z.array(z.string().min(1)).min(1).max(10) }).strict(),
  prompt: (i) => ({ system: "Write captions as JSON {captions: string[]}.", input: `<topic>${i.topic}</topic>` }),
};
function mockProvider(behaviour: (req: AiRequest, call: number) => Promise<string> | string) {
  let calls = 0;
  const seen: AiRequest[] = [];
  const provider: AiProvider = {
    id: "mock",
    async generate(req) {
      calls++;
      seen.push(req);
      const text = await behaviour(req, calls);
      return { text, model: "mock-1", usage: { inputTokens: 12, outputTokens: 34, costMicros: 1500 } };
    },
  };
  return { provider, seen, calls: () => calls };
}
const ok = () => mockProvider(() => JSON.stringify({ captions: ["Autumn is here ☕"] }));
const account = async () => ({ kind: "account" as const, userId: (await makeCustomer(db)).user.id });

describe("tool registry", () => {
  it("defines every approved tool once, with honest availability", () => {
    expect(AI_TOOLS).toHaveLength(13);
    expect(new Set(AI_TOOLS.map((t) => t.id)).size).toBe(13);
    expect(new Set(AI_TOOLS.map((t) => t.slug)).size).toBe(13);
    for (const t of AI_TOOLS) {
      expect(AI_CATEGORIES.map((c) => c.id)).toContain(t.category);
      expect(t.availability).not.toBe("available");
      expect(effectiveAvailability(t)).not.toBe("available");
      expect(t.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    expect(AI_TOOLS.filter((t) => t.category === "content").map((t) => t.name)).toEqual(["AI Caption Generator", "AI Hashtag & Keyword Finder", "AI Post Ideas Generator", "AI Content Calendar"]);
  });

  it("the public list exposes availability only — never provider details or keys", async () => {
    process.env.AI_API_KEY = "sk-test-SHOULD-NEVER-LEAK-0000000000";
    try {
      const r = await (toolsRoute as unknown as (req: Request) => Promise<Response>)(new Request("http://localhost:3000/api/ai/tools"));
      const text = await r.text();
      expect(r.status).toBe(200);
      expect(text).not.toContain("SHOULD-NEVER-LEAK");
      expect(text).not.toMatch(/"(provider|model|system|prompt)"/);
      expect((JSON.parse(text) as { tools: { availability: string }[] }).tools.every((t) => t.availability !== "available")).toBe(true);
    } finally {
      delete process.env.AI_API_KEY;
    }
  });
});

describe("provider configuration (fail closed)", () => {
  it("is unavailable with no provider, missing credentials, no budget, no built adapter or no known price", () => {
    expect(providerStatus(env())).toMatchObject({ ok: false, reason: expect.stringMatching(/No AI provider/) });
    expect(() => env({ AI_PROVIDER: "anthropic" })).toThrow(/AI_API_KEY/);
    expect(providerStatus(env({ AI_PROVIDER: "anthropic", AI_API_KEY: "test-key-0000000000000000", AI_MODEL: "model-x", AI_DAILY_BUDGET_MICROS: "0" }))).toMatchObject({ ok: false, reason: expect.stringMatching(/budget/) });
    expect(providerStatus(env({ AI_PROVIDER: "openai", AI_API_KEY: "test-key-0000000000000000", AI_MODEL: "model-x" }))).toMatchObject({ ok: false, reason: expect.stringMatching(/isn't built/) });
    expect(providerStatus(env({ AI_PROVIDER: "anthropic", AI_API_KEY: "test-key-0000000000000000", AI_MODEL: "model-x" }))).toMatchObject({ ok: false, reason: expect.stringMatching(/price/) });
  });

  it("with generation switched off (this environment), every tool refuses to run, through the API too", async () => {
    const startedAt = new Date();
    const subject = await account();
    for (const t of AI_TOOLS) expect(await codeOf(runTool(db, t.id, { topic: "hello" }, subject))).toBe("FEATURE_DISABLED");
    expect(await codeOf(runTool(db, "not-a-tool", {}, subject))).toBe("NOT_FOUND");
    jar.clear();
    const call = (origin: string) =>
      (runRoute as unknown as (req: Request, c: unknown) => Promise<Response>)(
        new Request("http://localhost:3000/api/ai/tools/caption-generator/run", { method: "POST", headers: { "content-type": "application/json", origin }, body: '{"topic":"coffee"}' }),
        { params: Promise.resolve({ id: "caption-generator" }) },
      );
    expect((await call("http://localhost:3000")).status).toBe(503);
    expect((await call("https://evil.example")).status).toBe(403);
    // Scoped to this test: other files legitimately record successful runs in the shared test database.
    const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from ai_usage_events where created_at >= ${startedAt} and status in ('ok', 'pending')`)).rows;
    expect(n).toBe(0); // nothing was generated or spent by these refused calls
  });
});

describe("execution pipeline (mock provider, isolated test)", () => {
  const tool = AI_TOOL_BY_ID["content-calendar"]; // 3 free runs per day when signed in

  it("validates, redacts, generates, validates output and records metadata only", async () => {
    const subject = await account();
    const m = ok();
    const secretTopic = "Autumn menu — email me at ada@example.com or call +44 20 7946 0958, card 4111 1111 1111 1111";
    const res = await runTool(db, tool.id, { topic: secretTopic }, subject, {}, { provider: m.provider, generator, env: env() });
    expect(res).toMatchObject({ output: { captions: ["Autumn is here ☕"] }, usage: { used: 1, allowance: 3 } });
    const sent = m.seen[0].input;
    expect(sent).not.toContain("ada@example.com");
    expect(sent).not.toContain("4111");
    expect(sent).not.toContain("7946");
    expect(m.seen[0].maxOutputTokens).toBe(tool.guard.maxOutputTokens);
    const [row] = await db.select().from(aiUsageEvents).where(eq(aiUsageEvents.toolId, tool.id)).orderBy(sql`created_at desc`).limit(1);
    expect(row).toMatchObject({ status: "ok", subjectKind: "account", provider: "mock", model: "mock-1", inputTokens: 12, outputTokens: 34, costMicros: 1500 });
    expect(JSON.stringify(row)).not.toContain("Autumn"); // no prompt or output stored
    expect(row.subjectHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.subjectHash).not.toContain(subject.userId);
  });

  it("rejects bad input, oversized input and anonymous use by policy", async () => {
    const subject = await account();
    const deps = { provider: ok().provider, generator, env: env() };
    expect(await codeOf(runTool(db, tool.id, { topic: "x" }, subject, {}, deps))).toBe("ZOD");
    expect(await codeOf(runTool(db, tool.id, { topic: "ok topic", extra: 1 }, subject, {}, deps))).toBe("ZOD");
    const big: Generator = { ...generator, input: z.object({ topic: z.string() }).strict() } as Generator;
    expect(await codeOf(runTool(db, tool.id, { topic: "a".repeat(5000) }, subject, {}, { ...deps, generator: big }))).toBe("VALIDATION_FAILED");
    expect(await codeOf(runTool(db, tool.id, { topic: "coffee" }, { kind: "anonymous", ip: "203.0.113.9" }, {}, deps))).toBe("UNAUTHENTICATED");
    // AI-04: AI search uses daily runs, so it is account-only (keyword search stays public and needs no AI).
    expect(await codeOf(runTool(db, "service-search", { topic: "coffee" }, { kind: "anonymous", ip: "203.0.113.9" }, {}, deps))).toBe("UNAUTHENTICATED");
  });

  it("enforces the daily quota, even under concurrent requests", async () => {
    const subject = await account();
    const deps = { provider: ok().provider, generator, env: env() };
    const results = await Promise.all(Array.from({ length: 5 }, () => codeOf(runTool(db, tool.id, { topic: "coffee" }, subject, {}, deps))));
    expect(results.filter((r) => r === "resolved")).toHaveLength(3);
    expect(results.filter((r) => r === "RATE_LIMITED")).toHaveLength(2);
    expect(await usageToday(db, tool, subject, env())).toEqual({ used: 3, allowance: 3 });
  });

  it("burst rate limit protects against rapid repeat calls", async () => {
    const subject = await account();
    const deps = { provider: ok().provider, generator, env: env() };
    const results: string[] = [];
    for (let i = 0; i < 7; i++) results.push(await codeOf(runTool(db, "caption-generator", { topic: "coffee" }, subject, {}, deps)));
    expect(results.slice(0, 5).every((r) => r === "resolved")).toBe(true);
    expect(results.slice(5)).toEqual(["RATE_LIMITED", "RATE_LIMITED"]);
  });

  it("timeouts and outages fail safely without using the allowance; transient errors retry once", async () => {
    const subject = await account();
    const slow = mockProvider((req) => new Promise((_, reject) => req.signal.addEventListener("abort", () => reject(new Error("aborted")))));
    expect(await codeOf(runTool(db, tool.id, { topic: "coffee" }, subject, {}, { provider: slow.provider, generator, env: env() }))).toBe("SERVICE_UNAVAILABLE");
    const down = mockProvider(() => {
      throw new ProviderError("outage");
    });
    expect(await codeOf(runTool(db, tool.id, { topic: "coffee" }, subject, {}, { provider: down.provider, generator, env: env() }))).toBe("SERVICE_UNAVAILABLE");
    expect(down.calls()).toBe(2); // one safe retry
    const refused = mockProvider(() => {
      throw new ProviderError("rejected");
    });
    await codeOf(runTool(db, tool.id, { topic: "coffee" }, subject, {}, { provider: refused.provider, generator, env: env() }));
    expect(refused.calls()).toBe(1); // not retried
    const flaky = mockProvider((_req, call) => {
      if (call === 1) throw new ProviderError("outage");
      return JSON.stringify({ captions: ["Second time lucky"] });
    });
    expect((await runTool(db, tool.id, { topic: "coffee" }, subject, {}, { provider: flaky.provider, generator, env: env() })).output).toEqual({ captions: ["Second time lucky"] });
    expect(await usageToday(db, tool, subject, env())).toEqual({ used: 1, allowance: 3 }); // failures didn't count
    const statuses = (await db.execute<{ status: string }>(sql`select status from ai_usage_events where tool_id = ${tool.id} order by created_at desc limit 4`)).rows.map((r) => r.status);
    expect(statuses).toEqual(expect.arrayContaining(["timeout", "provider_error", "ok"]));
  });

  it("cancellation by the caller aborts the provider call", async () => {
    const subject = await account();
    const hang = mockProvider((req) => new Promise((_, reject) => req.signal.addEventListener("abort", () => reject(new Error("aborted")))));
    const controller = new AbortController();
    const p = codeOf(runTool(db, tool.id, { topic: "coffee" }, subject, { signal: controller.signal }, { provider: hang.provider, generator, env: env({ AI_TIMEOUT_MS: "30000" }) }));
    setTimeout(() => controller.abort(), 50);
    expect(await p).toBe("SERVICE_UNAVAILABLE");
    expect(hang.calls()).toBe(1);
  });

  it("invalid or oversized model output is never shown, and its cost still counts toward the budget", async () => {
    const subject = await account();
    for (const text of ["not json", JSON.stringify({ captions: [] }), JSON.stringify({ captions: ["x"], extra: true }), JSON.stringify({ captions: ["y".repeat(30_000)] })]) {
      expect(await codeOf(runTool(db, tool.id, { topic: "coffee" }, subject, {}, { provider: mockProvider(() => text).provider, generator, env: env() }))).toBe("SERVICE_UNAVAILABLE");
    }
    expect((await usageToday(db, tool, subject, env())).used).toBe(0);
  });

  it("the platform-wide daily budget stops spending", async () => {
    const subject = await account();
    expect(await codeOf(runTool(db, tool.id, { topic: "coffee" }, subject, {}, { provider: ok().provider, generator, env: env({ AI_DAILY_BUDGET_MICROS: "1000" }) }))).toBe("FEATURE_DISABLED");
    const [row] = await db.select().from(aiUsageEvents).orderBy(sql`created_at desc`).limit(1);
    expect(row.status).toBe("rejected_budget");
  });

  it("redaction removes personal and secret-looking data", () => {
    const { text, redactions } = redact("mail a@b.co, key sk-live_abcdefghijklmnop, password: hunter2, IBAN GB82WEST12345698765432, +1 (555) 010-2030");
    expect(text).not.toMatch(/a@b\.co|sk-live|hunter2|GB82WEST|555/);
    expect(redactions).toBeGreaterThanOrEqual(4);
  });
});
