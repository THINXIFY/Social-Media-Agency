import { bootstrapOwner } from "@/server/auth/staff";
import { createDb } from "@/server/db/client";
import { fail, loadEnvFiles, requireDatabaseUrl } from "../db/shared";

/**
 * One-time creation of the first Owner (operator-only: needs server env and
 * database access). It never sets a password: it emails a single-use setup
 * link to the owner's address, and the owner must set a password, verify the
 * email (by using the link) and enrol an authenticator before getting access.
 *
 *   npm run auth:bootstrap-owner -- --email hello@thinxify.com --name "Farhan Z."
 *   npm run auth:bootstrap-owner -- --email hello@thinxify.com --name "Farhan Z." --resend
 */
function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  loadEnvFiles();
  const email = arg("email");
  const name = arg("name");
  if (!email || !name) throw new Error('Usage: npm run auth:bootstrap-owner -- --email <address> --name "<display name>" [--resend]');
  const db = createDb(requireDatabaseUrl(), { max: 2 });
  try {
    const r = await bootstrapOwner(db, { email, name }, { resend: process.argv.includes("--resend") });
    console.log(`✔ Owner ${r.status === "reissued" ? "setup link re-sent" : "invited"}. A single-use setup link was emailed to ${r.sentTo}.`);
    console.log("  The owner must set a password and enrol an authenticator app before admin access is granted.");
  } finally {
    await db.$client.end();
  }
}

main().catch(fail);
