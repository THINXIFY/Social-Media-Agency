import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as myDeposits, POST as createDepositRoute } from "@/app/api/account/deposits/route";
import { GET as myDeposit } from "@/app/api/account/deposits/[ref]/route";
import { POST as receiptRoute } from "@/app/api/admin/payments/deposits/[ref]/receipt/route";
import { POST as verifyRoute } from "@/app/api/admin/payments/deposits/[ref]/verify/route";
import { GET as staffDeposits } from "@/app/api/admin/payments/deposits/route";
import { POST as adjustmentsRoute } from "@/app/api/admin/payments/adjustments/route";
import { POST as refundsRoute } from "@/app/api/admin/payments/refunds/route";
import { GET as summaryRoute } from "@/app/api/admin/payments/summary/route";
import { POST as webhookRoute } from "@/app/api/payments/webhooks/[processor]/route";
import { markReauthenticated } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { auditLog, deposits, journalEntries, journalLines } from "@/server/db/schema";
import { resetEnvCache } from "@/server/env";
import { AppError } from "@/server/errors";
import { postJournalEntry } from "@/server/ledger/ledger";
import { openClearingAccount, openWallet } from "@/server/ledger/accounts";
import { requestAdjustment, requestRefund } from "@/server/payments/adjustments";
import {
  addDepositNote,
  cancelOwnDeposit,
  createDeposit,
  expireDeposits,
  getDepositForStaff,
  getOwnDeposit,
  listOwnDeposits,
  MAX_OPEN_REQUESTS,
  recordBankReceipt,
  rejectDeposit,
  verifyAndCredit,
} from "@/server/payments/deposits";
import { methodReadiness } from "@/server/payments/methods";
import { reconcile } from "@/server/payments/reconcile";
import { signPayload, verifySignature } from "@/server/payments/webhooks";
import { walletEntries, walletSummary } from "@/server/wallet/wallet";
import { bindRequestDb, jar, makeCustomer, makeStaff, signInAs } from "./auth-helpers";
import { ensureReferenceData, fundWallet, sqlState, testDb, uid } from "./helpers";

vi.mock("next/headers", async () => (await import("./auth-helpers")).jarMock());
vi.mock("next/server", () => ({ connection: async () => {} }));

let db: Db;
const BANK = { PAYMENTS_BANK_ENABLED: "true", PAYMENTS_BANK_ACCOUNT_NAME: "Sociotix Test Ltd", PAYMENTS_BANK_NAME: "Test Bank (fixture)", PAYMENTS_BANK_ACCOUNT: "TEST-0000-FIXTURE" };
const setBank = (on: boolean) => {
  for (const [k, v] of Object.entries(BANK)) {
    if (on) process.env[k] = v;
    else delete process.env[k];
  }
  resetEnvCache();
};

beforeAll(async () => {
  bindRequestDb();
  db = testDb();
  await ensureReferenceData(db);
});
afterEach(() => setBank(true));
afterAll(async () => {
  setBank(false);
  await db.$client.end();
});

const ORIGIN = "http://localhost:3000";
const call = (fn: unknown, url = "/api/x", init: RequestInit = {}, ctx: unknown = {}) =>
  (fn as (r: Request, c: unknown) => Promise<Response>)(new Request(ORIGIN + url, { ...init, headers: { "content-type": "application/json", origin: ORIGIN, ...(init.headers ?? {}) } }), ctx);
const codeOf = (p: Promise<unknown> | (() => unknown)) =>
  Promise.resolve()
    .then(() => (typeof p === "function" ? p() : p))
    .then(
      () => "resolved",
      (e) => (e instanceof AppError ? `${e.code}${e.details?.field ? `:${e.details.field}` : ""}` : e?.name === "ZodError" ? "ZOD" : `other:${String(e)}`),
    );
const key = () => `k_${randomUUID().replace(/-/g, "")}`;
const actorOf = (c: Awaited<ReturnType<typeof makeCustomer>>) => ({ userId: c.user.id, customerId: c.customer.id });
const today = () => new Date().toISOString().slice(0, 10);
const receipt = (amountReceivedCents: number, bankReference = `BNK${uid()}`) => ({
  bankReference,
  amountReceivedCents,
  receivedOn: today(),
  payerName: "Test Customer",
  checks: { onBankStatement: true, referenceMatches: true, fundsCleared: true },
});
async function newRequest(cents = 5_000) {
  const c = await makeCustomer(db);
  const { deposit } = await createDeposit(db, actorOf(c), { amountCents: cents, currency: "USD", method: "bank" }, key());
  return { c, deposit };
}

describe("payment-method readiness", () => {
  it("nothing is available until the operator configures it; processors are never configured", () => {
    setBank(false);
    const off = methodReadiness();
    expect(off.every((m) => !m.acceptingRequests && !m.verification.available)).toBe(true);
    expect(off.find((m) => m.id === "bank")!.blockers[0]).toMatch(/hasn't been configured/);
    setBank(true);
    process.env.CRYPTO_PROCESSOR_API_KEY = "anything";
    const on = methodReadiness();
    expect(on.find((m) => m.id === "bank")).toMatchObject({ configured: true, acceptingRequests: true, verification: { kind: "bank_statement_review", available: true } });
    for (const id of ["crypto", "card", "paypal"]) expect(on.find((m) => m.id === id)).toMatchObject({ configured: false, acceptingRequests: false, networks: [] });
    delete process.env.CRYPTO_PROCESSOR_API_KEY;
  });
});

describe("deposit requests", () => {
  it("a request is pending, carries real instructions and never changes the balance", async () => {
    setBank(true);
    const { c, deposit } = await newRequest(12_345);
    expect(deposit).toMatchObject({ amountCents: 12_345, currency: "USD", method: "bank", status: "awaiting_payment", creditedAt: null });
    expect(deposit.reference).toMatch(/^DEP-[A-Z0-9]{10}$/);
    expect(deposit.instructions).toMatchObject({ accountName: BANK.PAYMENTS_BANK_ACCOUNT_NAME, account: BANK.PAYMENTS_BANK_ACCOUNT, reference: deposit.reference });
    expect(Date.parse(deposit.expiresAt!) - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    expect(await walletSummary(db, c.customer.id)).toMatchObject({ availableCents: 0, pendingCents: 12_345 });
    expect((await walletEntries(db, c.customer.id)).items).toEqual([]);
    const [a] = await db.select().from(auditLog).where(and(eq(auditLog.action, "deposit.requested"), eq(auditLog.actorUserId, c.user.id)));
    expect(a).toBeTruthy();
  });

  it("is refused when the method isn't configured", async () => {
    setBank(false);
    const c = await makeCustomer(db);
    expect(await codeOf(createDeposit(db, actorOf(c), { amountCents: 5_000, currency: "USD", method: "bank" }, key()))).toBe("FEATURE_DISABLED");
    setBank(true);
    expect(await codeOf(createDeposit(db, actorOf(c), { amountCents: 5_000, currency: "USD", method: "crypto" }, key()))).toBe("FEATURE_DISABLED");
    expect(await codeOf(createDeposit(db, actorOf(c), { amountCents: 5_000, currency: "USD", method: "card" }, key()))).toBe("FEATURE_DISABLED");
  });

  it("validates amount, currency, method and the request key", async () => {
    const c = await makeCustomer(db);
    const make = (body: object, k: string | null = key()) => codeOf(createDeposit(db, actorOf(c), body, k));
    expect(await make({ amountCents: 999, currency: "USD", method: "bank" })).toBe("ZOD");
    expect(await make({ amountCents: 500_001, currency: "USD", method: "bank" })).toBe("ZOD");
    expect(await make({ amountCents: 1000.5, currency: "USD", method: "bank" })).toBe("ZOD");
    expect(await make({ amountCents: 5_000, currency: "EUR", method: "bank" })).toBe("ZOD");
    expect(await make({ amountCents: 5_000, currency: "USD", method: "wire" })).toBe("ZOD");
    expect(await make({ amountCents: 5_000, currency: "USD", method: "bank", customerId: randomUUID() })).toBe("ZOD");
    expect(await make({ amountCents: 5_000, currency: "USD", method: "bank" }, null)).toBe("VALIDATION_FAILED:idempotencyKey");
    expect(await make({ amountCents: 5_000, currency: "USD", method: "bank" }, "short")).toBe("VALIDATION_FAILED:idempotencyKey");
    expect(await make({ amountCents: 1_000, currency: "USD", method: "bank" })).toBe("resolved");
    expect(await make({ amountCents: 500_000, currency: "USD", method: "bank" })).toBe("resolved");
  });

  it("duplicate submissions return the original; a reused key with other details is refused", async () => {
    const c = await makeCustomer(db);
    const k = key();
    const body = { amountCents: 7_500, currency: "USD", method: "bank" };
    const results = await Promise.all(Array.from({ length: 6 }, () => createDeposit(db, actorOf(c), body, k)));
    expect(new Set(results.map((r) => r.deposit.reference)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect((await listOwnDeposits(db, c.customer.id)).total).toBe(1);
    expect(await codeOf(createDeposit(db, actorOf(c), { ...body, amountCents: 9_000 }, k))).toBe("IDEMPOTENCY_CONFLICT");
  });

  it(`caps open requests at ${MAX_OPEN_REQUESTS}, even when created concurrently`, async () => {
    const c = await makeCustomer(db);
    const res = await Promise.all(Array.from({ length: MAX_OPEN_REQUESTS + 3 }, () => codeOf(createDeposit(db, actorOf(c), { amountCents: 1_000, currency: "USD", method: "bank" }, key()))));
    expect(res.filter((r) => r === "resolved")).toHaveLength(MAX_OPEN_REQUESTS);
    expect(res.filter((r) => r === "CONFLICT")).toHaveLength(3);
  });

  it("customers see and cancel only their own requests", async () => {
    const { c: a, deposit } = await newRequest();
    const b = await makeCustomer(db);
    expect(await getOwnDeposit(db, b.customer.id, deposit.reference)).toBeNull();
    expect((await listOwnDeposits(db, b.customer.id)).total).toBe(0);
    expect(await codeOf(cancelOwnDeposit(db, actorOf(b), deposit.reference))).toBe("NOT_FOUND");
    signInAs("customer", b.token);
    expect((await call(myDeposit, "/x", {}, { params: Promise.resolve({ ref: deposit.reference }) })).status).toBe(404);
    const cancelled = await cancelOwnDeposit(db, actorOf(a), deposit.reference);
    expect(cancelled).toMatchObject({ status: "cancelled", statusReason: "Cancelled by you.", instructions: null });
    expect(await walletSummary(db, a.customer.id)).toMatchObject({ availableCents: 0, pendingCents: 0 });
  });

  it("routes: sign-in, same-origin and the Idempotency-Key header are required", async () => {
    jar.clear();
    expect((await call(myDeposits)).status).toBe(401);
    const c = await makeCustomer(db);
    signInAs("customer", c.token);
    const body = JSON.stringify({ amountCents: 2_500, currency: "USD", method: "bank" });
    expect((await call(createDepositRoute, "/x", { method: "POST", body, headers: { origin: "https://evil.example", "idempotency-key": key() } })).status).toBe(403);
    expect((await call(createDepositRoute, "/x", { method: "POST", body })).status).toBe(400);
    const k = key();
    const first = await call(createDepositRoute, "/x", { method: "POST", body, headers: { "idempotency-key": k } });
    const again = await call(createDepositRoute, "/x", { method: "POST", body, headers: { "idempotency-key": k } });
    expect([first.status, again.status]).toEqual([201, 200]);
    const list = (await (await call(myDeposits)).json()) as { total: number };
    expect(list.total).toBe(1);
  });
});

describe("state machine (database-enforced)", () => {
  it("refuses skipping verification, changing the amount, reopening or deleting", async () => {
    const { deposit } = await newRequest();
    const where = eq(deposits.publicRef, deposit.reference);
    expect(await sqlState(db.update(deposits).set({ status: "credited" }).where(where))).toMatch(/SV010|23514/);
    expect(await sqlState(db.update(deposits).set({ amountCents: 1 }).where(where))).toBe("SV010");
    await db.update(deposits).set({ status: "settling" }).where(where); // a valid transition
    expect(await sqlState(db.update(deposits).set({ status: "awaiting_payment" }).where(where))).toBe("SV010");
    expect(await sqlState(db.delete(deposits).where(where))).toBe("SV001");
  });

  it("expiry closes unpaid requests; late payments can still be recorded", async () => {
    const { deposit } = await newRequest();
    await expireDeposits(db, new Date(Date.now() + 8 * 86_400_000));
    const expired = (await db.select().from(deposits).where(eq(deposits.publicRef, deposit.reference)))[0];
    expect(expired.status).toBe("expired");
    expect(expired.statusReason).toMatch(/expired/);
    const finance = await makeStaff(db, "finance");
    await recordBankReceipt(db, { userId: finance.user.id }, deposit.reference, receipt(5_000));
    expect((await getDepositForStaff(db, deposit.reference))!.status).toBe("under_review");
  });
});

describe("verification and crediting", () => {
  it("full flow: receipt (1 of 2) credits nothing; a second person verifies and the wallet is credited once", async () => {
    const { c, deposit } = await newRequest(25_000);
    const a = await makeStaff(db, "finance");
    const b = await makeStaff(db, "finance");
    await recordBankReceipt(db, { userId: a.user.id }, deposit.reference, receipt(25_000));
    expect(await walletSummary(db, c.customer.id)).toMatchObject({ availableCents: 0, pendingCents: 25_000 });
    const view = (await getDepositForStaff(db, deposit.reference, a.user.id))!;
    expect(view.next.id).toBe("verify_and_credit");
    expect(view.blockers.join(" ")).toMatch(/different staff member/);
    expect(await codeOf(verifyAndCredit(db, { userId: a.user.id }, deposit.reference))).toBe("CONFLICT");

    const done = await verifyAndCredit(db, { userId: b.user.id }, deposit.reference);
    expect(done).toMatchObject({ credited: true, replayed: false });
    expect(await walletSummary(db, c.customer.id)).toMatchObject({ availableCents: 25_000, pendingCents: 0 });
    const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, done.entryId));
    expect(entry).toMatchObject({ kind: "deposit_credit", createdBy: a.user.id, approvedBy: b.user.id, idempotencyKey: expect.stringMatching(/^deposit:.+:credit$/) });
    const lines = await db.select().from(journalLines).where(eq(journalLines.entryId, done.entryId));
    expect(lines.reduce((s, l) => s + l.amountCents, 0)).toBe(0);
    const history = await walletEntries(db, c.customer.id);
    expect(history.items).toHaveLength(1);
    expect(history.items[0].amountCents).toBe(25_000);
    expect((await getOwnDeposit(db, c.customer.id, deposit.reference))).toMatchObject({ status: "credited", instructions: null, creditedAt: expect.any(String) });

    // Retries never post again; closed deposits can't be rejected or changed.
    expect(await verifyAndCredit(db, { userId: b.user.id }, deposit.reference)).toMatchObject({ replayed: true, entryId: done.entryId });
    expect(await codeOf(rejectDeposit(db, { userId: b.user.id }, deposit.reference, { reason: "Changed my mind about it" }))).toBe("CONFLICT");
    expect(await sqlState(db.update(deposits).set({ statusReason: "edited" }).where(eq(deposits.publicRef, deposit.reference)))).toBe("SV010");
    expect(await sqlState(db.update(journalEntries).set({ description: "x" }).where(eq(journalEntries.id, done.entryId)))).toBe("SV001");
    expect((await walletSummary(db, c.customer.id)).availableCents).toBe(25_000);
  });

  it("simultaneous verifications credit exactly once", async () => {
    const { c, deposit } = await newRequest(4_000);
    const [a, b, d] = await Promise.all([makeStaff(db, "finance"), makeStaff(db, "finance"), makeStaff(db, "admin")]);
    await recordBankReceipt(db, { userId: a.user.id }, deposit.reference, receipt(4_000));
    const results = await Promise.all([verifyAndCredit(db, { userId: b.user.id }, deposit.reference), verifyAndCredit(db, { userId: d.user.id }, deposit.reference)].map((p) => p.catch((e) => e)));
    const entries = await db.execute<{ n: number }>(sql`select count(*)::int as n from journal_entries where reference_type = 'deposit' and reference_id = ${deposit.reference}`);
    expect(entries.rows[0].n).toBe(1);
    expect(results.filter((r) => r && (r as { credited?: boolean }).credited).length).toBeGreaterThanOrEqual(1);
    expect((await walletSummary(db, c.customer.id)).availableCents).toBe(4_000);
  });

  it("missing, mismatched or reused evidence is refused", async () => {
    const { deposit } = await newRequest(5_000);
    const a = await makeStaff(db, "finance");
    const rec = (body: object) => codeOf(recordBankReceipt(db, { userId: a.user.id }, deposit.reference, body));
    expect(await rec({ ...receipt(5_000), checks: { onBankStatement: true, referenceMatches: true } })).toBe("ZOD");
    expect(await rec({ ...receipt(5_000), checks: { onBankStatement: true, referenceMatches: false, fundsCleared: true } })).toBe("ZOD");
    expect(await rec({ ...receipt(5_000), customerScreenshot: "data:image/png;base64,AAAA" })).toBe("ZOD");
    expect(await rec(receipt(4_999))).toBe("VALIDATION_FAILED:amountReceivedCents");
    expect(await rec({ ...receipt(5_000), receivedOn: "2099-01-01" })).toBe("VALIDATION_FAILED:receivedOn");
    expect(await rec({ ...receipt(5_000), note: "customer password is hunter2" })).toBe("VALIDATION_FAILED:note");
    const ref = `BNK${uid()}`;
    expect(await rec(receipt(5_000, ref))).toBe("resolved");
    const { deposit: other } = await newRequest(5_000);
    expect(await codeOf(recordBankReceipt(db, { userId: a.user.id }, other.reference, receipt(5_000, ref)))).toBe("CONFLICT");
    expect(await rec(receipt(5_000))).toBe("CONFLICT"); // already under review
  });

  it("without configured verification nothing can be verified or credited, and there is no override", async () => {
    const { deposit } = await newRequest();
    const a = await makeStaff(db, "owner");
    setBank(false);
    expect(await codeOf(recordBankReceipt(db, { userId: a.user.id }, deposit.reference, receipt(5_000)))).toBe("FEATURE_DISABLED");
    const view = (await getDepositForStaff(db, deposit.reference, a.user.id))!;
    expect(view.verification.available).toBe(false);
    expect(view.blockers[0]).toMatch(/isn't configured/);
    expect(view.next.id).not.toBe("record_receipt");
  });

  it("rejections need a reason, are shown to the customer and never credit", async () => {
    const { c, deposit } = await newRequest();
    const a = await makeStaff(db, "finance");
    const b = await makeStaff(db, "finance");
    await recordBankReceipt(db, { userId: a.user.id }, deposit.reference, receipt(5_000));
    expect(await codeOf(rejectDeposit(db, { userId: b.user.id }, deposit.reference, { reason: "no" }))).toBe("ZOD");
    expect(await codeOf(rejectDeposit(db, { userId: a.user.id }, deposit.reference, { reason: "Payer name does not match the account holder" }))).toBe("CONFLICT");
    await rejectDeposit(db, { userId: b.user.id }, deposit.reference, { reason: "Payer name does not match the account holder" });
    expect(await getOwnDeposit(db, c.customer.id, deposit.reference)).toMatchObject({ status: "rejected", statusReason: "Payer name does not match the account holder" });
    expect(await walletSummary(db, c.customer.id)).toMatchObject({ availableCents: 0, pendingCents: 0 });
    expect(await codeOf(verifyAndCredit(db, { userId: b.user.id }, deposit.reference))).toBe("CONFLICT");
  });

  it("internal notes are stored, attributed and refuse credentials", async () => {
    const { deposit } = await newRequest();
    const a = await makeStaff(db, "finance");
    await addDepositNote(db, { userId: a.user.id }, deposit.reference, { body: "Customer emailed; transfer sent Monday." });
    expect(await codeOf(addDepositNote(db, { userId: a.user.id }, deposit.reference, { body: "card 4111111111111111" }))).toBe("VALIDATION_FAILED:body");
    const view = (await getDepositForStaff(db, deposit.reference))!;
    expect(view.notes).toHaveLength(1);
    expect(view.notes[0].by).toBeTruthy();
  });
});

describe("staff routes", () => {
  const ctx = (ref: string) => ({ params: Promise.resolve({ ref }) });
  const post = (fn: unknown, body: object, ref: string) => call(fn, "/x", { method: "POST", body: JSON.stringify(body) }, ctx(ref));

  it("payments:view to list; approveDeposits + fresh re-authentication to verify", async () => {
    const { deposit } = await newRequest();
    const support = await makeStaff(db, "support");
    signInAs("staff", support.token);
    const listStatus = (await call(staffDeposits)).status;
    expect([200, 403]).toContain(listStatus);
    expect((await post(receiptRoute, receipt(5_000), deposit.reference)).status).toBe(403);

    const c = await makeCustomer(db);
    signInAs("customer", c.token);
    expect((await call(staffDeposits)).status).toBe(401);

    const a = await makeStaff(db, "finance");
    signInAs("staff", a.token);
    expect((await call(staffDeposits)).status).toBe(200);
    const noReauth = await post(receiptRoute, receipt(5_000), deposit.reference);
    expect(noReauth.status).toBe(403);
    expect(((await noReauth.json()) as { error: { code: string } }).error.code).toBe("REAUTH_REQUIRED");
    await markReauthenticated(db, a.sessionId);
    const ok = await post(receiptRoute, receipt(5_000), deposit.reference);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { deposit: { status: string } }).deposit.status).toBe("under_review");
    // The same person can't complete the second step through the API either.
    expect((await post(verifyRoute, {}, deposit.reference)).status).toBe(409);
    const b = await makeStaff(db, "finance");
    await markReauthenticated(db, b.sessionId);
    signInAs("staff", b.token);
    const cross = await call(verifyRoute, "/x", { method: "POST", body: "{}", headers: { origin: "https://evil.example" } }, ctx(deposit.reference));
    expect(cross.status).toBe(403);
    const verified = await post(verifyRoute, {}, deposit.reference);
    expect(verified.status).toBe(200);
    expect(((await verified.json()) as { deposit: { status: string } }).deposit.status).toBe("credited");
  });

  it("refunds and adjustments are validated, permission-checked and switched off", async () => {
    const owner = await makeStaff(db, "owner");
    await markReauthenticated(db, owner.sessionId);
    signInAs("staff", owner.token);
    const refund = await call(refundsRoute, "/x", { method: "POST", body: JSON.stringify({ orderRef: "ORD-ABCD1234", amountCents: 500, reason: "Service was not delivered as described." }) });
    expect(refund.status).toBe(503);
    const adjust = await call(adjustmentsRoute, "/x", { method: "POST", body: JSON.stringify({ customerRef: "CUS-ABCD1234", amountCents: 1_000, reason: "Goodwill credit approved by owner.", evidenceRef: "TCK-ABCD1234" }) });
    expect(adjust.status).toBe(503);
    expect((await call(adjustmentsRoute, "/x", { method: "POST", body: JSON.stringify({ customerRef: "CUS-X", amountCents: 0, reason: "x", evidenceRef: "nope" }) })).status).toBe(400);
    const finance = await makeStaff(db, "finance");
    await markReauthenticated(db, finance.sessionId);
    signInAs("staff", finance.token);
    expect((await call(adjustmentsRoute, "/x", { method: "POST", body: "{}" })).status).toBe(403); // finance lacks adjustWallets
    expect(await codeOf(() => requestAdjustment({ customerRef: "CUS-ABCD1234", amountCents: 60_000, reason: "Too large an adjustment request.", evidenceRef: "TCK-ABCD1234" }))).toBe("ZOD");
    expect(await codeOf(() => requestRefund({ orderRef: "ORD-ABCD1234", amountCents: 100, reason: "Valid reason for the refund here." }))).toBe("FEATURE_DISABLED");
  });

  it("summary separates liabilities, pending deposits and revenue", async () => {
    const owner = await makeStaff(db, "owner");
    signInAs("staff", owner.token);
    const body = (await (await call(summaryRoute)).json()) as { summary: { walletLiabilitiesCents: number; deposits: { pending: { cents: number } }; revenueCents: number }; methods: { id: string }[]; can: Record<string, boolean> };
    expect(body.summary.walletLiabilitiesCents).toBeGreaterThan(0);
    expect(body.summary.deposits.pending.cents).toBeGreaterThan(0);
    expect(body.summary.revenueCents).toBe(0);
    expect(body.methods.map((m) => m.id)).toEqual(["bank", "crypto", "card", "paypal"]);
    expect(body.can).toMatchObject({ approveDeposits: true, adjustWallets: true });
  });
});

describe("webhooks", () => {
  it("signature checks reject missing, malformed, stale and forged signatures", () => {
    const secret = "whsec_test_fixture_only";
    const bodyText = JSON.stringify({ id: "evt_1" });
    const now = 1_800_000_000;
    expect(verifySignature(bodyText, signPayload(bodyText, secret, now), secret, now)).toEqual({ ok: true });
    expect(verifySignature(bodyText, null, secret, now)).toEqual({ ok: false, reason: "missing" });
    expect(verifySignature(bodyText, "garbage", secret, now)).toEqual({ ok: false, reason: "malformed" });
    expect(verifySignature(bodyText, signPayload(bodyText, secret, now - 301), secret, now)).toEqual({ ok: false, reason: "stale" });
    expect(verifySignature(bodyText + " ", signPayload(bodyText, secret, now), secret, now)).toEqual({ ok: false, reason: "mismatch" });
    expect(verifySignature(bodyText, signPayload(bodyText, "other", now), secret, now)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("every processor webhook fails closed and stores nothing", async () => {
    const before = await db.execute<{ n: number }>(sql`select count(*)::int as n from payment_webhook_events`);
    for (const p of ["crypto_processor", "card_processor", "paypal", "bank_transfer", "../etc"]) {
      const r = await call(webhookRoute, "/x", { method: "POST", body: JSON.stringify({ status: "paid", amount: 999999 }) }, { params: Promise.resolve({ processor: p }) });
      expect(r.status).toBe(503);
    }
    const after = await db.execute<{ n: number }>(sql`select count(*)::int as n from payment_webhook_events`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});

describe("reconciliation", () => {
  it("credited deposits reconcile with the ledger; untracked credits are reported, never repaired", async () => {
    const { deposit } = await newRequest(3_300);
    const [a, b] = await Promise.all([makeStaff(db, "finance"), makeStaff(db, "finance")]);
    await recordBankReceipt(db, { userId: a.user.id }, deposit.reference, receipt(3_300));
    await verifyAndCredit(db, { userId: b.user.id }, deposit.reference);
    const r = await reconcile(db);
    // Test fixtures fund wallets without a deposit record: reconciliation must flag exactly those.
    const real = r.exceptions.filter((e) => e.code !== "orphan_deposit_credit");
    expect(real).toEqual([]);
    expect(r.exceptions.some((e) => e.reference === deposit.reference)).toBe(false);
    expect(r.summary.deposits.credited.cents).toBeGreaterThanOrEqual(3_300);

    const c = await makeCustomer(db);
    const before = (await walletSummary(db, c.customer.id)).availableCents;
    await fundWallet(db, c.customer.id, 777);
    const after = await reconcile(db);
    expect(after.exceptions.filter((e) => e.code === "orphan_deposit_credit").length).toBe(r.exceptions.filter((e) => e.code === "orphan_deposit_credit").length + 1);
    expect((await walletSummary(db, c.customer.id)).availableCents).toBe(before + 777); // reported, not reversed
  });

  it("a mismatched credit is detected", async () => {
    // Build the inconsistency inside a transaction that is rolled back.
    await db
      .transaction(async (tx) => {
        const c = await makeCustomer(tx as unknown as Db);
        const wallet = await openWallet(tx, c.customer.id);
        const clearing = await openClearingAccount(tx, "bank_transfer");
        await postJournalEntry(tx as unknown as Db, { kind: "deposit_credit", idempotencyKey: `test-orphan-${uid()}`, description: "Untracked credit", reference: { type: "deposit", id: "DEP-NOTREAL1" }, lines: [{ accountCode: clearing, amountCents: 100 }, { accountCode: wallet, amountCents: -100 }] });
        const r = await reconcile(tx as unknown as Db);
        expect(r.ok).toBe(false);
        expect(r.exceptions.some((e) => e.code === "orphan_deposit_credit" && e.reference === "DEP-NOTREAL1")).toBe(true);
        throw new Error("rollback");
      })
      .catch((e) => expect(String(e)).toMatch(/rollback/));
  });
});
