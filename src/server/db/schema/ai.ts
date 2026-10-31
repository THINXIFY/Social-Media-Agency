import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, numeric, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, oneOf, ts, updatedAt } from "./helpers";
import { customers, users } from "./identity";

export const AI_USAGE_STATUS = ["pending", "ok", "rejected_quota", "rejected_budget", "provider_error", "timeout", "invalid_output"] as const;

/**
 * Sociotix AI usage accounting (AI-01). Metadata only: no prompt or generated
 * text is ever stored. The subject is an HMAC of the account id (or the
 * visitor's IP for anonymous use), so usage can be counted without linking
 * it to account records. A pending row reserves the tool's cost ceiling
 * while a request is in flight, so concurrent requests can't overspend.
 */
export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toolId: text("tool_id").notNull(),
    subjectHash: text("subject_hash").notNull(),
    subjectKind: text("subject_kind").notNull(),
    status: text("status").notNull().default("pending"),
    provider: text("provider"),
    model: text("model"),
    inputChars: integer("input_chars").notNull().default(0),
    outputChars: integer("output_chars").notNull().default(0),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    /** Actual cost when reported, otherwise the reservation (micro-dollars). */
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    latencyMs: integer("latency_ms"),
    errorCode: text("error_code"),
    createdAt: createdAt(),
    completedAt: ts("completed_at"),
  },
  (t) => [
    index("ai_usage_subject_idx").on(t.subjectHash, t.toolId, t.createdAt),
    index("ai_usage_created_idx").on(t.createdAt),
    check("ai_usage_status_check", oneOf(t.status, AI_USAGE_STATUS)),
    check("ai_usage_subject_kind_check", sql`${t.subjectKind} in ('account', 'anonymous')`),
    check("ai_usage_tool_check", sql`${t.toolId} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("ai_usage_amounts_check", sql`${t.inputChars} >= 0 and ${t.outputChars} >= 0 and ${t.costMicros} >= 0`),
  ],
);

export const AI_PERSONAS = ["creator", "small_business", "agency", "ecommerce", "freelancer", "exploring"] as const;
export const AI_ONBOARDING = ["completed", "skipped"] as const;

/**
 * A customer's Sociotix AI workspace preferences (AI-09): who they are and
 * what they want to achieve, chosen in the optional onboarding. Only these
 * choices are stored; they personalise navigation and never grant access.
 */
export const aiProfiles = pgTable(
  "ai_profiles",
  {
    customerId: uuid("customer_id")
      .primaryKey()
      .references(() => customers.id, { onDelete: "cascade" }),
    persona: text("persona"),
    goals: jsonb("goals").$type<string[]>().notNull().default([]),
    onboarding: text("onboarding").notNull(),
    completedAt: ts("completed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("ai_profiles_persona_check", sql`${t.persona} is null or ${oneOf(t.persona, AI_PERSONAS)}`),
    check("ai_profiles_onboarding_check", oneOf(t.onboarding, AI_ONBOARDING)),
    check("ai_profiles_goals_check", sql`jsonb_typeof(${t.goals}) = 'array' and jsonb_array_length(${t.goals}) <= 6`),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Admin AI Control Center                                                   */
/* -------------------------------------------------------------------------- */

export const AI_CREDENTIAL_STATUS = ["saved", "verified", "failed", "active", "retired", "disabled"] as const;

/**
 * Encrypted provider API keys (AES-256-GCM, DATA_ENCRYPTION_KEY). Write-only:
 * read models never select the ciphertext. One active credential per provider;
 * a new one becomes active only after a passing test and an explicit switch.
 */
export const aiCredentials = pgTable(
  "ai_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: text("provider_id").notNull(),
    version: integer("version").notNull(),
    label: text("label").notNull().default(""),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull(),
    /** Masked identifier, e.g. "sk-…a1b2". Never more than 4 trailing characters. */
    hint: text("hint").notNull(),
    status: text("status").notNull().default("saved"),
    verifiedAt: ts("verified_at"),
    lastTestAt: ts("last_test_at"),
    /** Outcome code of the last test (ok, invalid_key, permission, rate_limited, network, ...). Never a response body. */
    lastTestCode: text("last_test_code"),
    lastTestBillable: boolean("last_test_billable"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    activatedAt: ts("activated_at"),
    retiredAt: ts("retired_at"),
  },
  (t) => [
    uniqueIndex("ai_credentials_version_key").on(t.providerId, t.version),
    uniqueIndex("ai_credentials_one_active_key").on(t.providerId).where(sql`${t.status} = 'active'`),
    check("ai_credentials_status_check", oneOf(t.status, AI_CREDENTIAL_STATUS)),
    check("ai_credentials_provider_check", sql`${t.providerId} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("ai_credentials_hint_check", sql`char_length(${t.hint}) <= 16`),
    check("ai_credentials_active_check", sql`${t.status} <> 'active' or ${t.verifiedAt} is not null`),
  ],
);

export const AI_MODEL_STATUS = ["available", "unverified", "deprecated", "unavailable"] as const;
export const AI_MODEL_SOURCE = ["catalog", "discovered", "manual"] as const;

/** The model library: official model ids per provider, with only verified capabilities and sourced prices. */
export const aiModels = pgTable(
  "ai_models",
  {
    providerId: text("provider_id").notNull(),
    modelId: text("model_id").notNull(),
    displayName: text("display_name").notNull().default(""),
    source: text("source").notNull(),
    status: text("status").notNull().default("unverified"),
    capabilities: jsonb("capabilities").$type<Record<string, boolean | null>>().notNull().default({}),
    contextTokens: integer("context_tokens"),
    maxOutputTokens: integer("max_output_tokens"),
    /** USD per million tokens; null until sourced. */
    priceInputPerMtok: numeric("price_input_per_mtok", { precision: 12, scale: 6 }),
    priceOutputPerMtok: numeric("price_output_per_mtok", { precision: 12, scale: 6 }),
    priceSource: text("price_source"),
    priceCheckedAt: ts("price_checked_at"),
    verifiedAt: ts("verified_at"),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.providerId, t.modelId] }),
    check("ai_models_status_check", oneOf(t.status, AI_MODEL_STATUS)),
    check("ai_models_source_check", oneOf(t.source, AI_MODEL_SOURCE)),
    check("ai_models_id_check", sql`char_length(${t.modelId}) between 1 and 120 and ${t.modelId} ~ '^[A-Za-z0-9._:/@-]+$'`),
    check("ai_models_price_check", sql`(${t.priceInputPerMtok} is null) = (${t.priceOutputPerMtok} is null) and (${t.priceInputPerMtok} is null or (${t.priceInputPerMtok} >= 0 and ${t.priceOutputPerMtok} >= 0 and ${t.priceSource} is not null))`),
  ],
);

export const AI_ASSIGNMENT_STATUS = ["draft", "active", "disabled"] as const;

/** Which model each Sociotix tool uses when generation runs through the Control Center. Server-authoritative. */
export const aiToolAssignments = pgTable(
  "ai_tool_assignments",
  {
    toolId: text("tool_id").primaryKey(),
    providerId: text("provider_id").notNull(),
    modelId: text("model_id").notNull(),
    status: text("status").notNull().default("draft"),
    /** Last compatibility/cost check (and optional confirmed fixture run). */
    testedAt: ts("tested_at"),
    testPassed: boolean("test_passed"),
    testNote: text("test_note"),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    activatedAt: ts("activated_at"),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("ai_tool_assignments_status_check", oneOf(t.status, AI_ASSIGNMENT_STATUS)),
    check("ai_tool_assignments_active_check", sql`${t.status} <> 'active' or ${t.testPassed} is true`),
    check("ai_tool_assignments_tool_check", sql`${t.toolId} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);
