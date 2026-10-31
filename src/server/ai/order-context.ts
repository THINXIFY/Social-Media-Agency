import "server-only";
import { CUSTOMER_CANCELLABLE, type CustomerOrder, ORDER_STATUS_META, PAYMENT_STATUS_META } from "@/lib/orders";
import { OutputRuleError } from "./generators/shared";

/**
 * Order facts for AI Order Explanation (AI-05).
 *
 * The model sees a minimal, customer-safe sheet built from the customer's own
 * order projection (`getOwnOrder`): the service, quantity and total, the
 * customer-facing status and payment wording, timestamps, the recorded
 * timeline and what the customer can do now. Never the order link, the
 * submitted details, internal notes, staff identities, supplier references
 * or wallet balances.
 *
 * Times and the timeline are shown to the customer by the server, not by the
 * model; the model only explains in words, and answers that invent dates,
 * speeds, progress, refunds or actions are rejected.
 */

const usd = (cents: number) => (cents / 100).toFixed(2);

export interface OrderFactSheet {
  sheet: string;
  /** Dollar amounts the answer may mention (the order total). */
  amounts: number[];
}

export function orderFactSheet(o: CustomerOrder): OrderFactSheet {
  const status = ORDER_STATUS_META[o.status];
  const payment = PAYMENT_STATUS_META[o.paymentStatus];
  const lines = [
    `[order] ${o.reference}: ${o.service.name}${o.service.platform ? ` (${o.service.platform})` : ""}, quantity ${o.quantity.toLocaleString("en-US")}, total $${usd(o.totalCents)} paid from the Sociotix wallet.`,
    `[status] "${status.customerLabel}" — ${status.customerExplain}`,
    o.statusReason ? `[team message] ${o.statusReason.slice(0, 500)}` : null,
    `[payment] "${payment.label}" — ${customerPayment(o)}`,
    // Times stay out of the prompt: the customer sees the real ones beside the explanation, and the model never states dates.
    `[recorded steps] placed: yes; work started: ${o.startedAt ? "yes" : "no"}; completed: ${o.completedAt ? "yes" : "no"}; closed: ${o.closedAt ? "yes" : "no"}. The exact times are shown to the customer separately. No delivery estimates exist.`,
    `[timeline] ${o.events.length ? o.events.map((e, i) => `${i + 1}. ${e.label} (by ${e.actor === "you" ? "the customer" : e.actor === "team" ? "the Sociotix team" : "the system"})${e.detail ? ` — message: "${e.detail.slice(0, 300)}"` : ""}`).join(" ") : "No activity recorded yet."}`,
    `[customer can now] ${actions(o)}`,
    `[not recorded] Sociotix does not record delivery estimates, percentages of progress or expected completion dates for orders. Refunds aren't automatic; anything after work starts needs a reviewed decision by the team.`,
  ];
  return { sheet: lines.filter(Boolean).join("\n"), amounts: [o.totalCents / 100] };
}

function customerPayment(o: CustomerOrder) {
  if (o.paymentStatus === "charged") return "The order total was taken from your wallet and is held for this order.";
  if (o.paymentStatus === "released") return "The full order total was returned to your wallet balance.";
  if (o.paymentStatus === "refund_review") return "Work had started, so whether anything is refunded needs a reviewed decision by the team. No refund has been decided.";
  return "A refund was credited to your wallet.";
}

function actions(o: CustomerOrder) {
  const out: string[] = [];
  if (o.canUpdateDetails) out.push("update the order details the team asked for (Update details, in this order's panel in My Orders)");
  if (o.canCancel) out.push("cancel the order and get the full amount back in the wallet, because work hasn't started (Cancel order, in this order's panel)");
  if (!out.length) out.push(CUSTOMER_CANCELLABLE.includes(o.status) ? "nothing is needed" : "nothing is needed from the customer right now; the order can no longer be canceled by the customer");
  out.push("contact support if something looks wrong");
  return out.join("; ") + ".";
}

/*
 * Rules for explanation text. The answer may describe the recorded status in
 * words; it may not add anything that isn't recorded.
 */
const MONTHS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\s+\d{1,2}\b|\b\d{1,2}\s+(jan(uary)?|feb(ruary)?|march|april|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/i;
const ORDER_FORBIDDEN: [RegExp, string][] = [
  [MONTHS, "states a date"],
  // 2026-10-30, 30/10, 30/10/2026, 30.10.2026 — but not an amount such as $2.50.
  [/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b|\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/, "states a date"],
  [/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|next week|this week|end of (the )?(day|week))\b/i, "states a date"],
  [/\b(\d+(\.\d+)?\s*(-|to|–)?\s*\d*|an?|one|two|three|few|couple of|several)\s*(seconds?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|business days?)\b/i, "states a duration"],
  [/\b(soon|shortly|any (minute|moment|time now)|almost (done|finished|complete)|nearly (done|finished|complete)|on track|right away|immediately)\b/i, "predicts progress"],
  [/\d+(\.\d+)?\s*%|\bper ?cent\b/i, "states a percentage"],
  [/\b(i|i've|i have|we've|we have|i'll|i will|we'll|we will)\s+(just\s+)?(placed|created|submitted|refunded|refund|cancell?ed|cancel|charged|credited|updated|update|changed|change|approved|approve|processed|process|escalated|escalate|sent|send|notified|notify|contacted|contact|fixed|fix|expedited?|prioriti[sz]ed?|restarted|restart)\b/i, "claims an action"],
  [/\b(guarantee[ds]?|promise[ds]?|definitely|certainly will)\b/i, "makes a promise"],
];

/** Throws when an explanation goes beyond the order's recorded facts. */
export function checkOrderAnswer(text: string, o: CustomerOrder, amounts: number[]) {
  for (const [re, why] of ORDER_FORBIDDEN) if (re.test(text)) throw new OutputRuleError(`order answer ${why}`);
  const t = text.toLowerCase();
  const done = o.status === "completed";
  const returned = o.paymentStatus === "released";
  const refunded = o.paymentStatus === "refunded" || o.status === "refunded";
  if (!done && /\b(has been|was|is now|is)\s+(fully\s+)?(delivered|completed|finished)\b/.test(t)) throw new OutputRuleError("order answer claims completion");
  if (!refunded && /\b(has been|was|is being|will be|is going to be|get|receive|be given|issue[ds]?|approved for)\s+(a\s+|your\s+)?(full\s+|partial\s+)?refund(ed)?\b/.test(t)) throw new OutputRuleError("order answer claims a refund");
  if (!returned && !refunded && /\b(returned|credited|added back|put back|refunded)\s+(to|into)\s+your\s+(wallet|balance)\b/.test(t)) throw new OutputRuleError("order answer claims money was returned");
  if (!o.canCancel && /\byou\s+(can|could|may)\s+(still\s+)?cancel\b/.test(t)) throw new OutputRuleError("order answer offers a cancellation that isn't possible");
  if (!o.canUpdateDetails && /\byou\s+(can|could|may|need to|should)\s+(now\s+)?(update|change|edit)\s+(the\s+|your\s+|its\s+)?(order\s+)?(details|link)\b/.test(t)) throw new OutputRuleError("order answer offers an edit that isn't possible");
  for (const m of text.matchAll(/\$\s?(\d+(?:[.,]\d+)?)/g)) {
    const amount = Number(m[1].replace(",", "."));
    if (!amounts.some((p) => Math.abs(p - amount) < 0.005)) throw new OutputRuleError("order answer states an amount that isn't on the order");
  }
}
