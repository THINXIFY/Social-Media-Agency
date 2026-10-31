import "server-only";
import { and, count, desc, eq, gte, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import {
  type Action,
  type AutomationData,
  type AutomationDefinition,
  type AutomationRunView,
  type AutomationStatus,
  type AutomationView,
  definitionSchema,
  describeTrigger,
  type InboxItemView,
  nextRunAt,
  type RunStatus,
  type Trigger,
} from "@/lib/social/automations";
import { audit } from "../audit";
import { hit } from "../auth/rate-limit";
import type { Db, Executor } from "../db/client";
import { automationInbox, automationRuns, automations, socialConnections, socialPosts } from "../db/schema";
import { AppError, errors, pgErrorOf } from "../errors";
import { logger } from "../log";
import { saveDraft } from "./publishing";

/**
 * Automation Studio engine (AI-08). Server-side only.
 *
 *  - Allowlist: definitions must parse against the shared schemas; the worker
 *    only knows the five internal actions below. There is no code execution,
 *    no HTTP, no messaging, no publishing and no financial action.
 *  - Authorisation: a workflow runs only while `active` with the customer's
 *    authorisation bound to its current version (also a DB check constraint).
 *    Editing an active workflow requires re-confirming; otherwise it pauses.
 *  - Reliability: due workflows are claimed with FOR UPDATE SKIP LOCKED; each
 *    trigger slot creates one run (unique key); each run creates at most one
 *    inbox item (unique run_id), so races and restarts can't duplicate work.
 *    Interrupted runs are retried (internal actions are idempotent) up to 3
 *    attempts. A worker that was down doesn't replay missed slots — it runs
 *    once and moves on.
 */

export interface AutomationDeps {
  now?: () => Date;
}

const MAX_AUTOMATIONS = 25;
const MAX_ACTIVE = 10;
const MAX_OPEN_ITEMS = 200;
const MAX_ATTEMPTS = 3;
const LEASE_MS = 2 * 60_000;
const BATCH = 20;
const STALE_SYNC_DAYS = 14;

const clock = (d: AutomationDeps) => (d.now ?? (() => new Date()))();

function mapEncoding(e: unknown): never {
  if (pgErrorOf(e)?.code === "22P05") throw new AppError("VALIDATION_FAILED", "This text contains characters (such as emoji) that this server's database can't store yet. It needs a UTF-8 database — please tell the SociVanta team.", { details: { field: "name" } });
  throw e;
}

async function limitWrites(db: Db, customerId: string) {
  const r = await hit(db, "automations", customerId, { limit: 200, windowSeconds: 3600 });
  if (!r.ok) throw new AppError("RATE_LIMITED", "You've made a lot of changes in a short time. Please wait a few minutes.");
}

/* -------------------------------------------------------------------------- */
/*  Views                                                                     */
/* -------------------------------------------------------------------------- */

type Row = typeof automations.$inferSelect;
type RunRow = typeof automationRuns.$inferSelect;

function view(r: Row, last: RunRow | undefined): AutomationView {
  const status = r.status as AutomationStatus;
  const lastStatus = (last?.status as RunStatus | undefined) ?? null;
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    templateId: r.templateId,
    timezone: r.timezone,
    trigger: r.trigger as Trigger,
    action: r.action as Action,
    onlyIfFound: r.onlyIfFound === "true",
    status,
    nextRunAt: status === "active" ? (r.nextRunAt?.toISOString() ?? null) : null,
    lastRunAt: r.lastRunAt?.toISOString() ?? null,
    lastRunStatus: lastStatus,
    attention: lastStatus === "failed" ? "The last run failed. Check its details, then retry." : status === "draft" ? "Not activated yet — review and activate it to start." : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const runView = (r: RunRow, live: Map<string, Row>): AutomationRunView => ({
  id: r.id,
  automationId: r.automationId,
  automationName: r.automationName,
  trigger: r.triggerLabel,
  scheduledFor: r.scheduledFor.toISOString(),
  startedAt: r.startedAt.toISOString(),
  finishedAt: r.finishedAt?.toISOString() ?? null,
  status: r.status as RunStatus,
  outcome: r.outcome,
  canRetry: r.status === "failed" && !!r.automationId && live.get(r.automationId)?.status === "active",
});

export async function automationData(db: Db, customerId: string): Promise<AutomationData> {
  const [rows, runs, items] = await Promise.all([
    db.select().from(automations).where(eq(automations.customerId, customerId)).orderBy(desc(automations.updatedAt)).limit(MAX_AUTOMATIONS),
    db.select().from(automationRuns).where(eq(automationRuns.customerId, customerId)).orderBy(desc(automationRuns.startedAt)).limit(100),
    db
      .select()
      .from(automationInbox)
      .where(and(eq(automationInbox.customerId, customerId), sql`(${automationInbox.status} = 'open' or ${automationInbox.updatedAt} > now() - interval '14 days')`))
      .orderBy(desc(automationInbox.createdAt))
      .limit(60),
  ]);
  const live = new Map(rows.map((r) => [r.id, r]));
  const lastByAutomation = new Map<string, RunRow>();
  for (const r of runs) if (r.automationId && !lastByAutomation.has(r.automationId)) lastByAutomation.set(r.automationId, r);
  return {
    automations: rows.map((r) => view(r, lastByAutomation.get(r.id))),
    runs: runs.map((r) => runView(r, live)),
    inbox: items.map(
      (i): InboxItemView => ({ id: i.id, kind: i.kind as InboxItemView["kind"], title: i.title, body: i.body, checklist: i.checklist, refs: i.refs, status: i.status as InboxItemView["status"], automationName: i.automationName, createdAt: i.createdAt.toISOString(), draftId: i.draftId }),
    ),
  };
}

async function own(db: Executor, customerId: string, id: string, lock = false) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw errors.notFound("That automation");
  const q = db.select().from(automations).where(and(eq(automations.id, id), eq(automations.customerId, customerId))).limit(1);
  const [row] = lock ? await q.for("update") : await q;
  if (!row) throw errors.notFound("That automation");
  return row;
}

/* -------------------------------------------------------------------------- */
/*  Create, edit, activate, pause, duplicate, delete                          */
/* -------------------------------------------------------------------------- */

const columns = (d: AutomationDefinition) => ({ name: d.name, description: d.description ?? "", templateId: d.templateId ?? null, timezone: d.timezone, trigger: d.trigger as unknown as Record<string, unknown>, action: d.action as unknown as Record<string, unknown>, onlyIfFound: String(d.onlyIfFound) });

async function activeCount(db: Executor, customerId: string, except?: string) {
  const [r] = await db
    .select({ n: count() })
    .from(automations)
    .where(and(eq(automations.customerId, customerId), eq(automations.status, "active"), except ? ne(automations.id, except) : undefined));
  return r?.n ?? 0;
}

/** First run strictly in the future; refuses definitions that would never run. */
function firstRun(d: { trigger: Trigger; timezone: string }, now: Date) {
  const next = nextRunAt(d.trigger, d.timezone, now);
  if (!next) throw new AppError("VALIDATION_FAILED", d.trigger.type === "once" ? "That date and time has already passed." : "This schedule never runs. Check the days and time.", { details: { field: "trigger" } });
  return next;
}

/**
 * Creates or updates a workflow. `activate: true` is the customer's explicit
 * authorisation of exactly this version; without it the workflow is saved as
 * a draft (new) or paused (edited while active).
 */
export async function saveAutomation(db: Db, customerId: string, id: string | null, raw: unknown, opts: { activate?: boolean; actorUserId?: string | null } & AutomationDeps = {}): Promise<AutomationView> {
  const d = definitionSchema.parse(raw);
  await limitWrites(db, customerId);
  const now = clock(opts);
  const next = opts.activate ? firstRun(d, now) : null;
  try {
    const row = await db.transaction(async (tx) => {
      if (opts.activate && (await activeCount(tx, customerId, id ?? undefined)) >= MAX_ACTIVE) throw errors.conflict(`You can have up to ${MAX_ACTIVE} active automations. Pause one first.`);
      if (!id) {
        const [{ n }] = (await tx.select({ n: count() }).from(automations).where(eq(automations.customerId, customerId))) as [{ n: number }];
        if (n >= MAX_AUTOMATIONS) throw errors.conflict(`You can keep up to ${MAX_AUTOMATIONS} automations. Delete one you no longer need.`);
        const [r] = await tx
          .insert(automations)
          .values({ customerId, ...columns(d), status: opts.activate ? "active" : "draft", version: 1, authorizedAt: opts.activate ? now : null, authorizedVersion: opts.activate ? 1 : null, nextRunAt: next })
          .returning();
        return r!;
      }
      const cur = await own(tx, customerId, id, true);
      const version = cur.version + 1;
      const status: AutomationStatus = opts.activate ? "active" : cur.status === "active" ? "paused" : cur.status === "completed" ? "paused" : (cur.status as AutomationStatus);
      const [r] = await tx
        .update(automations)
        .set({ ...columns(d), version, status, authorizedAt: opts.activate ? now : cur.authorizedAt, authorizedVersion: opts.activate ? version : cur.authorizedVersion, nextRunAt: opts.activate ? next : null, updatedAt: now })
        .where(eq(automations.id, id))
        .returning();
      return r!;
    });
    if (opts.activate) await audit(db, { actorUserId: opts.actorUserId ?? null, actorType: "customer", action: "automation.activated", targetType: "automation", targetId: row.id, after: { version: row.version, trigger: d.trigger.type, action: d.action.type } });
    return view(row, undefined);
  } catch (e) {
    mapEncoding(e);
  }
}

export async function setAutomationState(db: Db, customerId: string, id: string, action: "activate" | "pause", opts: { actorUserId?: string | null } & AutomationDeps = {}): Promise<AutomationView> {
  await limitWrites(db, customerId);
  const now = clock(opts);
  const row = await db.transaction(async (tx) => {
    const cur = await own(tx, customerId, id, true);
    if (action === "pause") {
      const [r] = await tx.update(automations).set({ status: "paused", nextRunAt: null, updatedAt: now }).where(eq(automations.id, id)).returning();
      return r!;
    }
    const d = definitionSchema.parse({ name: cur.name, description: cur.description, timezone: cur.timezone, trigger: cur.trigger, action: cur.action, onlyIfFound: cur.onlyIfFound === "true", templateId: cur.templateId });
    if ((await activeCount(tx, customerId, id)) >= MAX_ACTIVE) throw errors.conflict(`You can have up to ${MAX_ACTIVE} active automations. Pause one first.`);
    const [r] = await tx.update(automations).set({ status: "active", authorizedAt: now, authorizedVersion: cur.version, nextRunAt: firstRun(d, now), updatedAt: now }).where(eq(automations.id, id)).returning();
    return r!;
  });
  await audit(db, { actorUserId: opts.actorUserId ?? null, actorType: "customer", action: action === "pause" ? "automation.paused" : "automation.activated", targetType: "automation", targetId: id, after: { version: row.version } });
  return view(row, undefined);
}

export async function duplicateAutomation(db: Db, customerId: string, id: string): Promise<AutomationView> {
  const cur = await own(db, customerId, id);
  const name = `${cur.name}`.slice(0, 73) + " (copy)";
  return saveAutomation(db, customerId, null, { name, description: cur.description, timezone: cur.timezone, trigger: cur.trigger, action: cur.action, onlyIfFound: cur.onlyIfFound === "true", templateId: cur.templateId });
}

/** Deletes the workflow; its run history and inbox items are kept. */
export async function deleteAutomation(db: Db, customerId: string, id: string, actorUserId?: string | null) {
  await own(db, customerId, id);
  await db.delete(automations).where(and(eq(automations.id, id), eq(automations.customerId, customerId)));
  await audit(db, { actorUserId: actorUserId ?? null, actorType: "customer", action: "automation.deleted", targetType: "automation", targetId: id });
}

/* -------------------------------------------------------------------------- */
/*  Inbox                                                                     */
/* -------------------------------------------------------------------------- */

async function ownItem(db: Executor, customerId: string, id: string, lock = false) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw errors.notFound("That item");
  const q = db.select().from(automationInbox).where(and(eq(automationInbox.id, id), eq(automationInbox.customerId, customerId))).limit(1);
  const [row] = lock ? await q.for("update") : await q;
  if (!row) throw errors.notFound("That item");
  return row;
}

export async function updateInboxItem(db: Db, customerId: string, id: string, change: { status?: "open" | "done" | "dismissed"; toggle?: number }) {
  const item = await ownItem(db, customerId, id);
  const checklist = item.checklist.map((c, i) => (i === change.toggle ? { ...c, done: !c.done } : c));
  if (change.toggle !== undefined && (change.toggle < 0 || change.toggle >= item.checklist.length)) throw errors.notFound("That checklist item");
  const status = change.status ?? (checklist.length && checklist.every((c) => c.done) ? "done" : item.status);
  await db.update(automationInbox).set({ checklist, status, updatedAt: new Date() }).where(eq(automationInbox.id, id));
}

/** The customer approves a suggestion: one draft is created (idempotent), never scheduled. */
export async function approveSuggestion(db: Db, customerId: string, id: string, timezone: string): Promise<{ draftId: string }> {
  return db.transaction(async (tx) => {
    const item = await ownItem(tx, customerId, id, true);
    if (item.kind !== "suggestion") throw errors.conflict("Only suggestions can become drafts.");
    if (item.draftId) return { draftId: item.draftId };
    const post = await saveDraft(db, customerId, null, { title: item.title, text: item.body, timezone, providers: [] });
    await tx.update(automationInbox).set({ draftId: post.id, status: "done", updatedAt: new Date() }).where(eq(automationInbox.id, id));
    return { draftId: post.id };
  });
}

/* -------------------------------------------------------------------------- */
/*  Engine                                                                    */
/* -------------------------------------------------------------------------- */

/** One worker pass: recover interrupted runs, claim due workflows, execute. Safe to run concurrently. */
export async function runAutomationTick(db: Db, deps: AutomationDeps = {}) {
  const now = clock(deps);
  const summary = { claimed: 0, recovered: 0, succeeded: 0, skipped: 0, failed: 0 };
  const toRun: string[] = [];

  // Interrupted runs: their lease ran out without a result.
  const stale = await db
    .select({ id: automationRuns.id })
    .from(automationRuns)
    .where(and(eq(automationRuns.status, "running"), isNotNull(automationRuns.leaseUntil), lte(automationRuns.leaseUntil, now)))
    .limit(BATCH);
  summary.recovered = stale.length;
  toRun.push(...stale.map((s) => s.id));

  await db.transaction(async (tx) => {
    const due = (
      await tx.execute<{ id: string }>(sql`
        select id from automations
        where status = 'active' and next_run_at <= ${now}
        order by next_run_at
        limit ${BATCH}
        for update skip locked`)
    ).rows.map((r) => r.id);
    for (const id of due) {
      const [a] = await tx.select().from(automations).where(eq(automations.id, id));
      if (!a || !a.nextRunAt) continue;
      const trigger = a.trigger as Trigger;
      const slot = a.nextRunAt;
      // No catch-up storms: the next slot is computed from now, not from the missed slot.
      const next = nextRunAt(trigger, a.timezone, new Date(Math.max(now.getTime(), slot.getTime())));
      const [run] = await tx
        .insert(automationRuns)
        .values({ customerId: a.customerId, automationId: a.id, automationName: a.name, automationVersion: a.version, triggerLabel: describeTrigger(trigger), idempotencyKey: `${a.id}:${slot.toISOString()}`, scheduledFor: slot, status: "running" })
        .onConflictDoNothing({ target: automationRuns.idempotencyKey })
        .returning({ id: automationRuns.id });
      await tx.update(automations).set({ nextRunAt: next, lastRunAt: now, status: next ? "active" : "completed", updatedAt: a.updatedAt }).where(eq(automations.id, id));
      if (run) toRun.push(run.id);
    }
    summary.claimed = due.length;
  });

  for (const id of toRun) {
    const r = await executeRun(db, id, now);
    if (r) summary[r]++;
  }
  return summary;
}

async function finish(db: Executor, runId: string, status: "succeeded" | "skipped" | "failed", outcome: string, now: Date) {
  await db.update(automationRuns).set({ status, outcome: outcome.slice(0, 400), finishedAt: now, leaseUntil: null }).where(and(eq(automationRuns.id, runId), eq(automationRuns.status, "running")));
  return status;
}

/** Executes one run if this caller wins its lease. Every check is repeated immediately before acting. */
export async function executeRun(db: Db, runId: string, now: Date): Promise<"succeeded" | "skipped" | "failed" | null> {
  const [run] = await db
    .update(automationRuns)
    .set({ leaseUntil: new Date(now.getTime() + LEASE_MS), attempts: sql`${automationRuns.attempts} + 1` })
    .where(and(eq(automationRuns.id, runId), eq(automationRuns.status, "running"), sql`(${automationRuns.leaseUntil} is null or ${automationRuns.leaseUntil} <= ${now})`))
    .returning();
  if (!run) return null;
  if (run.attempts > MAX_ATTEMPTS) return finish(db, run.id, "failed", "This run was interrupted several times and won't be retried automatically.", now);

  const [a] = run.automationId ? await db.select().from(automations).where(and(eq(automations.id, run.automationId), eq(automations.customerId, run.customerId))) : [];
  if (!a) return finish(db, run.id, "skipped", "The automation was deleted before it ran.", now);
  // Cancellation check: paused, edited or de-authorised since this run was planned → nothing happens.
  const stillOn = (a.status === "active" || a.status === "completed") && a.authorizedVersion === a.version && a.version === run.automationVersion;
  if (!stillOn) return finish(db, run.id, "skipped", a.version !== run.automationVersion ? "The automation was changed after this run was planned, so it didn't run." : "The automation was paused before it ran.", now);

  try {
    const [open] = await db.select({ n: count() }).from(automationInbox).where(and(eq(automationInbox.customerId, run.customerId), eq(automationInbox.status, "open")));
    if ((open?.n ?? 0) >= MAX_OPEN_ITEMS) return finish(db, run.id, "skipped", `Your inbox has ${MAX_OPEN_ITEMS} open items. Clear some so new ones can be added.`, now);

    const action = a.action as Action;
    const onlyIfFound = a.onlyIfFound === "true";
    const item = await buildItem(db, run.customerId, action, onlyIfFound, now);
    if ("skip" in item) return finish(db, run.id, "skipped", item.skip, now);
    // One item per run, even if this run executes again after an interruption.
    await db
      .insert(automationInbox)
      .values({ customerId: run.customerId, runId: run.id, automationName: a.name, kind: item.kind, title: item.title, body: item.body, checklist: item.checklist ?? [], refs: item.refs ?? [] })
      .onConflictDoNothing({ target: automationInbox.runId });
    return finish(db, run.id, "succeeded", item.outcome, now);
  } catch (e) {
    logger().warn({ err: e instanceof Error ? e.name : "error", runId: run.id }, "automation run failed");
    if (run.attempts >= MAX_ATTEMPTS) return finish(db, run.id, "failed", "Something went wrong while running this automation. Nothing was changed.", now);
    // Leave it running with a short lease so the next pass retries it (the action is idempotent).
    await db.update(automationRuns).set({ leaseUntil: new Date(now.getTime() + 60_000 * run.attempts) }).where(eq(automationRuns.id, run.id));
    return null;
  }
}

type Built = { kind: InboxItemView["kind"]; title: string; body: string; outcome: string; checklist?: { text: string; done: boolean }[]; refs?: InboxItemView["refs"] } | { skip: string };

/** The only actions an automation can take. All read or write the customer's own SociVanta data. */
async function buildItem(db: Db, customerId: string, action: Action, onlyIfFound: boolean, now: Date): Promise<Built> {
  switch (action.type) {
    case "reminder":
      return { kind: "reminder", title: action.title, body: action.message, outcome: "Added a reminder to your inbox." };
    case "checklist":
      return { kind: "checklist", title: action.title, body: "", checklist: action.items.map((text) => ({ text, done: false })), outcome: `Prepared a ${action.items.length}-item checklist.` };
    case "draft_suggestion":
      return { kind: "suggestion", title: action.title, body: action.text, outcome: "Prepared a draft suggestion for you to approve." };
    case "flag_drafts": {
      const until = new Date(now.getTime() + action.withinDays * 864e5);
      const drafts = await db
        .select({ id: socialPosts.id, title: socialPosts.title, body: socialPosts.body, plannedAt: socialPosts.plannedAt })
        .from(socialPosts)
        .where(and(eq(socialPosts.customerId, customerId), eq(socialPosts.status, "draft"), gte(socialPosts.plannedAt, now), lte(socialPosts.plannedAt, until)))
        .orderBy(socialPosts.plannedAt)
        .limit(20);
      if (!drafts.length && onlyIfFound) return { skip: `No drafts are planned in the next ${action.withinDays} day${action.withinDays === 1 ? "" : "s"}.` };
      return {
        kind: "draft_review",
        title: drafts.length ? `${drafts.length} draft${drafts.length === 1 ? "" : "s"} to review` : "No drafts planned soon",
        body: drafts.length ? `Planned in the next ${action.withinDays} day${action.withinDays === 1 ? "" : "s"}. Review them before they're due.` : `Nothing is planned in the next ${action.withinDays} days.`,
        refs: drafts.map((d) => ({ type: "post" as const, id: d.id, label: (d.title?.trim() || d.body.trim().split("\n")[0] || "Untitled post").slice(0, 80) })),
        outcome: drafts.length ? `Flagged ${drafts.length} draft${drafts.length === 1 ? "" : "s"} for review.` : "Found no drafts to flag.",
      };
    }
    case "health_check": {
      const stale = new Date(now.getTime() - STALE_SYNC_DAYS * 864e5);
      const rows = await db
        .select({ id: socialConnections.id, name: socialConnections.displayName, provider: socialConnections.provider, status: socialConnections.status, ok: socialConnections.lastSyncOk, at: socialConnections.lastSyncAt })
        .from(socialConnections)
        .where(and(eq(socialConnections.customerId, customerId), inArray(socialConnections.status, ["active", "needs_reauth"])));
      const needs = rows.filter((r) => r.status === "needs_reauth" || r.ok === "failed" || !r.at || r.at < stale);
      if (!needs.length && onlyIfFound) return { skip: rows.length ? "All connected accounts look fine." : "No social accounts are connected yet." };
      return {
        kind: "health_warning",
        title: needs.length ? `${needs.length} account${needs.length === 1 ? "" : "s"} need${needs.length === 1 ? "s" : ""} attention` : "All accounts look fine",
        body: needs.length ? "Reconnect or refresh these accounts so their details stay accurate." : "Every connected account is connected and recently refreshed.",
        refs: needs.map((r) => ({ type: "account" as const, id: r.id, label: `${r.name} · ${r.status === "needs_reauth" ? "reconnect needed" : r.ok === "failed" ? "last refresh failed" : `not refreshed in ${STALE_SYNC_DAYS}+ days`}` })),
        outcome: needs.length ? `Found ${needs.length} account${needs.length === 1 ? "" : "s"} needing attention.` : "Checked connected accounts.",
      };
    }
  }
}

/** Retries a failed run as a new run (history stays intact). Only for active workflows; at most 2 retries per run. */
export async function retryRun(db: Db, customerId: string, runId: string, deps: AutomationDeps = {}) {
  await limitWrites(db, customerId);
  const now = clock(deps);
  if (!/^[0-9a-f-]{36}$/i.test(runId)) throw errors.notFound("That run");
  const [run] = await db.select().from(automationRuns).where(and(eq(automationRuns.id, runId), eq(automationRuns.customerId, customerId)));
  if (!run) throw errors.notFound("That run");
  if (run.status !== "failed") throw errors.conflict("Only failed runs can be retried.");
  const origin = run.retryOf ?? run.id;
  const [prior] = await db.select({ n: count() }).from(automationRuns).where(eq(automationRuns.retryOf, origin));
  if ((prior?.n ?? 0) >= 2) throw errors.conflict("This run has already been retried twice.");
  const [a] = run.automationId ? await db.select().from(automations).where(eq(automations.id, run.automationId)) : [];
  if (!a || a.status !== "active") throw errors.conflict("Activate the automation before retrying its runs.");
  const [created] = await db
    .insert(automationRuns)
    .values({ customerId, automationId: a.id, automationName: a.name, automationVersion: a.version, triggerLabel: run.triggerLabel, idempotencyKey: `${origin}:retry:${(prior?.n ?? 0) + 1}`, scheduledFor: run.scheduledFor, status: "running", retryOf: origin })
    .returning({ id: automationRuns.id });
  return executeRun(db, created!.id, now);
}
