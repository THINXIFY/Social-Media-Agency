import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { socialFaq } from "@/components/social/landing";
import { SOCIAL_PLATFORM, SOCIAL_PLATFORMS, SOCIAL_PROVIDER_IDS } from "@/lib/social/platforms";
import { envSchema } from "@/server/env";
import { MAX_RETRIES, ProviderError, requestJson } from "@/server/social/http";
import { ADAPTERS, parseTokens } from "@/server/social/providers";
import { accountView, authorizeUrl, pkceChallenge, problemMessage, providerAvailability, redirectUriFor } from "@/server/social/service";

/* AI-06 pure logic: registry, availability, OAuth URLs, bounded HTTP, adapters and customer-safe views. */

const env = (over: Record<string, string> = {}) => envSchema.parse({ ...process.env, APP_URL: "https://app.example.com", ...over });
const live = (id: string) => ({ SOCIAL_PROVIDERS_ENABLED: id, [`SOCIAL_${id.toUpperCase()}_CLIENT_ID`]: "client-id-123", [`SOCIAL_${id.toUpperCase()}_CLIENT_SECRET`]: "client-secret-456" });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const http = (...responses: (Response | Error)[]) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (!r) throw new Error("unexpected request");
    if (r instanceof Error) throw r;
    return r;
  });
  const sleep = vi.fn(async () => {});
  return { deps: { fetch: fetch as unknown as typeof globalThis.fetch, sleep }, calls, sleep };
};

describe("platform registry", () => {
  it("covers the six platforms with read-only capabilities and honest copy", () => {
    expect(SOCIAL_PROVIDER_IDS).toEqual(["instagram", "facebook", "tiktok", "youtube", "x", "linkedin"]);
    for (const p of SOCIAL_PLATFORMS) {
      expect(p.capabilities[0]).toBe("profile");
      expect(p.never).toEqual(expect.arrayContaining(["Post, schedule or delete anything", "Run ads or spend money"]));
      expect(p.permissions.length).toBeGreaterThan(0);
    }
    expect(SOCIAL_PLATFORM.linkedin.capabilities).toEqual(["profile"]);
  });

  it("requests only minimal read scopes — nothing that can post, message, manage or advertise", () => {
    for (const a of Object.values(ADAPTERS)) {
      for (const s of a.scopes) expect(s, `${a.id}:${s}`).not.toMatch(/write|publish|manage|post|content_publish|ads|message|upload|delete|w_member|tweet\.write|video\.publish|force-ssl/i);
    }
    expect(ADAPTERS.youtube.scopes).toEqual(["https://www.googleapis.com/auth/youtube.readonly"]);
  });

  it("only offers revocation where the platform supports it, and never for shared Facebook Page grants", () => {
    for (const p of SOCIAL_PLATFORMS) if (p.revokeOnDisconnect) expect(ADAPTERS[p.id].revoke, p.id).toBeTypeOf("function");
    expect(SOCIAL_PLATFORM.facebook.revokeOnDisconnect).toBe(false);
    expect(SOCIAL_PLATFORM.instagram.revokeOnDisconnect).toBe(false);
  });
});

describe("availability", () => {
  it("is off unless the platform is listed AND both credentials are set", () => {
    for (const id of SOCIAL_PROVIDER_IDS) expect(providerAvailability(env(), id).state).toBe("unavailable");
    expect(providerAvailability(env({ SOCIAL_PROVIDERS_ENABLED: "youtube" }), "youtube").state).toBe("unavailable");
    expect(providerAvailability(env({ SOCIAL_YOUTUBE_CLIENT_ID: "client-id-123", SOCIAL_YOUTUBE_CLIENT_SECRET: "client-secret-456" }), "youtube").state).toBe("unavailable");
    expect(providerAvailability(env(live("youtube")), "youtube").state).toBe("available");
    expect(providerAvailability(env(live("youtube")), "x").state).toBe("unavailable");
  });
  it("explains unavailability without revealing configuration", () => {
    const a = providerAvailability(env({ SOCIAL_PROVIDERS_ENABLED: "x" }), "x");
    expect(a).toEqual({ state: "unavailable", reason: "X connections aren't switched on yet. Sociotix needs X's approval before accounts can be linked." });
    expect(JSON.stringify(a)).not.toMatch(/CLIENT|SECRET|env/i);
  });
});

describe("authorization URL", () => {
  it("uses the exact APP_URL redirect, minimal scopes, state and S256 PKCE where supported", () => {
    const e = env();
    const redirect = redirectUriFor(e, "x");
    expect(redirect).toBe("https://app.example.com/api/social/callback/x");
    const verifier = "v".repeat(64);
    const u = new URL(authorizeUrl(ADAPTERS.x, "cid", { state: "state-value-abcdefghijklmnop", redirectUri: redirect, verifier }));
    expect(u.origin + u.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(u.searchParams.get("redirect_uri")).toBe(redirect);
    expect(u.searchParams.get("state")).toBe("state-value-abcdefghijklmnop");
    expect(u.searchParams.get("scope")).toBe("users.read tweet.read offline.access");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(pkceChallenge(verifier)).toBe(u.searchParams.get("code_challenge"));
    expect(u.toString()).not.toContain(verifier);
  });
  it("follows each platform's parameter conventions", () => {
    const tt = new URL(authorizeUrl(ADAPTERS.tiktok, "ckey", { state: "s".repeat(30), redirectUri: "https://app.example.com/api/social/callback/tiktok", verifier: null }));
    expect(tt.searchParams.get("client_key")).toBe("ckey");
    expect(tt.searchParams.has("client_id")).toBe(false);
    expect(tt.searchParams.get("scope")).toBe("user.info.basic,user.info.profile,user.info.stats");
    expect(tt.searchParams.has("code_challenge")).toBe(false);
    const yt = new URL(authorizeUrl(ADAPTERS.youtube, "cid", { state: "s".repeat(30), redirectUri: "r", verifier: "x".repeat(64) }));
    expect(yt.searchParams.get("access_type")).toBe("offline");
  });
});

describe("bounded provider HTTP", () => {
  it("retries transient failures a bounded number of times", async () => {
    const h = http(json({}, 503), json({}, 502), json({ ok: 1 }));
    await expect(requestJson(h.deps, "https://api.example/x")).resolves.toEqual({ ok: 1 });
    expect(h.calls).toHaveLength(3);
    const g = http(json({}, 503), json({}, 503), json({}, 503), json({}, 503));
    await expect(requestJson(g.deps, "https://api.example/x")).rejects.toMatchObject({ kind: "unavailable" });
    expect(g.calls).toHaveLength(MAX_RETRIES + 1);
  });
  it("honours short Retry-After values and fails fast on long ones", async () => {
    const h = http(json({}, 429, { "retry-after": "2" }), json({ ok: 1 }));
    await requestJson(h.deps, "https://api.example/x");
    expect(h.sleep).toHaveBeenCalledWith(2000);
    const g = http(json({}, 429, { "retry-after": "900" }));
    await expect(requestJson(g.deps, "https://api.example/x")).rejects.toMatchObject({ kind: "rate_limited", retryAfter: 900 });
    expect(g.calls).toHaveLength(1);
  });
  it("never puts response bodies, URLs or tokens into errors", async () => {
    const g = http(new Response(JSON.stringify({ error: "invalid token SECRET-TOKEN-123" }), { status: 401 }));
    const e = await requestJson(g.deps, "https://api.example/me?access_token=SECRET-TOKEN-123").catch((x) => x);
    expect(e).toBeInstanceOf(ProviderError);
    expect(e.kind).toBe("unauthorized");
    expect(`${e.message} ${JSON.stringify(e)}`).not.toContain("SECRET-TOKEN-123");
    expect(problemMessage("unauthorized", "X")).toBe("X no longer accepts Sociotix's access. Reconnect the account to continue.");
  });
});

describe("adapters (mocked official responses)", () => {
  const ctx = (h: ReturnType<typeof http>) => ({ http: h.deps, clientId: "cid", clientSecret: "csecret" });
  const tokens = { accessToken: "AT", refreshToken: null, expiresIn: null, scopes: null };

  it("parses token responses and keeps granted scopes", () => {
    expect(parseTokens({ access_token: "a", refresh_token: "r", expires_in: 3600, scope: "users.read tweet.read" })).toEqual({ accessToken: "a", refreshToken: "r", expiresIn: 3600, scopes: ["users.read", "tweet.read"] });
    expect(() => parseTokens({ token: "nope" })).toThrow(ProviderError);
  });

  it("YouTube: reports a hidden subscriber count as unavailable, never as zero", async () => {
    const h = http(json({ items: [{ id: "UC1", snippet: { title: "Bakery TV", customUrl: "@bakerytv" }, statistics: { hiddenSubscriberCount: true, subscriberCount: "0", videoCount: "42", viewCount: "1000" } }] }));
    const [a] = await ADAPTERS.youtube.accounts(tokens, ctx(h));
    expect(a).toMatchObject({ externalId: "UC1", displayName: "Bakery TV", handle: "@bakerytv", metrics: { "content-count": 42, views: 1000 }, unavailable: ["audience"] });
    expect(h.calls[0]!.init.headers).toMatchObject({ authorization: "Bearer AT" });
    await expect(ADAPTERS.youtube.accounts(tokens, ctx(http(json({ items: [] }))))).rejects.toMatchObject({ kind: "no_accounts" });
  });

  it("X: maps public metrics; Facebook: one account per Page with its own token; links stay on the platform's domain", async () => {
    const [x] = await ADAPTERS.x.accounts(tokens, ctx(http(json({ data: { id: "9", name: "Bakery", username: "bakery", public_metrics: { followers_count: 120, tweet_count: 33 } } }))));
    expect(x).toMatchObject({ handle: "@bakery", profileUrl: "https://x.com/bakery", metrics: { audience: 120, "content-count": 33 } });
    const pages = await ADAPTERS.facebook.accounts(tokens, ctx(http(json({ data: [{ id: "p1", name: "Shop", link: "https://www.facebook.com/shop", followers_count: 5, access_token: "PT1" }, { id: "p2", name: "Evil", link: "https://evil.example/x", access_token: "PT2" }, { id: "p3", name: "No token" }] }))));
    expect(pages.map((p) => [p.externalId, p.profileUrl, p.tokens?.accessToken])).toEqual([
      ["p1", "https://www.facebook.com/shop", "PT1"],
      ["p2", null, "PT2"],
    ]);
    expect(pages[1]!.unavailable).toEqual(["audience"]);
  });
});

describe("customer-safe views", () => {
  it("never include credentials, and only show metrics the platform offers", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    const v = accountView(
      {
        id: "00000000-0000-4000-8000-000000000001",
        customerId: "c",
        provider: "instagram",
        externalId: "ig1",
        displayName: "Bakery",
        handle: "@bakery",
        profileUrl: "https://www.instagram.com/bakery",
        status: "active",
        grantedScopes: ["instagram_business_basic"],
        accessTokenCiphertext: "v1.SECRET-CIPHERTEXT",
        refreshTokenCiphertext: null,
        tokenExpiresAt: null,
        metrics: { audience: 10, views: 99 },
        lastSyncAt: now,
        lastSyncAttemptAt: now,
        lastSyncOk: "ok",
        lastErrorCode: null,
        connectedAt: now,
        disconnectedAt: null,
        revocation: null,
        createdAt: now,
        updatedAt: now,
      },
      now,
    );
    expect(JSON.stringify(v)).not.toMatch(/SECRET|ciphertext|token/i);
    expect(v.metrics).toEqual([{ capability: "audience", label: "Followers", value: 10 }]);
    expect(v.unavailableMetrics).toEqual(["Posts"]);
    expect(v.health).toBe("healthy");
    expect(v.refreshAvailableAt).not.toBeNull();
  });
});

describe("landing page FAQ", () => {
  it("states availability from real configuration and never markets posting as available", () => {
    const off = socialFaq({ instagram: false, facebook: false, tiktok: false, youtube: false, x: false, linkedin: false });
    expect(off.find((f) => f.q === "Can I connect my accounts today?")!.a).toMatch(/^Not yet\./);
    const on = socialFaq({ instagram: false, facebook: false, tiktok: false, youtube: true, x: true, linkedin: false });
    expect(on.find((f) => f.q === "Can I connect my accounts today?")!.a).toMatch(/^Yes, for YouTube and X\./);
    expect(off.find((f) => f.q.includes("schedule"))!.a).toMatch(/^Not yet. You can already write drafts/);
    expect(JSON.stringify(off)).not.toMatch(/guarantee|grow your followers|boost/i);
  });
});
