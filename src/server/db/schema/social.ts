import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { customers } from "./identity";
import { createdAt, oneOf, ts, updatedAt } from "./helpers";

/*
 * Social account connections (AI-06). Read-only links to a customer's own
 * social accounts through each platform's official OAuth. Tokens are stored
 * only as AES-256-GCM ciphertext and are deleted on disconnect; nothing here
 * is ever sent to the browser.
 */

export const SOCIAL_PROVIDERS = ["instagram", "facebook", "tiktok", "youtube", "x", "linkedin"] as const;
export const SOCIAL_STATUS = ["active", "needs_reauth", "disconnected"] as const;
export const SOCIAL_REVOCATION = ["revoked", "failed", "not_supported"] as const;
export const SOCIAL_EVENT_TYPES = ["connect_started", "connected", "reconnected", "connect_failed", "sync_succeeded", "sync_failed", "access_renewed", "access_expired", "disconnected", "post_scheduled", "post_cancelled", "post_published", "post_failed", "post_unconfirmed"] as const;

/**
 * One OAuth authorisation in flight. The `state` value only exists in the
 * redirect URL; the table keeps its SHA-256. The PKCE verifier is encrypted.
 * Single use (consumed_at) and short-lived (expires_at).
 */
export const socialOauthStates = pgTable(
  "social_oauth_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stateHash: text("state_hash").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    /** The exact redirect URI sent to the platform; the token exchange must reuse it. */
    redirectUri: text("redirect_uri").notNull(),
    codeVerifierCiphertext: text("code_verifier_ciphertext"),
    /** Set when reconnecting an existing connection. */
    connectionId: uuid("connection_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: ts("consumed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("social_oauth_states_hash_idx").on(t.stateHash),
    index("social_oauth_states_customer_idx").on(t.customerId, t.createdAt),
    check("social_oauth_states_provider_check", oneOf(t.provider, SOCIAL_PROVIDERS)),
  ],
);

export const socialConnections = pgTable(
  "social_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    /** The platform's own id for the account (or Page / channel). */
    externalId: text("external_id").notNull(),
    displayName: text("display_name").notNull(),
    handle: text("handle"),
    profileUrl: text("profile_url"),
    status: text("status").notNull().default("active"),
    /** Scopes the platform actually granted (may be fewer than requested). */
    grantedScopes: text("granted_scopes").array().notNull().default(sql`'{}'::text[]`),
    accessTokenCiphertext: text("access_token_ciphertext"),
    refreshTokenCiphertext: text("refresh_token_ciphertext"),
    tokenExpiresAt: ts("token_expires_at"),
    /** Metrics exactly as returned by the last successful sync: { capability: number }. */
    metrics: jsonb("metrics").$type<Record<string, number>>(),
    lastSyncAt: ts("last_sync_at"),
    lastSyncAttemptAt: ts("last_sync_attempt_at"),
    lastSyncOk: text("last_sync_ok"),
    lastErrorCode: text("last_error_code"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    disconnectedAt: ts("disconnected_at"),
    revocation: text("revocation"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("social_connections_customer_idx").on(t.customerId, t.status),
    // A platform account can be connected to one SociVanta account at a time.
    uniqueIndex("social_connections_live_idx").on(t.provider, t.externalId).where(sql`${t.status} <> 'disconnected'`),
    check("social_connections_provider_check", oneOf(t.provider, SOCIAL_PROVIDERS)),
    check("social_connections_status_check", oneOf(t.status, SOCIAL_STATUS)),
    check("social_connections_revocation_check", sql`${t.revocation} is null or ${t.revocation} in ('revoked', 'failed', 'not_supported')`),
    check("social_connections_sync_ok_check", sql`${t.lastSyncOk} is null or ${t.lastSyncOk} in ('ok', 'failed')`),
    // A disconnected account keeps no credentials.
    check("social_connections_tokens_check", sql`${t.status} <> 'disconnected' or (${t.accessTokenCiphertext} is null and ${t.refreshTokenCiphertext} is null)`),
  ],
);

/** The customer-visible history of connections and syncs. Messages are written for people and never include credentials. */
export const socialEvents = pgTable(
  "social_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").references(() => socialConnections.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    type: text("type").notNull(),
    message: text("message").notNull(),
    code: text("code"),
    at: createdAt(),
  },
  (t) => [
    index("social_events_customer_idx").on(t.customerId, t.at),
    index("social_events_connection_idx").on(t.connectionId, t.at),
    check("social_events_provider_check", oneOf(t.provider, SOCIAL_PROVIDERS)),
    check("social_events_type_check", oneOf(t.type, SOCIAL_EVENT_TYPES)),
  ],
);
