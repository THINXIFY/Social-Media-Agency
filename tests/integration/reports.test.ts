import { randomUUID } from "node:crypto";
import { count, eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { GET as overviewGet } from "@/app/api/admin/overview/route";
import { GET as exportGet } from "@/app/api/admin/reports/export/route";
import { GET as reportGet } from "@/app/api/admin/reports/route";
import { GET as settingsGet } from "@/app/api/admin/settings/route";
import { POST as reportingPost } from "@/app/api/admin/settings/reporting/route";
import { zonedMidnight } from "@/lib/admin-overview";
import { createDb, type Db } from "@/server/db/client";
import { auditLog, customers, platformSettings, serviceEligibility, servicePriceVersions, sessions } from "@/server/db/schema";
import { getEnv, resetEnvCache } from "@/server/env";
import { approveOrder, assignOrder, completeOrder, createOrder, startFulfillment } from "@/server/orders/orders";
import { REPORTING_KEY } from "@/server/settings/reporting";
import { runMigrations } from "../../scripts/db/migrate";
import { seedReferenceData } from "../../scripts/db/seed";
import { makeCustomer, makeStaff, signInAs } from "./auth-helpers";
import { fundWallet } from "./helpers";

vi.mock("next/headers", async () => (await import("./auth-helpers")).jarMock());
vi.mock("next/server", () => ({ connection: async () => {} }));
// A small export cap keeps the size-limit test fast; the real cap is 10,000 rows.
vi.mock("@/lib/reports", async (orig) => ({ ...(await orig<typeof import("@/lib/reports")>()), EXPORT_MAX_ROWS: 25 }));

/* Phase 5H-B Reports, exports and settings against a scratch database with controlled fixtures. */
const scratch = `socivanta_reports_test_${Date.now()}`;
let db: Db;
let admin: Client;
const SVC = "instagram-followers";
let orderTotal = 0;
let grossTotal = 0;

beforeAll(async () => {
  admin = new Client({ connectionString: inject("adminUrl") });
  await admin.connect();
  await admin.query(`create database ${scratch} encoding 'UTF8' template template0`);
  const u = new URL(inject("adminUrl"));
  u.pathname = `/${scratch}`;
  await runMigrations(u.toString());
  process.env.DATABASE_URL = u.toString();
  process.env.REVENUE_RECOGNITION_POLICY = "on_completion";
  resetEnvCache();
  db = createDb(u.toString());
  await seedReferenceData(db);

  const now = new Date(Date.now() - 60_000);
  await db.insert(platformSettings).values({ key: "commerce.checkout_enabled", value: true });
  await db.insert(servicePriceVersions).values({ serviceId: SVC, pricingModel: "per1000", costMicros: 1, priceMicros: 2_000_000, minQty: 100, maxQty: 100_000, effectiveFrom: now });
  const gates = { policyReviewedAt: now, supplierVerifiedAt: now, fulfillmentVerifiedAt: now, paymentAcceptedAt: now, legalReviewedAt: now, technicalReadyAt: now };
  await db.insert(serviceEligibility).values({ serviceId: SVC, ...gates }).onConflictDoUpdate({ target: serviceEligibility.serviceId, set: gates });
  const a = await makeCustomer(db);
  const b = await makeCustomer(db);
  // A display name a spreadsheet would execute, to prove exports neutralise it.
  await db.update(customers).set({ displayName: '=HYPERLINK("http://evil.example","x")' }).where(eq(customers.id, b.customer.id));
  await fundWallet(db, a.customer.id, 10_000);
  await fundWallet(db, b.customer.id, 5_000);
  const ops = await makeStaff(db, "orders");
  const s = { userId: ops.user.id };
  const first = await createOrder(db, { userId: a.user.id, customerId: a.customer.id }, { serviceId: SVC, quantity: 1000, link: "https://instagram.com/a", details: {} }, `o_${randomUUID().replace(/-/g, "")}`);
  const second = await createOrder(db, { userId: b.user.id, customerId: b.customer.id }, { serviceId: SVC, quantity: 500, link: "https://instagram.com/b", details: {} }, `o_${randomUUID().replace(/-/g, "")}`);
  orderTotal = first.order.totalCents;
  grossTotal = first.order.totalCents + second.order.totalCents;
  await approveOrder(db, s, first.order.reference);
  await assignOrder(db, s, first.order.reference, {});
  await startFulfillment(db, s, first.order.reference, { fulfillmentRef: "MAN-0001" });
  await completeOrder(db, s, first.order.reference, { evidenceNote: "Delivered 1,000 followers, checked on the profile.", evidenceUrl: "https://instagram.com/a", checks: { deliveredAsOrdered: true, verifiedOnTarget: true } });
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
const get = (fn: unknown, q: string) => (fn as (r: Request, c: unknown) => Promise<Response>)(new Request(`${ORIGIN}/api/x?${q}`), {});
const post = (fn: unknown, body: unknown, origin = ORIGIN) => (fn as (r: Request, c: unknown) => Promise<Response>)(new Request(`${ORIGIN}/api/x`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin } }), {});
const csvRows = (text: string) => text.replace(/^﻿/, "").trim().split("\r\n");
const owner = async () => {
  const o = await makeStaff(db, "owner");
  signInAs("staff", o.token);
  return o;
};

describe("reports reconcile with each other and with 5H-A", () => {
  it("orders: KPIs, chart, table and CSV agree, with filters applied to all", async () => {
    await owner();
    const r = await (await get(reportGet, "report=orders&range=7d")).json();
    const placed = r.kpis.find((k: { id: string }) => k.id === "placed");
    expect(placed.value).toBe(2);
    expect(r.kpis.find((k: { id: string }) => k.id === "value").value).toBe(grossTotal);
    expect(r.series[0].points.reduce((a: number, p: { value: number }) => a + p.value, 0)).toBe(2);
    expect(r.table.total).toBe(2);
    const csv = await get(exportGet, "report=orders&range=7d");
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toMatch(/text\/csv/);
    expect(csv.headers.get("content-disposition")).toMatch(/attachment; filename="sociotix-orders-/);
    expect(csv.headers.get("cache-control")).toMatch(/no-store/);
    const lines = csvRows(await csv.text());
    expect(lines[0]).toBe("order_ref,placed_at_utc,service,platform,category,quantity,order_value_usd,status");
    expect(lines).toHaveLength(3);
    const usd = lines.slice(1).reduce((a, l) => a + Number(l.split(",")[6]) * 100, 0);
    expect(Math.round(usd)).toBe(grossTotal);
    expect(lines[1]).toMatch(/,\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z,/);

    const done = await (await get(reportGet, "report=orders&range=7d&status=completed")).json();
    expect(done.table.total).toBe(1);
    expect(done.series[0].points.reduce((a: number, p: { value: number }) => a + p.value, 0)).toBe(1);
    expect(csvRows(await (await get(exportGet, "report=orders&range=7d&status=completed")).text())).toHaveLength(2);
  });

  it("financial: revenue, order value, funding and wallets stay separate and match the Overview", async () => {
    await owner();
    const r = await (await get(reportGet, "report=financial&range=7d")).json();
    const k = Object.fromEntries(r.kpis.map((x: { id: string; value: number }) => [x.id, x.value]));
    expect(k).toMatchObject({ revenue: orderTotal, funding: 15_000, order_value: grossTotal, wallets: 15_000 - grossTotal, committed: grossTotal - orderTotal });
    const o = await (await get(overviewGet, "range=7d")).json();
    expect(o.finance.revenueCents.value).toBe(k.revenue);
    expect(o.finance.fundingCents.value).toBe(k.funding);
    expect(o.finance.walletLiabilitiesCents).toBe(k.wallets);
    expect(r.notes.join(" ")).toMatch(/Profit and margin aren't shown/);
  });

  it("support, referrals and AI reports are honest when there's no data", async () => {
    await owner();
    const s = await (await get(reportGet, "report=support&range=30d")).json();
    expect(s.kpis.find((x: { id: string }) => x.id === "first_response")).toBeUndefined();
    expect(s.notes.join(" ")).toMatch(/no first-response time/);
    const ai = await (await get(reportGet, "report=ai&range=30d")).json();
    expect(ai.kpis.find((x: { id: string }) => x.id === "tokens")).toBeUndefined();
    expect(ai.kpis.find((x: { id: string }) => x.id === "cost").hint).toMatch(/not a provider invoice/);
    const ref = await (await get(reportGet, "report=referrals&range=30d")).json();
    expect(ref.notes.join(" ")).toMatch(/locked/);
  });
});

describe("CSV safety", () => {
  it("neutralises spreadsheet formulas and never includes emails", async () => {
    await owner();
    const text = await (await get(exportGet, "report=customers&range=7d")).text();
    expect(text).toContain(`"'=HYPERLINK(""http://evil.example"",""x"")"`);
    expect(text).not.toMatch(/@example\.test/);
    expect(csvRows(text)[0]).toBe("customer_ref,name,joined_at_utc,email_confirmed,orders");
  });

  it("refuses exports over the size limit and asks for a narrower range", async () => {
    await owner();
    for (let i = 0; i < 24; i++) await makeCustomer(db);
    const res = await get(exportGet, "report=customers&range=7d");
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/limit is 25.*Narrow the date range/);
  });

  it("rate-limits exports and audits each one without personal data", async () => {
    const o = await owner();
    const before = (await db.select({ n: count() }).from(auditLog).where(eq(auditLog.action, "report.exported")))[0].n;
    for (let i = 0; i < 10; i++) expect((await get(exportGet, "report=orders&range=7d&q=ORD")).status, `export ${i}`).toBe(200);
    expect((await get(exportGet, "report=orders&range=7d")).status).toBe(429);
    const entries = await db.select().from(auditLog).where(eq(auditLog.action, "report.exported"));
    expect(entries.length - before).toBe(10);
    const last = entries.find((e) => e.actorUserId === o.user.id)!;
    expect(last.after).toMatchObject({ report: "orders", rows: 2, filters: { q: "ORD" } });
    expect(JSON.stringify(entries)).not.toMatch(/@example\.test|HYPERLINK/);
  });
});

describe("permissions", () => {
  it("support staff can't read or export financial, AI or settings data", async () => {
    const s = await makeStaff(db, "support");
    signInAs("staff", s.token);
    expect((await get(reportGet, "report=customers&range=7d")).status).toBe(200);
    expect((await get(reportGet, "report=orders&range=7d")).status).toBe(200);
    for (const id of ["financial", "ai"]) {
      expect((await get(reportGet, `report=${id}&range=7d`)).status, id).toBe(403);
      expect((await get(exportGet, `report=${id}&range=7d`)).status, id).toBe(403);
    }
    expect((await get(settingsGet, "")).status).toBe(403);
    const biz = await (await get(reportGet, "report=business&range=7d")).json();
    expect(biz.kpis.map((k: { id: string }) => k.id)).not.toContain("revenue");
    expect(biz.series.map((s: { title: string }) => s.title).join()).not.toMatch(/funding/i);
    expect(JSON.stringify(biz)).not.toMatch(/walletLiabilities|fundingCents|revenueCents/);
    const custs = await (await get(reportGet, "report=customers&range=7d")).text();
    expect(custs).not.toMatch(/@example\.test/);
  });

  it("validates report requests", async () => {
    await owner();
    for (const q of ["report=nope", "report=orders&range=custom&from=2026-02-30&to=2026-03-01", "report=orders&range=custom&from=2999-01-01&to=2999-01-02"]) expect((await get(reportGet, q)).status, q).toBe(400);
    expect((await get(reportGet, "report=orders&range=7d&page=999")).status).toBe(200); // clamped to the last page
  });
});

describe("platform settings", () => {
  it("exposes configuration without secrets", async () => {
    await owner();
    const res = await get(settingsGet, "");
    expect(res.status).toBe(200);
    const text = await res.text();
    const env = getEnv() as unknown as Record<string, unknown>;
    for (const k of ["AUTH_SECRET", "DATA_ENCRYPTION_KEY", "EMAIL_API_KEY", "AI_API_KEY"]) if (typeof env[k] === "string" && (env[k] as string).length > 6) expect(text, k).not.toContain(env[k] as string);
    const body = JSON.parse(text);
    expect(body.financial.revenuePolicy).toBe("on_completion");
    expect(body.general.reporting).toMatchObject({ timezone: "UTC", defaultRange: "30d", version: 0 });
    expect(body.can.manage).toBe(true);
  });

  it("saves reporting preferences only with Settings: Manage, re-authentication and a current version, and audits them", async () => {
    const fin = await makeStaff(db, "finance");
    signInAs("staff", fin.token);
    expect((await post(reportingPost, { value: { timezone: "UTC", defaultRange: "7d" }, version: 0 })).status).toBe(403);

    const o = await owner();
    expect((await (await post(reportingPost, { value: { timezone: "Europe/London", defaultRange: "7d" }, version: 0 })).json()).error.code).toBe("REAUTH_REQUIRED");
    await db.update(sessions).set({ reauthenticatedAt: new Date() }).where(eq(sessions.id, o.sessionId));
    expect((await post(reportingPost, { value: { timezone: "Europe/London", defaultRange: "7d" }, version: 0 }, "https://evil.example")).status).toBe(403);
    expect((await post(reportingPost, { value: { timezone: "Mars/Olympus", defaultRange: "7d" }, version: 0 })).status).toBe(400);
    expect((await post(reportingPost, { value: { timezone: "Europe/London", defaultRange: "1y" }, version: 0 })).status).toBe(400);
    expect((await post(reportingPost, { value: { timezone: "America/New_York", defaultRange: "7d" }, version: 0 })).status).toBe(200);
    expect((await post(reportingPost, { value: { timezone: "UTC", defaultRange: "7d" }, version: 0 })).status).toBe(409);
    const [a] = await db.select().from(auditLog).where(eq(auditLog.action, "settings.reporting_saved"));
    expect(a).toMatchObject({ actorUserId: o.user.id, before: { timezone: "UTC", defaultRange: "30d" }, after: { timezone: "America/New_York", defaultRange: "7d" } });

    // Overview and Reports now use the saved default range and timezone.
    const ov = await (await get(overviewGet, "")).json();
    expect(ov.range).toMatchObject({ preset: "7d", timezone: "America/New_York" });
    expect(ov.range.label).toMatch(/America\/New_York, GMT-[45]/);
    const rep = await (await get(reportGet, "report=customers")).json();
    expect(rep.range).toMatchObject({ preset: "7d", timezone: "America/New_York" });
  });

  it("cuts days at local midnight in the reporting timezone", async () => {
    await owner();
    const tz = "America/New_York";
    const rep = await (await get(reportGet, "report=customers&range=7d")).json();
    const start = zonedMidnight(rep.range.from, tz);
    const inside = await makeCustomer(db);
    const outside = await makeCustomer(db);
    await db.update(customers).set({ createdAt: start }).where(eq(customers.id, inside.customer.id));
    await db.update(customers).set({ createdAt: new Date(start.getTime() - 1) }).where(eq(customers.id, outside.customer.id));
    const r = await (await get(reportGet, "report=customers&range=7d")).json();
    const fresh = r.kpis.find((k: { id: string }) => k.id === "new").value;
    expect(r.series[0].points.reduce((a: number, p: { value: number }) => a + p.value, 0)).toBe(fresh);
    expect(r.series[0].points[0].value).toBe(1); // the customer at local midnight lands on the first local day
    expect(r.table.total).toBe(fresh);
    const [{ n }] = (await db.execute<{ n: string }>(sql`select count(*)::text as n from customers where created_at >= ${start}`)).rows;
    expect(fresh).toBe(Number(n));
    await db.delete(platformSettings).where(eq(platformSettings.key, REPORTING_KEY));
  });
});
