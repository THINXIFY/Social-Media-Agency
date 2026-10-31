import "server-only";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { Db, Executor } from "../db/client";
import { sessions, users } from "../db/schema";
import { getEnv } from "../env";
import { randomToken, sha256 } from "./crypto";

/**
 * Database-backed sessions (DATABASE.md §2, SECURITY.md §3).
 *  - The cookie holds a random 256-bit token; the database stores its SHA-256.
 *  - Customer and staff sessions are separate cookies and separate rows.
 *  - Idle and absolute lifetimes are enforced on every read; expired rows are deleted.
 *  - Deleting rows revokes access immediately (nothing is cached).
 */

export type SessionKind = "customer" | "staff";

export const SESSION_POLICY: Record<SessionKind, { absoluteMs: number; idleMs: number }> = {
  customer: { absoluteMs: 30 * 86_400_000, idleMs: 7 * 86_400_000 },
  staff: { absoluteMs: 12 * 3_600_000, idleMs: 30 * 60_000 },
};

/** Sensitive actions need credentials re-entered within this window. */
export const REAUTH_WINDOW_MS = 10 * 60_000;
const TOUCH_EVERY_MS = 60_000;

export function secureCookies() {
  const env = getEnv();
  return env.APP_ENV === "production" || env.APP_ENV === "preview" || env.APP_URL.startsWith("https://");
}

/** `__Host-` cookies are bound to the exact origin (Secure, Path=/, no Domain). Plain names on http://localhost. */
export function cookieName(kind: SessionKind) {
  const base = kind === "customer" ? "sv_session" : "sv_staff";
  return secureCookies() ? `__Host-${base}` : base;
}

export const ALL_COOKIE_NAMES: Record<SessionKind, string[]> = { customer: ["sv_session", "__Host-sv_session"], staff: ["sv_staff", "__Host-sv_staff"] };

export function cookieOptions(expires: Date) {
  return { httpOnly: true, secure: secureCookies(), sameSite: "lax" as const, path: "/", expires };
}

export interface ValidSession {
  id: string;
  kind: SessionKind;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  mfaVerifiedAt: Date | null;
  reauthenticatedAt: Date | null;
  user: { id: string; email: string; name: string; status: string; emailVerifiedAt: Date | null; mfaEnabled: boolean };
}

export interface ClientInfo {
  ip?: string | null;
  userAgent?: string | null;
}

export async function createSession(db: Executor, input: { userId: string; kind: SessionKind; client?: ClientInfo; mfaVerified?: boolean; createdAt?: Date; expiresAt?: Date; reauthenticated?: boolean }) {
  const token = randomToken();
  const now = new Date();
  const createdAt = input.createdAt ?? now;
  const expiresAt = input.expiresAt ?? new Date(createdAt.getTime() + SESSION_POLICY[input.kind].absoluteMs);
  const [row] = await db
    .insert(sessions)
    .values({
      userId: input.userId,
      kind: input.kind,
      tokenHash: sha256(token),
      createdAt,
      lastSeenAt: now,
      expiresAt,
      mfaVerifiedAt: input.mfaVerified ? now : null,
      reauthenticatedAt: input.reauthenticated ? now : null,
      ip: input.client?.ip?.slice(0, 64) ?? null,
      userAgent: input.client?.userAgent?.slice(0, 300) ?? null,
    })
    .returning({ id: sessions.id, expiresAt: sessions.expiresAt });
  return { token, id: row.id, expiresAt: row.expiresAt };
}

/** Looks up a session by its cookie token and enforces kind, user status and lifetimes. */
export async function validateSession(db: Db, token: string | null | undefined, kind: SessionKind): Promise<ValidSession | null> {
  if (!token || !/^[A-Za-z0-9_-]{30,100}$/.test(token)) return null;
  const [row] = await db
    .select({
      id: sessions.id,
      kind: sessions.kind,
      userId: sessions.userId,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      mfaVerifiedAt: sessions.mfaVerifiedAt,
      reauthenticatedAt: sessions.reauthenticatedAt,
      user: { id: users.id, email: users.email, name: users.name, status: users.status, emailVerifiedAt: users.emailVerifiedAt, mfaEnabled: users.mfaEnabled },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, sha256(token)))
    .limit(1);
  if (!row || row.kind !== kind) return null;
  const now = Date.now();
  const policy = SESSION_POLICY[kind];
  const expired = now >= row.expiresAt.getTime() || now >= row.createdAt.getTime() + policy.absoluteMs || now >= row.lastSeenAt.getTime() + policy.idleMs;
  if (expired || row.user.status !== "active") {
    await db.delete(sessions).where(eq(sessions.id, row.id));
    return null;
  }
  if (now - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.id));
  return { ...row, kind } as ValidSession;
}

/**
 * Replaces a session with a fresh token after a privilege change (MFA
 * completed, password changed). Keeps the original absolute lifetime.
 */
export async function rotateSession(db: Db, current: ValidSession, patch: { mfaVerified?: boolean; reauthenticated?: boolean }, client?: ClientInfo) {
  return db.transaction(async (tx) => {
    await tx.delete(sessions).where(eq(sessions.id, current.id));
    const next = await createSession(tx, { userId: current.userId, kind: current.kind, client, createdAt: current.createdAt, expiresAt: current.expiresAt, mfaVerified: patch.mfaVerified ?? Boolean(current.mfaVerifiedAt), reauthenticated: patch.reauthenticated });
    if (!patch.mfaVerified && current.mfaVerifiedAt) await tx.update(sessions).set({ mfaVerifiedAt: current.mfaVerifiedAt }).where(eq(sessions.id, next.id));
    return next;
  });
}

export async function markReauthenticated(db: Executor, sessionId: string) {
  await db.update(sessions).set({ reauthenticatedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export const recentlyReauthenticated = (s: Pick<ValidSession, "reauthenticatedAt">) => Boolean(s.reauthenticatedAt && Date.now() - s.reauthenticatedAt.getTime() < REAUTH_WINDOW_MS);

/** Revokes one session, but only if it belongs to the given user (prevents revoking someone else's by id). */
export async function revokeSession(db: Executor, sessionId: string, userId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return false;
  const rows = await db.delete(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId))).returning({ id: sessions.id });
  return rows.length > 0;
}

/** Revokes every session of a user, optionally keeping one (the current device). */
export async function revokeAllSessions(db: Executor, userId: string, options: { kind?: SessionKind; except?: string } = {}) {
  const conds = [eq(sessions.userId, userId)];
  if (options.kind) conds.push(eq(sessions.kind, options.kind));
  if (options.except) conds.push(ne(sessions.id, options.except));
  const rows = await db.delete(sessions).where(and(...conds)).returning({ id: sessions.id });
  return rows.length;
}

export async function listSessions(db: Executor, userId: string, kind: SessionKind) {
  return db
    .select({ id: sessions.id, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, userAgent: sessions.userAgent, ip: sessions.ip })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.kind, kind), sql`${sessions.expiresAt} > now()`))
    .orderBy(desc(sessions.lastSeenAt));
}
