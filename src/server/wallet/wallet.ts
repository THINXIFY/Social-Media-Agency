import "server-only";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { Executor } from "../db/client";
import { deposits, journalEntries, journalLines, ledgerAccounts } from "../db/schema";
import { walletCode } from "../ledger/accounts";

/**
 * Read-only customer wallet views, derived from the immutable ledger.
 *
 *  - available: the wallet account's balance = credits − debits on
 *    `wallet:<customer>` (a liability: money SociVanta holds for the customer).
 *  - pending: deposits submitted but not yet credited. Never part of the
 *    available balance and never spendable.
 *
 * Nothing here writes. Customers see their own lines only, with friendly
 * labels — no internal accounts, idempotency keys or staff identities.
 */

const PENDING_DEPOSIT = ["created", "awaiting_payment", "settling", "settled", "under_review"] as const;

const KIND_LABEL: Record<string, string> = {
  deposit_credit: "Deposit",
  order_debit: "Order payment",
  order_cancel: "Order cancelled — returned",
  refund: "Refund",
  reward_credit: "Referral reward",
  adjustment: "Adjustment",
  reversal: "Correction",
};

export interface WalletSummary {
  currency: "USD";
  /** Spendable balance in cents (from ledger lines). */
  availableCents: number;
  /** Submitted deposits not yet verified, in cents. Not spendable. */
  pendingCents: number;
  hasWallet: boolean;
}

export async function walletSummary(db: Executor, customerId: string): Promise<WalletSummary> {
  const [account] = await db.select({ id: ledgerAccounts.id }).from(ledgerAccounts).where(eq(ledgerAccounts.code, walletCode(customerId))).limit(1);
  const [{ credits }] = account
    ? (await db.execute<{ credits: string }>(sql`select coalesce(-sum(amount_cents), 0)::text as credits from journal_lines where account_id = ${account.id}`)).rows
    : [{ credits: "0" }];
  const [{ pending }] = (
    await db.execute<{ pending: string }>(
      sql`select coalesce(sum(amount_cents), 0)::text as pending from deposits where customer_id = ${customerId} and status in ${PENDING_DEPOSIT as unknown as string[]}`,
    )
  ).rows;
  return { currency: "USD", availableCents: Number(credits), pendingCents: Number(pending), hasWallet: Boolean(account) };
}

export interface WalletEntry {
  id: string;
  at: string;
  label: string;
  /** Positive = money in, negative = money out (from the customer's point of view). */
  amountCents: number;
}

export async function walletEntries(db: Executor, customerId: string, page = 1, pageSize = 20) {
  const size = Math.min(Math.max(pageSize, 1), 50);
  const p = Math.min(Math.max(page, 1), 1000);
  const [account] = await db.select({ id: ledgerAccounts.id }).from(ledgerAccounts).where(eq(ledgerAccounts.code, walletCode(customerId))).limit(1);
  if (!account) return { items: [] as WalletEntry[], total: 0, page: p, pageSize: size };
  const [{ total }] = await db.select({ total: count() }).from(journalLines).where(eq(journalLines.accountId, account.id));
  const rows = await db
    .select({ id: journalLines.id, at: journalEntries.createdAt, kind: journalEntries.kind, amount: journalLines.amountCents })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(eq(journalLines.accountId, account.id))
    .orderBy(desc(journalEntries.createdAt))
    .limit(size)
    .offset((p - 1) * size);
  // Wallet is a liability: a credit (negative line) is money in for the customer.
  return { items: rows.map((r) => ({ id: r.id, at: r.at.toISOString(), label: KIND_LABEL[r.kind] ?? "Wallet entry", amountCents: -r.amount })), total, page: p, pageSize: size };
}

/** Pending deposits count, for summaries (read-only). */
export async function pendingDepositCount(db: Executor, customerIds: string[]) {
  if (!customerIds.length) return new Map<string, number>();
  const rows = await db
    .select({ customerId: deposits.customerId, n: count() })
    .from(deposits)
    .where(and(inArray(deposits.customerId, customerIds), inArray(deposits.status, [...PENDING_DEPOSIT])))
    .groupBy(deposits.customerId);
  return new Map(rows.map((r) => [r.customerId, r.n]));
}
