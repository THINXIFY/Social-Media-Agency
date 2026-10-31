import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { changePassword, loginCustomer, registerCustomer, requestPasswordReset, resendVerification, resetPassword, verifyEmail } from "@/server/auth/accounts";
import { revokeAllSessions, revokeSession, SESSION_POLICY, validateSession } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { authTokens, customers, deposits, ledgerAccounts, orders, sessions, users } from "@/server/db/schema";
import { capturedEmails } from "@/server/email";
import { AppError } from "@/server/errors";
import { lastEmailTo, makeCustomer, PASSWORD, tokenFrom, uniqueEmail, userByEmail } from "./auth-helpers";
import { ensureReferenceData, testDb } from "./helpers";

let db: Db;
beforeAll(async () => {
  db = testDb();
  await ensureReferenceData(db);
});
afterAll(() => db.$client.end());

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "resolved";
  } catch (e) {
    return e instanceof AppError ? `${e.code}${e.details?.field ? `:${e.details.field}` : ""}` : `other:${String(e)}`;
  }
};

describe("registration and email verification", () => {
  it("creates an unverified customer, emails a single-use link, and verifies it", async () => {
    const email = uniqueEmail("reg");
    expect(await registerCustomer(db, { name: "Ada Lovelace", email: email.toUpperCase(), password: PASSWORD })).toEqual({ status: "check_email" });
    const u = await userByEmail(db, email);
    expect(u?.emailVerifiedAt).toBeNull();
    expect(u?.passwordHash).toMatch(/^\$argon2id\$/);
    const [c] = await db.select().from(customers).where(eq(customers.userId, u!.id));
    expect(c.firstName).toBe("Ada");
    expect(c.publicRef).toMatch(/^CUS-[A-Z0-9]{8}$/);

    const mail = lastEmailTo(email)!;
    expect(mail.kind).toBe("verify_email");
    const token = tokenFrom(mail.text)!;
    const [stored] = await db.select().from(authTokens).where(eq(authTokens.userId, u!.id));
    expect(stored.tokenHash).not.toContain(token); // only the hash is stored

    // Signing in unverified is refused and sends a fresh link, which replaces the first one.
    expect(await code(loginCustomer(db, { email, password: PASSWORD }))).toBe("EMAIL_UNVERIFIED");
    const fresh = tokenFrom(lastEmailTo(email)!.text)!;
    expect(fresh).not.toBe(token);
    expect(await verifyEmail(db, token)).toEqual({ status: "invalid" });
    expect(await verifyEmail(db, fresh)).toEqual({ status: "verified" });
    expect(await verifyEmail(db, fresh)).toEqual({ status: "invalid" }); // single use
    expect((await userByEmail(db, email))?.emailVerifiedAt).toBeInstanceOf(Date);
    const s = await loginCustomer(db, { email, password: PASSWORD });
    expect((await validateSession(db, s.token, "customer"))?.userId).toBe(u!.id);
  });

  it("an account enables nothing financial: an empty wallet, no orders or deposits", async () => {
    const email = uniqueEmail("nofin");
    await registerCustomer(db, { name: "No Money", email, password: PASSWORD });
    const u = (await userByEmail(db, email))!;
    const [c] = await db.select().from(customers).where(eq(customers.userId, u.id));
    // Phase 5C: every customer gets exactly one USD wallet, opened at zero with no entries.
    const wallets = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.customerId, c.id));
    expect(wallets).toHaveLength(1);
    const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from journal_lines where account_id = ${wallets[0].id}`)).rows;
    expect(n).toBe(0);
    expect(await db.select().from(orders).where(eq(orders.customerId, c.id))).toHaveLength(0);
    expect(await db.select().from(deposits).where(eq(deposits.customerId, c.id))).toHaveLength(0);
  });

  it("duplicate sign-ups get the same answer, create nothing and alert the real owner", async () => {
    const email = uniqueEmail("dup");
    await registerCustomer(db, { name: "First", email, password: PASSWORD });
    const before = capturedEmails().length;
    expect(await registerCustomer(db, { name: "Second", email: email.toUpperCase(), password: "another-strong-pass" })).toEqual({ status: "check_email" });
    const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from users where lower(email) = ${email}`)).rows;
    expect(n).toBe(1);
    expect(capturedEmails().length).toBe(before + 1);
    expect(lastEmailTo(email)?.kind).toBe("existing_account");
  });

  it("validates input with field-level messages", async () => {
    expect(await code(registerCustomer(db, { name: "A", email: uniqueEmail(), password: PASSWORD }))).toBe("VALIDATION_FAILED:name");
    expect(await code(registerCustomer(db, { name: "Ada", email: "not-an-email", password: PASSWORD }))).toBe("VALIDATION_FAILED:email");
    expect(await code(registerCustomer(db, { name: "Ada", email: uniqueEmail(), password: "short" }))).toBe("VALIDATION_FAILED:password");
  });

  it("resend never reveals whether an email exists", async () => {
    const before = capturedEmails().length;
    expect(await resendVerification(db, uniqueEmail("ghost"))).toEqual({ status: "check_email" });
    expect(capturedEmails().length).toBe(before);
  });
});

describe("sign-in", () => {
  it("rejects wrong passwords and unknown emails with the same message", async () => {
    const c = await makeCustomer(db);
    const a = await loginCustomer(db, { email: c.email, password: "wrong-password-1" }).catch((e: AppError) => e);
    const b = await loginCustomer(db, { email: uniqueEmail("nobody"), password: "wrong-password-1" }).catch((e: AppError) => e);
    expect(a).toBeInstanceOf(AppError);
    expect((a as AppError).publicMessage).toBe((b as AppError).publicMessage);
    expect((a as AppError).code).toBe("UNAUTHENTICATED");
  });

  it("rate-limits repeated attempts per email", async () => {
    const c = await makeCustomer(db);
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await code(loginCustomer(db, { email: c.email, password: `wrong-password-${i}` })));
    expect(results.slice(0, 5).every((r) => r === "UNAUTHENTICATED")).toBe(true);
    expect(results[5]).toBe("RATE_LIMITED");
    // Even the right password is refused while limited.
    expect(await code(loginCustomer(db, { email: c.email, password: PASSWORD }))).toBe("RATE_LIMITED");
  });

  it("disabled accounts can't sign in", async () => {
    const c = await makeCustomer(db);
    await db.update(users).set({ status: "disabled" }).where(eq(users.id, c.user.id));
    expect(await code(loginCustomer(db, { email: c.email, password: PASSWORD }))).toBe("UNAUTHENTICATED");
    expect(await validateSession(db, c.token, "customer")).toBeNull(); // existing session dies too
  });
});

describe("sessions", () => {
  it("expire when idle or past their absolute lifetime, and are deleted", async () => {
    const idle = await makeCustomer(db);
    await db.update(sessions).set({ lastSeenAt: new Date(Date.now() - SESSION_POLICY.customer.idleMs - 1000) }).where(eq(sessions.id, idle.sessionId));
    expect(await validateSession(db, idle.token, "customer")).toBeNull();
    expect(await db.select().from(sessions).where(eq(sessions.id, idle.sessionId))).toHaveLength(0);

    const old = await makeCustomer(db);
    await db.update(sessions).set({ createdAt: new Date(Date.now() - SESSION_POLICY.customer.absoluteMs - 1000) }).where(eq(sessions.id, old.sessionId));
    expect(await validateSession(db, old.token, "customer")).toBeNull();
  });

  it("a customer token can't be used as a staff session", async () => {
    const c = await makeCustomer(db);
    expect(await validateSession(db, c.token, "staff")).toBeNull();
    expect(await validateSession(db, "garbage", "customer")).toBeNull();
  });

  it("revocation is immediate; one user can't revoke another's session", async () => {
    const a = await makeCustomer(db);
    const b = await makeCustomer(db);
    expect(await revokeSession(db, b.sessionId, a.user.id)).toBe(false);
    expect(await validateSession(db, b.token, "customer")).not.toBeNull();
    expect(await revokeSession(db, a.sessionId, a.user.id)).toBe(true);
    expect(await validateSession(db, a.token, "customer")).toBeNull();
  });

  it("sign out of all devices", async () => {
    const c = await makeCustomer(db);
    const second = await loginCustomer(db, { email: c.email, password: PASSWORD });
    expect(await revokeAllSessions(db, c.user.id)).toBe(2);
    expect(await validateSession(db, c.token, "customer")).toBeNull();
    expect(await validateSession(db, second.token, "customer")).toBeNull();
  });
});

describe("password recovery", () => {
  it("resets with a single-use link and signs out every device", async () => {
    const c = await makeCustomer(db);
    expect(await requestPasswordReset(db, c.email)).toEqual({ status: "check_email" });
    const token = tokenFrom(lastEmailTo(c.email)!.text)!;
    expect(await code(resetPassword(db, token, "short"))).toBe("VALIDATION_FAILED:password");
    expect(await resetPassword(db, token, "a-brand-new-password")).toEqual({ status: "reset" });
    expect(await validateSession(db, c.token, "customer")).toBeNull();
    expect(await resetPassword(db, token, "yet-another-password")).toEqual({ status: "invalid" });
    expect(await code(loginCustomer(db, { email: c.email, password: PASSWORD }))).toBe("UNAUTHENTICATED");
    expect((await loginCustomer(db, { email: c.email, password: "a-brand-new-password" })).token).toBeTruthy();
    expect(lastEmailTo(c.email)?.kind).toBe("password_changed");
  });

  it("expired links don't work", async () => {
    const c = await makeCustomer(db);
    await requestPasswordReset(db, c.email);
    const token = tokenFrom(lastEmailTo(c.email)!.text)!;
    await db.update(authTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authTokens.userId, c.user.id));
    expect(await resetPassword(db, token, "a-brand-new-password")).toEqual({ status: "invalid" });
  });

  it("unknown emails get the same answer and no email", async () => {
    const before = capturedEmails().length;
    expect(await requestPasswordReset(db, uniqueEmail("ghost"))).toEqual({ status: "check_email" });
    expect(capturedEmails().length).toBe(before);
  });

  it("a newer link invalidates the older one", async () => {
    const c = await makeCustomer(db);
    await requestPasswordReset(db, c.email);
    const first = tokenFrom(lastEmailTo(c.email)!.text)!;
    await requestPasswordReset(db, c.email);
    const second = tokenFrom(lastEmailTo(c.email)!.text)!;
    expect(await resetPassword(db, first, "a-brand-new-password")).toEqual({ status: "invalid" });
    expect(await resetPassword(db, second, "a-brand-new-password")).toEqual({ status: "reset" });
  });

  it("changing the password keeps this device and signs out the others", async () => {
    const c = await makeCustomer(db);
    const other = await loginCustomer(db, { email: c.email, password: PASSWORD });
    const current = (await validateSession(db, c.token, "customer"))!;
    expect(await code(changePassword(db, current, "wrong-current-pass", "a-brand-new-password"))).toBe("VALIDATION_FAILED:currentPassword");
    const rotated = await changePassword(db, current, PASSWORD, "a-brand-new-password");
    expect(await validateSession(db, other.token, "customer")).toBeNull();
    expect(await validateSession(db, c.token, "customer")).toBeNull(); // rotated
    expect(await validateSession(db, rotated.token, "customer")).not.toBeNull();
  });
});

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
