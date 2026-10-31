import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { GET as myOrders, POST as placeOrderRoute } from "@/app/api/account/orders/route";
import { GET as myOrder } from "@/app/api/account/orders/[ref]/route";
import { POST as orderAction } from "@/app/api/admin/orders/[ref]/[action]/route";
import { GET as staffOrders } from "@/app/api/admin/orders/route";
import { markReauthenticated } from "@/server/auth/sessions";
import { createDb, type Db } from "@/server/db/client";
import { journalEntries, orderEvents, orders, platformSettings, serviceEligibility, servicePriceVersions } from "@/server/db/schema";
import { resetEnvCache } from "@/server/env";
import { AppError } from "@/server/errors";
import {
  addOrderNote,
  approveOrder,
  assignOrder,
  cancelOrderByStaff,
  cancelOwnOrder,
  completeOrder,
  createOrder,
  failOrder,
  getOrderForStaff,
  getOwnOrder,
  listOwnOrders,
  ORDERS_PER_MINUTE,
  recordProgress,
  rejectOrder,
  requestOrderInfo,
  startFulfillment,
  totalCentsFor,
  updateOwnOrderDetails,
} from "@/server/orders/orders";
import { requestRefund } from "@/server/payments/adjustments";
import { financialSummary, reconcile } from "@/server/payments/reconcile";
import { walletSummary } from "@/server/wallet/wallet";
import { runMigrations } from "../../scripts/db/migrate";
import { seedReferenceData } from "../../scripts/db/seed";
import { jar, makeCustomer, makeStaff, signInAs } from "./auth-helpers";
import { fundWallet, sqlState } from "./helpers";

vi.mock("next/headers", async () => (await import("./auth-helpers")).jarMock());
vi.mock("next/server", () => ({ connection: async () => {} }));

/*
 * Orders run against their own scratch database: checkout is switched on and
 * services are made purchasable ONLY here, never in the shared test database
 * or any real environment. Test wallets are funded with test-only postings.
 */
const scratch = `socivanta_orders_test_${Date.now()}`;
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
afterEach(() => {
  delete process.env.REVENUE_RECOGNITION_POLICY;
  resetEnvCache();
});
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
    (e) => (e instanceof AppError ? `${e.code}${e.details?.field ? `:${e.details.field}` : ""}` : e?.name === "ZodError" ? "ZOD" : `other:${String(e)}`),
  );
const key = () => `o_${randomUUID().replace(/-/g, "")}`;
const actorOf = (c: Awaited<ReturnType<typeof makeCustomer>>) => ({ userId: c.user.id, customerId: c.customer.id });
const setCheckout = (on: boolean) =>
  db.insert(platformSettings).values({ key: "commerce.checkout_enabled", value: on }).onConflictDoUpdate({ target: platformSettings.key, set: { value: on } });

/** Records all six gates and a current price for one service — in this scratch database only. */
async function makePurchasable(serviceId: string, priceMicros = 2_000_000, model = "per1000", minQty: number | null = 100, maxQty: number | null = 100_000) {
  const now = new Date(Date.now() - 60_000);
  await db.insert(servicePriceVersions).values({ serviceId, pricingModel: model, costMicros: 1, priceMicros, minQty, maxQty, effectiveFrom: now });
  const gates = { policyReviewedAt: now, supplierVerifiedAt: now, fulfillmentVerifiedAt: now, paymentAcceptedAt: now, legalReviewedAt: now, technicalReadyAt: now };
  await db.insert(serviceEligibility).values({ serviceId, ...gates }).onConflictDoUpdate({ target: serviceEligibility.serviceId, set: gates });
}
const SVC = "instagram-followers";
const body = (over: object = {}) => ({ serviceId: SVC, quantity: 1000, link: "https://instagram.com/example", details: {}, ...over });
async function funded(cents: number) {
  const c = await makeCustomer(db);
  if (cents) await fundWallet(db, c.customer.id, cents);
  return c;
}
async function placed(cents = 10_000) {
  const c = await funded(cents);
  const { order } = await createOrder(db, actorOf(c), body(), key());
  return { c, order };
}
const done = { evidenceNote: "Delivered 1,000 followers, checked on the profile.", evidenceUrl: "https://instagram.com/example", checks: { deliveredAsOrdered: true, verifiedOnTarget: true } };

describe("order creation gates", () => {
  it("checkout off: nothing can be ordered and nothing is charged", async () => {
    await setCheckout(false);
    const c = await funded(10_000);
    expect(await codeOf(createOrder(db, actorOf(c), body(), key()))).toBe("FEATURE_DISABLED");
    expect((await walletSummary(db, c.customer.id)).availableCents).toBe(10_000);
    // The database refuses a direct insert too (SV009).
    expect(await sqlState(db.execute(sql`insert into orders (public_ref, customer_id, service_id, price_version_id, quantity, unit_price_micros, total_cents, idempotency_key) values ('ORD-DIRECT1', ${c.customer.id}, ${SVC}, ${randomUUID()}, 1, 1, 1, 'k-direct-000001')`))).toMatch(/SV009|23503/);
  });

  it("checkout on but a service without all six gates stays unorderable", async () => {
    await setCheckout(true);
    const c = await funded(10_000);
    expect(await codeOf(createOrder(db, actorOf(c), body({ serviceId: "tiktok-followers" }), key()))).toBe("FEATURE_DISABLED");
    await db.insert(servicePriceVersions).values({ serviceId: "tiktok-followers", pricingModel: "per1000", costMicros: 1, priceMicros: 1_000_000, minQty: 100, maxQty: 1000, effectiveFrom: new Date(Date.now() - 1000) });
    const five = { policyReviewedAt: new Date(), supplierVerifiedAt: new Date(), fulfillmentVerifiedAt: new Date(), legalReviewedAt: new Date(), technicalReadyAt: new Date() };
    await db.insert(serviceEligibility).values({ serviceId: "tiktok-followers", ...five }).onConflictDoUpdate({ target: serviceEligibility.serviceId, set: five });
    expect(await codeOf(createOrder(db, actorOf(c), body({ serviceId: "tiktok-followers" }), key()))).toBe("FEATURE_DISABLED"); // payment acceptance missing
  });
});

describe("placing orders (isolated database)", () => {
  beforeAll(async () => {
    await setCheckout(true);
    await makePurchasable(SVC, 2_000_000); // $2.00 per 1,000
  });

  it("charges the wallet atomically and freezes the price", async () => {
    const c = await funded(10_000);
    const { order, replayed } = await createOrder(db, actorOf(c), body({ quantity: 2500 }), key());
    expect(replayed).toBe(false);
    expect(order).toMatchObject({ status: "pending_review", paymentStatus: "charged", quantity: 2500, totalCents: 500, currency: "USD" });
    expect(order.reference).toMatch(/^ORD-[A-Z0-9]{10}$/);
    expect(await walletSummary(db, c.customer.id)).toMatchObject({ availableCents: 9_500 });
    const [row] = await db.select().from(orders).where(eq(orders.publicRef, order.reference));
    const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, row.debitEntryId!));
    expect(entry.kind).toBe("order_debit");
    expect(row.priceSnapshot).toMatchObject({ serviceName: "Instagram Followers", unitPriceMicros: 2_000_000, pricingModel: "per1000" });
    // A later price change never touches the existing order.
    await db.insert(servicePriceVersions).values({ serviceId: SVC, pricingModel: "per1000", costMicros: 1, priceMicros: 9_000_000, minQty: 100, maxQty: 100_000, effectiveFrom: new Date(Date.now() - 1000) });
    expect((await getOwnOrder(db, c.customer.id, order.reference))!.totalCents).toBe(500);
    const next = await createOrder(db, actorOf(c), body({ quantity: 1000 }), key());
    expect(next.order.totalCents).toBe(900);
    await db.insert(servicePriceVersions).values({ serviceId: SVC, pricingModel: "per1000", costMicros: 1, priceMicros: 2_000_000, minQty: 100, maxQty: 100_000, effectiveFrom: new Date(Date.now() - 500) });
    const s = await financialSummary(db);
    expect(s.committedToOrdersCents).toBeGreaterThanOrEqual(1_400);
    expect(s.revenueCents).toBe(0);
  });

  it("validates quantity, link and details; never accepts a client price", async () => {
    const c = await funded(10_000);
    const make = (b: object) => codeOf(createOrder(db, actorOf(c), b, key()));
    expect(await make(body({ quantity: 99 }))).toBe("VALIDATION_FAILED:quantity");
    expect(await make(body({ quantity: 100_001 }))).toBe("VALIDATION_FAILED:quantity");
    expect(await make(body({ quantity: 10.5 }))).toBe("ZOD");
    expect(await make(body({ link: "" }))).toBe("VALIDATION_FAILED:link");
    expect(await make(body({ link: "http://instagram.com/x" }))).toBe("VALIDATION_FAILED:link");
    expect(await make(body({ details: { password: "x" } }))).toBe("VALIDATION_FAILED:password");
    expect(await make(body({ details: { notes: "my password is hunter2" } }))).toBe("VALIDATION_FAILED:notes");
    expect(await make({ ...body(), totalCents: 1 })).toBe("ZOD");
    expect(await make({ ...body(), status: "completed" })).toBe("ZOD");
    expect(await make(body({ serviceId: "does-not-exist" }))).toBe("NOT_FOUND");
    expect(await codeOf(createOrder(db, actorOf(c), body(), null))).toBe("VALIDATION_FAILED:idempotencyKey");
    expect((await walletSummary(db, c.customer.id)).availableCents).toBe(10_000);
  });

  it("insufficient funds creates nothing", async () => {
    const c = await funded(100);
    expect(await codeOf(createOrder(db, actorOf(c), body({ quantity: 1000 }), key()))).toBe("INSUFFICIENT_FUNDS");
    expect((await listOwnOrders(db, c.customer.id, {})).total).toBe(0);
    expect((await walletSummary(db, c.customer.id)).availableCents).toBe(100);
    const none = await funded(0);
    expect(await codeOf(createOrder(db, actorOf(none), body(), key()))).toBe("INSUFFICIENT_FUNDS");
  });

  it("duplicate submissions charge once; a reused key with other details is refused", async () => {
    const c = await funded(10_000);
    const k = key();
    const results = await Promise.all(Array.from({ length: 5 }, () => createOrder(db, actorOf(c), body(), k)));
    expect(new Set(results.map((r) => r.order.reference)).size).toBe(1);
    expect((await walletSummary(db, c.customer.id)).availableCents).toBe(9_800);
    expect(await codeOf(createOrder(db, actorOf(c), body({ quantity: 2000 }), k))).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("concurrent orders can never overdraw the wallet", async () => {
    const c = await funded(500); // room for two $2.00 orders
    const res = await Promise.all(Array.from({ length: 6 }, () => codeOf(createOrder(db, actorOf(c), body(), key()))));
    expect(res.filter((r) => r === "resolved")).toHaveLength(2);
    expect(res.filter((r) => r === "INSUFFICIENT_FUNDS")).toHaveLength(4);
    expect((await walletSummary(db, c.customer.id)).availableCents).toBe(100);
  });

  it(`rate-limits to ${ORDERS_PER_MINUTE} orders a minute`, async () => {
    const c = await funded(100_000);
    for (let i = 0; i < ORDERS_PER_MINUTE; i++) await createOrder(db, actorOf(c), body(), key());
    expect(await codeOf(createOrder(db, actorOf(c), body(), key()))).toBe("RATE_LIMITED");
  });

  it("an order can't exist without its charge, and its money can't be edited", async () => {
    const { order } = await placed();
    const where = eq(orders.publicRef, order.reference);
    expect(await sqlState(db.update(orders).set({ totalCents: 1 }).where(where))).toBe("SV011");
    expect(await sqlState(db.update(orders).set({ status: "completed" }).where(where))).toBe("SV011");
    expect(await sqlState(db.update(orders).set({ link: "https://evil.example" }).where(where))).toBe("SV011");
    expect(await sqlState(db.delete(orders).where(where))).toBe("SV001");
    expect(await sqlState(db.update(orderEvents).set({ type: "x" }).where(sql`true`))).toBe("SV001");
  });

  it("pricing maths uses integers with half-up rounding", () => {
    expect(totalCentsFor("per1000", 2_000_000, 2500)).toBe(500);
    expect(totalCentsFor("per1000", 1_234_567, 1)).toBe(0);
    expect(totalCentsFor("per1000", 1_234_567, 1000)).toBe(123);
    expect(totalCentsFor("per1000", 1_235_000, 1000)).toBe(124); // 123.5 → 124
    expect(totalCentsFor("unit", 15_000, 3)).toBe(5); // 4.5 → 5
    expect(totalCentsFor("fixed", 49_990_000, 1)).toBe(4999);
  });
});

describe("lifecycle & manual fulfilment", () => {
  it("review → assign → start → progress → complete (with evidence); revenue stays deferred", async () => {
    const { c, order } = await placed();
    const ops = await makeStaff(db, "orders");
    const s = { userId: ops.user.id };
    expect(await codeOf(startFulfillment(db, s, order.reference, { fulfillmentRef: "MAN-1" }))).toBe("CONFLICT"); // not approved
    await approveOrder(db, s, order.reference);
    expect(await codeOf(startFulfillment(db, s, order.reference, { fulfillmentRef: "MAN-1" }))).toBe("CONFLICT"); // not assigned
    await assignOrder(db, s, order.reference, {});
    await startFulfillment(db, s, order.reference, { fulfillmentRef: "MAN-0001" });
    await recordProgress(db, s, order.reference, { note: "Started delivery on the profile." });
    expect(await codeOf(completeOrder(db, s, order.reference, { ...done, checks: { deliveredAsOrdered: true } }))).toBe("ZOD");
    expect(await codeOf(completeOrder(db, s, order.reference, { ...done, evidenceNote: "done" }))).toBe("ZOD");
    await completeOrder(db, s, order.reference, done);
    const view = (await getOrderForStaff(db, order.reference, ops.user.id))!;
    expect(view).toMatchObject({ status: "completed", paymentStatus: "charged", revenueStatus: "deferred", fulfillment: { method: "manual", reference: "MAN-0001", assignedToMe: true } });
    expect(view.events.map((e) => e.type)).toEqual(["created", "approved", "assigned", "fulfillment_started", "progress", "completed"]);
    const mine = (await getOwnOrder(db, c.customer.id, order.reference))!;
    expect(mine.events.map((e) => e.label)).toContain("Completed");
    expect(JSON.stringify(mine)).not.toContain("MAN-0001"); // internal reference stays internal
    // Closed orders are final.
    expect(await codeOf(cancelOrderByStaff(db, s, order.reference, { reason: "Changed our mind about it" }))).toBe("CONFLICT");
    expect(await sqlState(db.update(orders).set({ statusReason: "edited" }).where(eq(orders.publicRef, order.reference)))).toBe("SV011");
    expect((await financialSummary(db)).revenueCents).toBe(0);
  });

  it("with REVENUE_RECOGNITION_POLICY=on_completion, completion recognises revenue exactly once", async () => {
    process.env.REVENUE_RECOGNITION_POLICY = "on_completion";
    resetEnvCache();
    const { order } = await placed();
    const ops = await makeStaff(db, "orders");
    const s = { userId: ops.user.id };
    await approveOrder(db, s, order.reference);
    await assignOrder(db, s, order.reference, {});
    await startFulfillment(db, s, order.reference, { fulfillmentRef: "MAN-0002" });
    const before = (await financialSummary(db)).revenueCents;
    await completeOrder(db, s, order.reference, done);
    expect((await getOrderForStaff(db, order.reference))!.revenueStatus).toBe("recognized");
    expect((await financialSummary(db)).revenueCents).toBe(before + 200);
  });

  it("customers cancel only before work starts; the full amount returns exactly once", async () => {
    const { c, order } = await placed();
    await cancelOwnOrder(db, actorOf(c), order.reference);
    await cancelOwnOrder(db, actorOf(c), order.reference); // repeat is harmless
    expect(await getOwnOrder(db, c.customer.id, order.reference)).toMatchObject({ status: "cancelled", paymentStatus: "released" });
    expect((await walletSummary(db, c.customer.id)).availableCents).toBe(10_000);
    const releases = await db.execute<{ n: number }>(sql`select count(*)::int as n from journal_entries where kind = 'order_cancel' and reference_id = ${order.reference}`);
    expect(releases.rows[0].n).toBe(1);

    const second = await placed();
    const ops = await makeStaff(db, "orders");
    await approveOrder(db, { userId: ops.user.id }, second.order.reference);
    expect(await codeOf(cancelOwnOrder(db, actorOf(second.c), second.order.reference))).toBe("CONFLICT");
  });

  it("rejection and pre-start failure return funds; failure after start holds them for refund review", async () => {
    const ops = await makeStaff(db, "orders");
    const s = { userId: ops.user.id };
    const a = await placed();
    expect(await codeOf(rejectOrder(db, s, a.order.reference, { reason: "no" }))).toBe("ZOD");
    await rejectOrder(db, s, a.order.reference, { reason: "The target account is private." });
    expect(await getOwnOrder(db, a.c.customer.id, a.order.reference)).toMatchObject({ status: "rejected", paymentStatus: "released", statusReason: "The target account is private." });
    expect((await walletSummary(db, a.c.customer.id)).availableCents).toBe(10_000);

    const b = await placed();
    await approveOrder(db, s, b.order.reference);
    await failOrder(db, s, b.order.reference, { reason: "Couldn't start this order." });
    expect(await getOwnOrder(db, b.c.customer.id, b.order.reference)).toMatchObject({ status: "cancelled", paymentStatus: "released" });

    const d = await placed();
    await approveOrder(db, s, d.order.reference);
    await assignOrder(db, s, d.order.reference, {});
    await startFulfillment(db, s, d.order.reference, { fulfillmentRef: "MAN-0003" });
    await failOrder(db, s, d.order.reference, { reason: "Delivery stopped part way through." });
    expect(await getOwnOrder(db, d.c.customer.id, d.order.reference)).toMatchObject({ status: "failed", paymentStatus: "refund_review" });
    expect((await walletSummary(db, d.c.customer.id)).availableCents).toBe(9_800); // not silently refunded
    expect((await getOrderForStaff(db, d.order.reference))!.blockers.join(" ")).toMatch(/Refunds aren't enabled/);
    expect(() => requestRefund({ orderRef: d.order.reference, amountCents: 200, reason: "Delivery stopped part way through." })).toThrow(/Refunds/);
  });

  it("information requests: the customer updates details and the order returns to review", async () => {
    const { c, order } = await placed();
    const ops = await makeStaff(db, "orders");
    expect(await codeOf(updateOwnOrderDetails(db, actorOf(c), order.reference, { link: "https://instagram.com/new" }))).toBe("CONFLICT");
    await requestOrderInfo(db, { userId: ops.user.id }, order.reference, { message: "Your profile is private — please make it public." });
    expect(await getOwnOrder(db, c.customer.id, order.reference)).toMatchObject({ status: "needs_customer_action", canUpdateDetails: true, statusReason: expect.stringMatching(/private/) });
    expect(await codeOf(updateOwnOrderDetails(db, actorOf(c), order.reference, { link: "ftp://x" }))).toBe("VALIDATION_FAILED:link");
    const updated = await updateOwnOrderDetails(db, actorOf(c), order.reference, { link: "https://instagram.com/new-public" });
    expect(updated).toMatchObject({ status: "pending_review", link: "https://instagram.com/new-public", totalCents: 200 });
  });

  it("notes refuse credentials; assignment needs an order manager", async () => {
    const { order } = await placed();
    const ops = await makeStaff(db, "orders");
    const support = await makeStaff(db, "support");
    await addOrderNote(db, { userId: ops.user.id }, order.reference, { body: "Customer prefers a slow drip." });
    expect(await codeOf(addOrderNote(db, { userId: ops.user.id }, order.reference, { body: "api_key=abc" }))).toBe("VALIDATION_FAILED:body");
    expect(await codeOf(assignOrder(db, { userId: ops.user.id }, order.reference, { assigneeUserId: support.user.id }))).toBe("VALIDATION_FAILED:assigneeUserId");
  });
});

describe("authorization & routes", () => {
  it("customers see only their own orders; placing needs sign-in, same-origin and a key", async () => {
    const { order } = await placed();
    const other = await makeCustomer(db);
    expect(await getOwnOrder(db, other.customer.id, order.reference)).toBeNull();
    expect(await codeOf(cancelOwnOrder(db, actorOf(other), order.reference))).toBe("NOT_FOUND");
    signInAs("customer", other.token);
    expect((await call(myOrder, "/x", {}, { params: Promise.resolve({ ref: order.reference }) })).status).toBe(404);
    expect(((await (await call(myOrders)).json()) as { total: number }).total).toBe(0);
    jar.clear();
    expect((await call(myOrders)).status).toBe(401);
    const c = await funded(10_000);
    signInAs("customer", c.token);
    const b = JSON.stringify(body());
    expect((await call(placeOrderRoute, "/x", { method: "POST", body: b, headers: { origin: "https://evil.example", "idempotency-key": key() } })).status).toBe(403);
    expect((await call(placeOrderRoute, "/x", { method: "POST", body: b })).status).toBe(400);
    expect((await call(placeOrderRoute, "/x", { method: "POST", body: b, headers: { "idempotency-key": key() } })).status).toBe(201);
  });

  it("staff need Orders: Manage; money-moving actions need re-authentication", async () => {
    const { order } = await placed();
    const ctx = (action: string) => ({ params: Promise.resolve({ ref: order.reference, action }) });
    const post = (action: string, b: object = {}) => call(orderAction, "/x", { method: "POST", body: JSON.stringify(b) }, ctx(action));
    const support = await makeStaff(db, "support");
    signInAs("staff", support.token);
    expect([200, 403]).toContain((await call(staffOrders)).status);
    expect((await post("approve")).status).toBe(403);
    const ops = await makeStaff(db, "orders");
    signInAs("staff", ops.token);
    expect((await call(staffOrders)).status).toBe(200);
    expect((await post("teleport")).status).toBe(404);
    const rej = await post("reject", { reason: "The target account is private." });
    expect(rej.status).toBe(403);
    expect(((await rej.json()) as { error: { code: string } }).error.code).toBe("REAUTH_REQUIRED");
    expect((await post("approve")).status).toBe(200);
    expect((await call(orderAction, "/x", { method: "POST", body: "{}", headers: { origin: "https://evil.example" } }, ctx("assign"))).status).toBe(403);
    await markReauthenticated(db, ops.sessionId);
    expect((await post("cancel", { reason: "Customer asked us to stop." })).status).toBe(200);
  });
});

describe("reconciliation with orders", () => {
  it("charges, releases, committed funds and revenue all reconcile", async () => {
    const r = await reconcile(db);
    // Test wallets here are funded by fixtures without deposit records; only those may be flagged.
    expect(r.exceptions.filter((e) => e.code !== "orphan_deposit_credit")).toEqual([]);
    expect(r.summary.committedToOrdersCents).toBeGreaterThan(0);
  });
});
