/**
 * Admin payment views, derived from the existing admin demo records.
 *
 * Every transaction here is one of: a deposit from `ADMIN_DEPOSITS`, the wallet
 * charge for an order in `ADMIN_ORDERS`, or that order's refund. Nothing is
 * invented — there are no adjustments, fees, processor events or refund
 * requests on record, so the UI reports them as missing. Totals reconcile
 * with `ADMIN_SUMMARY`. The one piece of admin state is internal notes, kept
 * in this browser under `sv-admin-payments`.
 */

import * as React from "react";
import {
  ADMIN_DEPOSITS,
  ADMIN_NOW,
  ADMIN_ORDERS,
  ADMIN_TICKETS,
  type AdminDeposit,
  type AdminTicket,
  CUSTOMER_BY_ID,
  orderService,
  usd,
} from "@/lib/admin-demo";

const NOW = Date.parse(ADMIN_NOW);
const cents = (n: number) => Math.round(n * 100) / 100;
const sum = (list: number[]) => cents(list.reduce((a, b) => a + b, 0));

export type TxnType = "deposit" | "order_payment" | "refund" | "adjustment";
export type TxnStatus = "credited" | "pending" | "failed" | "paid" | "refunded";
export type MethodKey = "crypto" | "card" | "bank" | "wallet";

export interface AdminTxn {
  /** Stable ID: the deposit ID, or the order ID with -charge / -refund. */
  id: string;
  /** The reference staff search by: deposit or order ID. */
  ref: string;
  type: TxnType;
  status: TxnStatus;
  customerId: string;
  orderId?: string;
  deposit?: AdminDeposit;
  method: string;
  methodKey: MethodKey;
  /** Null when the record has no time (refunds). */
  at: string | null;
  sortAt: string;
  /** Always positive. */
  amount: number;
  /** Signed effect on the customer's available balance; 0 when nothing was credited. */
  effect: number;
  label: string;
}

export const TYPE_META: Record<TxnType, { label: string; plural: string }> = {
  deposit: { label: "Deposit", plural: "Deposits" },
  order_payment: { label: "Order payment", plural: "Order payments" },
  refund: { label: "Refund", plural: "Refunds" },
  adjustment: { label: "Adjustment", plural: "Adjustments" },
};

export const STATUS_META: Record<TxnStatus, { label: string; explain: string }> = {
  credited: { label: "Credited", explain: "The deposit was credited to the customer's wallet." },
  pending: { label: "Pending verification", explain: "Submitted by the customer and waiting for staff to confirm settlement. Not credited." },
  failed: { label: "Failed", explain: "The payment didn't complete, so nothing was credited." },
  paid: { label: "Paid from wallet", explain: "Charged from the customer's wallet balance when the order was placed." },
  refunded: { label: "Refunded to wallet", explain: "Returned to the customer's wallet balance after the order was cancelled or partly delivered." },
};

export const METHOD_LABEL: Record<MethodKey, string> = { crypto: "Crypto", card: "Card", bank: "Bank transfer", wallet: "Wallet balance" };

const methodKeyOf = (m: AdminDeposit["method"]): MethodKey => (m.startsWith("Crypto") ? "crypto" : m === "Card" ? "card" : "bank");

export const ADMIN_TXNS: AdminTxn[] = (() => {
  const list: AdminTxn[] = [];
  for (const d of ADMIN_DEPOSITS) {
    const status: TxnStatus = d.status === "credited" ? "credited" : d.status === "verification" ? "pending" : "failed";
    list.push({
      id: d.id,
      ref: d.id,
      type: "deposit",
      status,
      customerId: d.customerId,
      deposit: d,
      method: d.method,
      methodKey: methodKeyOf(d.method),
      at: d.at,
      sortAt: d.at,
      amount: d.amount,
      effect: status === "credited" ? d.amount : 0,
      label: `Deposit · ${d.method}`,
    });
  }
  for (const o of ADMIN_ORDERS) {
    const name = orderService(o).service.name;
    list.push({
      id: `${o.id}-charge`,
      ref: o.id,
      type: "order_payment",
      status: "paid",
      customerId: o.customerId,
      orderId: o.id,
      method: METHOD_LABEL.wallet,
      methodKey: "wallet",
      at: o.placedAt,
      sortAt: o.placedAt,
      amount: o.amount,
      effect: -o.amount,
      label: name,
    });
    if (o.refunded) {
      list.push({
        id: `${o.id}-refund`,
        ref: o.id,
        type: "refund",
        status: "refunded",
        customerId: o.customerId,
        orderId: o.id,
        method: METHOD_LABEL.wallet,
        methodKey: "wallet",
        at: null,
        sortAt: `${o.placedAt}~`,
        amount: o.refunded,
        effect: o.refunded,
        label: `Refund · ${name}`,
      });
    }
  }
  return list.sort((a, b) => b.sortAt.localeCompare(a.sortAt));
})();

export const TXN_BY_ID: Record<string, AdminTxn> = Object.fromEntries(ADMIN_TXNS.map((t) => [t.id, t]));

/** Figures for the summary, all summed from the transactions above. */
export const PAYMENT_TOTALS = (() => {
  const of = (type: TxnType, status?: TxnStatus) => ADMIN_TXNS.filter((t) => t.type === type && (!status || t.status === status));
  const credited = sum(of("deposit", "credited").map((t) => t.amount));
  const orderPayments = sum(of("order_payment").map((t) => t.amount));
  const refunds = sum(of("refund").map((t) => t.amount));
  return {
    pending: sum(of("deposit", "pending").map((t) => t.amount)),
    pendingCount: of("deposit", "pending").length,
    failed: sum(of("deposit", "failed").map((t) => t.amount)),
    failedCount: of("deposit", "failed").length,
    credited,
    creditedCount: of("deposit", "credited").length,
    orderPayments,
    refunds,
    refundCount: of("refund").length,
    /** Customer funds held: credited deposits − order payments + refunds. Not revenue. */
    liabilities: cents(credited - orderPayments + refunds),
  };
})();

export const withinDays = (t: AdminTxn, days: number) => t.at !== null && NOW - Date.parse(t.at) <= days * 86_400_000;

/* -------------------------------------------------------------------------- */
/*  Attention, verification and next steps                                    */
/* -------------------------------------------------------------------------- */

export interface PaymentIssue {
  id: string;
  kind: "pending" | "failed" | "ticket";
  title: string;
  detail: string;
  at: string;
  action: string;
  /** Transaction to open, or a page to go to. */
  txnId?: string;
  href?: string;
}

const PAYMENT_TICKET = /deposit|refund|payment|wallet|charge/i;

/** Deposits to verify (oldest first), failed payments, then customers reporting payment problems. */
export function paymentIssues(): PaymentIssue[] {
  const pending = ADMIN_TXNS.filter((t) => t.status === "pending")
    .sort((a, b) => a.sortAt.localeCompare(b.sortAt))
    .map<PaymentIssue>((t) => ({
      id: t.id,
      kind: "pending",
      title: `${usd(t.amount)} deposit to verify`,
      detail: `${CUSTOMER_BY_ID[t.customerId].name} · ${t.method} · ${t.id} · not credited`,
      at: t.at!,
      action: "Review deposit",
      txnId: t.id,
    }));
  const failed = ADMIN_TXNS.filter((t) => t.status === "failed").map<PaymentIssue>((t) => ({
    id: t.id,
    kind: "failed",
    title: `${usd(t.amount)} deposit failed`,
    detail: `${CUSTOMER_BY_ID[t.customerId].name} · ${t.method} · ${t.id} · never credited`,
    at: t.at!,
    action: "Review",
    txnId: t.id,
  }));
  const tickets = ADMIN_TICKETS.filter((t: AdminTicket) => t.awaitingStaff && PAYMENT_TICKET.test(t.subject)).map<PaymentIssue>((t) => ({
    id: t.id,
    kind: "ticket",
    title: `“${t.subject}”`,
    detail: `${CUSTOMER_BY_ID[t.customerId].name} · ${t.id} · awaiting staff`,
    at: t.openedAt,
    action: "Open ticket",
    href: `/admin/support?ticket=${t.id}`,
  }));
  return [...pending, ...failed, ...tickets];
}

export interface VerifyCheck {
  id: string;
  question: string;
  ok: boolean | null;
  answer: string;
}

/** The five questions staff answer before a deposit could be credited. */
export function verificationOf(t: AdminTxn): VerifyCheck[] {
  const customer = CUSTOMER_BY_ID[t.customerId];
  return [
    { id: "who", question: "Who made the deposit?", ok: true, answer: `${customer.name} (${customer.id}, ${customer.email})` },
    { id: "method", question: "What payment method was used?", ok: true, answer: t.methodKey === "crypto" ? `${t.method}. Network not recorded.` : t.method },
    { id: "amount", question: "How much was requested?", ok: true, answer: `${usd(t.amount)} USD` },
    {
      id: "confirmation",
      question: "Has reliable payment confirmation been received?",
      ok: false,
      answer:
        t.status === "failed"
          ? "No. The payment was recorded as failed."
          : "No. No payment processor or bank feed is connected, so settlement can't be confirmed. Screenshots, customer-provided transaction hashes or claims aren't proof of settlement.",
    },
    {
      id: "action",
      question: "What action is required?",
      ok: null,
      answer:
        t.status === "failed"
          ? "Nothing to credit. Check with the customer if they still want to deposit."
          : "Confirm the funds arrived through a verified processor or bank statement, then approve. Approval needs an authenticated backend.",
    },
  ];
}

export type NextId = "review" | "follow_up" | "open_order" | "none";

export function nextStepOf(t: AdminTxn): { id: NextId; explain: string } {
  if (t.status === "pending") return { id: "review", explain: "Verify settlement before anything is credited. The customer's balance doesn't include this amount." };
  if (t.status === "failed") return { id: "follow_up", explain: "Nothing was credited. Follow up with the customer if they're still trying to pay." };
  if (t.type === "order_payment" || t.type === "refund") return { id: "open_order", explain: "Nothing to do here. The related order has the full context." };
  return { id: "none", explain: "Nothing to do. The deposit is part of the customer's balance." };
}

export interface TxnEvent {
  id: string;
  at: string | null;
  kind: "system" | "customer" | "staff";
  text: string;
  local?: boolean;
}

export function eventsOf(t: AdminTxn, notes: PaymentNote[]): TxnEvent[] {
  const name = CUSTOMER_BY_ID[t.customerId].name;
  const list: TxnEvent[] = [];
  if (t.type === "deposit") {
    list.push({ id: "submitted", at: t.at, kind: "customer", text: `${name} submitted a ${usd(t.amount)} deposit via ${t.method}` });
    if (t.status === "credited") list.push({ id: "credited", at: null, kind: "system", text: "Credited to the wallet (time not recorded separately)" });
    if (t.status === "failed") list.push({ id: "failed", at: null, kind: "system", text: "Marked as failed (time and reason not recorded)" });
    if (t.status === "pending") list.push({ id: "waiting", at: null, kind: "system", text: "Waiting for verification. No processor events on record." });
  } else if (t.type === "order_payment") {
    list.push({ id: "charged", at: t.at, kind: "system", text: `Charged ${usd(t.amount)} from the wallet for ${t.orderId}` });
  } else {
    list.push({ id: "refunded", at: null, kind: "system", text: `${usd(t.amount)} returned to the wallet for ${t.orderId} (time not recorded)` });
  }
  for (const n of notes) list.push({ id: n.id, at: n.at, kind: "staff", text: n.text, local: true });
  return list.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}

/* -------------------------------------------------------------------------- */
/*  Internal notes (admin demo state)                                         */
/* -------------------------------------------------------------------------- */

export interface PaymentNote {
  id: string;
  at: string;
  text: string;
}

const KEY = "sv-admin-payments";
const listeners = new Set<() => void>();
const EMPTY: Record<string, PaymentNote[]> = {};
let memo: { raw: string | null; notes: Record<string, PaymentNote[]> } | null = null;

function readNotes(): Record<string, PaymentNote[]> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (memo?.raw === raw) return memo.notes;
  const notes: Record<string, PaymentNote[]> = {};
  try {
    const data = raw ? (JSON.parse(raw) as { notes?: Record<string, unknown> }) : null;
    for (const [id, list] of Object.entries(data?.notes ?? {})) {
      if (!TXN_BY_ID[id] || !Array.isArray(list)) continue;
      notes[id] = list
        .filter((n): n is PaymentNote => typeof n?.id === "string" && typeof n?.at === "string" && typeof n?.text === "string")
        .map((n) => ({ ...n, text: n.text.slice(0, 1000) }))
        .slice(0, 50);
    }
  } catch {}
  memo = { raw, notes };
  return notes;
}

function writeNotes(notes: Record<string, PaymentNote[]>) {
  try {
    if (Object.values(notes).some((l) => l.length)) localStorage.setItem(KEY, JSON.stringify({ notes }));
    else localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => (e.key === KEY || e.key === null) && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePaymentNotes() {
  return React.useSyncExternalStore(subscribe, readNotes, () => EMPTY);
}

export function addPaymentNote(txnId: string, text: string) {
  const notes = { ...readNotes() };
  notes[txnId] = [...(notes[txnId] ?? []), { id: `n-${Date.now()}`, at: new Date().toISOString(), text: text.trim().slice(0, 1000) }];
  writeNotes(notes);
}

export function clearPaymentNotes() {
  writeNotes({});
}
