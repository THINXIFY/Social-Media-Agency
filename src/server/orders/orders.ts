import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gt, ilike, inArray, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { CATEGORY_FIELDS, CATEGORY_META, type ServiceCategory } from "@/lib/catalog";
import { CUSTOMER_CANCELLABLE, type CustomerOrder, OPEN_ORDER_STATUSES, ORDER_STATUS_META, type OrderEventView, type OrderPaymentStatus, type OrderRevenueStatus, type OrderStatus } from "@/lib/orders";
import { audit } from "../audit";
import { allows } from "../auth/permissions";
import { loadStaffAccess } from "../auth";
import type { Db, Executor } from "../db/client";
import { customers, orderEvents, orderReviews, orders, platformSettings, platforms, servicePriceVersions, services, staffMembers, staffNotes, users } from "../db/schema";
import { getEnv } from "../env";
import { AppError, errors } from "../errors";
import { openWallet } from "../ledger/accounts";
import { postJournalEntry } from "../ledger/ledger";

/**
 * Orders and manual fulfilment (Phase 5E).
 *
 * Money rules:
 *  - Placing an order is one transaction: wallet locked, balance checked, the
 *    order and its frozen price snapshot inserted, `order_debit` posted
 *    (wallet → orders_in_progress: funds committed, not revenue) and linked.
 *    No funds → nothing is created. A retry with the same key returns the
 *    original order. The database re-checks the checkout switch and all six
 *    eligibility gates (SV009) and refuses unpaid orders at commit (SV011).
 *  - Cancelling or rejecting before work starts returns exactly the total to
 *    the wallet (`order_cancel`, idempotent per order).
 *  - A failure after work started holds the funds for refund review; refunds
 *    themselves are not enabled.
 *  - Revenue is recognised only under REVENUE_RECOGNITION_POLICY=on_completion
 *    (decision D5); by default it stays deferred.
 *
 * Public checkout stays off: `commerce.checkout_enabled` is false and no
 * service has all six gates recorded, so createOrder refuses in every real
 * environment. There is no bypass — tests satisfy the same gates in an
 * isolated test database.
 */

type Client = { ip?: string | null; userAgent?: string | null };
type Customer = { userId: string; customerId: string };
type Staff = { userId: string };

const newRef = () => `ORD-${randomBytes(8).toString("hex").toUpperCase().slice(0, 10)}`;
const REF = /^ORD-[A-Z0-9]{4,20}$/;
const looksSensitive = (text: string) =>
  /(password|passcode|otp|api[_ -]?key|secret|token|private[_ -]?key|seed[_ -]?phrase|recovery[_ -]?phrase|mnemonic|\bcvv\b|\bcvc\b|\b\d{13,19}\b)/i.test(text);
const UNIT: Record<string, string> = { per1000: "per 1,000", unit: "per unit", fixed: "per order", fee: "% of budget" };

/* -------------------------------------------------------------------------- */
/*  Readiness & pricing                                                       */
/* -------------------------------------------------------------------------- */

/** Whether the platform-wide checkout switch is on (owner-controlled setting). */
export async function checkoutEnabled(db: Executor) {
  const [row] = await db.select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.key, "commerce.checkout_enabled")).limit(1);
  return row?.value === true;
}

/** Half-up rounding of micro-dollars to cents, in integers only (no floating point). */
export function totalCentsFor(model: string, priceMicros: number, quantity: number): number {
  const p = BigInt(priceMicros);
  const q = BigInt(quantity);
  const divisor = BigInt(model === "per1000" ? 10_000_000 : 10_000); // micros→cents, and per 1,000 units
  const numerator = model === "fixed" ? p : p * q;
  const two = BigInt(2);
  const cents = (numerator * two + divisor) / (two * divisor);
  return Number(cents);
}

/* -------------------------------------------------------------------------- */
/*  Customer: create                                                          */
/* -------------------------------------------------------------------------- */

export const createOrderSchema = z
  .object({
    serviceId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80),
    quantity: z.number().int().positive().max(100_000_000),
    link: z.string().trim().max(500).optional().default(""),
    details: z.record(z.string().regex(/^[a-z][a-zA-Z0-9]{0,30}$/), z.union([z.string().max(2000), z.boolean()])).optional().default({}),
  })
  .strict();

export const ORDER_KEY = /^[A-Za-z0-9_-]{16,100}$/;
/** Orders a customer may place per minute (abuse and mistake protection). */
export const ORDERS_PER_MINUTE = 10;

const httpsUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && Boolean(u.hostname.includes("."));
  } catch {
    return false;
  }
};

/** Validates the service-specific details against the category's form (the same one New Order shows). */
function validateDetails(category: ServiceCategory, link: string, details: Record<string, string | boolean>) {
  const fields = CATEGORY_FIELDS[category];
  const known = new Set(fields.map((f) => f.id));
  for (const k of Object.keys(details)) if (!known.has(k) || k === "link" || k === "quantity") throw new AppError("VALIDATION_FAILED", "This service doesn't take that detail.", { details: { field: k } });
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (f.kind === "quantity") continue;
    if (f.kind === "link") {
      if (f.required && !link) throw new AppError("VALIDATION_FAILED", `Enter the ${f.label.toLowerCase()}.`, { details: { field: "link" } });
      if (link && !httpsUrl(link)) throw new AppError("VALIDATION_FAILED", "Enter a full https:// link.", { details: { field: "link" } });
      continue;
    }
    if (f.kind === "budget") throw new AppError("FEATURE_DISABLED", "Budget-based services are arranged with our team and can't be ordered online.");
    const v = details[f.id];
    if (f.kind === "consent") {
      if (f.required && v !== true) throw new AppError("VALIDATION_FAILED", `Confirm: ${f.label}`, { details: { field: f.id } });
      if (v === true) out[f.id] = "yes";
      continue;
    }
    const s = typeof v === "string" ? v.trim() : "";
    if (f.required && !s) throw new AppError("VALIDATION_FAILED", `Enter ${f.label.toLowerCase()}.`, { details: { field: f.id } });
    if (!s) continue;
    if (looksSensitive(s)) throw new AppError("VALIDATION_FAILED", "Never include passwords, codes or card numbers in an order.", { details: { field: f.id } });
    if (f.kind === "select" && f.options && !f.options.includes(s)) throw new AppError("VALIDATION_FAILED", `Choose a ${f.label.toLowerCase()} from the list.`, { details: { field: f.id } });
    if (f.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new AppError("VALIDATION_FAILED", "Enter a valid date.", { details: { field: f.id } });
    out[f.id] = s.slice(0, f.kind === "textarea" ? 2000 : 200);
  }
  return out;
}

/**
 * Places an order and charges the wallet atomically. Every input the price
 * depends on is re-read on the server; nothing the client sends about price,
 * status or balance is used.
 */
export async function createOrder(db: Db, actor: Customer, raw: unknown, idempotencyKey: string | null, client: Client = {}) {
  if (!idempotencyKey || !ORDER_KEY.test(idempotencyKey)) throw new AppError("VALIDATION_FAILED", "A request key is required. Please refresh and try again.", { details: { field: "idempotencyKey" } });
  const input = createOrderSchema.parse(raw);
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");

  const replay = async () => {
    const [row] = await db.select().from(orders).where(and(eq(orders.customerId, actor.customerId), eq(orders.idempotencyKey, idempotencyKey))).limit(1);
    if (!row) return null;
    if (row.requestHash !== requestHash) throw errors.idempotencyConflict();
    return { order: (await getOwnOrder(db, actor.customerId, row.publicRef))!, replayed: true };
  };
  const earlier = await replay();
  if (earlier) return earlier;

  if (!(await checkoutEnabled(db))) throw new AppError("FEATURE_DISABLED", "Ordering isn't open yet. Nothing has been charged.");
  const [account] = await db.select({ status: users.status }).from(users).where(eq(users.id, actor.userId)).limit(1);
  if (account?.status !== "active") throw errors.forbidden("place orders");

  const [svc] = await db
    .select({ s: services, platformName: platforms.name, priceVersionId: sql<string | null>`(select p.price_version_id from purchasable_services p where p.service_id = ${services.id})` })
    .from(services)
    .innerJoin(platforms, eq(platforms.id, services.platformId))
    .where(eq(services.id, input.serviceId))
    .limit(1);
  if (!svc || !svc.s.visible || svc.s.archivedAt || svc.s.draft) throw errors.notFound("That service");
  if (!svc.priceVersionId) throw new AppError("FEATURE_DISABLED", "This service isn't available to order yet. It needs every review and approval first.");
  const [price] = await db.select().from(servicePriceVersions).where(eq(servicePriceVersions.id, svc.priceVersionId)).limit(1);
  if (!price) throw new AppError("FEATURE_DISABLED", "This service has no current price.");
  if (price.pricingModel === "fee") throw new AppError("FEATURE_DISABLED", "Budget-based services are arranged with our team and can't be ordered online.");
  const category = svc.s.category as ServiceCategory;
  if (price.pricingModel === "fixed" && input.quantity !== 1) throw new AppError("VALIDATION_FAILED", "This service is ordered one at a time.", { details: { field: "quantity" } });
  if (price.minQty && input.quantity < price.minQty) throw new AppError("VALIDATION_FAILED", `The minimum is ${price.minQty.toLocaleString("en-US")}.`, { details: { field: "quantity" } });
  if (price.maxQty && input.quantity > price.maxQty) throw new AppError("VALIDATION_FAILED", `The maximum is ${price.maxQty.toLocaleString("en-US")}.`, { details: { field: "quantity" } });
  const link = input.link;
  const details = validateDetails(category, link, input.details as Record<string, string | boolean>);
  const totalCents = totalCentsFor(price.pricingModel, price.priceMicros, input.quantity);
  if (totalCents < 1) throw new AppError("VALIDATION_FAILED", "This quantity is too small to order.", { details: { field: "quantity" } });

  const snapshot = {
    serviceName: svc.s.name,
    platformId: svc.s.platformId,
    platformName: svc.platformName,
    category,
    categoryLabel: CATEGORY_META[category].label,
    pricingModel: price.pricingModel,
    unitPriceMicros: price.priceMicros,
    unit: UNIT[price.pricingModel],
    minQty: price.minQty,
    maxQty: price.maxQty,
    priceVersionId: price.id,
    priceEffectiveFrom: price.effectiveFrom.toISOString(),
  };

  const created = await db.transaction(async (tx) => {
    // One order at a time per customer: serialises the rate limit and the wallet check.
    await tx.execute(sql`select id from customers where id = ${actor.customerId} for update`);
    const [{ n }] = await tx.select({ n: count() }).from(orders).where(and(eq(orders.customerId, actor.customerId), gt(orders.placedAt, new Date(Date.now() - 60_000))));
    if (Number(n) >= ORDERS_PER_MINUTE) throw new AppError("RATE_LIMITED", "You're placing orders very quickly. Please wait a minute and try again.");
    const [row] = await tx
      .insert(orders)
      .values({
        publicRef: newRef(),
        customerId: actor.customerId,
        serviceId: svc.s.id,
        priceVersionId: price.id,
        quantity: input.quantity,
        link: link || null,
        fieldValues: details,
        unitPriceMicros: price.priceMicros,
        totalCents,
        status: "pending_review",
        reviewRequired: true,
        idempotencyKey,
        requestHash,
        priceSnapshot: snapshot,
      })
      .onConflictDoNothing({ target: [orders.customerId, orders.idempotencyKey] })
      .returning();
    if (!row) return null; // a concurrent retry with this key won
    const wallet = await openWallet(tx, actor.customerId);
    // Locks the wallet and refuses if it would go below zero (rolls back the order too).
    const posted = await postJournalEntry(tx as unknown as Db, {
      kind: "order_debit",
      idempotencyKey: `order:${row.id}:debit`,
      description: `Order ${row.publicRef}`,
      reference: { type: "order", id: row.publicRef },
      lines: [
        { accountCode: wallet, amountCents: totalCents },
        { accountCode: "orders_in_progress", amountCents: -totalCents },
      ],
    });
    await tx.update(orders).set({ debitEntryId: posted.entryId }).where(eq(orders.id, row.id));
    await tx.insert(orderEvents).values({ orderId: row.id, type: "created", toStatus: "pending_review", actorType: "customer", actorId: actor.userId, data: { totalCents, notify: "order.created" } });
    await audit(tx, { actorUserId: actor.userId, actorType: "customer", action: "order.created", targetType: "order", targetId: row.id, after: { totalCents, serviceId: svc.s.id, quantity: input.quantity }, ip: client.ip, userAgent: client.userAgent });
    return row;
  });
  if (!created) return (await replay())!;
  return { order: (await getOwnOrder(db, actor.customerId, created.publicRef))!, replayed: false };
}

/* -------------------------------------------------------------------------- */
/*  Customer: read, cancel, update details                                    */
/* -------------------------------------------------------------------------- */

const CUSTOMER_EVENTS: Record<string, string> = {
  created: "Order placed",
  approved: "Approved by our team",
  info_requested: "We need more information",
  details_updated: "You updated the details",
  rejected: "Order rejected",
  assigned: "Assigned to our fulfilment team",
  fulfillment_started: "Work started",
  progress: "Progress update",
  completed: "Completed",
  failed: "Order failed",
  cancelled: "Order canceled",
  funds_released: "Full amount returned to your balance",
  refund_review: "Sent for refund review",
};

type OrderRow = typeof orders.$inferSelect;

function customerEvents(rows: (typeof orderEvents.$inferSelect)[]): OrderEventView[] {
  return rows
    .filter((e) => e.type in CUSTOMER_EVENTS)
    .map((e) => {
      const d = (e.data ?? {}) as Record<string, unknown>;
      const detail = typeof d.customerMessage === "string" ? d.customerMessage : null;
      return { type: e.type, label: CUSTOMER_EVENTS[e.type], detail, at: e.at.toISOString(), actor: e.actorType === "customer" ? "you" : e.actorType === "staff" ? "team" : "system" };
    });
}

function toCustomer(o: OrderRow, events: (typeof orderEvents.$inferSelect)[]): CustomerOrder {
  const s = o.priceSnapshot as Record<string, unknown>;
  const status = o.status as OrderStatus;
  return {
    reference: o.publicRef,
    service: { id: o.serviceId, name: String(s.serviceName ?? o.serviceId), platform: String(s.platformName ?? ""), category: String(s.categoryLabel ?? "") },
    quantity: o.quantity,
    link: o.link,
    details: o.fieldValues as Record<string, string>,
    totalCents: o.totalCents,
    currency: "USD",
    unitPrice: { micros: o.unitPriceMicros, unit: String(s.unit ?? "") },
    status,
    statusReason: o.statusReason,
    paymentStatus: o.paymentStatus as OrderPaymentStatus,
    placedAt: o.placedAt.toISOString(),
    startedAt: o.startedAt?.toISOString() ?? null,
    completedAt: o.completedAt?.toISOString() ?? null,
    closedAt: o.closedAt?.toISOString() ?? null,
    canCancel: CUSTOMER_CANCELLABLE.includes(status),
    canUpdateDetails: status === "needs_customer_action",
    events: customerEvents(events),
  };
}

export const ownOrdersQuery = z.object({
  q: z.string().trim().max(80).optional().default(""),
  status: z.enum(["open", "attention", "completed", "closed"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(10),
});

export async function listOwnOrders(db: Executor, customerId: string, raw: z.input<typeof ownOrdersQuery>) {
  const q = ownOrdersQuery.parse(raw);
  const conds: SQL[] = [eq(orders.customerId, customerId)];
  if (q.status === "open") conds.push(inArray(orders.status, OPEN_ORDER_STATUSES));
  if (q.status === "attention") conds.push(eq(orders.status, "needs_customer_action"));
  if (q.status === "completed") conds.push(eq(orders.status, "completed"));
  if (q.status === "closed") conds.push(inArray(orders.status, ["cancelled", "rejected", "failed", "refunded"]));
  if (q.q) {
    const p = `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(or(ilike(orders.publicRef, p), sql`${orders.priceSnapshot}->>'serviceName' ilike ${p}`, ilike(orders.link, p))!);
  }
  const where = and(...conds);
  const [{ total }] = await db.select({ total: count() }).from(orders).where(where);
  const rows = await db.select().from(orders).where(where).orderBy(desc(orders.placedAt)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  const evs = rows.length ? await db.select().from(orderEvents).where(inArray(orderEvents.orderId, rows.map((r) => r.id))).orderBy(asc(orderEvents.at)) : [];
  return {
    items: rows.map((r) => toCustomer(r, evs.filter((e) => e.orderId === r.id))),
    total: Number(total),
    page: q.page,
    pageSize: q.pageSize,
    pages: Math.max(1, Math.ceil(Number(total) / q.pageSize)),
  };
}

export async function getOwnOrder(db: Executor, customerId: string, reference: string) {
  if (!REF.test(reference)) return null;
  const [row] = await db.select().from(orders).where(and(eq(orders.customerId, customerId), eq(orders.publicRef, reference))).limit(1);
  if (!row) return null;
  const evs = await db.select().from(orderEvents).where(eq(orderEvents.orderId, row.id)).orderBy(asc(orderEvents.at));
  return toCustomer(row, evs);
}

/**
 * Returns exactly the order total to the wallet. Called only inside a
 * transaction that also closes the order. Idempotent per order.
 */
async function releaseFunds(tx: Db, o: OrderRow, actorUserId: string | null) {
  const wallet = await openWallet(tx, o.customerId);
  const posted = await postJournalEntry(tx, {
    kind: "order_cancel",
    idempotencyKey: `order:${o.id}:release`,
    description: `Order ${o.publicRef} returned to wallet`,
    reference: { type: "order", id: o.publicRef },
    createdBy: actorUserId,
    lines: [
      { accountCode: "orders_in_progress", amountCents: o.totalCents },
      { accountCode: wallet, amountCents: -o.totalCents },
    ],
  });
  return posted.entryId;
}

async function lockOrder(tx: Executor, where: SQL) {
  const [o] = await tx.select().from(orders).where(where).for("update").limit(1);
  if (!o) throw errors.notFound("That order");
  return o;
}

const stateError = (o: OrderRow, action: string) => errors.conflict(`This order is ${ORDER_STATUS_META[o.status as OrderStatus].label.toLowerCase()}, so it can't be ${action}.`);

export async function cancelOwnOrder(db: Db, actor: Customer, reference: string, client: Client = {}) {
  if (!REF.test(reference)) throw errors.notFound("That order");
  await db.transaction(async (tx) => {
    const o = await lockOrder(tx, and(eq(orders.customerId, actor.customerId), eq(orders.publicRef, reference))!);
    if (o.status === "cancelled") return;
    if (!CUSTOMER_CANCELLABLE.includes(o.status as OrderStatus)) throw stateError(o, "canceled by you — contact support");
    const entryId = await releaseFunds(tx as unknown as Db, o, actor.userId);
    await tx.update(orders).set({ status: "cancelled", paymentStatus: "released", releaseEntryId: entryId, statusReason: "Canceled by you.", closedAt: new Date(), updatedAt: new Date() }).where(eq(orders.id, o.id));
    await tx.insert(orderEvents).values([
      { orderId: o.id, type: "cancelled", fromStatus: o.status, toStatus: "cancelled", actorType: "customer", actorId: actor.userId, data: { notify: "order.cancelled" } },
      { orderId: o.id, type: "funds_released", actorType: "system", data: { amountCents: o.totalCents, entryId } },
    ]);
    await audit(tx, { actorUserId: actor.userId, actorType: "customer", action: "order.cancelled", targetType: "order", targetId: o.id, after: { released: o.totalCents }, ip: client.ip, userAgent: client.userAgent });
  });
  return (await getOwnOrder(db, actor.customerId, reference))!;
}

export const updateDetailsSchema = z.object({ link: z.string().trim().max(500).optional().default(""), details: z.record(z.string(), z.union([z.string().max(2000), z.boolean()])).optional().default({}) }).strict();

/** The customer supplies what was asked for; the order returns to review. Price and quantity can't change. */
export async function updateOwnOrderDetails(db: Db, actor: Customer, reference: string, raw: unknown) {
  if (!REF.test(reference)) throw errors.notFound("That order");
  const input = updateDetailsSchema.parse(raw);
  await db.transaction(async (tx) => {
    const o = await lockOrder(tx, and(eq(orders.customerId, actor.customerId), eq(orders.publicRef, reference))!);
    if (o.status !== "needs_customer_action") throw stateError(o, "edited now");
    const category = (o.priceSnapshot as { category: ServiceCategory }).category;
    const details = validateDetails(category, input.link, input.details as Record<string, string | boolean>);
    await tx.update(orders).set({ link: input.link || null, fieldValues: details, updatedAt: new Date() }).where(eq(orders.id, o.id));
    await tx.update(orders).set({ status: "pending_review", statusReason: null, updatedAt: new Date() }).where(eq(orders.id, o.id));
    await tx.insert(orderEvents).values({ orderId: o.id, type: "details_updated", fromStatus: "needs_customer_action", toStatus: "pending_review", actorType: "customer", actorId: actor.userId, data: { notify: "order.awaiting_review" } });
  });
  return (await getOwnOrder(db, actor.customerId, reference))!;
}

/* -------------------------------------------------------------------------- */
/*  Staff: directory & detail                                                 */
/* -------------------------------------------------------------------------- */

export const staffOrdersQuery = z.object({
  q: z.string().trim().max(80).optional().default(""),
  status: z.enum(["open", "pending_review", "queued", "in_progress", "needs_customer_action", "completed", "failed", "rejected", "cancelled", "refunded"]).optional(),
  platform: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  assigned: z.enum(["me", "unassigned"]).optional(),
  sort: z.enum(["newest", "oldest", "amount"]).optional().default("newest"),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export async function listOrdersForStaff(db: Executor, raw: z.input<typeof staffOrdersQuery>, viewerUserId?: string) {
  const q = staffOrdersQuery.parse(raw);
  const conds: SQL[] = [];
  for (const term of q.q.split(/\s+/).filter(Boolean).slice(0, 5)) {
    const p = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(or(ilike(orders.publicRef, p), ilike(customers.publicRef, p), ilike(customers.firstName, p), ilike(customers.lastName, p), ilike(users.email, p), sql`${orders.priceSnapshot}->>'serviceName' ilike ${p}`, ilike(orders.link, p))!);
  }
  if (q.status === "open") conds.push(inArray(orders.status, OPEN_ORDER_STATUSES));
  else if (q.status) conds.push(eq(orders.status, q.status));
  if (q.platform) conds.push(sql`${orders.priceSnapshot}->>'platformId' = ${q.platform}`);
  if (q.assigned === "me" && viewerUserId) conds.push(eq(orders.assignedTo, viewerUserId));
  if (q.assigned === "unassigned") conds.push(sql`${orders.assignedTo} is null`);
  const where = conds.length ? and(...conds) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).innerJoin(users, eq(users.id, customers.userId)).where(where);
  const assignee = alias(users, "assignee");
  const rows = await db
    .select({ o: orders, customerRef: customers.publicRef, name: sql<string>`coalesce(nullif(${customers.displayName}, ''), ${customers.firstName} || ' ' || ${customers.lastName})`, email: users.email, assignee: sql<string | null>`coalesce(${assignee.name}, ${assignee.email})` })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(users, eq(users.id, customers.userId))
    .leftJoin(assignee, eq(assignee.id, orders.assignedTo))
    .where(where)
    .orderBy(q.sort === "oldest" ? asc(orders.placedAt) : q.sort === "amount" ? desc(orders.totalCents) : desc(orders.placedAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const counts = await db.select({ status: orders.status, n: count() }).from(orders).groupBy(orders.status);
  const by = Object.fromEntries(counts.map((c) => [c.status, Number(c.n)]));
  return {
    items: rows.map((r) => {
      const s = r.o.priceSnapshot as Record<string, unknown>;
      return {
        reference: r.o.publicRef,
        customer: { publicRef: r.customerRef, name: r.name, email: r.email },
        service: { name: String(s.serviceName ?? r.o.serviceId), platformId: String(s.platformId ?? ""), platform: String(s.platformName ?? "") },
        quantity: r.o.quantity,
        totalCents: r.o.totalCents,
        status: r.o.status as OrderStatus,
        paymentStatus: r.o.paymentStatus as OrderPaymentStatus,
        assignee: r.assignee,
        placedAt: r.o.placedAt.toISOString(),
      };
    }),
    total: Number(total),
    page: q.page,
    pageSize: q.pageSize,
    pages: Math.max(1, Math.ceil(Number(total) / q.pageSize)),
    queues: { review: by.pending_review ?? 0, needsInfo: by.needs_customer_action ?? 0, ready: by.queued ?? 0, inProgress: (by.in_progress ?? 0) + (by.partial ?? 0) },
  };
}

export type NextOrderAction = "approve" | "start" | "complete" | "await_customer" | "none";

const STAFF_EVENTS: Record<string, string> = {
  ...CUSTOMER_EVENTS,
  created: "Order placed and charged",
  approved: "Approved",
  assigned: "Assigned",
  details_updated: "Customer updated the details",
  revenue_recognized: "Revenue recognised",
  // Provider fulfilment (5F): staff-only, never shown on the customer timeline.
  provider_prepared: "Prepared for a provider (not sent)",
  provider_attempt_cancelled: "Prepared provider attempt cancelled",
  provider_submitted: "Sent to the provider",
  provider_submission_failed: "Provider didn't accept it",
  provider_outcome_unknown: "Provider outcome unknown",
  provider_progress: "Provider progress update",
  provider_reported_complete: "Provider reports it complete (needs staff evidence)",
  provider_resolved: "Provider attempt resolved by staff",
};

export async function getOrderForStaff(db: Executor, reference: string, viewerUserId?: string) {
  if (!REF.test(reference)) return null;
  const assignee = alias(users, "assignee");
  const [row] = await db
    .select({ o: orders, c: customers, email: users.email, assigneeName: sql<string | null>`coalesce(${assignee.name}, ${assignee.email})` })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(users, eq(users.id, customers.userId))
    .leftJoin(assignee, eq(assignee.id, orders.assignedTo))
    .where(eq(orders.publicRef, reference))
    .limit(1);
  if (!row) return null;
  const o = row.o;
  const actor = alias(users, "actor");
  const events = await db
    .select({ e: orderEvents, who: sql<string | null>`coalesce(${actor.name}, ${actor.email})` })
    .from(orderEvents)
    .leftJoin(actor, eq(actor.id, orderEvents.actorId))
    .where(eq(orderEvents.orderId, o.id))
    .orderBy(asc(orderEvents.at));
  const author = alias(users, "author");
  const notes = await db
    .select({ id: staffNotes.id, body: staffNotes.body, at: staffNotes.createdAt, by: sql<string>`coalesce(${author.name}, ${author.email})` })
    .from(staffNotes)
    .innerJoin(author, eq(author.id, staffNotes.staffUserId))
    .where(and(eq(staffNotes.targetType, "order"), eq(staffNotes.targetId, o.id)))
    .orderBy(asc(staffNotes.createdAt));
  const status = o.status as OrderStatus;
  const blockers: string[] = [];
  let next: { id: NextOrderAction; label: string } = { id: "none", label: "No action needed" };
  if (status === "pending_review") next = { id: "approve", label: "Review and approve" };
  else if (status === "queued") {
    next = { id: "start", label: "Start fulfilment" };
    if (!o.assignedTo) blockers.push("Assign the order before starting fulfilment.");
  } else if (status === "in_progress" || status === "partial") next = { id: "complete", label: "Complete with evidence" };
  else if (status === "needs_customer_action") next = { id: "await_customer", label: "Waiting for the customer" };
  if (status === "failed" && o.paymentStatus === "refund_review") blockers.push("Refunds aren't enabled yet; the payment stays held for review.");

  const s = o.priceSnapshot as Record<string, unknown>;
  return {
    reference: o.publicRef,
    customer: { publicRef: row.c.publicRef, accountRef: row.c.accountRef, name: row.c.displayName || `${row.c.firstName} ${row.c.lastName}`.trim(), email: row.email },
    service: { id: o.serviceId, name: String(s.serviceName ?? o.serviceId), platform: String(s.platformName ?? ""), category: String(s.categoryLabel ?? "") },
    snapshot: s,
    quantity: o.quantity,
    link: o.link,
    details: o.fieldValues as Record<string, string>,
    totalCents: o.totalCents,
    status,
    statusReason: o.statusReason,
    paymentStatus: o.paymentStatus as OrderPaymentStatus,
    revenueStatus: o.revenueStatus as OrderRevenueStatus,
    ledger: { debitEntryId: o.debitEntryId, releaseEntryId: o.releaseEntryId, recognitionEntryId: o.recognitionEntryId },
    fulfillment: { method: o.fulfillmentMethod, reference: o.fulfillmentRef, assignee: row.assigneeName, assignedToMe: Boolean(viewerUserId && o.assignedTo === viewerUserId), startedAt: o.startedAt?.toISOString() ?? null, completedAt: o.completedAt?.toISOString() ?? null },
    placedAt: o.placedAt.toISOString(),
    closedAt: o.closedAt?.toISOString() ?? null,
    events: events.map(({ e, who }) => ({ type: e.type, label: STAFF_EVENTS[e.type] ?? e.type, from: e.fromStatus, to: e.toStatus, by: e.actorType === "staff" ? (who ?? "Staff") : e.actorType === "customer" ? "Customer" : "System", data: e.data as Record<string, unknown>, at: e.at.toISOString() })),
    notes: notes.map((n) => ({ ...n, at: n.at.toISOString() })),
    next,
    blockers,
  };
}

/* -------------------------------------------------------------------------- */
/*  Staff: lifecycle                                                          */
/* -------------------------------------------------------------------------- */

const reason = (min: number, label: string) => z.string().trim().min(min, `${label} needs at least ${min} characters.`).max(500);
export const reasonSchema = z.object({ reason: reason(10, "The reason") }).strict();
export const infoRequestSchema = z.object({ message: reason(10, "The message") }).strict();
export const assignSchema = z.object({ assigneeUserId: z.string().uuid().optional() }).strict();
export const startSchema = z.object({ fulfillmentRef: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9 ._\/#-]+$/, "Use letters, numbers, spaces, dots, dashes, slashes or #.") }).strict();
export const progressSchema = z.object({ note: reason(5, "The update"), evidenceUrl: z.string().trim().max(500).optional().default("") }).strict();
export const completeSchema = z
  .object({
    evidenceNote: reason(20, "The completion evidence"),
    evidenceUrl: z.string().trim().max(500).optional().default(""),
    checks: z.object({ deliveredAsOrdered: z.literal(true, { message: "Confirm the order was delivered as ordered." }), verifiedOnTarget: z.literal(true, { message: "Confirm you checked the delivery on the target." }) }).strict(),
  })
  .strict();

function checkText(...values: string[]) {
  for (const v of values) if (v && looksSensitive(v)) throw new AppError("VALIDATION_FAILED", "Never include passwords, codes, keys or card numbers.");
}
function checkUrl(v: string, field: string) {
  if (v && !httpsUrl(v)) throw new AppError("VALIDATION_FAILED", "Use a full https:// link.", { details: { field } });
}

async function staffTransition(
  db: Db,
  staff: Staff,
  reference: string,
  action: string,
  run: (tx: Db, o: OrderRow) => Promise<{ set: Partial<typeof orders.$inferInsert>; events: { type: string; to?: OrderStatus | null; data?: Record<string, unknown> }[] } | null>,
  client: Client = {},
) {
  if (!REF.test(reference)) throw errors.notFound("That order");
  await db.transaction(async (tx) => {
    const o = await lockOrder(tx, eq(orders.publicRef, reference));
    const result = await run(tx as unknown as Db, o);
    if (!result) return;
    await tx.update(orders).set({ ...result.set, updatedAt: new Date() }).where(eq(orders.id, o.id));
    for (const ev of result.events)
      await tx.insert(orderEvents).values({ orderId: o.id, type: ev.type, fromStatus: ev.to ? o.status : null, toStatus: ev.to ?? null, actorType: ev.type === "funds_released" ? "system" : "staff", actorId: ev.type === "funds_released" ? null : staff.userId, data: ev.data ?? {} });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: `order.${action}`, targetType: "order", targetId: o.id, after: { from: o.status, to: result.set.status ?? o.status }, ip: client.ip, userAgent: client.userAgent });
  });
}

export const approveOrder = (db: Db, staff: Staff, reference: string, client?: Client) =>
  staffTransition(db, staff, reference, "approved", async (tx, o) => {
    if (o.status !== "pending_review") throw stateError(o, "approved");
    await tx.insert(orderReviews).values({ orderId: o.id, decision: "approved", decidedBy: staff.userId }).onConflictDoUpdate({ target: orderReviews.orderId, set: { decision: "approved", reason: null, decidedBy: staff.userId, decidedAt: new Date() } });
    return { set: { status: "queued" }, events: [{ type: "approved", to: "queued", data: { notify: "order.accepted" } }] };
  }, client);

export const requestOrderInfo = (db: Db, staff: Staff, reference: string, raw: unknown, client?: Client) =>
  staffTransition(db, staff, reference, "info_requested", async (_tx, o) => {
    const { message } = infoRequestSchema.parse(raw);
    checkText(message);
    if (!["pending_review", "queued"].includes(o.status)) throw stateError(o, "sent back to the customer");
    return { set: { status: "needs_customer_action", statusReason: message }, events: [{ type: "info_requested", to: "needs_customer_action", data: { customerMessage: message, notify: "order.needs_info" } }] };
  }, client);

/** Reject before work starts; the full amount returns to the wallet. */
export const rejectOrder = (db: Db, staff: Staff, reference: string, raw: unknown, client?: Client) =>
  staffTransition(db, staff, reference, "rejected", async (tx, o) => {
    const { reason: why } = reasonSchema.parse(raw);
    checkText(why);
    if (!["pending_review", "needs_customer_action"].includes(o.status)) throw stateError(o, "rejected");
    const entryId = await releaseFunds(tx, o, staff.userId);
    await tx.insert(orderReviews).values({ orderId: o.id, decision: "rejected", reason: why, decidedBy: staff.userId }).onConflictDoUpdate({ target: orderReviews.orderId, set: { decision: "rejected", reason: why, decidedBy: staff.userId, decidedAt: new Date() } });
    return {
      set: { status: "rejected", paymentStatus: "released", releaseEntryId: entryId, statusReason: why, closedAt: new Date() },
      events: [
        { type: "rejected", to: "rejected", data: { customerMessage: why, notify: "order.rejected" } },
        { type: "funds_released", data: { amountCents: o.totalCents, entryId } },
      ],
    };
  }, client);

/** Staff cancellation before work starts; the full amount returns to the wallet. */
export const cancelOrderByStaff = (db: Db, staff: Staff, reference: string, raw: unknown, client?: Client) =>
  staffTransition(db, staff, reference, "cancelled", async (tx, o) => {
    const { reason: why } = reasonSchema.parse(raw);
    checkText(why);
    if (!["pending_review", "needs_customer_action", "queued"].includes(o.status)) throw stateError(o, "canceled (work has started — mark it failed instead)");
    const entryId = await releaseFunds(tx, o, staff.userId);
    return {
      set: { status: "cancelled", paymentStatus: "released", releaseEntryId: entryId, statusReason: why, closedAt: new Date() },
      events: [
        { type: "cancelled", to: "cancelled", data: { customerMessage: why, notify: "order.cancelled" } },
        { type: "funds_released", data: { amountCents: o.totalCents, entryId } },
      ],
    };
  }, client);

/** Assign to an active staff member who can manage orders (defaults to the caller). */
export const assignOrder = (db: Db, staff: Staff, reference: string, raw: unknown, client?: Client) =>
  staffTransition(db, staff, reference, "assigned", async (tx, o) => {
    const { assigneeUserId } = assignSchema.parse(raw);
    if (!["queued", "in_progress", "partial", "pending_review"].includes(o.status)) throw stateError(o, "assigned");
    const target = assigneeUserId ?? staff.userId;
    const [member] = await tx.select({ id: staffMembers.id, name: users.name, email: users.email }).from(staffMembers).innerJoin(users, eq(users.id, staffMembers.userId)).where(eq(staffMembers.userId, target)).limit(1);
    const access = member ? await loadStaffAccess(tx, member.id) : null;
    if (!access || !allows(access, "orders:manage")) throw new AppError("VALIDATION_FAILED", "Assign the order to an active staff member who can manage orders.", { details: { field: "assigneeUserId" } });
    if (o.assignedTo === target) return null;
    return { set: { assignedTo: target, fulfillmentMethod: "manual" }, events: [{ type: "assigned", data: { assignee: member!.name || member!.email, method: "manual" } }] };
  }, client);

/** Record that manual fulfilment has started, with an internal reference. */
export const startFulfillment = (db: Db, staff: Staff, reference: string, raw: unknown, client?: Client) =>
  staffTransition(db, staff, reference, "fulfillment_started", async (_tx, o) => {
    const { fulfillmentRef } = startSchema.parse(raw);
    if (o.status !== "queued") throw stateError(o, "started");
    if (!o.assignedTo) throw errors.conflict("Assign the order before starting fulfilment.");
    return { set: { status: "in_progress", fulfillmentRef, fulfillmentMethod: "manual", startedAt: new Date() }, events: [{ type: "fulfillment_started", to: "in_progress", data: { fulfillmentRef, method: "manual", notify: "order.fulfillment_started" } }] };
  }, client);

/** A factual progress note (no invented quantities or percentages). */
export const recordProgress = (db: Db, staff: Staff, reference: string, raw: unknown, client?: Client) =>
  staffTransition(db, staff, reference, "progress_recorded", async (_tx, o) => {
    const { note, evidenceUrl } = progressSchema.parse(raw);
    checkText(note);
    checkUrl(evidenceUrl, "evidenceUrl");
    if (o.status !== "in_progress" && o.status !== "partial") throw stateError(o, "updated");
    return { set: {}, events: [{ type: "progress", data: { note, evidenceUrl: evidenceUrl || null } }] };
  }, client);

/** Complete only with delivery evidence; revenue follows the configured policy. */
export const completeOrder = (db: Db, staff: Staff, reference: string, raw: unknown, client?: Client) =>
  staffTransition(db, staff, reference, "completed", async (tx, o) => {
    const ev = completeSchema.parse(raw);
    checkText(ev.evidenceNote);
    checkUrl(ev.evidenceUrl, "evidenceUrl");
    if (o.status !== "in_progress" && o.status !== "partial") throw stateError(o, "completed");
    if (!o.startedAt || !o.fulfillmentRef) throw errors.conflict("Record the fulfilment start before completing.");
    const set: Partial<typeof orders.$inferInsert> = { status: "completed", completedAt: new Date(), closedAt: new Date() };
    const events: { type: string; to?: OrderStatus; data?: Record<string, unknown> }[] = [{ type: "completed", to: "completed", data: { evidenceNote: ev.evidenceNote, evidenceUrl: ev.evidenceUrl || null, checks: ev.checks, notify: "order.completed" } }];
    if (getEnv().REVENUE_RECOGNITION_POLICY === "on_completion") {
      const posted = await recognise(tx, o, staff.userId);
      set.revenueStatus = "recognized";
      set.recognitionEntryId = posted;
      events.push({ type: "revenue_recognized", data: { amountCents: o.totalCents, entryId: posted } });
    }
    return { set, events };
  }, client);

async function recognise(tx: Db, o: OrderRow, userId: string) {
  const posted = await postJournalEntry(tx, {
    kind: "order_revenue",
    idempotencyKey: `order:${o.id}:revenue`,
    description: `Order ${o.publicRef} revenue recognised`,
    reference: { type: "order", id: o.publicRef },
    createdBy: userId,
    lines: [
      { accountCode: "orders_in_progress", amountCents: o.totalCents },
      { accountCode: "revenue:orders", amountCents: -o.totalCents },
    ],
  });
  return posted.entryId;
}

/**
 * Mark an order failed. Before work started the full amount returns to the
 * wallet; after it started the payment is held for refund review (refunds are
 * not enabled), so nothing is silently refunded.
 */
export const failOrder = (db: Db, staff: Staff, reference: string, raw: unknown, client?: Client) =>
  staffTransition(db, staff, reference, "failed", async (tx, o) => {
    const { reason: why } = reasonSchema.parse(raw);
    checkText(why);
    if (!["queued", "in_progress", "partial"].includes(o.status)) throw stateError(o, "marked failed");
    if (o.status === "queued") {
      // Nothing was worked on: treat as a cancellation so the customer isn't left out of pocket.
      const entryId = await releaseFunds(tx, o, staff.userId);
      return {
        set: { status: "cancelled", paymentStatus: "released", releaseEntryId: entryId, statusReason: why, closedAt: new Date() },
        events: [
          { type: "cancelled", to: "cancelled", data: { customerMessage: why, notify: "order.cancelled" } },
          { type: "funds_released", data: { amountCents: o.totalCents, entryId } },
        ],
      };
    }
    return {
      set: { status: "failed", paymentStatus: "refund_review", statusReason: why, closedAt: new Date() },
      events: [
        { type: "failed", to: "failed", data: { customerMessage: why, notify: "order.failed" } },
        { type: "refund_review", data: { notify: "order.refund_review" } },
      ],
    };
  }, client);

export const noteSchema = z.object({ body: z.string().trim().min(1).max(1000) }).strict();
export async function addOrderNote(db: Db, staff: Staff, reference: string, raw: unknown) {
  const { body } = noteSchema.parse(raw);
  if (looksSensitive(body)) throw new AppError("VALIDATION_FAILED", "Notes can't contain passwords, codes, keys or card numbers.", { details: { field: "body" } });
  const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.publicRef, reference)).limit(1);
  if (!o) throw errors.notFound("That order");
  await db.insert(staffNotes).values({ targetType: "order", targetId: o.id, staffUserId: staff.userId, body });
}

/** Staff who can be assigned orders (active, Orders: Manage). */
export async function assignableStaff(db: Executor) {
  const rows = await db.select({ staffId: staffMembers.id, userId: users.id, name: users.name, email: users.email }).from(staffMembers).innerJoin(users, eq(users.id, staffMembers.userId)).where(eq(staffMembers.status, "active"));
  const out: { userId: string; name: string }[] = [];
  for (const r of rows) {
    const a = await loadStaffAccess(db, r.staffId);
    if (a && allows(a, "orders:manage")) out.push({ userId: r.userId, name: r.name || r.email });
  }
  return out;
}
