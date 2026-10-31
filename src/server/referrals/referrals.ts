import "server-only";
import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gte, ilike, isNull, like, max, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { type AdminReferralRow, type OwnReferralSummary, type ProgramSettings, REFERRAL_FLAGS, type ReferralFlag, type ReferralStatus } from "@/lib/referrals";
import { audit } from "../audit";
import { hit } from "../auth/rate-limit";
import type { Db, Executor } from "../db/client";
import { auditLog, customers, platformSettings, referralCodes, referralEvents, referralPolicies, referrals, sessions, users } from "../db/schema";
import { getEnv } from "../env";
import { AppError, errors } from "../errors";

/*
 * Referral program (Phase 5G-B): codes, sign-up attribution and review.
 *
 *  - Attribution happens on the server at sign-up, once per new customer
 *    (unique referee index). Self-referral is refused; a missing, disabled or
 *    unknown code is ignored without affecting sign-up.
 *  - Review signals (same network, similar email, high volume) only flag a
 *    referral for staff. Nothing is rejected automatically, and no device
 *    fingerprinting is used: only the sign-up IP the server already logs.
 *  - Rewards are off. No referral can be qualified, no policy can be
 *    activated and no reward row can be written (database guard SV014).
 *    Nothing here touches wallets, the ledger or orders.
 */

type Client = { ip?: string | null; userAgent?: string | null };
type Staff = { userId: string };

/* -------------------------------------------------------------------------- */
/*  Program settings                                                          */
/* -------------------------------------------------------------------------- */

export const PROGRAM_KEY = "referrals.program";
export const DEFAULT_PROGRAM: ProgramSettings = { attributionEnabled: true, sharingEnabled: true };
const programSchema = z.strictObject({ attributionEnabled: z.boolean(), sharingEnabled: z.boolean() });

export async function loadProgram(db: Executor): Promise<ProgramSettings & { version: number }> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, PROGRAM_KEY)).limit(1);
  if (!row) return { ...DEFAULT_PROGRAM, version: 0 };
  const parsed = programSchema.safeParse(row.value);
  // An unreadable stored value fails closed: no new attributions or sharing until an admin saves valid settings.
  return parsed.success ? { ...parsed.data, version: row.version } : { attributionEnabled: false, sharingEnabled: false, version: row.version };
}

/** Saves program switches with optimistic concurrency. Rewards aren't a switch: they stay off. */
export async function saveProgram(db: Db, staff: Staff, raw: unknown, version: number, client: Client = {}) {
  const next = programSchema.parse(raw);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(platformSettings).where(eq(platformSettings.key, PROGRAM_KEY)).for("update").limit(1);
    if ((row?.version ?? 0) !== version) throw errors.conflict("Someone else changed these settings. Reload to see the latest values.");
    if (row) await tx.update(platformSettings).set({ value: next, version: row.version + 1, updatedBy: staff.userId, updatedAt: new Date() }).where(eq(platformSettings.key, PROGRAM_KEY));
    else await tx.insert(platformSettings).values({ key: PROGRAM_KEY, value: next, version: 1, updatedBy: staff.userId });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "referral.program_saved", targetType: "setting", targetId: PROGRAM_KEY, before: row ? (row.value as Record<string, unknown>) : null, after: next, ip: client.ip, userAgent: client.userAgent });
  });
}

/* -------------------------------------------------------------------------- */
/*  Codes                                                                     */
/* -------------------------------------------------------------------------- */

// Crockford-style alphabet without 0/O, 1/I/L or U: easy to read aloud and hard to guess (30^8 ≈ 6.6e11).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const newCode = () => `SV-${Array.from(randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
const CODE_FORMAT = /^[A-Z0-9-]{6,32}$/;
export const normalizeCode = (raw: unknown) => {
  const v = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return CODE_FORMAT.test(v) ? v : null;
};
export const referralLink = (code: string) => `${getEnv().APP_URL}/register?ref=${encodeURIComponent(code)}`;

async function activeCode(db: Executor, customerId: string) {
  const [row] = await db.select({ id: referralCodes.id, code: referralCodes.code }).from(referralCodes).where(and(eq(referralCodes.customerId, customerId), isNull(referralCodes.disabledAt))).limit(1);
  return row ?? null;
}

/** The customer's active code, created on first use. Safe under concurrent calls. */
export async function getOrCreateCode(db: Db, customerId: string) {
  const existing = await activeCode(db, customerId);
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 4; attempt++) {
    const [row] = await db.insert(referralCodes).values({ customerId, code: newCode() }).onConflictDoNothing().returning({ code: referralCodes.code });
    if (row) return row.code;
    const raced = await activeCode(db, customerId);
    if (raced) return raced.code;
  }
  throw errors.unavailable("Your referral code couldn't be created. Please try again.");
}

/** Replaces the customer's code. The old one stops working for new sign-ups; existing referrals keep their history. */
export async function regenerateCode(db: Db, actor: { userId: string; customerId: string }, client: Client = {}) {
  const limit = await hit(db, "referral-code", actor.customerId, { limit: 3, windowSeconds: 86_400 });
  if (!limit.ok) throw new AppError("RATE_LIMITED", "You've changed your referral code several times today. Please try again tomorrow.");
  return db.transaction(async (tx) => {
    const [old] = await tx.update(referralCodes).set({ disabledAt: new Date() }).where(and(eq(referralCodes.customerId, actor.customerId), isNull(referralCodes.disabledAt))).returning({ code: referralCodes.code });
    const [row] = await tx.insert(referralCodes).values({ customerId: actor.customerId, code: newCode() }).returning({ code: referralCodes.code });
    await audit(tx, { actorUserId: actor.userId, actorType: "customer", action: "referral.code_regenerated", targetType: "customer", targetId: actor.customerId, before: old ? { code: old.code } : null, after: { code: row.code }, ip: client.ip, userAgent: client.userAgent });
    return row.code;
  });
}

/* -------------------------------------------------------------------------- */
/*  Attribution                                                               */
/* -------------------------------------------------------------------------- */

/** Lower-cases, drops +tags and, for Gmail, dots, so obvious variants of one inbox compare equal. */
export function canonicalEmail(email: string) {
  const [local = "", domain = ""] = email.toLowerCase().trim().split("@");
  const base = local.split("+")[0];
  const d = domain === "googlemail.com" ? "gmail.com" : domain;
  return `${d === "gmail.com" ? base.replaceAll(".", "") : base}@${d}`;
}

const HIGH_VOLUME = 10;

export type AttributionResult = { status: "attributed" | "skipped"; reason?: "disabled" | "invalid_code" | "self" | "already_referred" };

/**
 * Records that a new customer signed up with someone's referral. Called once,
 * right after the account is created. Never throws for a bad code: sign-up
 * must behave the same with or without one.
 */
export async function attributeReferral(
  db: Db,
  referee: { userId: string; customerId: string; email: string },
  rawCode: unknown,
  via: "link" | "code",
  client: Client = {},
): Promise<AttributionResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { status: "skipped", reason: "invalid_code" };
  if (!(await loadProgram(db)).attributionEnabled) return { status: "skipped", reason: "disabled" };
  const [owner] = await db
    .select({ codeId: referralCodes.id, customerId: referralCodes.customerId, userId: customers.userId, email: users.email })
    .from(referralCodes)
    .innerJoin(customers, eq(customers.id, referralCodes.customerId))
    .innerJoin(users, eq(users.id, customers.userId))
    .where(and(eq(referralCodes.code, code), isNull(referralCodes.disabledAt), eq(users.status, "active")))
    .limit(1);
  if (!owner) return { status: "skipped", reason: "invalid_code" };
  if (owner.customerId === referee.customerId || canonicalEmail(owner.email) === canonicalEmail(referee.email)) return { status: "skipped", reason: "self" };

  const flags: ReferralFlag[] = [];
  if (canonicalEmail(owner.email).split("@")[0] === canonicalEmail(referee.email).split("@")[0]) flags.push("similar_email");
  if (client.ip) {
    const [shared] = await db.select({ n: count() }).from(sessions).where(and(eq(sessions.userId, owner.userId), eq(sessions.ip, client.ip), gte(sessions.createdAt, new Date(Date.now() - 30 * 86_400_000))));
    if (shared.n > 0) flags.push("same_network");
  }
  const [recent] = await db.select({ n: count() }).from(referrals).where(and(eq(referrals.codeId, owner.codeId), gte(referrals.attributedAt, new Date(Date.now() - 86_400_000))));
  if (recent.n + 1 >= HIGH_VOLUME) flags.push("high_volume");

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(referrals)
      .values({ referrerCustomerId: owner.customerId, refereeCustomerId: referee.customerId, codeId: owner.codeId, via, flags })
      .onConflictDoNothing()
      .returning({ id: referrals.id });
    if (!row) return { status: "skipped", reason: "already_referred" } as const;
    await tx.insert(referralEvents).values({ referralId: row.id, type: "signed_up", data: { via, flags }, actorType: "system" });
    await audit(tx, { actorUserId: referee.userId, actorType: "customer", action: "referral.attributed", targetType: "referral", targetId: row.id, after: { via, flags }, ip: client.ip, userAgent: client.userAgent });
    return { status: "attributed" } as const;
  });
}

/** Notes that a referred customer confirmed their email. A no-op for anyone else or a second call. */
export async function markReferralVerified(db: Db, userId: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(referrals)
      .set({ verifiedAt: new Date() })
      .where(and(isNull(referrals.verifiedAt), sql`${referrals.refereeCustomerId} = (select ${customers.id} from ${customers} where ${customers.userId} = ${userId})`))
      .returning({ id: referrals.id });
    if (row) await tx.insert(referralEvents).values({ referralId: row.id, type: "email_verified", actorType: "system" });
  });
}

/* -------------------------------------------------------------------------- */
/*  Customer view                                                             */
/* -------------------------------------------------------------------------- */

/** First name and last initial: enough for the referrer to recognise a friend, nothing more. */
export const shortName = (first: string, last: string) => {
  const f = first.trim();
  const l = last.trim();
  if (!f) return "New member";
  return l ? `${f} ${l[0].toUpperCase()}.` : f;
};

export async function ownReferralSummary(db: Db, customerId: string): Promise<OwnReferralSummary> {
  const program = await loadProgram(db);
  const code = program.sharingEnabled ? await getOrCreateCode(db, customerId) : ((await activeCode(db, customerId))?.code ?? null);
  const rows = await db
    .select({ id: referrals.id, status: referrals.status, at: referrals.attributedAt, verifiedAt: referrals.verifiedAt, first: customers.firstName, last: customers.lastName })
    .from(referrals)
    .innerJoin(customers, eq(customers.id, referrals.refereeCustomerId))
    .where(eq(referrals.referrerCustomerId, customerId))
    .orderBy(desc(referrals.attributedAt))
    .limit(200);
  return {
    code: program.sharingEnabled ? code : null,
    link: program.sharingEnabled && code ? referralLink(code) : null,
    program: { attributionEnabled: program.attributionEnabled, sharingEnabled: program.sharingEnabled },
    rewardsEnabled: false,
    counts: {
      joined: rows.length,
      verified: rows.filter((r) => r.verifiedAt).length,
      underReview: rows.filter((r) => r.status === "pending").length,
      qualified: rows.filter((r) => r.status === "qualified").length,
    },
    history: rows.map((r) => ({ id: r.id.slice(0, 8), name: shortName(r.first, r.last), joinedAt: r.at.toISOString(), verified: Boolean(r.verifiedAt), status: r.status as ReferralStatus })),
  };
}

/* -------------------------------------------------------------------------- */
/*  Staff                                                                     */
/* -------------------------------------------------------------------------- */

const referrer = alias(customers, "referrer");
const referee = alias(customers, "referee");
const referrerUser = alias(users, "referrer_user");
const refereeUser = alias(users, "referee_user");

export const adminListQuery = z.object({
  status: z.enum(["all", "flagged", "signed_up", "pending", "qualified", "ineligible"]).optional().default("all"),
  q: z.string().trim().max(80).optional().default(""),
});

const fullName = (c: { firstName: string; lastName: string }) => `${c.firstName} ${c.lastName}`.trim();

export async function adminReferrals(db: Db, raw: z.input<typeof adminListQuery>) {
  const q = adminListQuery.parse(raw);
  const filters: SQL[] = [];
  if (q.status === "flagged") filters.push(sql`jsonb_array_length(${referrals.flags}) > 0`);
  else if (q.status !== "all") filters.push(eq(referrals.status, q.status));
  if (q.q) {
    const term = `%${q.q.replace(/[%_\\]/g, "\\$&")}%`;
    filters.push(or(ilike(referralCodes.code, term), ilike(referrerUser.email, term), ilike(refereeUser.email, term), ilike(referrer.publicRef, term), ilike(referee.publicRef, term))!);
  }
  const rows = await db
    .select({ r: referrals, code: referralCodes.code, referrer, referee, referrerEmail: referrerUser.email, refereeEmail: refereeUser.email })
    .from(referrals)
    .innerJoin(referrer, eq(referrer.id, referrals.referrerCustomerId))
    .innerJoin(referee, eq(referee.id, referrals.refereeCustomerId))
    .innerJoin(referrerUser, eq(referrerUser.id, referrer.userId))
    .innerJoin(refereeUser, eq(refereeUser.id, referee.userId))
    .leftJoin(referralCodes, eq(referralCodes.id, referrals.codeId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(referrals.attributedAt))
    .limit(200);
  const [totals] = await db
    .select({
      all: count(),
      signedUp: sql<number>`count(*) filter (where ${referrals.status} = 'signed_up')`.mapWith(Number),
      pending: sql<number>`count(*) filter (where ${referrals.status} = 'pending')`.mapWith(Number),
      qualified: sql<number>`count(*) filter (where ${referrals.status} = 'qualified')`.mapWith(Number),
      ineligible: sql<number>`count(*) filter (where ${referrals.status} = 'ineligible')`.mapWith(Number),
      flagged: sql<number>`count(*) filter (where jsonb_array_length(${referrals.flags}) > 0)`.mapWith(Number),
      verified: sql<number>`count(*) filter (where ${referrals.verifiedAt} is not null)`.mapWith(Number),
    })
    .from(referrals);
  const list: AdminReferralRow[] = rows.map((x) => ({
    id: x.r.id,
    status: x.r.status as ReferralStatus,
    via: x.r.via as "link" | "code",
    code: x.code,
    flags: (x.r.flags ?? []).filter((f): f is ReferralFlag => (REFERRAL_FLAGS as readonly string[]).includes(f)),
    attributedAt: x.r.attributedAt.toISOString(),
    verifiedAt: x.r.verifiedAt?.toISOString() ?? null,
    referrer: { ref: x.referrer.publicRef, name: fullName(x.referrer), email: x.referrerEmail },
    referee: { ref: x.referee.publicRef, name: fullName(x.referee), email: x.refereeEmail },
  }));
  return { referrals: list, totals };
}

export async function adminReferral(db: Db, id: string) {
  if (!z.uuid().safeParse(id).success) throw errors.notFound("That referral");
  const [x] = await db
    .select({ r: referrals, code: referralCodes.code, codeDisabledAt: referralCodes.disabledAt, referrer, referee, referrerEmail: referrerUser.email, refereeEmail: refereeUser.email, reviewer: users.name })
    .from(referrals)
    .innerJoin(referrer, eq(referrer.id, referrals.referrerCustomerId))
    .innerJoin(referee, eq(referee.id, referrals.refereeCustomerId))
    .innerJoin(referrerUser, eq(referrerUser.id, referrer.userId))
    .innerJoin(refereeUser, eq(refereeUser.id, referee.userId))
    .leftJoin(referralCodes, eq(referralCodes.id, referrals.codeId))
    .leftJoin(users, eq(users.id, referrals.reviewedBy))
    .where(eq(referrals.id, id))
    .limit(1);
  if (!x) throw errors.notFound("That referral");
  const [events, [others]] = await Promise.all([
    db.select({ type: referralEvents.type, data: referralEvents.data, actorType: referralEvents.actorType, at: referralEvents.at, actor: users.name }).from(referralEvents).leftJoin(users, eq(users.id, referralEvents.actorId)).where(eq(referralEvents.referralId, id)).orderBy(referralEvents.at),
    db.select({ n: count() }).from(referrals).where(eq(referrals.referrerCustomerId, x.r.referrerCustomerId)),
  ]);
  return {
    id: x.r.id,
    status: x.r.status as ReferralStatus,
    via: x.r.via,
    code: x.code,
    codeActive: x.code ? !x.codeDisabledAt : false,
    flags: (x.r.flags ?? []) as ReferralFlag[],
    ineligibleReason: x.r.ineligibleReason,
    attributedAt: x.r.attributedAt.toISOString(),
    verifiedAt: x.r.verifiedAt?.toISOString() ?? null,
    reviewedAt: x.r.reviewedAt?.toISOString() ?? null,
    reviewedBy: x.reviewer,
    policy: x.r.policyId ? "Attached" : "None (no approved reward policy)",
    referrer: { ref: x.referrer.publicRef, name: fullName(x.referrer), email: x.referrerEmail, totalReferrals: others.n },
    referee: { ref: x.referee.publicRef, name: fullName(x.referee), email: x.refereeEmail, joinedAt: x.referee.createdAt.toISOString() },
    events: events.map((e) => ({ type: e.type, data: e.data as Record<string, unknown>, actor: e.actorType === "staff" ? (e.actor ?? "Staff") : e.actorType === "system" ? "System" : "Customer", at: e.at.toISOString() })),
  };
}

export const reviewSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("review") }),
  z.strictObject({ action: z.literal("restore") }),
  z.strictObject({ action: z.literal("reject"), reason: z.string().trim().min(4, "Give a short reason (at least 4 characters).").max(300) }),
  z.strictObject({ action: z.literal("qualify") }),
]);

const TRANSITIONS: Record<"review" | "reject" | "restore", { from: ReferralStatus[]; to: ReferralStatus; event: string }> = {
  review: { from: ["signed_up"], to: "pending", event: "marked_review" },
  reject: { from: ["signed_up", "pending"], to: "ineligible", event: "rejected" },
  restore: { from: ["pending", "ineligible"], to: "signed_up", event: "restored" },
};

/** Staff review. Qualifying is refused while no approved, active reward policy exists (and the database enforces it). */
export async function reviewReferral(db: Db, staff: Staff, id: string, raw: unknown, client: Client = {}) {
  if (!z.uuid().safeParse(id).success) throw errors.notFound("That referral");
  const input = reviewSchema.parse(raw);
  if (input.action === "qualify") {
    const [active] = await db.select({ id: referralPolicies.id }).from(referralPolicies).where(eq(referralPolicies.status, "active")).limit(1);
    if (!active) throw errors.conflict("Referrals can't be qualified yet. Qualification needs approved reward rules and accounting controls, which don't exist.");
    throw errors.conflict("Qualification isn't available in this phase.");
  }
  const t = TRANSITIONS[input.action];
  await db.transaction(async (tx) => {
    const [r] = await tx.select({ status: referrals.status }).from(referrals).where(eq(referrals.id, id)).for("update").limit(1);
    if (!r) throw errors.notFound("That referral");
    if (!t.from.includes(r.status as ReferralStatus)) throw errors.conflict("This referral has changed. Reload to see its current status.");
    const reason = input.action === "reject" ? input.reason : null;
    await tx.update(referrals).set({ status: t.to, ineligibleReason: reason, reviewedBy: staff.userId, reviewedAt: new Date() }).where(eq(referrals.id, id));
    await tx.insert(referralEvents).values({ referralId: id, type: t.event, data: reason ? { from: r.status, reason } : { from: r.status }, actorType: "staff", actorId: staff.userId });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: `referral.${t.event}`, targetType: "referral", targetId: id, before: { status: r.status }, after: { status: t.to, ...(reason ? { reason } : {}) }, ip: client.ip, userAgent: client.userAgent });
  });
}

/* -------------------------------------------------------------------------- */
/*  Reward rules (drafts only)                                                */
/* -------------------------------------------------------------------------- */

const cents = z.number().int().min(0).max(100_000_000);
export const draftPolicySchema = z
  .strictObject({
    rewardType: z.enum(["fixed", "percent"]),
    fixedCents: cents.positive().nullable().optional(),
    percentBp: z.number().int().min(1).max(10_000).nullable().optional(),
    capCents: cents.positive().nullable().optional(),
    minSpendCents: cents,
    qualifyingDays: z.number().int().min(1).max(365),
    holdDays: z.number().int().min(0).max(90),
    minOrders: z.number().int().min(1).max(100),
    maxPerReferrer: z.number().int().min(1).max(10_000).nullable().optional(),
  })
  .refine((p) => (p.rewardType === "fixed" ? p.fixedCents != null : p.percentBp != null), { message: "Set the reward amount for the chosen type.", path: ["amount"] });

export async function listPolicies(db: Executor) {
  const rows = await db.select({ p: referralPolicies, author: users.name }).from(referralPolicies).leftJoin(users, eq(users.id, referralPolicies.createdBy)).orderBy(desc(referralPolicies.version));
  return rows.map(({ p, author }) => ({
    id: p.id,
    version: p.version,
    status: p.status as "draft" | "active" | "retired",
    rewardType: p.rewardType as "fixed" | "percent",
    fixedCents: p.fixedCents,
    percentBp: p.percentBp,
    capCents: p.capCents,
    minSpendCents: p.minSpendCents,
    qualifyingDays: p.qualifyingDays,
    holdDays: p.holdDays,
    minOrders: p.minOrders,
    maxPerReferrer: p.maxPerReferrer,
    createdBy: author,
    createdAt: p.createdAt.toISOString(),
  }));
}

/** Saves a draft rule for later approval. Drafts never apply to anyone. */
export async function createDraftPolicy(db: Db, staff: Staff, raw: unknown, client: Client = {}) {
  const p = draftPolicySchema.parse(raw);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('referral_policies.version'))`);
    const [{ v }] = await tx.select({ v: max(referralPolicies.version) }).from(referralPolicies);
    const values = {
      version: (v ?? 0) + 1,
      rewardType: p.rewardType,
      fixedCents: p.rewardType === "fixed" ? p.fixedCents! : null,
      percentBp: p.rewardType === "percent" ? p.percentBp! : null,
      capCents: p.rewardType === "percent" ? (p.capCents ?? null) : null,
      minSpendCents: p.minSpendCents,
      qualifyingDays: p.qualifyingDays,
      holdDays: p.holdDays,
      minOrders: p.minOrders,
      maxPerReferrer: p.maxPerReferrer ?? null,
      destination: "rewards",
      distribution: "manual",
      status: "draft",
      createdBy: staff.userId,
    };
    const [row] = await tx.insert(referralPolicies).values(values).returning({ id: referralPolicies.id, version: referralPolicies.version });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "referral.policy_drafted", targetType: "referral_policy", targetId: row.id, after: { ...values, createdBy: undefined }, ip: client.ip, userAgent: client.userAgent });
    return row;
  });
}

/** Retires a draft. Activation isn't offered: it's blocked until approved rules and accounting controls exist. */
export async function retirePolicy(db: Db, staff: Staff, id: string, client: Client = {}) {
  if (!z.uuid().safeParse(id).success) throw errors.notFound("That rule");
  await db.transaction(async (tx) => {
    const [row] = await tx.update(referralPolicies).set({ status: "retired" }).where(and(eq(referralPolicies.id, id), eq(referralPolicies.status, "draft"))).returning({ id: referralPolicies.id, version: referralPolicies.version });
    if (!row) throw errors.conflict("Only draft rules can be retired.");
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "referral.policy_retired", targetType: "referral_policy", targetId: id, after: { version: row.version }, ip: client.ip, userAgent: client.userAgent });
  });
}

/** Recent referral audit entries for the admin history tab. */
export async function referralAudit(db: Executor) {
  const rows = await db
    .select({ id: auditLog.id, action: auditLog.action, actorType: auditLog.actorType, actor: users.name, targetType: auditLog.targetType, targetId: auditLog.targetId, at: auditLog.at })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(like(auditLog.action, "referral.%"))
    .orderBy(desc(auditLog.at))
    .limit(100);
  // Customer names aren't needed here; staff see who acted only for staff actions.
  return rows.map((r) => ({ id: r.id, action: r.action, actor: r.actorType === "staff" ? (r.actor ?? "Staff") : r.actorType === "system" ? "System" : "Customer", targetType: r.targetType, targetId: r.targetId, at: r.at.toISOString() }));
}
