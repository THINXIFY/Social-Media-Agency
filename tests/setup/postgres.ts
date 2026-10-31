import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import EmbeddedPostgres from "embedded-postgres";
import { Client, Pool } from "pg";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    /** Migrated test database. */
    databaseUrl: string;
    /** Same server, `postgres` maintenance database — for creating scratch databases. */
    adminUrl: string;
  }
}

/**
 * Integration tests always run against real PostgreSQL:
 *  - TEST_DATABASE_URL (its database name must contain "test"), reset and migrated; or
 *  - a throwaway embedded PostgreSQL server with a random password and port,
 *    deleted after the run.
 */
export default async function setup(project: TestProject) {
  let stop: () => Promise<void> = async () => {};
  let databaseUrl: string;
  let adminUrl: string;

  const external = process.env.TEST_DATABASE_URL;
  if (external) {
    const u = new URL(external);
    if (!/test/i.test(u.pathname)) throw new Error("TEST_DATABASE_URL must point at a database whose name contains 'test'.");
    databaseUrl = external;
    u.pathname = "/postgres";
    adminUrl = u.toString();
    const c = new Client({ connectionString: databaseUrl });
    await c.connect();
    await c.query("drop schema if exists pgboss cascade; drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public;");
    await c.end();
  } else {
    const port = await freePort();
    const password = randomBytes(18).toString("base64url");
    const dir = mkdtempSync(join(tmpdir(), "sv-pg-test-"));
    const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password, port, persistent: false, onLog: () => {} });
    await pg.initialise();
    await pg.start();
    adminUrl = `postgresql://postgres:${password}@localhost:${port}/postgres`;
    databaseUrl = `postgresql://postgres:${password}@localhost:${port}/socivanta_test`;
    const c = new Client({ connectionString: adminUrl });
    await c.connect();
    await c.query("create database socivanta_test");
    await c.end();
    stop = async () => {
      await pg.stop();
      rmSync(dir, { recursive: true, force: true });
    };
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();

  project.provide("databaseUrl", databaseUrl);
  project.provide("adminUrl", adminUrl);
  return stop;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}
