/**
 * Analytics over the existing admin demo records — nothing here is invented.
 *
 * One reporting clock (`ADMIN_NOW`) and one date model: every record is placed
 * by its own event date — orders by when they were placed, deposits by when they
 * were made, customers by when they joined. Refunds carry no timestamp of their
 * own, so they're dated by their order, exactly as the Overview chart does.
 * Wallet liabilities are a balance as of now, never a period total.
 *
 * Revenue is order payments minus refunds. Deposits are customer funds, not
 * revenue; pending deposits are never counted as credited. Profit isn't
 * computed because no verified provider costs exist.
 */

import {
  ADMIN_CUSTOMERS,
  ADMIN_DEPOSITS,
  ADMIN_NOW,
  ADMIN_ORDERS,
  type AdminDeposit,
  type AdminOrder,
  type AdminOrderStatus,
  orderService,
} from "@/lib/admin-demo";
import { needsAttention } from "@/lib/admin-orders";
import type { ServiceRecord } from "@/lib/admin-services";
import type { ServiceCategory } from "@/lib/catalog";

export const NOW = Date.parse(ADMIN_NOW);
const DAY = 86_400_000;
const cents = (n: number) => Math.round(n * 100) / 100;
const sum = (list: number[]) => cents(list.reduce((a, b) => a + b, 0));
/** Midnight UTC of the day containing t. */
export const dayStart = (t: number) => Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate());

/* -------------------------------------------------------------------------- */
/*  Coverage & windows                                                        */
/* -------------------------------------------------------------------------- */

const first = (list: string[]) => Math.min(...list.map((t) => Date.parse(t)));

/** Earliest event date for each kind of record. */
export const COVERAGE = {
  orders: dayStart(first(ADMIN_ORDERS.map((o) => o.placedAt))),
  deposits: dayStart(first(ADMIN_DEPOSITS.map((d) => d.at))),
  customers: dayStart(first(ADMIN_CUSTOMERS.map((c) => c.joinedAt))),
};
export const DATA_START = Math.min(COVERAGE.orders, COVERAGE.deposits, COVERAGE.customers);
const TODAY = dayStart(NOW);

export type Range = "7d" | "30d" | "90d" | "all" | "custom";
export const RANGE_LABEL: Record<Range, string> = { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", all: "All available data", custom: "Custom range" };

export interface Window {
  /** Inclusive start, midnight UTC. */
  start: number;
  /** Exclusive end. */
  end: number;
  days: number;
}

export const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const parseDay = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) ? Date.parse(`${s}T00:00:00Z`) : null);

/** Calendar-day windows ending today. "Last 7 days" is the 7 days up to and including today. */
export function windowOf(range: Range, from?: string | null, to?: string | null): Window {
  const end = TODAY + DAY;
  if (range === "all") return { start: DATA_START, end, days: Math.round((end - DATA_START) / DAY) };
  if (range === "custom") {
    const a = parseDay(from ?? null) ?? DATA_START;
    const b = Math.min(parseDay(to ?? null) ?? TODAY, TODAY);
    const s = Math.min(a, b);
    const e = Math.max(a, b) + DAY;
    return { start: s, end: e, days: Math.round((e - s) / DAY) };
  }
  const n = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return { start: end - n * DAY, end, days: n };
}

/** The window before this one, but only when order records fully cover it. */
export function previousOf(w: Window): Window | null {
  const prev = { start: w.start - w.days * DAY, end: w.start, days: w.days };
  return prev.start >= COVERAGE.orders ? prev : null;
}

export const within = (iso: string, w: Window) => {
  const t = Date.parse(iso);
  return t >= w.start && t < w.end;
};

/* -------------------------------------------------------------------------- */
/*  Filters                                                                   */
/* -------------------------------------------------------------------------- */

export type MethodKey = "crypto" | "card" | "bank";
export const METHOD_OF = (d: AdminDeposit): MethodKey => (d.method.startsWith("Crypto") ? "crypto" : d.method === "Card" ? "card" : "bank");
export const METHOD_LABEL: Record<MethodKey, string> = { crypto: "Crypto", card: "Card", bank: "Bank transfer" };

export interface Filters {
  platform: string;
  category: "" | ServiceCategory;
  status: "" | AdminOrderStatus | "attention";
  method: "" | MethodKey;
}

type Svc = (o: AdminOrder) => ServiceRecord | undefined;

export function ordersIn(w: Window, f: Filters, svc: Svc) {
  return ADMIN_ORDERS.filter((o) => {
    if (!within(o.placedAt, w)) return false;
    const { service, platform } = orderService(o);
    if (f.platform && platform.id !== f.platform) return false;
    if (f.category && service.category !== f.category) return false;
    if (f.status === "attention" ? !needsAttention(o, svc(o)) : f.status && o.status !== f.status) return false;
    return true;
  });
}

export const depositsIn = (w: Window, f: Filters) => ADMIN_DEPOSITS.filter((d) => within(d.at, w) && (!f.method || METHOD_OF(d) === f.method));

/* -------------------------------------------------------------------------- */
/*  Metrics                                                                   */
/* -------------------------------------------------------------------------- */

export function orderMetrics(orders: AdminOrder[]) {
  const gross = sum(orders.map((o) => o.amount));
  const refunds = sum(orders.map((o) => o.refunded));
  const customers = new Set(orders.map((o) => o.customerId));
  return {
    count: orders.length,
    gross,
    refunds,
    refundCount: orders.filter((o) => o.refunded > 0).length,
    net: cents(gross - refunds),
    /** Gross order payments ÷ orders. */
    aov: orders.length ? cents(gross / orders.length) : null,
    customers: customers.size,
  };
}

export function depositMetrics(deposits: AdminDeposit[]) {
  const of = (s: AdminDeposit["status"]) => deposits.filter((d) => d.status === s);
  return {
    credited: sum(of("credited").map((d) => d.amount)),
    creditedCount: of("credited").length,
    pending: sum(of("verification").map((d) => d.amount)),
    pendingCount: of("verification").length,
    failed: sum(of("failed").map((d) => d.amount)),
    failedCount: of("failed").length,
  };
}

/** Customer wallet balances as of now, from every record: credited deposits − order payments + refunds. */
export function walletBalances() {
  return ADMIN_CUSTOMERS.map((c) => {
    const credited = sum(ADMIN_DEPOSITS.filter((d) => d.customerId === c.id && d.status === "credited").map((d) => d.amount));
    const orders = ADMIN_ORDERS.filter((o) => o.customerId === c.id);
    return { customer: c, balance: cents(credited - sum(orders.map((o) => o.amount)) + sum(orders.map((o) => o.refunded))) };
  });
}

export const percentChange = (now: number, prev: number) => (prev === 0 ? null : Math.round(((now - prev) / prev) * 1000) / 10);

export function groupCount<T>(list: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of list) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
}

/* -------------------------------------------------------------------------- */
/*  Time buckets                                                              */
/* -------------------------------------------------------------------------- */

export type Grain = "day" | "week" | "month";
export const grainOf = (w: Window): Grain => (w.days <= 31 ? "day" : w.days <= 120 ? "week" : "month");

export interface Bucket {
  start: number;
  end: number;
  label: string;
}

export function bucketsOf(w: Window): Bucket[] {
  const grain = grainOf(w);
  const out: Bucket[] = [];
  const fmt = (t: number, opts: Intl.DateTimeFormatOptions) => new Date(t).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
  if (grain === "month") {
    let t = Date.UTC(new Date(w.start).getUTCFullYear(), new Date(w.start).getUTCMonth(), 1);
    while (t < w.end) {
      const d = new Date(t);
      const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
      out.push({ start: Math.max(t, w.start), end: Math.min(next, w.end), label: fmt(t, { month: "short", year: "numeric" }) });
      t = next;
    }
    return out;
  }
  const step = grain === "week" ? 7 * DAY : DAY;
  for (let t = w.start; t < w.end; t += step) {
    const e = Math.min(t + step, w.end);
    out.push({ start: t, end: e, label: grain === "day" ? fmt(t, { month: "short", day: "numeric" }) : `${fmt(t, { month: "short", day: "numeric" })} – ${fmt(e - DAY, { month: "short", day: "numeric" })}` });
  }
  return out;
}

export const inBucket = (iso: string, b: Bucket) => {
  const t = Date.parse(iso);
  return t >= b.start && t < b.end;
};

/* -------------------------------------------------------------------------- */
/*  CSV                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Spreadsheet-safe CSV: every text cell is quoted, and text that a spreadsheet
 * could run as a formula (= + - @, tab, carriage return) is prefixed with an
 * apostrophe. Numbers stay plain numbers.
 */
export function toCsv(rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    if (v === null) return "";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const blob = new Blob([`﻿${toCsv(rows)}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
