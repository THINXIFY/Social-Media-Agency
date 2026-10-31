import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "../audit";
import type { Db, Executor } from "../db/client";
import { customers, fulfillmentAttempts, orderEvents, orders, platforms, providers, providerServiceMappings, services, users } from "../db/schema";
import { AppError, errors } from "../errors";
import { logger } from "../log";
import { callProvider, ERROR_MESSAGE, normalizeStatus, providerOrderSchema, ProviderCallError, submitRequestSchema } from "./adapter";
import { type Deps, loadCredential, mappingsFor, recordEvent } from "./providers";
import { ADAPTERS, SUBMISSIONS_ENABLED } from "./registry";

/*
 * Provider fulfilment (Phase 5F), layered on the existing order architecture.
 *
 *  - Orders still move only through the 5E state machine (staff actions in
 *    src/server/orders/orders.ts). A fulfilment attempt records what was
 *    prepared, sent and reported for one order and one provider; it never
 *    changes the order's status, payment or revenue, and never posts to the ledger.
 *  - Submission is claimed atomically (one winner), sent once with an
 *    idempotency key, and never retried blindly. If the outcome can't be
 *    confirmed the attempt becomes `unknown` and blocks a new attempt until
 *    it is reconciled or a person resolves it.
 *  - A provider reporting completion is recorded for staff; completing the
 *    order still needs staff evidence through the existing Complete action.
 *  - In this phase submission is switched off (SUBMISSIONS_ENABLED) and no
 *    integration is installed, so nothing is ever sent.
 */

type Staff = { userId: string };
type Client = { ip?: string | null; userAgent?: string | null };
export type FulfillmentDeps = Deps & { submissionsEnabled?: boolean };

const REF = /^ORD-[A-Z0-9]{4,20}$/;
const UUID = /^[0-9a-f-]{36}$/;
const adapterOf = (key: string | null, deps: Deps) => (key ? ((deps.adapters ?? ADAPTERS)[key] ?? null) : null);

export const ATTEMPT_LABEL: Record<string, string> = {
  queued: "Prepared, not sent",
  submitted: "Sent to provider",
  in_progress: "Provider working on it",
  partial: "Provider finished partly",
  completed: "Provider reports complete",
  failed: "Failed, not active",
  cancelled: "Cancelled",
  unknown: "Outcome unknown, check provider",
};

async function orderEvent(tx: Executor, orderId: string, type: string, actor: { type: "staff" | "system" | "provider"; id?: string | null }, data: Record<string, unknown>) {
  // Staff-only event types: the customer timeline only shows the 5E event types.
  await tx.insert(orderEvents).values({ orderId, type, actorType: actor.type, actorId: actor.id ?? null, data });
}

/* -------------------------------------------------------------------------- */
/*  Read models                                                               */
/* -------------------------------------------------------------------------- */

export const queueQuery = z.object({
  view: z.enum(["ready", "active", "attention", "all"]).optional().default("ready"),
  q: z.string().trim().max(80).optional().default(""),
});

/** Approved and in-progress orders with their provider state. Provider costs are never included. */
export async function fulfillmentQueue(db: Executor, raw: z.input<typeof queueQuery>) {
  const { view, q } = queueQuery.parse(raw);
  const latest = db
    .selectDistinctOn([fulfillmentAttempts.orderId], { orderId: fulfillmentAttempts.orderId, status: fulfillmentAttempts.status, providerId: fulfillmentAttempts.providerId, at: fulfillmentAttempts.updatedAt })
    .from(fulfillmentAttempts)
    .orderBy(fulfillmentAttempts.orderId, desc(fulfillmentAttempts.createdAt))
    .as("latest");
  const filters = [inArray(orders.status, ["queued", "in_progress", "partial"])];
  if (view === "ready") filters.push(and(eq(orders.status, "queued"), or(isNull(latest.status), inArray(latest.status, ["failed", "cancelled"])))!);
  if (view === "active") filters.push(inArray(latest.status, ["queued", "submitted", "in_progress"]));
  if (view === "attention") filters.push(inArray(latest.status, ["unknown", "failed"]));
  if (q) filters.push(or(ilike(orders.publicRef, `%${q}%`), ilike(services.name, `%${q}%`))!);
  const rows = await db
    .select({
      reference: orders.publicRef,
      status: orders.status,
      quantity: orders.quantity,
      placedAt: orders.createdAt,
      serviceId: services.id,
      service: services.name,
      platform: platforms.name,
      attemptStatus: latest.status,
      attemptProvider: providers.name,
      activeMappings: sql<number>`(select count(*)::int from ${providerServiceMappings} m where m.service_id = ${services.id} and m.active)`,
      mappings: sql<number>`(select count(*)::int from ${providerServiceMappings} m where m.service_id = ${services.id})`,
    })
    .from(orders)
    .innerJoin(services, eq(services.id, orders.serviceId))
    .innerJoin(platforms, eq(platforms.id, services.platformId))
    .leftJoin(latest, eq(latest.orderId, orders.id))
    .leftJoin(providers, eq(providers.id, latest.providerId))
    .where(and(...filters))
    .orderBy(desc(orders.createdAt))
    .limit(100);
  return rows.map((r) => ({
    reference: r.reference,
    orderStatus: r.status,
    quantity: r.quantity,
    placedAt: r.placedAt.toISOString(),
    service: r.service,
    platform: r.platform,
    attempt: r.attemptStatus ? { status: r.attemptStatus, label: ATTEMPT_LABEL[r.attemptStatus] ?? r.attemptStatus, provider: r.attemptProvider } : null,
    mappings: { total: r.mappings, active: r.activeMappings },
  }));
}

export async function fulfillmentDetail(db: Executor, reference: string) {
  if (!REF.test(reference)) return null;
  const [o] = await db
    .select({ o: orders, service: services.name, platform: platforms.name, customerRef: customers.publicRef })
    .from(orders)
    .innerJoin(services, eq(services.id, orders.serviceId))
    .innerJoin(platforms, eq(platforms.id, services.platformId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(eq(orders.publicRef, reference))
    .limit(1);
  if (!o) return null;
  const [mappings, attempts] = await Promise.all([
    mappingsFor(db, eq(providerServiceMappings.serviceId, o.o.serviceId)),
    db
      .select({ a: fulfillmentAttempts, provider: providers.name, preparedBy: sql<string | null>`coalesce(${users.name}, ${users.email})` })
      .from(fulfillmentAttempts)
      .innerJoin(providers, eq(providers.id, fulfillmentAttempts.providerId))
      .leftJoin(users, eq(users.id, fulfillmentAttempts.preparedBy))
      .where(eq(fulfillmentAttempts.orderId, o.o.id))
      .orderBy(desc(fulfillmentAttempts.createdAt)),
  ]);
  const active = attempts.find((a) => ["queued", "submitted", "in_progress", "unknown"].includes(a.a.status));
  const blockers: string[] = [];
  if (o.o.status !== "queued") blockers.push(o.o.status === "pending_review" ? "Approve the order first." : "Only approved orders that haven't started can be prepared.");
  if (o.o.paymentStatus !== "charged") blockers.push("The order's payment isn't held.");
  if (!mappings.some((m) => m.active)) blockers.push(mappings.length ? "None of this service's mappings are active yet." : "This service isn't mapped to any provider.");
  if (active) blockers.push("This order already has an open attempt.");
  return {
    reference: o.o.publicRef,
    customerRef: o.customerRef,
    service: o.service,
    platform: o.platform,
    quantity: o.o.quantity,
    link: o.o.link,
    orderStatus: o.o.status,
    paymentStatus: o.o.paymentStatus,
    mappings: mappings.map((m) => ({ providerId: m.providerId, providerName: m.providerName, providerRef: m.providerRef, active: m.active, blockers: m.blockers })),
    attempts: attempts.map(({ a, provider, preparedBy }) => ({
      id: a.id,
      provider,
      providerServiceRef: a.providerServiceRef,
      providerOrderId: a.providerOrderId,
      status: a.status,
      label: ATTEMPT_LABEL[a.status] ?? a.status,
      providerStatus: a.providerStatus,
      deliveredQty: a.deliveredQty,
      error: a.error,
      resolution: a.resolution,
      preparedBy,
      submittedAt: a.submittedAt?.toISOString() ?? null,
      lastPolledAt: a.lastPolledAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
    canPrepare: blockers.length === 0,
    prepareBlockers: blockers,
    submission: { enabled: SUBMISSIONS_ENABLED, reason: SUBMISSIONS_ENABLED ? null : "Sending orders to providers is switched off in this phase. Fulfil manually from Orders." },
  };
}

/* -------------------------------------------------------------------------- */
/*  Prepare / cancel                                                          */
/* -------------------------------------------------------------------------- */

export const prepareSchema = z.strictObject({ providerId: z.string().min(1).max(60) });

/** Records a prepared (unsent) attempt for an approved, paid order with an active mapping. Re-checked by trigger SV013. */
export async function prepareAttempt(db: Db, staff: Staff, reference: string, raw: unknown, client: Client = {}) {
  if (!REF.test(reference)) throw errors.notFound("That order");
  const { providerId } = prepareSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.publicRef, reference)).for("update").limit(1);
    if (!o) throw errors.notFound("That order");
    if (o.status !== "queued") throw errors.conflict("Only approved orders that haven't started can be prepared for a provider.");
    if (o.paymentStatus !== "charged") throw errors.conflict("The order's payment isn't held, so it can't be fulfilled.");
    const [m] = await tx.select().from(providerServiceMappings).where(and(eq(providerServiceMappings.providerId, providerId), eq(providerServiceMappings.serviceId, o.serviceId))).limit(1);
    if (!m) throw errors.conflict("This service isn't mapped to that provider.");
    if (!m.active) throw errors.conflict("That mapping isn't active. It activates only after the service's eligibility gates and a provider review.");
    const open = await tx.select({ id: fulfillmentAttempts.id }).from(fulfillmentAttempts).where(and(eq(fulfillmentAttempts.orderId, o.id), inArray(fulfillmentAttempts.status, ["queued", "submitted", "in_progress", "unknown"]))).limit(1);
    if (open.length) throw errors.conflict("This order already has an open attempt.");
    const idempotencyKey = `ful_${randomBytes(16).toString("hex")}`;
    const requestHash = createHash("sha256").update(JSON.stringify({ ref: m.providerRef, link: o.link ?? "", quantity: o.quantity })).digest("hex");
    const [a] = await tx.insert(fulfillmentAttempts).values({ orderId: o.id, providerId, providerServiceRef: m.providerRef, idempotencyKey, requestHash, status: "queued", preparedBy: staff.userId }).returning({ id: fulfillmentAttempts.id });
    await orderEvent(tx, o.id, "provider_prepared", { type: "staff", id: staff.userId }, { providerId, providerRef: m.providerRef, attemptId: a.id });
    await recordEvent(tx, providerId, "attempt_prepared", `Prepared ${o.publicRef} (not sent).`, { actorUserId: staff.userId, data: { attemptId: a.id } });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "fulfillment.prepared", targetType: "order", targetId: o.id, after: { providerId, attemptId: a.id }, ip: client.ip, userAgent: client.userAgent });
    return a.id;
  });
}

export const cancelAttemptSchema = z.strictObject({ attemptId: z.string().regex(UUID), reason: z.string().trim().min(5, "Add a short reason.").max(300) });

/** Cancels a prepared attempt that was never sent. Sent attempts must be reconciled or resolved instead. */
export async function cancelAttempt(db: Db, staff: Staff, reference: string, raw: unknown, client: Client = {}) {
  const { attemptId, reason } = cancelAttemptSchema.parse(raw);
  await db.transaction(async (tx) => {
    const a = await lockAttempt(tx, reference, attemptId);
    if (a.status !== "queued" || a.submitCount > 0) throw errors.conflict("Only prepared attempts that were never sent can be cancelled.");
    await tx.update(fulfillmentAttempts).set({ status: "cancelled", resolution: reason, resolvedBy: staff.userId, updatedAt: new Date() }).where(eq(fulfillmentAttempts.id, a.id));
    await orderEvent(tx, a.orderId, "provider_attempt_cancelled", { type: "staff", id: staff.userId }, { attemptId: a.id, reason });
    await recordEvent(tx, a.providerId, "attempt_cancelled", `Prepared attempt cancelled: ${reason}`, { actorUserId: staff.userId, data: { attemptId: a.id } });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "fulfillment.cancelled", targetType: "fulfillment_attempt", targetId: a.id, ip: client.ip, userAgent: client.userAgent });
  });
}

async function lockAttempt(tx: Executor, reference: string, attemptId: string) {
  if (!REF.test(reference) || !UUID.test(attemptId)) throw errors.notFound("That attempt");
  const [row] = await tx
    .select({ a: fulfillmentAttempts })
    .from(fulfillmentAttempts)
    .innerJoin(orders, eq(orders.id, fulfillmentAttempts.orderId))
    .where(and(eq(fulfillmentAttempts.id, attemptId), eq(orders.publicRef, reference)))
    .for("update", { of: fulfillmentAttempts })
    .limit(1);
  if (!row) throw errors.notFound("That attempt");
  return row.a;
}

/* -------------------------------------------------------------------------- */
/*  Submit (trusted executor) — switched off in this phase                    */
/* -------------------------------------------------------------------------- */

/**
 * Sends a prepared attempt once. Only one caller can claim it (status
 * queued → submitted, submit_count 0 → 1, provider must be enabled: SV013).
 * Definite refusals fail the attempt; anything uncertain becomes `unknown`.
 */
export async function submitAttempt(db: Db, attemptId: string, deps: FulfillmentDeps = {}) {
  if (!(deps.submissionsEnabled ?? SUBMISSIONS_ENABLED)) throw errors.featureDisabled("Sending orders to providers");
  const [pre] = await db
    .select({ a: fulfillmentAttempts, p: providers, link: orders.link, quantity: orders.quantity })
    .from(fulfillmentAttempts)
    .innerJoin(providers, eq(providers.id, fulfillmentAttempts.providerId))
    .innerJoin(orders, eq(orders.id, fulfillmentAttempts.orderId))
    .where(eq(fulfillmentAttempts.id, attemptId))
    .limit(1);
  if (!pre) throw errors.notFound("That attempt");
  const adapter = adapterOf(pre.p.adapter, deps);
  if (!adapter?.submit || !adapter.capabilities.submit) throw new AppError("FEATURE_DISABLED", "This provider has no integration that can accept orders.");
  const credential = await loadCredential(db, pre.p.id);
  if (adapter.needsCredential && !credential) throw new AppError("FEATURE_DISABLED", "This provider has no credential configured.");
  const request = submitRequestSchema.parse({ idempotencyKey: pre.a.idempotencyKey, providerServiceRef: pre.a.providerServiceRef, link: pre.link ?? "", quantity: pre.quantity });

  // Claim: exactly one caller moves it from prepared to sent.
  const claimed = await db
    .update(fulfillmentAttempts)
    .set({ status: "submitted", submitCount: 1, submittedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(fulfillmentAttempts.id, attemptId), eq(fulfillmentAttempts.status, "queued"), eq(fulfillmentAttempts.submitCount, 0)))
    .returning({ id: fulfillmentAttempts.id });
  if (!claimed.length) return { status: "already_claimed" as const };

  try {
    const r = await callProvider({ db, providerId: pre.p.id, adapter, credential, endpoint: pre.p.endpoint, readOnly: false, timeoutMs: deps.timeoutMs }, (ctx) => adapter.submit!(request, ctx), providerOrderSchema);
    const status = normalizeStatus(r.status) ?? "submitted";
    await db.transaction(async (tx) => {
      await tx.update(fulfillmentAttempts).set({ providerOrderId: r.providerOrderId, providerStatus: r.status, status: status === "cancelled" ? "failed" : status, updatedAt: new Date() }).where(eq(fulfillmentAttempts.id, attemptId));
      await orderEvent(tx, pre.a.orderId, "provider_submitted", { type: "system" }, { attemptId, providerOrderId: r.providerOrderId });
      await recordEvent(tx, pre.p.id, "attempt_submitted", `Sent; the provider's order id is ${r.providerOrderId}.`, { data: { attemptId } });
    });
    return { status: "submitted" as const, providerOrderId: r.providerOrderId };
  } catch (e) {
    const err = e instanceof ProviderCallError ? e : new ProviderCallError("unknown", "Unexpected error.", "internal");
    // Rejected, unavailable and rate-limited calls definitely created nothing; everything else is uncertain.
    const definite = err.kind === "rejected" || err.kind === "unavailable" || err.kind === "rate_limited" || err.kind === "not_configured";
    await db.transaction(async (tx) => {
      await tx.update(fulfillmentAttempts).set({ status: definite ? "failed" : "unknown", error: ERROR_MESSAGE[err.kind], errorCode: err.code, updatedAt: new Date() }).where(eq(fulfillmentAttempts.id, attemptId));
      await orderEvent(tx, pre.a.orderId, definite ? "provider_submission_failed" : "provider_outcome_unknown", { type: "system" }, { attemptId, code: err.code });
      await recordEvent(tx, pre.p.id, definite ? "attempt_failed" : "attempt_unknown", definite ? `Not accepted: ${ERROR_MESSAGE[err.kind]}` : `Outcome unknown: ${ERROR_MESSAGE.unknown}`, { ok: false, data: { attemptId, code: err.code } });
    });
    logger().warn({ attemptId, provider: pre.p.id, kind: err.kind, code: err.code }, "provider submission did not complete");
    return { status: definite ? ("failed" as const) : ("unknown" as const), code: err.code };
  }
}

/* -------------------------------------------------------------------------- */
/*  Reconcile                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Reads the provider's view of a sent attempt and records it. An `unknown`
 * attempt is settled only by looking the order up by our idempotency key; a
 * provider-reported completion never completes the order.
 */
export async function reconcileAttempt(db: Db, attemptId: string, deps: Deps = {}) {
  const [row] = await db.select({ a: fulfillmentAttempts, p: providers }).from(fulfillmentAttempts).innerJoin(providers, eq(providers.id, fulfillmentAttempts.providerId)).where(eq(fulfillmentAttempts.id, attemptId)).limit(1);
  if (!row) throw errors.notFound("That attempt");
  const { a, p } = row;
  if (!["submitted", "in_progress", "unknown"].includes(a.status)) return { status: a.status, changed: false };
  const adapter = adapterOf(p.adapter, deps);
  if (!adapter) throw new AppError("FEATURE_DISABLED", "This provider has no installed integration to check with.");
  const credential = await loadCredential(db, p.id);
  const opts = { db, providerId: p.id, adapter, credential, endpoint: p.endpoint, readOnly: true, timeoutMs: deps.timeoutMs, backoffMs: deps.backoffMs };

  let found: z.infer<typeof providerOrderSchema> | null;
  try {
    if (a.providerOrderId) {
      if (!adapter.status || !adapter.capabilities.status) throw new AppError("FEATURE_DISABLED", "This integration can't report order progress.");
      found = await callProvider(opts, (ctx) => adapter.status!(a.providerOrderId!, ctx), providerOrderSchema);
    } else {
      if (!adapter.lookup || !adapter.capabilities.lookupByKey) throw new AppError("FEATURE_DISABLED", "This integration can't look orders up, so a person must resolve this attempt.");
      found = await callProvider(opts, (ctx) => adapter.lookup!(a.idempotencyKey!, ctx), providerOrderSchema.nullable());
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    const kind = e instanceof ProviderCallError ? e.kind : "unknown";
    await db.update(fulfillmentAttempts).set({ lastPolledAt: new Date(), error: ERROR_MESSAGE[kind], updatedAt: new Date() }).where(eq(fulfillmentAttempts.id, a.id));
    return { status: a.status, changed: false, error: ERROR_MESSAGE[kind] };
  }

  if (!found) {
    // The provider has no order for our key. It may still be catching up, so a person decides.
    await db.update(fulfillmentAttempts).set({ lastPolledAt: new Date(), error: "The provider has no order for this attempt's key. A person should confirm before marking it as not sent.", updatedAt: new Date() }).where(eq(fulfillmentAttempts.id, a.id));
    return { status: a.status, changed: false };
  }
  const normalised = normalizeStatus(found.status);
  const next = normalised === null ? a.status === "unknown" ? "submitted" : a.status : normalised === "cancelled" ? "failed" : normalised;
  const delivered = found.delivered ?? a.deliveredQty;
  await db.transaction(async (tx) => {
    await tx
      .update(fulfillmentAttempts)
      .set({ providerOrderId: found.providerOrderId, providerStatus: found.status, status: next, deliveredQty: delivered, lastPolledAt: new Date(), error: normalised === null ? `Unrecognised provider status "${found.status.slice(0, 40)}"; review it.` : null, updatedAt: new Date() })
      .where(eq(fulfillmentAttempts.id, a.id));
    if (next !== a.status) {
      const type = next === "completed" ? "provider_reported_complete" : "provider_progress";
      await orderEvent(tx, a.orderId, type, { type: "provider" }, { attemptId: a.id, providerStatus: found.status, delivered });
      await recordEvent(tx, p.id, "attempt_reconciled", `Provider status: ${found.status}.`, { data: { attemptId: a.id } });
    }
  });
  return { status: next, changed: next !== a.status };
}

/** Background reconciliation (job `providers.poll-fulfillment`, disabled in this phase). Claims attempts so workers never overlap. */
export async function reconcileDue(db: Db, deps: Deps = {}, now = new Date()) {
  const stale = new Date(now.getTime() - 5 * 60_000);
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: fulfillmentAttempts.id })
      .from(fulfillmentAttempts)
      .where(and(inArray(fulfillmentAttempts.status, ["submitted", "in_progress", "unknown"]), or(isNull(fulfillmentAttempts.lastPolledAt), lt(fulfillmentAttempts.lastPolledAt, stale))))
      .orderBy(fulfillmentAttempts.lastPolledAt)
      .limit(20)
      .for("update", { skipLocked: true });
    if (rows.length) await tx.update(fulfillmentAttempts).set({ lastPolledAt: now }).where(inArray(fulfillmentAttempts.id, rows.map((r) => r.id)));
    return rows.map((r) => r.id);
  });
  let changed = 0;
  for (const id of claimed) {
    try {
      if ((await reconcileAttempt(db, id, deps)).changed) changed++;
    } catch (e) {
      logger().warn({ attemptId: id, err: e instanceof Error ? e.message : String(e) }, "fulfilment reconciliation skipped");
    }
  }
  return { claimed: claimed.length, changed };
}

/* -------------------------------------------------------------------------- */
/*  Manual resolution of uncertain outcomes                                   */
/* -------------------------------------------------------------------------- */

export const resolveSchema = z.discriminatedUnion("resolution", [
  z.strictObject({ resolution: z.literal("not_submitted"), attemptId: z.string().regex(UUID), note: z.string().trim().min(10, "Explain how you confirmed it wasn't received.").max(300) }),
  z.strictObject({
    resolution: z.literal("found"),
    attemptId: z.string().regex(UUID),
    providerOrderId: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:\/#-]+$/, "Use the provider's order id as shown in their dashboard."),
    note: z.string().trim().min(10, "Explain where you found it.").max(300),
  }),
]);

/** A person settles an `unknown` attempt after checking the provider: it was never received, or here is its order id. */
export async function resolveUnknown(db: Db, staff: Staff, reference: string, raw: unknown, client: Client = {}) {
  const input = resolveSchema.parse(raw);
  await db.transaction(async (tx) => {
    const a = await lockAttempt(tx, reference, input.attemptId);
    if (a.status !== "unknown") throw errors.conflict("Only attempts with an unknown outcome need resolving.");
    const set =
      input.resolution === "not_submitted"
        ? { status: "failed", resolution: `Confirmed not received: ${input.note}` }
        : { status: "submitted", providerOrderId: input.providerOrderId, resolution: `Found at provider: ${input.note}` };
    await tx.update(fulfillmentAttempts).set({ ...set, resolvedBy: staff.userId, error: null, updatedAt: new Date() }).where(eq(fulfillmentAttempts.id, a.id));
    await orderEvent(tx, a.orderId, "provider_resolved", { type: "staff", id: staff.userId }, { attemptId: a.id, resolution: input.resolution });
    await recordEvent(tx, a.providerId, "attempt_resolved", input.resolution === "not_submitted" ? "Unknown attempt resolved: not received by the provider." : `Unknown attempt resolved: found as ${input.providerOrderId}.`, { actorUserId: staff.userId, data: { attemptId: a.id } });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "fulfillment.resolved", targetType: "fulfillment_attempt", targetId: a.id, after: { resolution: input.resolution }, ip: client.ip, userAgent: client.userAgent });
  });
}
