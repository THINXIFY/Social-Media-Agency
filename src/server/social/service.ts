import "server-only";
import { createHash } from "node:crypto";
import { and, count, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import {
  CAPABILITY_LABEL,
  SOCIAL_PLATFORM,
  SOCIAL_PROVIDER_IDS,
  type SocialAccountView,
  type SocialAvailability,
  type SocialEventType,
  type SocialEventView,
  type SocialHealth,
  type SocialProviderId,
  type SocialWorkspace,
} from "@/lib/social/platforms";
import { audit } from "../audit";
import { authConfigured, decrypt, encrypt, randomToken } from "../auth/crypto";
import type { Db, Executor } from "../db/client";
import { socialConnections, socialEvents, socialOauthStates } from "../db/schema";
import type { Env } from "../env";
import { AppError, errors } from "../errors";
import { logger } from "../log";
import { defaultHttp, type HttpDeps, ProviderError } from "./http";
import { ADAPTERS, type AdapterContext, exchangeCode, type ProviderAccount, type ProviderTokens, type SocialAdapter } from "./providers";

/**
 * Social account connections (AI-06). Server-side only.
 *
 * - Ownership: every read and write is scoped to the session's customer id.
 * - OAuth: random single-use `state` (stored as SHA-256), PKCE S256 where the
 *   platform supports it, a 10-minute expiry, and a redirect URI built from
 *   APP_URL — never from the request — and reused verbatim for the exchange.
 * - Tokens: AES-256-GCM at rest, deleted on disconnect, never returned.
 * - Read-only: profile and the metrics the platform reports, refreshed only
 *   when the customer asks (no background polling), with a cooldown.
 */

export interface SocialDeps {
  env: Env;
  http?: HttpDeps;
  now?: () => Date;
}

const STATE_TTL_MS = 10 * 60_000;
const MAX_PENDING_STATES = 10;
/** Minimum time between manual refreshes of one account. */
export const SYNC_COOLDOWN_MS = 5 * 60_000;
/** Refresh access this long before it expires. */
const EXPIRY_MARGIN_MS = 2 * 60_000;

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
const clock = (deps: SocialDeps) => (deps.now ?? (() => new Date()))();

/* -------------------------------------------------------------------------- */
/*  Availability                                                              */
/* -------------------------------------------------------------------------- */

const enabledList = (env: Env) =>
  new Set(
    (env.SOCIAL_PROVIDERS_ENABLED ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

function credentials(env: Env, id: SocialProviderId): { clientId: string; clientSecret: string } | null {
  const key = id.toUpperCase() as Uppercase<SocialProviderId>;
  const clientId = env[`SOCIAL_${key}_CLIENT_ID`];
  const clientSecret = env[`SOCIAL_${key}_CLIENT_SECRET`];
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * Connectable only when the operator has listed the platform (its app review
 * is complete), its client credentials are set, and token encryption is
 * configured. Customers get one honest reason; configuration details stay
 * server-side.
 */
export function providerAvailability(env: Env, id: SocialProviderId): SocialAvailability {
  const name = SOCIAL_PLATFORM[id].name;
  const ready = enabledList(env).has(id) && credentials(env, id) !== null && !!env.DATA_ENCRYPTION_KEY && !!env.AUTH_SECRET;
  return ready ? { state: "available" } : { state: "unavailable", reason: `${name} connections aren't switched on yet. Sociotix needs ${name}'s approval before accounts can be linked.` };
}

export const redirectUriFor = (env: Env, id: SocialProviderId) => `${env.APP_URL}/api/social/callback/${id}`;

function contextFor(deps: SocialDeps, id: SocialProviderId): AdapterContext {
  const creds = credentials(deps.env, id);
  if (!creds || providerAvailability(deps.env, id).state !== "available") throw errors.featureDisabled(`Connecting ${SOCIAL_PLATFORM[id].name}`);
  return { http: deps.http ?? defaultHttp(), ...creds };
}

/* -------------------------------------------------------------------------- */
/*  Events                                                                    */
/* -------------------------------------------------------------------------- */

async function record(db: Executor, e: { customerId: string; provider: SocialProviderId; type: SocialEventType; message: string; connectionId?: string | null; code?: string | null; at?: Date }) {
  await db.insert(socialEvents).values({ customerId: e.customerId, provider: e.provider, type: e.type, message: e.message.slice(0, 600), connectionId: e.connectionId ?? null, code: e.code ?? null, ...(e.at ? { at: e.at } : {}) });
}

/** Customer-facing explanation of a provider failure. Never includes the platform's raw response. */
export function problemMessage(kind: ProviderError["kind"] | "unknown", name: string): string {
  switch (kind) {
    case "rate_limited":
      return `${name} asked us to slow down. Try again in a few minutes.`;
    case "unauthorized":
      return `${name} no longer accepts Sociotix's access. Reconnect the account to continue.`;
    case "forbidden":
      return `${name} didn't grant the permission Sociotix needs. Reconnect and allow the requested access.`;
    case "unavailable":
      return `${name} didn't respond. Nothing changed — try again shortly.`;
    case "no_accounts":
      return `${name} didn't share an account Sociotix can connect.`;
    default:
      return `${name} sent a response Sociotix couldn't read. Nothing changed — try again shortly.`;
  }
}

/* -------------------------------------------------------------------------- */
/*  Connect                                                                   */
/* -------------------------------------------------------------------------- */

/** Starts an authorization: returns the platform URL to send the customer to. */
export async function startConnection(db: Db, input: { customerId: string; provider: SocialProviderId; connectionId?: string | null }, deps: SocialDeps): Promise<{ url: string }> {
  const adapter = ADAPTERS[input.provider];
  const ctx = contextFor(deps, input.provider);
  const now = clock(deps);

  if (input.connectionId) {
    const [own] = await db
      .select({ id: socialConnections.id })
      .from(socialConnections)
      .where(and(eq(socialConnections.id, input.connectionId), eq(socialConnections.customerId, input.customerId), eq(socialConnections.provider, input.provider), ne(socialConnections.status, "disconnected")))
      .limit(1);
    if (!own) throw errors.notFound("That connected account");
  }

  const [pending] = await db
    .select({ n: count() })
    .from(socialOauthStates)
    .where(and(eq(socialOauthStates.customerId, input.customerId), isNull(socialOauthStates.consumedAt), gt(socialOauthStates.expiresAt, now)));
  if ((pending?.n ?? 0) >= MAX_PENDING_STATES) throw new AppError("RATE_LIMITED", "Too many connection attempts in a short time. Wait a few minutes and try again.");

  const state = randomToken(32);
  const verifier = adapter.pkce ? randomToken(48) : null;
  const redirectUri = redirectUriFor(deps.env, input.provider);
  await db.insert(socialOauthStates).values({
    stateHash: sha256(state),
    customerId: input.customerId,
    provider: input.provider,
    redirectUri,
    codeVerifierCiphertext: verifier ? encrypt(verifier) : null,
    connectionId: input.connectionId ?? null,
    expiresAt: new Date(now.getTime() + STATE_TTL_MS),
  });

  return { url: authorizeUrl(adapter, ctx.clientId, { state, redirectUri, verifier }) };
}

export function authorizeUrl(adapter: SocialAdapter, clientId: string, { state, redirectUri, verifier }: { state: string; redirectUri: string; verifier: string | null }) {
  const u = new URL(adapter.authorizeUrl);
  u.searchParams.set(adapter.clientIdParam, clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", adapter.scopes.join(adapter.scopeSeparator));
  u.searchParams.set("state", state);
  if (verifier) {
    u.searchParams.set("code_challenge", pkceChallenge(verifier));
    u.searchParams.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(adapter.extraAuthorizeParams ?? {})) u.searchParams.set(k, v);
  return u.toString();
}

export type ConnectOutcome = "connected" | "reconnected" | "denied" | "expired" | "linked_elsewhere" | "no_accounts" | "unavailable" | "failed";

/**
 * Completes the callback. The state must exist, be unexpired and unused, and
 * belong to this customer and this platform; it is consumed atomically before
 * anything else happens, so a callback URL can never be replayed.
 */
export async function completeConnection(db: Db, input: { customerId: string; provider: SocialProviderId; params: URLSearchParams }, deps: SocialDeps): Promise<{ outcome: ConnectOutcome; accounts: number }> {
  const { customerId, provider, params } = input;
  const name = SOCIAL_PLATFORM[provider].name;
  const now = clock(deps);
  const state = params.get("state");
  if (!state || state.length < 20 || state.length > 200) return { outcome: "expired", accounts: 0 };

  const [row] = await db
    .update(socialOauthStates)
    .set({ consumedAt: now })
    .where(and(eq(socialOauthStates.stateHash, sha256(state)), isNull(socialOauthStates.consumedAt), gt(socialOauthStates.expiresAt, now)))
    .returning();
  // Wrong customer or platform is treated exactly like an unknown state.
  if (!row || row.customerId !== customerId || row.provider !== provider) return { outcome: "expired", accounts: 0 };

  if (params.get("error")) {
    await record(db, { customerId, provider, type: "connect_failed", code: "denied", message: `You cancelled connecting ${name}. Nothing was connected.` });
    return { outcome: "denied", accounts: 0 };
  }
  const code = params.get("code");
  if (!code || code.length > 2000) {
    await record(db, { customerId, provider, type: "connect_failed", code: "no_code", message: `${name} didn't complete the sign-in. Nothing was connected.` });
    return { outcome: "failed", accounts: 0 };
  }

  let ctx: AdapterContext;
  try {
    ctx = contextFor(deps, provider);
  } catch {
    return { outcome: "unavailable", accounts: 0 };
  }
  const adapter = ADAPTERS[provider];

  let tokens: ProviderTokens;
  let found: ProviderAccount[];
  try {
    tokens = await exchangeCode(adapter, ctx, { code, redirectUri: row.redirectUri, codeVerifier: row.codeVerifierCiphertext ? decrypt(row.codeVerifierCiphertext) : null });
    if (adapter.upgrade) tokens = await adapter.upgrade(tokens, ctx);
    found = await adapter.accounts(tokens, ctx);
    if (!found.length) throw new ProviderError("no_accounts");
  } catch (e) {
    const kind = e instanceof ProviderError ? e.kind : "unknown";
    logger().warn({ provider, kind, status: e instanceof ProviderError ? e.status : null }, "social connect failed");
    await record(db, { customerId, provider, type: "connect_failed", code: kind, message: `Couldn't connect ${name}. ${problemMessage(kind, name)}` });
    return { outcome: kind === "no_accounts" ? "no_accounts" : "failed", accounts: 0 };
  }

  let connected = 0;
  let reconnected = 0;
  let elsewhere = 0;
  await db.transaction(async (tx) => {
    for (const acc of found.slice(0, 25)) {
      const t = acc.tokens ?? tokens;
      const granted = t.scopes ?? adapter.scopes;
      const values = {
        displayName: acc.displayName.slice(0, 200),
        handle: acc.handle?.slice(0, 120) ?? null,
        profileUrl: acc.profileUrl?.slice(0, 500) ?? null,
        status: "active" as const,
        grantedScopes: granted,
        accessTokenCiphertext: encrypt(t.accessToken),
        refreshTokenCiphertext: t.refreshToken ? encrypt(t.refreshToken) : null,
        tokenExpiresAt: t.expiresIn ? new Date(now.getTime() + t.expiresIn * 1000) : null,
        metrics: acc.metrics,
        lastSyncAt: now,
        lastSyncAttemptAt: now,
        lastSyncOk: "ok",
        lastErrorCode: null,
        updatedAt: now,
      };
      const [existing] = await tx
        .select({ id: socialConnections.id, customerId: socialConnections.customerId })
        .from(socialConnections)
        .where(and(eq(socialConnections.provider, provider), eq(socialConnections.externalId, acc.externalId), ne(socialConnections.status, "disconnected")))
        .limit(1)
        .for("update");
      if (existing && existing.customerId !== customerId) {
        elsewhere++;
        await record(tx, { customerId, provider, type: "connect_failed", code: "linked_elsewhere", message: `${acc.displayName} is already connected to a different Sociotix account. Disconnect it there first.` });
        continue;
      }
      if (existing) {
        await tx.update(socialConnections).set(values).where(eq(socialConnections.id, existing.id));
        await record(tx, { customerId, provider, type: "reconnected", connectionId: existing.id, message: `Reconnected ${acc.displayName}. Access is up to date.` });
        reconnected++;
      } else {
        const [created] = await tx.insert(socialConnections).values({ customerId, provider, externalId: acc.externalId, connectedAt: now, ...values }).returning({ id: socialConnections.id });
        await record(tx, { customerId, provider, type: "connected", connectionId: created!.id, message: `Connected ${acc.displayName}.` });
        connected++;
      }
    }
    if (connected || reconnected) await audit(tx, { actorType: "customer", action: "social.connected", targetType: "customer", targetId: customerId, after: { provider, connected, reconnected } });
  });

  // The old connection being reconnected might have authorised a different account; it then stays as it was (needs reconnecting).
  if (connected + reconnected === 0) return { outcome: elsewhere ? "linked_elsewhere" : "failed", accounts: 0 };
  return { outcome: connected ? "connected" : "reconnected", accounts: connected + reconnected };
}

/* -------------------------------------------------------------------------- */
/*  Sync                                                                      */
/* -------------------------------------------------------------------------- */

async function ownConnection(db: Executor, customerId: string, connectionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) throw errors.notFound("That connected account");
  const [c] = await db
    .select()
    .from(socialConnections)
    .where(and(eq(socialConnections.id, connectionId), eq(socialConnections.customerId, customerId)))
    .limit(1);
  if (!c || c.status === "disconnected") throw errors.notFound("That connected account");
  return c;
}

/** Customer-triggered refresh of one account's profile and metrics. */
export async function syncConnection(db: Db, input: { customerId: string; connectionId: string }, deps: SocialDeps): Promise<{ ok: boolean; message: string }> {
  const now = clock(deps);
  const c = await ownConnection(db, input.customerId, input.connectionId);
  const provider = c.provider as SocialProviderId;
  const name = SOCIAL_PLATFORM[provider].name;
  if (c.status === "needs_reauth") throw new AppError("REAUTH_REQUIRED", `Reconnect ${c.displayName} to refresh it.`);
  if (c.lastSyncAttemptAt && now.getTime() - c.lastSyncAttemptAt.getTime() < SYNC_COOLDOWN_MS) {
    throw new AppError("RATE_LIMITED", "This account was refreshed moments ago. You can refresh it again in a few minutes.", { details: { retryAt: new Date(c.lastSyncAttemptAt.getTime() + SYNC_COOLDOWN_MS).toISOString() } });
  }
  const ctx = contextFor(deps, provider);
  const adapter = ADAPTERS[provider];
  // Claim the attempt first so concurrent clicks can't both call the platform.
  const claimed = await db
    .update(socialConnections)
    .set({ lastSyncAttemptAt: now })
    .where(and(eq(socialConnections.id, c.id), c.lastSyncAttemptAt ? eq(socialConnections.lastSyncAttemptAt, c.lastSyncAttemptAt) : isNull(socialConnections.lastSyncAttemptAt)))
    .returning({ id: socialConnections.id });
  if (!claimed.length) throw new AppError("RATE_LIMITED", "This account is already refreshing.");

  let access = c.accessTokenCiphertext ? decrypt(c.accessTokenCiphertext) : null;
  const refresh = c.refreshTokenCiphertext ? decrypt(c.refreshTokenCiphertext) : null;
  try {
    if (!access) throw new ProviderError("unauthorized");
    if (c.tokenExpiresAt && c.tokenExpiresAt.getTime() - EXPIRY_MARGIN_MS <= now.getTime()) {
      if (!adapter.refresh) throw new ProviderError("unauthorized");
      const next = await adapter.refresh({ accessToken: access, refreshToken: refresh }, ctx);
      access = next.accessToken;
      await db
        .update(socialConnections)
        .set({ accessTokenCiphertext: encrypt(next.accessToken), refreshTokenCiphertext: next.refreshToken ? encrypt(next.refreshToken) : null, tokenExpiresAt: next.expiresIn ? new Date(now.getTime() + next.expiresIn * 1000) : null, updatedAt: now })
        .where(eq(socialConnections.id, c.id));
      await record(db, { customerId: c.customerId, provider, type: "access_renewed", connectionId: c.id, message: `Renewed access to ${c.displayName}.` });
    }
    const accounts = await adapter.accounts({ accessToken: access, refreshToken: null, expiresIn: null, scopes: null }, ctx);
    const acc = accounts.find((a) => a.externalId === c.externalId);
    if (!acc) throw new ProviderError("no_accounts");
    await db
      .update(socialConnections)
      .set({ displayName: acc.displayName.slice(0, 200), handle: acc.handle?.slice(0, 120) ?? null, profileUrl: acc.profileUrl?.slice(0, 500) ?? null, metrics: acc.metrics, lastSyncAt: now, lastSyncOk: "ok", lastErrorCode: null, updatedAt: now })
      .where(eq(socialConnections.id, c.id));
    await record(db, { customerId: c.customerId, provider, type: "sync_succeeded", connectionId: c.id, message: `Refreshed ${acc.displayName} from ${name}.` });
    return { ok: true, message: `${acc.displayName} is up to date.` };
  } catch (e) {
    const kind = e instanceof ProviderError ? e.kind : "unknown";
    if (!(e instanceof ProviderError)) logger().error({ provider, err: e instanceof Error ? e.name : "error" }, "social sync failed unexpectedly");
    else logger().warn({ provider, kind, status: e.status }, "social sync failed");
    const expired = kind === "unauthorized";
    await db
      .update(socialConnections)
      .set({ lastSyncOk: "failed", lastErrorCode: kind, updatedAt: now, ...(expired ? { status: "needs_reauth" } : {}) })
      .where(eq(socialConnections.id, c.id));
    const message = kind === "no_accounts" ? `${name} no longer shares ${c.displayName} with Sociotix. Reconnect it to continue.` : problemMessage(kind, name);
    await record(db, { customerId: c.customerId, provider, type: expired ? "access_expired" : "sync_failed", connectionId: c.id, code: kind, message });
    return { ok: false, message };
  }
}

/* -------------------------------------------------------------------------- */
/*  Disconnect                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Deletes Sociotix's copy of the credentials and, where the platform
 * supports it, revokes access there too. A failed revocation is recorded and
 * reported as failed — never as revoked.
 */
export async function disconnectConnection(db: Db, input: { customerId: string; connectionId: string; actorUserId?: string | null }, deps: SocialDeps): Promise<{ revocation: "revoked" | "failed" | "not_supported"; message: string }> {
  const now = clock(deps);
  const c = await ownConnection(db, input.customerId, input.connectionId);
  const provider = c.provider as SocialProviderId;
  const platform = SOCIAL_PLATFORM[provider];
  const adapter = ADAPTERS[provider];

  let revocation: "revoked" | "failed" | "not_supported" = "not_supported";
  if (adapter.revoke && platform.revokeOnDisconnect && c.accessTokenCiphertext) {
    try {
      const ctx = contextFor(deps, provider);
      // Revoking the refresh token (where there is one) ends the whole grant on platforms that support it.
      await adapter.revoke(decrypt(c.refreshTokenCiphertext ?? c.accessTokenCiphertext), ctx);
      revocation = "revoked";
    } catch (e) {
      logger().warn({ provider, kind: e instanceof ProviderError ? e.kind : "unavailable" }, "social revoke failed");
      revocation = "failed";
    }
  }

  const message =
    revocation === "revoked"
      ? `Disconnected ${c.displayName}. ${platform.name} confirmed Sociotix's access was removed.`
      : revocation === "failed"
        ? `Disconnected ${c.displayName} and deleted Sociotix's access. ${platform.name} didn't confirm removing access on its side — to be sure: ${platform.manageAccessHint}`
        : `Disconnected ${c.displayName} and deleted Sociotix's access. ${platform.name} doesn't let apps remove access themselves — to remove it there too: ${platform.manageAccessHint}`;

  await db.transaction(async (tx) => {
    await tx
      .update(socialConnections)
      .set({ status: "disconnected", accessTokenCiphertext: null, refreshTokenCiphertext: null, tokenExpiresAt: null, disconnectedAt: now, revocation, updatedAt: now })
      .where(and(eq(socialConnections.id, c.id), eq(socialConnections.customerId, input.customerId)));
    await record(tx, { customerId: input.customerId, provider, type: "disconnected", connectionId: c.id, code: revocation, message });
    await audit(tx, { actorUserId: input.actorUserId ?? null, actorType: "customer", action: "social.disconnected", targetType: "social_connection", targetId: c.id, after: { provider, revocation } });
  });
  return { revocation, message };
}

/* -------------------------------------------------------------------------- */
/*  Views                                                                     */
/* -------------------------------------------------------------------------- */

type ConnectionRow = typeof socialConnections.$inferSelect;

function health(c: ConnectionRow): { health: SocialHealth; note: string } {
  const name = SOCIAL_PLATFORM[c.provider as SocialProviderId].name;
  if (c.status === "disconnected") return { health: "disconnected", note: "Disconnected. Sociotix holds no access to this account." };
  if (c.status === "needs_reauth") return { health: "action_needed", note: `${name} access has ended. Reconnect to keep this account up to date.` };
  if (c.lastSyncOk === "failed") return { health: "sync_issue", note: problemMessage((c.lastErrorCode ?? "unknown") as ProviderError["kind"], name) };
  if (!c.lastSyncAt) return { health: "not_synced", note: "Connected. Refresh to load the latest details." };
  return { health: "healthy", note: "Connected and up to date as of the last refresh." };
}

export function accountView(c: ConnectionRow, now = new Date()): SocialAccountView {
  const provider = c.provider as SocialProviderId;
  const platform = SOCIAL_PLATFORM[provider];
  const h = health(c);
  // In the platform's own order (followers first), never the storage order.
  const metrics = platform.capabilities
    .filter((k) => k !== "profile" && typeof c.metrics?.[k] === "number")
    .map((k) => [k, c.metrics![k]!] as const)
    .map(([k, v]) => ({ capability: k as SocialAccountView["metrics"][number]["capability"], label: k === "audience" ? platform.nouns.audience : k === "content-count" ? platform.nouns.content : CAPABILITY_LABEL[k as "views"], value: v }));
  const unavailable = c.lastSyncOk === "ok" ? platform.capabilities.filter((k) => k !== "profile" && !metrics.some((m) => m.capability === k)).map((k) => (k === "audience" ? platform.nouns.audience : k === "content-count" ? platform.nouns.content : CAPABILITY_LABEL[k])) : [];
  const retryAt = c.lastSyncAttemptAt ? c.lastSyncAttemptAt.getTime() + SYNC_COOLDOWN_MS : 0;
  return {
    id: c.id,
    provider,
    displayName: c.displayName,
    handle: c.handle,
    profileUrl: c.profileUrl,
    status: c.status as SocialAccountView["status"],
    health: h.health,
    healthNote: h.note,
    metrics,
    unavailableMetrics: unavailable,
    grantedPermissions: platform.permissions.map((p) => p.label),
    connectedAt: c.connectedAt.toISOString(),
    lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
    lastSyncOk: c.lastSyncOk === null ? null : c.lastSyncOk === "ok",
    refreshAvailableAt: retryAt > now.getTime() ? new Date(retryAt).toISOString() : null,
    disconnectedAt: c.disconnectedAt?.toISOString() ?? null,
    revocation: (c.revocation as SocialAccountView["revocation"]) ?? null,
  };
}

/** Everything the customer's Social workspace shows. Tokens never leave this function. */
export async function socialWorkspace(db: Db, customerId: string, env: Env): Promise<SocialWorkspace> {
  const [rows, events] = await Promise.all([
    db
      .select()
      .from(socialConnections)
      .where(and(eq(socialConnections.customerId, customerId), ne(socialConnections.status, "disconnected")))
      .orderBy(socialConnections.connectedAt),
    db
      .select({ id: socialEvents.id, provider: socialEvents.provider, type: socialEvents.type, message: socialEvents.message, at: socialEvents.at, connectionId: socialEvents.connectionId, accountName: socialConnections.displayName, accountStatus: socialConnections.status })
      .from(socialEvents)
      .leftJoin(socialConnections, and(eq(socialConnections.id, socialEvents.connectionId), eq(socialConnections.customerId, customerId)))
      .where(eq(socialEvents.customerId, customerId))
      .orderBy(desc(socialEvents.at), desc(sql`${socialEvents.id}`))
      .limit(60),
  ]);
  const now = new Date();
  return {
    platforms: SOCIAL_PROVIDER_IDS.map((id) => ({ id, availability: providerAvailability(env, id) })),
    accounts: rows.map((r) => accountView(r, now)),
    events: events.map(
      (e): SocialEventView => ({
        id: e.id,
        provider: e.provider as SocialProviderId,
        type: e.type as SocialEventType,
        message: e.message,
        accountName: e.accountName,
        // Only link to accounts that are still connected.
        accountId: e.accountStatus && e.accountStatus !== "disconnected" ? e.connectionId : null,
        at: e.at.toISOString(),
      }),
    ),
  };
}

/** Whether any platform can be connected — used by the public page (rendered at build time). */
export function socialConnectionsReady(env: Env) {
  return authConfigured() && SOCIAL_PROVIDER_IDS.some((id) => providerAvailability(env, id).state === "available");
}
