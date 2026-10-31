import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { isSocialProvider, SOCIAL_PLATFORM, SOCIAL_PROVIDER_IDS, type SocialProviderId } from "@/lib/social/platforms";
import { type PostContent, type PostTargetView, type PostView, POST_TEXT_MAX, POST_TITLE_MAX, postState, type PostStatus, type TargetStatus, validateForPlatform } from "@/lib/social/publishing";
import { isTimeZone, zonedToUtc } from "@/lib/social/time";
import { audit } from "../audit";
import { decrypt } from "../auth/crypto";
import { hit } from "../auth/rate-limit";
import type { Db, Executor } from "../db/client";
import { socialConnections, socialEvents, socialPosts, socialPostTargets } from "../db/schema";
import type { Env } from "../env";
import { AppError, errors, pgErrorOf } from "../errors";
import { logger } from "../log";
import { defaultHttp, type HttpDeps } from "./http";
import { ADAPTERS, classifyPublishError, hasPublishScopes, type PublishAdapter, type PublishOutcome } from "./publish-adapters";
import { providerAvailability } from "./service";

/**
 * Drafts, scheduling and the publishing engine (AI-07). Server-side only.
 *
 * Safety rules:
 *  - Nothing is published without an explicit schedule action by the owner
 *    (approved_at), to accounts they own, that are connected, have granted the
 *    posting permission, and whose platform is switched on for publishing.
 *    All of this is checked when scheduling AND again immediately before the
 *    call.
 *  - Due targets are claimed atomically (FOR UPDATE SKIP LOCKED) with a lease,
 *    so concurrent workers can't take the same one.
 *  - Only definite, retryable rejections are retried (bounded, exponential
 *    backoff). An outcome that can't be confirmed — including a worker that
 *    died mid-publish — becomes `reconciliation_required` and is never
 *    retried automatically, so a post can't be published twice.
 */

export interface PublishingDeps {
  env: Env;
  now?: () => Date;
  /** Tests only: mock adapters. Production uses the activated ADAPTERS map. */
  adapters?: Partial<Record<SocialProviderId, PublishAdapter>>;
  http?: HttpDeps;
}

const MAX_POSTS = 500;
const MIN_LEAD_MS = 5 * 60_000;
const MAX_AHEAD_MS = 365 * 864e5;
export const MAX_ATTEMPTS = 3;
const LEASE_MS = 5 * 60_000;
const BATCH = 10;

const clock = (d: { now?: () => Date }) => (d.now ?? (() => new Date()))();
const list = (raw: string | undefined) => new Set((raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));

/** Whether posts can be published to a platform right now (server configuration only). */
export function publishingAvailability(env: Env, provider: SocialProviderId, adapters: Partial<Record<SocialProviderId, PublishAdapter>> = ADAPTERS): { ok: true } | { ok: false; reason: string } {
  const name = SOCIAL_PLATFORM[provider].name;
  if (providerAvailability(env, provider).state !== "available") return { ok: false, reason: `${name} connections aren't switched on yet.` };
  if (!list(env.SOCIAL_PUBLISHING_ENABLED).has(provider) || !adapters[provider]) return { ok: false, reason: `Publishing to ${name} isn't available yet. It needs ${name}'s approval for posting permission.` };
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Input                                                                     */
/* -------------------------------------------------------------------------- */

/** NFC-normalised text without control characters (newlines and tabs kept). */
const sanitize = (s: string) => s.normalize("NFC").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
const cleanText = (max: number) => z.string().transform(sanitize).pipe(z.string().max(max * 2)).refine((s) => Array.from(s).length <= max, `Must be ${max.toLocaleString("en-US")} characters or fewer.`);

export const draftInput = z
  .object({
    title: cleanText(POST_TITLE_MAX).optional().nullable(),
    text: cleanText(POST_TEXT_MAX),
    variants: z.partialRecord(z.enum(SOCIAL_PROVIDER_IDS), cleanText(POST_TEXT_MAX)).optional().default({}),
    providers: z.array(z.enum(SOCIAL_PROVIDER_IDS)).max(6).default([]).transform((a) => [...new Set(a)]),
    plannedLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable().optional(),
    timezone: z.string().refine(isTimeZone, "Unknown time zone."),
    // Media storage isn't configured in this build; references can't be attached yet.
    media: z.array(z.never()).max(0, "Media uploads aren't available yet.").optional().default([]),
  })
  .strict();
export type DraftInput = z.input<typeof draftInput>;

function toUtc(local: string, tz: string): { iso: string; ambiguous: boolean } {
  const r = zonedToUtc(local, tz);
  if (!r.ok) throw new AppError("VALIDATION_FAILED", r.reason === "nonexistent" ? "That time doesn't exist in your time zone (the clocks skip it for daylight saving). Pick another time." : "That date or time isn't valid.", { details: { field: "when" } });
  return { iso: r.iso, ambiguous: r.ambiguous };
}

/** Postgres can only store the text if the database encoding can represent it. */
function mapEncoding(e: unknown): never {
  if (pgErrorOf(e)?.code === "22P05") throw new AppError("VALIDATION_FAILED", "This text contains characters (such as emoji) that this server's database can't store yet. It needs a UTF-8 database — please tell the SociVanta team.", { details: { field: "text" } });
  throw e;
}

/* -------------------------------------------------------------------------- */
/*  Views                                                                     */
/* -------------------------------------------------------------------------- */

type PostRow = typeof socialPosts.$inferSelect;

const TARGET_NOTE: Record<string, string> = {
  publishing_not_activated: "Publishing to this platform isn't switched on.",
  account_disconnected: "The account was disconnected before the post was due.",
  account_needs_reauth: "The account's access ended before the post was due. Reconnect it and schedule again.",
  missing_permission: "The account hasn't granted posting permission.",
  invalid_content: "The post no longer meets this platform's rules.",
  post_not_approved: "The post wasn't approved for publishing.",
  unauthorized: "The platform no longer accepts SociVanta's access. Reconnect the account.",
  forbidden: "The platform refused permission to post.",
  rate_limited: "The platform asked us to slow down; retries ran out.",
  account_unavailable: "The platform didn't recognise the account.",
  lease_expired: "Publishing was interrupted, so SociVanta can't tell whether it was posted. Check the platform before trying again.",
  unavailable: "The platform didn't confirm the post. Check the platform before trying again.",
  bad_response: "The platform's reply couldn't be read, so the post may or may not exist. Check the platform before trying again.",
  unknown: "Something unexpected happened, so the post may or may not exist. Check the platform before trying again.",
};

async function views(db: Executor, customerId: string, rows: PostRow[]): Promise<PostView[]> {
  if (!rows.length) return [];
  const targets = await db
    .select({ t: socialPostTargets, accountName: socialConnections.displayName })
    .from(socialPostTargets)
    .innerJoin(socialConnections, eq(socialConnections.id, socialPostTargets.connectionId))
    .where(and(eq(socialPostTargets.customerId, customerId), inArray(socialPostTargets.postId, rows.map((r) => r.id))));
  return rows.map((r) => {
    const mine = targets
      .filter((x) => x.t.postId === r.id)
      .map(
        ({ t, accountName }): PostTargetView => ({
          id: t.id,
          connectionId: t.connectionId,
          provider: t.provider as SocialProviderId,
          accountName,
          status: t.status as TargetStatus,
          scheduledAt: t.scheduledAt.toISOString(),
          publishedAt: t.publishedAt?.toISOString() ?? null,
          externalUrl: t.externalUrl,
          note: t.lastErrorCode ? (TARGET_NOTE[t.lastErrorCode] ?? TARGET_NOTE.unknown!) : null,
        }),
      );
    return {
      id: r.id,
      title: r.title,
      text: r.body,
      variants: r.variants as PostView["variants"],
      media: r.media as PostView["media"],
      providers: r.providers.filter(isSocialProvider),
      status: r.status as PostStatus,
      state: postState(r.status as PostStatus, r.plannedAt?.toISOString() ?? null, mine),
      plannedAt: r.plannedAt?.toISOString() ?? null,
      scheduledAt: r.scheduledAt?.toISOString() ?? null,
      timezone: r.timezone,
      targets: mine,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

export async function listPosts(db: Db, customerId: string): Promise<PostView[]> {
  const rows = await db.select().from(socialPosts).where(eq(socialPosts.customerId, customerId)).orderBy(desc(socialPosts.updatedAt)).limit(300);
  return views(db, customerId, rows);
}

async function ownPost(db: Executor, customerId: string, id: string, lock = false) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw errors.notFound("That post");
  const q = db.select().from(socialPosts).where(and(eq(socialPosts.id, id), eq(socialPosts.customerId, customerId))).limit(1);
  const [row] = lock ? await q.for("update") : await q;
  if (!row) throw errors.notFound("That post");
  return row;
}

export async function getPost(db: Db, customerId: string, id: string): Promise<PostView> {
  return (await views(db, customerId, [await ownPost(db, customerId, id)]))[0]!;
}

/* -------------------------------------------------------------------------- */
/*  Drafts                                                                    */
/* -------------------------------------------------------------------------- */

async function limitWrites(db: Db, customerId: string) {
  const r = await hit(db, "socialPosts", customerId, { limit: 300, windowSeconds: 3600 });
  if (!r.ok) throw new AppError("RATE_LIMITED", "You've made a lot of changes in a short time. Please wait a few minutes.");
}

/** Creates (id = null) or updates a draft. Scheduled posts must be cancelled before they can be edited. */
export async function saveDraft(db: Db, customerId: string, id: string | null, raw: unknown): Promise<PostView> {
  const input = draftInput.parse(raw);
  await limitWrites(db, customerId);
  const planned = input.plannedLocal ? toUtc(input.plannedLocal, input.timezone).iso : null;
  const values = { title: input.title?.trim() || null, body: input.text, variants: input.variants, providers: input.providers, plannedAt: planned ? new Date(planned) : null, timezone: input.timezone, updatedAt: new Date() };
  try {
    if (!id) {
      const [{ n }] = (await db.select({ n: count() }).from(socialPosts).where(eq(socialPosts.customerId, customerId))) as [{ n: number }];
      if (n >= MAX_POSTS) throw errors.conflict(`You can keep up to ${MAX_POSTS} posts. Delete some old drafts first.`);
      const [row] = await db.insert(socialPosts).values({ customerId, ...values }).returning();
      return (await views(db, customerId, [row!]))[0]!;
    }
    const row = await db.transaction(async (tx) => {
      const p = await ownPost(tx, customerId, id, true);
      if (p.status === "scheduled") throw errors.conflict("This post is scheduled. Cancel the schedule to edit it.");
      const [u] = await tx
        .update(socialPosts)
        .set({ ...values, status: "draft" })
        .where(and(eq(socialPosts.id, id), eq(socialPosts.customerId, customerId)))
        .returning();
      return u!;
    });
    return (await views(db, customerId, [row]))[0]!;
  } catch (e) {
    mapEncoding(e);
  }
}

export async function duplicatePost(db: Db, customerId: string, id: string): Promise<PostView> {
  const p = await ownPost(db, customerId, id);
  return saveDraft(db, customerId, null, { title: p.title ? `${p.title}`.slice(0, POST_TITLE_MAX - 7) + " (copy)" : null, text: p.body, variants: p.variants, providers: p.providers.filter(isSocialProvider), timezone: p.timezone, plannedLocal: null });
}

/** Deletes a draft or a cancelled post that never reached a platform. */
export async function deletePost(db: Db, customerId: string, id: string) {
  await db.transaction(async (tx) => {
    const p = await ownPost(tx, customerId, id, true);
    if (p.status === "scheduled") throw errors.conflict("Cancel the schedule before deleting this post.");
    const [reached] = await tx
      .select({ n: count() })
      .from(socialPostTargets)
      .where(and(eq(socialPostTargets.postId, id), inArray(socialPostTargets.status, ["published", "publishing", "reconciliation_required"])));
    if ((reached?.n ?? 0) > 0) throw errors.conflict("This post reached a platform, so its history is kept.");
    await tx.delete(socialPosts).where(and(eq(socialPosts.id, id), eq(socialPosts.customerId, customerId)));
  });
}

/* -------------------------------------------------------------------------- */
/*  Scheduling                                                                */
/* -------------------------------------------------------------------------- */

const scheduleInput = z.object({ when: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), timezone: z.string().refine(isTimeZone, "Unknown time zone."), connectionIds: z.array(z.string().uuid()).min(1).max(12) }).strict();

const contentOf = (p: PostRow): PostContent => ({ text: p.body, title: p.title, media: p.media as PostContent["media"], variants: p.variants as PostContent["variants"] });

async function event(db: Executor, e: { customerId: string; provider: SocialProviderId; type: "post_scheduled" | "post_cancelled" | "post_published" | "post_failed" | "post_unconfirmed"; message: string; connectionId?: string | null; code?: string | null }) {
  await db.insert(socialEvents).values({ customerId: e.customerId, provider: e.provider, type: e.type, message: e.message.slice(0, 600), connectionId: e.connectionId ?? null, code: e.code ?? null });
}

/**
 * The owner's explicit approval to publish. Schedules (or reschedules, when
 * every target is still waiting) a post to accounts that can publish now.
 */
export async function schedulePost(db: Db, customerId: string, id: string, raw: unknown, deps: PublishingDeps & { actorUserId?: string | null }): Promise<{ post: PostView; ambiguous: boolean }> {
  const input = scheduleInput.parse(raw);
  await limitWrites(db, customerId);
  const now = clock(deps);
  const { iso, ambiguous } = toUtc(input.when, input.timezone);
  const at = new Date(iso);
  if (at.getTime() < now.getTime() + MIN_LEAD_MS) throw new AppError("VALIDATION_FAILED", "Choose a time at least 5 minutes from now.", { details: { field: "when" } });
  if (at.getTime() > now.getTime() + MAX_AHEAD_MS) throw new AppError("VALIDATION_FAILED", "Posts can be scheduled up to a year ahead.", { details: { field: "when" } });

  const connections = await db
    .select()
    .from(socialConnections)
    .where(and(eq(socialConnections.customerId, customerId), inArray(socialConnections.id, input.connectionIds)));
  if (connections.length !== new Set(input.connectionIds).size) throw errors.notFound("One of those accounts");

  const row = await db.transaction(async (tx) => {
    const p = await ownPost(tx, customerId, id, true);
    const content = contentOf(p);
    for (const c of connections) {
      const provider = c.provider as SocialProviderId;
      const name = SOCIAL_PLATFORM[provider].name;
      if (c.status !== "active") throw errors.conflict(`${c.displayName} needs reconnecting before posts can be scheduled to it.`);
      const avail = publishingAvailability(deps.env, provider, deps.adapters ?? ADAPTERS);
      if (!avail.ok) throw new AppError("FEATURE_DISABLED", avail.reason);
      if (!hasPublishScopes(provider, c.grantedScopes)) throw errors.conflict(`${c.displayName} hasn't granted posting permission. Reconnect it and allow posting on ${name}.`);
      const problems = validateForPlatform(content, provider).filter((x) => x.level === "error");
      if (problems.length) throw new AppError("VALIDATION_FAILED", problems[0]!.message);
    }
    if (p.status === "scheduled") {
      // Reschedule only while nothing has started: every live target must still be waiting.
      const live = await tx.select({ status: socialPostTargets.status }).from(socialPostTargets).where(and(eq(socialPostTargets.postId, id), inArray(socialPostTargets.status, ["scheduled", "publishing", "published", "reconciliation_required"])));
      if (live.some((t) => t.status !== "scheduled")) throw errors.conflict("Publishing has already started for this post, so it can't be rescheduled.");
      await tx.update(socialPostTargets).set({ status: "cancelled", updatedAt: now }).where(and(eq(socialPostTargets.postId, id), eq(socialPostTargets.status, "scheduled")));
    }
    await tx.insert(socialPostTargets).values(
      connections.map((c) => ({ postId: id, customerId, connectionId: c.id, provider: c.provider, status: "scheduled", scheduledAt: at, idempotencyKey: `svp_${randomUUID()}` })),
    );
    const providers = [...new Set([...p.providers.filter(isSocialProvider), ...connections.map((c) => c.provider as SocialProviderId)])];
    const [u] = await tx.update(socialPosts).set({ status: "scheduled", scheduledAt: at, timezone: input.timezone, approvedAt: now, plannedAt: null, providers, updatedAt: now }).where(eq(socialPosts.id, id)).returning();
    for (const c of connections) await event(tx, { customerId, provider: c.provider as SocialProviderId, type: "post_scheduled", connectionId: c.id, message: `Scheduled a post to ${c.displayName}.` });
    await audit(tx, { actorUserId: deps.actorUserId ?? null, actorType: "customer", action: "social.post_scheduled", targetType: "social_post", targetId: id, after: { at: iso, targets: connections.length } });
    return u!;
  });
  return { post: (await views(db, customerId, [row]))[0]!, ambiguous };
}

/** Cancels every target that hasn't started. A target already publishing can't be stopped and is reported. */
export async function cancelPost(db: Db, customerId: string, id: string, actorUserId?: string | null): Promise<{ cancelled: number; inFlight: number }> {
  return db.transaction(async (tx) => {
    const p = await ownPost(tx, customerId, id, true);
    if (p.status !== "scheduled") throw errors.conflict("This post isn't scheduled.");
    const done = await tx
      .update(socialPostTargets)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(socialPostTargets.postId, id), eq(socialPostTargets.status, "scheduled")))
      .returning({ provider: socialPostTargets.provider, connectionId: socialPostTargets.connectionId });
    const [inFlight] = await tx.select({ n: count() }).from(socialPostTargets).where(and(eq(socialPostTargets.postId, id), eq(socialPostTargets.status, "publishing")));
    await tx.update(socialPosts).set({ status: "cancelled", approvedAt: null, updatedAt: new Date() }).where(eq(socialPosts.id, id));
    for (const d of done) await event(tx, { customerId, provider: d.provider as SocialProviderId, type: "post_cancelled", connectionId: d.connectionId, message: "Cancelled a scheduled post. Nothing was published." });
    await audit(tx, { actorUserId: actorUserId ?? null, actorType: "customer", action: "social.post_cancelled", targetType: "social_post", targetId: id, after: { cancelled: done.length } });
    return { cancelled: done.length, inFlight: inFlight?.n ?? 0 };
  });
}

/* -------------------------------------------------------------------------- */
/*  Engine (worker)                                                           */
/* -------------------------------------------------------------------------- */

type TargetRow = typeof socialPostTargets.$inferSelect;

export const backoffSeconds = (attempts: number, retryAfter?: number | null) => Math.min(1800, Math.max(retryAfter ?? 0, 60 * 2 ** Math.max(0, attempts - 1)));

/** One worker pass: recover interrupted work, then publish what's due. Safe to run concurrently. */
export async function runPublishingTick(db: Db, deps: PublishingDeps) {
  const now = clock(deps);
  const adapters = deps.adapters ?? ADAPTERS;
  const summary = { recovered: 0, claimed: 0, published: 0, retried: 0, failed: 0, unconfirmed: 0 };

  // A claim whose lease ran out means a worker stopped mid-publish: the outcome is unknown.
  const stale = await db
    .update(socialPostTargets)
    .set({ status: "reconciliation_required", leaseUntil: null, lastErrorCode: "lease_expired", updatedAt: now })
    .where(and(eq(socialPostTargets.status, "publishing"), lt(socialPostTargets.leaseUntil, now)))
    .returning();
  for (const t of stale) await event(db, { customerId: t.customerId, provider: t.provider as SocialProviderId, type: "post_unconfirmed", connectionId: t.connectionId, code: "lease_expired", message: `Publishing to ${SOCIAL_PLATFORM[t.provider as SocialProviderId].name} was interrupted and couldn't be confirmed. Check the platform before trying again — SociVanta won't retry automatically, to avoid a duplicate post.` });
  summary.recovered = stale.length;

  const claimed = (
    await db.execute<{ id: string }>(sql`
      update social_post_targets set status = 'publishing', attempts = attempts + 1, lease_until = ${new Date(now.getTime() + LEASE_MS)}, updated_at = ${now}
      where id in (
        select id from social_post_targets
        where status = 'scheduled' and coalesce(next_attempt_at, scheduled_at) <= ${now}
        order by coalesce(next_attempt_at, scheduled_at)
        limit ${BATCH}
        for update skip locked
      )
      returning id`)
  ).rows.map((r) => r.id);
  summary.claimed = claimed.length;

  for (const tid of claimed) {
    const [t] = await db.select().from(socialPostTargets).where(eq(socialPostTargets.id, tid));
    if (!t) continue;
    const outcome = await executeTarget(db, t, adapters, deps);
    const result = await settle(db, t, outcome, now);
    summary[result]++;
  }
  return summary;
}

async function executeTarget(db: Db, t: TargetRow, adapters: Partial<Record<SocialProviderId, PublishAdapter>>, deps: PublishingDeps): Promise<PublishOutcome> {
  const provider = t.provider as SocialProviderId;
  const [post] = await db.select().from(socialPosts).where(and(eq(socialPosts.id, t.postId), eq(socialPosts.customerId, t.customerId)));
  const [conn] = await db.select().from(socialConnections).where(and(eq(socialConnections.id, t.connectionId), eq(socialConnections.customerId, t.customerId)));
  // Re-check everything at execution time; any failure here means nothing was sent.
  const refuse = (code: string): PublishOutcome => ({ kind: "rejected", code, retryable: false });
  if (!post || post.status !== "scheduled" || !post.approvedAt) return refuse("post_not_approved");
  if (!conn || conn.status === "disconnected" || !conn.accessTokenCiphertext) return refuse("account_disconnected");
  if (conn.status !== "active") return refuse("account_needs_reauth");
  if (!publishingAvailability(deps.env, provider, adapters).ok) return refuse("publishing_not_activated");
  if (!hasPublishScopes(provider, conn.grantedScopes)) return refuse("missing_permission");
  const content = contentOf(post);
  if (validateForPlatform(content, provider).some((x) => x.level === "error")) return refuse("invalid_content");
  const adapter = adapters[provider];
  if (!adapter) return refuse("publishing_not_activated");
  try {
    return await adapter.publish({ idempotencyKey: t.idempotencyKey, content, accessToken: decrypt(conn.accessTokenCiphertext), externalAccountId: conn.externalId }, { http: deps.http ?? defaultHttp() });
  } catch (e) {
    logger().warn({ provider, err: e instanceof Error ? e.name : "error" }, "publish call failed");
    return classifyPublishError(e);
  }
}

async function settle(db: Db, t: TargetRow, o: PublishOutcome, now: Date): Promise<"published" | "retried" | "failed" | "unconfirmed"> {
  const provider = t.provider as SocialProviderId;
  const name = SOCIAL_PLATFORM[provider].name;
  // Only the claim holder may settle: the row must still be publishing.
  const mine = and(eq(socialPostTargets.id, t.id), eq(socialPostTargets.status, "publishing"));
  if (o.kind === "published") {
    await db.update(socialPostTargets).set({ status: "published", externalId: o.externalId.slice(0, 200), externalUrl: o.url?.slice(0, 500) ?? null, publishedAt: now, leaseUntil: null, lastErrorCode: null, updatedAt: now }).where(mine);
    await event(db, { customerId: t.customerId, provider, type: "post_published", connectionId: t.connectionId, message: `Published a post on ${name}.` });
    return "published";
  }
  if (o.kind === "uncertain") {
    await db.update(socialPostTargets).set({ status: "reconciliation_required", leaseUntil: null, lastErrorCode: o.code, updatedAt: now }).where(mine);
    await event(db, { customerId: t.customerId, provider, type: "post_unconfirmed", connectionId: t.connectionId, code: o.code, message: `${name} didn't confirm the post. Check ${name} before trying again — SociVanta won't retry automatically, to avoid a duplicate post.` });
    return "unconfirmed";
  }
  if (o.retryable && t.attempts < MAX_ATTEMPTS) {
    const next = new Date(now.getTime() + backoffSeconds(t.attempts, o.retryAfterSeconds) * 1000);
    await db.update(socialPostTargets).set({ status: "scheduled", nextAttemptAt: next, leaseUntil: null, lastErrorCode: o.code, updatedAt: now }).where(mine);
    return "retried";
  }
  await db.update(socialPostTargets).set({ status: "failed", leaseUntil: null, lastErrorCode: o.code, updatedAt: now }).where(mine);
  await event(db, { customerId: t.customerId, provider, type: "post_failed", connectionId: t.connectionId, code: o.code, message: `Couldn't publish on ${name}: ${(TARGET_NOTE[o.code] ?? "the platform refused the post.").replace(/\.$/, "")}. Nothing was posted.` });
  return "failed";
}
