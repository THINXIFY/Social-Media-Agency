import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as accountMe } from "@/app/api/account/me/route";
import { DELETE as revokeOne } from "@/app/api/account/sessions/[id]/route";
import { DELETE as revokeOthers, GET as accountSessions } from "@/app/api/account/sessions/route";
import { GET as adminMe } from "@/app/api/admin/me/route";
import { POST as reauth } from "@/app/api/admin/reauth/route";
import { PATCH as patchStaff } from "@/app/api/admin/staff/[id]/route";
import { GET as staffList } from "@/app/api/admin/staff/route";
import { revokeAllSessions, validateSession } from "@/server/auth/sessions";
import { currentTotp, TOTP_PERIOD } from "@/server/auth/totp";
import type { Db } from "@/server/db/client";
import { chargeOrder, creditDeposit, refundOrder } from "@/server/ledger/operations";
import { AppError } from "@/server/errors";
import { bindRequestDb, jar, makeCustomer, makeStaff, PASSWORD, signInAs } from "./auth-helpers";
import { ensureReferenceData, testDb } from "./helpers";

vi.mock("next/headers", async () => (await import("./auth-helpers")).jarMock());
vi.mock("next/server", () => ({ connection: async () => {} }));

let db: Db;
beforeAll(async () => {
  bindRequestDb();
  db = testDb();
  await ensureReferenceData(db);
});
afterAll(() => db.$client.end());

const ORIGIN = "http://localhost:3000";
const get = (fn: (r: Request, c: never) => Promise<Response>, ctx: unknown = {}) => fn(new Request(`${ORIGIN}/api/x`), ctx as never);
const send = (fn: (r: Request, c: never) => Promise<Response>, method: string, body: unknown, ctx: unknown = {}, origin = ORIGIN) =>
  fn(new Request(`${ORIGIN}/api/x`, { method, headers: { "content-type": "application/json", origin }, body: body === undefined ? undefined : JSON.stringify(body) }), ctx as never);
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const errCode = async (r: Response) => ((await r.json()) as { error?: { code: string } }).error?.code;

describe("anonymous visitors", () => {
  it("get 401 from every protected API, with no-store", async () => {
    jar.clear();
    for (const fn of [accountMe, accountSessions, adminMe, staffList]) {
      const r = await get(fn as never);
      expect(r.status).toBe(401);
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
    expect((await send(patchStaff as never, "PATCH", { role: "admin" }, params("00000000-0000-4000-8000-000000000000"))).status).toBe(401);
  });

  it("money operations stay disabled for everyone", async () => {
    const codeOf = async (p: Promise<unknown>) => p.then(() => "resolved", (e) => (e instanceof AppError ? e.code : String(e)));
    for (const op of [creditDeposit("x"), chargeOrder("x"), refundOrder("x", 1)]) expect(await codeOf(op)).toBe("FEATURE_DISABLED");
  });
});

describe("customers", () => {
  it("see only their own account and can't reach admin", async () => {
    const c = await makeCustomer(db);
    signInAs("customer", c.token);
    const me = await get(accountMe as never);
    expect(me.status).toBe(200);
    expect(me.headers.get("cache-control")).toBe("private, no-store");
    expect(((await me.json()) as { email: string }).email).toBe(c.email);
    expect((await get(adminMe as never)).status).toBe(401);
    expect((await get(staffList as never)).status).toBe(401);
  });

  it("unverified customers are refused", async () => {
    const c = await makeCustomer(db, { verified: false });
    signInAs("customer", c.token);
    const r = await get(accountMe as never);
    expect(r.status).toBe(403);
    expect(await errCode(r)).toBe("EMAIL_UNVERIFIED");
  });

  it("can't revoke another customer's session by guessing its id", async () => {
    const a = await makeCustomer(db);
    const b = await makeCustomer(db);
    signInAs("customer", a.token);
    const r = await send(revokeOne as never, "DELETE", undefined, params(b.sessionId));
    expect(r.status).toBe(404);
    expect(await validateSession(db, b.token, "customer")).not.toBeNull();
    const list = (await (await get(accountSessions as never)).json()) as { sessions: { id: string }[] };
    expect(list.sessions.map((s) => s.id)).toEqual([a.sessionId]);
  });

  it("revocation blocks the very next request", async () => {
    const c = await makeCustomer(db);
    signInAs("customer", c.token);
    expect((await get(accountMe as never)).status).toBe(200);
    await revokeAllSessions(db, c.user.id);
    expect((await get(accountMe as never)).status).toBe(401);
  });

  it("cross-site requests can't change anything (CSRF)", async () => {
    const c = await makeCustomer(db);
    signInAs("customer", c.token);
    const r = await send(revokeOthers as never, "DELETE", undefined, {}, "https://evil.example");
    expect(r.status).toBe(403);
    expect((await send(revokeOthers as never, "DELETE", undefined)).status).toBe(200);
  });
});

describe("staff permissions are enforced on the server", () => {
  it("a password-only staff session (no second factor) gets nothing", async () => {
    const s = await makeStaff(db, "owner", { mfa: false });
    signInAs("staff", s.token);
    for (const fn of [adminMe, staffList]) {
      const r = await get(fn as never);
      expect(r.status).toBe(401);
      expect(await errCode(r)).toBe("MFA_REQUIRED");
    }
  });

  it("support agents can't see staff; admins can view but not modify", async () => {
    const support = await makeStaff(db, "support");
    signInAs("staff", support.token);
    expect((await get(adminMe as never)).status).toBe(200);
    expect((await get(staffList as never)).status).toBe(403);

    const admin = await makeStaff(db, "admin");
    signInAs("staff", admin.token);
    expect((await get(staffList as never)).status).toBe(200);
    const r = await send(patchStaff as never, "PATCH", { role: "finance" }, params(support.staffId));
    expect(r.status).toBe(403);
    expect(await errCode(r)).toBe("FORBIDDEN");
  });

  it("owners need a fresh re-authentication, then can change roles; the target is signed out", async () => {
    const owner = await makeStaff(db, "owner");
    const target = await makeStaff(db, "support");
    signInAs("staff", owner.token);
    const before = await send(patchStaff as never, "PATCH", { role: "finance" }, params(target.staffId));
    expect(before.status).toBe(403);
    expect(await errCode(before)).toBe("REAUTH_REQUIRED");
    expect((await send(reauth as never, "POST", { password: PASSWORD, code: "000000" })).status).toBe(400);
    expect((await send(reauth as never, "POST", { password: PASSWORD, code: currentTotp(owner.secret) })).status).toBe(200);
    const after = await send(patchStaff as never, "PATCH", { role: "finance" }, params(target.staffId));
    expect(after.status).toBe(200);
    expect(await validateSession(db, target.token, "staff")).toBeNull();
    // A role escalation by the target with their old cookie is impossible.
    signInAs("staff", target.token);
    expect((await get(staffList as never)).status).toBe(401);
  });

  it("the last active owner can't be demoted or disabled — even by themselves", async () => {
    // Make this owner the only active one.
    const owner = await makeStaff(db, "owner");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`update staff_members set status = 'disabled', disabled_at = now() where id <> ${owner.staffId} and role_id = (select id from roles where key = 'owner') and status = 'active'`).catch(() => undefined);
    signInAs("staff", owner.token);
    await send(reauth as never, "POST", { password: PASSWORD, code: currentTotp(owner.secret, Date.now() + TOTP_PERIOD * 1000) });
    const demote = await send(patchStaff as never, "PATCH", { role: "admin" }, params(owner.staffId));
    expect(demote.status).toBe(409);
    const disable = await send(patchStaff as never, "PATCH", { disabled: true }, params(owner.staffId));
    expect(disable.status).toBe(409);
  });

  it("rejects malformed or unexpected input", async () => {
    const owner = await makeStaff(db, "owner");
    signInAs("staff", owner.token);
    await send(reauth as never, "POST", { password: PASSWORD, code: currentTotp(owner.secret) });
    expect((await send(patchStaff as never, "PATCH", { role: "superuser" }, params(owner.staffId))).status).toBe(400);
    expect((await send(patchStaff as never, "PATCH", { role: "admin", sneaky: true }, params(owner.staffId))).status).toBe(400);
  });
});
