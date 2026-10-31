import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { deposits, orders } from "./commerce";
import {
  ATTACHMENT_MIME,
  ATTACHMENT_OWNER,
  AUDIT_ACTOR,
  MESSAGE_AUTHOR,
  NOTE_TARGET,
  NOTIFICATION_CHANNEL,
  OUTBOX_STATUS,
  POLICY_STATUS,
  REFERRAL_STATUS,
  REFERRAL_VIA,
  REWARD_DESTINATION,
  REWARD_DISTRIBUTION,
  REWARD_STATUS,
  REWARD_TYPE,
  SCAN_STATUS,
  TICKET_CATEGORY,
  TICKET_EVENT,
  TICKET_PRIORITY,
  TICKET_STATUS,
} from "./enums";
import { createdAt, oneOf, ts, updatedAt } from "./helpers";
import { customers, staffMembers, users } from "./identity";
import { journalEntries } from "./ledger";

/* -------------------------------------------------------------------------- */
/*  Support                                                                   */
/* -------------------------------------------------------------------------- */

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicRef: text("public_ref").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    subject: text("subject").notNull(),
    category: text("category").notNull(),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("awaiting"),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    depositId: uuid("deposit_id").references(() => deposits.id, { onDelete: "set null" }),
    assignedTo: uuid("assigned_to").references(() => staffMembers.id, { onDelete: "set null" }),
    lastCustomerMessageAt: ts("last_customer_message_at"),
    lastStaffMessageAt: ts("last_staff_message_at"),
    /** Client-supplied key: a retried submission returns the original ticket (5G-A). */
    idempotencyKey: text("idempotency_key"),
    resolvedAt: ts("resolved_at"),
    closedAt: ts("closed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("tickets_public_ref_key").on(t.publicRef),
    uniqueIndex("tickets_idempotency_key").on(t.customerId, t.idempotencyKey),
    index("tickets_customer_idx").on(t.customerId, t.updatedAt.desc()),
    index("tickets_queue_idx").on(t.status, t.lastCustomerMessageAt),
    index("tickets_created_idx").on(t.createdAt),
    check("tickets_public_ref_check", sql`${t.publicRef} ~ '^TCK-[A-Z0-9]+$'`),
    check("tickets_subject_check", sql`length(${t.subject}) between 1 and 150`),
    check("tickets_category_check", oneOf(t.category, TICKET_CATEGORY)),
    check("tickets_priority_check", oneOf(t.priority, TICKET_PRIORITY)),
    check("tickets_status_check", oneOf(t.status, TICKET_STATUS)),
  ],
);

export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    authorType: text("author_type").notNull(),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Plain text; always rendered escaped. */
    body: text("body").notNull(),
    /** Client-supplied key so a double-submitted reply is stored once (5G-A). */
    clientKey: text("client_key"),
    createdAt: createdAt(),
  },
  (t) => [index("ticket_messages_ticket_idx").on(t.ticketId, t.createdAt), uniqueIndex("ticket_messages_client_key").on(t.ticketId, t.clientKey), check("ticket_messages_author_check", oneOf(t.authorType, MESSAGE_AUTHOR)), check("ticket_messages_body_check", sql`length(${t.body}) between 1 and 5000`)],
);

/** Ticket activity (5G-A): append-only. Customers see only rows marked customerVisible. */
export const ticketEvents = pgTable(
  "ticket_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    actorType: text("actor_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    customerVisible: boolean("customer_visible").notNull().default(true),
    at: createdAt(),
  },
  (t) => [index("ticket_events_ticket_idx").on(t.ticketId, t.at), check("ticket_events_type_check", oneOf(t.type, TICKET_EVENT)), check("ticket_events_actor_check", oneOf(t.actorType, MESSAGE_AUTHOR))],
);

/** Staff-only. Customer queries must never join this table. */
export const ticketInternalNotes = pgTable(
  "ticket_internal_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ticket_internal_notes_ticket_idx").on(t.ticketId), check("ticket_internal_notes_body_check", sql`length(${t.body}) between 1 and 1000`)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerType: text("owner_type").notNull(),
    ownerId: uuid("owner_id").notNull(),
    storageKey: text("storage_key").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    scanStatus: text("scan_status").notNull().default("pending"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("attachments_storage_key").on(t.storageKey),
    index("attachments_owner_idx").on(t.ownerType, t.ownerId),
    check("attachments_owner_check", oneOf(t.ownerType, ATTACHMENT_OWNER)),
    check("attachments_mime_check", oneOf(t.mime, ATTACHMENT_MIME)),
    check("attachments_size_check", sql`${t.sizeBytes} between 1 and 10485760`),
    check("attachments_scan_check", oneOf(t.scanStatus, SCAN_STATUS)),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Referrals                                                                 */
/* -------------------------------------------------------------------------- */

export const referralCodes = pgTable(
  "referral_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    createdAt: createdAt(),
    disabledAt: ts("disabled_at"),
  },
  (t) => [
    uniqueIndex("referral_codes_code_key").on(t.code),
    uniqueIndex("referral_codes_one_active_key")
      .on(t.customerId)
      .where(sql`${t.disabledAt} is null`),
    check("referral_codes_format_check", sql`${t.code} ~ '^[A-Z0-9-]{6,32}$'`),
  ],
);

/** Versioned program terms; each referral is locked to the policy at sign-up. */
export const referralPolicies = pgTable(
  "referral_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: integer("version").notNull(),
    rewardType: text("reward_type").notNull(),
    fixedCents: bigint("fixed_cents", { mode: "number" }),
    /** Basis points: 500 = 5%. */
    percentBp: integer("percent_bp"),
    capCents: bigint("cap_cents", { mode: "number" }),
    minSpendCents: bigint("min_spend_cents", { mode: "number" }).notNull(),
    qualifyingDays: integer("qualifying_days").notNull(),
    holdDays: integer("hold_days").notNull(),
    minOrders: integer("min_orders").notNull().default(1),
    countRefunded: boolean("count_refunded").notNull().default(false),
    maxPerReferrer: integer("max_per_referrer"),
    destination: text("destination").notNull().default("rewards"),
    distribution: text("distribution").notNull().default("manual"),
    status: text("status").notNull().default("draft"),
    effectiveFrom: ts("effective_from"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("referral_policies_version_key").on(t.version),
    uniqueIndex("referral_policies_one_active_key")
      .on(t.status)
      .where(sql`${t.status} = 'active'`),
    check("referral_policies_type_check", oneOf(t.rewardType, REWARD_TYPE)),
    check(
      "referral_policies_amount_check",
      sql`(${t.rewardType} = 'fixed' and ${t.fixedCents} > 0) or (${t.rewardType} = 'percent' and ${t.percentBp} between 1 and 10000)`,
    ),
    check("referral_policies_ranges_check", sql`${t.minSpendCents} >= 0 and ${t.qualifyingDays} between 1 and 365 and ${t.holdDays} between 0 and 90 and ${t.minOrders} between 1 and 100`),
    check("referral_policies_destination_check", oneOf(t.destination, REWARD_DESTINATION)),
    check("referral_policies_distribution_check", oneOf(t.distribution, REWARD_DISTRIBUTION)),
    check("referral_policies_status_check", oneOf(t.status, POLICY_STATUS)),
  ],
);

export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referrerCustomerId: uuid("referrer_customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    refereeCustomerId: uuid("referee_customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    codeId: uuid("code_id").references(() => referralCodes.id, { onDelete: "restrict" }),
    via: text("via").notNull(),
    /** The active reward policy at sign-up, if any. Null while no reward program is approved (5G-B). */
    policyId: uuid("policy_id").references(() => referralPolicies.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("signed_up"),
    ineligibleReason: text("ineligible_reason"),
    attributedAt: ts("attributed_at").notNull().defaultNow(),
    qualifiedAt: ts("qualified_at"),
    /** When the referred customer confirmed their email (5G-B). */
    verifiedAt: ts("verified_at"),
    /** Review signals found at attribution (e.g. same_network, similar_email, high_volume). Never auto-rejects. */
    flags: jsonb("flags").$type<string[]>().notNull().default([]),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
  },
  (t) => [
    /** A customer can be referred only once. */
    uniqueIndex("referrals_referee_key").on(t.refereeCustomerId),
    index("referrals_referrer_idx").on(t.referrerCustomerId),
    index("referrals_attributed_idx").on(t.attributedAt),
    index("referrals_code_attributed_idx").on(t.codeId, t.attributedAt),
    check("referrals_self_check", sql`${t.referrerCustomerId} <> ${t.refereeCustomerId}`),
    check("referrals_via_check", oneOf(t.via, REFERRAL_VIA)),
    check("referrals_status_check", oneOf(t.status, REFERRAL_STATUS)),
    check("referrals_ineligible_check", sql`${t.status} <> 'ineligible' or ${t.ineligibleReason} is not null`),
  ],
);

export const referralRewards = pgTable(
  "referral_rewards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referralId: uuid("referral_id")
      .notNull()
      .references(() => referrals.id, { onDelete: "restrict" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    status: text("status").notNull().default("pending"),
    holdUntil: ts("hold_until"),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "restrict" }),
    approvedAt: ts("approved_at"),
    creditedEntryId: uuid("credited_entry_id").references(() => journalEntries.id, { onDelete: "restrict" }),
    reversedReason: text("reversed_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** One reward per referral. */
    uniqueIndex("referral_rewards_referral_key").on(t.referralId),
    uniqueIndex("referral_rewards_credited_entry_key").on(t.creditedEntryId),
    check("referral_rewards_amount_check", sql`${t.amountCents} > 0`),
    check("referral_rewards_status_check", oneOf(t.status, REWARD_STATUS)),
    check("referral_rewards_credited_check", sql`(${t.status} = 'credited') = (${t.creditedEntryId} is not null)`),
    check("referral_rewards_approved_check", sql`${t.status} not in ('approved', 'credited') or ${t.approvedBy} is not null`),
  ],
);

/** Append-only (trigger-enforced). */
export const referralEvents = pgTable(
  "referral_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referralId: uuid("referral_id")
      .notNull()
      .references(() => referrals.id, { onDelete: "restrict" }),
    type: text("type").notNull(),
    data: jsonb("data").notNull().default({}),
    actorType: text("actor_type").notNull(),
    actorId: uuid("actor_id"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("referral_events_referral_idx").on(t.referralId, t.at), check("referral_events_actor_check", oneOf(t.actorType, AUDIT_ACTOR))],
);

/* -------------------------------------------------------------------------- */
/*  Notifications, settings, notes, audit                                     */
/* -------------------------------------------------------------------------- */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_recipient_idx").on(t.recipientUserId, t.createdAt.desc()), check("notifications_link_check", sql`${t.link} is null or ${t.link} ~ '^/'`)],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    channel: text("channel").notNull(),
    enabled: boolean("enabled").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.channel] }), check("notification_preferences_channel_check", oneOf(t.channel, NOTIFICATION_CHANNEL))],
);

/** Written in the same transaction as the business change; sent by the worker. */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
    toAddress: text("to_address").notNull(),
    template: text("template").notNull(),
    data: jsonb("data").notNull().default({}),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    sentAt: ts("sent_at"),
  },
  (t) => [uniqueIndex("email_outbox_idempotency_key").on(t.idempotencyKey), index("email_outbox_status_idx").on(t.status, t.createdAt), check("email_outbox_status_check", oneOf(t.status, OUTBOX_STATUS))],
);

export const platformSettings = pgTable(
  "platform_settings",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").notNull(),
    version: integer("version").notNull().default(1),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [check("platform_settings_key_check", sql`${t.key} ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$'`)],
);

export const staffNotes = pgTable(
  "staff_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("staff_notes_target_idx").on(t.targetType, t.targetId, t.createdAt), check("staff_notes_target_check", oneOf(t.targetType, NOTE_TARGET)), check("staff_notes_body_check", sql`length(${t.body}) between 1 and 1000`)],
);

/** Append-only business audit (trigger-enforced). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    actorType: text("actor_type").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_target_idx").on(t.targetType, t.targetId, t.at),
    index("audit_log_actor_idx").on(t.actorUserId, t.at),
    index("audit_log_at_idx").on(t.at.desc()),
    check("audit_log_actor_check", oneOf(t.actorType, AUDIT_ACTOR)),
    check("audit_log_action_check", sql`${t.action} ~ '^[a-z_]+\\.[a-z_]+$'`),
  ],
);
