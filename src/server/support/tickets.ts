import "server-only";
import { randomBytes } from "node:crypto";
import { and, count, desc, eq, ilike, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { CATEGORIES, EVENT_LABEL, PRIORITY_LABEL, REOPEN_DAYS, STATUS_META, type TicketCategory, type TicketEventView, type TicketMessageView, type TicketPriority, type TicketStatus, type TicketSummary } from "@/lib/support";
import { audit } from "../audit";
import { allows } from "../auth/permissions";
import { loadStaffAccess } from "../auth";
import { hit } from "../auth/rate-limit";
import type { Db, Executor } from "../db/client";
import { customers, notifications, orders, services, staffMembers, ticketEvents, ticketInternalNotes, ticketMessages, tickets, users } from "../db/schema";
import { AppError, errors } from "../errors";

/*
 * Customer support tickets (Phase 5G-A).
 *
 *  - Customers only ever reach their own tickets: every customer query is
 *    scoped by the session's customer id, and internal notes are never read
 *    on the customer side.
 *  - Messages, notes and activity are append-only (database triggers).
 *  - Retried submissions are stored once (client keys), creation and replies
 *    are rate-limited, and text that looks like a password or card number is
 *    refused before it's stored.
 *  - Customers get in-app notifications for staff replies and status
 *    changes. No email is sent: email delivery isn't part of this phase.
 */

type Customer = { userId: string; customerId: string };
type Staff = { userId: string; staffId: string };
type Client = { ip?: string | null; userAgent?: string | null };

const REF = /^TCK-[A-Z0-9]{4,20}$/;
const KEY = /^[A-Za-z0-9_-]{16,100}$/;
const newRef = () => `TCK-${randomBytes(6).toString("hex").toUpperCase().slice(0, 8)}`;
const looksSensitive = (text: string) => /(password\s*[:=]|passcode|\botp\b|api[_ -]?key|secret\s*[:=]|private[_ -]?key|seed[_ -]?phrase|recovery[_ -]?phrase|mnemonic|\bcvv\b|\bcvc\b|\b(?:\d[ -]?){13,19}\b)/i.test(text);

function checkText(...values: string[]) {
  for (const v of values) if (looksSensitive(v)) throw new AppError("VALIDATION_FAILED", "Please don't include passwords, codes, keys or card numbers. Our team will never ask for them.", { details: { field: "message" } });
}

async function notify(tx: Executor, userId: string, title: string, body: string, reference: string) {
  await tx.insert(notifications).values({ recipientUserId: userId, kind: "support", title, body: body.slice(0, 200), link: `/dashboard/support?ticket=${reference}` });
}

async function event(tx: Executor, ticketId: string, type: string, actor: { type: "customer" | "staff" | "system"; userId?: string | null }, opts: { from?: string | null; to?: string | null; customerVisible?: boolean } = {}) {
  await tx.insert(ticketEvents).values({ ticketId, type, fromValue: opts.from ?? null, toValue: opts.to ?? null, actorType: actor.type, actorUserId: actor.userId ?? null, customerVisible: opts.customerVisible ?? true });
}

const preview = (s: string) => (s.length > 140 ? `${s.slice(0, 139)}…` : s);

/* -------------------------------------------------------------------------- */
/*  Customer                                                                  */
/* -------------------------------------------------------------------------- */

export const createTicketSchema = z.strictObject({
  subject: z.string().trim().min(4, "Add a short subject (at least 4 characters).").max(150),
  category: z.enum(CATEGORIES.map((c) => c.id) as [TicketCategory, ...TicketCategory[]]),
  message: z.string().trim().min(10, "Tell us a little more (at least 10 characters).").max(5000),
  orderRef: z.string().trim().max(24).optional().default(""),
  key: z.string().regex(KEY),
});

/** Opens a ticket. A retry with the same key returns the original ticket instead of creating another. */
export async function createTicket(db: Db, actor: Customer, raw: unknown, client: Client = {}) {
  const input = createTicketSchema.parse(raw);
  checkText(input.subject, input.message);
  const [existing] = await db.select({ ref: tickets.publicRef }).from(tickets).where(and(eq(tickets.customerId, actor.customerId), eq(tickets.idempotencyKey, input.key))).limit(1);
  if (existing) return { reference: existing.ref, duplicate: true };
  const burst = await hit(db, "ticket-create", actor.customerId, { limit: 5, windowSeconds: 3600 });
  if (!burst.ok) throw new AppError("RATE_LIMITED", `You've opened several tickets recently. Please reply on an existing ticket, or try again in ${Math.ceil(burst.retryAfter / 60)} minutes.`);
  let orderId: string | null = null;
  if (input.orderRef) {
    const [o] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.publicRef, input.orderRef), eq(orders.customerId, actor.customerId))).limit(1);
    if (!o) throw new AppError("VALIDATION_FAILED", "That order wasn't found on your account.", { details: { field: "orderRef" } });
    orderId = o.id;
  }
  try {
    return await db.transaction(async (tx) => {
      const now = new Date();
      const [t] = await tx
        .insert(tickets)
        .values({ publicRef: newRef(), customerId: actor.customerId, subject: input.subject, category: input.category, orderId, idempotencyKey: input.key, status: "awaiting", lastCustomerMessageAt: now })
        .returning({ id: tickets.id, ref: tickets.publicRef });
      await tx.insert(ticketMessages).values({ ticketId: t.id, authorType: "customer", authorUserId: actor.userId, body: input.message, clientKey: input.key });
      await event(tx, t.id, "created", { type: "customer", userId: actor.userId });
      await audit(tx, { actorUserId: actor.userId, actorType: "customer", action: "ticket.created", targetType: "ticket", targetId: t.id, after: { category: input.category, order: input.orderRef || null }, ip: client.ip, userAgent: client.userAgent });
      return { reference: t.ref, duplicate: false };
    });
  } catch (e) {
    // Two identical submissions racing: the unique key keeps one; return it.
    const [again] = await db.select({ ref: tickets.publicRef }).from(tickets).where(and(eq(tickets.customerId, actor.customerId), eq(tickets.idempotencyKey, input.key))).limit(1);
    if (again) return { reference: again.ref, duplicate: true };
    throw e;
  }
}

export const listQuery = z.object({
  status: z.enum(["open", "all", "awaiting", "in_progress", "waiting", "resolved", "closed"]).optional().default("all"),
  q: z.string().trim().max(80).optional().default(""),
});
const OPEN: TicketStatus[] = ["awaiting", "in_progress", "waiting"];

async function summaries(db: Executor, where: SQL, limit: number): Promise<TicketSummary[]> {
  const rows = await db
    .select({ t: tickets, orderRef: orders.publicRef })
    .from(tickets)
    .leftJoin(orders, eq(orders.id, tickets.orderId))
    .where(where)
    .orderBy(desc(tickets.updatedAt))
    .limit(limit);
  if (!rows.length) return [];
  const last = await db
    .selectDistinctOn([ticketMessages.ticketId], { ticketId: ticketMessages.ticketId, author: ticketMessages.authorType, body: ticketMessages.body, at: ticketMessages.createdAt })
    .from(ticketMessages)
    .where(inArray(ticketMessages.ticketId, rows.map((r) => r.t.id)))
    .orderBy(ticketMessages.ticketId, desc(ticketMessages.createdAt));
  const lastBy = new Map(last.map((m) => [m.ticketId, m]));
  return rows.map(({ t, orderRef }) => {
    const m = lastBy.get(t.id);
    return {
      reference: t.publicRef,
      subject: t.subject,
      category: t.category as TicketCategory,
      status: t.status as TicketStatus,
      priority: t.priority as TicketPriority,
      updatedAt: t.updatedAt.toISOString(),
      createdAt: t.createdAt.toISOString(),
      lastMessage: m ? { author: m.author as TicketMessageView["author"], preview: preview(m.body), at: m.at.toISOString() } : null,
      orderRef,
    };
  });
}

export async function listOwnTickets(db: Executor, customerId: string, raw: z.input<typeof listQuery>) {
  const q = listQuery.parse(raw);
  const filters: SQL[] = [eq(tickets.customerId, customerId)];
  if (q.status === "open") filters.push(inArray(tickets.status, OPEN));
  else if (q.status !== "all") filters.push(eq(tickets.status, q.status));
  if (q.q) filters.push(or(ilike(tickets.subject, `%${q.q}%`), ilike(tickets.publicRef, `%${q.q}%`))!);
  const [items, [counts]] = await Promise.all([
    summaries(db, and(...filters)!, 100),
    db.select({ open: sql<number>`count(*) filter (where ${tickets.status} in ('awaiting','in_progress','waiting'))::int`, waiting: sql<number>`count(*) filter (where ${tickets.status} = 'waiting')::int`, total: count() }).from(tickets).where(eq(tickets.customerId, customerId)),
  ]);
  return { items, counts };
}

async function messagesFor(db: Executor, ticketId: string, forStaff: boolean): Promise<TicketMessageView[]> {
  const rows = await db
    .select({ m: ticketMessages, name: users.name, email: users.email })
    .from(ticketMessages)
    .leftJoin(users, eq(users.id, ticketMessages.authorUserId))
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(ticketMessages.createdAt);
  return rows.map(({ m, name, email }) => ({
    id: m.id,
    author: m.authorType as TicketMessageView["author"],
    // Customers see a staff member's first name only, never their email.
    authorName: m.authorType === "staff" ? (forStaff ? name || email || "Staff" : `${(name || "Sociotix").split(/\s+/)[0]} · Sociotix`) : m.authorType === "customer" ? (forStaff ? name || email || "Customer" : "You") : "Sociotix",
    body: m.body,
    at: m.createdAt.toISOString(),
  }));
}

function eventLabel(type: string, from: string | null, to: string | null, forStaff: boolean) {
  const base = EVENT_LABEL[type]?.[forStaff ? "staff" : "customer"] ?? type;
  if (type === "status_changed" && to) return `${forStaff ? "Status" : "Status"}: ${STATUS_META[to as TicketStatus]?.[forStaff ? "staff" : "customer"] ?? to}`;
  if (type === "priority_changed" && to) return `Priority: ${PRIORITY_LABEL[to as TicketPriority] ?? to}`;
  if (type === "assigned" && forStaff) return to ? `Assigned to ${to}` : "Unassigned";
  return base;
}

async function eventsFor(db: Executor, ticketId: string, forStaff: boolean): Promise<TicketEventView[]> {
  const rows = await db
    .select({ e: ticketEvents, name: users.name })
    .from(ticketEvents)
    .leftJoin(users, eq(users.id, ticketEvents.actorUserId))
    .where(forStaff ? eq(ticketEvents.ticketId, ticketId) : and(eq(ticketEvents.ticketId, ticketId), eq(ticketEvents.customerVisible, true)))
    .orderBy(ticketEvents.at);
  return rows.map(({ e, name }) => ({
    id: e.id,
    type: e.type,
    label: eventLabel(e.type, e.fromValue, e.toValue, forStaff),
    from: e.fromValue,
    to: e.toValue,
    by: e.actorType === "customer" ? (forStaff ? name || "Customer" : "You") : e.actorType === "staff" ? (forStaff ? name || "Staff" : "Sociotix") : "Sociotix",
    at: e.at.toISOString(),
  }));
}

function customerActions(t: typeof tickets.$inferSelect) {
  const closedRecently = t.status === "closed" && t.closedAt && Date.now() - t.closedAt.getTime() < REOPEN_DAYS * 86_400_000;
  return { canReply: t.status !== "closed", canClose: t.status !== "closed", canReopen: t.status === "resolved" || Boolean(closedRecently) };
}

/** One ticket, only for its owner. Internal notes are never read here. */
export async function getOwnTicket(db: Executor, customerId: string, reference: string) {
  if (!REF.test(reference)) return null;
  const [row] = await db
    .select({ t: tickets, orderRef: orders.publicRef })
    .from(tickets)
    .leftJoin(orders, eq(orders.id, tickets.orderId))
    .where(and(eq(tickets.publicRef, reference), eq(tickets.customerId, customerId)))
    .limit(1);
  if (!row) return null;
  const [messages, events] = await Promise.all([messagesFor(db, row.t.id, false), eventsFor(db, row.t.id, false)]);
  return {
    reference: row.t.publicRef,
    subject: row.t.subject,
    category: row.t.category as TicketCategory,
    status: row.t.status as TicketStatus,
    orderRef: row.orderRef,
    createdAt: row.t.createdAt.toISOString(),
    updatedAt: row.t.updatedAt.toISOString(),
    messages,
    events,
    actions: customerActions(row.t),
  };
}

async function lockOwn(tx: Executor, customerId: string, reference: string) {
  if (!REF.test(reference)) throw errors.notFound("That ticket");
  const [t] = await tx.select().from(tickets).where(and(eq(tickets.publicRef, reference), eq(tickets.customerId, customerId))).for("update").limit(1);
  if (!t) throw errors.notFound("That ticket");
  return t;
}

export const replySchema = z.strictObject({ body: z.string().trim().min(1, "Write a message first.").max(5000), key: z.string().regex(KEY) });

/** A customer reply. Replying to a ticket waiting on them, or a resolved one, sends it back to the team. */
export async function replyOwn(db: Db, actor: Customer, reference: string, raw: unknown, client: Client = {}) {
  const { body, key } = replySchema.parse(raw);
  checkText(body);
  const limited = await hit(db, "ticket-reply", actor.customerId, { limit: 20, windowSeconds: 600 });
  if (!limited.ok) throw new AppError("RATE_LIMITED", "You're sending messages very quickly. Please wait a moment.");
  await db.transaction(async (tx) => {
    const t = await lockOwn(tx, actor.customerId, reference);
    if (t.status === "closed") throw errors.conflict("This ticket is closed. Reopen it to reply, or open a new ticket.");
    const inserted = await tx.insert(ticketMessages).values({ ticketId: t.id, authorType: "customer", authorUserId: actor.userId, body, clientKey: key }).onConflictDoNothing().returning({ id: ticketMessages.id });
    if (!inserted.length) return; // the same reply submitted twice
    const next: TicketStatus = t.status === "waiting" || t.status === "resolved" ? "awaiting" : (t.status as TicketStatus);
    await tx.update(tickets).set({ status: next, lastCustomerMessageAt: new Date(), resolvedAt: next === "awaiting" ? null : t.resolvedAt, updatedAt: new Date() }).where(eq(tickets.id, t.id));
    await event(tx, t.id, "customer_replied", { type: "customer", userId: actor.userId });
    if (next !== t.status) await event(tx, t.id, t.status === "resolved" ? "reopened" : "status_changed", { type: "customer", userId: actor.userId }, { from: t.status, to: next });
    await audit(tx, { actorUserId: actor.userId, actorType: "customer", action: "ticket.customer_replied", targetType: "ticket", targetId: t.id, ip: client.ip, userAgent: client.userAgent });
  });
}

export async function closeOwn(db: Db, actor: Customer, reference: string, client: Client = {}) {
  await db.transaction(async (tx) => {
    const t = await lockOwn(tx, actor.customerId, reference);
    if (t.status === "closed") return;
    await tx.update(tickets).set({ status: "closed", closedAt: new Date(), updatedAt: new Date() }).where(eq(tickets.id, t.id));
    await event(tx, t.id, "closed_by_customer", { type: "customer", userId: actor.userId }, { from: t.status, to: "closed" });
    await audit(tx, { actorUserId: actor.userId, actorType: "customer", action: "ticket.closed_by_customer", targetType: "ticket", targetId: t.id, ip: client.ip, userAgent: client.userAgent });
  });
}

export async function reopenOwn(db: Db, actor: Customer, reference: string, client: Client = {}) {
  await db.transaction(async (tx) => {
    const t = await lockOwn(tx, actor.customerId, reference);
    if (!customerActions(t).canReopen) throw errors.conflict(t.status === "closed" ? `Closed tickets can be reopened for ${REOPEN_DAYS} days. Please open a new ticket.` : "This ticket is already open.");
    await tx.update(tickets).set({ status: "awaiting", resolvedAt: null, closedAt: null, updatedAt: new Date() }).where(eq(tickets.id, t.id));
    await event(tx, t.id, "reopened", { type: "customer", userId: actor.userId }, { from: t.status, to: "awaiting" });
    await audit(tx, { actorUserId: actor.userId, actorType: "customer", action: "ticket.reopened", targetType: "ticket", targetId: t.id, ip: client.ip, userAgent: client.userAgent });
  });
}

/** The customer's own recent orders, for linking a ticket. References only. */
export async function ownOrderChoices(db: Executor, customerId: string) {
  const rows = await db
    .select({ ref: orders.publicRef, service: services.name, at: orders.createdAt })
    .from(orders)
    .innerJoin(services, eq(services.id, orders.serviceId))
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(orders.createdAt))
    .limit(30);
  return rows.map((r) => ({ reference: r.ref, label: `${r.ref} · ${r.service}`, at: r.at.toISOString() }));
}

/* -------------------------------------------------------------------------- */
/*  Staff                                                                     */
/* -------------------------------------------------------------------------- */

export const queueQuery = z.object({
  view: z.enum(["needs_reply", "mine", "unassigned", "waiting", "resolved", "all"]).optional().default("needs_reply"),
  q: z.string().trim().max(80).optional().default(""),
  category: z.string().max(20).optional().default(""),
  priority: z.string().max(10).optional().default(""),
  status: z.string().max(20).optional().default(""),
});

export async function staffQueue(db: Executor, staff: Staff, raw: z.input<typeof queueQuery>) {
  const q = queueQuery.parse(raw);
  const filters: SQL[] = [];
  if (q.view === "needs_reply") filters.push(inArray(tickets.status, ["awaiting", "in_progress"]));
  if (q.view === "mine") filters.push(and(eq(tickets.assignedTo, staff.staffId), inArray(tickets.status, OPEN))!);
  if (q.view === "unassigned") filters.push(and(isNull(tickets.assignedTo), inArray(tickets.status, OPEN))!);
  if (q.view === "waiting") filters.push(eq(tickets.status, "waiting"));
  if (q.view === "resolved") filters.push(inArray(tickets.status, ["resolved", "closed"]));
  if (q.category && CATEGORIES.some((c) => c.id === q.category)) filters.push(eq(tickets.category, q.category));
  if (q.priority && q.priority in PRIORITY_LABEL) filters.push(eq(tickets.priority, q.priority));
  if (q.status && q.status in STATUS_META) filters.push(eq(tickets.status, q.status));
  if (q.q) filters.push(or(ilike(tickets.subject, `%${q.q}%`), ilike(tickets.publicRef, `%${q.q}%`), ilike(customers.publicRef, `%${q.q}%`), ilike(users.email, `%${q.q}%`))!);
  const assignee = alias(users, "assignee");
  const rows = await db
    .select({ ref: tickets.publicRef, id: tickets.id, customer: sql<string>`coalesce(${customers.displayName}, ${customers.firstName} || ' ' || ${customers.lastName})`, customerRef: customers.publicRef, assignee: sql<string | null>`coalesce(${assignee.name}, ${assignee.email})` })
    .from(tickets)
    .innerJoin(customers, eq(customers.id, tickets.customerId))
    .innerJoin(users, eq(users.id, customers.userId))
    .leftJoin(staffMembers, eq(staffMembers.id, tickets.assignedTo))
    .leftJoin(assignee, eq(assignee.id, staffMembers.userId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(tickets.updatedAt))
    .limit(100);
  const info = new Map(rows.map((r) => [r.id, r]));
  const items = (await summaries(db, rows.length ? inArray(tickets.id, rows.map((r) => r.id)) : sql`false`, 100)).map((s) => {
    const r = rows.find((x) => x.ref === s.reference)!;
    return { ...s, customer: info.get(r.id)!.customer, customerRef: r.customerRef, assignee: r.assignee };
  });
  const [counts] = await db
    .select({
      needsReply: sql<number>`count(*) filter (where ${tickets.status} in ('awaiting','in_progress'))::int`,
      mine: sql<number>`count(*) filter (where ${tickets.assignedTo} = ${staff.staffId} and ${tickets.status} in ('awaiting','in_progress','waiting'))::int`,
      unassigned: sql<number>`count(*) filter (where ${tickets.assignedTo} is null and ${tickets.status} in ('awaiting','in_progress','waiting'))::int`,
      waiting: sql<number>`count(*) filter (where ${tickets.status} = 'waiting')::int`,
      open: sql<number>`count(*) filter (where ${tickets.status} in ('awaiting','in_progress','waiting'))::int`,
    })
    .from(tickets);
  return { items, counts };
}

/** Full ticket for staff: conversation, internal notes, every event, and order context when the role may see orders. */
export async function staffTicket(db: Executor, reference: string, opts: { canSeeOrders: boolean }) {
  if (!REF.test(reference)) return null;
  const assignee = alias(users, "assignee");
  const [row] = await db
    .select({ t: tickets, c: customers, email: users.email, assigneeName: sql<string | null>`coalesce(${assignee.name}, ${assignee.email})` })
    .from(tickets)
    .innerJoin(customers, eq(customers.id, tickets.customerId))
    .innerJoin(users, eq(users.id, customers.userId))
    .leftJoin(staffMembers, eq(staffMembers.id, tickets.assignedTo))
    .leftJoin(assignee, eq(assignee.id, staffMembers.userId))
    .where(eq(tickets.publicRef, reference))
    .limit(1);
  if (!row) return null;
  const [messages, events, notes, order] = await Promise.all([
    messagesFor(db, row.t.id, true),
    eventsFor(db, row.t.id, true),
    db
      .select({ id: ticketInternalNotes.id, body: ticketInternalNotes.body, at: ticketInternalNotes.createdAt, by: sql<string>`coalesce(${users.name}, ${users.email})` })
      .from(ticketInternalNotes)
      .innerJoin(users, eq(users.id, ticketInternalNotes.staffUserId))
      .where(eq(ticketInternalNotes.ticketId, row.t.id))
      .orderBy(ticketInternalNotes.createdAt),
    opts.canSeeOrders && row.t.orderId
      ? db.select({ ref: orders.publicRef, status: orders.status, quantity: orders.quantity, totalCents: orders.totalCents, at: orders.createdAt, service: services.name }).from(orders).innerJoin(services, eq(services.id, orders.serviceId)).where(eq(orders.id, row.t.orderId)).limit(1)
      : Promise.resolve([]),
  ]);
  return {
    reference: row.t.publicRef,
    subject: row.t.subject,
    category: row.t.category as TicketCategory,
    status: row.t.status as TicketStatus,
    priority: row.t.priority as TicketPriority,
    assignee: row.assigneeName,
    assignedStaffId: row.t.assignedTo,
    customer: { name: row.c.displayName || `${row.c.firstName} ${row.c.lastName}`.trim(), publicRef: row.c.publicRef, accountRef: row.c.accountRef, email: row.email },
    order: order[0] ? { reference: order[0].ref, service: order[0].service, status: order[0].status, quantity: order[0].quantity, totalCents: order[0].totalCents, placedAt: order[0].at.toISOString() } : null,
    orderHidden: !opts.canSeeOrders && Boolean(row.t.orderId),
    createdAt: row.t.createdAt.toISOString(),
    updatedAt: row.t.updatedAt.toISOString(),
    messages,
    events,
    notes: notes.map((n) => ({ id: n.id, body: n.body, by: n.by, at: n.at.toISOString() })),
  };
}

async function lockAny(tx: Executor, reference: string) {
  if (!REF.test(reference)) throw errors.notFound("That ticket");
  const [t] = await tx.select().from(tickets).where(eq(tickets.publicRef, reference)).for("update").limit(1);
  if (!t) throw errors.notFound("That ticket");
  return t;
}

const customerUser = async (tx: Executor, customerId: string) => (await tx.select({ userId: customers.userId }).from(customers).where(eq(customers.id, customerId)).limit(1))[0]?.userId;

export const staffReplySchema = z.strictObject({
  body: z.string().trim().min(1, "Write a reply first.").max(5000),
  key: z.string().regex(KEY),
  /** The status after this reply; by default the ticket waits for the customer. */
  status: z.enum(["in_progress", "waiting", "resolved"]).optional().default("waiting"),
});

export async function staffReply(db: Db, staff: Staff, reference: string, raw: unknown, client: Client = {}) {
  const { body, key, status } = staffReplySchema.parse(raw);
  await db.transaction(async (tx) => {
    const t = await lockAny(tx, reference);
    if (t.status === "closed") throw errors.conflict("This ticket is closed. Reopen it before replying.");
    const inserted = await tx.insert(ticketMessages).values({ ticketId: t.id, authorType: "staff", authorUserId: staff.userId, body, clientKey: key }).onConflictDoNothing().returning({ id: ticketMessages.id });
    if (!inserted.length) return;
    const now = new Date();
    await tx.update(tickets).set({ status, lastStaffMessageAt: now, resolvedAt: status === "resolved" ? now : null, assignedTo: t.assignedTo ?? staff.staffId, updatedAt: now }).where(eq(tickets.id, t.id));
    await event(tx, t.id, "staff_replied", { type: "staff", userId: staff.userId });
    if (status !== t.status) await event(tx, t.id, "status_changed", { type: "staff", userId: staff.userId }, { from: t.status, to: status });
    if (!t.assignedTo) await event(tx, t.id, "assigned", { type: "staff", userId: staff.userId }, { to: (await staffName(tx, staff.staffId)) ?? "Staff", customerVisible: false });
    const owner = await customerUser(tx, t.customerId);
    if (owner) await notify(tx, owner, status === "resolved" ? `We've resolved: ${t.subject}` : `New reply on: ${t.subject}`, body, t.publicRef);
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "ticket.staff_replied", targetType: "ticket", targetId: t.id, after: { status }, ip: client.ip, userAgent: client.userAgent });
  });
}

async function staffName(tx: Executor, staffId: string) {
  const [r] = await tx.select({ name: sql<string>`coalesce(${users.name}, ${users.email})` }).from(staffMembers).innerJoin(users, eq(users.id, staffMembers.userId)).where(eq(staffMembers.id, staffId)).limit(1);
  return r?.name ?? null;
}

export const statusSchema = z.strictObject({ status: z.enum(["awaiting", "in_progress", "waiting", "resolved", "closed"]) });

export async function setStatus(db: Db, staff: Staff, reference: string, raw: unknown, client: Client = {}) {
  const { status } = statusSchema.parse(raw);
  await db.transaction(async (tx) => {
    const t = await lockAny(tx, reference);
    if (t.status === status) return;
    const now = new Date();
    await tx.update(tickets).set({ status, resolvedAt: status === "resolved" ? now : t.resolvedAt, closedAt: status === "closed" ? now : null, updatedAt: now }).where(eq(tickets.id, t.id));
    await event(tx, t.id, t.status === "closed" || t.status === "resolved" ? (OPEN.includes(status) ? "reopened" : "status_changed") : "status_changed", { type: "staff", userId: staff.userId }, { from: t.status, to: status });
    const owner = await customerUser(tx, t.customerId);
    if (owner) await notify(tx, owner, `Ticket update: ${STATUS_META[status].customer}`, `${t.subject}. ${STATUS_META[status].customerExplain}`, t.publicRef);
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "ticket.status_changed", targetType: "ticket", targetId: t.id, before: { status: t.status }, after: { status }, ip: client.ip, userAgent: client.userAgent });
  });
}

export const prioritySchema = z.strictObject({ priority: z.enum(["low", "normal", "high", "urgent"]) });

export async function setPriority(db: Db, staff: Staff, reference: string, raw: unknown, client: Client = {}) {
  const { priority } = prioritySchema.parse(raw);
  await db.transaction(async (tx) => {
    const t = await lockAny(tx, reference);
    if (t.priority === priority) return;
    await tx.update(tickets).set({ priority, updatedAt: new Date() }).where(eq(tickets.id, t.id));
    // Priority is an internal triage tool, so customers don't see it change.
    await event(tx, t.id, "priority_changed", { type: "staff", userId: staff.userId }, { from: t.priority, to: priority, customerVisible: false });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "ticket.priority_changed", targetType: "ticket", targetId: t.id, before: { priority: t.priority }, after: { priority }, ip: client.ip, userAgent: client.userAgent });
  });
}

export const assignSchema = z.strictObject({ staffId: z.string().uuid().nullable() });

/** Assigns to an active staff member who can manage support (or unassigns). */
export async function assignTicket(db: Db, staff: Staff, reference: string, raw: unknown, client: Client = {}) {
  const { staffId } = assignSchema.parse(raw);
  await db.transaction(async (tx) => {
    const t = await lockAny(tx, reference);
    if (t.assignedTo === staffId) return;
    let name: string | null = null;
    if (staffId) {
      const access = await loadStaffAccess(tx, staffId);
      if (!access || !allows(access, "support:manage")) throw new AppError("VALIDATION_FAILED", "Assign the ticket to an active staff member who can manage support.", { details: { field: "staffId" } });
      name = await staffName(tx, staffId);
    }
    await tx.update(tickets).set({ assignedTo: staffId, updatedAt: new Date() }).where(eq(tickets.id, t.id));
    await event(tx, t.id, "assigned", { type: "staff", userId: staff.userId }, { to: name, customerVisible: false });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "ticket.assigned", targetType: "ticket", targetId: t.id, after: { staffId }, ip: client.ip, userAgent: client.userAgent });
  });
}

export const noteSchema = z.strictObject({ body: z.string().trim().min(1, "Write a note first.").max(1000) });

/** A private note: staff-only, never shown to or sent to the customer. */
export async function addNote(db: Db, staff: Staff, reference: string, raw: unknown, client: Client = {}) {
  const { body } = noteSchema.parse(raw);
  await db.transaction(async (tx) => {
    const t = await lockAny(tx, reference);
    await tx.insert(ticketInternalNotes).values({ ticketId: t.id, staffUserId: staff.userId, body });
    await tx.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, t.id));
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "ticket.note_added", targetType: "ticket", targetId: t.id, ip: client.ip, userAgent: client.userAgent });
  });
}

/** Staff who can be assigned support tickets. */
export async function supportAssignees(db: Executor) {
  const rows = await db.select({ staffId: staffMembers.id, name: sql<string>`coalesce(${users.name}, ${users.email})` }).from(staffMembers).innerJoin(users, eq(users.id, staffMembers.userId)).where(eq(staffMembers.status, "active"));
  const out: { staffId: string; name: string }[] = [];
  for (const r of rows) {
    const access = await loadStaffAccess(db, r.staffId);
    if (access && allows(access, "support:manage")) out.push(r);
  }
  return out;
}
