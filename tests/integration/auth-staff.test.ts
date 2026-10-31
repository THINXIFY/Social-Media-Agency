import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getStaffSession, requireStaffSession } from "@/server/auth";
import { hashPassword } from "@/server/auth/password";
import { validateSession } from "@/server/auth/sessions";
import {
  beginMfaEnrollment,
  bootstrapOwner,
  changeStaffRole,
  completeStaffSetup,
  confirmMfaEnrollment,
  loginStaff,
  reauthenticate,
  resetStaffMfa,
  verifyMfa,
} from "@/server/auth/staff";
import { currentTotp, TOTP_PERIOD } from "@/server/auth/totp";
import type { Db } from "@/server/db/client";
import { mfaFactors, mfaRecoveryCodes, platformSettings, roles, staffMembers, users } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { bindRequestDb, jarMock, lastEmailTo, makeStaff, PASSWORD, signInAs, tokenFrom, uniqueEmail, userByEmail } from "./auth-helpers";
import { ensureReferenceData, testDb } from "./helpers";

vi.mock("next/headers", async () => (await import("./auth-helpers")).jarMock());
void jarMock;

let db: Db;
beforeAll(async () => {
  bindRequestDb();
  db = testDb();
  await ensureReferenceData(db);
});
afterAll(() => db.$client.end());

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "resolved";
  } catch (e) {
    return e instanceof AppError ? `${e.code}${e.details?.field ? `:${e.details.field}` : ""}` : `other:${String((e as Error)?.message ?? e)}`;
  }
};
const codeAt = (secret: string, stepsAhead: number) => currentTotp(secret, Date.now() + stepsAhead * TOTP_PERIOD * 1000);
const ownerRoleId = async () => (await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "owner")))[0].id;

describe("owner bootstrap → setup → mandatory MFA", () => {
  // The bootstrap is global (one owner per platform), so this suite runs it once, in order.
  const ownerEmail = uniqueEmail("owner");
  let setupToken = "";
  let staffToken = "";

  it("creates an invited owner with no password and emails a setup link", async () => {
    // Other test files may have created owners directly; start from a clean slate for this check.
    const owner = await ownerRoleId();
    const existing = await db.select().from(staffMembers).where(eq(staffMembers.roleId, owner));
    if (existing.length) await db.execute(sql`set session_replication_role = replica`).then(() => db.delete(staffMembers).where(eq(staffMembers.roleId, owner))).finally(() => db.execute(sql`set session_replication_role = origin`));
    await db.delete(platformSettings).where(eq(platformSettings.key, "auth.owner_bootstrap"));

    const r = await bootstrapOwner(db, { email: ownerEmail, name: "Farhan Z." });
    expect(r.status).toBe("invited");
    expect(r.sentTo).toMatch(/^o\*\*\*@example\.test$/);
    const u = (await userByEmail(db, ownerEmail))!;
    expect(u.passwordHash).toBeNull();
    expect(u.name).toBe("Farhan Z.");
    const [s] = await db.select().from(staffMembers).where(eq(staffMembers.userId, u.id));
    expect(s.status).toBe("invited");
    const mail = lastEmailTo(ownerEmail)!;
    expect(mail.kind).toBe("staff_setup");
    setupToken = tokenFrom(mail.text)!;
    expect(mail.text).toContain("/admin/setup?token=");
  });

  it("refuses to run a second time — even concurrently or with another email", async () => {
    expect(await code(bootstrapOwner(db, { email: uniqueEmail("owner2"), name: "Intruder" }))).toBe("CONFLICT");
    const results = await Promise.all([1, 2, 3].map(() => code(bootstrapOwner(db, { email: uniqueEmail("race"), name: "Race" }))));
    expect(results.every((r) => r === "CONFLICT")).toBe(true);
    const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from staff_members s join roles r on r.id = s.role_id where r.key = 'owner'`)).rows;
    expect(n).toBe(1);
  });

  it("can re-send the link only while setup is unfinished; the old link stops working", async () => {
    const r = await bootstrapOwner(db, { email: ownerEmail, name: "Farhan Z." }, { resend: true });
    expect(r.status).toBe("reissued");
    const fresh = tokenFrom(lastEmailTo(ownerEmail)!.text)!;
    expect(await code(completeStaffSetup(db, setupToken, PASSWORD))).toBe("NOT_FOUND");
    setupToken = fresh;
  });

  it("setup sets the password and verifies the email, but grants no admin access before MFA", async () => {
    expect(await code(completeStaffSetup(db, setupToken, "short"))).toBe("VALIDATION_FAILED:password");
    const s = await completeStaffSetup(db, setupToken, PASSWORD);
    staffToken = s.token;
    expect(await code(completeStaffSetup(db, setupToken, PASSWORD))).toBe("NOT_FOUND"); // single use
    const u = (await userByEmail(db, ownerEmail))!;
    expect(u.emailVerifiedAt).toBeInstanceOf(Date);
    signInAs("staff", staffToken);
    const ctx = (await getStaffSession())!;
    expect(ctx.mfaComplete).toBe(false);
    expect(ctx.access).toBeNull();
    expect(await code(requireStaffSession())).toBe("MFA_REQUIRED");
  });

  it("enrollment: secret encrypted at rest, wrong codes rejected, correct code activates owner + 10 hashed recovery codes", async () => {
    const session = (await validateSession(db, staffToken, "staff"))!;
    const { secret, uri, qr } = await beginMfaEnrollment(db, session);
    expect(uri).toContain("otpauth://totp/");
    expect(qr.startsWith("data:image/png;base64,")).toBe(true);
    const [f] = await db.select().from(mfaFactors).where(eq(mfaFactors.userId, session.userId));
    expect(f.secretCiphertext).not.toContain(secret);
    expect(f.confirmedAt).toBeNull();
    // Resuming enrollment shows the same pending secret.
    expect((await beginMfaEnrollment(db, session)).secret).toBe(secret);

    expect(await code(confirmMfaEnrollment(db, session, "000000"))).toBe("VALIDATION_FAILED:code");
    const r = await confirmMfaEnrollment(db, session, currentTotp(secret));
    expect(r.recoveryCodes).toHaveLength(10);
    const stored = await db.select().from(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, session.userId));
    expect(stored).toHaveLength(10);
    for (const c of r.recoveryCodes) expect(stored.some((s) => s.codeHash.includes(c.replace("-", "")))).toBe(false);
    const [s] = await db.select().from(staffMembers).where(eq(staffMembers.userId, session.userId));
    expect(s.status).toBe("active");
    expect(await validateSession(db, staffToken, "staff")).toBeNull(); // rotated
    signInAs("staff", r.session.token);
    const ctx = await requireStaffSession();
    expect(ctx.staff.roleKey).toBe("owner");
    expect(ctx.access.sensitive.manageStaff).toBe(true);
    expect(await code(beginMfaEnrollment(db, ctx.session))).toBe("CONFLICT"); // can't re-enroll silently

    // Next sign-in: password alone is not enough; TOTP codes can't be replayed.
    const login = await loginStaff(db, { email: ownerEmail, password: PASSWORD });
    expect(login.hasAuthenticator).toBe(true);
    signInAs("staff", login.token);
    expect(await code(requireStaffSession())).toBe("MFA_REQUIRED");
    const pending = (await validateSession(db, login.token, "staff"))!;
    expect(await code(verifyMfa(db, pending, { code: currentTotp(secret) }))).toBe("VALIDATION_FAILED:code"); // already used at enrollment
    const ok = await verifyMfa(db, pending, { code: codeAt(secret, 1) });
    signInAs("staff", ok.session.token);
    expect((await requireStaffSession()).mfaComplete).toBe(true);

    // Recovery codes work once.
    const login2 = await loginStaff(db, { email: ownerEmail, password: PASSWORD });
    const pending2 = (await validateSession(db, login2.token, "staff"))!;
    const rc = r.recoveryCodes[0].toLowerCase().replace("-", " ");
    const used = await verifyMfa(db, pending2, { recoveryCode: rc });
    expect(used.recoveryCodesLeft).toBe(9);
    expect(lastEmailTo(ownerEmail)?.kind).toBe("recovery_code_used");
    const login3 = await loginStaff(db, { email: ownerEmail, password: PASSWORD });
    const pending3 = (await validateSession(db, login3.token, "staff"))!;
    expect(await code(verifyMfa(db, pending3, { recoveryCode: r.recoveryCodes[0] }))).toBe("VALIDATION_FAILED:recoveryCode");
  });
});

describe("MFA protections", () => {
  it("rate-limits code guessing per session", async () => {
    const s = await makeStaff(db, "support");
    const login = await loginStaff(db, { email: s.email, password: PASSWORD });
    const pending = (await validateSession(db, login.token, "staff"))!;
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await code(verifyMfa(db, pending, { code: String(100000 + i) })));
    expect(results.slice(0, 5).every((r) => r === "VALIDATION_FAILED:code")).toBe(true);
    expect(results[5]).toBe("RATE_LIMITED");
    expect(await code(verifyMfa(db, pending, { code: currentTotp(s.secret) }))).toBe("RATE_LIMITED");
  });

  it("disabled staff can't sign in and their sessions stop working", async () => {
    const s = await makeStaff(db, "support");
    await db.update(staffMembers).set({ status: "disabled", disabledAt: new Date() }).where(eq(staffMembers.id, s.staffId));
    expect(await code(loginStaff(db, { email: s.email, password: PASSWORD }))).toBe("UNAUTHENTICATED");
    signInAs("staff", s.token);
    expect(await getStaffSession()).toBeNull();
  });

  it("customers can't use the staff sign-in", async () => {
    const email = uniqueEmail("cust-staff");
    await db.insert(users).values({ email, passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date() });
    expect(await code(loginStaff(db, { email, password: PASSWORD }))).toBe("UNAUTHENTICATED");
  });

  it("an owner MFA reset removes the factor and signs the person out", async () => {
    const s = await makeStaff(db, "finance");
    await resetStaffMfa(db, { system: "test" }, s.user.id);
    expect(await db.select().from(mfaFactors).where(eq(mfaFactors.userId, s.user.id))).toHaveLength(0);
    expect(await validateSession(db, s.token, "staff")).toBeNull();
    const login = await loginStaff(db, { email: s.email, password: PASSWORD });
    expect(login.hasAuthenticator).toBe(false);
  });
});

describe("re-authentication for sensitive changes", () => {
  it("role changes need a fresh password + code, then sign the target out", async () => {
    const owner = await makeStaff(db, "owner");
    const target = await makeStaff(db, "support");
    const session = (await validateSession(db, owner.token, "staff"))!;
    expect(await code(changeStaffRole(db, { userId: owner.user.id, session }, target.staffId, "orders"))).toBe("REAUTH_REQUIRED");
    expect(await code(reauthenticate(db, session, { password: PASSWORD, code: "000000" }))).toBe("VALIDATION_FAILED:code");
    expect(await code(reauthenticate(db, session, { password: "wrong-password!", code: currentTotp(owner.secret) }))).toBe("VALIDATION_FAILED:password");
    await reauthenticate(db, session, { password: PASSWORD, code: currentTotp(owner.secret) });
    const fresh = (await validateSession(db, owner.token, "staff"))!;
    expect(await changeStaffRole(db, { userId: owner.user.id, session: fresh }, target.staffId, "orders")).toEqual({ id: target.staffId, role: "orders" });
    expect(await validateSession(db, target.token, "staff")).toBeNull();
  });
});
