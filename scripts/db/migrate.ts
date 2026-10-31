import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "@/server/db/client";
import { describeTarget, fail, loadEnvFiles, requireDatabaseUrl } from "./shared";

/** Applies pending migrations from ./drizzle. Safe to run repeatedly; also the production release step. */
export async function runMigrations(url: string) {
  const db = createDb(url, { max: 1, statementTimeoutMs: 0 });
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
  } finally {
    await db.$client.end();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/db/migrate.ts")) {
  loadEnvFiles();
  const url = requireDatabaseUrl();
  console.log(`Migrating ${describeTarget(url)} …`);
  runMigrations(url)
    .then(() => console.log("✔ Migrations applied."))
    .catch(fail);
}
