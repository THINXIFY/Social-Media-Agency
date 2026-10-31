import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { accountBalances, journalEntries, journalLines, ledgerAccounts } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { walletCode } from "@/server/ledger/accounts";
import { balanceOf, postJournalEntry, verifyLedger } from "@/server/ledger/ledger";
import { createCustomer, ensureReferenceData, fundWallet, sqlState, testDb } from "./helpers";

let db: Db;
beforeAll(async () => {
  db = testDb(30);
  await ensureReferenceData(db);
});
afterAll(() => db.$client.end());

const key = () => `test-${randomUUID()}`;
const appCode = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
  return "resolved";
};

/** Order payment: wallet → orders_in_progress. */
const charge = (customerId: string, cents: number, idempotencyKey = key()) =>
  postJournalEntry(db, {
    kind: "order_debit",
    idempotencyKey,
    description: "Order payment",
    lines: [
      { accountCode: walletCode(customerId), amountCents: cents },
      { accountCode: "orders_in_progress", amountCents: -cents },
    ],
  });

describe("double-entry ledger", () => {
  it("posts balanced entries and keeps funds, revenue and refunds separate", async () => {
    const { customer } = await createCustomer(db);
    await fundWallet(db, customer.id, 10_000);
    await charge(customer.id, 1_840);
    // Recognise revenue on completion.
    await postJournalEntry(db, {
      kind: "order_revenue",
      idempotencyKey: key(),
      description: "Order completed",
      lines: [
        { accountCode: "orders_in_progress", amountCents: 1_840 },
        { accountCode: "revenue:orders", amountCents: -1_840 },
      ],
    });
    // Partial refund after completion.
    await postJournalEntry(db, {
      kind: "refund",
      idempotencyKey: key(),
      description: "Partial refund",
      lines: [
        { accountCode: "refunds", amountCents: 340 },
        { accountCode: walletCode(customer.id), amountCents: -340 },
      ],
    });
    expect(await balanceOf(db, walletCode(customer.id))).toBe(10_000 - 1_840 + 340);
    expect((await verifyLedger(db)).ok).toBe(true);
  });

  it("rejects unbalanced or one-sided postings before touching the database", async () => {
    const { customer } = await createCustomer(db);
    expect(await appCode(postJournalEntry(db, { kind: "adjustment", idempotencyKey: key(), description: "x", lines: [{ accountCode: walletCode(customer.id), amountCents: -5 }, { accountCode: "manual_adjustments", amountCents: 4 }] }))).toBe("LEDGER_INVARIANT");
    await expect(postJournalEntry(db, { kind: "adjustment", idempotencyKey: key(), description: "x", lines: [{ accountCode: "manual_adjustments", amountCents: 5 }] })).rejects.toThrow();
    expect(await appCode(postJournalEntry(db, { kind: "adjustment", idempotencyKey: key(), description: "x", lines: [{ accountCode: "nope:1", amountCents: 5 }, { accountCode: "manual_adjustments", amountCents: -5 }] }))).toBe("LEDGER_INVARIANT");
  });

  it("the database itself refuses unbalanced entries at commit", async () => {
    const [acct] = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.code, "manual_adjustments"));
    const attempt = db.transaction(async (tx) => {
      const [e] = await tx.insert(journalEntries).values({ kind: "adjustment", idempotencyKey: key(), requestHash: "x", description: "raw" }).returning();
      await tx.insert(journalLines).values({ entryId: e.id, accountId: acct.id, amountCents: 100 });
    });
    expect(await sqlState(attempt)).toBe("SV002");
    const empty = db.insert(journalEntries).values({ kind: "adjustment", idempotencyKey: key(), requestHash: "x", description: "no lines" });
    expect(await sqlState(empty)).toBe("SV002");
  });

  it("posted entries and balances are immutable", async () => {
    const { customer } = await createCustomer(db);
    const { entryId } = await fundWallet(db, customer.id, 500);
    expect(await sqlState(db.update(journalLines).set({ amountCents: 999 }).where(eq(journalLines.entryId, entryId)))).toBe("SV001");
    expect(await sqlState(db.delete(journalLines).where(eq(journalLines.entryId, entryId)))).toBe("SV001");
    expect(await sqlState(db.update(journalEntries).set({ description: "edited" }).where(eq(journalEntries.id, entryId)))).toBe("SV001");
    expect(await sqlState(db.execute(sql`truncate journal_lines cascade`))).toBe("SV001");
    expect(await sqlState(db.update(accountBalances).set({ balanceCents: 1_000_000 }))).toBe("SV008");
    expect(await sqlState(db.update(ledgerAccounts).set({ allowNegative: true }).where(eq(ledgerAccounts.code, walletCode(customer.id))))).toBe("SV001");
  });

  it("a wallet can never go negative — even via raw SQL", async () => {
    const { customer } = await createCustomer(db);
    await fundWallet(db, customer.id, 1_000);
    expect(await appCode(charge(customer.id, 1_001))).toBe("INSUFFICIENT_FUNDS");
    const [wallet] = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.code, walletCode(customer.id)));
    const [oip] = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.code, "orders_in_progress"));
    const raw = db.transaction(async (tx) => {
      const [e] = await tx.insert(journalEntries).values({ kind: "order_debit", idempotencyKey: key(), requestHash: "x", description: "bypass" }).returning();
      await tx.insert(journalLines).values([
        { entryId: e.id, accountId: wallet.id, amountCents: 5_000 },
        { entryId: e.id, accountId: oip.id, amountCents: -5_000 },
      ]);
    });
    expect(await sqlState(raw)).toBe("SV003");
    expect(await balanceOf(db, walletCode(customer.id))).toBe(1_000);
  });

  it("concurrent debits never overdraw a wallet", async () => {
    const { customer } = await createCustomer(db);
    await fundWallet(db, customer.id, 10_000); // $100
    // 25 simultaneous $10 charges: exactly 10 may succeed.
    const results = await Promise.allSettled(Array.from({ length: 25 }, () => charge(customer.id, 1_000)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const refused = results.filter((r) => r.status === "rejected" && r.reason instanceof AppError && r.reason.code === "INSUFFICIENT_FUNDS").length;
    expect(ok).toBe(10);
    expect(refused).toBe(15);
    expect(await balanceOf(db, walletCode(customer.id))).toBe(0);
    expect((await verifyLedger(db)).ok).toBe(true);
  });

  it("idempotency: retries return the original entry, never a second posting", async () => {
    const { customer } = await createCustomer(db);
    await fundWallet(db, customer.id, 5_000);
    const k = key();
    const first = await charge(customer.id, 700, k);
    const again = await charge(customer.id, 700, k);
    expect(first.replayed).toBe(false);
    expect(again).toEqual({ entryId: first.entryId, replayed: true });
    expect(await appCode(charge(customer.id, 701, k))).toBe("IDEMPOTENCY_CONFLICT");
    expect(await balanceOf(db, walletCode(customer.id))).toBe(4_300);
  });

  it("idempotency holds under concurrency", async () => {
    const { customer } = await createCustomer(db);
    await fundWallet(db, customer.id, 5_000);
    const k = key();
    const results = await Promise.all(Array.from({ length: 12 }, () => charge(customer.id, 900, k)));
    expect(new Set(results.map((r) => r.entryId)).size).toBe(1);
    expect(results.filter((r) => !r.replayed).length).toBe(1);
    const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from journal_entries where idempotency_key = ${k}`)).rows;
    expect(n).toBe(1);
    expect(await balanceOf(db, walletCode(customer.id))).toBe(4_100);
  });

  it("four-eyes: approver must differ from creator", async () => {
    const { customer, user } = await createCustomer(db);
    const lines = [
      { accountCode: "manual_adjustments", amountCents: 100 },
      { accountCode: walletCode(customer.id), amountCents: -100 },
    ];
    expect(await appCode(postJournalEntry(db, { kind: "adjustment", idempotencyKey: key(), description: "x", createdBy: user.id, approvedBy: user.id, lines }))).toBe("CONFLICT");
  });
});
