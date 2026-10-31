import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { describeTarget, fail, loadEnvFiles, requireSafeTarget } from "./shared";

/**
 * Runs a real PostgreSQL server for local development without Docker or a
 * system install (binaries from the `embedded-postgres` dev dependency).
 * Credentials, port and database name come from DATABASE_URL in .env.local —
 * nothing is hard-coded. Data persists in ./.local/postgres (git-ignored).
 * Press Ctrl+C to stop. If the terminal was closed instead, run
 * `npm run db:local -- --stop` to shut the server down cleanly.
 */

const DATA_DIR = resolve(".local/postgres");

/** Stops a server left running in DATA_DIR, using the bundled pg_ctl. */
async function stopOrphan() {
  if (!existsSync(DATA_DIR)) return console.log("Nothing to stop.");
  const os = process.platform === "win32" ? "windows" : process.platform;
  const { pg_ctl } = (await import(`@embedded-postgres/${os}-${process.arch}`)) as { pg_ctl: string };
  execFileSync(pg_ctl, ["stop", "-D", DATA_DIR, "-m", "fast"], { stdio: "inherit" });
}

async function main() {
  if (process.argv.includes("--stop")) return stopOrphan();
  loadEnvFiles();
  const url = new URL(requireSafeTarget("db:local"));
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const database = url.pathname.replace(/^\//, "");
  if (!user || !password || !database) throw new Error("DATABASE_URL must include a user, password and database name for db:local.");

  const dir = DATA_DIR;
  mkdirSync(dir, { recursive: true });
  const pg = new EmbeddedPostgres({ databaseDir: dir, user, password, port: Number(url.port || 5432), persistent: true, onLog: () => {} });
  try {
    await pg.initialise();
  } catch {
    // Already initialised on an earlier run.
  }
  await pg.start();

  const admin = new Client({ host: url.hostname, port: Number(url.port || 5432), user, password, database: "postgres" });
  await admin.connect();
  const exists = await admin.query("select 1 from pg_database where datname = $1", [database]);
  if (!exists.rowCount) await admin.query(`create database "${database.replace(/"/g, "")}"`);
  await admin.end();

  console.log(`✔ PostgreSQL running at ${describeTarget(url.toString())}. Next: npm run db:migrate. Ctrl+C to stop.`);
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

main().catch(fail);
