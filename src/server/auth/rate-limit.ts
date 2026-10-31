import "server-only";
import { eq, lt, sql } from "drizzle-orm";
import type { Executor } from "../db/client";
import { rateLimitBuckets } from "../db/schema";
import { AppError } from "../errors";
import { hmac } from "./crypto";

/**
 * Fixed-window rate limits stored in PostgreSQL, so they hold across server
 * instances. Subjects (emails, IPs, user ids) are HMAC'd before storage.
 */

export interface Limit {
  limit: number;
  windowSeconds: number;
}

export const LIMITS = {
  loginEmail: { limit: 5, windowSeconds: 15 * 60 },
  loginIp: { limit: 30, windowSeconds: 10 * 60 },
  registerIp: { limit: 10, windowSeconds: 60 * 60 },
  registerGlobal: { limit: 300, windowSeconds: 10 * 60 },
  emailSend: { limit: 3, windowSeconds: 60 * 60 },
  resetIp: { limit: 10, windowSeconds: 60 * 60 },
  mfaSession: { limit: 5, windowSeconds: 5 * 60 },
  mfaUser: { limit: 10, windowSeconds: 15 * 60 },
  reauthUser: { limit: 5, windowSeconds: 15 * 60 },
  tokenIp: { limit: 30, windowSeconds: 10 * 60 },
} as const satisfies Record<string, Limit>;

const keyOf = (scope: string, subject: string) => `${scope}:${hmac(subject.trim().toLowerCase())}`;

/** Counts one attempt. Returns whether it's within the limit and how long to wait otherwise. */
export async function hit(db: Executor, scope: string, subject: string, { limit, windowSeconds }: Limit): Promise<{ ok: boolean; retryAfter: number }> {
  const now = Date.now();
  const start = Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000;
  const [row] = await db
    .insert(rateLimitBuckets)
    .values({ key: keyOf(scope, subject), windowStart: new Date(start), count: 1 })
    .onConflictDoUpdate({ target: [rateLimitBuckets.key, rateLimitBuckets.windowStart], set: { count: sql`${rateLimitBuckets.count} + 1` } })
    .returning({ count: rateLimitBuckets.count });
  if (Math.random() < 0.02) await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.windowStart, new Date(now - 2 * 86_400_000)));
  return { ok: row.count <= limit, retryAfter: Math.ceil((start + windowSeconds * 1000 - now) / 1000) };
}

/** Throws RATE_LIMITED when over the limit. */
export async function enforce(db: Executor, scope: string, subject: string, limit: Limit, message = "Too many attempts. Please wait a few minutes and try again.") {
  const r = await hit(db, scope, subject, limit);
  if (!r.ok) throw new AppError("RATE_LIMITED", message, { details: { retryAfter: r.retryAfter } });
}

/** Clears a subject's counters for a scope (e.g. after a successful sign-in). */
export async function clear(db: Executor, scope: string, subject: string) {
  await db.delete(rateLimitBuckets).where(eq(rateLimitBuckets.key, keyOf(scope, subject)));
}
