import { randomUUID } from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { GET as fulfillmentGet } from "@/app/api/admin/fulfillment/[ref]/route";
import { POST as fulfillmentAction } from "@/app/api/admin/fulfillment/[ref]/[action]/route";
import { GET as providersGet, POST as providersPost } from "@/app/api/admin/providers/route";
import { GET as providerGet } from "@/app/api/admin/providers/[id]/route";
import { PUT as credentialPut } from "@/app/api/admin/providers/[id]/credential/route";
import { PATCH as mappingPatch } from "@/app/api/admin/providers/[id]/mappings/[serviceId]/route";
import { markReauthenticated } from "@/server/auth/sessions";
import { createDb, type Db } from "@/server/db/client";
import { accountBalances, auditLog, fulfillmentAttempts, journalEntries, orderEvents, orders, platformSettings, providerCredentials, providerEvents, providers, providerServiceMappings, serviceEligibility, servicePriceVersions, services } from "@/server/db/schema";
import { resetEnvCache } from "@/server/env";
import { AppError } from "@/server/errors";
import { approveOrder, createOrder, getOwnOrder } from "@/server/orders/orders";
import { callProvider, healthSchema, ProviderCallError, RATE_LIMIT } from "@/server/providers/adapter";
import { cancelAttempt, fulfillmentDetail, prepareAttempt, reconcileAttempt, reconcileDue, resolveUnknown, submitAttempt } from "@/server/providers/fulfillment";
import { createMockAdapter } from "@/server/providers/mock";
import { archiveProvider, createProvider, getProvider, listProviders, loadCredential, removeCredential, runHealthCheck, saveMapping, setCredential, setMappingActive } from "@/server/providers/providers";
import { ADAPTERS, SUBMISSIONS_ENABLED } from "@/server/providers/registry";
import { runMigrations } from "../../scripts/db/migrate";
import { seedReferenceData } from "../../scripts/db/seed";
import { makeCustomer, makeStaff, signInAs } from "./auth-helpers";
import { fundWallet, sqlState } from "./helpers";

vi.mock("next/headers", async () => (await import("./auth-helpers")).jarMock());
vi.mock("next/server", () => ({ connection: async () => {} }));

/*
 * Phase 5F against its own scratch database. Checkout, eligibility gates and an
 * enabled provider exist ONLY here, with an in-memory mock adapter; nothing is
 * contacted and no real credential is used.
 */
const scratch = `socivanta_providers_test_${Date.now()}`;
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
const call = (fn: unknown, url = "/api/x", init: RequestInit = {}, ctx: unknown = {}) =>
  (fn as (r: Request, c: unknown) => Promise<Response>)(new Request(ORIGIN + url, { ...init, headers: { "content-type": "application/json", origin: ORIGIN, ...(init.headers ?? {}) } }), ctx);
const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "resolved",
    (e) => (e instanceof AppError ? e.code : e?.name === "ZodError" ? "ZOD" : `other:${String(e)}`),
  );
const SECRET = "sk_test_FAKE_not_a_real_key_9f3a";
const fast = { timeoutMs: 200, backoffMs: 0 };

async function staff(role = "orders") {
  const s = await makeStaff(db, role);
  return { ...s, actor: { userId: s.user.id } };
}

/** Records all six gates and a price for one service (scratch database only). */
async function eligible(serviceId: string) {
  const now = new Date(Date.now() - 60_000);
  await db.insert(servicePriceVersions).values({ serviceId, pricingModel: "per1000", costMicros: 1, priceMicros: 2_000_000, minQty: 100, maxQty: 100_000, effectiveFrom: now }).onConflictDoNothing();
  const gates = { policyReviewedAt: now, supplierVerifiedAt: now, fulfillmentVerifiedAt: now, paymentAcceptedAt: now, legalReviewedAt: now, technicalReadyAt: now };
  await db.insert(serviceEligibility).values({ serviceId, ...gates }).onConflictDoUpdate({ target: serviceEligibility.serviceId, set: gates });
}

/** A provider switched on with the mock integration (only possible directly in this scratch database). */
async function enabledProvider(name: string) {
  const s = await staff();
  const id = await createProvider(db, s.actor, { name, type: "api", authMethod: "api_key" });
  await db.update(providers).set({ adapter: "mock", supplierReviewedAt: new Date(), enabled: true }).where(eq(providers.id, id));
  await setCredential(db, s.actor, id, { secret: SECRET });
  return { id, s };
}

async function approvedOrder(serviceId: string) {
  await db.insert(platformSettings).values({ key: "commerce.checkout_enabled", value: true }).onConflictDoUpdate({ target: platformSettings.key, set: { value: true } });
  const c = await makeCustomer(db);
  await fundWallet(db, c.customer.id, 10_000);
  const { order } = await createOrder(db, { userId: c.user.id, customerId: c.customer.id }, { serviceId, quantity: 1000, link: "https://instagram.com/example", details: {} }, `o_${randomUUID().replace(/-/g, "")}`);
  const s = await staff();
  await approveOrder(db, s.actor, order.reference);
  return { ref: order.reference, customer: c, s };
}

/** Provider + active mapping + approved order, ready to prepare. */
async function ready(serviceId: string) {
  await eligible(serviceId);
  const mock = createMockAdapter();
  const p = await enabledProvider(`Mock ${serviceId} ${randomUUID().slice(0, 4)}`);
  await saveMapping(db, p.s.actor, p.id, { serviceId, providerRef: "svc-101" });
  await setMappingActive(db, p.s.actor, p.id, serviceId, true);
  const o = await approvedOrder(serviceId);
  const attemptId = await prepareAttempt(db, o.s.actor, o.ref, { providerId: p.id });
  const deps = { adapters: { mock: mock.adapter }, submissionsEnabled: true, ...fast };
  return { mock, p, o, attemptId, deps };
}

const ledgerCounts = async () => (await Promise.all([db.select({ n: count() }).from(journalEntries), db.select({ n: count() }).from(accountBalances)])).map((r) => r[0].n);

describe("phase posture", () => {
  it("ships with no integrations and submission switched off", () => {
    expect(ADAPTERS).toEqual({});
    expect(SUBMISSIONS_ENABLED).toBe(false);
  });

  it("a provider can't be enabled without a supplier review and an installed integration", async () => {
    const s = await staff();
    const id = await createProvider(db, s.actor, { name: "Unreviewed supplier", type: "api" });
    expect(await sqlState(db.update(providers).set({ enabled: true }).where(eq(providers.id, id)))).toBe("23514");
    expect(await sqlState(db.update(providers).set({ enabled: true, adapter: "mock" }).where(eq(providers.id, id)))).toBe("23514");
    const p = await getProvider(db, id);
    expect(p).toMatchObject({ enabled: false, state: "not_connected", integration: null });
    expect(p!.enableBlockers.join(" ")).toMatch(/No approved integration[\s\S]*supplier review[\s\S]*switched off/);
  });
});

describe("provider records and authorization", () => {
  it("only staff with Configure providers can add one; support can't even view", async () => {
    const support = await staff("support");
    signInAs("staff", support.token);
    expect((await call(providersGet)).status).toBe(403);
    expect((await call(providersPost, "/x", { method: "POST", body: JSON.stringify({ name: "Nope", type: "api" }) })).status).toBe(403);
    const finance = await staff("finance");
    signInAs("staff", finance.token);
    expect((await call(providersGet)).status).toBe(403);
    const ops = await staff("orders");
    signInAs("staff", ops.token);
    expect((await call(providersPost, "/x", { method: "POST", body: JSON.stringify({ name: "Acme Supply", type: "api" }), headers: { origin: "https://evil.example" } })).status).toBe(403);
    const created = await call(providersPost, "/x", { method: "POST", body: JSON.stringify({ name: "Acme Supply", type: "api", endpoint: "https://api.acme.example", enabled: true }) });
    expect(created.status).toBe(400); // unknown fields such as "enabled" are refused
    const ok = await call(providersPost, "/x", { method: "POST", body: JSON.stringify({ name: "Acme Supply", type: "api", endpoint: "https://api.acme.example" }) });
    expect(ok.status).toBe(201);
    const { id } = (await ok.json()) as { id: string };
    expect(id).toBe("acme-supply");
    const list = (await (await call(providersGet)).json()) as { providers: { id: string; enabled: boolean; state: string }[]; can: { configure: boolean } };
    expect(list.providers.find((p) => p.id === id)).toMatchObject({ enabled: false, state: "not_connected" });
    expect(list.can.configure).toBe(true);
  });

  it("validates input: https endpoints only, name length", async () => {
    const s = await staff();
    expect(await codeOf(createProvider(db, s.actor, { name: "Plain", type: "api", endpoint: "http://insecure.example" }))).toBe("ZOD");
    expect(await codeOf(createProvider(db, s.actor, { name: "X", type: "api" }))).toBe("ZOD");
  });
});

describe("credentials", () => {
  it("are encrypted at rest, write-only, rotated, and need a fresh re-authentication through the API", async () => {
    const ops = await staff();
    const id = await createProvider(db, ops.actor, { name: "Credential Test", type: "api" });
    signInAs("staff", ops.token);
    const put = (secret: string) => call(credentialPut, "/x", { method: "PUT", body: JSON.stringify({ secret }) }, { params: Promise.resolve({ id }) });
    const denied = await put(SECRET);
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { error: { code: string } }).error.code).toBe("REAUTH_REQUIRED");
    await markReauthenticated(db, ops.sessionId);
    const res = await put(SECRET);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(SECRET);
    expect(JSON.parse(text).provider.credential).toMatchObject({ configured: true, last4: "9f3a" });

    const [row] = await db.select().from(providerCredentials).where(eq(providerCredentials.providerId, id));
    expect(JSON.stringify(row)).not.toContain(SECRET);
    expect(row.ciphertext).not.toContain("sk_test");
    expect(await loadCredential(db, id)).toBe(SECRET);

    await setCredential(db, ops.actor, id, { secret: "sk_test_SECOND_fake_value_0000" });
    const all = await db.select().from(providerCredentials).where(eq(providerCredentials.providerId, id));
    expect(all.filter((c) => c.rotatedAt === null)).toHaveLength(1);
    expect(await loadCredential(db, id)).toBe("sk_test_SECOND_fake_value_0000");

    const detail = await (await call(providerGet, "/x", {}, { params: Promise.resolve({ id }) })).text();
    expect(detail).not.toMatch(/sk_test|ciphertext|authTag/);
    const audits = await db.select().from(auditLog).where(eq(auditLog.targetId, id));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["provider.created", "provider.credential_set", "provider.credential_rotated"]));
    expect(JSON.stringify(audits)).not.toContain("sk_test");
    expect(JSON.stringify(await db.select().from(providerEvents).where(eq(providerEvents.providerId, id)))).not.toContain("sk_test");

    await removeCredential(db, ops.actor, id);
    expect(await loadCredential(db, id)).toBeNull();
  });
});

describe("service mappings and eligibility", () => {
  it("validates services and references, saves inactive, and never makes a service purchasable", async () => {
    const s = await staff();
    const id = await createProvider(db, s.actor, { name: "Mapping Test", type: "api" });
    const [{ n: purchasableBefore }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from purchasable_services`).then((r) => r.rows);
    expect(await codeOf(saveMapping(db, s.actor, id, { serviceId: "no-such-service", providerRef: "1" }))).toBe("VALIDATION_FAILED");
    expect(await codeOf(saveMapping(db, s.actor, id, { serviceId: "tiktok-followers", providerRef: "bad ref with spaces" }))).toBe("ZOD");
    await saveMapping(db, s.actor, id, { serviceId: "tiktok-followers", providerRef: "tt-200", note: "Supplier code from their price list" });
    const [m] = (await getProvider(db, id))!.mappings;
    expect(m).toMatchObject({ serviceId: "tiktok-followers", providerRef: "tt-200", active: false });
    expect(m.blockers.length).toBeGreaterThanOrEqual(6);
    expect(await codeOf(setMappingActive(db, s.actor, id, "tiktok-followers", true))).toBe("CONFLICT");
    // The database refuses it as well (SV012).
    expect(await sqlState(db.update(providerServiceMappings).set({ active: true }).where(eq(providerServiceMappings.providerId, id)))).toBe("SV012");
    expect(await sqlState(db.insert(providerServiceMappings).values({ providerId: id, serviceId: "youtube-video-views", providerRef: "x", active: true }))).toBe("SV012");
    const [{ n: purchasableAfter }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from purchasable_services`).then((r) => r.rows);
    expect(purchasableAfter).toBe(purchasableBefore);
  });

  it("refuses budget-based services; the catalog keeps all 118 services and their prices", async () => {
    const s = await staff();
    const id = await createProvider(db, s.actor, { name: "Fee Test", type: "api" });
    await db.insert(servicePriceVersions).values({ serviceId: "website-traffic-campaigns", pricingModel: "fee", costMicros: 1, priceMicros: 100_000, effectiveFrom: new Date(Date.now() - 1000) });
    const before = await db.select({ id: servicePriceVersions.id, price: servicePriceVersions.priceMicros }).from(servicePriceVersions);
    expect(await codeOf(saveMapping(db, s.actor, id, { serviceId: "website-traffic-campaigns", providerRef: "w-1" }))).toBe("VALIDATION_FAILED");
    await saveMapping(db, s.actor, id, { serviceId: "youtube-video-views", providerRef: "yt-9" });
    expect((await db.select({ n: count() }).from(services))[0].n).toBe(118);
    expect(await db.select({ id: servicePriceVersions.id, price: servicePriceVersions.priceMicros }).from(servicePriceVersions)).toEqual(before);
  });

  it("activates only for an eligible service on an enabled provider, and switches off when either stops qualifying", async () => {
    await eligible("instagram-post-likes");
    const { id, s } = await enabledProvider("Activation Test");
    await saveMapping(db, s.actor, id, { serviceId: "instagram-post-likes", providerRef: "ig-likes-1" });
    await setMappingActive(db, s.actor, id, "instagram-post-likes", true);
    const isActive = async () => (await db.select({ a: providerServiceMappings.active }).from(providerServiceMappings).where(and(eq(providerServiceMappings.providerId, id), eq(providerServiceMappings.serviceId, "instagram-post-likes"))))[0].a;
    expect(await isActive()).toBe(true);
    // Editing the reference switches it off for re-verification.
    await saveMapping(db, s.actor, id, { serviceId: "instagram-post-likes", providerRef: "ig-likes-2" });
    expect(await isActive()).toBe(false);
    await setMappingActive(db, s.actor, id, "instagram-post-likes", true);
    await db.update(serviceEligibility).set({ legalReviewedAt: null }).where(eq(serviceEligibility.serviceId, "instagram-post-likes"));
    expect(await isActive()).toBe(false);
    await eligible("instagram-post-likes");
    await setMappingActive(db, s.actor, id, "instagram-post-likes", true);
    await db.update(providers).set({ enabled: false }).where(eq(providers.id, id));
    expect(await isActive()).toBe(false);
  });

  it("activation through the API needs Configure providers and re-authentication", async () => {
    await eligible("instagram-video-views");
    const { id, s } = await enabledProvider("API Activation");
    await saveMapping(db, s.actor, id, { serviceId: "instagram-video-views", providerRef: "ig-v" });
    signInAs("staff", s.token);
    const patch = (active: boolean) => call(mappingPatch, "/x", { method: "PATCH", body: JSON.stringify({ active }) }, { params: Promise.resolve({ id, serviceId: "instagram-video-views" }) });
    const r = await patch(true);
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe("REAUTH_REQUIRED");
    await markReauthenticated(db, s.sessionId);
    expect((await patch(true)).status).toBe(200);
    expect((await patch(false)).status).toBe(200);
  });
});

describe("health checks and the adapter guardrails", () => {
  it("without an integration nothing is contacted, and the real outcome is recorded", async () => {
    const s = await staff();
    const id = await createProvider(db, s.actor, { name: "Health None", type: "api" });
    const r = await runHealthCheck(db, s.actor, id);
    expect(r).toMatchObject({ ok: false, latencyMs: null });
    expect(r.error).toMatch(/nothing was contacted/);
    expect((await getProvider(db, id))!.health[0]).toMatchObject({ ok: false });
  });

  it("passes the decrypted credential only to the adapter; timeouts and bad replies fail safely", async () => {
    const { id, s } = await enabledProvider("Health Mock");
    const mock = createMockAdapter();
    expect((await runHealthCheck(db, s.actor, id, { adapters: { mock: mock.adapter }, ...fast })).ok).toBe(true);
    expect(mock.seen.at(-1)?.credential).toBe(SECRET);
    mock.behave("timeout");
    const t = await runHealthCheck(db, s.actor, id, { adapters: { mock: mock.adapter }, ...fast });
    expect(t).toMatchObject({ ok: false });
    expect(t.error).toMatch(/couldn't confirm/);
    expect(mock.calls.health).toBe(1 + 3); // read-only: retried twice
    mock.behave("garbage");
    expect((await runHealthCheck(db, s.actor, id, { adapters: { mock: mock.adapter }, ...fast })).ok).toBe(false);
    expect((await listProviders(db, { adapters: { mock: mock.adapter } })).find((p) => p.id === id)?.state).toBe("attention");
  });

  it("rate-limits calls per provider before anything is sent", async () => {
    const mock = createMockAdapter({ needsCredential: false });
    const opts = { db, providerId: `rl-${randomUUID().slice(0, 6)}`, adapter: mock.adapter, credential: null, endpoint: null, readOnly: true, retries: 0 };
    for (let i = 0; i < RATE_LIMIT.limit; i++) await callProvider(opts, (ctx) => mock.adapter.health(ctx), healthSchema);
    const err = await callProvider(opts, (ctx) => mock.adapter.health(ctx), healthSchema).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderCallError);
    expect(err.kind).toBe("rate_limited");
    expect(mock.calls.health).toBe(RATE_LIMIT.limit);
  });
});

describe("fulfilment preparation", () => {
  it("needs an approved, paid order and an active mapping; one open attempt per order", async () => {
    await eligible("instagram-followers");
    const { id, s } = await enabledProvider("Prep Provider");
    await saveMapping(db, s.actor, id, { serviceId: "instagram-followers", providerRef: "ig-f-1" });
    const o = await approvedOrder("instagram-followers");
    expect(await codeOf(prepareAttempt(db, o.s.actor, o.ref, { providerId: id }))).toBe("CONFLICT"); // mapping inactive
    const detail = await fulfillmentDetail(db, o.ref);
    expect(detail!.canPrepare).toBe(false);
    expect(detail!.prepareBlockers.join(" ")).toMatch(/mappings are active/);
    expect(detail!.submission.enabled).toBe(false);
    await setMappingActive(db, s.actor, id, "instagram-followers", true);
    const before = await ledgerCounts();
    const attemptId = await prepareAttempt(db, o.s.actor, o.ref, { providerId: id });
    expect(await codeOf(prepareAttempt(db, o.s.actor, o.ref, { providerId: id }))).toBe("CONFLICT");
    const [a] = await db.select().from(fulfillmentAttempts).where(eq(fulfillmentAttempts.id, attemptId));
    expect(a).toMatchObject({ status: "queued", submitCount: 0, providerOrderId: null, providerServiceRef: "ig-f-1" });
    expect(a.idempotencyKey).toMatch(/^ful_[a-f0-9]{32}$/);
    // The order itself is untouched and no money moved.
    expect((await db.select({ s: orders.status, p: orders.paymentStatus }).from(orders).where(eq(orders.publicRef, o.ref)))[0]).toEqual({ s: "queued", p: "charged" });
    expect(await ledgerCounts()).toEqual(before);
    // Staff-only history; the customer timeline doesn't show provider events.
    const own = await getOwnOrder(db, o.customer.customer.id, o.ref);
    expect(JSON.stringify(own)).not.toMatch(/provider|ig-f-1/i);
    await cancelAttempt(db, o.s.actor, o.ref, { attemptId, reason: "Testing cancel" });
    expect(await prepareAttempt(db, o.s.actor, o.ref, { providerId: id })).toBeTruthy();
  });

  it("the database refuses attempts for unapproved orders or without a mapping (SV013)", async () => {
    await eligible("youtube-video-likes");
    const { id } = await enabledProvider("SV013 Provider");
    await db.insert(platformSettings).values({ key: "commerce.checkout_enabled", value: true }).onConflictDoUpdate({ target: platformSettings.key, set: { value: true } });
    const c = await makeCustomer(db);
    await fundWallet(db, c.customer.id, 10_000);
    const { order } = await createOrder(db, { userId: c.user.id, customerId: c.customer.id }, { serviceId: "youtube-video-likes", quantity: 1000, link: "https://youtube.com/watch?v=x", details: {} }, `o_${randomUUID().replace(/-/g, "")}`);
    const [o] = await db.select().from(orders).where(eq(orders.publicRef, order.reference));
    expect(await sqlState(db.insert(fulfillmentAttempts).values({ orderId: o.id, providerId: id, providerServiceRef: "x", idempotencyKey: `ful_${"a".repeat(32)}` }))).toBe("SV013");
  });
});

describe("submission (trusted executor, mock adapter only)", () => {
  it("is refused while switched off, before any provider is contacted", async () => {
    const { mock, attemptId, deps } = await ready("instagram-reels-likes");
    expect(await codeOf(submitAttempt(db, attemptId, { adapters: deps.adapters }))).toBe("FEATURE_DISABLED");
    expect(mock.calls.submit).toBe(0);
  });

  it("sends once with the idempotency key, never touches money or the order, and concurrent workers can't double-submit", async () => {
    const { mock, o, attemptId, deps } = await ready("instagram-saves");
    const before = await ledgerCounts();
    const results = await Promise.all([submitAttempt(db, attemptId, deps), submitAttempt(db, attemptId, deps), submitAttempt(db, attemptId, deps)]);
    expect(mock.calls.submit).toBe(1);
    expect(results.filter((r) => r.status === "submitted")).toHaveLength(1);
    expect(results.filter((r) => r.status === "already_claimed")).toHaveLength(2);
    const [a] = await db.select().from(fulfillmentAttempts).where(eq(fulfillmentAttempts.id, attemptId));
    expect(a).toMatchObject({ status: "submitted", submitCount: 1, providerOrderId: "MOCK-1" });
    expect(await ledgerCounts()).toEqual(before);
    expect((await db.select({ s: orders.status }).from(orders).where(eq(orders.publicRef, o.ref)))[0].s).toBe("queued");
    // A sent attempt can never be sent again, even if someone resets its status.
    await db.update(fulfillmentAttempts).set({ status: "queued" }).where(eq(fulfillmentAttempts.id, attemptId));
    expect((await submitAttempt(db, attemptId, deps)).status).toBe("already_claimed");
    expect(await sqlState(db.update(fulfillmentAttempts).set({ submitCount: 0 }).where(eq(fulfillmentAttempts.id, attemptId)))).toBe("SV013");
  });

  it("a definite refusal fails the attempt without retrying; a new attempt can then be prepared", async () => {
    const { mock, p, o, attemptId, deps } = await ready("instagram-shares");
    mock.behave("unavailable");
    expect((await submitAttempt(db, attemptId, deps)).status).toBe("failed");
    expect(mock.calls.submit).toBe(1); // a submission is never retried
    const [a] = await db.select().from(fulfillmentAttempts).where(eq(fulfillmentAttempts.id, attemptId));
    expect(a).toMatchObject({ status: "failed", errorCode: "http_503" });
    expect(await prepareAttempt(db, o.s.actor, o.ref, { providerId: p.id })).toBeTruthy();
  });

  it("an uncertain outcome becomes unknown, blocks a new attempt, and is settled by looking up the key", async () => {
    const { mock, p, o, attemptId, deps } = await ready("tiktok-video-likes");
    mock.behave("accept_then_drop");
    expect((await submitAttempt(db, attemptId, deps)).status).toBe("unknown");
    expect(await codeOf(prepareAttempt(db, o.s.actor, o.ref, { providerId: p.id }))).toBe("CONFLICT");
    const events = await db.select({ type: orderEvents.type }).from(orderEvents).innerJoin(orders, eq(orders.id, orderEvents.orderId)).where(eq(orders.publicRef, o.ref));
    expect(events.map((e) => e.type)).toContain("provider_outcome_unknown");
    mock.behave("ok");
    const r = await reconcileAttempt(db, attemptId, deps);
    expect(r).toMatchObject({ status: "submitted", changed: true });
    const [a] = await db.select().from(fulfillmentAttempts).where(eq(fulfillmentAttempts.id, attemptId));
    expect(a.providerOrderId).toBe("MOCK-1");
    expect(mock.calls.submit).toBe(1); // settled without sending again
  });

  it("an unreadable reply is uncertain too; a timeout before acceptance stays unknown until a person resolves it", async () => {
    const g = await ready("tiktok-video-views");
    g.mock.behave("garbage");
    expect((await submitAttempt(db, g.attemptId, g.deps)).status).toBe("unknown");
    const t = await ready("tiktok-shares");
    t.mock.behave("timeout");
    expect((await submitAttempt(db, t.attemptId, t.deps)).status).toBe("unknown");
    t.mock.behave("ok");
    expect(await reconcileAttempt(db, t.attemptId, t.deps)).toMatchObject({ status: "unknown", changed: false });
    const [a] = await db.select().from(fulfillmentAttempts).where(eq(fulfillmentAttempts.id, t.attemptId));
    expect(a.error).toMatch(/no order for this attempt/);
    expect(await codeOf(resolveUnknown(db, t.o.s.actor, t.o.ref, { resolution: "not_submitted", attemptId: t.attemptId, note: "short" }))).toBe("ZOD");
    await resolveUnknown(db, t.o.s.actor, t.o.ref, { resolution: "not_submitted", attemptId: t.attemptId, note: "Checked the provider dashboard: no order exists." });
    expect((await db.select({ s: fulfillmentAttempts.status }).from(fulfillmentAttempts).where(eq(fulfillmentAttempts.id, t.attemptId)))[0].s).toBe("failed");
    expect(await prepareAttempt(db, t.o.s.actor, t.o.ref, { providerId: t.p.id })).toBeTruthy();
  });

  it("resolving with a found provider order id attaches it; the route needs re-authentication", async () => {
    const { mock, o, attemptId, deps } = await ready("youtube-channel-subscribers");
    mock.behave("timeout");
    await submitAttempt(db, attemptId, deps);
    signInAs("staff", o.s.token);
    const res = await call(fulfillmentAction, "/x", { method: "POST", body: JSON.stringify({ resolution: "found", attemptId, providerOrderId: "PRV-7781", note: "Found it in the provider's order list." }) }, { params: Promise.resolve({ ref: o.ref, action: "resolve" }) });
    expect(res.status).toBe(403);
    await markReauthenticated(db, o.s.sessionId);
    const ok = await call(fulfillmentAction, "/x", { method: "POST", body: JSON.stringify({ resolution: "found", attemptId, providerOrderId: "PRV-7781", note: "Found it in the provider's order list." }) }, { params: Promise.resolve({ ref: o.ref, action: "resolve" }) });
    expect(ok.status).toBe(200);
    const [a] = await db.select().from(fulfillmentAttempts).where(eq(fulfillmentAttempts.id, attemptId));
    expect(a).toMatchObject({ status: "submitted", providerOrderId: "PRV-7781" });
    expect((await db.select().from(auditLog).where(eq(auditLog.targetId, attemptId))).map((x) => x.action)).toContain("fulfillment.resolved");
  });
});

describe("reconciliation", () => {
  it("records progress; provider-reported completion never completes the order or moves money", async () => {
    const { mock, o, attemptId, deps } = await ready("facebook-page-likes");
    await submitAttempt(db, attemptId, deps);
    const before = await ledgerCounts();
    mock.progress("MOCK-1", "In progress", 300);
    expect(await reconcileAttempt(db, attemptId, deps)).toMatchObject({ status: "in_progress", changed: true });
    mock.progress("MOCK-1", "Something odd");
    expect(await reconcileAttempt(db, attemptId, deps)).toMatchObject({ status: "in_progress", changed: false });
    expect((await db.select({ e: fulfillmentAttempts.error }).from(fulfillmentAttempts).where(eq(fulfillmentAttempts.id, attemptId)))[0].e).toMatch(/Unrecognised provider status/);
    mock.progress("MOCK-1", "Completed", 1000);
    expect(await reconcileAttempt(db, attemptId, deps)).toMatchObject({ status: "completed", changed: true });
    const [order] = await db.select().from(orders).where(eq(orders.publicRef, o.ref));
    expect(order).toMatchObject({ status: "queued", paymentStatus: "charged", revenueStatus: "deferred" });
    expect(await ledgerCounts()).toEqual(before);
    const types = (await db.select({ t: orderEvents.type, actor: orderEvents.actorType }).from(orderEvents).where(eq(orderEvents.orderId, order.id))).map((e) => `${e.t}:${e.actor}`);
    expect(types).toContain("provider_reported_complete:provider");
    // Finished attempts can't change.
    expect(await sqlState(db.update(fulfillmentAttempts).set({ status: "in_progress" }).where(eq(fulfillmentAttempts.id, attemptId)))).toBe("SV013");
    const own = await getOwnOrder(db, o.customer.customer.id, o.ref);
    expect(JSON.stringify(own)).not.toMatch(/provider|MOCK-1/i);
  });

  it("concurrent background passes claim each attempt once", async () => {
    const a = await ready("facebook-post-likes");
    const b = await ready("x-followers");
    await submitAttempt(db, a.attemptId, a.deps);
    await submitAttempt(db, b.attemptId, b.deps);
    const deps = { adapters: { mock: a.mock.adapter }, ...fast };
    const now = new Date(Date.now() + 10 * 60_000);
    const [r1, r2] = await Promise.all([reconcileDue(db, deps, now), reconcileDue(db, deps, now)]);
    const pending = await db.select({ n: count() }).from(fulfillmentAttempts).where(sql`${fulfillmentAttempts.status} in ('submitted','in_progress','unknown')`);
    expect(r1.claimed + r2.claimed).toBe(pending[0].n);
  });
});

describe("routes, history and safety", () => {
  it("fulfilment needs Orders: Manage and Providers: View; submission is refused through the API", async () => {
    const { o, attemptId, mock } = await ready("x-post-likes");
    const support = await staff("support");
    signInAs("staff", support.token);
    expect((await call(fulfillmentGet, "/x", {}, { params: Promise.resolve({ ref: o.ref }) })).status).toBe(403);
    signInAs("staff", o.s.token);
    const detail = (await (await call(fulfillmentGet, "/x", {}, { params: Promise.resolve({ ref: o.ref }) })).json()) as { order: { attempts: unknown[]; submission: { enabled: boolean } } };
    expect(detail.order.submission.enabled).toBe(false);
    expect(JSON.stringify(detail)).not.toMatch(/cost/i);
    const r = await call(fulfillmentAction, "/x", { method: "POST", body: JSON.stringify({ attemptId }) }, { params: Promise.resolve({ ref: o.ref, action: "submit" }) });
    expect(r.status).toBe(503);
    expect(mock.calls.submit).toBe(0);
    expect((await call(fulfillmentAction, "/x", { method: "POST", body: "{}" }, { params: Promise.resolve({ ref: o.ref, action: "teleport" }) })).status).toBe(404);
  });

  it("provider history is append-only; archiving needs open attempts resolved", async () => {
    const { p, o } = await ready("x-post-reposts");
    expect(await codeOf(archiveProvider(db, p.s.actor, p.id))).toBe("CONFLICT");
    expect(await sqlState(db.update(providerEvents).set({ message: "rewritten" }).where(eq(providerEvents.providerId, p.id)))).toBe("SV001");
    const [a] = await db.select().from(fulfillmentAttempts).innerJoin(orders, eq(orders.id, fulfillmentAttempts.orderId)).where(eq(orders.publicRef, o.ref));
    await cancelAttempt(db, o.s.actor, o.ref, { attemptId: a.fulfillment_attempts.id, reason: "Archiving test" });
    await archiveProvider(db, p.s.actor, p.id);
    const after = await getProvider(db, p.id);
    expect(after).toMatchObject({ archived: true, enabled: false, state: "archived" });
    expect(after!.credential.configured).toBe(false);
    expect(after!.mappings.every((m) => !m.active)).toBe(true);
  });
});
