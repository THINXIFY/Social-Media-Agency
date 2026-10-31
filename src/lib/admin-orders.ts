/**
 * Admin order operations, derived from the existing admin demo records.
 *
 * Orders, customers and statuses come from `admin-demo.ts` unchanged, so
 * counts match the Admin Overview. This module only derives what staff need
 * to act: payment state, blockers, a review checklist and the next step.
 * The one piece of admin state is internal notes, kept in this browser under
 * `sv-admin-orders` and never shared with the customer dashboard.
 */

import * as React from "react";
import {
  ADMIN_NOW,
  ADMIN_ORDERS,
  ADMIN_TICKETS,
  type AdminOrder,
  CUSTOMER_BY_ID,
  orderService,
} from "@/lib/admin-demo";
import type { ServiceRecord } from "@/lib/admin-services";

const NOW = Date.parse(ADMIN_NOW);

/* -------------------------------------------------------------------------- */
/*  Derived facts                                                             */
/* -------------------------------------------------------------------------- */

export type PaymentState = "paid" | "refunded" | "partly_refunded";

export const PAYMENT_META: Record<PaymentState, { label: string; detail: string }> = {
  paid: { label: "Paid from wallet", detail: "Charged from the customer's wallet balance when the order was placed." },
  refunded: { label: "Refunded", detail: "The full amount was returned to the customer's wallet." },
  partly_refunded: { label: "Partly refunded", detail: "Part of the amount was returned to the customer's wallet." },
};

export function paymentOf(o: AdminOrder): PaymentState {
  if (o.refunded >= o.amount) return "refunded";
  if (o.refunded > 0) return "partly_refunded";
  return "paid";
}

/** Demo target, derived from the customer and platform so it's stable. Not a real account. */
export function targetOf(o: AdminOrder) {
  const { platform } = orderService(o);
  const handle = CUSTOMER_BY_ID[o.customerId].name.toLowerCase().replace(/[^a-z]+/g, "");
  const host: Record<string, string> = {
    instagram: "instagram.com",
    tiktok: "tiktok.com/@",
    youtube: "youtube.com/@",
    facebook: "facebook.com",
    x: "x.com",
    telegram: "t.me",
    linkedin: "linkedin.com/in",
  };
  const base = host[platform.id] ?? `${platform.id}.example`;
  return `https://${base}${base.endsWith("@") ? "" : "/"}${handle}`;
}

/** Flags that mean the customer must supply or fix something. */
const DETAIL_FLAGS = ["Target account is private", "Link doesn't match the selected platform"];
export const detailsMissing = (o: AdminOrder) => Boolean(o.flag && DETAIL_FLAGS.includes(o.flag));

const isOpen = (o: AdminOrder) => o.status === "review" || o.status === "queued" || o.status === "in_progress";

export type BlockerId = "review" | "details" | "fulfilment";

export interface Blocker {
  id: BlockerId;
  label: string;
  detail: string;
}

/** What's stopping an open order from moving. Closed orders have none. */
export function blockersOf(o: AdminOrder, service: ServiceRecord | undefined): Blocker[] {
  if (!isOpen(o)) return [];
  const list: Blocker[] = [];
  if (detailsMissing(o)) list.push({ id: "details", label: "Details incomplete", detail: o.flag! });
  if (o.status === "review") list.push({ id: "review", label: "Awaiting staff review", detail: o.flag && !detailsMissing(o) ? o.flag : "Needs a check before it's queued." });
  if (!service?.checks.fulfillmentVerified) list.push({ id: "fulfilment", label: "No verified fulfilment", detail: "This service has no verified fulfilment method, and no provider is connected." });
  return list;
}

/** Needs attention: missing details, or queued with nowhere to send it. */
export const needsAttention = (o: AdminOrder, service: ServiceRecord | undefined) =>
  detailsMissing(o) || (o.status === "queued" && !service?.checks.fulfillmentVerified);

export interface Check {
  id: "ordered" | "payment" | "details" | "fulfilment" | "next";
  question: string;
  ok: boolean | null;
  answer: string;
}

/** The five questions staff ask when reviewing an order. */
export function reviewChecklist(o: AdminOrder, service: ServiceRecord | undefined): Check[] {
  const { service: svc } = orderService(o);
  const payment = paymentOf(o);
  const next = nextActionOf(o, service);
  return [
    { id: "ordered", question: "What was ordered?", ok: true, answer: `${o.quantity.toLocaleString("en-US")} × ${svc.name}` },
    { id: "payment", question: "Has payment been confirmed?", ok: payment === "paid", answer: PAYMENT_META[payment].detail },
    {
      id: "details",
      question: "Are the required details complete?",
      ok: !detailsMissing(o),
      answer: detailsMissing(o) ? `${o.flag}. The customer needs to fix it.` : "Target link and quantity are present.",
    },
    {
      id: "fulfilment",
      question: "Is an approved fulfilment method configured?",
      ok: Boolean(service?.checks.fulfillmentVerified),
      answer: service?.checks.fulfillmentVerified
        ? `${service.fulfillment.type === "provider" ? "Approved provider" : "Manual fulfilment"} verified in Services & Pricing.`
        : "Not yet. Verify fulfilment for this service in Services & Pricing.",
    },
    { id: "next", question: "What happens next?", ok: null, answer: next.explain },
  ];
}

export type NextActionId = "request_details" | "review" | "assign_provider" | "monitor" | "none";

export function nextActionOf(o: AdminOrder, service: ServiceRecord | undefined): { id: NextActionId; label: string; explain: string } {
  if (!isOpen(o)) return { id: "none", label: "No action needed", explain: o.status === "completed" ? "The order is closed." : "The order was closed and refunded to the wallet." };
  if (detailsMissing(o)) return { id: "request_details", label: "Request details", explain: "Ask the customer to fix the target before anything else." };
  if (o.status === "review") return { id: "review", label: "Review order", explain: "Check the order, then approve it to the queue." };
  if (!service?.checks.fulfillmentVerified) return { id: "assign_provider", label: "Assign provider", explain: "It can't move until a verified fulfilment method is set." };
  return { id: "monitor", label: "Update status", explain: "Track delivery and update the status as it progresses." };
}

/* -------------------------------------------------------------------------- */
/*  Progress & activity                                                       */
/* -------------------------------------------------------------------------- */

export type MilestoneState = "done" | "current" | "blocked" | "upcoming";

/** Only what the record supports: placement and payment have times; later steps have none recorded. */
export function milestonesOf(o: AdminOrder, blockers: Blocker[]) {
  const reviewed = o.status !== "review";
  const closed = o.status === "completed" || o.status === "cancelled" || o.status === "refunded";
  const blocked = (id: BlockerId) => blockers.some((b) => b.id === id);
  const steps: { label: string; state: MilestoneState; at?: string; note?: string }[] = [
    { label: "Placed", state: "done", at: o.placedAt },
    { label: "Paid from wallet", state: "done", at: o.placedAt },
    {
      label: "Reviewed",
      state: reviewed ? "done" : blocked("details") ? "blocked" : "current",
      note: reviewed ? "Time not recorded" : blocked("details") ? "Waiting on the customer" : "Waiting on staff",
    },
    {
      label: "Fulfilment",
      state: o.status === "in_progress" ? "current" : o.status === "completed" ? "done" : reviewed && !closed ? (blocked("fulfilment") ? "blocked" : "current") : "upcoming",
      note: o.status === "completed" ? "Time not recorded" : blocked("fulfilment") && reviewed ? "No verified fulfilment method" : undefined,
    },
    {
      label: o.status === "cancelled" ? "Cancelled" : o.status === "refunded" ? "Closed · partly refunded" : "Completed",
      state: closed ? "done" : "upcoming",
      note: o.status === "completed" ? "Demo record — no delivery evidence stored" : undefined,
    },
  ];
  return steps;
}

export interface OrderEvent {
  id: string;
  at: string | null;
  kind: "system" | "customer" | "staff";
  text: string;
  /** Demo note added in this browser. */
  local?: boolean;
}

export function eventsOf(o: AdminOrder, notes: StaffNote[]): OrderEvent[] {
  const customer = CUSTOMER_BY_ID[o.customerId].name;
  const list: OrderEvent[] = [
    { id: "placed", at: o.placedAt, kind: "customer", text: `${customer} placed the order` },
    { id: "paid", at: o.placedAt, kind: "system", text: `Charged ${o.amount.toFixed(2)} USD from the wallet` },
  ];
  if (o.flag) list.push({ id: "flag", at: o.placedAt, kind: "system", text: `Flagged for review: ${o.flag}` });
  for (const t of ADMIN_TICKETS.filter((t) => t.orderId === o.id)) {
    list.push({ id: t.id, at: t.openedAt, kind: "customer", text: `${customer} opened ${t.id}: “${t.subject}”` });
  }
  if (o.refunded) list.push({ id: "refund", at: null, kind: "system", text: `${o.refunded.toFixed(2)} USD returned to the wallet (time not recorded)` });
  for (const n of notes) list.push({ id: n.id, at: n.at, kind: "staff", text: n.text, local: true });
  return list.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}

/* -------------------------------------------------------------------------- */
/*  Staff notes (admin demo state)                                            */
/* -------------------------------------------------------------------------- */

export interface StaffNote {
  id: string;
  at: string;
  text: string;
}

const KEY = "sv-admin-orders";
const listeners = new Set<() => void>();
const EMPTY: Record<string, StaffNote[]> = {};
let memo: { raw: string | null; notes: Record<string, StaffNote[]> } | null = null;

function readNotes(): Record<string, StaffNote[]> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (memo?.raw === raw) return memo.notes;
  const notes: Record<string, StaffNote[]> = {};
  try {
    const data = raw ? (JSON.parse(raw) as { notes?: Record<string, unknown> }) : null;
    for (const [id, list] of Object.entries(data?.notes ?? {})) {
      if (!ADMIN_ORDERS.some((o) => o.id === id) || !Array.isArray(list)) continue;
      notes[id] = list
        .filter((n): n is StaffNote => typeof n?.id === "string" && typeof n?.at === "string" && typeof n?.text === "string")
        .map((n) => ({ ...n, text: n.text.slice(0, 1000) }))
        .slice(0, 50);
    }
  } catch {}
  memo = { raw, notes };
  return notes;
}

function writeNotes(notes: Record<string, StaffNote[]>) {
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

export function useStaffNotes() {
  return React.useSyncExternalStore(subscribe, readNotes, () => EMPTY);
}

export function addStaffNote(orderId: string, text: string) {
  const notes = { ...readNotes() };
  notes[orderId] = [...(notes[orderId] ?? []), { id: `n-${Date.now()}`, at: new Date().toISOString(), text: text.trim().slice(0, 1000) }];
  writeNotes(notes);
}

export function clearStaffNotes() {
  writeNotes({});
}

/** Notes must never hold credentials, one-time codes, keys, wallet recovery words or card details. */
export const looksSensitive = (text: string) =>
  /(password|passcode|otp|api[_ -]?key|secret|token|private[_ -]?key|seed[_ -]?phrase|recovery[_ -]?phrase|mnemonic|\bcvv\b|\bcvc\b|\b\d{13,19}\b)/i.test(text);

/** Orders placed within the last N days of the demo clock. */
export const withinDays = (o: AdminOrder, days: number) => NOW - Date.parse(o.placedAt) <= days * 86_400_000;
