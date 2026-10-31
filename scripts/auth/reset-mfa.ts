import { sql } from "drizzle-orm";
import { resetStaffMfa } from "@/server/auth/staff";
import { createDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { fail, loadEnvFiles, requireDatabaseUrl } from "../db/shared";

/**
 * Operator recovery when a staff member (e.g. the only owner) has lost both
 * their authenticator and recovery codes. Removes the factor, signs them out
 * and is audited; they must enrol again after signing in with their password.
 *
 *   npm run auth:reset-mfa -- --email hello@thinxify.com --confirm
 */
async function main() {
  loadEnvFiles();
  const i = process.argv.indexOf("--email");
  const email = i > -1 ? process.argv[i + 1]?.toLowerCase() : undefined;
  if (!email || !process.argv.includes("--confirm")) throw new Error("Usage: npm run auth:reset-mfa -- --email <address> --confirm");
  const db = createDb(requireDatabaseUrl(), { max: 2 });
  try {
    const [u] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    if (!u) throw new Error("No account with that email.");
    await resetStaffMfa(db, { system: "operator-cli" }, u.id);
    console.log("✔ Two-step verification removed and all staff sessions signed out. The user must enrol a new authenticator at next sign-in.");
  } finally {
    await db.$client.end();
  }
}

main().catch(fail);
