import { randomUUID } from "node:crypto";
import { count, eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { GET as overviewGet } from "@/app/api/admin/overview/route";
import { resolveRange } from "@/lib/admin-overview";
import { DEFAULT_ACCESS } from "@/lib/admin-staff";
import { audit } from "@/server/audit";
import { adminOverview } from "@/server/analytics/overview";
import { createDb, type Db } from "@/server/db/client";
import { auditLog, customers, platformSettings, serviceEligibility, servicePriceVersions } from "@/server/db/schema";
import { getEnv, resetEnvCache } from "@/server/env";
import { balanceSummary, financialSummary } from "@/server/payments/reconcile";
import { approveOrder, assignOrder, completeOrder, createOrder, startFulfillment } from "@/server/orders/orders";
import { runMigrations } from "../../scripts/db/migrate";
import { seedReferenceData } from "../../scripts/db/seed";
import { makeCustomer, makeStaff, signInAs } from "./auth-helpers";
import { fundWallet } from "./helpers";

vi.mock("next/headers", async () => (await import("./auth-helpers")).jarMock());
vi.mock("next/server", () => ({ connection: async () => {} }));

/*
 * Phase 5H-A Admin Overview against a scratch database with controlled
 * fixtures. Checkout and one purchasable service exist ONLY here.
 */
const scratch = `socivanta_overview_test_${Date.now()}`;
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
  await seedReferenceData(db);
}, 120_000);
afterAll(async () => {
  delete process.env.REVENUE_RECOGNITION_POLICY;
  await db.$client.end();
  process.env.DATABASE_URL = inject("databaseUrl");
  resetEnvCache();
  await admin.query(`drop database if exists ${scratch} with (force)`);
  await admin.end();
});

const ORIGIN = "http://localhost:3000";
const get = (q = "range=7d") => overviewGet(new Request(`${ORIGIN}/api/admin/overview?${q}`), {} as never);
const OWNER = DEFAULT_ACCESS.owner as never;
const SVC = "instagram-followers";
const done = { evidenceNote: "Delivered 1,000 followers, checked on the profile.", evidenceUrl: "https://instagram.com/example", checks: { deliveredAsOrdered: true, verifiedOnTarget: true } };

describe("empty platform", () => {
  it("reports zeros and no history instead of inventing any", async () => {
    const o = await adminOverview(db, getEnv(), OWNER, resolveRange("7d")!);
    expect(o.dataSince).toBeNull();
    expect(o.customers).toMatchObject({ total: 0, new: { value: 0, previous: null } });
    expect(o.customers!.series).toHaveLength(7);
    expect(o.customers!.series.every((p) => p.beforeData && p.value === 0)).toBe(true);
    expect(o.orders).toMatchObject({ total: 0, placed: { value: 0, previous: null }, byStatus: [], topServices: [] });
    expect(o.finance).toMatchObject({ revenueCents: { value: 0 }, fundingCents: { value: 0 }, walletLiabilitiesCents: 0, paymentMethods: { configured: 0 } });
    expect(o.services!.total).toBe(118);
    expect(o.services).toMatchObject({ purchasable: 0, checkoutEnabled: false });
    expect(o.providers).toMatchObject({ ready: 0 });
    expect(o.ai).toMatchObject({ requests: 0, inputTokens: null, estimatedCostMicros: 0, generation: { live: false }, emergencyPaused: false });
  });
});

describe("controlled fixtures", () => {
  let orderTotal = 0;
  beforeAll(async () => {
    const now = new Date(Date.now() - 60_000);
    await db.insert(platformSettings).values({ key: "commerce.checkout_enabled", value: true }).onConflictDoUpdate({ target: platformSettings.key, set: { value: true } });
    await db.insert(servicePriceVersions).values({ serviceId: SVC, pricingModel: "per1000", costMicros: 1, priceMicros: 2_000_000, minQty: 100, maxQty: 100_000, effectiveFrom: now });
    const gates = { policyReviewedAt: now, supplierVerifiedAt: now, fulfillmentVerifiedAt: now, paymentAcceptedAt: now, legalReviewedAt: now, technicalReadyAt: now };
    await db.insert(serviceEligibility).values({ serviceId: SVC, ...gates }).onConflictDoUpdate({ target: serviceEligibility.serviceId, set: gates });

    // An old customer 60 days ago makes the previous 7-day window comparable.
    const old = await makeCustomer(db);
    await db.update(customers).set({ createdAt: new Date(Date.now() - 60 * 86_400_000) }).where(eq(customers.id, old.customer.id));
    const a = await makeCustomer(db);
    const b = await makeCustomer(db);
    await fundWallet(db, a.customer.id, 10_000);
    await fundWallet(db, b.customer.id, 5_000);
    const ops = await makeStaff(db, "orders");
    const s = { userId: ops.user.id };
    process.env.REVENUE_RECOGNITION_POLICY = "on_completion";
    resetEnvCache();
    const first = await createOrder(db, { userId: a.user.id, customerId: a.customer.id }, { serviceId: SVC, quantity: 1000, link: "https://instagram.com/example", details: {} }, `o_${randomUUID().replace(/-/g, "")}`);
    await createOrder(db, { userId: b.user.id, customerId: b.customer.id }, { serviceId: SVC, quantity: 500, link: "https://instagram.com/example2", details: {} }, `o_${randomUUID().replace(/-/g, "")}`);
    orderTotal = first.order.totalCents;
    await approveOrder(db, s, first.order.reference);
    await assignOrder(db, s, first.order.reference, {});
    await startFulfillment(db, s, first.order.reference, { fulfillmentRef: "MAN-0001" });
    await completeOrder(db, s, first.order.reference, done);
  });

  it("counts real records and keeps revenue, order value, funding and wallets apart", async () => {
    const o = await adminOverview(db, getEnv(), OWNER, resolveRange("7d")!);
    expect(o.customers).toMatchObject({ total: 3, new: { value: 2, previous: 0 } });
    expect(o.customers!.series.reduce((x, p) => x + p.value, 0)).toBe(2);
    expect(o.orders!.placed).toEqual({ value: 2, previous: 0 });
    expect(o.orders!.series.reduce((x, p) => x + p.value, 0)).toBe(2);
    expect(Object.fromEntries(o.orders!.byStatus.map((x) => [x.status, x.count]))).toEqual({ completed: 1, pending_review: 1 });
    expect(o.orders!.topServices[0]).toMatchObject({ id: SVC, orders: 2 });
    expect(o.orders!.queues.review).toBe(1);
    const value = o.orders!.valueCents.value;
    expect(value).toBe(orderTotal + 100); // 1,000 at $2/1k + 500 at $2/1k

    const f = o.finance!;
    expect(f.revenueCents.value).toBe(orderTotal); // only the completed order
    expect(f.revenueLifetimeCents).toBe(orderTotal);
    expect(f.recognizedOrders).toBe(1);
    expect(f.fundingCents.value).toBe(15_000); // deposits credited, not revenue
    expect(f.fundingCount).toBe(2);
    expect(f.fundingSeries.reduce((x, p) => x + p.value, 0)).toBe(15_000);
    expect(f.walletLiabilitiesCents).toBe(15_000 - value); // funded minus charged
    expect(f.committedToOrdersCents).toBe(value - orderTotal); // the open order
    expect(new Set([f.revenueCents.value, f.fundingCents.value, value, f.walletLiabilitiesCents]).size).toBe(4);
    expect(o.services).toMatchObject({ purchasable: 1, checkoutEnabled: true });
  });

  it("applies the same UTC boundaries everywhere", async () => {
    const r = resolveRange("7d")!;
    const c = await makeCustomer(db);
    const edge = await makeCustomer(db);
    await db.update(customers).set({ createdAt: new Date(r.start.getTime() - 1) }).where(eq(customers.id, c.customer.id));
    await db.update(customers).set({ createdAt: r.start }).where(eq(customers.id, edge.customer.id));
    const o = await adminOverview(db, getEnv(), OWNER, r);
    expect(o.customers!.new.value).toBe(3); // the edge customer counts, the one 1 ms earlier doesn't
    expect(o.customers!.new.previous).toBe(1);
    expect(o.customers!.series[0].value).toBe(1);
    expect(o.customers!.series.reduce((x, p) => x + p.value, 0)).toBe(o.customers!.new.value);

    const today = await adminOverview(db, getEnv(), OWNER, resolveRange("today")!);
    expect(today.range.unit).toBe("hour");
    expect(today.customers!.series).toHaveLength(new Date().getUTCHours() + 1);
  });

  it("hides sections the role can't view, in the API as well as the UI", async () => {
    const support = await makeStaff(db, "support");
    signInAs("staff", support.token);
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["activity", "customers", "dataSince", "generatedAt", "orders", "range", "referrals", "services", "support"]);
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/revenue|wallet|funding|estimatedCost/i);

    const finance = await makeStaff(db, "finance");
    signInAs("staff", finance.token);
    const fb = await (await get()).json();
    expect(fb.finance).toBeTruthy();
    expect(fb.ai).toBeUndefined();
    expect(fb.providers).toBeUndefined();

    const owner = await makeStaff(db, "owner");
    signInAs("staff", owner.token);
    const ob = await (await get()).json();
    for (const k of ["customers", "orders", "finance", "services", "providers", "support", "referrals", "ai", "activity"]) expect(ob[k], k).toBeTruthy();

    const cust = await makeCustomer(db);
    signInAs("customer", cust.token);
    expect([401, 403]).toContain((await get()).status);
  });

  it("activity respects permissions and never exposes audit payloads or emails", async () => {
    const owner = await makeStaff(db, "owner");
    await audit(db, { actorUserId: owner.user.id, actorType: "staff", action: "deposit.credited", targetType: "deposit", targetId: randomUUID(), before: { secret: "before-payload" }, after: { email: "private@example.test" } });
    await audit(db, { actorUserId: null, actorType: "customer", action: "auth.registered", targetType: "user", targetId: randomUUID(), after: { email: "someone@example.test" } });
    signInAs("staff", owner.token);
    const ob = await (await get()).json();
    const labels = ob.activity.map((a: { label: string }) => a.label);
    expect(labels).toContain("Deposit credited");
    expect(labels).toContain("New customer registered");
    expect(JSON.stringify(ob.activity)).not.toMatch(/before-payload|@example\.test/);

    const support = await makeStaff(db, "support");
    signInAs("staff", support.token);
    const sb = await (await get()).json();
    expect(sb.activity.map((a: { area: string }) => a.area)).not.toContain("Payments");
  });

  it("validates ranges and never writes", async () => {
    const owner = await makeStaff(db, "owner");
    signInAs("staff", owner.token);
    const before = (await db.select({ n: count() }).from(auditLog))[0].n;
    for (const q of ["range=bogus", "range=custom", "range=custom&from=2026-02-01&to=2026-01-01", "range=custom&from=2020-01-01&to=2021-06-01", "range=custom&from=2999-01-01&to=2999-01-02"]) expect((await get(q)).status, q).toBe(400);
    const ok = await (await get("range=custom&from=2026-01-01&to=2026-01-31")).json();
    expect(ok.range).toMatchObject({ from: "2026-01-01", to: "2026-01-31", unit: "day" });
    expect(ok.orders.series).toHaveLength(31);
    expect((await db.select({ n: count() }).from(auditLog))[0].n).toBe(before);
  });

  it("uses indexes for the date-range scans", async () => {
    await db.execute(sql`set enable_seqscan = off`);
    const plan = (q: string) => db.execute<{ "QUERY PLAN": string }>(sql.raw(`explain ${q}`)).then((r) => r.rows.map((x) => x["QUERY PLAN"]).join("\n"));
    expect(await plan("select count(*) from orders where placed_at >= now() - interval '7 days'")).toMatch(/orders_placed_idx/);
    expect(await plan("select count(*) from customers where created_at >= now() - interval '7 days'")).toMatch(/customers_created_idx/);
    expect(await plan("select count(*) from journal_entries where kind = 'deposit_credit' and created_at >= now() - interval '7 days'")).toMatch(/journal_entries_kind_created_idx/);
    await db.execute(sql`set enable_seqscan = on`);
  });

  it("reads balances without the all-time ledger scan, with the same figures (5I-B)", async () => {
    const c = await makeCustomer(db);
    await fundWallet(db, c.customer.id, 4_200);
    const { walletMovements, ...balances } = await financialSummary(db);
    expect(await balanceSummary(db)).toEqual(balances);
    expect(walletMovements.depositCredits.cents).toBeGreaterThanOrEqual(4_200); // reconciliation still gets the movements
  });
});
