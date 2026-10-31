import { sql } from "drizzle-orm";
import { ensureSystemRoles } from "@/server/auth/roles";
import { createDb, type Db } from "@/server/db/client";
import { platforms, serviceEligibility, services } from "@/server/db/schema";
import { ensureSystemAccounts } from "@/server/ledger/accounts";
import { PLATFORMS, SERVICES } from "@/lib/catalog";
import { describeTarget, fail, loadEnvFiles, requireSafeTarget } from "./shared";

/**
 * Development/test reference data only — no customers, orders, money or staff:
 *  - platform ledger accounts;
 *  - the five approved role templates;
 *  - the real catalog structure from src/lib/catalog.ts, with NO prices and
 *    every eligibility gate unset, so nothing is purchasable.
 * Idempotent: re-running changes nothing.
 */
export async function seedReferenceData(db: Db) {
  await db.transaction(async (tx) => {
    await ensureSystemAccounts(tx);

    await ensureSystemRoles(tx);

    await tx
      .insert(platforms)
      .values(PLATFORMS.map((p, i) => ({ id: p.id, name: p.name, iconKey: p.icon, sort: i })))
      .onConflictDoNothing();
    await tx
      .insert(services)
      .values(SERVICES.map((s) => ({ id: s.id, platformId: s.platformId, category: s.category, name: s.name, description: s.description })))
      .onConflictDoNothing();
    await tx
      .insert(serviceEligibility)
      .values(SERVICES.map((s) => ({ serviceId: s.id })))
      .onConflictDoNothing();
  });
  const [counts] = (await db.execute<{ roles: string; services: string; accounts: string }>(sql`select (select count(*) from roles)::text as roles, (select count(*) from services)::text as services, (select count(*) from ledger_accounts)::text as accounts`)).rows;
  return counts;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/db/seed.ts")) {
  loadEnvFiles();
  try {
    const url = requireSafeTarget("db:seed");
    console.log(`Seeding reference data into ${describeTarget(url)} …`);
    const db = createDb(url, { max: 2 });
    seedReferenceData(db)
      .then((c) => console.log(`✔ ${c.roles} roles, ${c.services} services (none purchasable), ${c.accounts} ledger accounts.`))
      .catch(fail)
      .finally(() => db.$client.end());
  } catch (e) {
    fail(e);
  }
}
