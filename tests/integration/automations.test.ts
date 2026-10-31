import { and, count, eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { encrypt } from "@/server/auth/crypto";
import { createDb, type Db } from "@/server/db/client";
import { automationInbox, automationRuns, automations, orders, socialConnections, socialPosts, socialPostTargets } from "@/server/db/schema";
import { resetEnvCache } from "@/server/env";
import { AppError } from "@/server/errors";
import { approveSuggestion, automationData, deleteAutomation, duplicateAutomation, executeRun, retryRun, runAutomationTick, saveAutomation, setAutomationState, updateInboxItem } from "@/server/social/automations";
import { saveDraft } from "@/server/social/publishing";
import { runMigrations } from "../../scripts/db/migrate";
import { makeCustomer, setRequestHeaders, signInAs } from "./auth-helpers";

vi.mock("next/headers", async () => (await import("./auth-helpers")).jarMock());

/* AI-08 Automation Studio against a UTF-8 scratch database. Time is controlled; no external calls exist to mock. */
const scratch = `socivanta_automations_test_${Date.now()}`;
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

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "resolved",
    (e) => (e instanceof AppError ? e.code : `other:${String(e)}`),
  );
// Sunday 1 Nov 2026, 12:00 UTC.
const T0 = new Date("2026-11-01T12:00:00.000Z");
const at = (iso: string) => () => new Date(iso);
const weekly = (over: object = {}) => ({ name: "Monday plan 🗓️ — planificación", timezone: "Europe/London", trigger: { type: "weekly", days: [1], time: "09:00" }, action: { type: "reminder", title: "Plan the week ✨", message: "Prüfe den Kalender — 检查日历" }, ...over });

describe("creating and activating", () => {
  it("stores Unicode exactly, saves as draft by default, and runs nothing until activated", async () => {
    const { customer } = await makeCustomer(db);
    const a = await saveAutomation(db, customer.id, null, weekly(), { now: () => T0 });
    expect(a).toMatchObject({ name: "Monday plan 🗓️ — planificación", status: "draft", nextRunAt: null });
    expect(await runAutomationTick(db, { now: at("2026-11-02T09:01:00Z") })).toMatchObject({ claimed: 0 });
    const on = await setAutomationState(db, customer.id, a.id, "activate", { now: () => T0 });
    expect(on).toMatchObject({ status: "active", nextRunAt: "2026-11-02T09:00:00.000Z" });
  });

  it("the database refuses an active automation without authorisation of its current version", async () => {
    const { customer } = await makeCustomer(db);
    const a = await saveAutomation(db, customer.id, null, weekly(), { now: () => T0 });
    await expect(db.update(automations).set({ status: "active" }).where(eq(automations.id, a.id))).rejects.toThrow();
  });

  it("is private to its owner", async () => {
    const owner = await makeCustomer(db);
    const other = await makeCustomer(db);
    const a = await saveAutomation(db, owner.customer.id, null, weekly(), { activate: true, now: () => T0 });
    const o = other.customer.id;
    expect(await codeOf(saveAutomation(db, o, a.id, weekly({ name: "hijack" })))).toBe("NOT_FOUND");
    expect(await codeOf(setAutomationState(db, o, a.id, "pause"))).toBe("NOT_FOUND");
    expect(await codeOf(duplicateAutomation(db, o, a.id))).toBe("NOT_FOUND");
    expect(await codeOf(deleteAutomation(db, o, a.id))).toBe("NOT_FOUND");
    expect((await automationData(db, o)).automations).toHaveLength(0);
  });

  it("refuses schedules that never run and enforces the active limit", async () => {
    const { customer } = await makeCustomer(db);
    expect(await codeOf(saveAutomation(db, customer.id, null, weekly({ trigger: { type: "once", at: "2026-10-01T10:00" } }), { activate: true, now: () => T0 }))).toBe("VALIDATION_FAILED");
    for (let i = 0; i < 10; i++) await saveAutomation(db, customer.id, null, weekly({ name: `Routine ${i}` }), { activate: true, now: () => T0 });
    expect(await codeOf(saveAutomation(db, customer.id, null, weekly({ name: "Eleventh" }), { activate: true, now: () => T0 }))).toBe("CONFLICT");
  });
});

describe("execution", () => {
  it("runs once per trigger slot, creates one inbox item, and schedules the next slot", async () => {
    const { customer } = await makeCustomer(db);
    const a = await saveAutomation(db, customer.id, null, weekly(), { activate: true, now: () => T0 });
    // Three workers race on the same due slot (the tick serves every customer, so assert on this one).
    await Promise.all([1, 2, 3].map(() => runAutomationTick(db, { now: at("2026-11-02T09:00:30Z") })));
    await runAutomationTick(db, { now: at("2026-11-02T09:05:00Z") });
    const data = await automationData(db, customer.id);
    expect(data.runs).toHaveLength(1);
    expect(data.runs[0]).toMatchObject({ status: "succeeded", outcome: "Added a reminder to your inbox.", scheduledFor: "2026-11-02T09:00:00.000Z", trigger: "Every Monday at 09:00" });
    expect(data.inbox).toHaveLength(1);
    expect(data.inbox[0]).toMatchObject({ kind: "reminder", title: "Plan the week ✨", body: "Prüfe den Kalender — 检查日历", status: "open" });
    expect(data.automations.find((x) => x.id === a.id)?.nextRunAt).toBe("2026-11-09T09:00:00.000Z");
  });

  it("checks for pause and edits immediately before acting", async () => {
    const { customer } = await makeCustomer(db);
    const a = await saveAutomation(db, customer.id, null, weekly(), { activate: true, now: () => T0 });
    const [run] = await db.insert(automationRuns).values({ customerId: customer.id, automationId: a.id, automationName: a.name, automationVersion: 1, triggerLabel: "test", idempotencyKey: `${a.id}:manual-1`, scheduledFor: T0 }).returning();
    await setAutomationState(db, customer.id, a.id, "pause");
    expect(await executeRun(db, run!.id, T0)).toBe("skipped");
    const b = await saveAutomation(db, customer.id, null, weekly({ name: "Edited later" }), { activate: true, now: () => T0 });
    const [run2] = await db.insert(automationRuns).values({ customerId: customer.id, automationId: b.id, automationName: b.name, automationVersion: 1, triggerLabel: "test", idempotencyKey: `${b.id}:manual-2`, scheduledFor: T0 }).returning();
    // Editing an active automation without re-confirming pauses it and bumps its version.
    expect(await saveAutomation(db, customer.id, b.id, weekly({ name: "Edited later v2" }))).toMatchObject({ status: "paused" });
    expect(await executeRun(db, run2!.id, T0)).toBe("skipped");
    const outcomes = (await db.select({ o: automationRuns.outcome }).from(automationRuns).where(eq(automationRuns.customerId, customer.id))).map((r) => r.o);
    expect(outcomes).toEqual(expect.arrayContaining(["The automation was paused before it ran.", "The automation was changed after this run was planned, so it didn't run."]));
    expect((await automationData(db, customer.id)).inbox).toHaveLength(0);
  });

  it("recovers an interrupted run and never creates a second item for it", async () => {
    const { customer } = await makeCustomer(db);
    const a = await saveAutomation(db, customer.id, null, weekly({ action: { type: "checklist", title: "Weekly plan", items: ["Review", "Write", "Plan"] } }), { activate: true, now: () => T0 });
    const [run] = await db.insert(automationRuns).values({ customerId: customer.id, automationId: a.id, automationName: a.name, automationVersion: 1, triggerLabel: "test", idempotencyKey: `${a.id}:crash`, scheduledFor: T0, attempts: 1, leaseUntil: new Date(T0.getTime() - 1000) }).returning();
    expect((await runAutomationTick(db, { now: () => T0 })).recovered).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(automationRuns).where(eq(automationRuns.id, run!.id)))[0]!.status).toBe("succeeded");
    expect(await executeRun(db, run!.id, T0)).toBeNull(); // already finished: nobody can run it again
    const items = await db.select().from(automationInbox).where(eq(automationInbox.runId, run!.id));
    expect(items).toHaveLength(1);
    expect(items[0]!.checklist).toEqual([
      { text: "Review", done: false },
      { text: "Write", done: false },
      { text: "Plan", done: false },
    ]);
    for (const i of [0, 1, 2]) await updateInboxItem(db, customer.id, items[0]!.id, { toggle: i });
    const [done] = await db.select().from(automationInbox).where(eq(automationInbox.id, items[0]!.id));
    expect(done!.status).toBe("done");
  });

  it("data actions read only the owner's data and skip when there's nothing to review", async () => {
    const { customer } = await makeCustomer(db);
    const flag = await saveAutomation(db, customer.id, null, weekly({ name: "Draft check", trigger: { type: "draft_due", time: "08:00", withinDays: 3 }, action: { type: "flag_drafts", withinDays: 3 } }), { activate: true, now: () => T0 });
    const health = await saveAutomation(db, customer.id, null, weekly({ name: "Health", trigger: { type: "account_attention", time: "08:00" }, action: { type: "health_check" } }), { activate: true, now: () => T0 });
    await runAutomationTick(db, { now: at("2026-11-02T08:01:00Z") });
    const firstPass = (await automationData(db, customer.id)).runs;
    expect(firstPass.map((r) => r.status)).toEqual(["skipped", "skipped"]);
    expect(firstPass.map((r) => r.outcome).sort()).toEqual(["No drafts are planned in the next 3 days.", "No social accounts are connected yet."]);

    await saveDraft(db, customer.id, null, { text: "Due soon", title: "Autumn launch 🍂", plannedLocal: "2026-11-04T10:00", timezone: "UTC" });
    await saveDraft(db, customer.id, null, { text: "Far away", plannedLocal: "2026-12-20T10:00", timezone: "UTC" });
    const other = await makeCustomer(db);
    await saveDraft(db, other.customer.id, null, { text: "Not mine", plannedLocal: "2026-11-04T10:00", timezone: "UTC" });
    await db.insert(socialConnections).values({ customerId: customer.id, provider: "x", externalId: `x-${crypto.randomUUID()}`, displayName: "My X", status: "needs_reauth", accessTokenCiphertext: encrypt("t") });
    await runAutomationTick(db, { now: at("2026-11-03T08:01:00Z") });
    expect((await automationData(db, customer.id)).runs.filter((r) => r.status === "succeeded")).toHaveLength(2);
    const inbox = (await automationData(db, customer.id)).inbox;
    expect(inbox.find((i) => i.kind === "draft_review")?.refs.map((r) => r.label)).toEqual(["Autumn launch 🍂"]);
    expect(inbox.find((i) => i.kind === "health_warning")?.refs[0]?.label).toBe("My X · reconnect needed");
    void flag;
    void health;
  });

  it("a draft suggestion becomes a draft only when approved — once, unscheduled", async () => {
    const { customer } = await makeCustomer(db);
    await saveAutomation(db, customer.id, null, weekly({ name: "Idea", action: { type: "draft_suggestion", title: "Weekend special", text: "Fresh pão de queijo this weekend 🧀" } }), { activate: true, now: () => T0 });
    await runAutomationTick(db, { now: at("2026-11-02T09:00:30Z") });
    expect(await db.select().from(socialPosts).where(eq(socialPosts.customerId, customer.id))).toHaveLength(0);
    const item = (await automationData(db, customer.id)).inbox[0]!;
    const first = await approveSuggestion(db, customer.id, item.id, "UTC");
    const again = await approveSuggestion(db, customer.id, item.id, "UTC");
    expect(again.draftId).toBe(first.draftId);
    const posts = await db.select().from(socialPosts).where(eq(socialPosts.customerId, customer.id));
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ status: "draft", body: "Fresh pão de queijo this weekend 🧀", scheduledAt: null, approvedAt: null });
  });

  it("one-off automations complete after running", async () => {
    const { customer } = await makeCustomer(db);
    const a = await saveAutomation(db, customer.id, null, weekly({ trigger: { type: "once", at: "2026-11-05T10:00" }, timezone: "UTC" }), { activate: true, now: () => T0 });
    await runAutomationTick(db, { now: at("2026-11-05T10:00:10Z") });
    expect((await automationData(db, customer.id)).automations.find((x) => x.id === a.id)).toMatchObject({ status: "completed", nextRunAt: null });
  });
});

describe("history, retry and safety", () => {
  it("finished runs are append-only; deleting an automation keeps its history and inbox", async () => {
    const { customer } = await makeCustomer(db);
    const a = await saveAutomation(db, customer.id, null, weekly(), { activate: true, now: () => T0 });
    await runAutomationTick(db, { now: at("2026-11-02T09:00:30Z") });
    const [run] = await db.select().from(automationRuns).where(eq(automationRuns.automationId, a.id));
    await expect(db.update(automationRuns).set({ outcome: "rewritten" }).where(eq(automationRuns.id, run!.id))).rejects.toThrow();
    await expect(db.delete(automationRuns).where(eq(automationRuns.id, run!.id))).rejects.toThrow();
    await deleteAutomation(db, customer.id, a.id);
    const [kept] = await db.select().from(automationRuns).where(eq(automationRuns.id, run!.id));
    expect(kept).toMatchObject({ automationId: null, status: "succeeded" });
    expect((await automationData(db, customer.id)).inbox).toHaveLength(1);
  });

  it("only failed runs of active automations can be retried, at most twice", async () => {
    const { customer } = await makeCustomer(db);
    const a = await saveAutomation(db, customer.id, null, weekly(), { activate: true, now: () => T0 });
    const [failed] = await db.insert(automationRuns).values({ customerId: customer.id, automationId: a.id, automationName: a.name, automationVersion: 1, triggerLabel: "test", idempotencyKey: `${a.id}:f`, scheduledFor: T0, status: "failed", outcome: "Something went wrong.", finishedAt: T0 }).returning();
    expect(await retryRun(db, customer.id, failed!.id, { now: () => T0 })).toBe("succeeded");
    const other = await makeCustomer(db);
    expect(await codeOf(retryRun(db, other.customer.id, failed!.id))).toBe("NOT_FOUND");
    const ok = (await db.select().from(automationRuns).where(and(eq(automationRuns.customerId, customer.id), eq(automationRuns.status, "succeeded"))))[0]!;
    expect(await codeOf(retryRun(db, customer.id, ok.id))).toBe("CONFLICT");
    await retryRun(db, customer.id, failed!.id, { now: () => T0 });
    expect(await codeOf(retryRun(db, customer.id, failed!.id))).toBe("CONFLICT");
  });

  it("never creates posts, schedules, orders or other side effects", async () => {
    const { customer } = await makeCustomer(db);
    for (const action of [
      { type: "reminder", title: "r", message: "m" },
      { type: "checklist", title: "c", items: ["a"] },
      { type: "flag_drafts", withinDays: 7 },
      { type: "health_check" },
      { type: "draft_suggestion", title: "s", text: "t" },
    ])
      await saveAutomation(db, customer.id, null, weekly({ name: `Safe ${action.type}`, action, trigger: { type: "daily", time: "09:00" } }), { activate: true, now: () => T0 });
    await runAutomationTick(db, { now: at("2026-11-02T09:00:30Z") });
    const [posts] = await db.select({ n: count() }).from(socialPosts).where(eq(socialPosts.customerId, customer.id));
    const [targets] = await db.select({ n: count() }).from(socialPostTargets).where(eq(socialPostTargets.customerId, customer.id));
    const [ord] = await db.select({ n: count() }).from(orders).where(eq(orders.customerId, customer.id));
    expect([posts!.n, targets!.n, ord!.n]).toEqual([0, 0, 0]);
    const kinds = new Set((await automationData(db, customer.id)).inbox.map((i) => i.kind));
    expect([...kinds].every((k) => ["reminder", "checklist", "draft_review", "health_warning", "suggestion"].includes(k))).toBe(true);
  });
});

describe("routes", () => {
  it("require explicit confirmation to activate, same origin, and ownership", async () => {
    const owner = await makeCustomer(db);
    const other = await makeCustomer(db);
    const { POST } = await import("@/app/api/social/automations/route");
    const { POST: STATE } = await import("@/app/api/social/automations/[id]/state/route");
    const req = (url: string, body: unknown, origin = "http://localhost:3000") => new Request(url, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
    setRequestHeaders({});
    signInAs("customer", owner.token);
    expect((await POST(req("http://localhost:3000/api/social/automations", { definition: weekly(), activate: true }), {} as never)).status).toBe(403);
    expect((await POST(req("http://localhost:3000/api/social/automations", { definition: weekly() }, "https://evil.example"), {} as never)).status).toBe(403);
    const created = await POST(req("http://localhost:3000/api/social/automations", { definition: weekly(), activate: true, confirmed: true }), {} as never);
    expect(created.status).toBe(201);
    const { automation } = await created.json();
    expect(automation.status).toBe("active");
    signInAs("customer", other.token);
    expect((await STATE(req(`http://localhost:3000/api/social/automations/${automation.id}/state`, { action: "pause" }), { params: Promise.resolve({ id: automation.id }) })).status).toBe(404);
  });
});
