import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { ORDER_FIELD_KIND, PRICING_MODEL, SERVICE_CATEGORY, SERVICE_ORIGIN } from "./enums";
import { createdAt, oneOf, ts, updatedAt } from "./helpers";
import { users } from "./identity";

const SLUG = "'^[a-z0-9]+(-[a-z0-9]+)*$'";

export const platforms = pgTable(
  "platforms",
  {
    /** Catalog slug kept from `src/lib/catalog.ts`, e.g. "instagram". */
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    iconKey: text("icon_key").notNull(),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [check("platforms_id_check", sql`${t.id} ~ ${sql.raw(SLUG)}`)],
);

export const services = pgTable(
  "services",
  {
    /** Catalog slug kept from `src/lib/catalog.ts`, e.g. "instagram-followers". */
    id: text("id").primaryKey(),
    platformId: text("platform_id")
      .notNull()
      .references(() => platforms.id, { onDelete: "restrict" }),
    category: text("category").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    visible: boolean("visible").notNull().default(true),
    origin: text("origin").notNull().default("catalog"),
    /** Shown to customers when ordering. */
    instructions: text("instructions").notNull().default(""),
    /** Staff-only; never exposed by public catalog queries. */
    internalNotes: text("internal_notes").notNull().default(""),
    fulfillmentType: text("fulfillment_type").notNull().default("manual"),
    /** A provider's reference name for this service — never a credential. */
    fulfillmentProviderRef: text("fulfillment_provider_ref").notNull().default(""),
    fulfillmentNotes: text("fulfillment_notes").notNull().default(""),
    /** Current quantity rules (copied into each price version, so orders snapshot them). */
    minQty: integer("min_qty"),
    maxQty: integer("max_qty"),
    /** Incomplete custom service saved by staff; never shown to customers. */
    draft: boolean("draft").notNull().default(false),
    /** Optimistic concurrency: every update must name the version it read. */
    version: integer("version").notNull().default(1),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    archivedAt: ts("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("services_platform_idx").on(t.platformId),
    check("services_id_check", sql`${t.id} ~ ${sql.raw(SLUG)}`),
    check("services_category_check", oneOf(t.category, SERVICE_CATEGORY)),
    check("services_origin_check", oneOf(t.origin, SERVICE_ORIGIN)),
    check("services_qty_check", sql`(${t.minQty} is null or ${t.minQty} >= 1) and (${t.maxQty} is null or ${t.maxQty} >= 1) and (${t.minQty} is null or ${t.maxQty} is null or ${t.maxQty} >= ${t.minQty})`),
    check("services_fulfillment_type_check", sql`${t.fulfillmentType} in ('manual', 'provider')`),
    check("services_text_lengths_check", sql`length(${t.name}) between 3 and 120 and length(${t.description}) <= 1000 and length(${t.instructions}) <= 1000 and length(${t.internalNotes}) <= 1000 and length(${t.fulfillmentNotes}) <= 1000 and length(${t.fulfillmentProviderRef}) <= 40`),
  ],
);

export const serviceOrderFields = pgTable(
  "service_order_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Either a service override or a category default — exactly one. */
    serviceId: text("service_id").references(() => services.id, { onDelete: "cascade" }),
    category: text("category"),
    fieldKey: text("field_key").notNull(),
    kind: text("kind").notNull(),
    required: boolean("required").notNull().default(false),
    rules: jsonb("rules").notNull().default({}),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [
    check("service_order_fields_scope_check", sql`(${t.serviceId} is null) <> (${t.category} is null)`),
    check("service_order_fields_kind_check", oneOf(t.kind, ORDER_FIELD_KIND)),
    check("service_order_fields_category_check", sql`${t.category} is null or ${oneOf(t.category, SERVICE_CATEGORY)}`),
    index("service_order_fields_service_idx").on(t.serviceId),
  ],
);

/**
 * Append-only price history (immutability enforced by trigger). Rates are in
 * micro-dollars (1e-6 USD) because per-1,000 prices can be fractions of a cent.
 */
export const servicePriceVersions = pgTable(
  "service_price_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    pricingModel: text("pricing_model").notNull(),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull(),
    priceMicros: bigint("price_micros", { mode: "number" }).notNull(),
    minQty: integer("min_qty"),
    maxQty: integer("max_qty"),
    effectiveFrom: ts("effective_from").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("service_price_versions_current_idx").on(t.serviceId, t.effectiveFrom.desc()),
    check("service_price_versions_model_check", oneOf(t.pricingModel, PRICING_MODEL)),
    check("service_price_versions_amounts_check", sql`${t.costMicros} >= 0 and ${t.priceMicros} > 0`),
    check("service_price_versions_qty_check", sql`(${t.minQty} is null or ${t.minQty} >= 1) and (${t.maxQty} is null or ${t.minQty} is null or ${t.maxQty} > ${t.minQty})`),
  ],
);

/**
 * Purchasability gates. A service is purchasable only when every gate is
 * recorded (see the `purchasable_services` view); pricing or mapping alone
 * never makes it sellable.
 */
export const serviceEligibility = pgTable("service_eligibility", {
  serviceId: text("service_id")
    .primaryKey()
    .references(() => services.id, { onDelete: "cascade" }),
  policyReviewedAt: ts("policy_reviewed_at"),
  policyReviewedBy: uuid("policy_reviewed_by").references(() => users.id, { onDelete: "set null" }),
  supplierVerifiedAt: ts("supplier_verified_at"),
  supplierVerifiedBy: uuid("supplier_verified_by").references(() => users.id, { onDelete: "set null" }),
  fulfillmentVerifiedAt: ts("fulfillment_verified_at"),
  fulfillmentVerifiedBy: uuid("fulfillment_verified_by").references(() => users.id, { onDelete: "set null" }),
  paymentAcceptedAt: ts("payment_accepted_at"),
  paymentAcceptedBy: uuid("payment_accepted_by").references(() => users.id, { onDelete: "set null" }),
  legalReviewedAt: ts("legal_reviewed_at"),
  legalReviewedBy: uuid("legal_reviewed_by").references(() => users.id, { onDelete: "set null" }),
  technicalReadyAt: ts("technical_ready_at"),
  technicalReadyBy: uuid("technical_ready_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});
