import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, lt, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { type CustomerDeposit, DEPOSIT_LIMITS_CENTS, DEPOSIT_STATUS_META, type DepositMethodId, type DepositStatus, OPEN_DEPOSIT_STATUSES } from "@/lib/deposits";
import { audit } from "../audit";
import type { Db, Executor } from "../db/client";
import { customers, depositReviews, deposits, journalEntries, staffNotes, users } from "../db/schema";
import { AppError, errors, pgErrorOf } from "../errors";
import { openClearingAccount, openWallet } from "../ledger/accounts";
import { postJournalEntry } from "../ledger/ledger";
import { bankInstructions, methodReadiness, PROCESSOR, readinessOf } from "./methods";

/**
 * Deposit requests and their verification (Phase 5D).
 *
 * Rules that hold everywhere in this file:
 *  - A request is never proof of payment and never changes a balance.
 *  - Only an independently verified settlement credits a wallet. For bank
 *    transfers that means two different staff members with "Approve deposits"
 *    and a fresh re-authentication: one records the bank's own receipt, the
 *    other verifies it. Customer screenshots or hashes are never evidence.
 *  - Crediting is one transaction: the deposit row is locked, the ledger entry
 *    is posted with a per-deposit idempotency key, and the deposit is marked
 *    credited with a pointer to that entry (the database checks they match).
 *  - The database refuses invalid status transitions and any change to the
 *    amount, customer or method (trigger SV010), as a second line of defence.
 */

type Client = { ip?: string | null; userAgent?: string | null };
const METHOD_NAMES: Record<DepositMethodId, string> = { bank: "Bank transfer", crypto: "Cryptocurrency", card: "Card", paypal: "PayPal" };
/** At most this many open requests per customer, so requests can't be used to flood review queues. */
export const MAX_OPEN_REQUESTS = 5;

const newRef = () => `DEP-${randomBytes(8).toString("hex").toUpperCase().slice(0, 10)}`;
const looksSensitive = (text: string) =>
  /(password|passcode|otp|api[_ -]?key|secret|token|private[_ -]?key|seed[_ -]?phrase|recovery[_ -]?phrase|mnemonic|\bcvv\b|\bcvc\b|\b\d{13,19}\b)/i.test(text);

/* -------------------------------------------------------------------------- */
/*  Customer side                                                             */
/* -------------------------------------------------------------------------- */

export const createDepositSchema = z
  .object({
    amountCents: z
      .number()
      .int("Enter whole cents.")
      .min(DEPOSIT_LIMITS_CENTS.min, "The minimum deposit is $10.00.")
      .max(DEPOSIT_LIMITS_CENTS.max, "The maximum deposit is $5,000.00."),
    currency: z.literal("USD"),
    method: z.enum(["bank", "crypto", "card", "paypal"]),
  })
  .strict();

export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,100}$/;

type DepositRow = typeof deposits.$inferSelect;

function toCustomer(d: DepositRow, creditedAt: Date | null): CustomerDeposit {
  const method = d.method as DepositMethodId;
  const status = d.status as DepositStatus;
  return {
    reference: d.publicRef,
    amountCents: d.amountCents,
    currency: "USD",
    method,
    methodName: METHOD_NAMES[method],
    status,
    statusReason: d.statusReason,
    requestedAt: d.requestedAt.toISOString(),
    expiresAt: d.expiresAt?.toISOString() ?? null,
    creditedAt: creditedAt?.toISOString() ?? null,
    // Payment details only while the customer still needs to pay.
    instructions: method === "bank" && status === "awaiting_payment" ? bankInstructions(d.publicRef) : null,
  };
}

/**
 * Creates a pending deposit request. Retrying with the same idempotency key
 * returns the original request; reusing it with different details is refused.
 */
export async function createDeposit(db: Db, actor: { userId: string; customerId: string }, raw: unknown, idempotencyKey: string | null, client: Client = {}) {
  if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) throw new AppError("VALIDATION_FAILED", "A request key is required. Please refresh and try again.", { details: { field: "idempotencyKey" } });
  const input = createDepositSchema.parse(raw);
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");

  const existing = async () => {
    const [row] = await db.select().from(deposits).where(and(eq(deposits.customerId, actor.customerId), eq(deposits.idempotencyKey, idempotencyKey))).limit(1);
    if (!row) return null;
    if (row.requestHash !== requestHash) throw errors.idempotencyConflict();
    return { deposit: toCustomer(row, null), replayed: true };
  };
  const earlier = await existing();
  if (earlier) return earlier;

  const method = readinessOf(input.method);
  if (!method.acceptingRequests) throw new AppError("FEATURE_DISABLED", `${method.name} isn't available yet. ${method.blockers[0] ?? ""}`.trim(), { details: { method: input.method } });

  const created = await db.transaction(async (tx) => {
    // Serialise this customer's requests so the open-request cap can't be raced.
    await tx.execute(sql`select id from customers where id = ${actor.customerId} for update`);
    const [{ n }] = await tx
      .select({ n: count() })
      .from(deposits)
      .where(and(eq(deposits.customerId, actor.customerId), inArray(deposits.status, OPEN_DEPOSIT_STATUSES)));
    if (Number(n) >= MAX_OPEN_REQUESTS) throw errors.conflict(`You already have ${MAX_OPEN_REQUESTS} open deposit requests. Complete or cancel one before creating another.`);
    const [row] = await tx
      .insert(deposits)
      .values({
        publicRef: newRef(),
        customerId: actor.customerId,
        amountCents: input.amountCents,
        currency: "USD",
        method: input.method,
        processor: PROCESSOR[input.method],
        status: "awaiting_payment",
        expiresAt: method.expiresInHours ? new Date(Date.now() + method.expiresInHours * 3_600_000) : null,
        idempotencyKey,
        requestHash,
      })
      .onConflictDoNothing({ target: [deposits.customerId, deposits.idempotencyKey] })
      .returning();
    if (row) await audit(tx, { actorUserId: actor.userId, actorType: "customer", action: "deposit.requested", targetType: "deposit", targetId: row.id, after: { amountCents: row.amountCents, method: row.method }, ip: client.ip, userAgent: client.userAgent });
    return row ?? null;
  });
  // A concurrent retry with the same key won the insert: return that one.
  if (!created) return (await existing())!;
  return { deposit: toCustomer(created, null), replayed: false };
}

const creditedAtOf = (rows: { entryAt: Date | null }[]) => rows.map((r) => r.entryAt);

export async function listOwnDeposits(db: Executor, customerId: string, rawPage = 1, rawSize = 20) {
  const page = Math.min(Math.max(1, Math.floor(rawPage) || 1), 1000);
  const pageSize = Math.min(Math.max(1, Math.floor(rawSize) || 20), 50);
  const [{ total }] = await db.select({ total: count() }).from(deposits).where(eq(deposits.customerId, customerId));
  const rows = await db
    .select({ d: deposits, entryAt: journalEntries.createdAt })
    .from(deposits)
    .leftJoin(journalEntries, eq(journalEntries.id, deposits.creditedEntryId))
    .where(eq(deposits.customerId, customerId))
    .orderBy(desc(deposits.requestedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const at = creditedAtOf(rows);
  return { items: rows.map((r, i) => toCustomer(r.d, at[i])), total: Number(total), page, pageSize, pages: Math.max(1, Math.ceil(Number(total) / pageSize)) };
}

const REF = /^DEP-[A-Z0-9]{4,20}$/;

export async function getOwnDeposit(db: Executor, customerId: string, reference: string) {
  if (!REF.test(reference)) return null;
  const [row] = await db
    .select({ d: deposits, entryAt: journalEntries.createdAt })
    .from(deposits)
    .leftJoin(journalEntries, eq(journalEntries.id, deposits.creditedEntryId))
    .where(and(eq(deposits.customerId, customerId), eq(deposits.publicRef, reference)))
    .limit(1);
  return row ? toCustomer(row.d, row.entryAt) : null;
}

/** Customers may cancel only while nothing has been received. */
export async function cancelOwnDeposit(db: Db, actor: { userId: string; customerId: string }, reference: string, client: Client = {}) {
  if (!REF.test(reference)) throw errors.notFound("That deposit");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(deposits).where(and(eq(deposits.customerId, actor.customerId), eq(deposits.publicRef, reference))).for("update").limit(1);
    if (!row) throw errors.notFound("That deposit");
    if (row.status === "cancelled") return toCustomer(row, null);
    if (row.status !== "awaiting_payment" && row.status !== "created") throw errors.conflict(`This request is ${DEPOSIT_STATUS_META[row.status as DepositStatus].label.toLowerCase()} and can't be cancelled.`);
    const [updated] = await tx.update(deposits).set({ status: "cancelled", statusReason: "Cancelled by you.", updatedAt: new Date() }).where(eq(deposits.id, row.id)).returning();
    await audit(tx, { actorUserId: actor.userId, actorType: "customer", action: "deposit.cancelled", targetType: "deposit", targetId: row.id, ip: client.ip, userAgent: client.userAgent });
    return toCustomer(updated, null);
  });
}

/** Worker job: requests past their expiry with no payment recorded become expired. Idempotent. */
export async function expireDeposits(db: Executor, now = new Date()) {
  const rows = await db
    .update(deposits)
    .set({ status: "expired", statusReason: "No payment was received before this request expired.", updatedAt: now })
    .where(and(eq(deposits.status, "awaiting_payment"), lt(deposits.expiresAt, now)))
    .returning({ id: deposits.id });
  return { expired: rows.length };
}

/* -------------------------------------------------------------------------- */
/*  Staff side                                                                */
/* -------------------------------------------------------------------------- */

export const staffDepositQuery = z.object({
  q: z.string().trim().max(80).optional().default(""),
  status: z.enum(["open", "awaiting_payment", "under_review", "credited", "rejected", "expired", "cancelled", "failed"]).optional(),
  method: z.enum(["bank", "crypto", "card", "paypal"]).optional(),
  sort: z.enum(["newest", "oldest", "amount"]).optional().default("newest"),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
});

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listDepositsForStaff(db: Executor, raw: z.input<typeof staffDepositQuery>) {
  const q = staffDepositQuery.parse(raw);
  const conds: SQL[] = [];
  for (const term of q.q.split(/\s+/).filter(Boolean).slice(0, 5)) {
    const p = `%${likeEscape(term)}%`;
    conds.push(or(ilike(deposits.publicRef, p), ilike(customers.publicRef, p), ilike(customers.firstName, p), ilike(customers.lastName, p), ilike(users.email, p), ilike(deposits.processorRef, p))!);
  }
  if (q.status === "open") conds.push(inArray(deposits.status, OPEN_DEPOSIT_STATUSES));
  else if (q.status) conds.push(eq(deposits.status, q.status));
  if (q.method) conds.push(eq(deposits.method, q.method));
  const where = conds.length ? and(...conds) : undefined;
  const base = db.select({ total: count() }).from(deposits).innerJoin(customers, eq(customers.id, deposits.customerId)).innerJoin(users, eq(users.id, customers.userId));
  const [{ total }] = await base.where(where);
  const rows = await db
    .select({
      d: deposits,
      customerRef: customers.publicRef,
      name: sql<string>`coalesce(nullif(${customers.displayName}, ''), ${customers.firstName} || ' ' || ${customers.lastName})`,
      email: users.email,
      reviews: sql<number>`(select count(*) from ${depositReviews} r where r.deposit_id = ${deposits.id})`.mapWith(Number),
    })
    .from(deposits)
    .innerJoin(customers, eq(customers.id, deposits.customerId))
    .innerJoin(users, eq(users.id, customers.userId))
    .where(where)
    .orderBy(q.sort === "oldest" ? asc(deposits.requestedAt) : q.sort === "amount" ? desc(deposits.amountCents) : desc(deposits.requestedAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  return {
    items: rows.map((r) => ({
      reference: r.d.publicRef,
      customer: { publicRef: r.customerRef, name: r.name, email: r.email },
      amountCents: r.d.amountCents,
      method: r.d.method as DepositMethodId,
      status: r.d.status as DepositStatus,
      requestedAt: r.d.requestedAt.toISOString(),
      expiresAt: r.d.expiresAt?.toISOString() ?? null,
      reviewsDone: r.reviews,
    })),
    total: Number(total),
    page: q.page,
    pageSize: q.pageSize,
    pages: Math.max(1, Math.ceil(Number(total) / q.pageSize)),
  };
}

/** Staff-facing explanations of closed or waiting states (the customer copy says "your balance"). */
const STAFF_EXPLAIN: Partial<Record<DepositStatus, string>> = {
  credited: "Verified by two staff members and credited to the customer's wallet.",
  rejected: "Rejected. The customer sees the reason; nothing was credited.",
  expired: "Expired with no receipt recorded. If the money arrives late, record the receipt.",
  cancelled: "Cancelled by the customer before any payment was recorded.",
  failed: "The payment failed. Nothing was credited.",
  awaiting_payment: "Waiting for the customer's transfer.",
};

export interface NextAction {
  id: "record_receipt" | "verify_and_credit" | "wait_for_customer" | "none";
  label: string;
  explain: string;
}

/** Everything a reviewer needs in one place: evidence, reviews, notes, the ledger posting and what's blocking. */
export async function getDepositForStaff(db: Executor, reference: string, viewerUserId?: string) {
  if (!REF.test(reference)) return null;
  const [row] = await db
    .select({ d: deposits, c: customers, email: users.email })
    .from(deposits)
    .innerJoin(customers, eq(customers.id, deposits.customerId))
    .innerJoin(users, eq(users.id, customers.userId))
    .where(eq(deposits.publicRef, reference))
    .limit(1);
  if (!row) return null;
  const d = row.d;
  const reviewer = alias(users, "reviewer");
  const reviews = await db
    .select({ step: depositReviews.step, decision: depositReviews.decision, checklist: depositReviews.checklist, decidedAt: depositReviews.decidedAt, by: depositReviews.decidedBy, byName: reviewer.name, byEmail: reviewer.email })
    .from(depositReviews)
    .innerJoin(reviewer, eq(reviewer.id, depositReviews.decidedBy))
    .where(eq(depositReviews.depositId, d.id))
    .orderBy(asc(depositReviews.decidedAt));
  const author = alias(users, "author");
  const notes = await db
    .select({ id: staffNotes.id, body: staffNotes.body, at: staffNotes.createdAt, byName: author.name, byEmail: author.email })
    .from(staffNotes)
    .innerJoin(author, eq(author.id, staffNotes.staffUserId))
    .where(and(eq(staffNotes.targetType, "deposit"), eq(staffNotes.targetId, d.id)))
    .orderBy(asc(staffNotes.createdAt));
  const [entry] = d.creditedEntryId ? await db.select().from(journalEntries).where(eq(journalEntries.id, d.creditedEntryId)).limit(1) : [];

  const method = readinessOf(d.method as DepositMethodId);
  const status = d.status as DepositStatus;
  const first = reviews.find((r) => r.step === "first");
  const blockers: string[] = [];
  if (!method.verification.available) blockers.push(`${method.name} verification isn't configured, so this deposit can't be verified or credited. ${method.blockers[0] ?? ""}`.trim());
  let next: NextAction = { id: "none", label: "No action needed", explain: STAFF_EXPLAIN[status] ?? DEPOSIT_STATUS_META[status].explain };
  if (method.verification.available) {
    if (status === "awaiting_payment" || status === "expired") {
      next = { id: "record_receipt", label: "Record bank receipt (review 1 of 2)", explain: "When the transfer appears on Sociotix's bank statement, record its reference, amount, date and payer. Nothing is credited at this step." };
      blockers.push("No bank receipt has been recorded yet.");
    } else if (status === "under_review") {
      const self = viewerUserId && first?.by === viewerUserId;
      next = { id: "verify_and_credit", label: "Verify and credit (review 2 of 2)", explain: "A second staff member checks the recorded receipt against the bank statement, then credits the wallet." };
      blockers.push(self ? "You recorded this receipt, so a different staff member must verify it." : "Needs a second reviewer who didn't record the receipt.");
    }
  }
  if (status === "awaiting_payment" && !method.verification.available) next = { id: "wait_for_customer", label: "Waiting", explain: "Nothing can be verified until the method's verification is configured." };

  const who = (n: string | null, e: string) => n || e;
  return {
    reference: d.publicRef,
    amountCents: d.amountCents,
    currency: d.currency,
    method: d.method as DepositMethodId,
    methodName: method.name,
    processor: d.processor,
    status,
    statusReason: d.statusReason,
    requestedAt: d.requestedAt.toISOString(),
    expiresAt: d.expiresAt?.toISOString() ?? null,
    settledAt: d.settledAt?.toISOString() ?? null,
    paymentReference: d.processorRef,
    customer: { publicRef: row.c.publicRef, accountRef: row.c.accountRef, name: row.c.displayName || `${row.c.firstName} ${row.c.lastName}`.trim(), email: row.email },
    reviews: reviews.map((r) => ({ step: r.step as "first" | "second", decision: r.decision as "approve" | "reject", evidence: r.checklist as Record<string, unknown>, decidedAt: r.decidedAt.toISOString(), by: who(r.byName, r.byEmail), mine: Boolean(viewerUserId && r.by === viewerUserId) })),
    notes: notes.map((n) => ({ id: n.id, body: n.body, at: n.at.toISOString(), by: who(n.byName, n.byEmail) })),
    ledgerEntry: entry ? { id: entry.id, kind: entry.kind, postedAt: entry.createdAt.toISOString(), idempotencyKey: entry.idempotencyKey } : null,
    verification: method.verification,
    blockers,
    next,
  };
}

/* Verification ------------------------------------------------------------- */

const SAFE_TEXT = /^[\p{L}\p{N} .,'&()\/#:_-]+$/u;

/** Evidence from Sociotix's own bank statement — never from the customer. */
export const bankReceiptSchema = z
  .object({
    bankReference: z.string().trim().min(3, "Enter the bank's transaction reference.").max(60).regex(/^[A-Za-z0-9 ._\/-]+$/, "Use letters, numbers, spaces, dots, dashes or slashes."),
    amountReceivedCents: z.number().int().positive(),
    receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date the money arrived."),
    payerName: z.string().trim().min(2).max(120).regex(SAFE_TEXT, "Use the payer name as it appears on the statement."),
    checks: z
      .object({
        onBankStatement: z.literal(true, { message: "Confirm the transfer is on Sociotix's bank statement." }),
        referenceMatches: z.literal(true, { message: "Confirm the deposit reference matches." }),
        fundsCleared: z.literal(true, { message: "Confirm the funds have cleared." }),
      })
      .strict(),
    note: z.string().trim().max(500).optional().default(""),
  })
  .strict();

type Staff = { userId: string };

function requireVerification(method: DepositMethodId) {
  const r = readinessOf(method);
  if (!r.verification.available) throw new AppError("FEATURE_DISABLED", `${r.name} verification isn't configured, so this deposit can't be verified.`, { details: { method } });
  if (r.verification.kind !== "bank_statement_review") throw new AppError("FEATURE_DISABLED", "This deposit can only be confirmed by its payment processor.");
}

/**
 * Review 1 of 2: record the transfer as it appears on Sociotix's bank
 * statement. The amount must match exactly; partial or excess payments can't
 * be credited (reject and contact the customer). Nothing is credited here.
 */
export async function recordBankReceipt(db: Db, staff: Staff, reference: string, raw: unknown, client: Client = {}) {
  const ev = bankReceiptSchema.parse(raw);
  if (ev.note && looksSensitive(ev.note)) throw new AppError("VALIDATION_FAILED", "Notes can't contain passwords, codes, keys or card numbers.", { details: { field: "note" } });
  try {
    return await db.transaction(async (tx) => {
      const [d] = await tx.select().from(deposits).where(eq(deposits.publicRef, reference)).for("update").limit(1);
      if (!d) throw errors.notFound("That deposit");
      requireVerification(d.method as DepositMethodId);
      if (d.status !== "awaiting_payment" && d.status !== "expired") throw errors.conflict(`This deposit is ${DEPOSIT_STATUS_META[d.status as DepositStatus].label.toLowerCase()}; a receipt can't be recorded now.`);
      if (ev.amountReceivedCents !== d.amountCents)
        throw new AppError("VALIDATION_FAILED", "The amount received doesn't match the request. Partial or excess payments can't be credited — reject this request and contact the customer.", { details: { field: "amountReceivedCents" } });
      const received = new Date(`${ev.receivedOn}T12:00:00Z`);
      const earliest = new Date(d.requestedAt.getTime() - 86_400_000);
      if (Number.isNaN(received.getTime()) || received.getTime() > Date.now() + 86_400_000 || received < earliest)
        throw new AppError("VALIDATION_FAILED", "The received date must be on or after the request date and not in the future.", { details: { field: "receivedOn" } });
      await tx.update(deposits).set({ status: "under_review", processorRef: ev.bankReference, settledAt: received, updatedAt: new Date() }).where(eq(deposits.id, d.id));
      await tx.insert(depositReviews).values({
        depositId: d.id,
        step: "first",
        decision: "approve",
        checklist: { source: "bank_statement", bankReference: ev.bankReference, amountReceivedCents: ev.amountReceivedCents, receivedOn: ev.receivedOn, payerName: ev.payerName, checks: ev.checks, note: ev.note || null },
        decidedBy: staff.userId,
      });
      await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "deposit.receipt_recorded", targetType: "deposit", targetId: d.id, after: { bankReference: ev.bankReference, amountCents: ev.amountReceivedCents }, ip: client.ip, userAgent: client.userAgent });
    });
  } catch (e) {
    if (pgErrorOf(e)?.code === "23505" && pgErrorOf(e)?.constraint === "deposits_processor_ref_key") throw errors.conflict("That bank reference is already recorded on another deposit. One payment can only be credited once.");
    throw e;
  }
}

/**
 * Review 2 of 2: a different staff member verifies the recorded receipt and
 * the wallet is credited — atomically and exactly once. Retrying after a
 * success returns the credited deposit without posting again.
 */
export async function verifyAndCredit(db: Db, staff: Staff, reference: string, client: Client = {}) {
  return db.transaction(async (tx) => {
    const [d] = await tx.select().from(deposits).where(eq(deposits.publicRef, reference)).for("update").limit(1);
    if (!d) throw errors.notFound("That deposit");
    if (d.status === "credited") return { credited: true, replayed: true, entryId: d.creditedEntryId! };
    requireVerification(d.method as DepositMethodId);
    if (d.status !== "under_review") throw errors.conflict("Record the bank receipt (review 1 of 2) before verifying.");
    const [first] = await tx.select().from(depositReviews).where(and(eq(depositReviews.depositId, d.id), eq(depositReviews.step, "first"))).limit(1);
    if (!first || first.decision !== "approve") throw errors.conflict("This deposit has no recorded receipt to verify.");
    if (first.decidedBy === staff.userId) throw errors.conflict("You recorded this receipt. A different staff member must verify it.");

    await tx.insert(depositReviews).values({ depositId: d.id, step: "second", decision: "approve", checklist: { source: "bank_statement", verifiedAgainstStatement: true }, decidedBy: staff.userId });
    const wallet = await openWallet(tx, d.customerId);
    const clearing = await openClearingAccount(tx, d.processor);
    const posted = await postJournalEntry(tx as unknown as Db, {
      kind: "deposit_credit",
      idempotencyKey: `deposit:${d.id}:credit`,
      description: `Deposit ${d.publicRef} credited`,
      reference: { type: "deposit", id: d.publicRef },
      createdBy: first.decidedBy,
      approvedBy: staff.userId,
      lines: [
        { accountCode: clearing, amountCents: d.amountCents },
        { accountCode: wallet, amountCents: -d.amountCents },
      ],
    });
    await tx.update(deposits).set({ status: "credited", creditedEntryId: posted.entryId, statusReason: null, updatedAt: new Date() }).where(eq(deposits.id, d.id));
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "deposit.credited", targetType: "deposit", targetId: d.id, after: { amountCents: d.amountCents, entryId: posted.entryId, recordedBy: first.decidedBy }, ip: client.ip, userAgent: client.userAgent });
    return { credited: true, replayed: false, entryId: posted.entryId };
  });
}

export const rejectSchema = z.object({ reason: z.string().trim().min(10, "Explain the rejection in at least 10 characters.").max(300) }).strict();

/** Reject a request. The reason is shown to the customer. After a receipt is recorded, only a different person can reject. */
export async function rejectDeposit(db: Db, staff: Staff, reference: string, raw: unknown, client: Client = {}) {
  const { reason } = rejectSchema.parse(raw);
  if (looksSensitive(reason)) throw new AppError("VALIDATION_FAILED", "The reason can't contain passwords, codes, keys or card numbers.", { details: { field: "reason" } });
  return db.transaction(async (tx) => {
    const [d] = await tx.select().from(deposits).where(eq(deposits.publicRef, reference)).for("update").limit(1);
    if (!d) throw errors.notFound("That deposit");
    if (!["awaiting_payment", "expired", "under_review"].includes(d.status)) throw errors.conflict(`This deposit is ${DEPOSIT_STATUS_META[d.status as DepositStatus].label.toLowerCase()} and can't be rejected.`);
    if (d.status === "expired") {
      // An expired request with nothing received is already closed for the customer.
      throw errors.conflict("This request has expired. Record a late receipt or leave it expired.");
    }
    if (d.status === "under_review") {
      const [first] = await tx.select().from(depositReviews).where(and(eq(depositReviews.depositId, d.id), eq(depositReviews.step, "first"))).limit(1);
      if (first?.decidedBy === staff.userId) throw errors.conflict("You recorded this receipt. A different staff member must review it.");
      await tx.insert(depositReviews).values({ depositId: d.id, step: "second", decision: "reject", checklist: { reason }, decidedBy: staff.userId });
    } else {
      await tx.insert(depositReviews).values({ depositId: d.id, step: "first", decision: "reject", checklist: { reason }, decidedBy: staff.userId });
    }
    await tx.update(deposits).set({ status: "rejected", statusReason: reason, updatedAt: new Date() }).where(eq(deposits.id, d.id));
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "deposit.rejected", targetType: "deposit", targetId: d.id, after: { reason }, ip: client.ip, userAgent: client.userAgent });
  });
}

export const noteSchema = z.object({ body: z.string().trim().min(1).max(1000) }).strict();

export async function addDepositNote(db: Db, staff: Staff, reference: string, raw: unknown) {
  const { body } = noteSchema.parse(raw);
  if (looksSensitive(body)) throw new AppError("VALIDATION_FAILED", "Notes can't contain passwords, codes, keys or card numbers.", { details: { field: "body" } });
  const [d] = await db.select({ id: deposits.id }).from(deposits).where(eq(deposits.publicRef, reference)).limit(1);
  if (!d) throw errors.notFound("That deposit");
  await db.insert(staffNotes).values({ targetType: "deposit", targetId: d.id, staffUserId: staff.userId, body });
}

export { methodReadiness };
