/*
 * Support tickets (Phase 5G-A): statuses, categories and view shapes shared by
 * the server and the customer and staff screens. Customer wording describes
 * what's happening for them; staff wording describes the queue.
 */

export type TicketStatus = "awaiting" | "in_progress" | "waiting" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type TicketCategory = "order" | "payment" | "refund" | "service" | "account" | "technical" | "other";

export const TICKET_STATUSES: TicketStatus[] = ["awaiting", "in_progress", "waiting", "resolved", "closed"];
export const TICKET_PRIORITIES: TicketPriority[] = ["low", "normal", "high", "urgent"];

export const STATUS_META: Record<TicketStatus, { staff: string; customer: string; customerExplain: string }> = {
  awaiting: { staff: "Open", customer: "Awaiting our reply", customerExplain: "Your request is with our team. We'll reply here." },
  in_progress: { staff: "In progress", customer: "In progress", customerExplain: "Someone on our team is working on it." },
  waiting: { staff: "Waiting for customer", customer: "Waiting for you", customerExplain: "We replied and need something from you. Reply below to continue." },
  resolved: { staff: "Resolved", customer: "Resolved", customerExplain: "We think this is sorted. Reply if it isn't, or close the ticket." },
  closed: { staff: "Closed", customer: "Closed", customerExplain: "This ticket is closed." },
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };

export const CATEGORIES: { id: TicketCategory; label: string; hint: string }[] = [
  { id: "order", label: "An order", hint: "Status, details or a problem with an order" },
  { id: "payment", label: "Payments & wallet", hint: "Adding funds or your balance" },
  { id: "refund", label: "Cancellations & refunds", hint: "Getting money back or cancelling" },
  { id: "service", label: "A service", hint: "Questions before you order" },
  { id: "account", label: "My account", hint: "Sign-in, email or security" },
  { id: "technical", label: "Something isn't working", hint: "Errors or a page that won't load" },
  { id: "other", label: "Something else", hint: "Anything not listed" },
];
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label])) as Record<TicketCategory, string>;

/** Customers can reopen a closed ticket for this long; after that they open a new one. */
export const REOPEN_DAYS = 14;

export const EVENT_LABEL: Record<string, { customer: string; staff: string }> = {
  created: { customer: "You opened this ticket", staff: "Ticket opened" },
  customer_replied: { customer: "You replied", staff: "Customer replied" },
  staff_replied: { customer: "Our team replied", staff: "Staff replied" },
  status_changed: { customer: "Status changed", staff: "Status changed" },
  priority_changed: { customer: "Priority changed", staff: "Priority changed" },
  assigned: { customer: "Assigned to our team", staff: "Assigned" },
  closed_by_customer: { customer: "You closed this ticket", staff: "Closed by the customer" },
  reopened: { customer: "Ticket reopened", staff: "Reopened" },
};

export interface TicketMessageView {
  id: string;
  author: "customer" | "staff" | "system";
  /** Staff first name only for customers; full name for staff. */
  authorName: string;
  body: string;
  at: string;
}
export interface TicketEventView {
  id: string;
  type: string;
  label: string;
  from: string | null;
  to: string | null;
  by: string;
  at: string;
}
export interface TicketSummary {
  reference: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  updatedAt: string;
  createdAt: string;
  lastMessage: { author: "customer" | "staff" | "system"; preview: string; at: string } | null;
  orderRef: string | null;
}
