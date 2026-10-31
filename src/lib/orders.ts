/**
 * The one order vocabulary (Phase 5E), shared by the server, the customer
 * dashboard and the admin panel. The database stores `status` (operational
 * lifecycle), `payment_status` and `revenue_status` separately; each screen
 * maps them through these tables instead of inventing its own words.
 */

export type OrderStatus = "pending_review" | "queued" | "in_progress" | "partial" | "needs_customer_action" | "completed" | "cancelled" | "failed" | "refunded" | "rejected";
export type OrderPaymentStatus = "charged" | "released" | "refund_review" | "refunded";
export type OrderRevenueStatus = "deferred" | "recognized" | "reversed";
export type OrderTone = "pending" | "active" | "attention" | "ok" | "closed" | "bad";

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; customerLabel: string; tone: OrderTone; customerExplain: string; staffExplain: string }> = {
  pending_review: {
    label: "Awaiting review",
    customerLabel: "Awaiting review",
    tone: "pending",
    customerExplain: "Our team checks every order before work starts.",
    staffExplain: "Check the target, details and service fit, then approve, ask for information or reject.",
  },
  queued: {
    label: "Approved",
    customerLabel: "Approved",
    tone: "active",
    customerExplain: "Approved and ready for fulfilment.",
    staffExplain: "Ready for fulfilment. Assign it and record the start with an internal reference.",
  },
  in_progress: {
    label: "In progress",
    customerLabel: "In progress",
    tone: "active",
    customerExplain: "Our team is working on this order.",
    staffExplain: "Record progress as it happens. Complete only with delivery evidence.",
  },
  partial: {
    label: "Partially delivered",
    customerLabel: "Partially delivered",
    tone: "active",
    customerExplain: "Part of this order has been delivered.",
    staffExplain: "Part delivered. Complete it with evidence, or mark it failed for refund review.",
  },
  needs_customer_action: {
    label: "Needs customer information",
    customerLabel: "Needs your information",
    tone: "attention",
    customerExplain: "We need something from you before we can continue.",
    staffExplain: "Waiting for the customer to update the order details.",
  },
  completed: { label: "Completed", customerLabel: "Completed", tone: "ok", customerExplain: "Delivered and completed.", staffExplain: "Completed with recorded evidence." },
  rejected: {
    label: "Rejected",
    customerLabel: "Rejected",
    tone: "bad",
    customerExplain: "This order couldn't be accepted. The full amount was returned to your balance.",
    staffExplain: "Rejected before work started; the charge was returned to the wallet.",
  },
  cancelled: {
    label: "Canceled",
    customerLabel: "Canceled",
    tone: "closed",
    customerExplain: "This order was canceled before work started. The full amount was returned to your balance.",
    staffExplain: "Canceled before work started; the charge was returned to the wallet.",
  },
  failed: {
    label: "Failed",
    customerLabel: "Failed",
    tone: "bad",
    customerExplain: "This order couldn't be completed. Our team will review what you're owed.",
    staffExplain: "Failed. If work had started, the payment is held for refund review.",
  },
  refunded: { label: "Refunded", customerLabel: "Refunded", tone: "closed", customerExplain: "Refunded to your balance.", staffExplain: "Refunded." },
};

export const PAYMENT_STATUS_META: Record<OrderPaymentStatus, { label: string; explain: string }> = {
  charged: { label: "Paid from wallet", explain: "The order total was taken from the wallet and is held for this order." },
  released: { label: "Returned to wallet", explain: "The full order total was returned to the wallet." },
  refund_review: { label: "Refund review", explain: "Work had started, so any refund needs a reviewed decision. Refunds aren't enabled yet." },
  refunded: { label: "Refunded", explain: "A refund was credited to the wallet." },
};

export const REVENUE_STATUS_META: Record<OrderRevenueStatus, { label: string; explain: string }> = {
  deferred: { label: "Deferred", explain: "Held as funds committed to orders — not earned revenue." },
  recognized: { label: "Recognised", explain: "Recognised as earned revenue under the revenue policy." },
  reversed: { label: "Reversed", explain: "Previously recognised revenue was reversed." },
};

/** Orders still moving (not closed). */
export const OPEN_ORDER_STATUSES: OrderStatus[] = ["pending_review", "queued", "in_progress", "partial", "needs_customer_action"];

/** Statuses a customer may cancel from: nothing has been worked on yet. */
export const CUSTOMER_CANCELLABLE: OrderStatus[] = ["pending_review", "needs_customer_action"];

export interface OrderEventView {
  type: string;
  label: string;
  detail: string | null;
  at: string;
  actor: "you" | "team" | "system";
}

export interface CustomerOrder {
  reference: string;
  service: { id: string; name: string; platform: string; category: string };
  quantity: number;
  link: string | null;
  details: Record<string, string>;
  totalCents: number;
  currency: "USD";
  unitPrice: { micros: number; unit: string };
  status: OrderStatus;
  statusReason: string | null;
  paymentStatus: OrderPaymentStatus;
  placedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  canCancel: boolean;
  canUpdateDetails: boolean;
  events: OrderEventView[];
}
