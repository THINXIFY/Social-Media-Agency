import "server-only";
import type { SocialCapability, SocialProviderId } from "@/lib/social/platforms";
import { form, type HttpDeps, ProviderError, requestJson } from "./http";

/**
 * Provider adapters (AI-06): one OAuth 2.0 authorization-code engine with a
 * small, declarative adapter per platform — endpoints, minimal read-only
 * scopes, PKCE support, revocation, and one function that maps the
 * platform's official profile response to an account. No adapter can post,
 * message, edit or spend: none requests a scope that would allow it.
 *
 * Endpoints and scopes follow each platform's official documentation at the
 * time of writing. They are exercised with mocked HTTP only until an
 * operator supplies real credentials; re-check them against the platform's
 * current docs when switching a platform on (see docs/ai/AI_06_REPORT.md).
 */

export interface ProviderTokens {
  accessToken: string;
  refreshToken: string | null;
  /** Seconds until the access token expires, if the platform says. */
  expiresIn: number | null;
  /** Scopes actually granted, when the platform reports them. */
  scopes: string[] | null;
}

export type ProviderMetrics = Partial<Record<Exclude<SocialCapability, "profile">, number>>;

export interface ProviderAccount {
  externalId: string;
  displayName: string;
  handle: string | null;
  profileUrl: string | null;
  metrics: ProviderMetrics;
  /** Capabilities the platform offers but didn't report for this account (e.g. hidden subscriber count). */
  unavailable: Exclude<SocialCapability, "profile">[];
  /** Account-specific tokens (Facebook Pages each have their own). */
  tokens?: ProviderTokens;
}

export interface AdapterContext {
  http: HttpDeps;
  clientId: string;
  clientSecret: string;
}

export interface SocialAdapter {
  id: SocialProviderId;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  scopeSeparator: " " | ",";
  /** PKCE (S256) is sent only where the platform documents support for it. */
  pkce: boolean;
  /** TikTok calls the client id `client_key`. */
  clientIdParam: "client_id" | "client_key";
  /** How the token endpoint authenticates the client. */
  tokenAuth: "body" | "basic";
  extraAuthorizeParams?: Record<string, string>;
  /** Exchange a short-lived token for a long-lived one (Meta platforms). */
  upgrade?: (tokens: ProviderTokens, ctx: AdapterContext) => Promise<ProviderTokens>;
  /** Renew access. Absent = the customer must reconnect when access expires. */
  refresh?: (tokens: { accessToken: string; refreshToken: string | null }, ctx: AdapterContext) => Promise<ProviderTokens>;
  /** Revoke access at the platform. Absent = not supported; the customer is told how to remove access themselves. */
  revoke?: (token: string, ctx: AdapterContext) => Promise<void>;
  /** The account(s) this authorization covers, with metrics exactly as the platform reports them. */
  accounts: (tokens: ProviderTokens, ctx: AdapterContext) => Promise<ProviderAccount[]>;
}

/* -------------------------------------------------------------------------- */
/*  Shared OAuth helpers                                                      */
/* -------------------------------------------------------------------------- */

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
/** Numbers may arrive as strings (YouTube). Only finite, non-negative integers are kept. */
const count = (v: unknown): number | null => {
  const n = typeof v === "string" && /^\d{1,15}$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
};

export function parseTokens(body: Json): ProviderTokens {
  // Some platforms nest the payload (TikTok v1 style, Instagram legacy).
  const src = (Array.isArray(body.data) ? (body.data[0] as Json) : null) ?? body;
  const accessToken = str(src.access_token);
  if (!accessToken) throw new ProviderError("bad_response");
  const expires = count(src.expires_in);
  const scope = str(src.scope) ?? (Array.isArray(src.permissions) ? (src.permissions as unknown[]).filter((p) => typeof p === "string").join(",") : null) ?? str(src.permissions);
  return { accessToken, refreshToken: str(src.refresh_token), expiresIn: expires, scopes: scope ? scope.split(/[\s,]+/).filter(Boolean) : null };
}

const basic = (ctx: AdapterContext) => `Basic ${Buffer.from(`${encodeURIComponent(ctx.clientId)}:${encodeURIComponent(ctx.clientSecret)}`).toString("base64")}`;

async function tokenRequest(adapter: SocialAdapter, ctx: AdapterContext, fields: Record<string, string | undefined>): Promise<ProviderTokens> {
  const clientFields = adapter.tokenAuth === "body" ? { [adapter.clientIdParam]: ctx.clientId, client_secret: ctx.clientSecret } : {};
  const body = await requestJson<Json>(ctx.http, adapter.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(adapter.tokenAuth === "basic" ? { authorization: basic(ctx) } : {}) },
    body: form({ ...clientFields, ...fields }),
  });
  return parseTokens(body);
}

/** Authorization-code exchange with the exact redirect URI used to start the flow. */
export function exchangeCode(adapter: SocialAdapter, ctx: AdapterContext, { code, redirectUri, codeVerifier }: { code: string; redirectUri: string; codeVerifier: string | null }) {
  return tokenRequest(adapter, ctx, { grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: adapter.pkce ? (codeVerifier ?? undefined) : undefined });
}

const standardRefresh =
  (adapter: () => SocialAdapter) =>
  async (t: { refreshToken: string | null }, ctx: AdapterContext): Promise<ProviderTokens> => {
    if (!t.refreshToken) throw new ProviderError("unauthorized");
    const next = await tokenRequest(adapter(), ctx, { grant_type: "refresh_token", refresh_token: t.refreshToken });
    // Platforms that don't rotate refresh tokens omit them; keep the current one.
    return { ...next, refreshToken: next.refreshToken ?? t.refreshToken };
  };

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/* -------------------------------------------------------------------------- */
/*  Adapters                                                                  */
/* -------------------------------------------------------------------------- */

const META_VERSION = "v23.0";

/** Instagram API with Instagram Login — professional (Business/Creator) accounts. */
const instagram: SocialAdapter = {
  id: "instagram",
  authorizeUrl: "https://www.instagram.com/oauth/authorize",
  tokenUrl: "https://api.instagram.com/oauth/access_token",
  scopes: ["instagram_business_basic"],
  scopeSeparator: ",",
  pkce: false,
  clientIdParam: "client_id",
  tokenAuth: "body",
  async upgrade(t, ctx) {
    const u = new URL("https://graph.instagram.com/access_token");
    u.search = form({ grant_type: "ig_exchange_token", client_secret: ctx.clientSecret, access_token: t.accessToken }).toString();
    return { ...parseTokens(await requestJson(ctx.http, u.toString())), scopes: t.scopes };
  },
  // Long-lived Instagram tokens are renewed with the token itself.
  async refresh(t, ctx) {
    const u = new URL("https://graph.instagram.com/refresh_access_token");
    u.search = form({ grant_type: "ig_refresh_token", access_token: t.accessToken }).toString();
    return { ...parseTokens(await requestJson(ctx.http, u.toString())), refreshToken: null };
  },
  async accounts(t, ctx) {
    const u = new URL("https://graph.instagram.com/me");
    u.search = form({ fields: "user_id,username,name,followers_count,media_count", access_token: t.accessToken }).toString();
    const me = await requestJson<Json>(ctx.http, u.toString());
    const id = str(me.user_id) ?? str(me.id);
    const username = str(me.username);
    if (!id || !username) throw new ProviderError("bad_response");
    return [withMetrics({ externalId: id, displayName: str(me.name) ?? username, handle: `@${username}`, profileUrl: `https://www.instagram.com/${encodeURIComponent(username)}` }, { audience: count(me.followers_count), "content-count": count(me.media_count) })];
  },
};

/** Facebook Login for Pages: each Page the customer chooses becomes its own connection. */
const facebook: SocialAdapter = {
  id: "facebook",
  authorizeUrl: `https://www.facebook.com/${META_VERSION}/dialog/oauth`,
  tokenUrl: `https://graph.facebook.com/${META_VERSION}/oauth/access_token`,
  scopes: ["pages_show_list", "pages_read_engagement"],
  scopeSeparator: ",",
  pkce: false,
  clientIdParam: "client_id",
  tokenAuth: "body",
  async upgrade(t, ctx) {
    const u = new URL(`https://graph.facebook.com/${META_VERSION}/oauth/access_token`);
    u.search = form({ grant_type: "fb_exchange_token", client_id: ctx.clientId, client_secret: ctx.clientSecret, fb_exchange_token: t.accessToken }).toString();
    return { ...parseTokens(await requestJson(ctx.http, u.toString())), scopes: t.scopes };
  },
  async accounts(t, ctx) {
    const u = new URL(`https://graph.facebook.com/${META_VERSION}/me/accounts`);
    u.search = form({ fields: "id,name,link,followers_count,access_token", limit: "25" }).toString();
    const body = await requestJson<Json>(ctx.http, u.toString(), { headers: bearer(t.accessToken) });
    const pages = Array.isArray(body.data) ? (body.data as Json[]) : [];
    return pages.flatMap((p) => {
      const id = str(p.id);
      const name = str(p.name);
      const token = str(p.access_token);
      if (!id || !name || !token) return [];
      // Page tokens obtained from a long-lived user token don't expire.
      return [{ ...withMetrics({ externalId: id, displayName: name, handle: null, profileUrl: safeUrl(p.link, ["facebook.com"]) }, { audience: count(p.followers_count) }), tokens: { accessToken: token, refreshToken: null, expiresIn: null, scopes: t.scopes } }];
    });
  },
};

/** TikTok Login Kit (web). */
const tiktok: SocialAdapter = {
  id: "tiktok",
  authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
  tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
  scopes: ["user.info.basic", "user.info.profile", "user.info.stats"],
  scopeSeparator: ",",
  pkce: false,
  clientIdParam: "client_key",
  tokenAuth: "body",
  refresh: standardRefresh(() => tiktok),
  async revoke(token, ctx) {
    await requestJson(ctx.http, "https://open.tiktokapis.com/v2/oauth/revoke/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ client_key: ctx.clientId, client_secret: ctx.clientSecret, token }) });
  },
  async accounts(t, ctx) {
    const u = new URL("https://open.tiktokapis.com/v2/user/info/");
    u.search = form({ fields: "open_id,display_name,username,profile_deep_link,follower_count,video_count" }).toString();
    const body = await requestJson<Json>(ctx.http, u.toString(), { headers: bearer(t.accessToken) });
    const user = ((body.data as Json | undefined)?.user ?? null) as Json | null;
    const id = user && str(user.open_id);
    if (!user || !id) throw new ProviderError("bad_response");
    const username = str(user.username);
    return [withMetrics({ externalId: id, displayName: str(user.display_name) ?? username ?? "TikTok account", handle: username ? `@${username}` : null, profileUrl: safeUrl(user.profile_deep_link, ["tiktok.com"]) }, { audience: count(user.follower_count), "content-count": count(user.video_count) })];
  },
};

/** YouTube Data API v3 through Google OAuth, read-only. */
const youtube: SocialAdapter = {
  id: "youtube",
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
  scopeSeparator: " ",
  pkce: true,
  clientIdParam: "client_id",
  tokenAuth: "body",
  // A refresh token is only issued for offline access; consent makes sure it's returned on reconnect too.
  extraAuthorizeParams: { access_type: "offline", prompt: "consent" },
  refresh: standardRefresh(() => youtube),
  async revoke(token, ctx) {
    await requestJson(ctx.http, "https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ token }) });
  },
  async accounts(t, ctx) {
    const body = await requestJson<Json>(ctx.http, "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true", { headers: bearer(t.accessToken) });
    const items = Array.isArray(body.items) ? (body.items as Json[]) : [];
    if (!items.length) throw new ProviderError("no_accounts");
    return items.slice(0, 5).flatMap((c) => {
      const id = str(c.id);
      const snippet = (c.snippet ?? {}) as Json;
      const stats = (c.statistics ?? {}) as Json;
      const title = str(snippet.title);
      if (!id || !title) return [];
      const custom = str(snippet.customUrl);
      return [withMetrics({ externalId: id, displayName: title, handle: custom ? (custom.startsWith("@") ? custom : `@${custom}`) : null, profileUrl: `https://www.youtube.com/channel/${encodeURIComponent(id)}` }, { audience: stats.hiddenSubscriberCount === true ? null : count(stats.subscriberCount), "content-count": count(stats.videoCount), views: count(stats.viewCount) })];
    });
  },
};

/** X API v2, OAuth 2.0 with PKCE (required by X). */
const x: SocialAdapter = {
  id: "x",
  authorizeUrl: "https://x.com/i/oauth2/authorize",
  tokenUrl: "https://api.x.com/2/oauth2/token",
  scopes: ["users.read", "tweet.read", "offline.access"],
  scopeSeparator: " ",
  pkce: true,
  clientIdParam: "client_id",
  tokenAuth: "basic",
  refresh: standardRefresh(() => x),
  async revoke(token, ctx) {
    await requestJson(ctx.http, "https://api.x.com/2/oauth2/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: basic(ctx) }, body: form({ token, token_type_hint: "access_token" }) });
  },
  async accounts(t, ctx) {
    const body = await requestJson<Json>(ctx.http, "https://api.x.com/2/users/me?user.fields=public_metrics", { headers: bearer(t.accessToken) });
    const d = (body.data ?? null) as Json | null;
    const id = d && str(d.id);
    const username = d && str(d.username);
    if (!d || !id || !username) throw new ProviderError("bad_response");
    const m = (d.public_metrics ?? {}) as Json;
    return [withMetrics({ externalId: id, displayName: str(d.name) ?? username, handle: `@${username}`, profileUrl: `https://x.com/${encodeURIComponent(username)}` }, { audience: count(m.followers_count), "content-count": count(m.tweet_count) })];
  },
};

/** Sign In with LinkedIn using OpenID Connect: name only. */
const linkedin: SocialAdapter = {
  id: "linkedin",
  authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
  tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
  scopes: ["openid", "profile"],
  scopeSeparator: " ",
  pkce: false,
  clientIdParam: "client_id",
  tokenAuth: "body",
  async accounts(t, ctx) {
    const me = await requestJson<Json>(ctx.http, "https://api.linkedin.com/v2/userinfo", { headers: bearer(t.accessToken) });
    const id = str(me.sub);
    const name = str(me.name) ?? [str(me.given_name), str(me.family_name)].filter(Boolean).join(" ");
    if (!id || !name) throw new ProviderError("bad_response");
    return [{ externalId: id, displayName: name, handle: null, profileUrl: null, metrics: {}, unavailable: [] }];
  },
};

export const ADAPTERS: Record<SocialProviderId, SocialAdapter> = { instagram, facebook, tiktok, youtube, x, linkedin };

/* -------------------------------------------------------------------------- */

const CAPS: Exclude<SocialCapability, "profile">[] = ["audience", "content-count", "views"];

/** Keeps only the metrics the platform actually returned; the rest are reported as unavailable, never zero. */
function withMetrics(base: Omit<ProviderAccount, "metrics" | "unavailable">, values: Partial<Record<Exclude<SocialCapability, "profile">, number | null>>): ProviderAccount {
  const metrics: ProviderMetrics = {};
  const unavailable: Exclude<SocialCapability, "profile">[] = [];
  for (const c of CAPS) {
    if (!(c in values)) continue;
    const v = values[c];
    if (typeof v === "number") metrics[c] = v;
    else unavailable.push(c);
  }
  return { ...base, metrics, unavailable };
}

/** An https link on the platform's own domain, or nothing. */
function safeUrl(v: unknown, hosts: string[]): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`)) ? u.toString() : null;
  } catch {
    return null;
  }
}
