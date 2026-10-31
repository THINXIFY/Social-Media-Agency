import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import { createDb, type Db } from "@/server/db/client";
import { customers, users } from "@/server/db/schema";
import { openClearingAccount, openWallet } from "@/server/ledger/accounts";
import { postJournalEntry } from "@/server/ledger/ledger";
import { seedReferenceData } from "../../scripts/db/seed";

export const testDb = (max = 25): Db => createDb(inject("databaseUrl"), { max });

/** Short unique suffix so tests never collide on unique columns. */
export const uid = () => randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();

let seeded = false;
export async function ensureReferenceData(db: Db) {
  if (seeded) return;
  await seedReferenceData(db);
  seeded = true;
}

export async function createUser(db: Db, email = `user-${uid().toLowerCase()}@example.test`) {
  const [u] = await db.insert(users).values({ email }).returning();
  return u;
}

export async function createCustomer(db: Db) {
  const user = await createUser(db);
  const id = uid();
  const [c] = await db.insert(customers).values({ userId: user.id, publicRef: `CUS-${id}`, accountRef: `ACC-${id}`, firstName: "Test", lastName: "Customer" }).returning();
  const wallet = await openWallet(db, c.id);
  return { user, customer: c, wallet };
}

/** Test-only: credit a wallet through a real balanced ledger entry. */
export async function fundWallet(db: Db, customerId: string, cents: number) {
  const clearing = await openClearingAccount(db, "test_processor");
  const wallet = await openWallet(db, customerId);
  return postJournalEntry(db, {
    kind: "deposit_credit",
    idempotencyKey: `test-fund-${randomUUID()}`,
    description: "Test funding",
    lines: [
      { accountCode: clearing, amountCents: cents },
      { accountCode: wallet, amountCents: -cents },
    ],
  });
}

/** Resolves to the Postgres SQLSTATE an operation failed with (unwrapping Drizzle's error). */
export async function sqlState(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    for (let cur: unknown = e; cur; cur = (cur as { cause?: unknown }).cause) {
      const code = (cur as { code?: unknown }).code;
      if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    }
    throw e;
  }
  throw new Error("expected the operation to fail");
}
