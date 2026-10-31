/**
 * Admin support views, derived from the existing `ADMIN_TICKETS` records.
 *
 * A ticket record holds an ID, customer, subject, optional order, whether it
 * awaits staff, and when it opened — nothing else. Message bodies, priority,
 * assignment and linked payments aren't recorded, so the UI says so rather
 * than inventing them. Tickets that don't await staff keep that meaning; the
 * record doesn't say whether they await the customer, are resolved or closed.
 * Category is derived only from what a ticket links to. Internal notes are the
 * one piece of admin state, kept under `sv-admin-support` — separate from the
 * customer dashboard's support store.
 */

import * as React from "react";
import { ADMIN_NOW, ADMIN_ORDER_BY_ID, ADMIN_TICKETS, type AdminOrder, type AdminTicket, CUSTOMER_BY_ID } from "@/lib/admin-demo";

const NOW = Date.parse(ADMIN_NOW);

export type TicketStatus = "awaiting_staff" | "awaiting_customer" | "resolved" | "closed" | "unrecorded";
export type TicketCategory = "order" | "payment" | "general";

export const STATUS_META: Record<TicketStatus, { label: string; explain: string; dot: string }> = {
  awaiting_staff: { label: "Awaiting staff", explain: "The customer is waiting for a reply from the team.", dot: "bg-soon" },
  awaiting_customer: { label: "Awaiting customer", explain: "The team replied and is waiting for the customer.", dot: "bg-primary" },
  resolved: { label: "Resolved", explain: "The issue was resolved.", dot: "bg-ok" },
  closed: { label: "Closed", explain: "The conversation is closed.", dot: "bg-off" },
  unrecorded: {
    label: "Not awaiting staff",
    explain: "The record only says no staff reply is pending. Whether it's awaiting the customer, resolved or closed wasn't recorded.",
    dot: "bg-off",
  },
};

export const CATEGORY_LABEL: Record<TicketCategory, string> = { order: "Order", payment: "Payment", general: "General" };

/** Payment wording in the subject is the only payment signal the records carry. */
const PAYMENT_SUBJECT = /deposit|refund|payment|wallet|charge/i;

export interface TicketView {
  t: AdminTicket;
  status: TicketStatus;
  category: TicketCategory;
  order: AdminOrder | null;
  /** Hours since the ticket opened. */
  waitedHours: number;
  lastActivity: string;
}

export function viewOf(t: AdminTicket, notes: SupportNote[] = []): TicketView {
  const order = t.orderId ? ADMIN_ORDER_BY_ID[t.orderId] ?? null : null;
  const category: TicketCategory = order ? "order" : PAYMENT_SUBJECT.test(t.subject) ? "payment" : "general";
  const last = [t.openedAt, ...notes.map((n) => n.at)].sort().at(-1)!;
  return {
    t,
    status: t.awaitingStaff ? "awaiting_staff" : "unrecorded",
    category,
    order,
    waitedHours: Math.max(1, Math.round((NOW - Date.parse(t.openedAt)) / 3_600_000)),
    lastActivity: last,
  };
}

export const TICKET_BY_ID: Record<string, AdminTicket> = Object.fromEntries(ADMIN_TICKETS.map((t) => [t.id, t]));

export interface NextAction {
  label: string;
  explain: string;
  href?: string;
}

/** Why the ticket needs action, and the single most useful next step. */
export function nextActionOf(v: TicketView): NextAction | null {
  if (v.status !== "awaiting_staff") return null;
  const waited = `Waiting ${v.waitedHours} h with no staff reply on record.`;
  if (v.order) return { label: `Review ${v.order.id}`, explain: `${waited} Check the order before replying.`, href: `/admin/orders?order=${v.order.id}` };
  if (v.category === "payment") return { label: "Check deposits", explain: `${waited} Check the customer's deposits before replying.`, href: `/admin/payments?q=${v.t.customerId}&type=deposit` };
  return { label: "Open customer", explain: `${waited} Review the customer's account before replying.`, href: `/admin/customers?customer=${v.t.customerId}` };
}

export const customerName = (t: AdminTicket) => CUSTOMER_BY_ID[t.customerId]?.name ?? t.customerId;

/* -------------------------------------------------------------------------- */
/*  Internal notes (admin demo state)                                         */
/* -------------------------------------------------------------------------- */

export interface SupportNote {
  id: string;
  at: string;
  text: string;
}

const KEY = "sv-admin-support";
const listeners = new Set<() => void>();
const EMPTY: Record<string, SupportNote[]> = {};
let memo: { raw: string | null; notes: Record<string, SupportNote[]> } | null = null;

function readNotes(): Record<string, SupportNote[]> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (memo?.raw === raw) return memo.notes;
  const notes: Record<string, SupportNote[]> = {};
  try {
    const data = raw ? (JSON.parse(raw) as { notes?: Record<string, unknown> }) : null;
    for (const [id, list] of Object.entries(data?.notes ?? {})) {
      if (!TICKET_BY_ID[id] || !Array.isArray(list)) continue;
      notes[id] = list
        .filter((n): n is SupportNote => typeof n?.id === "string" && typeof n?.at === "string" && typeof n?.text === "string")
        .map((n) => ({ ...n, text: n.text.slice(0, 1000) }))
        .slice(0, 50);
    }
  } catch {}
  memo = { raw, notes };
  return notes;
}

function writeNotes(notes: Record<string, SupportNote[]>) {
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

export function useSupportNotes() {
  return React.useSyncExternalStore(subscribe, readNotes, () => EMPTY);
}

export function addSupportNote(ticketId: string, text: string) {
  const notes = { ...readNotes() };
  notes[ticketId] = [...(notes[ticketId] ?? []), { id: `n-${Date.now()}`, at: new Date().toISOString(), text: text.trim().slice(0, 1000) }];
  writeNotes(notes);
}

export function clearSupportNotes() {
  writeNotes({});
}
