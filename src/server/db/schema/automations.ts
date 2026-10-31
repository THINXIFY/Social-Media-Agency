import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, oneOf, ts, updatedAt } from "./helpers";
import { customers } from "./identity";

/*
 * Automation Studio (AI-08). Customer-owned workflows built only from the
 * allowlisted triggers and actions in src/lib/social/automations.ts. Runs
 * are append-only once finished (enforced by a trigger in the migration);
 * each run produces at most one inbox item, so a run executed twice — by a
 * racing or restarted worker — still creates exactly one.
 */

export const AUTOMATION_STATUS = ["draft", "active", "paused", "completed"] as const;
export const AUTOMATION_RUN_STATUS = ["running", "succeeded", "skipped", "failed"] as const;
export const INBOX_KIND = ["reminder", "checklist", "draft_review", "health_warning", "suggestion"] as const;
export const INBOX_STATUS = ["open", "done", "dismissed"] as const;

export const automations = pgTable(
  "automations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    templateId: text("template_id"),
    timezone: text("timezone").notNull(),
    trigger: jsonb("trigger").$type<Record<string, unknown>>().notNull(),
    action: jsonb("action").$type<Record<string, unknown>>().notNull(),
    onlyIfFound: text("only_if_found").notNull().default("true"),
    status: text("status").notNull().default("draft"),
    /** The customer's explicit activation of this exact version. */
    authorizedAt: ts("authorized_at"),
    authorizedVersion: integer("authorized_version"),
    version: integer("version").notNull().default(1),
    nextRunAt: ts("next_run_at"),
    lastRunAt: ts("last_run_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("automations_customer_idx").on(t.customerId, t.updatedAt),
    index("automations_due_idx").on(t.status, t.nextRunAt),
    check("automations_status_check", oneOf(t.status, AUTOMATION_STATUS)),
    check("automations_text_check", sql`char_length(${t.name}) between 1 and 80 and char_length(${t.description}) <= 200`),
    // Only an authorised, current version can be active.
    check("automations_active_check", sql`${t.status} <> 'active' or (${t.authorizedAt} is not null and ${t.authorizedVersion} = ${t.version})`),
  ],
);

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** Kept as history when the automation is deleted. */
    automationId: uuid("automation_id").references(() => automations.id, { onDelete: "set null" }),
    automationName: text("automation_name").notNull(),
    automationVersion: integer("automation_version").notNull(),
    triggerLabel: text("trigger_label").notNull(),
    /** The trigger slot this run belongs to. One run per slot (idempotency). */
    idempotencyKey: text("idempotency_key").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("running"),
    outcome: text("outcome"),
    attempts: integer("attempts").notNull().default(0),
    leaseUntil: ts("lease_until"),
    retryOf: uuid("retry_of"),
    startedAt: createdAt(),
    finishedAt: ts("finished_at"),
  },
  (t) => [
    uniqueIndex("automation_runs_key_idx").on(t.idempotencyKey),
    index("automation_runs_customer_idx").on(t.customerId, t.startedAt),
    index("automation_runs_automation_idx").on(t.automationId, t.startedAt),
    index("automation_runs_running_idx").on(t.status, t.leaseUntil),
    index("automation_runs_started_idx").on(t.startedAt),
    check("automation_runs_status_check", oneOf(t.status, AUTOMATION_RUN_STATUS)),
    check("automation_runs_attempts_check", sql`${t.attempts} between 0 and 5`),
  ],
);

export const automationInbox = pgTable(
  "automation_inbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** Unique: a run creates at most one item, however many times it executes. */
    runId: uuid("run_id")
      .notNull()
      .references(() => automationRuns.id, { onDelete: "restrict" }),
    automationName: text("automation_name").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    checklist: jsonb("checklist").$type<{ text: string; done: boolean }[]>().notNull().default([]),
    refs: jsonb("refs").$type<{ type: "post" | "account"; id: string; label: string }[]>().notNull().default([]),
    status: text("status").notNull().default("open"),
    draftId: uuid("draft_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("automation_inbox_run_idx").on(t.runId),
    index("automation_inbox_customer_idx").on(t.customerId, t.status, t.createdAt),
    check("automation_inbox_kind_check", oneOf(t.kind, INBOX_KIND)),
    check("automation_inbox_status_check", oneOf(t.status, INBOX_STATUS)),
  ],
);
