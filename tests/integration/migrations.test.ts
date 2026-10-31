import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";
import { runMigrations } from "../../scripts/db/migrate";

/** Migrations run up, down (via rollback files) and up again on a scratch database. */
describe("migrations", () => {
  const scratch = `socivanta_migration_test_${Date.now()}`;
  let url: string;
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: inject("adminUrl") });
    await admin.connect();
    await admin.query(`create database ${scratch}`);
    const u = new URL(inject("adminUrl"));
    u.pathname = `/${scratch}`;
    url = u.toString();
  });

  afterAll(async () => {
    await admin.query(`drop database if exists ${scratch} with (force)`);
    await admin.end();
  });

  const inspect = async () => {
    const c = new Client({ connectionString: url });
    await c.connect();
    try {
      const tables = (await c.query("select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")).rows[0].n as number;
      const triggers = (await c.query("select count(distinct tgname)::int as n from pg_trigger where not tgisinternal")).rows[0].n as number;
      const applied = (await c.query("select count(*)::int as n from drizzle.__drizzle_migrations").catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n as number;
      const views = (await c.query("select count(*)::int as n from information_schema.views where table_schema = 'public'")).rows[0].n as number;
      return { tables, triggers, applied, views };
    } finally {
      await c.end();
    }
  };

  const runFile = async (file: string) => {
    const c = new Client({ connectionString: url });
    await c.connect();
    try {
      await c.query(readFileSync(file, "utf8"));
    } finally {
      await c.end();
    }
  };

  it("applies cleanly and is idempotent", async () => {
    await runMigrations(url);
    const first = await inspect();
    expect(first.tables).toBe(65);
    expect(first.triggers).toBeGreaterThanOrEqual(25);
    expect(first.views).toBe(1);
    expect(first.applied).toBe(17);
    await runMigrations(url);
    expect(await inspect()).toEqual(first);
  });

  it("rolls back in reverse order and re-applies", async () => {
    const before = await inspect();
    await runFile("drizzle/rollback/0016_reports_5h.down.sql");
    expect(await inspect()).toEqual({ ...before, applied: 16 }); // indexes only
    await runFile("drizzle/rollback/0015_analytics_5h.down.sql");
    const analyticsDown = await inspect();
    expect(analyticsDown).toEqual({ ...before, applied: 15 }); // indexes only
    await runFile("drizzle/rollback/0014_referrals_5g.down.sql");
    const referralsDown = await inspect();
    expect(referralsDown.tables).toBe(65);
    expect(referralsDown.applied).toBe(14);
    expect(referralsDown.triggers).toBe(before.triggers - 3); // policies, rewards, qualification guards
    await runFile("drizzle/rollback/0013_support_5g.down.sql");
    const support = await inspect();
    expect(support.tables).toBe(64);
    expect(support.applied).toBe(13);
    expect(support.triggers).toBe(referralsDown.triggers - 3); // messages, notes, events append-only
    await runFile("drizzle/rollback/0012_ai_control.down.sql");
    const aiControl = await inspect();
    expect(aiControl.tables).toBe(61);
    expect(aiControl.applied).toBe(12);
    expect(aiControl.triggers).toBe(before.triggers - 7); // ai_credentials_guard
    await runFile("drizzle/rollback/0011_providers_5f.down.sql");
    const providers5f = await inspect();
    expect(providers5f.tables).toBe(60);
    expect(providers5f.applied).toBe(11);
    expect(providers5f.triggers).toBe(before.triggers - 12); // mapping guard + 2 sync triggers + attempt guard + events append-only
    await runFile("drizzle/rollback/0010_ai_profiles.down.sql");
    const profiles = await inspect();
    expect(profiles.tables).toBe(59);
    expect(profiles.applied).toBe(10);
    expect(profiles.triggers).toBe(providers5f.triggers);
    await runFile("drizzle/rollback/0009_automations.down.sql");
    const auto = await inspect();
    expect(auto.tables).toBe(56);
    expect(auto.applied).toBe(9);
    expect(auto.triggers).toBe(before.triggers - 13); // automation_runs_append_only
    await runFile("drizzle/rollback/0008_social_publishing.down.sql");
    const publishing = await inspect();
    expect(publishing.tables).toBe(54);
    expect(publishing.applied).toBe(8);
    await runFile("drizzle/rollback/0007_social_connections.down.sql");
    const social = await inspect();
    expect(social.tables).toBe(51);
    expect(social.applied).toBe(7);
    await runFile("drizzle/rollback/0006_ai_usage.down.sql");
    const ai = await inspect();
    expect(ai.tables).toBe(50);
    expect(ai.applied).toBe(6);
    await runFile("drizzle/rollback/0005_orders_5e.down.sql");
    const ordersBack = await inspect();
    expect(ordersBack.triggers).toBe(before.triggers - 16); // automation_runs_append_only + orders_change_check, orders_no_delete, orders_paid_check
    expect(ordersBack.applied).toBe(5);
    await runFile("drizzle/rollback/0004_deposits_5d.down.sql");
    const deposits = await inspect();
    expect(deposits.triggers).toBe(before.triggers - 18); // + deposits_change_check, deposits_no_delete
    expect(deposits.applied).toBe(4);
    await runFile("drizzle/rollback/0003_catalog_wallets.down.sql");
    const catalog = await inspect();
    expect(catalog.tables).toBe(50);
    expect(catalog.triggers).toBe(before.triggers - 19); // + customers_open_wallet
    expect(catalog.applied).toBe(3);
    await runFile("drizzle/rollback/0002_auth.down.sql");
    const auth = await inspect();
    expect(auth.tables).toBe(49);
    expect(auth.applied).toBe(2);
    await runFile("drizzle/rollback/0001_safeguards.down.sql");
    const mid = await inspect();
    expect(mid.triggers).toBe(0);
    expect(mid.views).toBe(0);
    expect(mid.applied).toBe(1);
    await runFile("drizzle/rollback/0000_foundation.down.sql");
    const empty = await inspect();
    expect(empty.tables).toBe(0);
    expect(empty.applied).toBe(0);
    await runMigrations(url);
    expect(await inspect()).toEqual(before);
  });
});
