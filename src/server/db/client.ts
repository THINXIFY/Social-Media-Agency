import "server-only";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "../env";
import { errors } from "../errors";
import { logger } from "../log";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema> & { $client: Pool };
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Anything that can run queries: the database or an open transaction. */
export type Executor = Db | Tx;

export function createDb(connectionString: string, options: { max?: number; statementTimeoutMs?: number } = {}): Db {
  const pool = new Pool({
    connectionString,
    max: options.max ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // 5I-A (SEC-04): a runaway statement, or a request that dies mid-transaction while holding
    // row locks (wallets, orders), must not hold a connection or block other writers indefinitely.
    // Migrations pass 0 (no limit): building an index on a large table can legitimately take longer.
    statement_timeout: options.statementTimeoutMs ?? 30_000,
    idle_in_transaction_session_timeout: 60_000,
  });
  // A dropped idle connection must not crash the process.
  pool.on("error", (err) => logger().error({ err }, "postgres pool error"));
  return drizzle(pool, { schema });
}

// Survive dev hot reloads without leaking pools.
const holder = globalThis as unknown as { __svDb?: Db };

/** The app's shared database. Throws SERVICE_UNAVAILABLE when no database is configured. */
export function getDb(): Db {
  if (holder.__svDb) return holder.__svDb;
  const env = getEnv();
  if (!env.DATABASE_URL) throw errors.unavailable("The database isn't configured.");
  holder.__svDb = createDb(env.DATABASE_URL, { max: env.DATABASE_POOL_MAX });
  return holder.__svDb;
}

export type DatabaseHealth = "ok" | "not_configured" | "unreachable";

export async function pingDatabase(db?: Db): Promise<DatabaseHealth> {
  if (!db && !getEnv().DATABASE_URL) return "not_configured";
  try {
    await (db ?? getDb()).execute(sql`select 1`);
    return "ok";
  } catch (err) {
    logger().warn({ err }, "database ping failed");
    return "unreachable";
  }
}
