import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "@/server/env";

const SECRET = "s3cr3t-P4ss";
const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");
const PROD_OK = { NODE_ENV: "production", APP_ENV: "production", DATABASE_URL: "postgresql://a:b@db.example.com/prod?sslmode=verify-full", APP_URL: "https://app.example.com", AUTH_SECRET: KEY_A, DATA_ENCRYPTION_KEY: KEY_B, EMAIL_TRANSPORT: "postmark", EMAIL_FROM: "Sociotix <no-reply@example.com>", EMAIL_API_KEY: "pm-key-0123456789" };
const local = `postgresql://app:${SECRET}@localhost:5433/socivanta_dev`;

describe("environment validation", () => {
  it("accepts a minimal development configuration without a database", () => {
    const env = parseEnv({ NODE_ENV: "development" });
    expect(env.APP_ENV).toBe("development");
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.DATABASE_POOL_MAX).toBe(10);
  });

  it("treats empty placeholders as unset", () => {
    expect(parseEnv({ NODE_ENV: "development", DATABASE_URL: "" }).DATABASE_URL).toBeUndefined();
  });

  it("rejects non-postgres URLs and bad numbers", () => {
    expect(() => parseEnv({ DATABASE_URL: "mysql://x@localhost/db" })).toThrow(EnvError);
    expect(() => parseEnv({ DATABASE_URL: "not a url" })).toThrow(EnvError);
    expect(() => parseEnv({ DATABASE_POOL_MAX: "500" })).toThrow(EnvError);
  });

  it("requires APP_ENV to be explicit in production builds", () => {
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow(/APP_ENV is required/);
  });

  it("requires a TLS database in production and preview", () => {
    expect(() => parseEnv({ NODE_ENV: "production", APP_ENV: "production" })).toThrow(/DATABASE_URL is required/);
    expect(() => parseEnv({ NODE_ENV: "production", APP_ENV: "production", DATABASE_URL: "postgresql://a:b@db.example.com/prod" })).toThrow(/sslmode/);
    expect(parseEnv({ ...PROD_OK }).APP_ENV).toBe("production");
    expect(() => parseEnv({ NODE_ENV: "development", APP_ENV: "production", DATABASE_URL: "postgresql://a:b@db.example.com/p?sslmode=require" })).toThrow(/NODE_ENV must be production/);
  });

  it("only lets tests touch databases named *test*", () => {
    expect(() => parseEnv({ APP_ENV: "test", DATABASE_URL: local })).toThrow(/contains 'test'/);
    expect(parseEnv({ APP_ENV: "test", DATABASE_URL: "postgresql://a:b@localhost/socivanta_test" }).APP_ENV).toBe("test");
  });

  it("never includes secret values in error messages", () => {
    try {
      parseEnv({ APP_ENV: "test", DATABASE_URL: local });
      expect.unreachable();
    } catch (e) {
      expect(String((e as Error).message)).not.toContain(SECRET);
      expect((e as EnvError).problems.join(" ")).not.toContain(SECRET);
    }
  });

  it("production requires auth secrets, https APP_URL and a real email provider, and forbids demo mode", () => {
    const without = (k: string) => Object.fromEntries(Object.entries(PROD_OK).filter(([x]) => x !== k));
    expect(() => parseEnv(without("AUTH_SECRET"))).toThrow(/AUTH_SECRET is required/);
    expect(() => parseEnv(without("DATA_ENCRYPTION_KEY"))).toThrow(/DATA_ENCRYPTION_KEY is required/);
    expect(() => parseEnv({ ...PROD_OK, APP_URL: "http://app.example.com" })).toThrow(/APP_URL must use https/);
    expect(() => parseEnv({ ...PROD_OK, EMAIL_TRANSPORT: "capture" })).toThrow(/EMAIL_TRANSPORT must be a real provider/);
    expect(() => parseEnv({ ...PROD_OK, DEMO_MODE: "true" })).toThrow(/DEMO_MODE must be false in production/);
    expect(() => parseEnv({ ...PROD_OK, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET must be at least 32 random bytes/);
    expect(() => parseEnv({ ...PROD_OK, DATA_ENCRYPTION_KEY: KEY_A })).toThrow(/must differ from AUTH_SECRET/);
    expect(() => parseEnv({ ...PROD_OK, EMAIL_API_KEY: "" })).toThrow(/EMAIL_API_KEY is required/);
  });

  it("development defaults are safe: demo off, capture email, localhost URL", () => {
    const env = parseEnv({ NODE_ENV: "development" });
    expect(env.DEMO_MODE).toBe(false);
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.TRUST_PROXY_HEADERS).toBe(false);
  });
});
