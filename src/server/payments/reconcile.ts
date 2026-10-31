import "server-only";
import { sql } from "drizzle-orm";
import { OPEN_DEPOSIT_STATUSES } from "@/lib/deposits";
import type { Db } from "../db/client";
import { verifyLedger } from "../ledger/ledger";

/**
 * Read-only financial reporting and reconciliation. Nothing here writes: a
 * failed check is reported (and the worker job logs and fails loudly) so a
 * person investigates. Balances are never "fixed" automatically.
 *
 * Customer deposits are liabilities (money owed to customers), never revenue.
 */

const n = (v: unknown) => Number(v ?? 0);

/**
 * Current position from the maintained balances (account_balances) and deposit counts.
 * Cheap at any ledger size, so the admin overview and reports use this (5I-B).
 */
export async function balanceSummary(db: Db) {
  const wallets = await db.execute<{ total: string; customers: string; negative: string }>(sql`
    select coalesce(sum(b.balance_cents), 0)::text as total,
           count(*) filter (where coalesce(b.balance_cents, 0) > 0)::text as customers,
           count(*) filter (where coalesce(b.balance_cents, 0) < 0)::text as negative
      from ledger_accounts a left join account_balances b on b.account_id = a.id
     where a.code like 'wallet:%'`);
  const deposits = await db.execute<{ status: string; n: string; cents: string }>(sql`
    select status, count(*)::text as n, coalesce(sum(amount_cents), 0)::text as cents from deposits group by status`);
  const system = await db.execute<{ code: string; cents: string }>(sql`
    select a.code, coalesce(b.balance_cents, 0)::text as cents
      from ledger_accounts a left join account_balances b on b.account_id = a.id
     where a.code like 'processor_clearing:%' or a.code in ('revenue:orders', 'refunds', 'manual_adjustments', 'orders_in_progress')`);

  const byStatus = Object.fromEntries(deposits.rows.map((r) => [r.status, { count: n(r.n), cents: n(r.cents) }]));
  const sumOf = (statuses: string[]) => statuses.reduce((s, k) => ({ count: s.count + (byStatus[k]?.count ?? 0), cents: s.cents + (byStatus[k]?.cents ?? 0) }), { count: 0, cents: 0 });
  const sys = Object.fromEntries(system.rows.map((r) => [r.code, n(r.cents)]));

  return {
    walletLiabilitiesCents: n(wallets.rows[0]?.total),
    fundedCustomers: n(wallets.rows[0]?.customers),
    negativeWallets: n(wallets.rows[0]?.negative),
    deposits: {
      credited: sumOf(["credited"]),
      pending: sumOf(OPEN_DEPOSIT_STATUSES),
      awaitingVerification: sumOf(["under_review", "settled"]),
      rejected: sumOf(["rejected"]),
      expired: sumOf(["expired"]),
      cancelled: sumOf(["cancelled"]),
      failed: sumOf(["failed"]),
    },
    clearing: Object.fromEntries(Object.entries(sys).filter(([c]) => c.startsWith("processor_clearing:"))),
    revenueCents: sys["revenue:orders"] ?? 0,
    /** Paid for orders not yet recognised as revenue (deferred) — still owed to customers if an order doesn't complete. */
    committedToOrdersCents: sys["orders_in_progress"] ?? 0,
  };
}

/**
 * The balances plus all-time wallet movements by journal kind. The movements scan every
 * wallet ledger line, so this is for payments reconciliation, not page-level analytics.
 */
export async function financialSummary(db: Db) {
  const [balances, movements] = await Promise.all([
    balanceSummary(db),
    // Wallet movements by journal kind, from the customers' side (positive = added to wallets).
    db.execute<{ kind: string; cents: string; entries: string }>(sql`
      select e.kind, (-coalesce(sum(l.amount_cents), 0))::text as cents, count(distinct e.id)::text as entries
        from journal_lines l join journal_entries e on e.id = l.entry_id join ledger_accounts a on a.id = l.account_id
       where a.code like 'wallet:%' group by e.kind`),
  ]);
  const kind = Object.fromEntries(movements.rows.map((r) => [r.kind, { cents: n(r.cents), entries: n(r.entries) }]));
  const k = (name: string) => kind[name] ?? { cents: 0, entries: 0 };
  return {
    ...balances,
    walletMovements: {
      depositCredits: k("deposit_credit"),
      orderDebits: k("order_debit"),
      orderCancellations: k("order_cancel"),
      refunds: k("refund"),
      adjustments: k("adjustment"),
      rewards: k("reward_credit"),
      reversals: k("reversal"),
    },
  };
}

export interface ReconciliationException {
  code:
    | "ledger_unbalanced"
    | "balance_mismatch"
    | "credited_without_entry"
    | "credit_amount_mismatch"
    | "orphan_deposit_credit"
    | "negative_wallet"
    | "wallet_total_mismatch"
    | "order_charge_mismatch"
    | "order_release_mismatch"
    | "orphan_order_debit"
    | "committed_funds_mismatch"
    | "revenue_mismatch";
  message: string;
  reference?: string;
}

/** Runs every invariant and returns the exceptions found. Read-only. */
export async function reconcile(db: Db) {
  const exceptions: ReconciliationException[] = [];
  const ledger = await verifyLedger(db);
  if (ledger.unbalancedEntries) exceptions.push({ code: "ledger_unbalanced", message: `${ledger.unbalancedEntries} journal entries don't balance.` });
  for (const m of ledger.balanceMismatches) exceptions.push({ code: "balance_mismatch", message: `Stored balance ${m.stored} ≠ computed ${m.computed}.`, reference: m.code });

  // Every credited deposit has exactly one deposit_credit entry paying exactly its amount into its customer's wallet.
  const credited = await db.execute<{ ref: string; amount: string; paid: string | null; kind: string | null }>(sql`
    select d.public_ref as ref, d.amount_cents::text as amount, e.kind,
           (select (-sum(l.amount_cents))::text from journal_lines l join ledger_accounts a on a.id = l.account_id
             where l.entry_id = e.id and a.code = 'wallet:' || lower(d.customer_id::text)) as paid
      from deposits d left join journal_entries e on e.id = d.credited_entry_id
     where d.status = 'credited'`);
  for (const r of credited.rows) {
    if (r.kind !== "deposit_credit") exceptions.push({ code: "credited_without_entry", message: "Credited deposit has no deposit_credit ledger entry.", reference: r.ref });
    else if (n(r.paid) !== n(r.amount)) exceptions.push({ code: "credit_amount_mismatch", message: `Deposit amount ${r.amount} ≠ wallet credit ${r.paid ?? 0}.`, reference: r.ref });
  }
  // Every deposit_credit entry belongs to exactly one credited deposit.
  const orphans = await db.execute<{ id: string; ref: string | null }>(sql`
    select e.id, e.reference_id as ref from journal_entries e
     where e.kind = 'deposit_credit' and not exists (select 1 from deposits d where d.credited_entry_id = e.id and d.status = 'credited')`);
  for (const r of orphans.rows) exceptions.push({ code: "orphan_deposit_credit", message: "A deposit credit isn't linked to a credited deposit.", reference: r.ref ?? r.id });

  // Orders: each charge takes exactly the total; each release returns exactly the total; nothing is charged without an order.
  const charges = await db.execute<{ ref: string; total: string; charged: string | null; released: string | null; payment: string }>(sql`
    select o.public_ref as ref, o.total_cents::text as total, o.payment_status as payment,
           (select sum(l.amount_cents)::text from journal_lines l join journal_entries e on e.id = l.entry_id join ledger_accounts a on a.id = l.account_id
             where e.id = o.debit_entry_id and e.kind = 'order_debit' and a.code = 'wallet:' || lower(o.customer_id::text)) as charged,
           (select (-sum(l.amount_cents))::text from journal_lines l join journal_entries e on e.id = l.entry_id join ledger_accounts a on a.id = l.account_id
             where e.id = o.release_entry_id and e.kind = 'order_cancel' and a.code = 'wallet:' || lower(o.customer_id::text)) as released
      from orders o`);
  for (const r of charges.rows) {
    if (n(r.charged) !== n(r.total)) exceptions.push({ code: "order_charge_mismatch", message: `Order total ${r.total} ≠ wallet charge ${r.charged ?? 0}.`, reference: r.ref });
    if (r.payment === "released" && n(r.released) !== n(r.total)) exceptions.push({ code: "order_release_mismatch", message: `Order total ${r.total} ≠ amount returned ${r.released ?? 0}.`, reference: r.ref });
  }
  const orphanDebits = await db.execute<{ id: string; ref: string | null }>(sql`
    select e.id, e.reference_id as ref from journal_entries e
     where e.kind = 'order_debit' and not exists (select 1 from orders o where o.debit_entry_id = e.id)`);
  for (const r of orphanDebits.rows) exceptions.push({ code: "orphan_order_debit", message: "An order charge isn't linked to an order.", reference: r.ref ?? r.id });
  const committed = await db.execute<{ expected: string; recognised: string }>(sql`
    select coalesce(sum(total_cents) filter (where payment_status in ('charged', 'refund_review') and revenue_status = 'deferred'), 0)::text as expected,
           coalesce(sum(total_cents) filter (where revenue_status = 'recognized'), 0)::text as recognised
      from orders`);

  const summary = await financialSummary(db);
  if (n(committed.rows[0]?.expected) !== summary.committedToOrdersCents)
    exceptions.push({ code: "committed_funds_mismatch", message: `Funds committed to orders ${summary.committedToOrdersCents} ≠ open order totals ${committed.rows[0]?.expected ?? 0}.` });
  if (n(committed.rows[0]?.recognised) !== summary.revenueCents)
    exceptions.push({ code: "revenue_mismatch", message: `Recognised revenue ${summary.revenueCents} ≠ recognised order totals ${committed.rows[0]?.recognised ?? 0}.` });
  if (summary.negativeWallets) exceptions.push({ code: "negative_wallet", message: `${summary.negativeWallets} wallets are below zero.` });
  const movementTotal = Object.values(summary.walletMovements).reduce((s, m) => s + m.cents, 0);
  if (movementTotal !== summary.walletLiabilitiesCents)
    exceptions.push({ code: "wallet_total_mismatch", message: `Wallet liabilities ${summary.walletLiabilitiesCents} ≠ sum of wallet movements ${movementTotal}.` });

  return { ok: exceptions.length === 0, checkedAt: new Date().toISOString(), exceptions, summary };
}
