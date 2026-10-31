import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, oneOf, ts, updatedAt } from "./helpers";
import { customers } from "./identity";
import { SOCIAL_PROVIDERS, socialConnections } from "./social";

/*
 * Social publishing (AI-07). A post is the customer's content; each target is
 * one connected account it is scheduled to. Only targets are ever executed by
 * the worker, one row at a time, claimed atomically. A target whose outcome
 * can't be confirmed becomes `reconciliation_required` and is never retried
 * automatically, so a post can't be published twice.
 */

export const POST_STATUS = ["draft", "scheduled", "cancelled"] as const;
export const TARGET_STATUS = ["scheduled", "publishing", "published", "failed", "cancelled", "reconciliation_required"] as const;

export const socialPosts = pgTable(
  "social_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    title: text("title"),
    body: text("body").notNull().default(""),
    /** Per-platform text overrides: { provider: text }. */
    variants: jsonb("variants").$type<Record<string, string>>().notNull().default({}),
    /** Media references (metadata only; files live in configured storage). */
    media: jsonb("media").$type<{ kind: string; name: string; bytes: number; type: string }[]>().notNull().default([]),
    providers: text("providers").array().notNull().default(sql`'{}'::text[]`),
    status: text("status").notNull().default("draft"),
    /** A planning date for drafts (not scheduled, nothing will run). */
    plannedAt: ts("planned_at"),
    scheduledAt: ts("scheduled_at"),
    /** The customer's IANA zone the times were chosen in. */
    timezone: text("timezone").notNull().default("UTC"),
    /** Explicit customer approval to publish, set only by the schedule action. */
    approvedAt: ts("approved_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("social_posts_customer_idx").on(t.customerId, t.updatedAt),
    check("social_posts_status_check", oneOf(t.status, POST_STATUS)),
    check("social_posts_body_check", sql`char_length(${t.body}) <= 5000 and (${t.title} is null or char_length(${t.title}) <= 100)`),
    check("social_posts_scheduled_check", sql`${t.status} <> 'scheduled' or (${t.scheduledAt} is not null and ${t.approvedAt} is not null)`),
  ],
);

export const socialPostTargets = pgTable(
  "social_post_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => socialPosts.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => socialConnections.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("scheduled"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    /** Sent to the platform where it supports idempotency; unique per scheduling. */
    idempotencyKey: text("idempotency_key").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at"),
    /** While publishing: the worker's claim expires at this time. */
    leaseUntil: ts("lease_until"),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    lastErrorCode: text("last_error_code"),
    publishedAt: ts("published_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("social_post_targets_key_idx").on(t.idempotencyKey),
    // One live target per post and account.
    uniqueIndex("social_post_targets_live_idx").on(t.postId, t.connectionId).where(sql`${t.status} in ('scheduled', 'publishing', 'published', 'reconciliation_required')`),
    index("social_post_targets_due_idx").on(t.status, t.scheduledAt),
    index("social_post_targets_customer_idx").on(t.customerId, t.scheduledAt),
    check("social_post_targets_status_check", oneOf(t.status, TARGET_STATUS)),
    check("social_post_targets_provider_check", oneOf(t.provider, SOCIAL_PROVIDERS)),
    check("social_post_targets_attempts_check", sql`${t.attempts} >= 0 and ${t.attempts} <= 10`),
  ],
);
