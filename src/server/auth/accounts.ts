import "server-only";
import { randomInt } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "../audit";
import type { Db } from "../db/client";
import { customerPreferences, customers, users } from "../db/schema";
import { emailConfigured, sendEmail } from "../email";
import { existingAccountMessage, passwordChangedMessage, resetPasswordMessage, verifyEmailMessage } from "../email/templates";
import { getEnv } from "../env";
import { AppError, errors } from "../errors";
import { logger } from "../log";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { clear, enforce, hit, LIMITS } from "./rate-limit";
import { type ClientInfo, createSession, rotateSession, revokeAllSessions, type ValidSession } from "./sessions";
import { consumeToken, issueToken, peekToken } from "./tokens";
import { attributeReferral, markReferralVerified } from "../referrals/referrals";

/**
 * Customer accounts. Responses never reveal whether an email is registered:
 * registration, resend and password-reset requests always answer the same way.
 * Creating an account enables nothing financial — no wallet, orders or payments.
 */

export const emailSchema = z.string().trim().toLowerCase().max(254).email("Enter a valid email address.");
const nameSchema = z.string().trim().min(2, "Enter your name.").max(80, "Use at most 80 characters.");

const fieldError = (field: string, message: string) => new AppError("VALIDATION_FAILED", message, { details: { field } });
const appUrl = (path: string) => `${getEnv().APP_URL}${path}`;
const LOGIN_FAILED = "Email or password is incorrect.";

function refCode(length: number) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");
}

async function safeSend(message: Parameters<typeof sendEmail>[0]) {
  try {
    await sendEmail(message);
  } catch (err) {
    // Never reveal delivery problems to the requester (enumeration); log for operators.
    logger().error({ err, kind: message.kind }, "email delivery failed");
  }
}

export async function registerCustomer(db: Db, input: { name: string; email: string; password: string; referral?: { code: string; via: "link" | "code" } }, client: ClientInfo = {}): Promise<{ status: "check_email" }> {
  if (!emailConfigured()) throw errors.unavailable("Sign-up isn't available right now.");
  const name = nameSchema.safeParse(input.name);
  if (!name.success) throw fieldError("name", name.error.issues[0].message);
  const email = emailSchema.safeParse(input.email);
  if (!email.success) throw fieldError("email", email.error.issues[0].message);
  const problem = passwordProblem(input.password, email.data);
  if (problem) throw fieldError("password", problem);

  await enforce(db, "register-global", "all", LIMITS.registerGlobal);
  if (client.ip) await enforce(db, "register-ip", client.ip, LIMITS.registerIp);

  const [existing] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email.data}`).limit(1);
  if (existing) {
    // Same answer as a new sign-up; tell the real owner by email instead.
    const r = await hit(db, "email-send", email.data, LIMITS.emailSend);
    if (r.ok) await safeSend(existingAccountMessage(email.data, appUrl("/login"), appUrl("/forgot-password")));
    return { status: "check_email" };
  }

  const passwordHash = await hashPassword(input.password);
  const [first, ...rest] = name.data.split(/\s+/);
  let token = "";
  let created: { userId: string; customerId: string } | null = null;
  try {
    token = await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ email: email.data, name: name.data, passwordHash }).returning({ id: users.id });
      const [customer] = await tx
        .insert(customers)
        .values({ userId: user.id, publicRef: `CUS-${refCode(8)}`, accountRef: `ACC-${refCode(6)}`, firstName: first, lastName: rest.join(" "), displayName: name.data })
        .returning({ id: customers.id });
      await tx.insert(customerPreferences).values({ customerId: customer.id });
      created = { userId: user.id, customerId: customer.id };
      await audit(tx, { actorUserId: user.id, actorType: "customer", action: "auth.registered", targetType: "user", targetId: user.id, ip: client.ip, userAgent: client.userAgent });
      return issueToken(tx, user.id, "verify_email");
    });
  } catch (e) {
    // A simultaneous registration with the same email: answer identically.
    if ((e as { cause?: { code?: string } })?.cause?.code === "23505" || (e as { code?: string })?.code === "23505") return { status: "check_email" };
    throw e;
  }
  if (created && input.referral?.code) {
    // Referral attribution (5G-B) never affects sign-up: a bad code or a failure is ignored.
    try {
      await attributeReferral(db, { ...(created as { userId: string; customerId: string }), email: email.data }, input.referral.code, input.referral.via, client);
    } catch (e) {
      logger().warn({ error: e instanceof Error ? e.name : "unknown" }, "referral attribution failed");
    }
  }
  await safeSend(verifyEmailMessage(email.data, name.data, appUrl(`/verify-email?token=${token}`)));
  return { status: "check_email" };
}

/** Confirms an email from a verification link. Idempotent for already-verified users. */
export async function verifyEmail(db: Db, rawToken: string, client: ClientInfo = {}): Promise<{ status: "verified" | "invalid" }> {
  if (client.ip) await enforce(db, "token-ip", client.ip, LIMITS.tokenIp);
  const used = await consumeToken(db, rawToken, "verify_email");
  if (!used) return { status: "invalid" };
  await db.update(users).set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`, updatedAt: new Date() }).where(eq(users.id, used.userId));
  await audit(db, { actorUserId: used.userId, actorType: "customer", action: "auth.email_verified", targetType: "user", targetId: used.userId, ip: client.ip, userAgent: client.userAgent });
  await markReferralVerified(db, used.userId).catch((e) => logger().warn({ error: e instanceof Error ? e.name : "unknown" }, "referral verification note failed"));
  return { status: "verified" };
}

export async function resendVerification(db: Db, rawEmail: string, client: ClientInfo = {}): Promise<{ status: "check_email" }> {
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) throw fieldError("email", email.error.issues[0].message);
  if (client.ip) await enforce(db, "reset-ip", client.ip, LIMITS.resetIp);
  const [u] = await db
    .select({ id: users.id, name: users.name, verified: users.emailVerifiedAt, customer: customers.id })
    .from(users)
    .leftJoin(customers, eq(customers.userId, users.id))
    .where(sql`lower(${users.email}) = ${email.data}`)
    .limit(1);
  if (u && !u.verified && u.customer) {
    if ((await hit(db, "email-send", email.data, LIMITS.emailSend)).ok) {
      const token = await issueToken(db, u.id, "verify_email");
      await safeSend(verifyEmailMessage(email.data, u.name || "there", appUrl(`/verify-email?token=${token}`)));
    }
  }
  return { status: "check_email" };
}

export async function loginCustomer(db: Db, input: { email: string; password: string }, client: ClientInfo = {}) {
  const email = emailSchema.safeParse(input.email);
  if (!email.success || !input.password) throw new AppError("UNAUTHENTICATED", LOGIN_FAILED);
  if (client.ip) await enforce(db, "login-ip", client.ip, LIMITS.loginIp);
  await enforce(db, "login-email", email.data, LIMITS.loginEmail);

  const [u] = await db
    .select({ id: users.id, name: users.name, hash: users.passwordHash, status: users.status, verified: users.emailVerifiedAt, customer: customers.id })
    .from(users)
    .leftJoin(customers, eq(customers.userId, users.id))
    .where(sql`lower(${users.email}) = ${email.data}`)
    .limit(1);
  const ok = await verifyPassword(u?.hash, input.password);
  if (!u || !ok || u.status !== "active" || !u.customer) {
    if (u) await audit(db, { actorUserId: u.id, actorType: "customer", action: "auth.login_failed", targetType: "user", targetId: u.id, ip: client.ip, userAgent: client.userAgent });
    throw new AppError("UNAUTHENTICATED", LOGIN_FAILED);
  }
  await clear(db, "login-email", email.data);
  if (!u.verified) {
    await resendVerification(db, email.data, client).catch(() => undefined);
    throw new AppError("EMAIL_UNVERIFIED", "Confirm your email first. We've sent you a new link.");
  }
  const session = await createSession(db, { userId: u.id, kind: "customer", client });
  await audit(db, { actorUserId: u.id, actorType: "customer", action: "auth.login", targetType: "session", targetId: session.id, ip: client.ip, userAgent: client.userAgent });
  return session;
}

export async function requestPasswordReset(db: Db, rawEmail: string, client: ClientInfo = {}): Promise<{ status: "check_email" }> {
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) throw fieldError("email", email.error.issues[0].message);
  if (client.ip) await enforce(db, "reset-ip", client.ip, LIMITS.resetIp);
  const [u] = await db.select({ id: users.id, status: users.status }).from(users).where(sql`lower(${users.email}) = ${email.data}`).limit(1);
  if (u && u.status === "active") {
    if ((await hit(db, "email-send", email.data, LIMITS.emailSend)).ok) {
      const token = await issueToken(db, u.id, "reset_password");
      await safeSend(resetPasswordMessage(email.data, appUrl(`/reset-password?token=${token}`)));
    }
  }
  return { status: "check_email" };
}

export const resetTokenValid = async (db: Db, rawToken: string) => Boolean(await peekToken(db, rawToken, "reset_password"));

/** Sets a new password from a reset link and signs the user out everywhere. */
export async function resetPassword(db: Db, rawToken: string, newPassword: string, client: ClientInfo = {}): Promise<{ status: "reset" | "invalid" }> {
  if (client.ip) await enforce(db, "token-ip", client.ip, LIMITS.tokenIp);
  const peek = await peekToken(db, rawToken, "reset_password");
  if (!peek) return { status: "invalid" };
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, peek.userId)).limit(1);
  const problem = passwordProblem(newPassword, u?.email);
  if (problem) throw fieldError("password", problem);
  const passwordHash = await hashPassword(newPassword);
  const done = await db.transaction(async (tx) => {
    const used = await consumeToken(tx, rawToken, "reset_password");
    if (!used) return false;
    // The link proves control of the inbox, so it also verifies the email.
    await tx.update(users).set({ passwordHash, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`, updatedAt: new Date() }).where(eq(users.id, used.userId));
    await revokeAllSessions(tx, used.userId);
    await audit(tx, { actorUserId: used.userId, actorType: "customer", action: "auth.password_reset", targetType: "user", targetId: used.userId, ip: client.ip, userAgent: client.userAgent });
    return true;
  });
  if (!done) return { status: "invalid" };
  if (u) await safeSend(passwordChangedMessage(u.email));
  return { status: "reset" };
}

/** Changes the password for a signed-in user, signing out every other session. */
export async function changePassword(db: Db, session: ValidSession, current: string, next: string, client: ClientInfo = {}) {
  await enforce(db, "reauth-user", session.userId, LIMITS.reauthUser);
  const [u] = await db.select({ hash: users.passwordHash, email: users.email }).from(users).where(eq(users.id, session.userId)).limit(1);
  if (!(await verifyPassword(u?.hash, current))) throw fieldError("currentPassword", "Your current password is incorrect.");
  const problem = passwordProblem(next, u?.email);
  if (problem) throw fieldError("newPassword", problem);
  if (await verifyPassword(u?.hash, next)) throw fieldError("newPassword", "Choose a password you haven't used here.");
  await db.update(users).set({ passwordHash: await hashPassword(next), updatedAt: new Date() }).where(eq(users.id, session.userId));
  await revokeAllSessions(db, session.userId, { except: session.id });
  const rotated = await rotateSession(db, session, { reauthenticated: true }, client);
  await audit(db, { actorUserId: session.userId, actorType: session.kind === "staff" ? "staff" : "customer", action: "auth.password_changed", targetType: "user", targetId: session.userId, ip: client.ip, userAgent: client.userAgent });
  if (u) await safeSend(passwordChangedMessage(u.email));
  return rotated;
}
