/**
 * Demo data for the customer dashboard.
 *
 * Everything here is illustrative: there is no authentication, wallet or
 * order backend yet. Every surface that renders this data labels it as a
 * demo so it can't be mistaken for a real balance or order. Orders reference
 * real catalog service ids so names and platforms stay in sync, and every
 * count shown in the dashboard is derived from `ORDERS`. Wallet figures are
 * derived from `TRANSACTIONS`, which includes one payment per order.
 */

import { PLATFORM_BY_ID, SERVICE_BY_ID } from "@/lib/catalog";
import { formatMoney, formatNumber } from "@/lib/i18n";

export const DEMO_USER = {
  firstName: "Alex",
  lastName: "Morgan",
  fullName: "Alex Morgan",
  email: "alex@example.com",
  initials: "AM",
  accountId: "ACC-7F3K29",
  /** Matches the first demo deposit. */
  memberSince: "2026-09-12",
  country: "United States",
  timezone: "UTC",
};

export type OrderStatus = "pending" | "processing" | "attention" | "completed" | "cancelled";

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; note: string }> = {
  pending: { label: "Pending", note: "Queued — we check the target before delivery starts." },
  processing: { label: "In Progress", note: "Delivery is in progress." },
  attention: { label: "Needs Attention", note: "Paused until you take action." },
  completed: { label: "Completed", note: "Delivered and closed." },
  cancelled: { label: "Cancelled", note: "This order was cancelled." },
};

export interface OrderAttention {
  /** What the customer needs to fix. */
  kind: "link" | "target";
  title: string;
  reason: string;
  action: string;
}

export interface DemoOrder {
  id: string;
  serviceId: string;
  quantity: number;
  price: number;
  /** ISO timestamp (UTC). */
  placedAt: string;
  status: OrderStatus;
  /** The public link the order targets. */
  link: string;
  /** Delivered so far. Only set when there's a measurable amount. */
  delivered?: number;
  /** When the last delivery update arrived, for orders in progress. */
  updatedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  /** Only shown when present — never invented. */
  cancelReason?: string;
  attention?: OrderAttention;
}

const LINK_ATTENTION: OrderAttention = {
  kind: "link",
  title: "Update your video link",
  reason: "We couldn't continue because the supplied video is private. Provide a publicly accessible link to resume review.",
  action: "Update Link",
};

const TARGET_ATTENTION: OrderAttention = {
  kind: "target",
  title: "Review your target",
  reason: "Your selected account is protected. Review the target details before the order can continue.",
  action: "Review Details",
};

type RawOrder = DemoOrder;

const RAW_ORDERS: RawOrder[] = [
  { id: "SV-10531", serviceId: "instagram-followers", quantity: 2000, price: 18.4, placedAt: "2026-10-27T09:14:00Z", status: "processing", link: "https://instagram.com/alexmorgan.studio", delivered: 1240, updatedAt: "2026-10-27T14:48:00Z" },
  { id: "SV-10530", serviceId: "youtube-video-views", quantity: 10000, price: 32, placedAt: "2026-10-27T07:42:00Z", status: "attention", link: "https://youtube.com/watch?v=am-studio-tour", attention: LINK_ATTENTION },
  { id: "SV-10529", serviceId: "tiktok-video-likes", quantity: 5000, price: 14.75, placedAt: "2026-10-26T18:05:00Z", status: "pending", link: "https://tiktok.com/@alexmorgan/video/7391024" },
  { id: "SV-10527", serviceId: "x-followers", quantity: 1500, price: 21.3, placedAt: "2026-10-25T16:30:00Z", status: "attention", link: "https://x.com/alexmorgan_", attention: TARGET_ATTENTION },
  { id: "SV-10526", serviceId: "instagram-reels-views", quantity: 20000, price: 9.6, placedAt: "2026-10-25T11:02:00Z", status: "processing", link: "https://instagram.com/reel/am-launch-teaser", delivered: 12800, updatedAt: "2026-10-27T08:30:00Z" },
  { id: "SV-10524", serviceId: "youtube-channel-subscribers", quantity: 500, price: 27.5, placedAt: "2026-10-23T14:20:00Z", status: "completed", link: "https://youtube.com/@alexmorgan", delivered: 500, completedAt: "2026-10-24T10:05:00Z" },
  { id: "SV-10521", serviceId: "telegram-channel-members", quantity: 1000, price: 12.2, placedAt: "2026-10-21T10:45:00Z", status: "completed", link: "https://t.me/alexmorganupdates", delivered: 1000, completedAt: "2026-10-22T19:30:00Z" },
  { id: "SV-10519", serviceId: "facebook-page-likes", quantity: 1000, price: 11.9, placedAt: "2026-10-19T13:10:00Z", status: "processing", link: "https://facebook.com/alexmorganstudio", delivered: 640, updatedAt: "2026-10-26T21:15:00Z" },
  { id: "SV-10517", serviceId: "instagram-post-likes", quantity: 2500, price: 6.25, placedAt: "2026-10-17T09:30:00Z", status: "completed", link: "https://instagram.com/p/am-gallery-03", delivered: 2500, completedAt: "2026-10-17T22:10:00Z" },
  { id: "SV-10516", serviceId: "tiktok-followers", quantity: 1000, price: 15.4, placedAt: "2026-10-16T15:55:00Z", status: "processing", link: "https://tiktok.com/@alexmorgan", delivered: 380, updatedAt: "2026-10-26T12:40:00Z" },
  { id: "SV-10515", serviceId: "youtube-video-likes", quantity: 800, price: 7.2, placedAt: "2026-10-14T12:00:00Z", status: "completed", link: "https://youtube.com/watch?v=am-color-grading", delivered: 800, completedAt: "2026-10-15T08:20:00Z" },
  { id: "SV-10514", serviceId: "x-post-likes", quantity: 600, price: 4.8, placedAt: "2026-10-13T17:25:00Z", status: "completed", link: "https://x.com/alexmorgan_/status/1844", delivered: 600, completedAt: "2026-10-14T02:40:00Z" },
  { id: "SV-10512", serviceId: "linkedin-post-likes", quantity: 300, price: 9.9, placedAt: "2026-10-11T08:40:00Z", status: "completed", link: "https://linkedin.com/posts/alexmorgan-studio-update", delivered: 300, completedAt: "2026-10-12T16:00:00Z" },
  { id: "SV-10510", serviceId: "instagram-story-views", quantity: 3000, price: 5.4, placedAt: "2026-10-10T19:15:00Z", status: "completed", link: "https://instagram.com/stories/alexmorgan.studio", delivered: 3000, completedAt: "2026-10-11T07:45:00Z" },
  { id: "SV-10508", serviceId: "instagram-followers", quantity: 5000, price: 46, placedAt: "2026-10-09T10:05:00Z", status: "cancelled", link: "https://instagram.com/alexmorgan.studio", cancelledAt: "2026-10-09T10:21:00Z", cancelReason: "Cancelled at your request before delivery started." },
  { id: "SV-10507", serviceId: "facebook-video-views", quantity: 8000, price: 10.4, placedAt: "2026-10-07T14:30:00Z", status: "completed", link: "https://facebook.com/watch/am-behind-the-scenes", delivered: 8000, completedAt: "2026-10-08T09:10:00Z" },
  { id: "SV-10505", serviceId: "youtube-shorts-views", quantity: 15000, price: 13.5, placedAt: "2026-10-05T16:45:00Z", status: "completed", link: "https://youtube.com/shorts/am-60s-edit", delivered: 15000, completedAt: "2026-10-06T21:30:00Z" },
  { id: "SV-10503", serviceId: "telegram-post-views", quantity: 4000, price: 3.6, placedAt: "2026-10-03T11:20:00Z", status: "completed", link: "https://t.me/alexmorganupdates/212", delivered: 4000, completedAt: "2026-10-03T18:05:00Z" },
  { id: "SV-10501", serviceId: "tiktok-video-views", quantity: 25000, price: 11.25, placedAt: "2026-10-01T09:00:00Z", status: "completed", link: "https://tiktok.com/@alexmorgan/video/7380112", delivered: 25000, completedAt: "2026-10-02T13:25:00Z" },
  { id: "SV-10498", serviceId: "pinterest-pin-saves", quantity: 500, price: 6.5, placedAt: "2026-09-28T15:40:00Z", status: "completed", link: "https://pinterest.com/pin/am-moodboard", delivered: 500, completedAt: "2026-09-29T11:50:00Z" },
  { id: "SV-10496", serviceId: "instagram-reels-likes", quantity: 1500, price: 4.95, placedAt: "2026-09-26T13:15:00Z", status: "completed", link: "https://instagram.com/reel/am-studio-reveal", delivered: 1500, completedAt: "2026-09-27T06:35:00Z" },
  { id: "SV-10493", serviceId: "linkedin-company-page-followers", quantity: 250, price: 14.75, placedAt: "2026-09-23T10:10:00Z", status: "completed", link: "https://linkedin.com/company/alex-morgan-studio", delivered: 250, completedAt: "2026-09-25T17:00:00Z" },
  { id: "SV-10490", serviceId: "x-post-views", quantity: 10000, price: 5, placedAt: "2026-09-20T18:30:00Z", status: "completed", link: "https://x.com/alexmorgan_/status/1831", delivered: 10000, completedAt: "2026-09-21T09:45:00Z" },
  { id: "SV-10487", serviceId: "youtube-video-comments", quantity: 50, price: 8.75, placedAt: "2026-09-17T12:05:00Z", status: "completed", link: "https://youtube.com/watch?v=am-lighting-guide", delivered: 50, completedAt: "2026-09-19T15:20:00Z" },
];

/** Dates follow the customer's time zone, date format and language (see `@/lib/i18n`). */
export { formatDate, formatDateTime } from "@/lib/i18n";

/** Every demo order, newest first. */
export const ORDERS: DemoOrder[] = [...RAW_ORDERS].sort((a, b) => b.placedAt.localeCompare(a.placedAt));

export const RECENT_ORDERS = ORDERS.slice(0, 7);

export function summarize(orders: DemoOrder[]) {
  const by = (s: OrderStatus) => orders.filter((o) => o.status === s).length;
  return {
    pending: by("pending"),
    processing: by("processing"),
    /** Pending or in progress. */
    active: by("pending") + by("processing"),
    attention: by("attention"),
    completed: by("completed"),
    cancelled: by("cancelled"),
    total: orders.length,
  };
}

export const ORDER_SUMMARY = summarize(ORDERS);

/** Delivery progress, only when the order has a measurable delivered amount. */
export function deliveryProgress(o: DemoOrder) {
  if (typeof o.delivered !== "number" || o.quantity <= 0 || o.delivered < 0 || o.delivered > o.quantity) return null;
  return { delivered: o.delivered, total: o.quantity, pct: Math.round((o.delivered / o.quantity) * 100) };
}

/** `demo` marks changes the customer simulated in this browser. */
export type ActivityKind = "progress" | "attention" | "wallet" | "completed" | "support" | "demo";

export interface DemoActivity {
  id: string;
  kind: ActivityKind;
  orderId?: string;
  title: string;
  detail: string;
  when: string;
  unread: boolean;
}

export const ACTIVITY: DemoActivity[] = [
  {
    id: "a1",
    kind: "progress",
    title: "Delivery update · SV-10531",
    detail: "1,240 of 2,000 Instagram followers delivered.",
    when: "12 min ago",
    unread: true,
  },
  {
    id: "a2",
    kind: "attention",
    orderId: "SV-10530",
    title: "Order paused · SV-10530",
    detail: "The YouTube video is private.",
    when: "1 h ago",
    unread: true,
  },
  {
    id: "a3",
    kind: "wallet",
    title: "Funds added",
    detail: "$100.00 added to your balance.",
    when: "Yesterday",
    unread: true,
  },
  {
    id: "a4",
    kind: "attention",
    orderId: "SV-10527",
    title: "Order paused · SV-10527",
    detail: "The X account is protected.",
    when: "Oct 25",
    unread: false,
  },
  {
    id: "a5",
    kind: "completed",
    title: "Order completed · SV-10524",
    detail: "500 YouTube subscribers delivered.",
    when: "Oct 24",
    unread: false,
  },
];

/* -------------------------------------------------------------------------- */
/*  Wallet transactions                                                       */
/* -------------------------------------------------------------------------- */

export type TxType = "deposit" | "payment" | "refund" | "adjustment";
export type TxStatus = "pending" | "processing" | "completed" | "failed" | "expired" | "refunded";
/** How money moved. `balance` = paid from the Sociotix wallet. */
export type TxMethod = "balance" | "crypto" | "card" | "bank" | "paypal";

export interface DemoTransaction {
  id: string;
  type: TxType;
  status: TxStatus;
  /** Signed USD effect on the balance: positive adds, negative spends. */
  amount: number;
  /** ISO timestamp (UTC). */
  createdAt: string;
  method: TxMethod;
  /** Crypto deposits only: asset symbol and network id from lib/payments. */
  asset?: string;
  network?: string;
  orderId?: string;
  /** Adjustments only: what the adjustment was for. */
  title?: string;
  /** Explanation recorded with the transaction. Only shown when present — never invented. */
  note?: string;
  /** Only shown when recorded. */
  fees?: { label: string; amount: number }[];
}

export const TX_TYPE_LABELS: Record<TxType, string> = {
  deposit: "Deposit",
  payment: "Order payment",
  refund: "Refund",
  adjustment: "Adjustment",
};

export const TX_STATUS_LABELS: Record<TxStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  expired: "Expired",
  refunded: "Refunded",
};

export const TX_METHOD_LABELS: Record<TxMethod, string> = {
  balance: "Wallet balance",
  crypto: "Cryptocurrency",
  card: "Card",
  bank: "Bank transfer",
  paypal: "PayPal",
};

const plusMinutes = (iso: string, m: number) => new Date(Date.parse(iso) + m * 60_000).toISOString().replace(".000Z", "Z");

const WALLET_RECORDS: DemoTransaction[] = [
  { id: "DEP-3050", type: "deposit", status: "pending", amount: 50, createdAt: "2026-10-27T11:20:00Z", method: "crypto", asset: "USDT", network: "tron", note: "Waiting for payment. Your balance updates once it's received." },
  { id: "DEP-3047", type: "deposit", status: "completed", amount: 100, createdAt: "2026-10-26T16:10:00Z", method: "crypto", asset: "USDC", network: "base" },
  { id: "DEP-3045", type: "deposit", status: "processing", amount: 200, createdAt: "2026-10-25T09:35:00Z", method: "bank", note: "Waiting for the transfer to arrive and be matched to your reference." },
  { id: "DEP-3042", type: "deposit", status: "failed", amount: 75, createdAt: "2026-10-20T13:05:00Z", method: "card", note: "The card payment wasn't completed. Nothing was charged." },
  { id: "DEP-3039", type: "deposit", status: "completed", amount: 115.3, createdAt: "2026-10-15T08:50:00Z", method: "bank" },
  { id: "REF-10508", type: "refund", status: "completed", amount: 46, createdAt: "2026-10-09T10:23:00Z", method: "balance", orderId: "SV-10508", note: "Returned to your balance after the order was cancelled." },
  { id: "DEP-3036", type: "deposit", status: "expired", amount: 100, createdAt: "2026-10-08T18:40:00Z", method: "crypto", asset: "BTC", network: "bitcoin", note: "No payment was received before the payment window closed. Nothing was charged." },
  { id: "DEP-3031", type: "deposit", status: "completed", amount: 50, createdAt: "2026-10-06T12:15:00Z", method: "paypal" },
  { id: "ADJ-0007", type: "adjustment", status: "completed", amount: 10, createdAt: "2026-10-01T08:00:00Z", method: "balance", title: "Promotional credit", note: "Added to your balance by our team." },
  { id: "DEP-3024", type: "deposit", status: "completed", amount: 150, createdAt: "2026-09-24T10:30:00Z", method: "crypto", asset: "USDT", network: "tron" },
  { id: "DEP-3018", type: "deposit", status: "completed", amount: 100, createdAt: "2026-09-12T10:00:00Z", method: "card" },
];

/** Every wallet transaction, newest first. Order payments come from `ORDERS`. */
export const TRANSACTIONS: DemoTransaction[] = [
  ...WALLET_RECORDS,
  ...ORDERS.map<DemoTransaction>((o) => ({
    id: `PAY-${o.id.slice(3)}`,
    type: "payment",
    status: o.status === "cancelled" ? "refunded" : "completed",
    amount: -o.price,
    createdAt: plusMinutes(o.placedAt, 1),
    method: "balance",
    orderId: o.id,
  })),
].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** True when the transaction changed the balance. A refunded payment was charged, then refunded separately. */
export const affectsBalance = (t: DemoTransaction) =>
  t.status === "completed" || (t.type === "payment" && t.status === "refunded");

const cents = (n: number) => Math.round(n * 100) / 100;
const total = (list: DemoTransaction[]) => cents(list.reduce((sum, t) => sum + t.amount, 0));

export function walletSummary(txs: DemoTransaction[]) {
  const counted = txs.filter(affectsBalance);
  const of = (type: TxType) => counted.filter((t) => t.type === type);
  const pending = txs.filter((t) => t.type === "deposit" && (t.status === "pending" || t.status === "processing"));
  const ordersGross = cents(-total(of("payment")));
  const refunds = total(of("refund"));
  return {
    /** Completed deposits. */
    added: total(of("deposit")),
    /** Every order payment, before refunds. */
    ordersGross,
    refunds,
    /** Net spending: order payments less refunds. */
    spent: cents(ordersGross - refunds),
    adjustments: total(of("adjustment")),
    /** Pending or processing deposits. Not credited, so not part of the balance. */
    pending: { count: pending.length, amount: total(pending) },
    /** added + adjustments − ordersGross + refunds. */
    balance: total(counted),
  };
}

export const WALLET_SUMMARY = walletSummary(TRANSACTIONS);

const lastDeposit = TRANSACTIONS.find((t) => t.type === "deposit" && t.status === "completed")!;
const thisMonth = TRANSACTIONS.filter((t) => affectsBalance(t) && (t.type === "payment" || t.type === "refund") && t.createdAt.startsWith("2026-10"));

/** Derived from `TRANSACTIONS`, so every page shows the same figures. */
export const DEMO_WALLET = {
  balance: WALLET_SUMMARY.balance,
  currency: "USD",
  lastTopUp: { amount: lastDeposit.amount, at: lastDeposit.createdAt },
  spentThisMonth: cents(-total(thisMonth)),
};

/** A USD amount in the customer's display currency (an estimate when it isn't USD). */
export const money = (usd: number) => formatMoney(usd);
/** A USD amount that must stay in USD, e.g. payment entry. */
export const usd = (n: number) => formatMoney(n, { usd: true });
export const count = (n: number) => formatNumber(n);

export function orderService(order: DemoOrder) {
  const service = SERVICE_BY_ID[order.serviceId];
  return { service, platform: PLATFORM_BY_ID[service.platformId] };
}
