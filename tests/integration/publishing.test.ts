import { and, eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { encrypt } from "@/server/auth/crypto";
import { createDb, type Db } from "@/server/db/client";
import { socialConnections, socialEvents, socialPosts, socialPostTargets } from "@/server/db/schema";
import { envSchema, resetEnvCache } from "@/server/env";
import { AppError } from "@/server/errors";
import type { PublishAdapter, PublishInput, PublishOutcome } from "@/server/social/publish-adapters";
import { cancelPost, deletePost, duplicatePost, getPost, listPosts, MAX_ATTEMPTS, runPublishingTick, saveDraft, schedulePost } from "@/server/social/publishing";
import { runMigrations } from "../../scripts/db/migrate";
import { makeCustomer, setRequestHeaders, signInAs } from "./auth-helpers";

vi.mock("next/headers", async () => (await import("./auth-helpers")).jarMock());

/*
 * AI-07 drafts, scheduling and the publishing engine against a UTF-8 scratch
 * database. Platform publishing is a scripted mock adapter — the only test
 * double. No real platform is contacted.
 */
const scratch = `socivanta_publishing_test_${Date.now()}`;
let db: Db;
let admin: Client;

beforeAll(async () => {
  admin = new Client({ connectionString: inject("adminUrl") });
  await admin.connect();
  await admin.query(`create database ${scratch} encoding 'UTF8' template template0`);
  const u = new URL(inject("adminUrl"));
  u.pathname = `/${scratch}`;
  await runMigrations(u.toString());
  process.env.DATABASE_URL = u.toString();
  resetEnvCache();
  db = createDb(u.toString());
}, 120_000);
afterAll(async () => {
  await db.$client.end();
  process.env.DATABASE_URL = inject("databaseUrl");
  resetEnvCache();
  await admin.query(`drop database if exists ${scratch} with (force)`);
  await admin.end();
});

const LIVE = { SOCIAL_PROVIDERS_ENABLED: "x,linkedin,instagram", SOCIAL_X_CLIENT_ID: "x-client-id", SOCIAL_X_CLIENT_SECRET: "x-client-secret", SOCIAL_LINKEDIN_CLIENT_ID: "li-client-id", SOCIAL_LINKEDIN_CLIENT_SECRET: "li-client-secret", SOCIAL_INSTAGRAM_CLIENT_ID: "ig-client-id", SOCIAL_INSTAGRAM_CLIENT_SECRET: "ig-client-secret" };
const env = (publishing = "x,linkedin,instagram") => envSchema.parse({ ...process.env, APP_URL: "https://app.example.com", ...LIVE, SOCIAL_PUBLISHING_ENABLED: publishing });
const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "resolved",
    (e) => (e instanceof AppError ? e.code : `other:${String(e)}`),
  );

/** A scripted adapter recording every call. */
function mockAdapter(provider: "x" | "linkedin" | "instagram", script: (n: number, i: PublishInput) => Promise<PublishOutcome> | PublishOutcome) {
  const calls: PublishInput[] = [];
  const adapter: PublishAdapter = { provider, publish: async (i) => (calls.push(i), script(calls.length, i)) };
  return { adapter, calls };
}

async function connection(customerId: string, provider: "x" | "linkedin" | "instagram", scopes: string[], over: Partial<typeof socialConnections.$inferInsert> = {}) {
  const [c] = await db
    .insert(socialConnections)
    .values({ customerId, provider, externalId: `${provider}-${crypto.randomUUID()}`, displayName: `My ${provider}`, grantedScopes: scopes, accessTokenCiphertext: encrypt("access-RAW"), ...over })
    .returning();
  return c!;
}

const T0 = new Date("2026-11-02T12:00:00.000Z");
const at = (min: number) => new Date(T0.getTime() + min * 60_000);

async function scheduledXPost(opts: { adapters: Record<string, PublishAdapter>; minutes?: number } ) {
  const { customer } = await makeCustomer(db);
  const c = await connection(customer.id, "x", ["users.read", "tweet.read", "tweet.write"]);
  const draft = await saveDraft(db, customer.id, null, { text: "Fresh loaves at 8am 🍞", providers: ["x"], timezone: "UTC" });
  const when = new Date(T0.getTime() + (opts.minutes ?? 30) * 60_000).toISOString().slice(0, 16);
  await schedulePost(db, customer.id, draft.id, { when, timezone: "UTC", connectionIds: [c.id] }, { env: env(), adapters: opts.adapters, now: () => T0 });
  const [target] = await db.select().from(socialPostTargets).where(eq(socialPostTargets.postId, draft.id));
  return { customer, connection: c, post: draft, target: target! };
}

describe("drafts", () => {
  it("store multilingual text and emoji exactly (UTF-8), with planning in the customer's zone", async () => {
    const { customer } = await makeCustomer(db);
    const text = "Pão fresco 🍞 — 新鲜面包 — خبز طازج — हिंदी ✨";
    const d = await saveDraft(db, customer.id, null, { text, title: "Café ☕ launch", providers: ["linkedin", "x"], plannedLocal: "2026-11-01T01:30", timezone: "America/New_York" });
    expect(d).toMatchObject({ text, title: "Café ☕ launch", state: "planned", plannedAt: "2026-11-01T05:30:00.000Z", status: "draft" });
    expect((await getPost(db, customer.id, d.id)).text).toBe(text);
    await expect(saveDraft(db, customer.id, null, { text: "x", plannedLocal: "2026-03-08T02:30", timezone: "America/New_York" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("are private to their owner: no reading, editing, duplicating or deleting someone else's", async () => {
    const owner = await makeCustomer(db);
    const other = await makeCustomer(db);
    const d = await saveDraft(db, owner.customer.id, null, { text: "Owner's post", timezone: "UTC" });
    expect(await codeOf(getPost(db, other.customer.id, d.id))).toBe("NOT_FOUND");
    expect(await codeOf(saveDraft(db, other.customer.id, d.id, { text: "hijack", timezone: "UTC" }))).toBe("NOT_FOUND");
    expect(await codeOf(duplicatePost(db, other.customer.id, d.id))).toBe("NOT_FOUND");
    expect(await codeOf(deletePost(db, other.customer.id, d.id))).toBe("NOT_FOUND");
    expect(await listPosts(db, other.customer.id)).toHaveLength(0);
    expect((await getPost(db, owner.customer.id, d.id)).text).toBe("Owner's post");
  });

  it("duplicate and delete", async () => {
    const { customer } = await makeCustomer(db);
    const d = await saveDraft(db, customer.id, null, { text: "Original", title: "Launch", providers: ["x"], timezone: "UTC" });
    const copy = await duplicatePost(db, customer.id, d.id);
    expect(copy).toMatchObject({ text: "Original", title: "Launch (copy)", status: "draft" });
    await deletePost(db, customer.id, copy.id);
    expect((await listPosts(db, customer.id)).map((p) => p.id)).toEqual([d.id]);
  });

  it("explain clearly when the database can't store a character (non-UTF-8 database)", async () => {
    const name = `${scratch}_w1252`;
    await admin.query(`create database ${name} encoding 'WIN1252' lc_collate 'C' lc_ctype 'C' template template0`);
    const u = new URL(inject("adminUrl"));
    u.pathname = `/${name}`;
    await runMigrations(u.toString());
    const legacy = createDb(u.toString());
    try {
      const { customer } = await makeCustomer(legacy);
      await expect(saveDraft(legacy, customer.id, null, { text: "Plain text works", timezone: "UTC" })).resolves.toMatchObject({ text: "Plain text works" });
      const e = await saveDraft(legacy, customer.id, null, { text: "Emoji 🍞 fails", timezone: "UTC" }).catch((x) => x);
      expect(e).toBeInstanceOf(AppError);
      expect(e.publicMessage).toMatch(/needs a UTF-8 database/);
    } finally {
      await legacy.$client.end();
      await admin.query(`drop database if exists ${name} with (force)`);
    }
  });
});

describe("scheduling", () => {
  it("is refused unless publishing is genuinely available, permitted and valid", async () => {
    const { customer } = await makeCustomer(db);
    const noScope = await connection(customer.id, "x", ["users.read", "tweet.read"]);
    const ok = await connection(customer.id, "x", ["users.read", "tweet.read", "tweet.write"]);
    const ig = await connection(customer.id, "instagram", ["instagram_business_basic", "instagram_business_content_publish"]);
    const d = await saveDraft(db, customer.id, null, { text: "Hello", providers: ["x"], timezone: "UTC" });
    const x = mockAdapter("x", () => ({ kind: "published", externalId: "1", url: null }));
    const igA = mockAdapter("instagram", () => ({ kind: "published", externalId: "1", url: null }));
    const deps = { env: env(), adapters: { x: x.adapter, instagram: igA.adapter }, now: () => T0 };
    const when = at(60).toISOString().slice(0, 16);
    // Real build: nothing is activated.
    expect(await codeOf(schedulePost(db, customer.id, d.id, { when, timezone: "UTC", connectionIds: [ok.id] }, { env: env("") }))).toBe("FEATURE_DISABLED");
    expect(await codeOf(schedulePost(db, customer.id, d.id, { when, timezone: "UTC", connectionIds: [ok.id] }, { env: env() }))).toBe("FEATURE_DISABLED");
    expect(await codeOf(schedulePost(db, customer.id, d.id, { when, timezone: "UTC", connectionIds: [noScope.id] }, deps))).toBe("CONFLICT");
    expect(await codeOf(schedulePost(db, customer.id, d.id, { when: at(2).toISOString().slice(0, 16), timezone: "UTC", connectionIds: [ok.id] }, deps))).toBe("VALIDATION_FAILED");
    expect(await codeOf(schedulePost(db, customer.id, d.id, { when: "2026-03-08T02:30", timezone: "America/New_York", connectionIds: [ok.id] }, deps))).toBe("VALIDATION_FAILED");
    expect(await codeOf(schedulePost(db, customer.id, d.id, { when, timezone: "UTC", connectionIds: [ig.id] }, deps))).toBe("VALIDATION_FAILED"); // Instagram needs media
    const other = await makeCustomer(db);
    expect(await codeOf(schedulePost(db, other.customer.id, d.id, { when, timezone: "UTC", connectionIds: [ok.id] }, deps))).toBe("NOT_FOUND");
    expect(await db.select().from(socialPostTargets).where(eq(socialPostTargets.postId, d.id))).toHaveLength(0);
    expect(x.calls).toHaveLength(0);
  });

  it("creates approved targets with unique idempotency keys; edits are locked; reschedule and cancel are safe", async () => {
    const x = mockAdapter("x", () => ({ kind: "published", externalId: "1", url: null }));
    const { customer, post, target, connection: c } = await scheduledXPost({ adapters: { x: x.adapter } });
    const view = await getPost(db, customer.id, post.id);
    expect(view).toMatchObject({ status: "scheduled", state: "scheduled", scheduledAt: at(30).toISOString() });
    expect(target.idempotencyKey).toMatch(/^svp_[0-9a-f-]{36}$/);
    expect(await codeOf(saveDraft(db, customer.id, post.id, { text: "edit", timezone: "UTC" }))).toBe("CONFLICT");
    expect(await codeOf(deletePost(db, customer.id, post.id))).toBe("CONFLICT");

    await schedulePost(db, customer.id, post.id, { when: at(90).toISOString().slice(0, 16), timezone: "UTC", connectionIds: [c.id] }, { env: env(), adapters: { x: x.adapter }, now: () => T0 });
    const targets = await db.select().from(socialPostTargets).where(eq(socialPostTargets.postId, post.id));
    expect(targets.map((t) => t.status).sort()).toEqual(["cancelled", "scheduled"]);
    expect(new Set(targets.map((t) => t.idempotencyKey)).size).toBe(2);

    expect(await cancelPost(db, customer.id, post.id)).toEqual({ cancelled: 1, inFlight: 0 });
    expect((await getPost(db, customer.id, post.id)).state).toBe("cancelled");
    expect(await runPublishingTick(db, { env: env(), adapters: { x: x.adapter }, now: () => at(200) })).toMatchObject({ claimed: 0 });
    expect(x.calls).toHaveLength(0);
    const types = (await db.select({ t: socialEvents.type }).from(socialEvents).where(eq(socialEvents.customerId, customer.id))).map((r) => r.t);
    expect(types).toEqual(expect.arrayContaining(["post_scheduled", "post_cancelled"]));
  });
});

describe("publishing engine", () => {
  it("publishes once, when due, with the idempotency key — and never again", async () => {
    const x = mockAdapter("x", () => ({ kind: "published", externalId: "1789", url: "https://x.com/i/status/1789" }));
    const { customer, post, target } = await scheduledXPost({ adapters: { x: x.adapter } });
    const deps = (min: number) => ({ env: env(), adapters: { x: x.adapter }, now: () => at(min) });
    expect(await runPublishingTick(db, deps(10))).toMatchObject({ claimed: 0 });
    expect(await runPublishingTick(db, deps(31))).toMatchObject({ claimed: 1, published: 1 });
    expect(x.calls).toHaveLength(1);
    expect(x.calls[0]).toMatchObject({ idempotencyKey: target.idempotencyKey, accessToken: "access-RAW", content: { text: "Fresh loaves at 8am 🍞" } });
    expect(await runPublishingTick(db, deps(40))).toMatchObject({ claimed: 0 });
    expect(x.calls).toHaveLength(1);
    expect((await getPost(db, customer.id, post.id)).state).toBe("published");
    const [t] = await db.select().from(socialPostTargets).where(eq(socialPostTargets.id, target.id));
    expect(t).toMatchObject({ status: "published", externalId: "1789", attempts: 1, leaseUntil: null });
  });

  it("concurrent workers claim a due target only once", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const x = mockAdapter("x", async () => (await gate, { kind: "published", externalId: "2", url: null }));
    await scheduledXPost({ adapters: { x: x.adapter } });
    const deps = { env: env(), adapters: { x: x.adapter }, now: () => at(31) };
    const runs = Promise.all([runPublishingTick(db, deps), runPublishingTick(db, deps), runPublishingTick(db, deps)]);
    await new Promise((r) => setTimeout(r, 300));
    release();
    const results = await runs;
    expect(results.reduce((n, r) => n + r.claimed, 0)).toBe(1);
    expect(x.calls).toHaveLength(1);
  });

  it("a worker that died mid-publish leaves the target for review — never republished", async () => {
    const x = mockAdapter("x", () => ({ kind: "published", externalId: "3", url: null }));
    const { target } = await scheduledXPost({ adapters: { x: x.adapter } });
    await db.update(socialPostTargets).set({ status: "publishing", attempts: 1, leaseUntil: at(32) }).where(eq(socialPostTargets.id, target.id));
    expect(await runPublishingTick(db, { env: env(), adapters: { x: x.adapter }, now: () => at(31) })).toMatchObject({ recovered: 0, claimed: 0 });
    expect(await runPublishingTick(db, { env: env(), adapters: { x: x.adapter }, now: () => at(40) })).toMatchObject({ recovered: 1, claimed: 0 });
    expect(x.calls).toHaveLength(0);
    const [t] = await db.select().from(socialPostTargets).where(eq(socialPostTargets.id, target.id));
    expect(t).toMatchObject({ status: "reconciliation_required", lastErrorCode: "lease_expired" });
    const [e] = await db.select().from(socialEvents).where(and(eq(socialEvents.connectionId, target.connectionId), eq(socialEvents.type, "post_unconfirmed")));
    expect(e!.message).toMatch(/won't retry automatically/);
  });

  it("an unconfirmed outcome is never retried", async () => {
    const x = mockAdapter("x", () => ({ kind: "uncertain", code: "unavailable" }));
    const { customer, post } = await scheduledXPost({ adapters: { x: x.adapter } });
    expect(await runPublishingTick(db, { env: env(), adapters: { x: x.adapter }, now: () => at(31) })).toMatchObject({ unconfirmed: 1 });
    expect(await runPublishingTick(db, { env: env(), adapters: { x: x.adapter }, now: () => at(120) })).toMatchObject({ claimed: 0 });
    expect(x.calls).toHaveLength(1);
    expect((await getPost(db, customer.id, post.id)).state).toBe("needs_review");
    expect(await codeOf(deletePost(db, customer.id, post.id))).toBe("CONFLICT");
  });

  it("retries definite rate limits with backoff, a bounded number of times", async () => {
    const x = mockAdapter("x", () => ({ kind: "rejected", code: "rate_limited", retryable: true, retryAfterSeconds: 30 }));
    const { target } = await scheduledXPost({ adapters: { x: x.adapter } });
    const tick = (min: number) => runPublishingTick(db, { env: env(), adapters: { x: x.adapter }, now: () => at(min) });
    expect(await tick(31)).toMatchObject({ retried: 1 });
    let [t] = await db.select().from(socialPostTargets).where(eq(socialPostTargets.id, target.id));
    expect(t).toMatchObject({ status: "scheduled", attempts: 1 });
    expect(t!.nextAttemptAt!.toISOString()).toBe(new Date(at(31).getTime() + 60_000).toISOString());
    expect(await tick(31.5)).toMatchObject({ claimed: 0 }); // backoff respected
    expect(await tick(33)).toMatchObject({ retried: 1 });
    expect(await tick(40)).toMatchObject({ failed: 1 });
    [t] = await db.select().from(socialPostTargets).where(eq(socialPostTargets.id, target.id));
    expect(t).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
    expect(x.calls).toHaveLength(MAX_ATTEMPTS);
    expect(await tick(120)).toMatchObject({ claimed: 0 });
  });

  it("re-checks eligibility at execution: disconnected accounts and switched-off publishing send nothing", async () => {
    const x = mockAdapter("x", () => ({ kind: "published", externalId: "4", url: null }));
    const a = await scheduledXPost({ adapters: { x: x.adapter } });
    await db.update(socialConnections).set({ status: "disconnected", accessTokenCiphertext: null, refreshTokenCiphertext: null }).where(eq(socialConnections.id, a.connection.id));
    const b = await scheduledXPost({ adapters: { x: x.adapter } });
    expect(await runPublishingTick(db, { env: env("linkedin"), adapters: { x: x.adapter }, now: () => at(31) })).toMatchObject({ failed: 2 });
    expect(x.calls).toHaveLength(0);
    const rows = await db.select().from(socialPostTargets).where(eq(socialPostTargets.id, a.target.id));
    expect(rows[0]!.lastErrorCode).toBe("account_disconnected");
    const [rb] = await db.select().from(socialPostTargets).where(eq(socialPostTargets.id, b.target.id));
    expect(rb!.lastErrorCode).toBe("publishing_not_activated");
    expect((await getPost(db, b.customer.id, b.post.id)).targets[0]!.note).toMatch(/isn't switched on/);
  });

  it("the real build has no activated adapters, so the engine publishes nothing", async () => {
    const x = mockAdapter("x", () => ({ kind: "published", externalId: "5", url: null }));
    const { target } = await scheduledXPost({ adapters: { x: x.adapter } });
    expect(await runPublishingTick(db, { env: env(), now: () => at(31) })).toMatchObject({ failed: 1 });
    const [t] = await db.select().from(socialPostTargets).where(eq(socialPostTargets.id, target.id));
    expect(t!.lastErrorCode).toBe("publishing_not_activated");
    expect(x.calls).toHaveLength(0);
  });
});

describe("routes", () => {
  it("require a same-origin request from the signed-in owner", async () => {
    const owner = await makeCustomer(db);
    const other = await makeCustomer(db);
    const d = await saveDraft(db, owner.customer.id, null, { text: "Route test", timezone: "UTC" });
    const { POST } = await import("@/app/api/social/posts/route");
    const { PATCH } = await import("@/app/api/social/posts/[id]/route");
    const req = (method: string, url: string, body: unknown, origin = "http://localhost:3000") => new Request(url, { method, headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
    setRequestHeaders({});
    signInAs("customer", owner.token);
    expect((await POST(req("POST", "http://localhost:3000/api/social/posts", { text: "Hi", timezone: "UTC" }, "https://evil.example"), {} as never)).status).toBe(403);
    expect((await POST(req("POST", "http://localhost:3000/api/social/posts", { text: "Hi 👋", timezone: "UTC" }), {} as never)).status).toBe(201);
    signInAs("customer", other.token);
    expect((await PATCH(req("PATCH", `http://localhost:3000/api/social/posts/${d.id}`, { text: "hijack", timezone: "UTC" }), { params: Promise.resolve({ id: d.id }) })).status).toBe(404);
    const [row] = await db.select().from(socialPosts).where(eq(socialPosts.id, d.id));
    expect(row!.body).toBe("Route test");
  });
});
