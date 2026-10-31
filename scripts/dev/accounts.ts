import { createInterface } from "node:readline";
import { eq, sql } from "drizzle-orm";
import { registerCustomer, verifyEmail } from "@/server/auth/accounts";
import { passwordProblem } from "@/server/auth/password";
import { revokeAllSessions } from "@/server/auth/sessions";
import { bootstrapOwner, completeStaffSetup } from "@/server/auth/staff";
import { createDb, type Db } from "@/server/db/client";
import { customers, roles, staffMembers, users } from "@/server/db/schema";
import { capturedEmails } from "@/server/email";
import { getEnv } from "@/server/env";
import { fail, loadEnvFiles, requireSafeTarget } from "../db/shared";

/**
 * Development-only: creates the local Owner and Customer accounts through the
 * real flows (registration + emailed verification link; owner bootstrap +
 * emailed setup link), using the local mail capture instead of a provider.
 *
 *  - Refuses unless APP_ENV is development/test, the database is on localhost
 *    and email is captured (never with a real provider).
 *  - The password comes from DEV_ACCOUNT_PASSWORD or a hidden prompt; it is
 *    never printed or stored except as an argon2id hash.
 *  - Existing accounts are left untouched (no silent password or MFA resets).
 *  - The owner's authenticator is NOT enrolled here: the owner scans the QR on
 *    first sign-in, so the TOTP secret is created on their own device.
 *
 *   npm run dev:accounts -- --owner hello@thinxify.com --customer customer@thinxify.com --name "Farhan Z."
 */

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl);
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => write(s.startsWith(question) ? s : "");
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

/** The newest captured email of a kind for an address — the same link a person would click. */
function tokenFromMailbox(to: string, kind: string) {
  const mail = capturedEmails().find((m) => m.to === to.toLowerCase() && m.kind === kind);
  return mail?.text.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

async function setUpCustomer(db: Db, email: string, name: string, password: string) {
  const [existing] = await db
    .select({ id: users.id, verified: users.emailVerifiedAt, customer: customers.id })
    .from(users)
    .leftJoin(customers, eq(customers.userId, users.id))
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  if (existing) return existing.customer ? `already exists (${existing.verified ? "verified" : "not verified — use /verify-email"}); left unchanged` : "email belongs to a non-customer account; left unchanged";
  await registerCustomer(db, { name, email, password });
  const token = tokenFromMailbox(email, "verify_email");
  if (!token) throw new Error("Verification email wasn't captured.");
  const r = await verifyEmail(db, token);
  return r.status === "verified" ? "created and verified through the emailed confirmation link" : "created, but verification failed";
}

async function setUpOwner(db: Db, email: string, name: string, password: string) {
  const owners = await db
    .select({ id: staffMembers.id, status: staffMembers.status, email: users.email, hasPassword: sql<boolean>`${users.passwordHash} is not null` })
    .from(staffMembers)
    .innerJoin(users, eq(users.id, staffMembers.userId))
    .innerJoin(roles, eq(roles.id, staffMembers.roleId))
    .where(eq(roles.key, "owner"));
  const mine = owners.find((o) => o.email.toLowerCase() === email);
  if (owners.length && !mine) return "a different owner already exists; nothing changed (bootstrap runs once)";
  if (mine && (mine.status === "active" || mine.hasPassword))
    return "already set up; password and MFA left unchanged (use /forgot-password to change the password)";
  await bootstrapOwner(db, { email, name }, { resend: Boolean(mine) });
  const token = tokenFromMailbox(email, "staff_setup");
  if (!token) throw new Error("Setup email wasn't captured.");
  const session = await completeStaffSetup(db, token, password);
  // Don't leave a session behind from this script; the owner signs in themselves.
  const [u] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  if (u) await revokeAllSessions(db, u.id, { kind: "staff" });
  void session;
  return "invited via bootstrap, password set through the emailed setup link; authenticator enrolment pending (first sign-in)";
}

async function main() {
  loadEnvFiles();
  const url = requireSafeTarget("dev:accounts");
  const env = getEnv();
  if (env.EMAIL_TRANSPORT && env.EMAIL_TRANSPORT !== "capture") throw new Error("dev:accounts only runs with EMAIL_TRANSPORT=capture (local mailbox).");
  const owner = arg("owner")?.toLowerCase();
  const customer = arg("customer")?.toLowerCase();
  const name = arg("name") ?? "Farhan Z.";
  if (!owner && !customer) throw new Error('Usage: npm run dev:accounts -- --owner <email> --customer <email> --name "<name>"');

  const password = process.env.DEV_ACCOUNT_PASSWORD ?? (await askHidden("Temporary password (hidden): "));
  for (const email of [owner, customer].filter(Boolean) as string[]) {
    const problem = passwordProblem(password, email);
    if (problem) throw new Error(`Password rejected by the account policy for ${email}: ${problem} The policy is unchanged; choose a stronger temporary password.`);
  }

  const db = createDb(url, { max: 2 });
  try {
    if (customer) console.log(`Customer ${customer}: ${await setUpCustomer(db, customer, name, password)}`);
    if (owner) console.log(`Owner    ${owner}: ${await setUpOwner(db, owner, name, password)}`);
  } finally {
    await db.$client.end();
  }
}

main().catch(fail);
