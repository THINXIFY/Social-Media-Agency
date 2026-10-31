import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Executor } from "../db/client";
import { authTokens } from "../db/schema";
import type { AUTH_TOKEN_PURPOSE } from "../db/schema/enums";
import { randomToken, sha256 } from "./crypto";

/**
 * Single-use, expiring email tokens (verification, password reset, staff
 * setup). Only the SHA-256 of a token is stored; issuing a new token of the
 * same purpose invalidates older unused ones.
 */

export type TokenPurpose = (typeof AUTH_TOKEN_PURPOSE)[number];

export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  verify_email: 24 * 3_600_000,
  reset_password: 60 * 60_000,
  staff_invite: 72 * 3_600_000,
};

export async function issueToken(db: Executor, userId: string, purpose: TokenPurpose, ttlMs = TOKEN_TTL_MS[purpose]): Promise<string> {
  await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)));
  const raw = randomToken();
  await db.insert(authTokens).values({ userId, purpose, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + ttlMs) });
  return raw;
}

const usable = (raw: string, purpose: TokenPurpose) => and(eq(authTokens.tokenHash, sha256(raw)), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date()));

/** Checks a token without using it (to render a page). */
export async function peekToken(db: Executor, raw: string, purpose: TokenPurpose): Promise<{ userId: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(raw)) return null;
  const [row] = await db.select({ userId: authTokens.userId }).from(authTokens).where(usable(raw, purpose)).limit(1);
  return row ?? null;
}

/** Atomically marks a token used. Returns null when it's unknown, used, expired or for another purpose. */
export async function consumeToken(db: Executor, raw: string, purpose: TokenPurpose): Promise<{ userId: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(raw)) return null;
  const [row] = await db.update(authTokens).set({ usedAt: new Date() }).where(usable(raw, purpose)).returning({ userId: authTokens.userId });
  return row ?? null;
}
