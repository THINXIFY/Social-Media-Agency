import { and, desc, eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { createDb, type Db } from "@/server/db/client";
import { auditLog, socialConnections, socialEvents, socialOauthStates } from "@/server/db/schema";
import { envSchema, resetEnvCache } from "@/server/env";
import { AppError } from "@/server/errors";
import type { HttpDeps } from "@/server/social/http";
import { completeConnection, disconnectConnection, SYNC_COOLDOWN_MS, socialWorkspace, startConnection, syncConnection } from "@/server/social/service";
import { runMigrations } from "../../scripts/db/migrate";
import { makeCustomer, setRequestHeaders, signInAs } from "./auth-helpers";

vi.mock("next/headers", async () => (await import("./auth-helpers")).jarMock());

/*
 * AI-06 social connections against a scratch database. The platforms' HTTP
 * APIs are the only test double: scripted official-shaped responses.
 */
const scratch = `socivanta_social_test_${Date.now()}`;
let db: Db;
let admin: Client;

const LIVE = {
  SOCIAL_PROVIDERS_ENABLED: "youtube,x,linkedin",
  SOCIAL_YOUTUBE_CLIENT_ID: "yt-client-id",
  SOCIAL_YOUTUBE_CLIENT_SECRET: "yt-client-secret",
  SOCIAL_X_CLIENT_ID: "x-client-id",
  SOCIAL_X_CLIENT_SECRET: "x-client-secret",
  SOCIAL_LINKEDIN_CLIENT_ID: "li-client-id",
  SOCIAL_LINKEDIN_CLIENT_SECRET: "li-client-secret",
};

beforeAll(async () => {
  admin = new Client({ connectionString: inject("adminUrl") });
  await admin.connect();
  // UTF-8 explicitly: platform names and messages are Unicode (local Windows clusters default to WIN1252).
  await admin.query(`create database ${scratch} encoding 'UTF8' template template0`);
  const u = new URL(inject("adminUrl"));
  u.pathname = `/${scratch}`;
  await runMigrations(u.toString());
  process.env.DATABASE_URL = u.toString();
  resetEnvCache();
  db = createDb(u.toString());
}, 120_000);
afterAll(async () => {
  await db.$client.end();
  process.env.DATABASE_URL = inject("databaseUrl");
  for (const k of Object.keys(LIVE)) delete process.env[k];
  resetEnvCache();
  await admin.query(`drop database if exists ${scratch} with (force)`);
  await admin.end();
});

const env = (live = true) => envSchema.parse({ ...process.env, APP_URL: "https://app.example.com", ...(live ? LIVE : {}) });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
function script(...responses: Response[]) {
  const calls: { url: string; body: string; headers: Record<string, string> }[] = [];
  const http: HttpDeps = {
    fetch: (async (url: string, init: RequestInit = {}) => {
      calls.push({ url: String(url), body: init.body ? String(init.body) : "", headers: (init.headers ?? {}) as Record<string, string> });
      const r = responses.shift();
      if (!r) throw new Error(`unexpected request to ${url}`);
      return r;
    }) as unknown as typeof fetch,
    sleep: async () => {},
  };
  return { http, calls, left: () => responses.length };
}
const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "resolved",
    (e) => (e instanceof AppError ? e.code : `other:${String(e)}`),
  );
const stateFrom = (url: string) => new URL(url).searchParams.get("state")!;
let seq = 0;
const ytChannel = (id = "UC-test-1", subs = "1200") => json({ items: [{ id, snippet: { title: "Bakery TV", customUrl: "@bakerytv" }, statistics: { subscriberCount: subs, videoCount: "42", viewCount: "98000" } }] });
const ytToken = (access = "yt-access-RAW", refresh = "yt-refresh-RAW") => json({ access_token: access, refresh_token: refresh, expires_in: 3599, scope: "https://www.googleapis.com/auth/youtube.readonly", token_type: "Bearer" });

async function connectYouTube(customerId: string, opts: { channel?: string; now?: Date } = {}) {
  const deps = { env: env(), now: () => opts.now ?? new Date() };
  const { url } = await startConnection(db, { customerId, provider: "youtube" }, deps);
  const s = script(ytToken(), ytChannel(opts.channel ?? `UC-auto-${++seq}-${Date.now()}`));
  const res = await completeConnection(db, { customerId, provider: "youtube", params: new URLSearchParams({ state: stateFrom(url), code: "auth-code-1" }) }, { ...deps, http: s.http });
  return { res, s, url };
}

describe("starting a connection", () => {
  it("is refused while the platform isn't switched on (missing credentials or approval)", async () => {
    const { customer } = await makeCustomer(db);
    expect(await codeOf(startConnection(db, { customerId: customer.id, provider: "youtube" }, { env: env(false) }))).toBe("FEATURE_DISABLED");
    expect(await codeOf(startConnection(db, { customerId: customer.id, provider: "instagram" }, { env: env() }))).toBe("FEATURE_DISABLED");
    expect(await db.select().from(socialOauthStates).where(eq(socialOauthStates.customerId, customer.id))).toHaveLength(0);
  });

  it("stores only a hash of the state, an encrypted PKCE verifier, the exact redirect URI and a short expiry", async () => {
    const { customer } = await makeCustomer(db);
    const now = new Date();
    const { url } = await startConnection(db, { customerId: customer.id, provider: "x" }, { env: env(), now: () => now });
    const u = new URL(url);
    const state = u.searchParams.get("state")!;
    expect(state.length).toBeGreaterThanOrEqual(40);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    const [row] = await db.select().from(socialOauthStates).where(eq(socialOauthStates.customerId, customer.id));
    expect(row!.stateHash).not.toContain(state);
    expect(JSON.stringify(row)).not.toContain(state);
    expect(row!.codeVerifierCiphertext).toMatch(/^v1\./);
    expect(row!.redirectUri).toBe("https://app.example.com/api/social/callback/x");
    expect(row!.expiresAt.getTime() - now.getTime()).toBe(10 * 60_000);
  });

  it("limits how many authorizations can be pending at once", async () => {
    const { customer } = await makeCustomer(db);
    for (let i = 0; i < 10; i++) await startConnection(db, { customerId: customer.id, provider: "linkedin" }, { env: env() });
    expect(await codeOf(startConnection(db, { customerId: customer.id, provider: "linkedin" }, { env: env() }))).toBe("RATE_LIMITED");
  });
});

describe("the OAuth callback", () => {
  it("rejects unknown, foreign, expired and replayed states without contacting the platform", async () => {
    const owner = await makeCustomer(db);
    const other = await makeCustomer(db);
    const s = script();
    const deps = { env: env(), http: s.http };
    const unknown = await completeConnection(db, { customerId: owner.customer.id, provider: "youtube", params: new URLSearchParams({ state: "x".repeat(43), code: "c" }) }, deps);
    expect(unknown.outcome).toBe("expired");

    const { url } = await startConnection(db, { customerId: owner.customer.id, provider: "youtube" }, deps);
    // Another customer's browser presenting the owner's state: refused, and the state is burnt.
    expect((await completeConnection(db, { customerId: other.customer.id, provider: "youtube", params: new URLSearchParams({ state: stateFrom(url), code: "c" }) }, deps)).outcome).toBe("expired");
    expect((await completeConnection(db, { customerId: owner.customer.id, provider: "youtube", params: new URLSearchParams({ state: stateFrom(url), code: "c" }) }, deps)).outcome).toBe("expired");

    // A state for one platform can't complete another.
    const { url: u2 } = await startConnection(db, { customerId: owner.customer.id, provider: "youtube" }, deps);
    expect((await completeConnection(db, { customerId: owner.customer.id, provider: "x", params: new URLSearchParams({ state: stateFrom(u2), code: "c" }) }, deps)).outcome).toBe("expired");

    // Expired.
    const { url: u3 } = await startConnection(db, { customerId: owner.customer.id, provider: "youtube" }, { ...deps, now: () => new Date(Date.now() - 11 * 60_000) });
    expect((await completeConnection(db, { customerId: owner.customer.id, provider: "youtube", params: new URLSearchParams({ state: stateFrom(u3), code: "c" }) }, deps)).outcome).toBe("expired");
    expect(s.calls).toHaveLength(0);
  });

  it("records a cancelled authorization honestly", async () => {
    const { customer } = await makeCustomer(db);
    const { url } = await startConnection(db, { customerId: customer.id, provider: "youtube" }, { env: env() });
    const r = await completeConnection(db, { customerId: customer.id, provider: "youtube", params: new URLSearchParams({ state: stateFrom(url), error: "access_denied" }) }, { env: env() });
    expect(r.outcome).toBe("denied");
    const [e] = await db.select().from(socialEvents).where(eq(socialEvents.customerId, customer.id));
    expect(e).toMatchObject({ type: "connect_failed", code: "denied", message: "You cancelled connecting YouTube. Nothing was connected." });
    expect(await db.select().from(socialConnections).where(eq(socialConnections.customerId, customer.id))).toHaveLength(0);
  });

  it("connects with PKCE and the exact redirect URI, encrypting tokens at rest", async () => {
    const { customer } = await makeCustomer(db);
    const { res, s } = await connectYouTube(customer.id);
    expect(res).toEqual({ outcome: "connected", accounts: 1 });
    const tokenBody = new URLSearchParams(s.calls[0]!.body);
    expect(s.calls[0]!.url).toBe("https://oauth2.googleapis.com/token");
    expect(tokenBody.get("redirect_uri")).toBe("https://app.example.com/api/social/callback/youtube");
    expect(tokenBody.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    expect(tokenBody.get("grant_type")).toBe("authorization_code");

    const [c] = await db.select().from(socialConnections).where(eq(socialConnections.customerId, customer.id));
    expect(c).toMatchObject({ provider: "youtube", externalId: expect.stringMatching(/^UC-auto-/), displayName: "Bakery TV", handle: "@bakerytv", status: "active", metrics: { audience: 1200, "content-count": 42, views: 98000 }, lastSyncOk: "ok" });
    expect(c!.accessTokenCiphertext).toMatch(/^v1\./);
    expect(JSON.stringify(c)).not.toMatch(/yt-access-RAW|yt-refresh-RAW/);
    const [a] = await db.select().from(auditLog).where(and(eq(auditLog.action, "social.connected"), eq(auditLog.targetId, customer.id)));
    expect(JSON.stringify(a)).not.toMatch(/RAW|code/);
  });

  it("reconnecting the same account updates it in place; another customer can't take it over", async () => {
    const { customer } = await makeCustomer(db);
    await connectYouTube(customer.id, { channel: "UC-shared" });
    const again = await connectYouTube(customer.id, { channel: "UC-shared" });
    expect(again.res.outcome).toBe("reconnected");
    expect(await db.select().from(socialConnections).where(eq(socialConnections.customerId, customer.id))).toHaveLength(1);

    const intruder = await makeCustomer(db);
    const taken = await connectYouTube(intruder.customer.id, { channel: "UC-shared" });
    expect(taken.res.outcome).toBe("linked_elsewhere");
    expect(await db.select().from(socialConnections).where(eq(socialConnections.customerId, intruder.customer.id))).toHaveLength(0);
  });

  it("reports a platform failure without keeping any access", async () => {
    const { customer } = await makeCustomer(db);
    const { url } = await startConnection(db, { customerId: customer.id, provider: "youtube" }, { env: env() });
    const s = script(json({ error: "invalid_grant", error_description: "SECRET-DETAIL" }, 400));
    const r = await completeConnection(db, { customerId: customer.id, provider: "youtube", params: new URLSearchParams({ state: stateFrom(url), code: "bad" }) }, { env: env(), http: s.http });
    expect(r.outcome).toBe("failed");
    const [e] = await db.select().from(socialEvents).where(eq(socialEvents.customerId, customer.id));
    expect(e!.message).not.toContain("SECRET-DETAIL");
    expect(await db.select().from(socialConnections).where(eq(socialConnections.customerId, customer.id))).toHaveLength(0);
  });
});

describe("refreshing (sync)", () => {
  it("is manual with a cooldown, renews expiring access, and records results", async () => {
    const { customer } = await makeCustomer(db);
    const t0 = new Date();
    await connectYouTube(customer.id, { now: t0, channel: "UC-sync-a" });
    const [c] = await db.select().from(socialConnections).where(eq(socialConnections.customerId, customer.id));

    expect(await codeOf(syncConnection(db, { customerId: customer.id, connectionId: c!.id }, { env: env(), now: () => new Date(t0.getTime() + 60_000) }))).toBe("RATE_LIMITED");

    // An hour later the access token has expired: it's renewed with the refresh token first.
    const later = new Date(t0.getTime() + 3600_000);
    const s = script(json({ access_token: "yt-access-2", expires_in: 3599 }), ytChannel("UC-sync-a", "1300"));
    const r = await syncConnection(db, { customerId: customer.id, connectionId: c!.id }, { env: env(), http: s.http, now: () => later });
    expect(r).toEqual({ ok: true, message: "Bakery TV is up to date." });
    expect(new URLSearchParams(s.calls[0]!.body).get("grant_type")).toBe("refresh_token");
    expect(new URLSearchParams(s.calls[0]!.body).get("refresh_token")).toBe("yt-refresh-RAW");
    const [after] = await db.select().from(socialConnections).where(eq(socialConnections.id, c!.id));
    expect(after!.metrics).toEqual({ audience: 1300, "content-count": 42, views: 98000 });
    // The platform didn't rotate the refresh token, so the current one is kept.
    expect(after!.refreshTokenCiphertext).toBeTruthy();
    const types = (await db.select({ t: socialEvents.type }).from(socialEvents).where(eq(socialEvents.connectionId, c!.id)).orderBy(desc(socialEvents.at))).map((x) => x.t);
    expect(types).toEqual(expect.arrayContaining(["connected", "access_renewed", "sync_succeeded"]));
  });

  it("handles rate limits with bounded retries and asks to reconnect when access is refused", async () => {
    const { customer } = await makeCustomer(db);
    const t0 = new Date();
    await connectYouTube(customer.id, { now: t0, channel: "UC-sync-b" });
    const [c] = await db.select().from(socialConnections).where(eq(socialConnections.customerId, customer.id));
    const step = (n: number) => () => new Date(t0.getTime() + n * (SYNC_COOLDOWN_MS + 1000));

    // Still within token lifetime; the platform rate-limits for 15 minutes — fail fast, don't wait.
    const limited = script(json({}, 429, { "retry-after": "900" }));
    const r1 = await syncConnection(db, { customerId: customer.id, connectionId: c!.id }, { env: env(), http: limited.http, now: step(1) });
    expect(r1).toEqual({ ok: false, message: "YouTube asked us to slow down. Try again in a few minutes." });
    expect(limited.calls).toHaveLength(1);
    let [row] = await db.select().from(socialConnections).where(eq(socialConnections.id, c!.id));
    expect(row).toMatchObject({ status: "active", lastSyncOk: "failed", lastErrorCode: "rate_limited" });
    // The last good figures stay as they were.
    expect(row!.metrics).toEqual({ audience: 1200, "content-count": 42, views: 98000 });

    // Transient 503s are retried (bounded), then succeed.
    const flaky = script(json({}, 503), ytChannel("UC-sync-b"));
    expect((await syncConnection(db, { customerId: customer.id, connectionId: c!.id }, { env: env(), http: flaky.http, now: step(2) })).ok).toBe(true);
    expect(flaky.calls).toHaveLength(2);

    const refused = script(json({}, 401));
    const r3 = await syncConnection(db, { customerId: customer.id, connectionId: c!.id }, { env: env(), http: refused.http, now: step(3) });
    expect(r3.ok).toBe(false);
    [row] = await db.select().from(socialConnections).where(eq(socialConnections.id, c!.id));
    expect(row!.status).toBe("needs_reauth");
    expect(await codeOf(syncConnection(db, { customerId: customer.id, connectionId: c!.id }, { env: env(), now: step(4) }))).toBe("REAUTH_REQUIRED");
    const view = await socialWorkspace(db, customer.id, env());
    expect(view.accounts[0]).toMatchObject({ health: "action_needed", status: "needs_reauth" });
  });
});

describe("ownership and disconnecting", () => {
  it("never lets one customer see, refresh or disconnect another's account", async () => {
    const owner = await makeCustomer(db);
    const other = await makeCustomer(db);
    await connectYouTube(owner.customer.id, { channel: "UC-owned" });
    const [c] = await db.select().from(socialConnections).where(eq(socialConnections.customerId, owner.customer.id));
    const later = () => new Date(Date.now() + SYNC_COOLDOWN_MS * 2);
    expect(await codeOf(syncConnection(db, { customerId: other.customer.id, connectionId: c!.id }, { env: env(), now: later }))).toBe("NOT_FOUND");
    expect(await codeOf(disconnectConnection(db, { customerId: other.customer.id, connectionId: c!.id }, { env: env() }))).toBe("NOT_FOUND");
    expect(await codeOf(startConnection(db, { customerId: other.customer.id, provider: "youtube", connectionId: c!.id }, { env: env() }))).toBe("NOT_FOUND");
    const theirs = await socialWorkspace(db, other.customer.id, env());
    expect(theirs.accounts).toHaveLength(0);
    expect(theirs.events).toHaveLength(0);
    const mine = await socialWorkspace(db, owner.customer.id, env());
    expect(mine.accounts).toHaveLength(1);
    expect(JSON.stringify(mine)).not.toMatch(/v1\.|yt-access|yt-refresh|ciphertext|accessToken/i);
  });

  it("revokes where supported, deletes stored access, and reports a failed revocation as failed", async () => {
    const { customer } = await makeCustomer(db);
    await connectYouTube(customer.id, { channel: "UC-rev-ok" });
    await connectYouTube(customer.id, { channel: "UC-rev-fail" });
    const rows = await db.select().from(socialConnections).where(eq(socialConnections.customerId, customer.id));
    const ok = rows.find((r) => r.externalId === "UC-rev-ok")!;
    const fail = rows.find((r) => r.externalId === "UC-rev-fail")!;

    const s1 = script(json({}));
    const r1 = await disconnectConnection(db, { customerId: customer.id, connectionId: ok.id }, { env: env(), http: s1.http });
    expect(r1.revocation).toBe("revoked");
    expect(s1.calls[0]!.url).toBe("https://oauth2.googleapis.com/revoke");
    expect(new URLSearchParams(s1.calls[0]!.body).get("token")).toBe("yt-refresh-RAW");

    const s2 = script(json({}, 500), json({}, 500), json({}, 500));
    const r2 = await disconnectConnection(db, { customerId: customer.id, connectionId: fail.id }, { env: env(), http: s2.http });
    expect(r2.revocation).toBe("failed");
    expect(r2.message).toMatch(/didn't confirm removing access/);
    expect(r2.message).not.toMatch(/revoked|confirmed SociVanta's access was removed/);

    for (const id of [ok.id, fail.id]) {
      const [row] = await db.select().from(socialConnections).where(eq(socialConnections.id, id));
      expect(row).toMatchObject({ status: "disconnected", accessTokenCiphertext: null, refreshTokenCiphertext: null });
    }
    expect((await socialWorkspace(db, customer.id, env())).accounts).toHaveLength(0);
    // Disconnected accounts free the platform account for reconnecting.
    expect((await connectYouTube(customer.id, { channel: "UC-rev-ok" })).res.outcome).toBe("connected");
  });

  it("says plainly when a platform can't revoke access itself", async () => {
    const { customer } = await makeCustomer(db);
    const { url } = await startConnection(db, { customerId: customer.id, provider: "linkedin" }, { env: env() });
    const s = script(json({ access_token: "li-access", expires_in: 5184000 }), json({ sub: "li-1", name: "Sam Baker" }));
    expect((await completeConnection(db, { customerId: customer.id, provider: "linkedin", params: new URLSearchParams({ state: stateFrom(url), code: "c" }) }, { env: env(), http: s.http })).outcome).toBe("connected");
    const [c] = await db.select().from(socialConnections).where(eq(socialConnections.customerId, customer.id));
    expect(c!.metrics).toEqual({});
    const none = script();
    const r = await disconnectConnection(db, { customerId: customer.id, connectionId: c!.id }, { env: env(), http: none.http });
    expect(r.revocation).toBe("not_supported");
    expect(r.message).toMatch(/LinkedIn doesn't let apps remove access themselves/);
    expect(none.calls).toHaveLength(0);
  });

  it("the database refuses a disconnected row that still holds credentials", async () => {
    const { customer } = await makeCustomer(db);
    await connectYouTube(customer.id, { channel: "UC-constraint" });
    const [c] = await db.select().from(socialConnections).where(eq(socialConnections.customerId, customer.id));
    await expect(db.update(socialConnections).set({ status: "disconnected" }).where(eq(socialConnections.id, c!.id))).rejects.toThrow();
  });
});

describe("routes", () => {
  it("require a same-origin request from the signed-in owner", async () => {
    process.env.SOCIAL_PROVIDERS_ENABLED = "";
    resetEnvCache();
    const owner = await makeCustomer(db);
    const other = await makeCustomer(db);
    await connectYouTube(owner.customer.id, { channel: "UC-route" });
    const [c] = await db.select().from(socialConnections).where(eq(socialConnections.customerId, owner.customer.id));
    const { DELETE } = await import("@/app/api/social/accounts/[id]/route");
    const { POST } = await import("@/app/api/social/connect/[provider]/route");
    const req = (method: string, url: string, origin: string | null = "http://localhost:3000") => new Request(url, { method, headers: origin ? { origin, "content-type": "application/json" } : {}, body: method === "POST" ? "{}" : undefined });

    signInAs("customer", other.token);
    setRequestHeaders({});
    const foreign = await DELETE(req("DELETE", `http://localhost:3000/api/social/accounts/${c!.id}`), { params: Promise.resolve({ id: c!.id }) });
    expect(foreign.status).toBe(404);

    signInAs("customer", owner.token);
    const crossSite = await DELETE(req("DELETE", `http://localhost:3000/api/social/accounts/${c!.id}`, "https://evil.example"), { params: Promise.resolve({ id: c!.id }) });
    expect(crossSite.status).toBe(403);
    const disabled = await POST(req("POST", "http://localhost:3000/api/social/connect/youtube"), { params: Promise.resolve({ provider: "youtube" }) });
    expect(disabled.status).toBe(503);
    expect(JSON.stringify(await disabled.json())).not.toMatch(/CLIENT|SECRET/);
    const unknown = await POST(req("POST", "http://localhost:3000/api/social/connect/myspace"), { params: Promise.resolve({ provider: "myspace" }) });
    expect(unknown.status).toBe(404);

    // Still connected: nothing above changed it.
    const [still] = await db.select().from(socialConnections).where(eq(socialConnections.id, c!.id));
    expect(still!.status).toBe("active");
  });
});
