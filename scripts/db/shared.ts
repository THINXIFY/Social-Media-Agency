import { existsSync } from "node:fs";
import { getEnv, isLocalDatabase } from "@/server/env";

/** Scripts run outside Next.js, so load the same env files Next would. Real env vars win. */
export function loadEnvFiles() {
  for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);
}

/** Connection target without credentials, safe to print. */
export function describeTarget(url: string) {
  const u = new URL(url);
  return `${u.hostname}:${u.port || 5432}${u.pathname}`;
}

/**
 * Destructive commands (seed, reset) only run against a local development or
 * test database. Production and preview databases are refused outright.
 */
export function requireSafeTarget(command: string): string {
  const env = getEnv();
  if (env.APP_ENV !== "development" && env.APP_ENV !== "test") throw new Error(`${command} is only allowed when APP_ENV is development or test (current: ${env.APP_ENV}).`);
  if (!env.DATABASE_URL) throw new Error(`${command} needs DATABASE_URL. Copy .env.example to .env.local and fill it in.`);
  if (!isLocalDatabase(env.DATABASE_URL)) throw new Error(`${command} only runs against a database on localhost.`);
  return env.DATABASE_URL;
}

export function requireDatabaseUrl(): string {
  const url = getEnv().DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  return url;
}

export function fail(err: unknown): never {
  console.error(`\n✖ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
