import { sql } from "drizzle-orm";
import { bigint, boolean, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { servicePriceVersions, services } from "./catalog";
import {
  ACTIVE_FULFILLMENT_STATUS,
  ACTOR_TYPE,
  DEPOSIT_DECISION,
  DEPOSIT_METHOD,
  DEPOSIT_STATUS,
  ORDER_PAYMENT_STATUS,
  ORDER_REVENUE_STATUS,
  FULFILLMENT_STATUS,
  ORDER_STATUS,
  PROVIDER_AUTH,
  PROVIDER_TYPE,
  REVIEW_DECISION,
  REVIEW_STEP,
  PROVIDER_EVENT_TYPE,
} from "./enums";
import { createdAt, oneOf, ts, updatedAt } from "./helpers";
import { customers, users } from "./identity";
import { journalEntries } from "./ledger";

/* -------------------------------------------------------------------------- */
/*  Orders                                                                    */
/* -------------------------------------------------------------------------- */

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicRef: text("public_ref").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    /** Price snapshot: the version used at checkout, plus the computed amounts. */
    priceVersionId: uuid("price_version_id")
      .notNull()
      .references(() => servicePriceVersions.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    link: text("link"),
    fieldValues: jsonb("field_values").notNull().default({}),
    unitPriceMicros: bigint("unit_price_micros", { mode: "number" }).notNull(),
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
    status: text("status").notNull().default("pending_review"),
    /** The dashboard's vocabulary, derived — never written directly. */
    customerStatus: text("customer_status")
      .notNull()
      .generatedAlwaysAs(
        sql`case
          when status in ('pending_review', 'queued') then 'pending'
          when status in ('in_progress', 'partial') then 'processing'
          when status = 'needs_customer_action' then 'attention'
          when status = 'completed' then 'completed'
          else 'cancelled' end`,
      ),
    reviewRequired: boolean("review_required").notNull().default(true),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash"),
    debitEntryId: uuid("debit_entry_id").references(() => journalEntries.id, { onDelete: "restrict" }),
    /** Money and revenue states, separate from the operational status. */
    paymentStatus: text("payment_status").notNull().default("charged"),
    revenueStatus: text("revenue_status").notNull().default("deferred"),
    /** Funds returned to the wallet on cancellation/rejection before work started. */
    releaseEntryId: uuid("release_entry_id").references(() => journalEntries.id, { onDelete: "restrict" }),
    recognitionEntryId: uuid("recognition_entry_id").references(() => journalEntries.id, { onDelete: "restrict" }),
    /** Everything the customer agreed to, frozen at checkout (name, platform, pricing model, unit price, limits). */
    priceSnapshot: jsonb("price_snapshot").notNull().default({}),
    /** Customer-safe explanation for rejection, cancellation, failure or a request for information. */
    statusReason: text("status_reason"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "restrict" }),
    fulfillmentMethod: text("fulfillment_method"),
    /** Internal reference for manual fulfillment (never a provider credential). */
    fulfillmentRef: text("fulfillment_ref"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    closedAt: ts("closed_at"),
    placedAt: ts("placed_at").notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_public_ref_key").on(t.publicRef),
    uniqueIndex("orders_customer_idempotency_key").on(t.customerId, t.idempotencyKey),
    uniqueIndex("orders_debit_entry_key").on(t.debitEntryId),
    uniqueIndex("orders_release_entry_key").on(t.releaseEntryId),
    uniqueIndex("orders_recognition_entry_key").on(t.recognitionEntryId),
    index("orders_assigned_idx").on(t.assignedTo),
    check("orders_payment_status_check", oneOf(t.paymentStatus, ORDER_PAYMENT_STATUS)),
    check("orders_revenue_status_check", oneOf(t.revenueStatus, ORDER_REVENUE_STATUS)),
    check("orders_fulfillment_method_check", sql`${t.fulfillmentMethod} is null or ${t.fulfillmentMethod} = 'manual'`),
    check("orders_text_lengths_check", sql`(${t.statusReason} is null or length(${t.statusReason}) between 3 and 500) and (${t.fulfillmentRef} is null or length(${t.fulfillmentRef}) between 2 and 80) and (${t.link} is null or length(${t.link}) <= 500)`),
    check("orders_released_check", sql`(${t.paymentStatus} = 'released') = (${t.releaseEntryId} is not null)`),
    check("orders_recognized_check", sql`(${t.revenueStatus} = 'recognized') = (${t.recognitionEntryId} is not null)`),
    index("orders_customer_placed_idx").on(t.customerId, t.placedAt.desc()),
    index("orders_status_idx").on(t.status),
    index("orders_placed_idx").on(t.placedAt),
    check("orders_status_check", oneOf(t.status, ORDER_STATUS)),
    check("orders_quantity_check", sql`${t.quantity} > 0`),
    check("orders_total_check", sql`${t.totalCents} > 0 and ${t.unitPriceMicros} > 0`),
    check("orders_link_check", sql`${t.link} is null or ${t.link} ~ '^https://'`),
  ],
);

/** Append-only order timeline (trigger-enforced). */
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    type: text("type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    actorType: text("actor_type").notNull(),
    actorId: uuid("actor_id"),
    data: jsonb("data").notNull().default({}),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [
    index("order_events_order_idx").on(t.orderId, t.at),
    check("order_events_actor_check", oneOf(t.actorType, ACTOR_TYPE)),
    check("order_events_status_check", sql`(${t.fromStatus} is null or ${oneOf(t.fromStatus, ORDER_STATUS)}) and (${t.toStatus} is null or ${oneOf(t.toStatus, ORDER_STATUS)})`),
  ],
);

export const orderReviews = pgTable(
  "order_reviews",
  {
    orderId: uuid("order_id")
      .primaryKey()
      .references(() => orders.id, { onDelete: "restrict" }),
    decision: text("decision").notNull(),
    reason: text("reason"),
    decidedBy: uuid("decided_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decidedAt: ts("decided_at").notNull().defaultNow(),
  },
  (t) => [check("order_reviews_decision_check", oneOf(t.decision, REVIEW_DECISION)), check("order_reviews_reason_check", sql`${t.decision} <> 'rejected' or ${t.reason} is not null`)],
);

/** Append-only; the trigger also caps the total refunded at the order total. */
export const orderRefunds = pgTable(
  "order_refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    reason: text("reason").notNull(),
    journalEntryId: uuid("journal_entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("order_refunds_entry_key").on(t.journalEntryId), index("order_refunds_order_idx").on(t.orderId), check("order_refunds_amount_check", sql`${t.amountCents} > 0`)],
);

/* -------------------------------------------------------------------------- */
/*  Providers & fulfilment                                                    */
/* -------------------------------------------------------------------------- */

export const providers = pgTable(
  "providers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    description: text("description").notNull().default(""),
    endpoint: text("endpoint"),
    authMethod: text("auth_method"),
    enabled: boolean("enabled").notNull().default(false),
    supplierReviewedAt: ts("supplier_reviewed_at"),
    supplierReviewedBy: uuid("supplier_reviewed_by").references(() => users.id, { onDelete: "set null" }),
    fallbackProviderId: text("fallback_provider_id"),
    limitations: text("limitations").notNull().default(""),
    /** The installed integration (5F adapter registry key). Null = no integration installed. */
    adapter: text("adapter"),
    archivedAt: ts("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("providers_id_check", sql`${t.id} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("providers_type_check", oneOf(t.type, PROVIDER_TYPE)),
    check("providers_auth_check", sql`${t.authMethod} is null or ${oneOf(t.authMethod, PROVIDER_AUTH)}`),
    check("providers_endpoint_check", sql`${t.endpoint} is null or ${t.endpoint} ~ '^https://'`),
    check("providers_fallback_check", sql`${t.fallbackProviderId} is null or ${t.fallbackProviderId} <> ${t.id}`),
    check("providers_adapter_check", sql`${t.adapter} is null or ${t.adapter} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    // A provider can only be switched on after a supplier review and with an installed integration (5F).
    check("providers_enable_check", sql`not ${t.enabled} or (${t.supplierReviewedAt} is not null and ${t.adapter} is not null and ${t.archivedAt} is null)`),
    check("providers_text_check", sql`char_length(${t.name}) between 2 and 80 and char_length(${t.description}) <= 500 and char_length(${t.limitations}) <= 500`),
    foreignKey({ name: "providers_fallback_fk", columns: [t.fallbackProviderId], foreignColumns: [t.id] }).onDelete("set null"),
  ],
);

/** Write-only secrets: AES-256-GCM ciphertext. Read models must never select this table. */
export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull(),
    last4: text("last4"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    rotatedAt: ts("rotated_at"),
  },
  (t) => [
    uniqueIndex("provider_credentials_active_key")
      .on(t.providerId)
      .where(sql`${t.rotatedAt} is null`),
    check("provider_credentials_last4_check", sql`${t.last4} is null or length(${t.last4}) <= 4`),
  ],
);

export const providerServiceMappings = pgTable(
  "provider_service_mappings",
  {
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    providerRef: text("provider_ref").notNull(),
    priority: integer("priority").notNull().default(1),
    /** Mappings start inactive; trigger SV012 allows activation only for eligible services on enabled providers. */
    active: boolean("active").notNull().default(false),
    verifiedAt: ts("verified_at"),
    note: text("note").notNull().default(""),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.providerId, t.serviceId] }),
    uniqueIndex("provider_service_mappings_primary_key")
      .on(t.serviceId)
      .where(sql`${t.active} and ${t.priority} = 1`),
    check("provider_service_mappings_priority_check", sql`${t.priority} >= 1`),
    check("provider_service_mappings_ref_check", sql`length(${t.providerRef}) between 1 and 120`),
    check("provider_service_mappings_note_check", sql`char_length(${t.note}) <= 300`),
  ],
);

export const providerHealthChecks = pgTable(
  "provider_health_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    ok: boolean("ok").notNull(),
    latencyMs: integer("latency_ms"),
    balanceCents: bigint("balance_cents", { mode: "number" }),
    error: text("error"),
    checkedAt: ts("checked_at").notNull().defaultNow(),
  },
  (t) => [index("provider_health_checks_recent_idx").on(t.providerId, t.checkedAt.desc())],
);

export const fulfillmentAttempts = pgTable(
  "fulfillment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    providerServiceRef: text("provider_service_ref"),
    providerOrderId: text("provider_order_id"),
    status: text("status").notNull().default("queued"),
    deliveredQty: integer("delivered_qty").notNull().default(0),
    costMicros: bigint("cost_micros", { mode: "number" }),
    requestHash: text("request_hash"),
    /** Sent to the provider with the submission, so a retry can never create a second provider order (5F). */
    idempotencyKey: text("idempotency_key"),
    submitCount: integer("submit_count").notNull().default(0),
    submittedAt: ts("submitted_at"),
    lastPolledAt: ts("last_polled_at"),
    /** The provider's raw status label, kept for reconciliation (normalised status is `status`). */
    providerStatus: text("provider_status"),
    error: text("error"),
    errorCode: text("error_code"),
    preparedBy: uuid("prepared_by").references(() => users.id, { onDelete: "set null" }),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolution: text("resolution"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("fulfillment_attempts_provider_order_key").on(t.providerId, t.providerOrderId),
    uniqueIndex("fulfillment_attempts_idempotency_key").on(t.idempotencyKey),
    check("fulfillment_attempts_submit_count_check", sql`${t.submitCount} between 0 and 1`),
    uniqueIndex("fulfillment_attempts_one_active_key")
      .on(t.orderId)
      .where(oneOf(t.status, ACTIVE_FULFILLMENT_STATUS)),
    check("fulfillment_attempts_status_check", oneOf(t.status, FULFILLMENT_STATUS)),
    check("fulfillment_attempts_delivered_check", sql`${t.deliveredQty} >= 0`),
  ],
);

/** Provider integration history (5F): configuration, credentials (never the secret), checks, mappings and attempts. */
export const providerEvents = pgTable(
  "provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    message: text("message").notNull(),
    ok: boolean("ok").notNull().default(true),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    at: createdAt(),
  },
  (t) => [index("provider_events_recent_idx").on(t.providerId, t.at.desc()), check("provider_events_type_check", oneOf(t.type, PROVIDER_EVENT_TYPE))],
);

/* -------------------------------------------------------------------------- */
/*  Deposits & payment events                                                 */
/* -------------------------------------------------------------------------- */

export const deposits = pgTable(
  "deposits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicRef: text("public_ref").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    /** Accounting currency; deposits are requested and credited in USD only. */
    currency: text("currency").notNull().default("USD"),
    method: text("method").notNull(),
    processor: text("processor").notNull(),
    /** Crypto only (future): the asset and network the customer must use. */
    asset: text("asset"),
    network: text("network"),
    /** Client-supplied key: a retried request returns the original deposit instead of creating another. */
    idempotencyKey: text("idempotency_key"),
    requestHash: text("request_hash"),
    /** Customer-safe explanation for rejected, failed, expired or cancelled requests. */
    statusReason: text("status_reason"),
    /** The processor's own payment id; unique per processor so one payment can't be recorded twice. */
    processorRef: text("processor_ref"),
    status: text("status").notNull().default("created"),
    requestedAt: ts("requested_at").notNull().defaultNow(),
    settledAt: ts("settled_at"),
    expiresAt: ts("expires_at"),
    creditedEntryId: uuid("credited_entry_id").references(() => journalEntries.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("deposits_public_ref_key").on(t.publicRef),
    uniqueIndex("deposits_processor_ref_key").on(t.processor, t.processorRef),
    uniqueIndex("deposits_credited_entry_key").on(t.creditedEntryId),
    uniqueIndex("deposits_idempotency_key").on(t.customerId, t.idempotencyKey),
    index("deposits_customer_idx").on(t.customerId, t.requestedAt.desc()),
    index("deposits_status_idx").on(t.status),
    index("deposits_requested_idx").on(t.requestedAt),
    check("deposits_public_ref_check", sql`${t.publicRef} ~ '^DEP-[A-Z0-9]+$'`),
    check("deposits_amount_check", sql`${t.amountCents} > 0`),
    check("deposits_currency_check", sql`${t.currency} = 'USD'`),
    check("deposits_status_reason_check", sql`${t.statusReason} is null or length(${t.statusReason}) between 3 and 300`),
    check("deposits_method_check", oneOf(t.method, DEPOSIT_METHOD)),
    check("deposits_status_check", oneOf(t.status, DEPOSIT_STATUS)),
    /** Credited ⇔ a ledger entry exists. Pending money is never in a wallet. */
    check("deposits_credited_check", sql`(${t.status} = 'credited') = (${t.creditedEntryId} is not null)`),
    check("deposits_settled_check", sql`${t.status} not in ('settled', 'credited') or ${t.settledAt} is not null`),
  ],
);

export const depositReviews = pgTable(
  "deposit_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    depositId: uuid("deposit_id")
      .notNull()
      .references(() => deposits.id, { onDelete: "restrict" }),
    step: text("step").notNull(),
    decision: text("decision").notNull(),
    checklist: jsonb("checklist").notNull().default({}),
    decidedBy: uuid("decided_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decidedAt: ts("decided_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("deposit_reviews_step_key").on(t.depositId, t.step), check("deposit_reviews_step_check", oneOf(t.step, REVIEW_STEP)), check("deposit_reviews_decision_check", oneOf(t.decision, DEPOSIT_DECISION))],
);

export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    processor: text("processor").notNull(),
    eventId: text("event_id").notNull(),
    signatureValid: boolean("signature_valid").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
    processedAt: ts("processed_at"),
    error: text("error"),
  },
  (t) => [uniqueIndex("payment_webhook_events_event_key").on(t.processor, t.eventId)],
);
