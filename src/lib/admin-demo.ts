/**
 * Demo data for the Admin Panel.
 *
 * Read-only and separate from the customer dashboard's demo state: nothing in
 * the admin area writes to it or to the customer's browser storage. Records
 * are generated from a fixed seed, so every page load shows the same data and
 * every summary figure is derived from the records below. All amounts are
 * illustrative USD — no real revenue, payments or fulfilment exist yet.
 */

import { PLATFORM_BY_ID, SERVICE_BY_ID } from "@/lib/catalog";

/** "Now" for the admin demo, so ages and charts stay stable. */
export const ADMIN_NOW = "2026-10-28T09:30:00Z";
const NOW = Date.parse(ADMIN_NOW);
const DAY = 86_400_000;

export const ADMIN_USER = { firstName: "Farhan", fullName: "Farhan Z.", role: "Owner", email: "hello@thinxify.com", initials: "FZ" };

/* -------------------------------------------------------------------------- */
/*  Deterministic generator                                                   */
/* -------------------------------------------------------------------------- */

function prng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(20261028);
const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
const cents = (n: number) => Math.round(n * 100) / 100;
const iso = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");

/* -------------------------------------------------------------------------- */
/*  Customers                                                                 */
/* -------------------------------------------------------------------------- */

export interface AdminCustomer {
  id: string;
  name: string;
  email: string;
  country: string;
  joinedAt: string;
}

const NAMES: [string, string][] = [
  ["Priya Shah", "India"],
  ["Daniel Okafor", "Nigeria"],
  ["Sofia Marquez", "Spain"],
  ["Hamza Raza", "Pakistan"],
  ["Emily Carter", "United States"],
  ["Lucas Weber", "Germany"],
  ["Aisha Al-Mansoori", "United Arab Emirates"],
  ["Noah Martin", "Canada"],
  ["Chloe Dubois", "France"],
  ["Yuki Tanaka", "Japan"],
  ["Omar Haddad", "Saudi Arabia"],
  ["Grace Wilson", "United Kingdom"],
  ["Mateo Rossi", "Italy"],
  ["Zara Ahmed", "Pakistan"],
];

export const ADMIN_CUSTOMERS: AdminCustomer[] = NAMES.map(([name, country], i) => ({
  id: `CUS-${1041 + i}`,
  name,
  email: `${name.split(" ")[0].toLowerCase()}.${name.split(" ").pop()!.toLowerCase().replace(/[^a-z]/g, "")}@example.com`,
  country,
  joinedAt: iso(NOW - (60 - i * 3) * DAY),
}));

export const CUSTOMER_BY_ID = Object.fromEntries(ADMIN_CUSTOMERS.map((c) => [c.id, c]));

/* -------------------------------------------------------------------------- */
/*  Orders                                                                    */
/* -------------------------------------------------------------------------- */

export type AdminOrderStatus = "review" | "queued" | "in_progress" | "completed" | "cancelled" | "refunded";

export const ADMIN_ORDER_STATUS: Record<AdminOrderStatus, { label: string; note: string }> = {
  review: { label: "Awaiting review", note: "Needs a staff check before it can be queued." },
  queued: { label: "Queued", note: "Approved and waiting for a provider." },
  in_progress: { label: "In progress", note: "Delivery is underway." },
  completed: { label: "Completed", note: "Delivered and closed." },
  cancelled: { label: "Cancelled", note: "Cancelled and refunded to the customer's wallet." },
  refunded: { label: "Refunded", note: "Partly delivered, remainder refunded to the wallet." },
};

export interface AdminOrder {
  id: string;
  customerId: string;
  serviceId: string;
  quantity: number;
  /** Charged from the customer's wallet, USD. */
  amount: number;
  /** Returned to the wallet, USD. */
  refunded: number;
  status: AdminOrderStatus;
  placedAt: string;
  /** Why an order needs review. */
  flag?: string;
}

/** Demo per-1,000 rates by service, USD. Illustrative only; the catalog has no live prices. */
const RATES: Record<string, number> = {
  "instagram-followers": 9.2,
  "instagram-reels-views": 0.48,
  "instagram-post-likes": 2.5,
  "tiktok-video-views": 0.45,
  "tiktok-followers": 15.4,
  "youtube-video-views": 3.2,
  "youtube-channel-subscribers": 55,
  "facebook-page-likes": 11.9,
  "x-followers": 14.2,
  "telegram-channel-members": 12.2,
  "linkedin-post-likes": 33,
  "spotify-artist-promotion": 0,
};
const SERVICE_IDS = Object.keys(RATES).filter((id) => RATES[id] > 0);
const QUANTITIES = [500, 1000, 1500, 2000, 2500, 5000, 10000];
const FLAGS = ["Target account is private", "Unusually large quantity for a new customer", "Link doesn't match the selected platform", "Duplicate of a recent order"];

export const ADMIN_ORDERS: AdminOrder[] = Array.from({ length: 52 }, (_, i) => {
  const ageDays = (i * 21) / 52 + rand() * 0.4;
  const placed = NOW - ageDays * DAY - rand() * 6 * 3_600_000;
  const serviceId = pick(SERVICE_IDS);
  const quantity = serviceId.includes("views") ? pick(QUANTITIES) * 4 : pick(QUANTITIES.slice(0, 5));
  const amount = cents(Math.max(2.5, (RATES[serviceId] * quantity) / 1000));
  const r = rand();
  let status: AdminOrderStatus;
  if (ageDays < 1.2) status = r < 0.55 ? "review" : r < 0.8 ? "queued" : "in_progress";
  else if (ageDays < 4) status = r < 0.15 ? "review" : r < 0.35 ? "queued" : r < 0.85 ? "in_progress" : "completed";
  else status = r < 0.84 ? "completed" : r < 0.93 ? "in_progress" : r < 0.97 ? "cancelled" : "refunded";
  const refunded = status === "cancelled" ? amount : status === "refunded" ? cents(amount * 0.4) : 0;
  return {
    id: `ORD-${48220 - i}`,
    customerId: ADMIN_CUSTOMERS[Math.floor(rand() * ADMIN_CUSTOMERS.length)].id,
    serviceId,
    quantity,
    amount,
    refunded,
    status,
    placedAt: iso(placed),
    flag: status === "review" ? pick(FLAGS) : undefined,
  };
});

export const ADMIN_ORDER_BY_ID = Object.fromEntries(ADMIN_ORDERS.map((o) => [o.id, o]));

export function orderService(o: AdminOrder) {
  const service = SERVICE_BY_ID[o.serviceId];
  return { service, platform: PLATFORM_BY_ID[service.platformId] };
}

/* -------------------------------------------------------------------------- */
/*  Deposits & wallet                                                         */
/* -------------------------------------------------------------------------- */

export type DepositStatus = "credited" | "verification" | "failed";

export interface AdminDeposit {
  id: string;
  customerId: string;
  amount: number;
  method: "Crypto (USDT)" | "Card" | "Bank transfer";
  status: DepositStatus;
  at: string;
}

/** Each customer's credited deposits cover their spending, so no wallet goes negative. */
export const ADMIN_DEPOSITS: AdminDeposit[] = (() => {
  const list: AdminDeposit[] = [];
  let n = 7301;
  for (const c of ADMIN_CUSTOMERS) {
    const orders = ADMIN_ORDERS.filter((o) => o.customerId === c.id);
    const spent = orders.reduce((s, o) => s + o.amount, 0);
    const first = orders.length ? Math.min(...orders.map((o) => Date.parse(o.placedAt))) : NOW - 5 * DAY;
    const total = Math.ceil((spent + 10 + rand() * 60) / 25) * 25;
    const parts = total > 150 ? 2 : 1;
    for (let k = 0; k < parts; k++) {
      list.push({
        id: `DEP-${n++}`,
        customerId: c.id,
        amount: parts === 1 ? total : k === 0 ? Math.ceil(total / 2 / 25) * 25 : total - Math.ceil(total / 2 / 25) * 25,
        method: pick(["Crypto (USDT)", "Card", "Bank transfer"] as const),
        status: "credited",
        at: iso(first - (parts - k) * 0.6 * DAY),
      });
    }
  }
  // Not credited: awaiting manual verification, and one that failed.
  list.push(
    { id: `DEP-${n++}`, customerId: "CUS-1044", amount: 300, method: "Bank transfer", status: "verification", at: iso(NOW - 3.5 * 3_600_000) },
    { id: `DEP-${n++}`, customerId: "CUS-1049", amount: 150, method: "Bank transfer", status: "verification", at: iso(NOW - 9 * 3_600_000) },
    { id: `DEP-${n++}`, customerId: "CUS-1052", amount: 75, method: "Crypto (USDT)", status: "verification", at: iso(NOW - 26 * 3_600_000) },
    { id: `DEP-${n++}`, customerId: "CUS-1046", amount: 100, method: "Card", status: "failed", at: iso(NOW - 30 * 3_600_000) },
  );
  return list.sort((a, b) => b.at.localeCompare(a.at));
})();

/* -------------------------------------------------------------------------- */
/*  Support, providers & integrations                                         */
/* -------------------------------------------------------------------------- */

export interface AdminTicket {
  id: string;
  customerId: string;
  subject: string;
  orderId?: string;
  awaitingStaff: boolean;
  openedAt: string;
}

export const ADMIN_TICKETS: AdminTicket[] = [
  { id: "TCK-3120", customerId: "CUS-1047", subject: "Delivery slower than expected", orderId: ADMIN_ORDERS[9].id, awaitingStaff: true, openedAt: iso(NOW - 2 * 3_600_000) },
  { id: "TCK-3118", customerId: "CUS-1041", subject: "Deposit not showing in wallet", awaitingStaff: true, openedAt: iso(NOW - 7 * 3_600_000) },
  { id: "TCK-3116", customerId: "CUS-1050", subject: "Wrong link on my order", orderId: ADMIN_ORDERS[3].id, awaitingStaff: true, openedAt: iso(NOW - 27 * 3_600_000) },
  { id: "TCK-3111", customerId: "CUS-1043", subject: "Question about refunds", awaitingStaff: false, openedAt: iso(NOW - 2.5 * DAY) },
];

export type SystemState = "not_configured" | "demo" | "connected";

export const SYSTEMS: { id: string; label: string; state: SystemState; detail: string }[] = [
  { id: "payments", label: "Payment integrations", state: "not_configured", detail: "No crypto, card or bank processor is connected. Deposits here are demo records." },
  { id: "providers", label: "Fulfilment providers", state: "not_configured", detail: "No provider API is connected, so no order can be fulfilled." },
  { id: "support", label: "Support operations", state: "demo", detail: "Tickets are sample records. Replies aren't sent to customers." },
  { id: "auth", label: "Authentication & backend", state: "not_configured", detail: "No sign-in or access control. These admin routes are not protected." },
];

/* -------------------------------------------------------------------------- */
/*  Derived figures                                                           */
/* -------------------------------------------------------------------------- */

const sum = (list: number[]) => cents(list.reduce((a, b) => a + b, 0));

export const ADMIN_SUMMARY = (() => {
  const by = (s: AdminOrderStatus) => ADMIN_ORDERS.filter((o) => o.status === s).length;
  const orderPayments = sum(ADMIN_ORDERS.map((o) => o.amount));
  const refunds = sum(ADMIN_ORDERS.map((o) => o.refunded));
  const deposits = sum(ADMIN_DEPOSITS.filter((d) => d.status === "credited").map((d) => d.amount));
  return {
    totalOrders: ADMIN_ORDERS.length,
    review: by("review"),
    active: by("queued") + by("in_progress"),
    completed: by("completed"),
    customers: ADMIN_CUSTOMERS.length,
    /** Order payments minus refunds. */
    revenue: cents(orderPayments - refunds),
    orderPayments,
    refunds,
    /** Credited deposits only. */
    deposits,
    /** Customer wallet balances: money held on customers' behalf, not revenue. */
    liabilities: cents(deposits - orderPayments + refunds),
    pendingVerification: ADMIN_DEPOSITS.filter((d) => d.status === "verification"),
    awaitingStaff: ADMIN_TICKETS.filter((t) => t.awaitingStaff),
    providersConnected: 0,
    /** Orders that need a provider to move forward. */
    unfulfillable: by("queued") + by("in_progress"),
  };
})();

/** Net revenue per day for the last 14 days (order payments that day minus refunds that day). */
export const REVENUE_DAYS = Array.from({ length: 14 }, (_, i) => {
  const start = Date.UTC(2026, 9, 28) - (13 - i) * DAY;
  const inDay = (t: string) => Date.parse(t) >= start && Date.parse(t) < start + DAY;
  const orders = ADMIN_ORDERS.filter((o) => inDay(o.placedAt));
  const payments = sum(orders.map((o) => o.amount));
  const refunds = sum(orders.map((o) => o.refunded));
  return { date: iso(start), payments, refunds, net: cents(payments - refunds), orders: orders.length };
});

export type Severity = "critical" | "high" | "medium";

export interface AttentionItem {
  id: string;
  title: string;
  count: number;
  severity: Severity;
  detail: string;
  action: string;
  href: string;
}

const hoursAgo = (t: string) => Math.max(1, Math.round((NOW - Date.parse(t)) / 3_600_000));

export const ATTENTION: AttentionItem[] = [
  {
    id: "providers",
    title: "No fulfilment provider connected",
    count: ADMIN_SUMMARY.unfulfillable,
    severity: "critical",
    detail: `${ADMIN_SUMMARY.unfulfillable} queued or in-progress orders can't move until a provider is connected.`,
    action: "Review providers",
    href: "/admin/providers",
  },
  {
    id: "review",
    title: "Orders awaiting review",
    count: ADMIN_SUMMARY.review,
    severity: "high",
    detail: `Oldest waiting ${hoursAgo(ADMIN_ORDERS.filter((o) => o.status === "review").at(-1)?.placedAt ?? ADMIN_NOW)} h. Flags include private targets and unusual quantities.`,
    action: "Review orders",
    href: "/admin/orders",
  },
  {
    id: "payments",
    title: "Payments to verify",
    count: ADMIN_SUMMARY.pendingVerification.length,
    severity: "medium",
    detail: `${ADMIN_SUMMARY.pendingVerification.length} manual deposits totalling $${sum(ADMIN_SUMMARY.pendingVerification.map((d) => d.amount))} aren't credited until verified.`,
    action: "Verify payments",
    href: "/admin/payments?type=deposit&status=pending",
  },
  {
    id: "support",
    title: "Tickets awaiting staff",
    count: ADMIN_SUMMARY.awaitingStaff.length,
    severity: ADMIN_SUMMARY.awaitingStaff.some((t) => hoursAgo(t.openedAt) > 24) ? "high" : "medium",
    detail: `Longest wait ${Math.max(...ADMIN_SUMMARY.awaitingStaff.map((t) => hoursAgo(t.openedAt)))} h.`,
    action: "Open support",
    href: "/admin/support?status=awaiting_staff",
  },
];

export interface AdminEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  ref?: string;
  kind: "order" | "payment" | "support" | "refund" | "system";
}

/** The latest events across orders, deposits, refunds and tickets. */
export const ACTIVITY: AdminEvent[] = [
  ...ADMIN_ORDERS.slice(0, 10).map((o) => ({
    id: `e-${o.id}`,
    at: o.placedAt,
    actor: CUSTOMER_BY_ID[o.customerId].name,
    action: `placed an order for ${SERVICE_BY_ID[o.serviceId].name}`,
    ref: o.id,
    kind: "order" as const,
  })),
  ...ADMIN_DEPOSITS.slice(0, 6).map((d) => ({
    id: `e-${d.id}`,
    at: d.at,
    actor: CUSTOMER_BY_ID[d.customerId].name,
    action: d.status === "verification" ? `submitted a ${d.method.toLowerCase()} deposit for verification` : d.status === "failed" ? "had a deposit fail" : "deposit credited",
    ref: d.id,
    kind: "payment" as const,
  })),
  ...ADMIN_TICKETS.map((t) => ({ id: `e-${t.id}`, at: t.openedAt, actor: CUSTOMER_BY_ID[t.customerId].name, action: `opened “${t.subject}”`, ref: t.id, kind: "support" as const })),
]
  .sort((a, b) => b.at.localeCompare(a.at))
  .slice(0, 9);

/* -------------------------------------------------------------------------- */
/*  Formatting (admin figures are always USD, times in UTC)                   */
/* -------------------------------------------------------------------------- */

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const USD_ROUND = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("en-US");
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

export const usd = (n: number) => USD.format(n);
export const usdRound = (n: number) => USD_ROUND.format(n);
export const num = (n: number) => NUM.format(n);
export const shortDate = (t: string) => DATE.format(new Date(t));
export const dateTime = (t: string) => `${DATE.format(new Date(t))}, ${TIME.format(new Date(t))} UTC`;

/** "12 min ago", "5 h ago", or a date — relative to the fixed demo clock. */
export function ago(t: string) {
  const mins = Math.round((NOW - Date.parse(t)) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return shortDate(t);
}
