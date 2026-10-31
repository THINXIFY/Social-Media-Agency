import "server-only";
import { and, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { audit } from "../audit";
import type { Db } from "../db/client";
import { mfaFactors, mfaRecoveryCodes, platformSettings, roles, staffMembers, users } from "../db/schema";
import { emailConfigured, sendEmail } from "../email";
import { recoveryCodeUsedMessage, staffSetupMessage } from "../email/templates";
import { getEnv } from "../env";
import { AppError, errors } from "../errors";
import { logger } from "../log";
import { emailSchema } from "./accounts";
import { decrypt, encrypt, hmac } from "./crypto";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { clear, enforce, LIMITS } from "./rate-limit";
import { ensureSystemRoles, roleByKey } from "./roles";
import { type ClientInfo, createSession, markReauthenticated, recentlyReauthenticated, revokeAllSessions, rotateSession, type ValidSession } from "./sessions";
import { consumeToken, issueToken, peekToken } from "./tokens";
import { matchTotp, newRecoveryCodes, newTotpSecret, normaliseRecoveryCode, totpQrDataUrl, totpUri } from "./totp";

/**
 * Staff accounts: owner bootstrap, setup links, sign-in, mandatory TOTP MFA,
 * recovery codes, re-authentication and staff management.
 *
 * A staff session is "operational" only after a second factor is verified in
 * that same session; until then it can reach the MFA screens and nothing else.
 */

const LOGIN_FAILED = "Email or password is incorrect.";
const OWNER_SETUP_HOURS = 2;
const BOOTSTRAP_KEY = "auth.owner_bootstrap";
const fieldError = (field: string, message: string) => new AppError("VALIDATION_FAILED", message, { details: { field } });
const mask = (email: string) => email.replace(/^(.).*?(@.*)$/, "$1***$2");

/* -------------------------------------------------------------------------- */
/*  Owner bootstrap (CLI only)                                                */
/* -------------------------------------------------------------------------- */

/**
 * Creates the first Owner as an *invited* staff member and emails a single-use
 * setup link. Never sets a password, never activates the account, and refuses
 * to run once an owner exists (serialised by an advisory lock plus a unique
 * settings row). `resend` re-issues the link only while that owner is still
 * unfinished.
 */
export async function bootstrapOwner(db: Db, input: { email: string; name: string }, options: { resend?: boolean } = {}) {
  if (!emailConfigured()) throw errors.unavailable("Email must be configured before bootstrapping the owner.");
  const email = emailSchema.parse(input.email);
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) throw fieldError("name", "Enter the owner's name.");

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('socivanta:owner-bootstrap'))`);
    await ensureSystemRoles(tx);
    const owner = (await roleByKey(tx, "owner"))!;
    const owners = await tx
      .select({ id: staffMembers.id, status: staffMembers.status, userId: staffMembers.userId, email: users.email })
      .from(staffMembers)
      .innerJoin(users, eq(users.id, staffMembers.userId))
      .where(eq(staffMembers.roleId, owner.id));
    const [marker] = await tx.select().from(platformSettings).where(eq(platformSettings.key, BOOTSTRAP_KEY)).limit(1);

    if (options.resend) {
      const pending = owners.find((o) => o.status === "invited" && o.email.toLowerCase() === email);
      if (!pending || owners.some((o) => o.status === "active")) throw errors.conflict("There's no unfinished owner setup for that email.");
      return { userId: pending.userId, reissued: true };
    }
    if (owners.length || marker) throw errors.conflict("An owner already exists. Bootstrap runs only once; invite other staff from the admin panel.");

    const [existingUser] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    const userId = existingUser?.id ?? (await tx.insert(users).values({ email, name }).returning({ id: users.id }))[0].id;
    if (existingUser) await tx.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, userId));
    await tx.insert(staffMembers).values({ userId, roleId: owner.id, status: "invited" });
    await tx.insert(platformSettings).values({ key: BOOTSTRAP_KEY, value: { at: new Date().toISOString(), email: mask(email) } });
    await audit(tx, { actorType: "system", action: "staff.owner_bootstrapped", targetType: "user", targetId: userId, after: { role: "owner", status: "invited" } });
    return { userId, reissued: false };
  });

  const token = await issueToken(db, result.userId, "staff_invite", OWNER_SETUP_HOURS * 3_600_000);
  await sendEmail(staffSetupMessage(email, name, "Owner", `${getEnv().APP_URL}/admin/setup?token=${token}`, OWNER_SETUP_HOURS));
  return { status: result.reissued ? ("reissued" as const) : ("invited" as const), sentTo: mask(email) };
}

/* -------------------------------------------------------------------------- */
/*  Setup link → password                                                     */
/* -------------------------------------------------------------------------- */

export async function describeSetupLink(db: Db, rawToken: string) {
  const peek = await peekToken(db, rawToken, "staff_invite");
  if (!peek) return null;
  const [row] = await db
    .select({ email: users.email, name: users.name, role: roles.name, status: staffMembers.status })
    .from(staffMembers)
    .innerJoin(users, eq(users.id, staffMembers.userId))
    .innerJoin(roles, eq(roles.id, staffMembers.roleId))
    .where(eq(staffMembers.userId, peek.userId))
    .limit(1);
  return row && row.status !== "disabled" ? row : null;
}

/** Consumes the setup link, sets the password, verifies the email and starts an MFA-pending session. */
export async function completeStaffSetup(db: Db, rawToken: string, password: string, client: ClientInfo = {}) {
  if (client.ip) await enforce(db, "token-ip", client.ip, LIMITS.tokenIp);
  const peek = await peekToken(db, rawToken, "staff_invite");
  if (!peek) throw new AppError("NOT_FOUND", "This setup link is invalid or has expired. Ask the owner for a new one.");
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, peek.userId)).limit(1);
  const problem = passwordProblem(password, u?.email);
  if (problem) throw fieldError("password", problem);
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const used = await consumeToken(tx, rawToken, "staff_invite");
    if (!used) throw new AppError("NOT_FOUND", "This setup link is invalid or has expired. Ask the owner for a new one.");
    await tx.update(users).set({ passwordHash, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`, updatedAt: new Date() }).where(eq(users.id, used.userId));
    await revokeAllSessions(tx, used.userId, { kind: "staff" });
    await audit(tx, { actorUserId: used.userId, actorType: "staff", action: "staff.setup_completed", targetType: "user", targetId: used.userId, ip: client.ip, userAgent: client.userAgent });
    return createSession(tx, { userId: used.userId, kind: "staff", client });
  });
}

/* -------------------------------------------------------------------------- */
/*  Sign-in                                                                   */
/* -------------------------------------------------------------------------- */

export async function loginStaff(db: Db, input: { email: string; password: string }, client: ClientInfo = {}) {
  const email = emailSchema.safeParse(input.email);
  if (!email.success || !input.password) throw new AppError("UNAUTHENTICATED", LOGIN_FAILED);
  if (client.ip) await enforce(db, "login-ip", client.ip, LIMITS.loginIp);
  await enforce(db, "staff-login-email", email.data, LIMITS.loginEmail);
  const [u] = await db
    .select({ id: users.id, hash: users.passwordHash, status: users.status, verified: users.emailVerifiedAt, staffStatus: staffMembers.status })
    .from(users)
    .leftJoin(staffMembers, eq(staffMembers.userId, users.id))
    .where(sql`lower(${users.email}) = ${email.data}`)
    .limit(1);
  const ok = await verifyPassword(u?.hash, input.password);
  // Invited staff who already set a password may sign in to finish MFA enrollment.
  if (!u || !ok || u.status !== "active" || !u.verified || !u.staffStatus || u.staffStatus === "disabled") {
    if (u) await audit(db, { actorUserId: u.id, actorType: "staff", action: "auth.staff_login_failed", targetType: "user", targetId: u.id, ip: client.ip, userAgent: client.userAgent });
    throw new AppError("UNAUTHENTICATED", LOGIN_FAILED);
  }
  await clear(db, "staff-login-email", email.data);
  const session = await createSession(db, { userId: u.id, kind: "staff", client });
  await audit(db, { actorUserId: u.id, actorType: "staff", action: "auth.staff_password_ok", targetType: "session", targetId: session.id, ip: client.ip, userAgent: client.userAgent });
  return { ...session, userId: u.id, hasAuthenticator: await hasConfirmedFactor(db, u.id) };
}

/* -------------------------------------------------------------------------- */
/*  MFA                                                                       */
/* -------------------------------------------------------------------------- */

async function confirmedFactor(db: Db, userId: string) {
  const [f] = await db
    .select()
    .from(mfaFactors)
    .where(and(eq(mfaFactors.userId, userId), eq(mfaFactors.type, "totp"), isNotNull(mfaFactors.confirmedAt)))
    .limit(1);
  return f ?? null;
}

export const hasConfirmedFactor = async (db: Db, userId: string) => Boolean(await confirmedFactor(db, userId));

/**
 * Starts (or resumes) TOTP enrollment. The secret is generated and encrypted
 * server-side and shown only while the factor is unconfirmed.
 */
export async function beginMfaEnrollment(db: Db, session: ValidSession) {
  if (session.kind !== "staff") throw errors.forbidden();
  if (await confirmedFactor(db, session.userId)) throw errors.conflict("An authenticator is already set up.");
  let [pending] = await db.select().from(mfaFactors).where(and(eq(mfaFactors.userId, session.userId), isNull(mfaFactors.confirmedAt))).limit(1);
  if (!pending) [pending] = await db.insert(mfaFactors).values({ userId: session.userId, type: "totp", secretCiphertext: encrypt(newTotpSecret()) }).returning();
  const secret = decrypt(pending.secretCiphertext);
  const uri = totpUri(secret, session.user.email);
  return { secret, uri, qr: await totpQrDataUrl(uri) };
}

async function mfaLimits(db: Db, session: ValidSession) {
  await enforce(db, "mfa-session", session.id, LIMITS.mfaSession, "Too many codes tried. Wait a few minutes, then try again.");
  await enforce(db, "mfa-user", session.userId, LIMITS.mfaUser, "Too many codes tried. Wait a few minutes, then try again.");
}

async function storeRecoveryCodes(db: Pick<Db, "insert" | "delete">, userId: string) {
  const codes = newRecoveryCodes();
  await db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
  await db.insert(mfaRecoveryCodes).values(codes.map((c) => ({ userId, codeHash: hmac(normaliseRecoveryCode(c)) })));
  return codes;
}

/** Activates the authenticator after a correct code, issues recovery codes and completes MFA for this session. */
export async function confirmMfaEnrollment(db: Db, session: ValidSession, code: string, client: ClientInfo = {}) {
  if (session.kind !== "staff") throw errors.forbidden();
  await mfaLimits(db, session);
  const [pending] = await db.select().from(mfaFactors).where(and(eq(mfaFactors.userId, session.userId), isNull(mfaFactors.confirmedAt))).limit(1);
  if (!pending) throw errors.conflict("Start authenticator setup again.");
  const step = matchTotp(decrypt(pending.secretCiphertext), code);
  if (step === null) throw fieldError("code", "That code didn't match. Check the time on your phone and try the newest code.");
  const codes = await db.transaction(async (tx) => {
    await tx.update(mfaFactors).set({ confirmedAt: new Date(), lastUsedStep: step }).where(eq(mfaFactors.id, pending.id));
    await tx.update(users).set({ mfaEnabled: true, updatedAt: new Date() }).where(eq(users.id, session.userId));
    await tx.update(staffMembers).set({ status: "active", updatedAt: new Date() }).where(and(eq(staffMembers.userId, session.userId), eq(staffMembers.status, "invited")));
    const c = await storeRecoveryCodes(tx, session.userId);
    await audit(tx, { actorUserId: session.userId, actorType: "staff", action: "staff.mfa_enrolled", targetType: "user", targetId: session.userId, ip: client.ip, userAgent: client.userAgent });
    return c;
  });
  const rotated = await rotateSession(db, session, { mfaVerified: true, reauthenticated: true }, client);
  return { session: rotated, recoveryCodes: codes };
}

/** Second step of sign-in: a TOTP code (never reusable) or a single-use recovery code. */
export async function verifyMfa(db: Db, session: ValidSession, input: { code?: string; recoveryCode?: string }, client: ClientInfo = {}) {
  if (session.kind !== "staff") throw errors.forbidden();
  await mfaLimits(db, session);
  const factor = await confirmedFactor(db, session.userId);
  if (!factor) throw new AppError("MFA_REQUIRED", "Set up an authenticator first.");

  if (input.recoveryCode) {
    const [used] = await db
      .update(mfaRecoveryCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(mfaRecoveryCodes.userId, session.userId), eq(mfaRecoveryCodes.codeHash, hmac(normaliseRecoveryCode(input.recoveryCode))), isNull(mfaRecoveryCodes.usedAt)))
      .returning({ id: mfaRecoveryCodes.id });
    if (!used) throw fieldError("recoveryCode", "That recovery code isn't valid or was already used.");
    const [{ left }] = (await db.execute<{ left: number }>(sql`select count(*)::int as left from mfa_recovery_codes where user_id = ${session.userId} and used_at is null`)).rows;
    await audit(db, { actorUserId: session.userId, actorType: "staff", action: "staff.recovery_code_used", targetType: "user", targetId: session.userId, after: { remaining: left }, ip: client.ip, userAgent: client.userAgent });
    sendEmail(recoveryCodeUsedMessage(session.user.email, left)).catch((err) => logger().error({ err }, "recovery notice failed"));
    const rotated = await rotateSession(db, session, { mfaVerified: true, reauthenticated: true }, client);
    return { session: rotated, recoveryCodesLeft: left };
  }

  const step = matchTotp(decrypt(factor.secretCiphertext), input.code ?? "");
  // Atomic replay guard: the step must be newer than any code accepted before.
  const accepted =
    step !== null &&
    (
      await db
        .update(mfaFactors)
        .set({ lastUsedStep: step })
        .where(and(eq(mfaFactors.id, factor.id), or(isNull(mfaFactors.lastUsedStep), lt(mfaFactors.lastUsedStep, step))))
        .returning({ id: mfaFactors.id })
    ).length > 0;
  if (!accepted) {
    await audit(db, { actorUserId: session.userId, actorType: "staff", action: "staff.mfa_failed", targetType: "user", targetId: session.userId, ip: client.ip, userAgent: client.userAgent });
    throw fieldError("code", "That code didn't work. Wait for a new code and try again.");
  }
  await clear(db, "mfa-session", session.id);
  await audit(db, { actorUserId: session.userId, actorType: "staff", action: "staff.mfa_verified", targetType: "session", targetId: session.id, ip: client.ip, userAgent: client.userAgent });
  return { session: await rotateSession(db, session, { mfaVerified: true, reauthenticated: true }, client), recoveryCodesLeft: null };
}

/** Re-enter password (+ authenticator code for staff) before sensitive changes. */
export async function reauthenticate(db: Db, session: ValidSession, input: { password: string; code?: string }, client: ClientInfo = {}) {
  await enforce(db, "reauth-user", session.userId, LIMITS.reauthUser);
  const [u] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, session.userId)).limit(1);
  if (!(await verifyPassword(u?.hash, input.password))) throw fieldError("password", "Your password is incorrect.");
  if (session.kind === "staff") {
    const factor = await confirmedFactor(db, session.userId);
    const step = factor ? matchTotp(decrypt(factor.secretCiphertext), input.code ?? "") : null;
    const accepted =
      step !== null &&
      (await db
        .update(mfaFactors)
        .set({ lastUsedStep: step })
        .where(and(eq(mfaFactors.id, factor!.id), or(isNull(mfaFactors.lastUsedStep), lt(mfaFactors.lastUsedStep, step))))
        .returning({ id: mfaFactors.id })).length > 0;
    if (!accepted) throw fieldError("code", "That authenticator code didn't work.");
  }
  await markReauthenticated(db, session.id);
  await audit(db, { actorUserId: session.userId, actorType: session.kind === "staff" ? "staff" : "customer", action: "auth.reauthenticated", targetType: "session", targetId: session.id, ip: client.ip, userAgent: client.userAgent });
}

export function requireRecentReauth(session: ValidSession) {
  if (!recentlyReauthenticated(session)) throw new AppError("REAUTH_REQUIRED", "Confirm your password and authenticator code to continue.");
}

export async function regenerateRecoveryCodes(db: Db, session: ValidSession, client: ClientInfo = {}) {
  requireRecentReauth(session);
  const codes = await db.transaction(async (tx) => {
    const c = await storeRecoveryCodes(tx, session.userId);
    await audit(tx, { actorUserId: session.userId, actorType: "staff", action: "staff.recovery_codes_regenerated", targetType: "user", targetId: session.userId, ip: client.ip, userAgent: client.userAgent });
    return c;
  });
  return codes;
}

export async function recoveryCodesRemaining(db: Db, userId: string) {
  const [{ left }] = (await db.execute<{ left: number }>(sql`select count(*)::int as left from mfa_recovery_codes where user_id = ${userId} and used_at is null`)).rows;
  return left;
}

/* -------------------------------------------------------------------------- */
/*  Staff management (permission checks happen in the callers' guards too)    */
/* -------------------------------------------------------------------------- */

export async function listStaff(db: Db) {
  return db
    .select({ id: staffMembers.id, name: users.name, email: users.email, status: staffMembers.status, role: roles.key, roleName: roles.name, mfaEnabled: users.mfaEnabled })
    .from(staffMembers)
    .innerJoin(users, eq(users.id, staffMembers.userId))
    .innerJoin(roles, eq(roles.id, staffMembers.roleId))
    .orderBy(users.name);
}

/** Changes a staff member's role. Caller must hold manageStaff and have re-authenticated. The target is signed out. */
export async function changeStaffRole(db: Db, actor: { userId: string; session: ValidSession }, staffId: string, roleKey: string, client: ClientInfo = {}) {
  requireRecentReauth(actor.session);
  const role = await roleByKey(db, roleKey);
  if (!role) throw fieldError("role", "Choose a valid role.");
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(staffMembers).where(eq(staffMembers.id, staffId)).limit(1);
    if (!target) throw errors.notFound("That staff member");
    const [before] = await tx.select({ key: roles.key }).from(roles).where(eq(roles.id, target.roleId));
    await tx.update(staffMembers).set({ roleId: role.id, updatedAt: new Date() }).where(eq(staffMembers.id, staffId));
    await tx.execute(sql`set constraints staff_members_keep_owner immediate`);
    await revokeAllSessions(tx, target.userId, { kind: "staff" });
    await audit(tx, { actorUserId: actor.userId, actorType: "staff", action: "staff.role_changed", targetType: "staff_member", targetId: staffId, before: { role: before?.key }, after: { role: roleKey }, ip: client.ip, userAgent: client.userAgent });
    return { id: staffId, role: roleKey };
  });
}

export async function setStaffDisabled(db: Db, actor: { userId: string; session: ValidSession }, staffId: string, disabled: boolean, client: ClientInfo = {}) {
  requireRecentReauth(actor.session);
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(staffMembers).where(eq(staffMembers.id, staffId)).limit(1);
    if (!target) throw errors.notFound("That staff member");
    await tx
      .update(staffMembers)
      .set(disabled ? { status: "disabled", disabledAt: new Date(), disabledBy: actor.userId, updatedAt: new Date() } : { status: "active", disabledAt: null, disabledBy: null, updatedAt: new Date() })
      .where(eq(staffMembers.id, staffId));
    await tx.execute(sql`set constraints staff_members_keep_owner immediate`);
    await revokeAllSessions(tx, target.userId, { kind: "staff" });
    await audit(tx, { actorUserId: actor.userId, actorType: "staff", action: disabled ? "staff.disabled" : "staff.enabled", targetType: "staff_member", targetId: staffId, ip: client.ip, userAgent: client.userAgent });
    return { id: staffId, status: disabled ? "disabled" : "active" };
  });
}

/**
 * Removes a staff member's authenticator and recovery codes and signs them out;
 * they must enroll again at next sign-in. Used by an owner (with re-auth) or by
 * the operator CLI when the only owner has lost their device.
 */
export async function resetStaffMfa(db: Db, actor: { userId: string; session: ValidSession } | { system: string }, targetUserId: string) {
  if ("session" in actor) requireRecentReauth(actor.session);
  await db.transaction(async (tx) => {
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, targetUserId));
    await tx.delete(mfaFactors).where(eq(mfaFactors.userId, targetUserId));
    await tx.update(users).set({ mfaEnabled: false, updatedAt: new Date() }).where(eq(users.id, targetUserId));
    await revokeAllSessions(tx, targetUserId, { kind: "staff" });
    await audit(tx, { actorUserId: "session" in actor ? actor.userId : null, actorType: "session" in actor ? "staff" : "system", action: "staff.mfa_reset", targetType: "user", targetId: targetUserId, after: "system" in actor ? { via: actor.system } : null });
  });
}
