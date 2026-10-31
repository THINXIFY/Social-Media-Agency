import { createHmac, randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { type AiProvider, type AiRequest } from "@/server/ai/provider";
import { runTool } from "@/server/ai/run";
import { createDb, type Db } from "@/server/db/client";
import { aiUsageEvents, platformSettings, serviceEligibility, servicePriceVersions } from "@/server/db/schema";
import { envSchema, resetEnvCache } from "@/server/env";
import { AppError } from "@/server/errors";
import { runMigrations } from "../../scripts/db/migrate";
import { seedReferenceData } from "../../scripts/db/seed";

vi.mock("next/headers", async () => (await import("./auth-helpers")).jarMock());
vi.mock("next/server", () => ({ connection: async () => {} }));

/*
 * Growth Intelligence through the real pipeline with a scripted provider,
 * against a scratch database: services are made purchasable and checkout is
 * switched on ONLY here. The provider is the only test double.
 */
const scratch = `socivanta_ai_growth_test_${Date.now()}`;
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
  // Sentinels that must never reach the model.
  await db.execute(sql`update services set internal_notes = 'SECRET-INTERNAL-NOTE', fulfillment_provider_ref = 'provref-secret' where platform_id = 'instagram'`);
}, 120_000);
afterAll(async () => {
  await db.$client.end();
  process.env.DATABASE_URL = inject("databaseUrl");
  resetEnvCache();
  await admin.query(`drop database if exists ${scratch} with (force)`);
  await admin.end();
});

const env = (over: Record<string, string> = {}) => envSchema.parse({ ...process.env, AI_TIMEOUT_MS: "2000", AI_DAILY_BUDGET_MICROS: "100000000", ...over });
const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "resolved",
    (e) => (e instanceof AppError ? e.code : `other:${String(e)}`),
  );
const account = () => ({ kind: "account" as const, userId: randomUUID() });
const setCheckout = (on: boolean) => db.insert(platformSettings).values({ key: "commerce.checkout_enabled", value: on }).onConflictDoUpdate({ target: platformSettings.key, set: { value: on } });
async function makePurchasable(serviceId: string, priceMicros: number) {
  const now = new Date(Date.now() - 60_000);
  await db.insert(servicePriceVersions).values({ serviceId, pricingModel: "per1000", costMicros: 1, priceMicros, minQty: 100, maxQty: 10_000, effectiveFrom: now });
  const gates = { policyReviewedAt: now, supplierVerifiedAt: now, fulfillmentVerifiedAt: now, paymentAcceptedAt: now, legalReviewedAt: now, technicalReadyAt: now };
  await db.insert(serviceEligibility).values({ serviceId, ...gates }).onConflictDoUpdate({ target: serviceEligibility.serviceId, set: gates });
}
const counts = async () => (await db.execute<{ o: number; e: number; j: number; l: number; a: number }>(sql`select (select count(*) from orders)::int as o, (select count(*) from order_events)::int as e, (select count(*) from journal_entries)::int as j, (select count(*) from journal_lines)::int as l, (select count(*) from ledger_accounts)::int as a`)).rows[0];
const lastRow = async (toolId: string) => (await db.select().from(aiUsageEvents).where(eq(aiUsageEvents.toolId, toolId)).orderBy(desc(aiUsageEvents.createdAt)).limit(1))[0];

function provider(answer: (req: AiRequest, call: number) => unknown) {
  const seen: AiRequest[] = [];
  const p: AiProvider = {
    id: "mock",
    async generate(req) {
      seen.push(req);
      return { text: JSON.stringify(answer(req, seen.length)), model: "mock-model", usage: { inputTokens: 100, outputTokens: 200, costMicros: 1500 } };
    },
  };
  return { provider: p, seen };
}
/** The candidate ids the server actually gave the model. */
const candidatesIn = (req: AiRequest): { id: string; name: string }[] => JSON.parse(req.input.split("<candidates>\n")[1].split("\n</candidates>")[0]);

const pick = (serviceId: string, fit = "Strong") => ({ serviceId, fit, reason: "It supports the stated goal on this platform.", limitations: "It supports a content strategy; it doesn't replace one." });
const guidance = ["Post a short tutorial clip each week", "Ask viewers which topic to cover next"];
const REC = { goal: "More people watching our new tutorials and a few more followers.", platform: "instagram" };

describe("Service Recommender (catalog-grounded)", () => {
  const SVC = "instagram-followers";
  let before: Awaited<ReturnType<typeof counts>>;
  beforeAll(async () => {
    before = await counts();
    await makePurchasable(SVC, 2_500_000);
    await setCheckout(false);
  });

  it("shows only real catalog services, with prices and status from the database", async () => {
    const m = provider((req) => {
      const c = candidatesIn(req);
      const other = c.find((x) => x.id !== SVC)!.id;
      return { picks: [pick(SVC), pick("instagram-invented-premium-growth"), pick(other, "Good"), pick(SVC)], guidance };
    });
    const res = (await runTool(db, "service-recommender", REC, account(), {}, { provider: m.provider, env: env() })).output as {
      checkoutOpen: boolean;
      candidatesConsidered: number;
      recommendations: { id: string; status: string; price: { amount: number; unit: string } | null; orderable: boolean; name: string }[];
    };
    const ids = res.recommendations.map((r) => r.id);
    expect(ids).not.toContain("instagram-invented-premium-growth"); // hallucination dropped
    expect(new Set(ids).size).toBe(ids.length); // duplicate dropped
    expect(res.candidatesConsidered).toBe(candidatesIn(m.seen[0]).length);
    const svc = res.recommendations.find((r) => r.id === SVC)!;
    expect(svc).toMatchObject({ status: "available", price: { amount: 2.5, unit: "per 1,000" }, orderable: false }); // checkout is off
    const other = res.recommendations.find((r) => r.id !== SVC)!;
    expect(other).toMatchObject({ status: "preview", price: null, orderable: false });
    const [{ name }] = (await db.execute<{ name: string }>(sql`select name from services where id = ${SVC}`)).rows;
    expect(svc.name).toBe(name); // the name is the catalog's, not the model's
    expect(res.checkoutOpen).toBe(false);
  });

  it("offers ordering only for a purchasable service while checkout is open", async () => {
    await setCheckout(true);
    try {
      const m = provider((req) => ({ picks: candidatesIn(req).slice(0, 3).map((c) => pick(c.id)), guidance }));
      const res = (await runTool(db, "service-recommender", REC, account(), {}, { provider: m.provider, env: env() })).output as { recommendations: { id: string; orderable: boolean }[] };
      const picked = candidatesIn(m.seen[0]).slice(0, 3).map((c) => c.id);
      if (!picked.includes(SVC)) {
        // Make sure the purchasable service is among those picked for this assertion.
        const m2 = provider(() => ({ picks: [pick(SVC)], guidance }));
        const r2 = (await runTool(db, "service-recommender", REC, account(), {}, { provider: m2.provider, env: env() })).output as { recommendations: { id: string; orderable: boolean }[] };
        expect(r2.recommendations).toEqual([expect.objectContaining({ id: SVC, orderable: true })]);
      }
      for (const r of res.recommendations) expect(r.orderable).toBe(r.id === SVC);
    } finally {
      await setCheckout(false);
    }
  });

  it("never gives the model prices, costs, notes, provider references or eligibility data", async () => {
    const m = provider(() => ({ picks: [], guidance }));
    await runTool(db, "service-recommender", REC, account(), {}, { provider: m.provider, env: env() });
    const { input, system } = m.seen[0];
    // No secrets anywhere; the data part carries no price, cost or eligibility values (the instructions may say "don't mention prices").
    for (const secret of ["SECRET-INTERNAL-NOTE", "provref-secret"]) expect(input + system, secret).not.toContain(secret);
    for (const value of ["2.5", "2500000", "costMicros", "priceMicros", "price", "eligib", "verified_at", "reviewed_at"]) expect(input, value).not.toContain(value);
    expect(candidatesIn(m.seen[0]).every((c) => Object.keys(c).sort().join() === "category,description,id,name")).toBe(true);
  });

  it("with no candidates: no recommendations, honest output, guidance still given", async () => {
    await db.execute(sql`update services set visible = false where platform_id = 'discord'`);
    const m = provider(() => ({ picks: [pick("discord-members")], guidance }));
    const res = (await runTool(db, "service-recommender", { ...REC, platform: "discord" }, account(), {}, { provider: m.provider, env: env() })).output as { recommendations: unknown[]; candidatesConsidered: number; guidance: string[] };
    expect(candidatesIn(m.seen[0])).toEqual([]);
    expect(m.seen[0].input).toContain("There are no candidates");
    expect(res).toMatchObject({ recommendations: [], candidatesConsidered: 0 });
    expect(res.guidance).toHaveLength(2);
  });

  it("has no ordering, wallet or ledger side effects, and leaves checkout as it was", async () => {
    expect(await counts()).toEqual(before);
    const [{ value }] = await db.select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.key, "commerce.checkout_enabled"));
    expect(value).toBe(false);
  });
});

const ADVISOR = { challenge: "Our posts get likes but nobody books a table — email me at chef@example.com.", businessType: "Small business", niche: "Family Italian restaurant", platform: "Instagram", goal: "Get more leads" };
const rec = (title: string, priority: string) => ({ priority, title, why: "It addresses the main challenge for this restaurant.", steps: ["Choose a weekly special", "Post it every Thursday"], activities: ["A Thursday specials reel"] });
const advice = (quickWins = ["Pin a post with booking info", "Reply to every comment"]) => ({
  assessment: { goal: "Turn Instagram attention into bookings.", challenges: ["No reason to book this week"], opportunities: ["Regulars tag the restaurant"], assumptions: ["No paid ads today"], missingInfo: [] },
  recommendations: [rec("Weekly specials series", "High"), rec("Regulars' stories", "Medium"), rec("Local partnerships", "Low")],
  quickWins,
  nextSteps: { thisWeek: ["Plan the first special", "Ask a regular for a photo"], measure: ["Booking link taps", "Profile visits"], adjust: ["Drop the weakest format after three weeks"] },
});

describe("Growth Advisor and Roadmap through the pipeline", () => {
  it("advisor: redacted brief in, structured strategy out, metadata only recorded", async () => {
    const m = provider(() => advice());
    const res = await runTool(db, "growth-advisor", ADVISOR, account(), {}, { provider: m.provider, env: env() });
    expect(res.usage.allowance).toBe(5);
    expect(m.seen[0].input).not.toContain("chef@example.com");
    expect((res.output as { recommendations: { priority: string }[] }).recommendations[0].priority).toBe("High");
    const row = await lastRow("growth-advisor");
    expect(row).toMatchObject({ status: "ok", costMicros: 1500 });
    expect(JSON.stringify(row)).not.toMatch(/Italian|chef/);
  });

  it("advisor: a fabricated statistic is rejected and doesn't use the allowance", async () => {
    const subject = account();
    expect(await codeOf(runTool(db, "growth-advisor", ADVISOR, subject, {}, { provider: provider(() => advice(["Reels get 40% more reach", "Reply to comments"])).provider, env: env() }))).toBe("SERVICE_UNAVAILABLE");
    expect(await lastRow("growth-advisor")).toMatchObject({ status: "invalid_output" });
    const hash = createHmac("sha256", Buffer.from(env().AUTH_SECRET!, "base64")).update(`ai-usage:account:${subject.userId}`).digest("hex");
    const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from ai_usage_events where subject_hash = ${hash} and status in ('ok', 'pending')`)).rows;
    expect(n).toBe(0);
  });

  it("advisor: the daily allowance (5) is enforced", async () => {
    const subject = account();
    const hash = createHmac("sha256", Buffer.from(env().AUTH_SECRET!, "base64")).update(`ai-usage:account:${subject.userId}`).digest("hex");
    await db.insert(aiUsageEvents).values(Array.from({ length: 5 }, () => ({ toolId: "growth-advisor", subjectHash: hash, subjectKind: "account", status: "ok" })));
    const err = await runTool(db, "growth-advisor", ADVISOR, subject, {}, { provider: provider(() => advice()).provider, env: env() }).catch((e) => e);
    expect(err).toMatchObject({ code: "RATE_LIMITED", message: expect.stringMatching(/5 free runs/) });
  });

  const month = (n: number) => ({ title: `Month ${n} focus`, focus: "Build the foundation.", milestone: "The month's work is live.", tasks: [{ task: `Month ${n} task A`, priority: "High", detail: "" }, { task: `Month ${n} task B`, priority: "Medium", detail: "" }], activities: ["A weekly video"], dependsOn: "", checkpoint: "Review what drove shop visits.", weeks: ["Week one milestone", "Week two milestone", "Week three milestone", "Week four milestone"] });
  const head = { objective: "Sell more candles through Instagram.", successIndicators: ["Shop link taps", "Saves"], nextSteps: ["Update the bio link", "Draft the first post"] };
  const ROADMAP = { niche: "A handmade candle brand selling online to repeat customers.", platform: "Instagram", objective: "Sell more products", time: "3–5 hours a week" };

  it("roadmap: 90 days reserves and runs three calls; the budget accounts for all of them", async () => {
    const m = provider((_r, call) => (call === 1 ? { ...head, month: month(1) } : { month: month(call) }));
    const res = await runTool(db, "growth-roadmap", { ...ROADMAP, duration: "90" }, account(), {}, { provider: m.provider, env: env() });
    expect(m.seen).toHaveLength(3);
    expect((res.output as { stages: { period: string }[] }).stages.map((s) => s.period)).toEqual(["Month 1", "Month 2", "Month 3"]);
    expect(await lastRow("growth-roadmap")).toMatchObject({ status: "ok", costMicros: 4500 });
    // Enough budget for one call but not three: the 90-day plan is refused before any call; 7 days still runs.
    const spent = Number((await db.execute<{ s: string }>(sql`select coalesce(sum(cost_micros), 0) as s from ai_usage_events where created_at >= date_trunc('day', now() at time zone 'utc')`)).rows[0].s);
    const tight = env({ AI_DAILY_BUDGET_MICROS: String(spent + 200_000) });
    const none = provider(() => ({}));
    expect(await codeOf(runTool(db, "growth-roadmap", { ...ROADMAP, duration: "90" }, account(), {}, { provider: none.provider, env: tight }))).toBe("FEATURE_DISABLED");
    expect(none.seen).toHaveLength(0);
    const day = (k: number) => ({ title: `Day ${k} focus`, focus: "Do one thing well.", milestone: "Done and published.", tasks: [{ task: `Day ${k} task A`, priority: "High", detail: "" }, { task: `Day ${k} task B`, priority: "Low", detail: "" }], activities: ["One story"], dependsOn: "", checkpoint: "Note what got replies." });
    const seven = provider(() => ({ ...head, stages: Array.from({ length: 7 }, (_, k) => day(k + 1)) }));
    expect(await codeOf(runTool(db, "growth-roadmap", { ...ROADMAP, duration: "7" }, account(), {}, { provider: seven.provider, env: tight }))).toBe("resolved");
  });

  it("roadmap: concurrent requests can't exceed the daily allowance (3)", async () => {
    const subject = account();
    const day = (k: number) => ({ title: `Day ${k} focus`, focus: "Do one thing well.", milestone: "Done and published.", tasks: [{ task: `Day ${k} task A`, priority: "High", detail: "" }, { task: `Day ${k} task B`, priority: "Low", detail: "" }], activities: ["One story"], dependsOn: "", checkpoint: "Note what got replies." });
    const p = provider(() => ({ ...head, stages: Array.from({ length: 7 }, (_, k) => day(k + 1)) }));
    const results = await Promise.all(Array.from({ length: 4 }, () => codeOf(runTool(db, "growth-roadmap", { ...ROADMAP, duration: "7" }, subject, {}, { provider: p.provider, env: env() }))));
    expect(results.filter((r) => r === "resolved")).toHaveLength(3);
    expect(results.filter((r) => r === "RATE_LIMITED")).toHaveLength(1);
  });
});

describe("access and availability", () => {
  it("no provider configured: every growth tool refuses before doing anything", async () => {
    for (const id of ["growth-advisor", "growth-roadmap", "service-recommender"]) expect(await codeOf(runTool(db, id, {}, account(), {}, { env: env() }))).toBe("FEATURE_DISABLED");
  });

  it("anonymous visitors must sign in", async () => {
    expect(await codeOf(runTool(db, "growth-advisor", ADVISOR, { kind: "anonymous", ip: "203.0.113.7" }, {}, { provider: provider(() => advice()).provider, env: env() }))).toBe("UNAUTHENTICATED");
  });
});
