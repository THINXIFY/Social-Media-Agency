import { eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { signOutEverywhereAction } from "@/app/actions/account";
import { POST as webhookPost } from "@/app/api/payments/webhooks/[processor]/route";
import { createSession } from "@/server/auth/sessions";
import { createDb, type Db } from "@/server/db/client";
import { sessions } from "@/server/db/schema";
import { resetEnvCache } from "@/server/env";
import { ADAPTERS as PROVIDER_ADAPTERS } from "@/server/providers/registry";
import { runMigrations } from "../../scripts/db/migrate";
import { seedReferenceData } from "../../scripts/db/seed";
import { jar, makeCustomer, makeStaff, signInAs } from "./auth-helpers";

vi.mock("next/headers", async () => (await import("./auth-helpers")).jarMock());
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));

/*
 * Phase 5I-A security sweep. Every route handler under /api/admin,
 * /api/account, /api/social and /api/ai is imported and every exported
 * method is called with dummy parameters as: nobody, a customer, a
 * lower-privileged staff member, and an owner from a foreign origin.
 * None of these may succeed. Scratch database; nothing external is called.
 */
const scratch = `socivanta_security_test_${Date.now()}`;
let db: Db;
let admin: Client;
beforeAll(async () => {
  admin = new Client({ connectionString: inject("adminUrl") });
  await admin.connect();
  await admin.query(`create database ${scratch} encoding 'UTF8' template template0`);
  const u = new URL(inject("adminUrl"));
  u.pathname = `/${scratch}`;
  await runMigrations(u.toString());
  process.env.DATABASE_URL = u.toString();
  resetEnvCache();
  db = createDb(u.toString());
  await seedReferenceData(db);
}, 120_000);
afterAll(async () => {
  await db.$client.end();
  process.env.DATABASE_URL = inject("databaseUrl");
  resetEnvCache();
  await admin.query(`drop database if exists ${scratch} with (force)`);
  await admin.end();
});

type Handler = (r: Request, c: unknown) => Promise<Response>;
const MODULES = import.meta.glob("../../src/app/api/{admin,account,social,ai}/**/route.ts");
/** Public by design (read-only): the AI tool list, one tool's page data, keyword search and the OAuth redirect target. */
const PUBLIC = [/\/api\/ai\/search\/route\.ts$/, /\/api\/ai\/tools\/route\.ts$/, /\/api\/ai\/tools\/\[id\]\/route\.ts$/, /\/api\/social\/callback\//];
/** Open to signed-out visitors by design, within the anonymous AI allowance; still covered by the CSRF check below. */
const ANONYMOUS_OK = new Set(["/api/ai/tools/[id]/run"]);
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const ORIGIN = "http://localhost:3000";
const DUMMY_UUID = "00000000-0000-4000-8000-000000000000";

async function handlers() {
  const out: { path: string; method: (typeof METHODS)[number]; fn: Handler; params: Record<string, string> }[] = [];
  for (const [file, load] of Object.entries(MODULES)) {
    if (PUBLIC.some((p) => p.test(file))) continue;
    const mod = (await load()) as Record<string, unknown>;
    const params = Object.fromEntries([...file.matchAll(/\[(\w+)\]/g)].map(([, k]) => [k, k === "id" ? DUMMY_UUID : "x"]));
    for (const m of METHODS) if (typeof mod[m] === "function") out.push({ path: file.replace("../../src/app", "").replace("/route.ts", ""), method: m, fn: mod[m] as Handler, params });
  }
  return out;
}
const call = (h: Awaited<ReturnType<typeof handlers>>[number], origin = ORIGIN) =>
  h.fn(new Request(`${ORIGIN}${h.path}`, { method: h.method, headers: { origin, "content-type": "application/json" }, ...(h.method === "GET" ? {} : { body: "{}" }) }), { params: Promise.resolve(h.params) });

describe("route sweep", () => {
  it("covers every private route handler", async () => {
    const list = await handlers();
    expect(list.length).toBeGreaterThan(100);
  });

  it("nobody signed in: every private handler refuses (never 2xx, never 5xx)", async () => {
    jar.clear();
    const bad: string[] = [];
    for (const h of (await handlers()).filter((x) => !ANONYMOUS_OK.has(x.path))) {
      const s = (await call(h)).status;
      if (s < 400 || s >= 500) bad.push(`${h.method} ${h.path} → ${s}`);
    }
    expect(bad).toEqual([]);
  });

  it("a customer can't reach any admin handler", async () => {
    const c = await makeCustomer(db);
    signInAs("customer", c.token);
    const bad: string[] = [];
    for (const h of (await handlers()).filter((x) => x.path.startsWith("/api/admin"))) {
      const s = (await call(h)).status;
      if (s < 400 || s >= 500) bad.push(`${h.method} ${h.path} → ${s}`);
    }
    expect(bad).toEqual([]);
  });

  it("a Support-role staff member can't change anything outside Support", async () => {
    const s = await makeStaff(db, "support");
    signInAs("staff", s.token);
    const bad: string[] = [];
    for (const h of (await handlers()).filter((x) => x.path.startsWith("/api/admin") && x.method !== "GET" && !x.path.startsWith("/api/admin/support") && x.path !== "/api/admin/reauth")) {
      const r = await call(h);
      if (r.status < 400 || r.status >= 500) bad.push(`${h.method} ${h.path} → ${r.status}`);
    }
    expect(bad).toEqual([]);
  });

  it("an owner's session can't be used from another site (CSRF) on any state-changing handler", async () => {
    const o = await makeStaff(db, "owner");
    const c = await makeCustomer(db);
    const bad: string[] = [];
    for (const h of (await handlers()).filter((x) => x.method !== "GET")) {
      signInAs(h.path.startsWith("/api/admin") ? "staff" : "customer", h.path.startsWith("/api/admin") ? o.token : c.token);
      const s = (await call(h, "https://evil.example")).status;
      if (s !== 403) bad.push(`${h.method} ${h.path} → ${s}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("session safety", () => {
  it("a staff session that hasn't passed MFA can sign itself out, but not every device (SEC-03)", async () => {
    const s = await makeStaff(db, "admin", { mfa: false }); // password only, MFA never completed
    const other = await createSession(db, { userId: s.user.id, kind: "staff", mfaVerified: true });
    signInAs("staff", s.token);
    const fd = new FormData();
    fd.set("kind", "staff");
    await signOutEverywhereAction(fd).catch((e) => {
      if (!String((e as { digest?: string }).digest ?? "").startsWith("NEXT_REDIRECT")) throw e;
    });
    const live = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, s.user.id));
    expect(live.map((x) => x.id)).toEqual([other.id]);
  });

  it("a fully verified staff session still signs out everywhere", async () => {
    const s = await makeStaff(db, "admin");
    await createSession(db, { userId: s.user.id, kind: "staff", mfaVerified: true });
    signInAs("staff", s.token);
    const fd = new FormData();
    fd.set("kind", "staff");
    await signOutEverywhereAction(fd).catch(() => {});
    const live = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, s.user.id));
    expect(live).toEqual([]);
  });
});

describe("disabled integrations fail closed", () => {
  it("payment webhooks are refused without parsing the body", async () => {
    for (const p of ["stripe", "paypal", "x"]) {
      const res = await (webhookPost as Handler)(new Request(`${ORIGIN}/api/payments/webhooks/${p}`, { method: "POST", body: "not json" }), { params: Promise.resolve({ processor: p }) });
      expect(res.status, p).toBe(503); // FEATURE_DISABLED: no approved processor adapter
      expect((await res.json()).error.code, p).toBe("FEATURE_DISABLED");
    }
  });

  it("no supplier adapter is registered, so nothing can be sent to a provider", () => {
    expect(Object.keys(PROVIDER_ADAPTERS)).toEqual([]);
  });
});

describe("database connection limits (SEC-04)", () => {
  it("every pooled connection has a statement timeout and an idle-in-transaction timeout", async () => {
    const [s] = (await db.execute<{ st: string; it: string }>(sql`select current_setting('statement_timeout') as st, current_setting('idle_in_transaction_session_timeout') as it`)).rows;
    expect(s).toEqual({ st: "30s", it: "1min" });
  });

  it("a runaway statement is cancelled instead of holding the connection", async () => {
    await expect(db.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout = '200ms'`);
      await tx.execute(sql`select pg_sleep(2)`);
    })).rejects.toThrow();
    const [ok] = (await db.execute<{ one: number }>(sql`select 1 as one`)).rows;
    expect(ok.one).toBe(1); // the pool keeps working
  });
});
