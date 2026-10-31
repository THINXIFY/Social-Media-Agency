import { createHmac } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { createDb, type Db } from "@/server/db/client";
import { accountBalances, aiProfiles, aiUsageEvents, automationInbox, automations, journalEntries, socialPosts } from "@/server/db/schema";
import { getEnv, resetEnvCache } from "@/server/env";
import { aiProfile, commandCenterData, saveAiProfile, usageData, workspaceSnapshot } from "@/server/ai/workspace";
import { saveAutomation } from "@/server/social/automations";
import { saveDraft } from "@/server/social/publishing";
import { runMigrations } from "../../scripts/db/migrate";
import { makeCustomer, setRequestHeaders, signInAs } from "./auth-helpers";

vi.mock("next/headers", async () => (await import("./auth-helpers")).jarMock());

/* AI-09 workspace: preferences, the Command Center snapshot and the usage dashboard, against a scratch database. */
const scratch = `socivanta_ai_workspace_test_${Date.now()}`;
let db: Db;
let admin: Client;

beforeAll(async () => {
  admin = new Client({ connectionString: inject("adminUrl") });
  await admin.connect();
  await admin.query(`create database ${scratch} encoding 'UTF8' template template0`);
  const u = new URL(inject("adminUrl"));
  u.pathname = `/${scratch}`;
  await runMigrations(u.toString());
  process.env.DATABASE_URL = u.toString();
  resetEnvCache();
  db = createDb(u.toString());
}, 120_000);
afterAll(async () => {
  await db.$client.end();
  process.env.DATABASE_URL = inject("databaseUrl");
  resetEnvCache();
  await admin.query(`drop database if exists ${scratch} with (force)`);
  await admin.end();
});

const viewerOf = (m: Awaited<ReturnType<typeof makeCustomer>>) => ({ customerId: m.customer.id, userId: m.user.id, name: "Test Customer" });
const hashOf = (userId: string) => createHmac("sha256", Buffer.from(getEnv().AUTH_SECRET!, "base64")).update(`ai-usage:account:${userId}`).digest("hex");

describe("onboarding preferences", () => {
  it("complete, edit and skip; skipping never erases earlier choices", async () => {
    const { customer } = await makeCustomer(db);
    expect(await aiProfile(db, customer.id)).toBeNull();
    const done = await saveAiProfile(db, customer.id, { action: "complete", persona: "creator", goals: ["organize", "content", "content"] });
    expect(done).toMatchObject({ persona: "creator", goals: ["content", "organize"], onboarding: "completed" });
    expect(await saveAiProfile(db, customer.id, { action: "complete", persona: "agency", goals: ["campaigns"] })).toMatchObject({ persona: "agency", goals: ["campaigns"] });
    expect(await saveAiProfile(db, customer.id, { action: "skip" })).toMatchObject({ persona: "agency", goals: ["campaigns"], onboarding: "completed" });
    const fresh = await makeCustomer(db);
    expect(await saveAiProfile(db, fresh.customer.id, { action: "skip" })).toMatchObject({ persona: null, goals: [], onboarding: "skipped" });
  });

  it("rejects unknown personas, goals and extra fields; the database enforces the same", async () => {
    const { customer } = await makeCustomer(db);
    await expect(saveAiProfile(db, customer.id, { action: "complete", persona: "hacker", goals: ["content"] })).rejects.toThrow();
    await expect(saveAiProfile(db, customer.id, { action: "complete", persona: "creator", goals: [] })).rejects.toThrow();
    await expect(saveAiProfile(db, customer.id, { action: "complete", persona: "creator", goals: ["content"], plan: "business" })).rejects.toThrow();
    await expect(saveAiProfile(db, customer.id, { action: "complete", persona: "creator", goals: ["content"], customerId: "someone-else" })).rejects.toThrow();
    await expect(db.insert(aiProfiles).values({ customerId: customer.id, persona: "admin", onboarding: "completed" })).rejects.toThrow();
    await expect(db.insert(aiProfiles).values({ customerId: customer.id, onboarding: "maybe" })).rejects.toThrow();
    expect(await aiProfile(db, customer.id)).toBeNull();
  });
});

describe("workspace snapshot", () => {
  it("is empty for a new customer and shows only the customer's own records", async () => {
    const a = await makeCustomer(db);
    const b = await makeCustomer(db);
    expect(await workspaceSnapshot(db, a.customer.id)).toEqual({ drafts: { total: 0, recent: [] }, planned: { total: 0, next: null }, automations: { total: 0, active: 0, nextRunAt: null, openInbox: 0 }, accounts: { connected: 0 } });

    await saveDraft(db, a.customer.id, null, { title: "Launch teaser ✨", text: "Coming soon", providers: ["instagram"], timezone: "UTC" });
    await saveDraft(db, a.customer.id, null, { text: "A draft without a title, used as its own label", providers: ["instagram"], timezone: "UTC", plannedLocal: new Date(Date.now() + 86_400_000).toISOString().slice(0, 16) });
    await saveAutomation(db, a.customer.id, null, { name: "Weekly plan", timezone: "UTC", trigger: { type: "weekly", days: [1], time: "09:00" }, action: { type: "reminder", title: "Plan", message: "" } }, { activate: true });
    await saveAutomation(db, a.customer.id, null, { name: "Draft only", timezone: "UTC", trigger: { type: "daily", time: "09:00" }, action: { type: "reminder", title: "Check", message: "" } });
    await saveDraft(db, b.customer.id, null, { title: "Not yours", text: "Other customer", providers: ["instagram"], timezone: "UTC" });

    const s = await workspaceSnapshot(db, a.customer.id);
    expect(s.drafts.total).toBe(2);
    expect(s.drafts.recent.map((d) => d.title).sort()).toEqual(["A draft without a title, used as its own label", "Launch teaser ✨"]);
    expect(s.planned.total).toBe(1);
    expect(s.planned.next?.title).toBe("A draft without a title, used as its own label");
    expect(s.automations).toMatchObject({ total: 2, active: 1, openInbox: 0 });
    expect(s.automations.nextRunAt).not.toBeNull();
    expect((await workspaceSnapshot(db, b.customer.id)).drafts.recent.map((d) => d.title)).toEqual(["Not yours"]);
  });

  it("counts open inbox items only", async () => {
    const { customer } = await makeCustomer(db);
    const auto = await saveAutomation(db, customer.id, null, { name: "Inbox", timezone: "UTC", trigger: { type: "daily", time: "09:00" }, action: { type: "reminder", title: "Plan", message: "" } });
    const [run] = await db.execute<{ id: string }>(
      // A finished run to hang inbox items on (the engine itself is tested in AI-08).
      (await import("drizzle-orm")).sql`insert into automation_runs (customer_id, automation_id, automation_name, automation_version, trigger_label, idempotency_key, scheduled_for, status, finished_at) values (${customer.id}, ${auto.id}, 'Inbox', 1, 'Daily', ${`k-${auto.id}`}, now(), 'succeeded', now()) returning id`,
    ).then((r) => r.rows);
    const [run2] = await db.execute<{ id: string }>((await import("drizzle-orm")).sql`insert into automation_runs (customer_id, automation_id, automation_name, automation_version, trigger_label, idempotency_key, scheduled_for, status, finished_at) values (${customer.id}, ${auto.id}, 'Inbox', 1, 'Daily', ${`k2-${auto.id}`}, now(), 'succeeded', now()) returning id`).then((r) => r.rows);
    await db.insert(automationInbox).values([
      { customerId: customer.id, runId: run.id, automationName: "Inbox", kind: "reminder", title: "Open" },
      { customerId: customer.id, runId: run2.id, automationName: "Inbox", kind: "reminder", title: "Done", status: "done" },
    ]);
    expect((await workspaceSnapshot(db, customer.id)).automations.openInbox).toBe(1);
    expect((await db.select({ n: count() }).from(automations).where(eq(automations.customerId, customer.id)))[0].n).toBe(1);
  });
});

describe("usage dashboard", () => {
  it("shows configured allowances with nothing used for a new account, and every tool coming soon", async () => {
    const m = await makeCustomer(db);
    const u = await usageData(db, viewerOf(m), getEnv());
    expect(u.readable).toBe(true);
    expect(u.generation).toBe(false);
    expect(u.plan).toEqual({ id: "free", name: "Free" });
    expect(u.totals).toEqual({ counted: 0, notCounted: 0 });
    const caption = u.tools.find((t) => t.toolId === "caption-generator")!;
    expect(caption).toMatchObject({ allowance: 10, used: 0, remaining: 10, availability: "coming_soon" });
    expect(u.tools.find((t) => t.toolId === "workflow-automation")).toBeUndefined(); // no free allowance
    expect(u.tools.find((t) => t.toolId === "automation-assistant")).toMatchObject({ group: "social", name: "AI Workflow Assistant" });
    expect(new Date(u.resetAt).getUTCHours()).toBe(0);
  });

  it("counts ok and pending toward the allowance, separates uncounted outcomes, and never shows another account's usage", async () => {
    const m = await makeCustomer(db);
    const other = await makeCustomer(db);
    const row = (userId: string, toolId: string, status: string) => ({ toolId, subjectHash: hashOf(userId), subjectKind: "account", status });
    await db.insert(aiUsageEvents).values([
      row(m.user.id, "caption-generator", "ok"),
      row(m.user.id, "caption-generator", "ok"),
      row(m.user.id, "caption-generator", "pending"),
      row(m.user.id, "caption-generator", "provider_error"),
      row(m.user.id, "caption-generator", "timeout"),
      row(m.user.id, "content-calendar", "ok"),
      row(m.user.id, "content-calendar", "ok"),
      row(m.user.id, "content-calendar", "ok"),
      row(m.user.id, "content-calendar", "rejected_quota"),
      row(m.user.id, "retired-tool", "ok"), // unknown tools are ignored
      row(other.user.id, "caption-generator", "ok"),
    ]);
    // Yesterday's usage doesn't count today.
    await db.insert(aiUsageEvents).values({ ...row(m.user.id, "growth-advisor", "ok"), createdAt: new Date(Date.now() - 2 * 86_400_000) });

    const u = await usageData(db, viewerOf(m), getEnv());
    expect(u.tools.find((t) => t.toolId === "caption-generator")).toMatchObject({ used: 3, remaining: 7, outcomes: { ok: 2, pending: 1, provider_error: 1, timeout: 1 } });
    expect(u.tools.find((t) => t.toolId === "content-calendar")).toMatchObject({ allowance: 3, used: 3, remaining: 0, outcomes: { ok: 3, rejected_quota: 1 } });
    expect(u.tools.find((t) => t.toolId === "growth-advisor")).toMatchObject({ used: 0 });
    expect(u.totals).toEqual({ counted: 6, notCounted: 3 });
    expect((await usageData(db, viewerOf(other), getEnv())).totals).toEqual({ counted: 1, notCounted: 0 });

    const cc = await commandCenterData(db, viewerOf(m), getEnv());
    expect(cc.runsToday).toBe(6);
    expect(cc.generation).toBe(false);
    expect(cc.firstName).toBe("Test");
  });

  it("applies operator allowance overrides and reports unreadable usage instead of inventing numbers", async () => {
    const m = await makeCustomer(db);
    const env = getEnv();
    const u = await usageData(db, viewerOf(m), { ...env, AI_DAILY_ALLOWANCES: "caption-generator=4" });
    expect(u.tools.find((t) => t.toolId === "caption-generator")).toMatchObject({ allowance: 4, remaining: 4 });
    const broken = await usageData(db, viewerOf(m), { ...env, AUTH_SECRET: undefined } as never);
    expect(broken.readable).toBe(false);
    expect(broken.tools).toEqual([]);
    expect((await commandCenterData(db, viewerOf(m), { ...env, AUTH_SECRET: undefined } as never)).runsToday).toBeNull();
  });
});

describe("routes and boundaries", () => {
  it("the profile route needs a signed-in customer and the same origin, and saves only the caller's own profile", async () => {
    const a = await makeCustomer(db);
    const b = await makeCustomer(db);
    const { PUT, GET } = await import("@/app/api/ai/profile/route");
    const req = (body: unknown, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/ai/profile", { method: "PUT", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
    setRequestHeaders({});
    signInAs("customer", "not-a-session");
    expect((await PUT(req({ action: "skip" }), {} as never)).status).toBe(401);
    signInAs("customer", a.token);
    expect((await PUT(req({ action: "skip" }, "https://evil.example"), {} as never)).status).toBe(403);
    expect((await PUT(req({ action: "complete", persona: "creator", goals: ["nope"] }), {} as never)).status).toBe(400);
    const ok = await PUT(req({ action: "complete", persona: "freelancer", goals: ["save_time"] }), {} as never);
    expect(ok.status).toBe(200);
    expect((await ok.json()).profile).toMatchObject({ persona: "freelancer", goals: ["save_time"] });
    expect(await aiProfile(db, b.customer.id)).toBeNull();
    signInAs("customer", b.token);
    expect((await (await GET(new Request("http://localhost:3000/api/ai/profile"), {} as never)).json()).profile).toBeNull();
  });

  it("onboarding, usage and plan views never touch wallets or the ledger", async () => {
    const m = await makeCustomer(db);
    const before = await Promise.all([db.select({ n: count() }).from(accountBalances), db.select({ n: count() }).from(journalEntries)]);
    await saveAiProfile(db, m.customer.id, { action: "complete", persona: "ecommerce", goals: ["services"] });
    await usageData(db, viewerOf(m), getEnv());
    await commandCenterData(db, viewerOf(m), getEnv());
    const after = await Promise.all([db.select({ n: count() }).from(accountBalances), db.select({ n: count() }).from(journalEntries)]);
    expect(after).toEqual(before);
    expect((await db.select({ n: count() }).from(socialPosts).where(eq(socialPosts.customerId, m.customer.id)))[0].n).toBe(0);
  });
});
