import "server-only";
import { z } from "zod";

/**
 * Centralised, validated server configuration. Read lazily (never at import
 * time) so the public site keeps working when no backend is configured.
 *
 * Validation messages name the variable, never its value.
 */

/** An empty variable (e.g. `AI_API_KEY=` copied from .env.example) means "not set" — never "", and never 0 for numbers. */
const blank = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const databaseUrl = z
  .string()
  .trim()
  .min(1)
  .refine((v) => {
    try {
      return ["postgres:", "postgresql:"].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  }, "must be a postgres:// or postgresql:// connection URL");

/** A base64/base64url secret that decodes to at least 32 bytes. */
const secret32 = z
  .string()
  .trim()
  .refine((v) => Buffer.from(v, "base64").length >= 32, "must be at least 32 random bytes, base64-encoded (run npm run auth:secrets)");

const bool = z.enum(["true", "false"]).transform((v) => v === "true");

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Deployment stage. Must be set explicitly whenever NODE_ENV is production. */
    APP_ENV: z.enum(["development", "test", "preview", "production"]).optional(),
    DATABASE_URL: databaseUrl.optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

    /** Public origin used in email links, e.g. https://app.example.com. */
    APP_URL: z.string().trim().url().optional(),
    /** Keys for HMACs (recovery codes, rate-limit keys). */
    AUTH_SECRET: secret32.optional(),
    /** AES-256-GCM key for MFA secrets (and provider credentials later). */
    DATA_ENCRYPTION_KEY: secret32.optional(),
    /** capture = write emails to .local/mail (development/test only). */
    EMAIL_TRANSPORT: z.enum(["capture", "resend", "postmark"]).optional(),
    EMAIL_FROM: z.string().trim().min(3).optional(),
    EMAIL_API_KEY: z.string().trim().min(10).optional(),
    /** Show the illustrative dashboard/admin records to signed-in users (never in production). */
    DEMO_MODE: bool.default(false),
    /** Trust x-forwarded-for from the hosting platform's proxy for client IPs. */
    TRUST_PROXY_HEADERS: bool.default(false),

    /**
     * Manual bank transfer (Phase 5D). Off unless the operator turns it on AND
     * supplies the business's real receiving account. Nothing here is a secret,
     * but nothing is ever defaulted or invented: missing details keep it off.
     */
    PAYMENTS_BANK_ENABLED: bool.default(false),
    PAYMENTS_BANK_ACCOUNT_NAME: z.string().trim().min(2).max(120).optional(),
    PAYMENTS_BANK_NAME: z.string().trim().min(2).max(120).optional(),
    /** IBAN or account number. */
    PAYMENTS_BANK_ACCOUNT: z.string().trim().min(4).max(40).optional(),
    /** SWIFT/BIC, sort code or routing number (optional). */
    PAYMENTS_BANK_ROUTING: z.string().trim().min(3).max(40).optional(),

    /**
     * When completed orders become earned revenue (decision D5). `deferred` (the
     * default while D5 is open) keeps every order total as funds committed to
     * orders; `on_completion` recognises it when an order completes with evidence.
     */
    REVENUE_RECOGNITION_POLICY: z.enum(["deferred", "on_completion"]).default("deferred"),

    /**
     * Sociotix AI (AI-01). Off unless a provider is chosen, its key and model
     * are set, an adapter for it exists in code, and a daily budget is above
     * zero. Keys are server-only and never sent to the browser.
     */
    AI_PROVIDER: z.enum(["none", "anthropic", "openai"]).default("none"),
    AI_API_KEY: blank(z.string().trim().min(20).optional()),
    AI_MODEL: blank(z.string().trim().min(2).max(100).optional()),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(20_000),
    /** Platform-wide AI spend allowed per UTC day, in micro-dollars. 0 = no spending. */
    AI_DAILY_BUDGET_MICROS: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
    /** Allow visitors without an account to use free tools. Off until cost controls are proven. */
    AI_ANONYMOUS_ENABLED: bool.default(false),
    /**
     * AI-02 launch switch. Generation stays off until an operator has run a
     * successful live test against the configured provider (`npm run ai:verify`)
     * and turns this on. Off = every tool reports Coming soon.
     */
    AI_GENERATION_ENABLED: bool.default(false),
    /** Price override for models without built-in pricing, in USD per million tokens. */
    AI_PRICE_INPUT_PER_MTOK: blank(z.coerce.number().min(0).max(1_000).optional()),
    AI_PRICE_OUTPUT_PER_MTOK: blank(z.coerce.number().min(0).max(1_000).optional()),
    /** AI-05: per-tool daily allowance overrides for signed-in customers, e.g. "order-explanation=20,support-assistant=15". */
    AI_DAILY_ALLOWANCES: blank(z.string().trim().max(500).optional()),
    /**
     * AI-05: a monitored inbox the Support Assistant may point customers to
     * when a person is needed. Unset = no contact channel is offered (support
     * tickets aren't connected yet), and the assistant says so honestly.
     */
    SUPPORT_CONTACT_EMAIL: blank(z.string().trim().email().max(200).optional()),

    /**
     * AI-06 social account connections. A platform is connectable only when it
     * is listed here (the operator confirms its app review is complete) AND its
     * OAuth client id and secret are set. Secrets are server-only.
     */
    SOCIAL_PROVIDERS_ENABLED: blank(z.string().trim().max(200).optional()),
    /**
     * AI-07 publishing. Separate from connecting: list a platform here only after
     * its posting permission has passed app review, a publish adapter exists, and
     * a live test account has been verified. Customers must still grant the
     * posting permission themselves. Empty = drafts and planning only.
     */
    SOCIAL_PUBLISHING_ENABLED: blank(z.string().trim().max(200).optional()),
    SOCIAL_INSTAGRAM_CLIENT_ID: blank(z.string().trim().min(4).max(200).optional()),
    SOCIAL_INSTAGRAM_CLIENT_SECRET: blank(z.string().trim().min(8).max(500).optional()),
    SOCIAL_FACEBOOK_CLIENT_ID: blank(z.string().trim().min(4).max(200).optional()),
    SOCIAL_FACEBOOK_CLIENT_SECRET: blank(z.string().trim().min(8).max(500).optional()),
    SOCIAL_TIKTOK_CLIENT_ID: blank(z.string().trim().min(4).max(200).optional()),
    SOCIAL_TIKTOK_CLIENT_SECRET: blank(z.string().trim().min(8).max(500).optional()),
    SOCIAL_YOUTUBE_CLIENT_ID: blank(z.string().trim().min(4).max(200).optional()),
    SOCIAL_YOUTUBE_CLIENT_SECRET: blank(z.string().trim().min(8).max(500).optional()),
    SOCIAL_X_CLIENT_ID: blank(z.string().trim().min(4).max(200).optional()),
    SOCIAL_X_CLIENT_SECRET: blank(z.string().trim().min(8).max(500).optional()),
    SOCIAL_LINKEDIN_CLIENT_ID: blank(z.string().trim().min(4).max(200).optional()),
    SOCIAL_LINKEDIN_CLIENT_SECRET: blank(z.string().trim().min(8).max(500).optional()),
  })
  .transform((e, ctx) => {
    const appEnv = e.APP_ENV ?? (e.NODE_ENV === "production" ? undefined : e.NODE_ENV);
    if (!appEnv) {
      ctx.addIssue({ code: "custom", path: ["APP_ENV"], message: "is required when NODE_ENV is production" });
      return z.NEVER;
    }
    const url = e.DATABASE_URL ? new URL(e.DATABASE_URL) : null;
    const deployed = appEnv === "production" || appEnv === "preview";
    if (deployed) {
      if (!url) ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: `is required when APP_ENV is ${appEnv}` });
      else if (!LOCAL_HOSTS.has(url.hostname) && !["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode") ?? ""))
        ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "must use sslmode=require, verify-ca or verify-full outside local development" });
      if (appEnv === "production" && e.NODE_ENV !== "production") ctx.addIssue({ code: "custom", path: ["NODE_ENV"], message: "must be production when APP_ENV is production" });
      if (!e.APP_URL) ctx.addIssue({ code: "custom", path: ["APP_URL"], message: `is required when APP_ENV is ${appEnv}` });
      else if (!e.APP_URL.startsWith("https://")) ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "must use https outside local development" });
      if (!e.AUTH_SECRET) ctx.addIssue({ code: "custom", path: ["AUTH_SECRET"], message: `is required when APP_ENV is ${appEnv}` });
      if (!e.DATA_ENCRYPTION_KEY) ctx.addIssue({ code: "custom", path: ["DATA_ENCRYPTION_KEY"], message: `is required when APP_ENV is ${appEnv}` });
    }
    if (appEnv === "production") {
      if (e.DEMO_MODE) ctx.addIssue({ code: "custom", path: ["DEMO_MODE"], message: "must be false in production" });
      if (!e.EMAIL_TRANSPORT || e.EMAIL_TRANSPORT === "capture") ctx.addIssue({ code: "custom", path: ["EMAIL_TRANSPORT"], message: "must be a real provider (resend or postmark) in production" });
    }
    if (e.EMAIL_TRANSPORT === "resend" || e.EMAIL_TRANSPORT === "postmark") {
      if (!e.EMAIL_API_KEY) ctx.addIssue({ code: "custom", path: ["EMAIL_API_KEY"], message: `is required for EMAIL_TRANSPORT=${e.EMAIL_TRANSPORT}` });
      if (!e.EMAIL_FROM) ctx.addIssue({ code: "custom", path: ["EMAIL_FROM"], message: `is required for EMAIL_TRANSPORT=${e.EMAIL_TRANSPORT}` });
    }
    if (e.AI_PROVIDER !== "none") {
      if (!e.AI_API_KEY) ctx.addIssue({ code: "custom", path: ["AI_API_KEY"], message: `is required when AI_PROVIDER=${e.AI_PROVIDER}` });
      if (!e.AI_MODEL) ctx.addIssue({ code: "custom", path: ["AI_MODEL"], message: `is required when AI_PROVIDER=${e.AI_PROVIDER}` });
    }
    if ((e.AI_PRICE_INPUT_PER_MTOK === undefined) !== (e.AI_PRICE_OUTPUT_PER_MTOK === undefined))
      ctx.addIssue({ code: "custom", path: ["AI_PRICE_OUTPUT_PER_MTOK"], message: "AI_PRICE_INPUT_PER_MTOK and AI_PRICE_OUTPUT_PER_MTOK must be set together" });
    if (e.PAYMENTS_BANK_ENABLED) {
      for (const k of ["PAYMENTS_BANK_ACCOUNT_NAME", "PAYMENTS_BANK_NAME", "PAYMENTS_BANK_ACCOUNT"] as const)
        if (!e[k]) ctx.addIssue({ code: "custom", path: [k], message: "is required when PAYMENTS_BANK_ENABLED=true" });
    }
    if (e.AUTH_SECRET && e.DATA_ENCRYPTION_KEY && e.AUTH_SECRET === e.DATA_ENCRYPTION_KEY) {
      ctx.addIssue({ code: "custom", path: ["DATA_ENCRYPTION_KEY"], message: "must differ from AUTH_SECRET" });
    }
    if (appEnv === "test" && url && !/test/i.test(url.pathname)) {
      ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "must point at a database whose name contains 'test' when APP_ENV is test" });
    }
    return { ...e, APP_ENV: appEnv, APP_URL: (e.APP_URL ?? "http://localhost:3000").replace(/\/$/, "") };
  });

export type Env = z.output<typeof envSchema>;

export class EnvError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Invalid server configuration: ${problems.join("; ")}`);
    this.name = "EnvError";
    this.problems = problems;
  }
}

/** Parse a set of variables. Throws EnvError listing variable names only. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  // Treat empty strings as unset so `.env.example` placeholders don't count as values.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const result = envSchema.safeParse(cleaned);
  if (!result.success) throw new EnvError(result.error.issues.map((i) => `${i.path.join(".") || "env"} ${i.message}`));
  return result.data;
}

let cached: Env | null = null;

export function getEnv(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}

/** Tests only: forget the cached configuration. */
export function resetEnvCache() {
  cached = null;
}

export const isLocalDatabase = (url: string) => LOCAL_HOSTS.has(new URL(url).hostname);
