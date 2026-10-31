/**
 * Demo support tickets.
 *
 * Every ticket here is sample data and is labelled as such wherever it's shown.
 * Tickets reference real demo order and transaction ids so links and details
 * stay consistent with My Orders and Transactions. Replies come from the
 * "SociVanta Support" team rather than named people, and never promise
 * response times or outcomes that the order and transaction data don't show.
 */

export const SUPPORT_EMAIL = "hello@thinxify.com";

/** awaiting = waiting on support; waiting = waiting on the customer. */
export type TicketStatus = "awaiting" | "waiting" | "resolved" | "closed";
export type TicketPriority = "normal" | "urgent";
export type TicketCategory = "order" | "payment" | "refund" | "service" | "account" | "technical" | "other";

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  awaiting: "Awaiting Reply",
  waiting: "Waiting on You",
  resolved: "Resolved",
  closed: "Closed",
};

/** Active tickets are "open". */
export const isOpenTicket = (s: TicketStatus) => s === "awaiting" || s === "waiting";

export interface CategoryMeta {
  label: string;
  guidance: string;
  /** Which references are most useful for this category. */
  refs: ("order" | "transaction")[];
}

export const TICKET_CATEGORIES: Record<TicketCategory, CategoryMeta> = {
  order: {
    label: "Order Issue",
    guidance: "Choose the order and tell us what you expected and what you're seeing. Its status and link are attached automatically.",
    refs: ["order"],
  },
  payment: {
    label: "Payment / Deposit",
    guidance: "Choose the deposit from Transactions. Include the method you used — never card numbers, wallet seed phrases or bank logins.",
    refs: ["transaction"],
  },
  refund: {
    label: "Refund Request",
    guidance: "Choose the order and, if you have it, the related payment. Explain why you're asking so we can review it.",
    refs: ["order", "transaction"],
  },
  service: {
    label: "Service Question",
    guidance: "Ask about a service before or after ordering. Add an order if your question is about one you've placed.",
    refs: ["order"],
  },
  account: {
    label: "Account Help",
    guidance: "Describe what you're trying to do. We'll never ask for your password or sign-in codes.",
    refs: [],
  },
  technical: {
    label: "Technical Issue",
    guidance: "Tell us the page, what you clicked and what happened. A screenshot helps once attachments are enabled.",
    refs: [],
  },
  other: {
    label: "Other",
    guidance: "Tell us how we can help. Add an order or transaction if it's related to one.",
    refs: [],
  },
};

export const TICKET_CATEGORY_IDS = Object.keys(TICKET_CATEGORIES) as TicketCategory[];

/** Simulated file details only. No file is stored or uploaded. */
export interface TicketAttachment {
  name: string;
  size: string;
  kind: "image" | "pdf";
}

export interface TicketMessage {
  id: string;
  from: "customer" | "support";
  body: string;
  /** ISO timestamp (UTC). */
  at: string;
  attachments?: TicketAttachment[];
  /** Added in this browser's demo. */
  demo?: boolean;
}

export interface TicketEvent {
  at: string;
  label: string;
  demo?: boolean;
}

export interface DemoTicket {
  id: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  orderId?: string;
  txId?: string;
  createdAt: string;
  messages: TicketMessage[];
  events: TicketEvent[];
  /** The latest support reply hasn't been read. */
  unread: boolean;
  /** Created in this browser's demo. */
  demo?: boolean;
}

export const TICKETS: DemoTicket[] = [
  {
    id: "TCK-2044",
    subject: "Checking progress on my Instagram followers order",
    category: "order",
    priority: "normal",
    status: "awaiting",
    orderId: "SV-10531",
    createdAt: "2026-10-27T15:05:00Z",
    unread: false,
    messages: [
      {
        id: "m1",
        from: "customer",
        at: "2026-10-27T15:05:00Z",
        body: "Hi! Order SV-10531 shows 1,240 of 2,000 delivered. Is everything on track, or is there anything I should do?",
      },
    ],
    events: [{ at: "2026-10-27T15:05:00Z", label: "Ticket created" }],
  },
  {
    id: "TCK-2041",
    subject: "My YouTube views order is paused",
    category: "order",
    priority: "normal",
    status: "waiting",
    orderId: "SV-10530",
    createdAt: "2026-10-27T08:10:00Z",
    unread: true,
    messages: [
      {
        id: "m1",
        from: "customer",
        at: "2026-10-27T08:10:00Z",
        body: "I'd like help with order SV-10530. Please review its current status and let me know what information you need.",
      },
      {
        id: "m2",
        from: "support",
        at: "2026-10-27T09:32:00Z",
        body: "Thanks for reaching out. We checked SV-10530: the video link you supplied is private, so the order is paused until we can access it.\n\nPlease set the video to Public (or Unlisted) or send us a different public link. You can update it from My Orders using \"Update Link\" — once it's saved, we'll review the order again.",
      },
    ],
    events: [
      { at: "2026-10-27T08:10:00Z", label: "Ticket created" },
      { at: "2026-10-27T09:32:00Z", label: "Support replied · Waiting on you" },
    ],
  },
  {
    id: "TCK-2038",
    subject: "Bank transfer still processing",
    category: "payment",
    priority: "normal",
    status: "awaiting",
    txId: "DEP-3045",
    createdAt: "2026-10-26T13:20:00Z",
    unread: false,
    messages: [
      {
        id: "m1",
        from: "customer",
        at: "2026-10-26T13:20:00Z",
        body: "I sent a $200 bank transfer for deposit DEP-3045 yesterday using the reference shown. It still says Processing — could you check it?",
        attachments: [{ name: "transfer-confirmation.pdf", size: "182 KB", kind: "pdf" }],
      },
    ],
    events: [{ at: "2026-10-26T13:20:00Z", label: "Ticket created" }],
  },
  {
    id: "TCK-2035",
    subject: "Why is my X followers order on hold?",
    category: "order",
    priority: "normal",
    status: "waiting",
    orderId: "SV-10527",
    createdAt: "2026-10-25T17:02:00Z",
    unread: false,
    messages: [
      {
        id: "m1",
        from: "customer",
        at: "2026-10-25T17:02:00Z",
        body: "My order SV-10527 says it needs attention. What do I need to change?",
      },
      {
        id: "m2",
        from: "support",
        at: "2026-10-25T18:40:00Z",
        body: "Thanks for checking in. The X account on SV-10527 is protected, so it isn't publicly visible and we can't continue yet.\n\nYou can make the account public, or choose a different account, using \"Review Details\" in My Orders. Let us know here if you'd like to change anything else about the order.",
      },
    ],
    events: [
      { at: "2026-10-25T17:02:00Z", label: "Ticket created" },
      { at: "2026-10-25T18:40:00Z", label: "Support replied · Waiting on you" },
    ],
  },
  {
    id: "TCK-2029",
    subject: "Refund for my cancelled Instagram order",
    category: "refund",
    priority: "normal",
    status: "resolved",
    orderId: "SV-10508",
    txId: "REF-10508",
    createdAt: "2026-10-09T10:30:00Z",
    unread: false,
    messages: [
      {
        id: "m1",
        from: "customer",
        at: "2026-10-09T10:30:00Z",
        body: "I cancelled SV-10508 before it started. Where does the $46.00 go?",
      },
      {
        id: "m2",
        from: "support",
        at: "2026-10-09T11:05:00Z",
        body: "The order was cancelled before delivery started, and the $46.00 was returned to your SociVanta balance as REF-10508. You can see it in Transactions.",
      },
      {
        id: "m3",
        from: "customer",
        at: "2026-10-09T11:12:00Z",
        body: "Found it, thank you!",
      },
    ],
    events: [
      { at: "2026-10-09T10:30:00Z", label: "Ticket created" },
      { at: "2026-10-09T11:05:00Z", label: "Support replied" },
      { at: "2026-10-09T11:14:00Z", label: "Marked resolved" },
    ],
  },
  {
    id: "TCK-2024",
    subject: "Card payment didn't go through",
    category: "payment",
    priority: "urgent",
    status: "resolved",
    txId: "DEP-3042",
    createdAt: "2026-10-20T13:15:00Z",
    unread: false,
    messages: [
      {
        id: "m1",
        from: "customer",
        at: "2026-10-20T13:15:00Z",
        body: "My $75 card top-up DEP-3042 failed. Was I charged?",
      },
      {
        id: "m2",
        from: "support",
        at: "2026-10-20T14:02:00Z",
        body: "We checked DEP-3042: the card payment wasn't completed, and our records show nothing was charged or added to your balance. You're welcome to try again from Add Funds.",
      },
    ],
    events: [
      { at: "2026-10-20T13:15:00Z", label: "Ticket created" },
      { at: "2026-10-20T14:02:00Z", label: "Support replied" },
      { at: "2026-10-20T14:30:00Z", label: "Marked resolved" },
    ],
  },
  {
    id: "TCK-2017",
    subject: "Which Telegram service fits a new channel?",
    category: "service",
    priority: "normal",
    status: "closed",
    createdAt: "2026-10-18T09:00:00Z",
    unread: false,
    messages: [
      {
        id: "m1",
        from: "customer",
        at: "2026-10-18T09:00:00Z",
        body: "I'm starting a new Telegram channel. Should I order members or post views first?",
      },
      {
        id: "m2",
        from: "support",
        at: "2026-10-18T10:20:00Z",
        body: "Both are available in the catalog. Members add to your channel count, and post views apply to individual posts. Each service page shows its requirements, such as the channel needing to be public. We can't promise specific results, but we're happy to answer questions about any service.",
      },
    ],
    events: [
      { at: "2026-10-18T09:00:00Z", label: "Ticket created" },
      { at: "2026-10-18T10:20:00Z", label: "Support replied" },
      { at: "2026-10-25T10:20:00Z", label: "Closed" },
    ],
  },
  {
    id: "TCK-2012",
    subject: "BTC deposit expired",
    category: "payment",
    priority: "normal",
    status: "closed",
    txId: "DEP-3036",
    createdAt: "2026-10-08T19:10:00Z",
    unread: false,
    messages: [
      {
        id: "m1",
        from: "customer",
        at: "2026-10-08T19:10:00Z",
        body: "My Bitcoin deposit DEP-3036 says expired. I didn't send anything yet — is that a problem?",
      },
      {
        id: "m2",
        from: "support",
        at: "2026-10-08T19:48:00Z",
        body: "No problem. DEP-3036 expired because no payment arrived before the payment window closed, so nothing was charged. Please start a new deposit whenever you're ready.",
      },
    ],
    events: [
      { at: "2026-10-08T19:10:00Z", label: "Ticket created" },
      { at: "2026-10-08T19:48:00Z", label: "Support replied" },
      { at: "2026-10-15T19:48:00Z", label: "Closed" },
    ],
  },
];

/** Most recent message or event time. */
export const lastActivity = (t: DemoTicket) =>
  [...t.messages.map((m) => m.at), ...t.events.map((e) => e.at)].sort().at(-1) ?? t.createdAt;

/** Words that suggest a secret is being shared. We block these in demo forms. */
export const SENSITIVE_PATTERN =
  /\b(password|passcode|passwd|recovery code|backup code|2fa code|otp|seed phrase|secret phrase|private key|api key|api secret|secret key|cvv|cvc)\b/i;
/** 13–19 digit runs that look like card numbers. */
export const CARD_NUMBER_PATTERN = /\b(?:\d[ -]?){13,19}\b/;

export function sensitiveIssue(text: string) {
  if (SENSITIVE_PATTERN.test(text)) return "Please remove passwords, codes, keys or other secrets. We'll never need them.";
  if (CARD_NUMBER_PATTERN.test(text)) return "This looks like a card number. Please remove it — we never need full card details.";
  return null;
}
