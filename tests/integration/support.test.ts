import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { GET as myTicketsGet, POST as myTicketsPost } from "@/app/api/account/support/route";
import { GET as myTicketGet } from "@/app/api/account/support/[ref]/route";
import { POST as notificationsPost } from "@/app/api/account/notifications/route";
import { GET as queueGet } from "@/app/api/admin/support/route";
import { GET as staffTicketGet } from "@/app/api/admin/support/[ref]/route";
import { POST as staffAction } from "@/app/api/admin/support/[ref]/[action]/route";
import { createDb, type Db } from "@/server/db/client";
import { auditLog, journalEntries, notifications, ticketEvents, ticketInternalNotes, ticketMessages, tickets } from "@/server/db/schema";
import { resetEnvCache } from "@/server/env";
import { AppError } from "@/server/errors";
import { listNotifications, markRead } from "@/server/support/notifications";
import { addNote, assignTicket, closeOwn, createTicket, getOwnTicket, listOwnTickets, reopenOwn, replyOwn, setPriority, setStatus, staffQueue, staffReply, staffTicket, supportAssignees } from "@/server/support/tickets";
import { runMigrations } from "../../scripts/db/migrate";
import { seedReferenceData } from "../../scripts/db/seed";
import { makeCustomer, makeStaff, signInAs } from "./auth-helpers";
import { sqlState } from "./helpers";

vi.mock("next/headers", async () => (await import("./auth-helpers")).jarMock());
vi.mock("next/server", () => ({ connection: async () => {} }));

/* Phase 5G-A support tickets against a scratch database. */
const scratch = `socivanta_support_test_${Date.now()}`;
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
  await seedReferenceData(db);
}, 120_000);
afterAll(async () => {
  await db.$client.end();
  process.env.DATABASE_URL = inject("databaseUrl");
  resetEnvCache();
  await admin.query(`drop database if exists ${scratch} with (force)`);
  await admin.end();
});

const ORIGIN = "http://localhost:3000";
const call = (fn: unknown, init: RequestInit = {}, ctx: unknown = {}, url = "/api/x") =>
  (fn as (r: Request, c: unknown) => Promise<Response>)(new Request(ORIGIN + url, { ...init, headers: { "content-type": "application/json", origin: ORIGIN, ...(init.headers ?? {}) } }), ctx);
const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "resolved",
    (e) => (e instanceof AppError ? e.code : e?.name === "ZodError" ? "ZOD" : `other:${String(e)}`),
  );
const key = () => `k_${randomUUID().replace(/-/g, "")}`;
const actorOf = (c: Awaited<ReturnType<typeof makeCustomer>>) => ({ userId: c.user.id, customerId: c.customer.id });
const staffOf = (s: Awaited<ReturnType<typeof makeStaff>>) => ({ userId: s.user.id, staffId: s.staffId });
const open = (c: Awaited<ReturnType<typeof makeCustomer>>, over: object = {}) => createTicket(db, actorOf(c), { subject: "Order hasn't started yet", category: "order", message: "My order still shows awaiting review. Could you check please? 🙏", key: key(), ...over });

describe("customer tickets", () => {
  it("creates a ticket once per key, with its first message and activity", async () => {
    const c = await makeCustomer(db);
    const k = key();
    const a = await open(c, { key: k });
    const b = await open(c, { key: k });
    expect(a.duplicate).toBe(false);
    expect(b).toEqual({ reference: a.reference, duplicate: true });
    expect(a.reference).toMatch(/^TCK-[A-F0-9]{8}$/);
    const t = await getOwnTicket(db, c.customer.id, a.reference);
    expect(t).toMatchObject({ status: "awaiting", category: "order", actions: { canReply: true, canClose: true, canReopen: false } });
    expect(t!.messages).toEqual([expect.objectContaining({ author: "customer", authorName: "You", body: "My order still shows awaiting review. Could you check please? 🙏" })]);
    expect(t!.events.map((e) => e.type)).toEqual(["created"]);
  });

  it("validates input, refuses secrets, and links only the customer's own orders", async () => {
    const c = await makeCustomer(db);
    expect(await codeOf(open(c, { subject: "Hi" }))).toBe("ZOD");
    expect(await codeOf(open(c, { message: "short" }))).toBe("ZOD");
    expect(await codeOf(open(c, { category: "billing" }))).toBe("ZOD");
    expect(await codeOf(open(c, { message: "My password: hunter2hunter2 please log in for me" }))).toBe("VALIDATION_FAILED");
    expect(await codeOf(open(c, { message: "Card 4111 1111 1111 1111 was charged twice" }))).toBe("VALIDATION_FAILED");
    expect(await codeOf(open(c, { orderRef: "ORD-NOTMINE01" }))).toBe("VALIDATION_FAILED");
    expect(await codeOf(open(c, { extra: true }))).toBe("ZOD");
  });

  it("isolates customers completely", async () => {
    const a = await makeCustomer(db);
    const b = await makeCustomer(db);
    const t = await open(a);
    expect(await getOwnTicket(db, b.customer.id, t.reference)).toBeNull();
    expect(await codeOf(replyOwn(db, actorOf(b), t.reference, { body: "Let me in", key: key() }))).toBe("NOT_FOUND");
    expect(await codeOf(closeOwn(db, actorOf(b), t.reference))).toBe("NOT_FOUND");
    expect((await listOwnTickets(db, b.customer.id, {})).items).toHaveLength(0);
    signInAs("customer", b.token);
    expect((await call(myTicketGet, {}, { params: Promise.resolve({ ref: t.reference }) })).status).toBe(404);
  });

  it("follows the lifecycle: staff reply → waiting → customer reply → open; resolve, close and reopen", async () => {
    const c = await makeCustomer(db);
    const s = await makeStaff(db, "support");
    const t = await open(c);
    await staffReply(db, staffOf(s), t.reference, { body: "Thanks! Could you confirm the profile link?", key: key() });
    let v = await getOwnTicket(db, c.customer.id, t.reference);
    expect(v!.status).toBe("waiting");
    expect(v!.messages.at(-1)).toMatchObject({ author: "staff", authorName: "Test · SociVanta" });
    await replyOwn(db, actorOf(c), t.reference, { body: "Here it is: instagram.com/example", key: key() });
    expect((await getOwnTicket(db, c.customer.id, t.reference))!.status).toBe("awaiting");
    await staffReply(db, staffOf(s), t.reference, { body: "Done, all sorted.", key: key(), status: "resolved" });
    v = await getOwnTicket(db, c.customer.id, t.reference);
    expect(v).toMatchObject({ status: "resolved", actions: { canReopen: true } });
    await closeOwn(db, actorOf(c), t.reference);
    v = await getOwnTicket(db, c.customer.id, t.reference);
    expect(v).toMatchObject({ status: "closed", actions: { canReply: false, canReopen: true } });
    expect(await codeOf(replyOwn(db, actorOf(c), t.reference, { body: "One more thing", key: key() }))).toBe("CONFLICT");
    await reopenOwn(db, actorOf(c), t.reference);
    expect((await getOwnTicket(db, c.customer.id, t.reference))!.status).toBe("awaiting");
    // A long-closed ticket can't be reopened.
    await closeOwn(db, actorOf(c), t.reference);
    await db.update(tickets).set({ closedAt: new Date(Date.now() - 30 * 86_400_000) }).where(eq(tickets.publicRef, t.reference));
    expect(await codeOf(reopenOwn(db, actorOf(c), t.reference))).toBe("CONFLICT");
  });

  it("stores a double-submitted reply once, even concurrently", async () => {
    const c = await makeCustomer(db);
    const t = await open(c);
    const k = key();
    await Promise.all([replyOwn(db, actorOf(c), t.reference, { body: "Same message", key: k }), replyOwn(db, actorOf(c), t.reference, { body: "Same message", key: k })]);
    const msgs = (await getOwnTicket(db, c.customer.id, t.reference))!.messages.filter((m) => m.body === "Same message");
    expect(msgs).toHaveLength(1);
  });

  it("rate-limits ticket creation", async () => {
    const c = await makeCustomer(db);
    for (let i = 0; i < 5; i++) await open(c);
    expect(await codeOf(open(c))).toBe("RATE_LIMITED");
  });

  it("search and filters work on the customer's own list", async () => {
    const c = await makeCustomer(db);
    await open(c, { subject: "Wallet top-up question", category: "payment" });
    const t2 = await open(c, { subject: "Login trouble on mobile", category: "account" });
    await closeOwn(db, actorOf(c), t2.reference);
    expect((await listOwnTickets(db, c.customer.id, { q: "wallet" })).items.map((i) => i.subject)).toEqual(["Wallet top-up question"]);
    expect((await listOwnTickets(db, c.customer.id, { status: "open" })).items.map((i) => i.subject)).toEqual(["Wallet top-up question"]);
    expect((await listOwnTickets(db, c.customer.id, { status: "closed" })).items.map((i) => i.subject)).toEqual(["Login trouble on mobile"]);
    expect((await listOwnTickets(db, c.customer.id, {})).counts).toMatchObject({ open: 1, total: 2 });
  });
});

describe("staff workspace", () => {
  it("internal notes never reach the customer; staff see everything", async () => {
    const c = await makeCustomer(db);
    const s = await makeStaff(db, "support");
    const t = await open(c);
    await addNote(db, staffOf(s), t.reference, { body: "Customer seems to have two accounts — check before refunding." });
    await setPriority(db, staffOf(s), t.reference, { priority: "high" });
    const own = await getOwnTicket(db, c.customer.id, t.reference);
    expect(JSON.stringify(own)).not.toMatch(/two accounts|priority|high/i);
    signInAs("customer", c.token);
    expect(await (await call(myTicketGet, {}, { params: Promise.resolve({ ref: t.reference }) })).text()).not.toContain("two accounts");
    const st = await staffTicket(db, t.reference, { canSeeOrders: false });
    expect(st!.notes).toEqual([expect.objectContaining({ body: "Customer seems to have two accounts — check before refunding." })]);
    expect(st!.priority).toBe("high");
    expect(st!.events.map((e) => e.label)).toContain("Priority: High");
  });

  it("assigns only to staff who can manage support; replies auto-assign", async () => {
    const c = await makeCustomer(db);
    const s = await makeStaff(db, "support");
    const fin = await makeStaff(db, "finance");
    const t = await open(c);
    expect(await codeOf(assignTicket(db, staffOf(s), t.reference, { staffId: fin.staffId }))).toBe("VALIDATION_FAILED");
    await staffReply(db, staffOf(s), t.reference, { body: "Looking into it now.", key: key(), status: "in_progress" });
    expect((await staffTicket(db, t.reference, { canSeeOrders: false }))!.assignedStaffId).toBe(s.staffId);
    expect((await supportAssignees(db)).map((a) => a.staffId)).toContain(s.staffId);
    expect((await supportAssignees(db)).map((a) => a.staffId)).not.toContain(fin.staffId);
    await assignTicket(db, staffOf(s), t.reference, { staffId: null });
    expect((await staffTicket(db, t.reference, { canSeeOrders: false }))!.assignedStaffId).toBeNull();
    const q = await staffQueue(db, staffOf(s), { view: "unassigned" });
    expect(q.items.map((i) => i.reference)).toContain(t.reference);
  });

  it("permissions: Support: View can read but not act; Support: Manage can act", async () => {
    const c = await makeCustomer(db);
    const t = await open(c);
    const fin = await makeStaff(db, "finance");
    signInAs("staff", fin.token);
    expect((await call(queueGet)).status).toBe(200); // finance has Support: View
    expect((await call(staffAction, { method: "POST", body: JSON.stringify({ body: "hi", key: key() }) }, { params: Promise.resolve({ ref: t.reference, action: "reply" }) })).status).toBe(403);
    const orders = await makeStaff(db, "orders"); // Support: View only
    signInAs("staff", orders.token);
    expect((await call(queueGet)).status).toBe(200);
    expect((await call(staffAction, { method: "POST", body: JSON.stringify({ body: "hi", key: key() }) }, { params: Promise.resolve({ ref: t.reference, action: "reply" }) })).status).toBe(403);
    const sup = await makeStaff(db, "support");
    signInAs("staff", sup.token);
    expect((await call(staffAction, { method: "POST", body: JSON.stringify({ body: "Hello from support", key: key() }), headers: { origin: "https://evil.example" } }, { params: Promise.resolve({ ref: t.reference, action: "reply" }) })).status).toBe(403);
    expect((await call(staffAction, { method: "POST", body: JSON.stringify({ body: "Hello from support", key: key() }) }, { params: Promise.resolve({ ref: t.reference, action: "reply" }) })).status).toBe(200);
    expect((await call(staffAction, { method: "POST", body: "{}" }, { params: Promise.resolve({ ref: t.reference, action: "delete" }) })).status).toBe(404);
    const detail = (await (await call(staffTicketGet, {}, { params: Promise.resolve({ ref: t.reference }) })).json()) as { can: { manage: boolean } };
    expect(detail.can.manage).toBe(true);
  });

  it("status changes notify the customer; priority and assignment don't", async () => {
    const c = await makeCustomer(db);
    const s = await makeStaff(db, "support");
    const t = await open(c);
    await setPriority(db, staffOf(s), t.reference, { priority: "urgent" });
    await assignTicket(db, staffOf(s), t.reference, { staffId: s.staffId });
    expect((await listNotifications(db, c.user.id)).items).toHaveLength(0);
    await setStatus(db, staffOf(s), t.reference, { status: "in_progress" });
    await staffReply(db, staffOf(s), t.reference, { body: "All done.", key: key(), status: "resolved" });
    const n = await listNotifications(db, c.user.id);
    expect(n.unread).toBe(2);
    expect(n.items.map((i) => i.title)).toEqual([expect.stringMatching(/^We've resolved/), "Ticket update: In progress"]);
    expect(n.items[0].link).toBe(`/dashboard/support?ticket=${t.reference}`);
    // Marking read only touches the caller's own notifications.
    const other = await makeCustomer(db);
    await markRead(db, other.user.id, { all: true });
    expect((await listNotifications(db, c.user.id)).unread).toBe(2);
    signInAs("customer", c.token);
    const r = await call(notificationsPost, { method: "POST", body: JSON.stringify({ all: true }) });
    expect(((await r.json()) as { unread: number }).unread).toBe(0);
  });

  it("history is append-only and audited; nothing touches money", async () => {
    const c = await makeCustomer(db);
    const s = await makeStaff(db, "support");
    const before = (await db.select({ n: count() }).from(journalEntries))[0].n;
    const t = await open(c);
    await addNote(db, staffOf(s), t.reference, { body: "Private" });
    const [row] = await db.select().from(tickets).where(eq(tickets.publicRef, t.reference));
    expect(await sqlState(db.update(ticketMessages).set({ body: "edited" }).where(eq(ticketMessages.ticketId, row.id)))).toBe("SV001");
    expect(await sqlState(db.delete(ticketMessages).where(eq(ticketMessages.ticketId, row.id)))).toBe("SV001");
    expect(await sqlState(db.update(ticketInternalNotes).set({ body: "edited" }).where(eq(ticketInternalNotes.ticketId, row.id)))).toBe("SV001");
    expect(await sqlState(db.delete(ticketEvents).where(eq(ticketEvents.ticketId, row.id)))).toBe("SV001");
    const actions = (await db.select({ a: auditLog.action }).from(auditLog).where(eq(auditLog.targetId, row.id))).map((r) => r.a);
    expect(actions).toEqual(expect.arrayContaining(["ticket.created", "ticket.note_added"]));
    expect((await db.select({ n: count() }).from(journalEntries))[0].n).toBe(before);
    expect((await db.select({ n: count() }).from(notifications).where(eq(notifications.recipientUserId, s.user.id)))[0].n).toBe(0);
  });

  it("customer routes need a signed-in customer and the same origin", async () => {
    signInAs("customer", "nope");
    expect((await call(myTicketsGet)).status).toBe(401);
    const c = await makeCustomer(db);
    signInAs("customer", c.token);
    const body = JSON.stringify({ subject: "Help with my account", category: "account", message: "I can't find where to change my password.", key: key() });
    expect((await call(myTicketsPost, { method: "POST", body, headers: { origin: "https://evil.example" } })).status).toBe(403);
    const r = await call(myTicketsPost, { method: "POST", body });
    expect(r.status).toBe(201);
    expect((await call(myTicketsPost, { method: "POST", body })).status).toBe(200); // retried, same ticket
    const list = (await (await call(myTicketsGet)).json()) as { items: unknown[]; orders: unknown[] };
    expect(list.items).toHaveLength(1);
  });
});
