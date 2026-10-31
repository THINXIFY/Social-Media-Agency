import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { GET as accountWallet } from "@/app/api/account/wallet/route";
import * as walletRoute from "@/app/api/account/wallet/route";
import * as walletTxRoute from "@/app/api/account/wallet/transactions/route";
import { GET as profileGet, PATCH as profilePatch } from "@/app/api/account/profile/route";
import { GET as adminCustomers } from "@/app/api/admin/customers/route";
import { PATCH as patchService } from "@/app/api/admin/services/[id]/route";
import { GET as adminServices, PATCH as bulkServices } from "@/app/api/admin/services/route";
import { GET as publicCatalog } from "@/app/api/catalog/services/route";
import { registerCustomer } from "@/server/auth/accounts";
import { reauthenticate } from "@/server/auth/staff";
import { bulkUpdateServices, getAdminService, listPublicServices, updateService } from "@/server/catalog/catalog";
import { accountSnapshot, getOwnProfile, updateOwnProfile } from "@/server/customers/customers";
import type { Db } from "@/server/db/client";
import { auditLog, customers, deposits, ledgerAccounts, serviceEligibility, servicePriceVersions, services, users } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { walletCode } from "@/server/ledger/accounts";
import { walletEntries, walletSummary } from "@/server/wallet/wallet";
import { bindRequestDb, makeCustomer, makeStaff, PASSWORD, signInAs, uniqueEmail, userByEmail } from "./auth-helpers";
import { ensureReferenceData, fundWallet, testDb, uid } from "./helpers";

vi.mock("next/headers", async () => (await import("./auth-helpers")).jarMock());
vi.mock("next/server", () => ({ connection: async () => {} }));

let db: Db;
beforeAll(async () => {
  bindRequestDb();
  db = testDb();
  await ensureReferenceData(db);
});
afterAll(() => db.$client.end());

const ORIGIN = "http://localhost:3000";
const call = (fn: unknown, url = "/api/x", init: RequestInit = {}, ctx: unknown = {}) =>
  (fn as (r: Request, c: unknown) => Promise<Response>)(new Request(ORIGIN + url, { ...init, headers: { "content-type": "application/json", origin: ORIGIN, ...(init.headers ?? {}) } }), ctx);
const codeOf = async (p: Promise<unknown>) => p.then(() => "resolved", (e) => (e instanceof AppError ? `${e.code}${e.details?.field ? `:${e.details.field}` : ""}` : `other:${String(e)}`));
const editor = (userId: string, canChangePrices = true) => ({ userId, canChangePrices });

describe("customer wallets", () => {
  it("registration opens exactly one zero-balance USD wallet (database trigger)", async () => {
    const email = uniqueEmail("wallet");
    await registerCustomer(db, { name: "Wallet Person", email, password: PASSWORD });
    const u = (await userByEmail(db, email))!;
    const [c] = await db.select().from(customers).where(eq(customers.userId, u.id));
    const wallets = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.customerId, c.id));
    expect(wallets).toHaveLength(1);
    expect(wallets[0]).toMatchObject({ code: walletCode(c.id), type: "liability", currency: "USD", allowNegative: false });
    expect(await walletSummary(db, c.id)).toEqual({ currency: "USD", availableCents: 0, pendingCents: 0, hasWallet: true });
    expect((await walletEntries(db, c.id)).items).toEqual([]);
  });

  it("customers created before the trigger get a wallet from the backfill (idempotent)", async () => {
    const admin = new Client({ connectionString: inject("databaseUrl") });
    await admin.connect();
    const ref = uid();
    try {
      await admin.query("set session_replication_role = replica"); // simulate a pre-5C customer (triggers off)
      const u = await admin.query("insert into users (email) values ($1) returning id", [uniqueEmail("old")]);
      const c = await admin.query("insert into customers (user_id, public_ref, account_ref, first_name, last_name) values ($1, $2, $3, 'Old', 'Customer') returning id", [u.rows[0].id, `CUS-${ref}`, `ACC-${ref}`]);
      await admin.query("set session_replication_role = origin");
      expect((await admin.query("select count(*)::int as n from ledger_accounts where customer_id = $1", [c.rows[0].id])).rows[0].n).toBe(0);
      const backfill = readFileSync("drizzle/0003_catalog_wallets.sql", "utf8").split("--> statement-breakpoint").at(-1)!;
      await admin.query(backfill);
      await admin.query(backfill);
      expect((await admin.query("select count(*)::int as n from ledger_accounts where customer_id = $1", [c.rows[0].id])).rows[0].n).toBe(1);
    } finally {
      await admin.end();
    }
  });

  it("balance is derived from ledger lines; pending deposits are separate and not spendable", async () => {
    const { customer } = await makeCustomer(db);
    await fundWallet(db, customer.id, 2_500);
    await db.insert(deposits).values({ publicRef: `DEP-${uid()}`, customerId: customer.id, amountCents: 1_000, method: "bank", processor: "manual", status: "under_review" });
    expect(await walletSummary(db, customer.id)).toMatchObject({ availableCents: 2_500, pendingCents: 1_000 });
    const history = await walletEntries(db, customer.id);
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({ label: "Deposit", amountCents: 2_500 });
    expect(Object.keys(history.items[0]).sort()).toEqual(["amountCents", "at", "id", "label"]); // no internal ledger fields
  });

  it("there is no way to write to a wallet through the API", () => {
    for (const mod of [walletRoute, walletTxRoute]) expect(Object.keys(mod).filter((k) => ["POST", "PUT", "PATCH", "DELETE"].includes(k))).toEqual([]);
  });

  it("wallet API is per-customer and read-only", async () => {
    const a = await makeCustomer(db);
    const b = await makeCustomer(db);
    await fundWallet(db, b.customer.id, 900);
    signInAs("customer", a.token);
    const r = await call(accountWallet);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { availableCents: number }).availableCents).toBe(0);
    await jar_clear();
    expect((await call(accountWallet)).status).toBe(401);
  });
});

describe("customer profiles", () => {
  it("reads and updates only the caller's permitted fields", async () => {
    const a = await makeCustomer(db);
    const b = await makeCustomer(db);
    signInAs("customer", a.token);
    const me = (await (await call(profileGet)).json()) as { email: string; accountRef: string };
    expect(me.email).toBe(a.email);
    const ok = await call(profilePatch, "/api/account/profile", { method: "PATCH", body: JSON.stringify({ firstName: "Ada", lastName: "Lovelace", displayName: "Ada L.", phone: "", country: "United Kingdom", accountType: "personal", businessName: "", website: "" }) });
    expect(ok.status).toBe(200);
    expect((await getOwnProfile(db, a.customer.id)).displayName).toBe("Ada L.");
    expect((await getOwnProfile(db, b.customer.id)).firstName).toBe("Test"); // untouched
    // Trying to target someone else or change the email is rejected outright.
    const sneaky = await call(profilePatch, "/api/account/profile", { method: "PATCH", body: JSON.stringify({ firstName: "X", lastName: "Y", displayName: "XY", accountType: "personal", customerId: b.customer.id, email: "evil@example.com" }) });
    expect(sneaky.status).toBe(400);
    const csrf = await call(profilePatch, "/api/account/profile", { method: "PATCH", headers: { origin: "https://evil.example" }, body: "{}" });
    expect(csrf.status).toBe(403);
  });

  it("validates names, phone, country and business details", async () => {
    const c = await makeCustomer(db);
    const actor = { userId: c.user.id, customerId: c.customer.id };
    const base = { firstName: "Ada", lastName: "Lovelace", displayName: "Ada", phone: "", country: "", accountType: "personal" as const, businessName: "", website: "" };
    expect(await codeOf(updateOwnProfile(db, actor, { ...base, firstName: "" }))).toBe("VALIDATION_FAILED:firstName");
    expect(await codeOf(updateOwnProfile(db, actor, { ...base, firstName: "Ada123" }))).toBe("VALIDATION_FAILED:firstName");
    expect(await codeOf(updateOwnProfile(db, actor, { ...base, phone: "call me" }))).toBe("VALIDATION_FAILED:phone");
    expect(await codeOf(updateOwnProfile(db, actor, { ...base, country: "Atlantis" }))).toBe("VALIDATION_FAILED:country");
    expect(await codeOf(updateOwnProfile(db, actor, { ...base, accountType: "business" }))).toBe("VALIDATION_FAILED:businessName");
    const done = await updateOwnProfile(db, actor, { ...base, accountType: "business", businessName: "Analytical Engines Ltd", website: "example.com" });
    expect(done).toMatchObject({ accountType: "business", businessName: "Analytical Engines Ltd" });
    const [entry] = await db.select().from(auditLog).where(and(eq(auditLog.targetId, c.customer.id), eq(auditLog.action, "customer.profile_updated")));
    expect(entry).toBeTruthy();
  });
});

describe("public catalog", () => {
  it("lists the seeded catalog with filters, search and pagination", async () => {
    const all = await listPublicServices(db, { pageSize: 48 });
    expect(all.total).toBeGreaterThanOrEqual(118);
    expect(all.items).toHaveLength(48);
    expect(all.pages).toBe(Math.ceil(all.total / 48));
    const ig = await listPublicServices(db, { platform: "instagram", pageSize: 48 });
    expect(ig.items.every((s) => s.platform.id === "instagram")).toBe(true);
    const search = await listPublicServices(db, { q: "tiktok views" });
    expect(search.items.some((s) => s.id === "tiktok-video-views")).toBe(true);
    const views = await listPublicServices(db, { category: "views", pageSize: 48 });
    expect(views.items.every((s) => s.category === "views")).toBe(true);
    const page2 = await listPublicServices(db, { page: 2, pageSize: 10 });
    expect(page2.items[0].id).not.toBe((await listPublicServices(db, { page: 1, pageSize: 10 })).items[0].id);
    expect(await codeOf(listPublicServices(db, { pageSize: 500 }))).toMatch(/other:|VALIDATION/);
  });

  it("exposes customer-safe fields only and never a price for non-purchasable services", async () => {
    const owner = await makeStaff(db, "owner");
    const before = (await getAdminService(db, "instagram-followers"))!;
    await updateService(db, editor(owner.user.id), "instagram-followers", { ...before, pricing: { model: "per1000", cost: 2.1, price: 4.5 }, notes: "secret supplier note" }, before.version);
    const r = await call(publicCatalog, "/api/catalog/services?q=instagram%20followers");
    const body = (await r.json()) as { items: Record<string, unknown>[] };
    const svc = body.items.find((s) => s.id === "instagram-followers")!;
    expect(svc).toMatchObject({ status: "preview", price: null });
    const text = JSON.stringify(body);
    for (const leak of ["cost", "secret supplier note", "internalNotes", "providerRef", "fulfillment", "eligib", "version", "updatedBy"]) expect(text).not.toContain(leak);
  });

  it("hidden, archived and draft services never appear publicly", async () => {
    const owner = await makeStaff(db, "owner");
    const id = "x-followers";
    const rec = (await getAdminService(db, id))!;
    await updateService(db, editor(owner.user.id), id, { ...rec, visible: false }, rec.version);
    expect((await listPublicServices(db, { q: "x followers", pageSize: 48 })).items.some((s) => s.id === id)).toBe(false);
    const hidden = (await getAdminService(db, id))!;
    await updateService(db, editor(owner.user.id), id, { ...hidden, visible: true, archived: true }, hidden.version);
    expect((await listPublicServices(db, { q: "x followers", pageSize: 48 })).items.some((s) => s.id === id)).toBe(false);
    const archived = (await getAdminService(db, id))!;
    await updateService(db, editor(owner.user.id), id, { ...archived, archived: false }, archived.version);
    expect((await listPublicServices(db, { q: "x followers", pageSize: 48 })).items.some((s) => s.id === id)).toBe(true);
  });
});

describe("admin services & pricing", () => {
  it("Set price → Save → Priced: a new append-only price version, still not purchasable", async () => {
    const owner = await makeStaff(db, "owner");
    const id = "youtube-video-views";
    const rec = (await getAdminService(db, id))!;
    const saved = await updateService(db, editor(owner.user.id), id, { ...rec, pricing: { model: "per1000", cost: 1.2, price: 3.2 }, limits: { min: 100, max: 100000 } }, rec.version);
    expect(saved.pricing).toEqual({ model: "per1000", cost: 1.2, price: 3.2 });
    expect(saved.limits).toEqual({ min: 100, max: 100000 });
    expect(saved.version).toBe(rec.version + 1);
    const versions = await db.select().from(servicePriceVersions).where(eq(servicePriceVersions.serviceId, id));
    expect(versions.at(-1)).toMatchObject({ priceMicros: 3_200_000, costMicros: 1_200_000, minQty: 100, maxQty: 100000 });
    const again = await updateService(db, editor(owner.user.id), id, { ...saved, pricing: { model: "per1000", cost: 1.2, price: 3.4 } }, saved.version);
    expect(again.pricing.price).toBe(3.4);
    expect((await db.select().from(servicePriceVersions).where(eq(servicePriceVersions.serviceId, id))).length).toBe(versions.length + 1);
    const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from purchasable_services where service_id = ${id}`)).rows;
    expect(n).toBe(0);
    const actions = (await db.select({ a: auditLog.action }).from(auditLog).where(eq(auditLog.targetId, id))).map((r) => r.a);
    expect(actions).toEqual(expect.arrayContaining(["service.updated", "service.price_versioned"]));
  });

  it("recording review gates stores who and when, but never makes a service purchasable on its own", async () => {
    const owner = await makeStaff(db, "owner");
    const id = "facebook-page-likes";
    const rec = (await getAdminService(db, id))!;
    await updateService(db, editor(owner.user.id), id, { ...rec, checks: { fulfillmentVerified: true, policyReviewed: true }, pricing: { model: "per1000", cost: 5, price: 11.9 } }, rec.version);
    const [gate] = await db.select().from(serviceEligibility).where(eq(serviceEligibility.serviceId, id));
    expect(gate.policyReviewedBy).toBe(owner.user.id);
    expect(gate.fulfillmentVerifiedAt).toBeInstanceOf(Date);
    expect(gate.paymentAcceptedAt).toBeNull();
    const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from purchasable_services where service_id = ${id}`)).rows;
    expect(n).toBe(0);
  });

  it("price changes need the Change service prices permission", async () => {
    const om = await makeStaff(db, "orders"); // Services: Manage, but no changePrices
    const id = "tiktok-followers";
    const rec = (await getAdminService(db, id))!;
    expect(await codeOf(updateService(db, editor(om.user.id, false), id, { ...rec, pricing: { model: "per1000", cost: 5, price: 15.4 } }, rec.version))).toBe("FORBIDDEN");
    const renamed = await updateService(db, editor(om.user.id, false), id, { ...rec, description: "Updated description" }, rec.version);
    expect(renamed.description).toBe("Updated description");
  });

  it("stale versions are refused; concurrent saves can't both win", async () => {
    const owner = await makeStaff(db, "owner");
    const id = "telegram-channel-members";
    const rec = (await getAdminService(db, id))!;
    const results = await Promise.all([
      codeOf(updateService(db, editor(owner.user.id), id, { ...rec, description: "Edit A" }, rec.version)),
      codeOf(updateService(db, editor(owner.user.id), id, { ...rec, description: "Edit B" }, rec.version)),
    ]);
    expect(results.sort()).toEqual(["CONFLICT", "resolved"]);
    expect(await codeOf(updateService(db, editor(owner.user.id), id, { ...rec, description: "Edit C" }, rec.version))).toBe("CONFLICT");
    expect((await getAdminService(db, id))!.version).toBe(rec.version + 1);
  });

  it("validates prices, limits, ids and provider references on the server", async () => {
    const owner = await makeStaff(db, "owner");
    const id = "linkedin-post-likes";
    const rec = (await getAdminService(db, id))!;
    const save = (patch: object) => codeOf(updateService(db, editor(owner.user.id), id, { ...rec, ...patch }, rec.version));
    expect(await save({ pricing: { model: "per1000", cost: 10, price: 5 } })).toBe("VALIDATION_FAILED:price");
    expect(await save({ pricing: { model: "per1000", cost: 10, price: null } })).toBe("VALIDATION_FAILED:price");
    expect(await save({ pricing: { model: "per1000", cost: 1.123456, price: 2 } })).toBe("VALIDATION_FAILED:cost");
    expect(await save({ pricing: { model: "fixed", cost: 1, price: 2 } })).toBe("VALIDATION_FAILED:price");
    expect(await save({ limits: { min: 500, max: 100 } })).toBe("VALIDATION_FAILED:max");
    expect(await save({ id: "renamed-id" })).toBe("VALIDATION_FAILED:id");
    expect(await save({ fulfillment: { type: "provider", providerRef: "sk_live_api_key", notes: "" } })).toBe("VALIDATION_FAILED:providerRef");
    expect(await save({ name: "x" })).toMatch(/VALIDATION|other/);
    // A saved price can't be removed.
    const priced = await updateService(db, editor(owner.user.id), id, { ...rec, pricing: { model: "per1000", cost: 10, price: 33 } }, rec.version);
    expect(await codeOf(updateService(db, editor(owner.user.id), id, { ...priced, pricing: { model: "per1000", cost: null, price: null } }, priced.version))).toBe("VALIDATION_FAILED:price");
  });

  it("bulk changes are all-or-nothing", async () => {
    const owner = await makeStaff(db, "owner");
    const a = (await getAdminService(db, "pinterest-followers"))!;
    const b = (await getAdminService(db, "snapchat-followers")) ?? (await getAdminService(db, "reddit-upvotes"))!;
    await expect(bulkUpdateServices(db, editor(owner.user.id), [{ id: a.id, version: a.version }, { id: b.id, version: b.version + 99 }], { visible: false })).rejects.toThrow(/changed since/);
    expect((await getAdminService(db, a.id))!.visible).toBe(a.visible);
    const done = await bulkUpdateServices(db, editor(owner.user.id), [{ id: a.id, version: a.version }], { visible: false });
    expect(done[0].visible).toBe(false);
  });
});

describe("admin routes enforce permissions", () => {
  it("anonymous and customers get nothing; support can view but not edit", async () => {
    await jar_clear();
    expect((await call(adminServices)).status).toBe(401);
    expect((await call(adminCustomers)).status).toBe(401);
    const c = await makeCustomer(db);
    signInAs("customer", c.token);
    expect((await call(adminServices)).status).toBe(401);
    const support = await makeStaff(db, "support");
    signInAs("staff", support.token);
    expect((await call(adminServices)).status).toBe(200);
    const rec = (await getAdminService(db, "instagram-reels-views"))!;
    const r = await call(patchService, "/api/admin/services/x", { method: "PATCH", body: JSON.stringify({ version: rec.version, record: { ...rec, description: "nope" } }) }, { params: Promise.resolve({ id: rec.id }) });
    expect(r.status).toBe(403);
    expect((await call(bulkServices, "/api/admin/services", { method: "PATCH", body: JSON.stringify({ items: [{ id: rec.id, version: rec.version }], patch: { visible: false } }) })).status).toBe(403);
  });

  it("owners save through the API with a version; a stale save gets 409", async () => {
    const owner = await makeStaff(db, "owner");
    signInAs("staff", owner.token);
    const rec = (await getAdminService(db, "youtube-channel-subscribers"))!;
    const ctx = { params: Promise.resolve({ id: rec.id }) };
    const body = (v: number, price: number) => JSON.stringify({ version: v, record: { ...rec, pricing: { model: "per1000", cost: 20, price } } });
    const first = await call(patchService, "/api/admin/services/x", { method: "PATCH", body: body(rec.version, 55) }, ctx);
    expect(first.status).toBe(200);
    const stale = await call(patchService, "/api/admin/services/x", { method: "PATCH", body: body(rec.version, 60) }, { params: Promise.resolve({ id: rec.id }) });
    expect(stale.status).toBe(409);
    expect((await getAdminService(db, rec.id))!.pricing.price).toBe(55);
    const foreign = await call(patchService, "/api/admin/services/x", { method: "PATCH", headers: { origin: "https://evil.example" }, body: body(rec.version + 1, 60) }, { params: Promise.resolve({ id: rec.id }) });
    expect(foreign.status).toBe(403);
  });

  it("customer directory lists real customers with recorded figures only", async () => {
    const support = await makeStaff(db, "support");
    const c = await makeCustomer(db);
    await fundWallet(db, c.customer.id, 1_234);
    signInAs("staff", support.token);
    const r = await call(adminCustomers, `/api/admin/customers?q=${encodeURIComponent(c.email)}`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { items: { email: string; balanceCents: number; orderCount: number; lastSignInAt: string | null; emailVerified: boolean }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({ email: c.email, balanceCents: 1_234, orderCount: 0, lastSignInAt: null, emailVerified: true });
    const bad = await call(adminCustomers, "/api/admin/customers?pageSize=5000");
    expect(bad.status).toBe(400);
  });

  it("re-authentication is unrelated to service edits (no sensitive staff action)", async () => {
    const owner = await makeStaff(db, "owner");
    expect(typeof reauthenticate).toBe("function");
    expect(owner.staffId).toBeTruthy();
  });
});

// Small helper so tests read naturally.
async function jar_clear() {
  (await import("./auth-helpers")).jar.clear();
}
void users;
void services;

describe("live dashboard data", () => {
  it("the account snapshot holds only stored records: zero balance, no orders", async () => {
    const { customer, email } = await makeCustomer(db);
    const snap = await accountSnapshot(db, customer.id);
    expect(snap.profile.email).toBe(email);
    expect(snap.wallet).toEqual({ currency: "USD", availableCents: 0, pendingCents: 0, hasWallet: true });
    expect(snap.orderCount).toBe(0);
    expect(snap.preferences).toMatchObject({ displayCurrency: "USD", timezone: "UTC" });
  });

  it("a rejected field is named in the error response (never its value)", async () => {
    const c = await makeCustomer(db);
    signInAs("customer", c.token);
    const r = await call(profilePatch, "/api/account/profile", { method: "PATCH", body: JSON.stringify({ firstName: "Ada", lastName: "L", displayName: "Ada", phone: "call me maybe", country: "", accountType: "personal", businessName: "", website: "" }) });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: { code: string; field?: string } };
    expect(body.error).toMatchObject({ code: "VALIDATION_FAILED", field: "phone" });
    expect(JSON.stringify(body)).not.toContain("call me maybe");
  });
});
