/**
 * Admin customer views, derived from the existing admin demo records.
 *
 * Customers, orders, deposits and tickets come from `admin-demo.ts` unchanged.
 * Everything here is computed from those records — balances, spending,
 * activity and attention — so figures reconcile with the Admin Overview.
 * Verification, account type and restrictions aren't recorded anywhere, so
 * they're reported as missing rather than guessed. The one piece of admin
 * state is internal notes, kept in this browser under `sv-admin-customers`.
 */

import * as React from "react";
import {
  ADMIN_CUSTOMERS,
  ADMIN_DEPOSITS,
  ADMIN_NOW,
  ADMIN_ORDERS,
  ADMIN_TICKETS,
  type AdminCustomer,
  type AdminDeposit,
  type AdminOrder,
  type AdminOrderStatus,
  type AdminTicket,
  orderService,
  usd,
} from "@/lib/admin-demo";
import { blockersOf } from "@/lib/admin-orders";
import type { ServiceRecord } from "@/lib/admin-services";

const NOW = Date.parse(ADMIN_NOW);
const DAY = 86_400_000;
const cents = (n: number) => Math.round(n * 100) / 100;
const sum = (list: number[]) => cents(list.reduce((a, b) => a + b, 0));

/** Activity in the last 7 days counts as active. */
export const ACTIVE_DAYS = 7;
/** Joined in the last 30 days counts as new. */
export const NEW_DAYS = 30;

export type Activity = "active" | "inactive";

export interface CustomerIssue {
  id: string;
  kind: "order" | "ticket" | "deposit";
  /** Two or three words for list rows. */
  reason: string;
  title: string;
  detail: string;
  action: string;
  href: string;
  /** Destination isn't built yet. */
  preview?: boolean;
}

export interface Transaction {
  id: string;
  ref: string;
  /** Null when the record has no time (refunds). */
  at: string | null;
  sortAt: string;
  label: string;
  /** Signed effect on the wallet; 0 for deposits that weren't credited. */
  amount: number;
  gross: number;
  state: "credited" | "pending" | "failed" | "charged" | "refunded";
}

export interface CustomerFacts {
  customer: AdminCustomer;
  orders: AdminOrder[];
  deposits: AdminDeposit[];
  tickets: AdminTicket[];
  byStatus: Partial<Record<AdminOrderStatus, number>>;
  openOrders: number;
  /** Order payments, before refunds. */
  spent: number;
  refunds: number;
  /** Order payments minus refunds. */
  netSpend: number;
  credited: number;
  pending: number;
  pendingDeposits: AdminDeposit[];
  failedDeposits: AdminDeposit[];
  /** Credited deposits − order payments + refunds. Held for the customer, not revenue. */
  balance: number;
  lastActivity: string | null;
  activity: Activity;
  isNew: boolean;
  openTickets: AdminTicket[];
  issues: CustomerIssue[];
}

const OPEN: AdminOrderStatus[] = ["review", "queued", "in_progress"];

export function factsOf(c: AdminCustomer, svc: (o: AdminOrder) => ServiceRecord | undefined): CustomerFacts {
  const orders = ADMIN_ORDERS.filter((o) => o.customerId === c.id).sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  const deposits = ADMIN_DEPOSITS.filter((d) => d.customerId === c.id);
  const tickets = ADMIN_TICKETS.filter((t) => t.customerId === c.id);
  const byStatus: Partial<Record<AdminOrderStatus, number>> = {};
  for (const o of orders) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;

  const spent = sum(orders.map((o) => o.amount));
  const refunds = sum(orders.map((o) => o.refunded));
  const credited = sum(deposits.filter((d) => d.status === "credited").map((d) => d.amount));
  const pendingDeposits = deposits.filter((d) => d.status === "verification");
  const failedDeposits = deposits.filter((d) => d.status === "failed");
  const openTickets = tickets.filter((t) => t.awaitingStaff);

  const times = [...orders.map((o) => o.placedAt), ...deposits.map((d) => d.at), ...tickets.map((t) => t.openedAt)].sort();
  const lastActivity = times.at(-1) ?? null;

  // Most urgent first: order problems, then customers waiting on staff, then money waiting to be verified.
  const issues: CustomerIssue[] = [];
  for (const o of orders) {
    const blockers = blockersOf(o, svc(o)).filter((b) => b.id !== "fulfilment" || o.status === "queued");
    const top = blockers.find((b) => b.id === "details") ?? blockers[0];
    if (!top) continue;
    issues.push({
      id: o.id,
      kind: "order",
      reason: top.id === "details" ? "Order missing details" : top.id === "review" ? "Order to review" : "Order can't be fulfilled",
      title: top.id === "details" ? `${o.id} is missing details` : top.id === "review" ? `${o.id} is awaiting review` : `${o.id} can't be fulfilled yet`,
      detail: `${orderService(o).service.name} — ${top.detail}`,
      action: "Open order",
      href: `/admin/orders?order=${o.id}`,
    });
  }
  for (const t of openTickets) {
    issues.push({ id: t.id, kind: "ticket", reason: "Ticket awaiting staff", title: `${t.id} is waiting on staff`, detail: t.subject, action: "Open ticket", href: `/admin/support?ticket=${t.id}` });
  }
  for (const d of pendingDeposits) {
    issues.push({
      id: d.id,
      kind: "deposit",
      reason: "Deposit to verify",
      title: `${d.id} is awaiting verification`,
      detail: `${usd(d.amount)} via ${d.method} — not credited until verified.`,
      action: "Review deposit",
      href: `/admin/payments?txn=${d.id}`,
    });
  }

  return {
    customer: c,
    orders,
    deposits,
    tickets,
    byStatus,
    openOrders: orders.filter((o) => OPEN.includes(o.status)).length,
    spent,
    refunds,
    netSpend: cents(spent - refunds),
    credited,
    pending: sum(pendingDeposits.map((d) => d.amount)),
    pendingDeposits,
    failedDeposits,
    balance: cents(credited - spent + refunds),
    lastActivity,
    activity: lastActivity && NOW - Date.parse(lastActivity) <= ACTIVE_DAYS * DAY ? "active" : "inactive",
    isNew: NOW - Date.parse(c.joinedAt) <= NEW_DAYS * DAY,
    openTickets,
    issues,
  };
}

export const allFacts = (svc: (o: AdminOrder) => ServiceRecord | undefined) => ADMIN_CUSTOMERS.map((c) => factsOf(c, svc));

export const joinedWithin = (c: AdminCustomer, days: number) => NOW - Date.parse(c.joinedAt) <= days * DAY;

/** Every wallet movement on record, newest first. Refunds have no time, so they sit with their order. */
export function transactionsOf(f: CustomerFacts): Transaction[] {
  const list: Transaction[] = [];
  for (const d of f.deposits) {
    const state = d.status === "credited" ? "credited" : d.status === "verification" ? "pending" : "failed";
    list.push({ id: d.id, ref: d.id, at: d.at, sortAt: d.at, label: `Deposit · ${d.method}`, amount: state === "credited" ? d.amount : 0, gross: d.amount, state });
  }
  for (const o of f.orders) {
    list.push({ id: `${o.id}-charge`, ref: o.id, at: o.placedAt, sortAt: o.placedAt, label: orderService(o).service.name, amount: -o.amount, gross: o.amount, state: "charged" });
    if (o.refunded) list.push({ id: `${o.id}-refund`, ref: o.id, at: null, sortAt: `${o.placedAt}~`, label: "Refund to wallet", amount: o.refunded, gross: o.refunded, state: "refunded" });
  }
  return list.sort((a, b) => b.sortAt.localeCompare(a.sortAt));
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

/* -------------------------------------------------------------------------- */
/*  Internal notes (admin demo state)                                         */
/* -------------------------------------------------------------------------- */

export interface CustomerNote {
  id: string;
  at: string;
  text: string;
}

const KEY = "sv-admin-customers";
const listeners = new Set<() => void>();
const EMPTY: Record<string, CustomerNote[]> = {};
let memo: { raw: string | null; notes: Record<string, CustomerNote[]> } | null = null;

function readNotes(): Record<string, CustomerNote[]> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (memo?.raw === raw) return memo.notes;
  const notes: Record<string, CustomerNote[]> = {};
  try {
    const data = raw ? (JSON.parse(raw) as { notes?: Record<string, unknown> }) : null;
    for (const [id, list] of Object.entries(data?.notes ?? {})) {
      if (!ADMIN_CUSTOMERS.some((c) => c.id === id) || !Array.isArray(list)) continue;
      notes[id] = list
        .filter((n): n is CustomerNote => typeof n?.id === "string" && typeof n?.at === "string" && typeof n?.text === "string")
        .map((n) => ({ ...n, text: n.text.slice(0, 1000) }))
        .slice(0, 50);
    }
  } catch {}
  memo = { raw, notes };
  return notes;
}

function writeNotes(notes: Record<string, CustomerNote[]>) {
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

export function useCustomerNotes() {
  return React.useSyncExternalStore(subscribe, readNotes, () => EMPTY);
}

export function addCustomerNote(customerId: string, text: string) {
  const notes = { ...readNotes() };
  notes[customerId] = [...(notes[customerId] ?? []), { id: `n-${Date.now()}`, at: new Date().toISOString(), text: text.trim().slice(0, 1000) }];
  writeNotes(notes);
}

export function clearCustomerNotes() {
  writeNotes({});
}
