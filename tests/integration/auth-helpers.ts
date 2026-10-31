import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { encrypt } from "@/server/auth/crypto";
import { hashPassword } from "@/server/auth/password";
import { roleByKey } from "@/server/auth/roles";
import { createSession } from "@/server/auth/sessions";
import { newTotpSecret } from "@/server/auth/totp";
import type { Db } from "@/server/db/client";
import { customers, mfaFactors, staffMembers, users } from "@/server/db/schema";
import { capturedEmails } from "@/server/email";
import { resetEnvCache } from "@/server/env";
import { inject } from "vitest";

/**
 * Test doubles for the browser: a cookie jar that `next/headers` reads from
 * (each test file mocks next/headers with `jarMock`), plus factories that build
 * real users, staff and sessions in PostgreSQL.
 */
export const jar = new Map<string, string>();
export let requestHeaders = new Headers({ "user-agent": "vitest" });
export const setRequestHeaders = (h: Record<string, string>) => (requestHeaders = new Headers({ "user-agent": "vitest", ...h }));

export const jarMock = () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => requestHeaders,
});

export const signInAs = (kind: "customer" | "staff", token: string) => {
  jar.clear();
  jar.set(kind === "customer" ? "sv_session" : "sv_staff", token);
};

export const uniqueEmail = (tag = "u") => `${tag}-${randomUUID().slice(0, 8)}@example.test`;
export const PASSWORD = "violet-graphite-lime-2026";

export async function makeCustomer(db: Db, opts: { verified?: boolean } = {}) {
  const email = uniqueEmail("cust");
  const [u] = await db.insert(users).values({ email, name: "Test Customer", passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: opts.verified === false ? null : new Date() }).returning();
  const ref = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  const [c] = await db.insert(customers).values({ userId: u.id, publicRef: `CUS-${ref}`, accountRef: `ACC-${ref}`, firstName: "Test", lastName: "Customer" }).returning();
  const session = await createSession(db, { userId: u.id, kind: "customer" });
  return { user: u, customer: c, email, token: session.token, sessionId: session.id };
}

/** A staff member with a password and (optionally) a confirmed authenticator and an MFA-verified session. */
export async function makeStaff(db: Db, role: string, opts: { mfa?: boolean; status?: "active" | "invited" | "disabled" } = {}) {
  const email = uniqueEmail(`staff-${role}`);
  const mfa = opts.mfa ?? true;
  const [u] = await db.insert(users).values({ email, name: `Test ${role}`, passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date(), mfaEnabled: mfa }).returning();
  const r = (await roleByKey(db, role))!;
  const status = opts.status ?? "active";
  const [s] = await db.insert(staffMembers).values({ userId: u.id, roleId: r.id, status, disabledAt: status === "disabled" ? new Date() : null }).returning();
  const secret = newTotpSecret();
  if (mfa) await db.insert(mfaFactors).values({ userId: u.id, type: "totp", secretCiphertext: encrypt(secret), confirmedAt: new Date() });
  const session = await createSession(db, { userId: u.id, kind: "staff", mfaVerified: mfa });
  return { user: u, staffId: s.id, email, secret, token: session.token, sessionId: session.id };
}

export const tokenFrom = (text: string) => text.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? null;
export const lastEmailTo = (to: string) => capturedEmails().find((m) => m.to === to.toLowerCase()) ?? null;

export async function userByEmail(db: Db, email: string) {
  const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  return u ?? null;
}

/** Points request-scoped code (getDb(), guards) at the migrated test database. */
export function bindRequestDb() {
  process.env.DATABASE_URL = inject("databaseUrl");
  resetEnvCache();
}
