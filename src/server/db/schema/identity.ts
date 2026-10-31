import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  ACCESS_LEVEL,
  ACCOUNT_TYPE,
  AUTH_TOKEN_PURPOSE,
  DATE_FORMAT,
  DISPLAY_CURRENCY,
  MFA_TYPE,
  MODULE,
  SENSITIVE_PERMISSION,
  SESSION_KIND,
  STAFF_STATUS,
  USER_STATUS,
} from "./enums";
import { createdAt, oneOf, ts, updatedAt } from "./helpers";

/* -------------------------------------------------------------------------- */
/*  Users & sessions (Phase 5B fills these; 5A only defines them)             */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    /** Display name (e.g. "Farhan Z."). Customers also have first/last name on their profile. */
    name: text("name").notNull().default(""),
    emailVerifiedAt: ts("email_verified_at"),
    /** argon2id hash; null until a password is set (e.g. invited staff). */
    passwordHash: text("password_hash"),
    status: text("status").notNull().default("active"),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_lower_key").on(sql`lower(${t.email})`),
    check("users_status_check", oneOf(t.status, USER_STATUS)),
    check("users_name_check", sql`length(${t.name}) <= 80`),
    check("users_email_format_check", sql`${t.email} ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$' and length(${t.email}) <= 254`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the cookie token. The token itself is never stored. */
    tokenHash: text("token_hash").notNull(),
    kind: text("kind").notNull(),
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    mfaVerifiedAt: ts("mfa_verified_at"),
    /** Last time the user re-entered credentials; sensitive actions need this to be recent. */
    reauthenticatedAt: ts("reauthenticated_at"),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [uniqueIndex("sessions_token_hash_key").on(t.tokenHash), index("sessions_user_idx").on(t.userId, t.kind), index("sessions_expires_idx").on(t.expiresAt), check("sessions_kind_check", oneOf(t.kind, SESSION_KIND))],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("auth_tokens_token_hash_key").on(t.tokenHash), index("auth_tokens_user_idx").on(t.userId), check("auth_tokens_purpose_check", oneOf(t.purpose, AUTH_TOKEN_PURPOSE))],
);

export const mfaFactors = pgTable(
  "mfa_factors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("totp"),
    /** Encrypted with the data-encryption key; never readable by the client. */
    secretCiphertext: text("secret_ciphertext").notNull(),
    confirmedAt: ts("confirmed_at"),
    /** Highest TOTP time-step accepted so far — a code can never be used twice. */
    lastUsedStep: bigint("last_used_step", { mode: "number" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("mfa_factors_one_totp_key").on(t.userId).where(sql`${t.type} = 'totp'`), check("mfa_factors_type_check", oneOf(t.type, MFA_TYPE))],
);

export const mfaRecoveryCodes = pgTable(
  "mfa_recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("mfa_recovery_codes_user_idx").on(t.userId), uniqueIndex("mfa_recovery_codes_hash_key").on(t.codeHash)],
);

/* -------------------------------------------------------------------------- */
/*  Customers                                                                 */
/* -------------------------------------------------------------------------- */

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Staff-facing reference, e.g. CUS-1041. */
    publicRef: text("public_ref").notNull(),
    /** Customer-facing account number, e.g. ACC-7F3K29. */
    accountRef: text("account_ref").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    displayName: text("display_name"),
    country: text("country"),
    accountType: text("account_type").notNull().default("personal"),
    businessName: text("business_name"),
    website: text("website"),
    phone: text("phone"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("customers_user_key").on(t.userId),
    uniqueIndex("customers_public_ref_key").on(t.publicRef),
    uniqueIndex("customers_account_ref_key").on(t.accountRef),
    index("customers_created_idx").on(t.createdAt),
    check("customers_public_ref_check", sql`${t.publicRef} ~ '^CUS-[A-Z0-9]+$'`),
    check("customers_account_ref_check", sql`${t.accountRef} ~ '^ACC-[A-Z0-9]+$'`),
    check("customers_account_type_check", oneOf(t.accountType, ACCOUNT_TYPE)),
    check("customers_business_name_check", sql`${t.accountType} <> 'business' or ${t.businessName} is not null`),
  ],
);

export const customerPreferences = pgTable(
  "customer_preferences",
  {
    customerId: uuid("customer_id")
      .primaryKey()
      .references(() => customers.id, { onDelete: "cascade" }),
    language: text("language").notNull().default("en"),
    displayCurrency: text("display_currency").notNull().default("USD"),
    timezone: text("timezone").notNull().default("UTC"),
    dateFormat: text("date_format").notNull().default("mdy"),
    reduceMotion: boolean("reduce_motion").notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [check("customer_preferences_currency_check", oneOf(t.displayCurrency, DISPLAY_CURRENCY)), check("customer_preferences_date_format_check", oneOf(t.dateFormat, DATE_FORMAT))],
);

export const customerFlags = pgTable(
  "customer_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [index("customer_flags_customer_idx").on(t.customerId)],
);

/* -------------------------------------------------------------------------- */
/*  Staff, roles & permissions                                                */
/* -------------------------------------------------------------------------- */

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("roles_key_key").on(t.key), check("roles_key_format_check", sql`${t.key} ~ '^[a-z][a-z0-9_]{1,39}$'`)],
);

export const roleModuleAccess = pgTable(
  "role_module_access",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    module: text("module").notNull(),
    level: text("level").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.module] }), check("role_module_access_module_check", oneOf(t.module, MODULE)), check("role_module_access_level_check", oneOf(t.level, ACCESS_LEVEL))],
);

export const roleSensitivePermissions = pgTable(
  "role_sensitive_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] }), check("role_sensitive_permissions_check", oneOf(t.permission, SENSITIVE_PERMISSION))],
);

export const staffMembers = pgTable(
  "staff_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("invited"),
    disabledAt: ts("disabled_at"),
    disabledBy: uuid("disabled_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("staff_members_user_key").on(t.userId),
    index("staff_members_role_idx").on(t.roleId),
    check("staff_members_status_check", oneOf(t.status, STAFF_STATUS)),
    check("staff_members_disabled_check", sql`(${t.status} = 'disabled') = (${t.disabledAt} is not null)`),
  ],
);

export const staffInvitations = pgTable(
  "staff_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicRef: text("public_ref").notNull(),
    email: text("email").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    message: text("message"),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("staff_invitations_public_ref_key").on(t.publicRef),
    uniqueIndex("staff_invitations_token_hash_key").on(t.tokenHash),
    uniqueIndex("staff_invitations_open_email_key")
      .on(sql`lower(${t.email})`)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
    check("staff_invitations_public_ref_check", sql`${t.publicRef} ~ '^INV-[A-Z0-9]{6,}$'`),
    check("staff_invitations_message_check", sql`${t.message} is null or length(${t.message}) <= 300`),
  ],
);

/** Fixed-window counters for login, MFA, signup and recovery rate limits. Keys are HMACs, never raw emails or IPs. */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] }), index("rate_limit_buckets_window_idx").on(t.windowStart)],
);
