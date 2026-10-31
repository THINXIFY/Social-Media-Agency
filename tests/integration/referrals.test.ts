import { randomUUID } from "node:crypto";
import { count, eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { GET as myReferralsGet } from "@/app/api/account/referrals/route";
import { POST as regenerateRoute } from "@/app/api/account/referrals/code/route";
import { GET as adminListGet } from "@/app/api/admin/referrals/route";
import { GET as adminOneGet, POST as adminOnePost } from "@/app/api/admin/referrals/[id]/route";
import { POST as programPost } from "@/app/api/admin/referrals/program/route";
import { POST as rulesPost } from "@/app/api/admin/referrals/rules/route";
import { POST as ruleAction } from "@/app/api/admin/referrals/rules/[id]/route";
import { registerCustomer, verifyEmail } from "@/server/auth/accounts";
import { createDb, type Db } from "@/server/db/client";
import { auditLog, customers, journalEntries, platformSettings, referralCodes, referralEvents, referralPolicies, referrals, sessions, users } from "@/server/db/schema";
import { resetEnvCache } from "@/server/env";
import { AppError } from "@/server/errors";
import { adminReferral, adminReferrals, attributeReferral, canonicalEmail, createDraftPolicy, getOrCreateCode, ownReferralSummary, PROGRAM_KEY, regenerateCode, reviewReferral } from "@/server/referrals/referrals";
import { runMigrations } from "../../scripts/db/migrate";
import { seedReferenceData } from "../../scripts/db/seed";
import { lastEmailTo, makeCustomer, makeStaff, PASSWORD, signInAs, tokenFrom, uniqueEmail } from "./auth-helpers";
import { sqlState } from "./helpers";

vi.mock("next/headers", async () => (await import("./auth-helpers")).jarMock());
vi.mock("next/server", () => ({ connection: async () => {} }));

/* Phase 5G-B referral program against a scratch database. */
const scratch = `socivanta_referrals_test_${Date.now()}`;
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
  await db.$client.end();
  process.env.DATABASE_URL = inject("databaseUrl");
  resetEnvCache();
  await admin.query(`drop database if exists ${scratch} with (force)`);
  await admin.end();
});

const ORIGIN = "http://localhost:3000";
const call = (fn: unknown, init: RequestInit = {}, ctx: unknown = {}, url = "/api/x") =>
  (fn as (r: Request, c: unknown) => Promise<Response>)(new Request(ORIGIN + url, { ...init, headers: { "content-type": "application/json", origin: ORIGIN, ...(init.headers ?? {}) } }), ctx);
const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });
const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "resolved",
    (e) => (e instanceof AppError ? e.code : e?.name === "ZodError" ? "ZOD" : `other:${String(e)}`),
  );
const actorOf = (c: Awaited<ReturnType<typeof makeCustomer>>) => ({ userId: c.user.id, customerId: c.customer.id });
const referralOf = async (customerId: string) => (await db.select().from(referrals).where(eq(referrals.refereeCustomerId, customerId)))[0];
const customerByEmail = async (email: string) => (await db.select({ id: customers.id, userId: users.id }).from(customers).innerJoin(users, eq(users.id, customers.userId)).where(eq(users.email, email)))[0];
async function newCustomer(first = "Test", last = "Customer") {
  const c = await makeCustomer(db);
  await db.update(customers).set({ firstName: first, lastName: last }).where(eq(customers.id, c.customer.id));
  return c;
}

describe("referral codes", () => {
  it("creates one hard-to-guess code per customer, safely under concurrency", async () => {
    const c = await newCustomer();
    const codes = await Promise.all([1, 2, 3, 4].map(() => getOrCreateCode(db, c.customer.id)));
    expect(new Set(codes).size).toBe(1);
    expect(codes[0]).toMatch(/^SV-[2-9A-HJKMNP-TV-Z]{8}$/);
    expect((await db.select({ n: count() }).from(referralCodes).where(eq(referralCodes.customerId, c.customer.id)))[0].n).toBe(1);
  });

  it("replaces a code, disables the old one and limits changes to 3 a day", async () => {
    const c = await newCustomer();
    const first = await getOrCreateCode(db, c.customer.id);
    const second = await regenerateCode(db, actorOf(c));
    expect(second).not.toBe(first);
    const [old] = await db.select().from(referralCodes).where(eq(referralCodes.code, first));
    expect(old.disabledAt).not.toBeNull();
    await regenerateCode(db, actorOf(c));
    await regenerateCode(db, actorOf(c));
    expect(await codeOf(regenerateCode(db, actorOf(c)))).toBe("RATE_LIMITED");
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "referral.code_regenerated"));
    expect(audits.filter((a) => a.targetId === c.customer.id)).toHaveLength(3);
  });
});

describe("attribution at sign-up", () => {
  it("records a link sign-up once, with no policy, and answers sign-up exactly as without a code", async () => {
    const referrer = await newCustomer("Riya", "Shah");
    const code = await getOrCreateCode(db, referrer.customer.id);
    const email = uniqueEmail("friend");
    expect(await registerCustomer(db, { name: "Ada Lovelace", email, password: PASSWORD, referral: { code: code.toLowerCase(), via: "link" } }, { ip: "203.0.113.9" })).toEqual({ status: "check_email" });
    const ada = await customerByEmail(email);
    const r = await referralOf(ada.id);
    expect(r).toMatchObject({ referrerCustomerId: referrer.customer.id, status: "signed_up", via: "link", policyId: null, verifiedAt: null, flags: [] });
    const events = await db.select().from(referralEvents).where(eq(referralEvents.referralId, r.id));
    expect(events.map((e) => e.type)).toEqual(["signed_up"]);
    expect((await db.select().from(auditLog).where(eq(auditLog.targetId, r.id))).map((a) => a.action)).toEqual(["referral.attributed"]);

    // Confirming the email is noted; a second confirmation changes nothing.
    const token = tokenFrom(lastEmailTo(email)!.text)!;
    expect(await verifyEmail(db, token)).toEqual({ status: "verified" });
    const after = await referralOf(ada.id);
    expect(after.verifiedAt).not.toBeNull();
    expect((await db.select().from(referralEvents).where(eq(referralEvents.referralId, r.id))).map((e) => e.type)).toEqual(["signed_up", "email_verified"]);

    // Refreshing and attributing again for the same person is a no-op.
    expect(await attributeReferral(db, { userId: ada.userId, customerId: ada.id, email }, code, "link")).toEqual({ status: "skipped", reason: "already_referred" });
  });

  it("ignores unknown, malformed and replaced codes without affecting sign-up", async () => {
    const referrer = await newCustomer();
    const old = await getOrCreateCode(db, referrer.customer.id);
    await regenerateCode(db, actorOf(referrer));
    for (const code of ["SV-NOTREAL1", "<script>", "", old]) {
      const email = uniqueEmail("nocode");
      expect(await registerCustomer(db, { name: "No Code", email, password: PASSWORD, referral: { code, via: "code" } })).toEqual({ status: "check_email" });
      const c = await customerByEmail(email);
      expect(c, code).toBeTruthy();
      expect(await referralOf(c.id), code).toBeUndefined();
    }
  });

  it("refuses self-referral, including obvious variants of the same inbox", async () => {
    expect(canonicalEmail("Jane.Doe+promo@GoogleMail.com")).toBe("janedoe@gmail.com");
    const c = await newCustomer();
    const code = await getOrCreateCode(db, c.customer.id);
    expect(await attributeReferral(db, { userId: c.user.id, customerId: c.customer.id, email: c.email }, code, "code")).toEqual({ status: "skipped", reason: "self" });
    const other = await newCustomer();
    const [local, domain] = c.email.split("@");
    expect(await attributeReferral(db, { userId: other.user.id, customerId: other.customer.id, email: `${local}+again@${domain}` }, code, "code")).toEqual({ status: "skipped", reason: "self" });
    await expect(db.insert(referrals).values({ referrerCustomerId: c.customer.id, refereeCustomerId: c.customer.id, via: "code" })).rejects.toThrow();
  });

  it("attributes concurrent duplicates exactly once", async () => {
    const referrer = await newCustomer();
    const code = await getOrCreateCode(db, referrer.customer.id);
    const friend = await newCustomer();
    const results = await Promise.all([1, 2, 3].map(() => attributeReferral(db, { userId: friend.user.id, customerId: friend.customer.id, email: friend.email }, code, "link")));
    expect(results.filter((r) => r.status === "attributed")).toHaveLength(1);
    expect((await db.select({ n: count() }).from(referrals).where(eq(referrals.refereeCustomerId, friend.customer.id)))[0].n).toBe(1);
  });

  it("flags same network and similar email for review without rejecting", async () => {
    const referrer = await newCustomer();
    await db.update(sessions).set({ ip: "198.51.100.7" }).where(eq(sessions.id, referrer.sessionId));
    const code = await getOrCreateCode(db, referrer.customer.id);
    const friend = await newCustomer();
    const local = referrer.email.split("@")[0];
    expect(await attributeReferral(db, { userId: friend.user.id, customerId: friend.customer.id, email: `${local}@other.example` }, code, "code", { ip: "198.51.100.7" })).toEqual({ status: "attributed" });
    const r = await referralOf(friend.customer.id);
    expect(r.status).toBe("signed_up");
    expect([...r.flags].sort()).toEqual(["same_network", "similar_email"]);
  });

  it("flags a burst of sign-ups on one code", async () => {
    const referrer = await newCustomer();
    const code = await getOrCreateCode(db, referrer.customer.id);
    for (let i = 0; i < 10; i++) {
      const f = await newCustomer();
      await attributeReferral(db, { userId: f.user.id, customerId: f.customer.id, email: f.email }, code, "link");
    }
    const rows = await db.select({ flags: referrals.flags }).from(referrals).where(eq(referrals.referrerCustomerId, referrer.customer.id)).orderBy(referrals.attributedAt);
    expect(rows.slice(0, 9).every((r) => !r.flags.includes("high_volume"))).toBe(true);
    expect(rows[9].flags).toContain("high_volume");
  });

  it("stops attributing when the program switch is off", async () => {
    const referrer = await newCustomer();
    const code = await getOrCreateCode(db, referrer.customer.id);
    await db.insert(platformSettings).values({ key: PROGRAM_KEY, value: { attributionEnabled: false, sharingEnabled: true } });
    try {
      const f = await newCustomer();
      expect(await attributeReferral(db, { userId: f.user.id, customerId: f.customer.id, email: f.email }, code, "link")).toEqual({ status: "skipped", reason: "disabled" });
    } finally {
      await db.delete(platformSettings).where(eq(platformSettings.key, PROGRAM_KEY));
    }
  });
});

describe("customer view", () => {
  it("shows only the caller's own referrals, by first name and initial, with no rewards", async () => {
    const referrer = await newCustomer();
    const code = await getOrCreateCode(db, referrer.customer.id);
    const friend = await newCustomer("Grace", "Hopper");
    await attributeReferral(db, { userId: friend.user.id, customerId: friend.customer.id, email: friend.email }, code, "link");
    const s = await ownReferralSummary(db, referrer.customer.id);
    expect(s).toMatchObject({ code, rewardsEnabled: false, counts: { joined: 1, verified: 0, underReview: 0, qualified: 0 } });
    expect(s.link).toMatch(new RegExp(`/register\\?ref=${code}$`));
    expect(s.history).toEqual([expect.objectContaining({ name: "Grace H.", verified: false, status: "signed_up" })]);

    signInAs("customer", referrer.token);
    const res = await call(myReferralsGet);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const text = await res.text();
    expect(text).not.toContain(friend.email);
    expect(text).not.toContain("Hopper");
    expect(text).not.toMatch(/flags|same_network|amount|balance/);

    // Someone else sees none of it.
    const stranger = await newCustomer();
    signInAs("customer", stranger.token);
    const theirs = await (await call(myReferralsGet)).json();
    expect(theirs.history).toEqual([]);
    expect(theirs.code).not.toBe(code);
  });

  it("protects the regenerate route and respects the sharing switch", async () => {
    const c = await newCustomer();
    signInAs("customer", c.token);
    expect((await call(regenerateRoute, { ...post({}), headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await call(regenerateRoute, post({}))).status).toBe(200);
    await db.insert(platformSettings).values({ key: PROGRAM_KEY, value: { attributionEnabled: true, sharingEnabled: false } });
    try {
      expect((await ownReferralSummary(db, c.customer.id)).code).toBeNull();
      expect((await call(regenerateRoute, post({}))).status).not.toBe(200);
    } finally {
      await db.delete(platformSettings).where(eq(platformSettings.key, PROGRAM_KEY));
    }
  });
});

describe("staff review and reward safety", () => {
  async function referred() {
    const referrer = await newCustomer();
    const code = await getOrCreateCode(db, referrer.customer.id);
    const friend = await newCustomer();
    await attributeReferral(db, { userId: friend.user.id, customerId: friend.customer.id, email: friend.email }, code, "link");
    return (await referralOf(friend.customer.id)).id;
  }

  it("moves through review, reject and restore with history and audit", async () => {
    const id = await referred();
    const fin = await makeStaff(db, "finance");
    const staff = { userId: fin.user.id };
    await reviewReferral(db, staff, id, { action: "review" });
    expect(await codeOf(reviewReferral(db, staff, id, { action: "review" }))).toBe("CONFLICT");
    expect(await codeOf(reviewReferral(db, staff, id, { action: "reject", reason: "" }))).toBe("ZOD");
    await reviewReferral(db, staff, id, { action: "reject", reason: "Duplicate or fake account" });
    let d = await adminReferral(db, id);
    expect(d).toMatchObject({ status: "ineligible", ineligibleReason: "Duplicate or fake account" });
    await reviewReferral(db, staff, id, { action: "restore" });
    d = await adminReferral(db, id);
    expect(d.status).toBe("signed_up");
    expect(d.ineligibleReason).toBeNull();
    expect(d.events.map((e) => e.type)).toEqual(["signed_up", "marked_review", "rejected", "restored"]);
    expect((await db.select().from(auditLog).where(eq(auditLog.targetId, id))).map((a) => a.action).sort()).toEqual(["referral.attributed", "referral.marked_review", "referral.rejected", "referral.restored"]);
    expect(await sqlState(db.update(referralEvents).set({ type: "x" }).where(eq(referralEvents.referralId, id)))).toBe("SV001");
  });

  it("never qualifies, activates or rewards: server and database both refuse", async () => {
    const id = await referred();
    const fin = await makeStaff(db, "finance");
    expect(await codeOf(reviewReferral(db, { userId: fin.user.id }, id, { action: "qualify" }))).toBe("CONFLICT");
    expect(await sqlState(db.update(referrals).set({ status: "qualified" }).where(eq(referrals.id, id)))).toBe("SV014");
    const draft = await createDraftPolicy(db, { userId: fin.user.id }, { rewardType: "fixed", fixedCents: 500, minSpendCents: 2000, qualifyingDays: 30, holdDays: 14, minOrders: 1 });
    expect(draft.version).toBeGreaterThanOrEqual(1);
    expect(await sqlState(db.update(referralPolicies).set({ status: "active" }).where(eq(referralPolicies.id, draft.id)))).toBe("SV014");
    expect(await sqlState(db.execute(sql`insert into referral_rewards (referral_id, amount_cents) values (${id}, 500)`))).toBe("SV014");
    signInAs("staff", fin.token);
    expect((await call(ruleAction, post({ action: "activate" }), { params: Promise.resolve({ id: draft.id }) })).status).toBe(409);
    expect((await call(ruleAction, post({ action: "retire" }), { params: Promise.resolve({ id: draft.id }) })).status).toBe(200);
    expect((await db.select().from(referralPolicies).where(eq(referralPolicies.id, draft.id)))[0].status).toBe("retired");
  });

  it("validates draft rules", async () => {
    const fin = await makeStaff(db, "finance");
    const s = { userId: fin.user.id };
    expect(await codeOf(createDraftPolicy(db, s, { rewardType: "fixed", minSpendCents: 0, qualifyingDays: 30, holdDays: 0, minOrders: 1 }))).toBe("ZOD");
    expect(await codeOf(createDraftPolicy(db, s, { rewardType: "percent", percentBp: 20_000, minSpendCents: 0, qualifyingDays: 30, holdDays: 0, minOrders: 1 }))).toBe("ZOD");
    const [a, b] = await Promise.all([1, 2].map(() => createDraftPolicy(db, s, { rewardType: "percent", percentBp: 500, capCents: 1000, minSpendCents: 0, qualifyingDays: 30, holdDays: 0, minOrders: 1 })));
    expect(a.version).not.toBe(b.version);
  });

  it("enforces View versus Manage, same-origin and re-authentication", async () => {
    const id = await referred();
    const support = await makeStaff(db, "support"); // Referrals: View
    signInAs("staff", support.token);
    expect((await call(adminListGet, {}, {}, "/api/admin/referrals?status=all")).status).toBe(200);
    expect((await call(adminOneGet, {}, { params: Promise.resolve({ id }) })).status).toBe(200);
    expect((await call(adminOnePost, post({ action: "review" }), { params: Promise.resolve({ id }) })).status).toBe(403);
    expect((await call(rulesPost, post({ rewardType: "fixed", fixedCents: 100, minSpendCents: 0, qualifyingDays: 30, holdDays: 0, minOrders: 1 }))).status).toBe(403);

    const fin = await makeStaff(db, "finance"); // Referrals: Manage
    signInAs("staff", fin.token);
    expect((await call(adminOnePost, { ...post({ action: "review" }), headers: { origin: "https://evil.example" } }, { params: Promise.resolve({ id }) })).status).toBe(403);
    expect((await call(adminOnePost, post({ action: "review" }), { params: Promise.resolve({ id }) })).status).toBe(200);
    expect((await call(adminOneGet, {}, { params: Promise.resolve({ id: randomUUID() }) })).status).toBe(404);

    const before = await (await call(programPost, post({ attributionEnabled: false, sharingEnabled: true, version: 0 }))).json();
    expect(before.error.code).toBe("REAUTH_REQUIRED");
    await db.update(sessions).set({ reauthenticatedAt: new Date() }).where(eq(sessions.id, fin.sessionId));
    expect((await call(programPost, post({ attributionEnabled: false, sharingEnabled: true, version: 0 }))).status).toBe(200);
    expect((await call(programPost, post({ attributionEnabled: true, sharingEnabled: true, version: 0 }))).status).toBe(409); // stale version
    expect((await call(programPost, post({ attributionEnabled: true, sharingEnabled: true, version: 1 }))).status).toBe(200);
    expect((await db.select().from(auditLog).where(eq(auditLog.action, "referral.program_saved"))).length).toBe(2);

    const customer = await newCustomer();
    signInAs("customer", customer.token);
    expect([401, 403]).toContain((await call(adminListGet)).status);
  });

  it("lists, searches and filters for staff, and moves no money", async () => {
    const before = (await db.select({ n: count() }).from(journalEntries))[0].n;
    const id = await referred();
    const d = await adminReferral(db, id);
    const all = await adminReferrals(db, { status: "all", q: d.referee.email });
    expect(all.referrals.map((r) => r.id)).toEqual([id]);
    expect((await adminReferrals(db, { status: "flagged" })).referrals.every((r) => r.flags.length > 0)).toBe(true);
    expect((await adminReferrals(db, { status: "ineligible", q: d.referee.email })).referrals).toEqual([]);
    expect((await adminReferrals(db, { status: "all", q: "%" })).referrals.length).toBe(0);
    expect((await db.select({ n: count() }).from(journalEntries))[0].n).toBe(before);
  });
});
