import { Client } from "pg";
import { runMigrations } from "./migrate";
import { describeTarget, fail, loadEnvFiles, requireSafeTarget } from "./shared";

/**
 * Drops and recreates the local development/test database schema, then
 * re-applies migrations. Refuses anything that isn't APP_ENV development/test
 * on localhost. Pass --seed to load reference data afterwards.
 */
export async function resetDatabase(url: string) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("drop schema if exists pgboss cascade");
    await client.query("drop schema if exists drizzle cascade");
    await client.query("drop schema if exists public cascade");
    await client.query("create schema public");
  } finally {
    await client.end();
  }
  await runMigrations(url);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/db/reset.ts")) {
  loadEnvFiles();
  (async () => {
    const url = requireSafeTarget("db:reset");
    console.log(`Resetting ${describeTarget(url)} …`);
    await resetDatabase(url);
    console.log("✔ Schema recreated and migrations applied.");
    if (process.argv.includes("--seed")) {
      const { seedReferenceData } = await import("./seed");
      const { createDb } = await import("@/server/db/client");
      const db = createDb(url, { max: 2 });
      try {
        const c = await seedReferenceData(db);
        console.log(`✔ Seeded ${c.roles} roles, ${c.services} services, ${c.accounts} ledger accounts.`);
      } finally {
        await db.$client.end();
      }
    }
  })().catch(fail);
}
