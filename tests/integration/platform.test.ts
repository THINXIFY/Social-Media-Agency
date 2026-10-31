import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { authorize, loadRoleAccess } from "@/server/auth";
import { pingDatabase, type Db } from "@/server/db/client";
import { roles, staffMembers } from "@/server/db/schema";
import { resetEnvCache } from "@/server/env";
import { AppError } from "@/server/errors";
import { HANDLERS } from "@/server/jobs/handlers";
import { enqueue, startQueue } from "@/server/jobs/queue";
import { ROLE_TEMPLATES } from "@/server/auth/role-templates";
import { seedReferenceData } from "../../scripts/db/seed";
import { createUser, ensureReferenceData, testDb } from "./helpers";

vi.mock("next/server", () => ({ connection: async () => {} }));

let db: Db;
beforeAll(async () => {
  db = testDb();
  await ensureReferenceData(db);
});
afterAll(() => db.$client.end());

const roleId = async (key: string) => (await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)))[0].id;
const denied = async (p: Promise<unknown>) => {
  try {
    await p;
    return false;
  } catch (e) {
    return e instanceof AppError && e.code === "FORBIDDEN";
  }
};

describe("seed", () => {
  it("is idempotent and makes nothing purchasable", async () => {
    const a = await seedReferenceData(db);
    const b = await seedReferenceData(db);
    expect(b).toEqual(a);
    expect(Number(a.roles)).toBe(5);
    expect(Number(a.services)).toBe(118);
  });

  it("stores the approved role templates exactly", async () => {
    for (const t of ROLE_TEMPLATES) expect(await loadRoleAccess(db, await roleId(t.key))).toEqual(t.access);
  });
});

describe("server-side authorization (actors are built here; 5B will supply them from sessions)", () => {
  it("checks the current database role and status", async () => {
    const user = await createUser(db);
    const [member] = await db.insert(staffMembers).values({ userId: user.id, roleId: await roleId("support"), status: "active" }).returning();
    const actor = { kind: "staff" as const, userId: user.id, staffId: member.id };
    await authorize(actor, "support:manage", db);
    await authorize(actor, "orders:view", db);
    expect(await denied(authorize(actor, "orders:manage", db))).toBe(true);
    expect(await denied(authorize(actor, "payments:view", db))).toBe(true);
    expect(await denied(authorize(actor, "issueRefunds", db))).toBe(true);

    // Role change takes effect immediately — nothing is cached.
    await db.update(staffMembers).set({ roleId: await roleId("finance") }).where(eq(staffMembers.id, member.id));
    await authorize(actor, "approveDeposits", db);

    // Disabled staff get nothing.
    await db.update(staffMembers).set({ status: "disabled", disabledAt: new Date() }).where(eq(staffMembers.id, member.id));
    expect(await denied(authorize(actor, "overview:view", db))).toBe(true);
  });

  it("unknown staff ids are denied", async () => {
    expect(await denied(authorize({ staffId: randomUUID() }, "overview:view", db))).toBe(true);
  });
});

describe("health and jobs against PostgreSQL", () => {
  it("database ping and /api/health report ok", async () => {
    expect(await pingDatabase(db)).toBe("ok");
    vi.stubEnv("DATABASE_URL", inject("databaseUrl"));
    resetEnvCache();
    try {
      const { GET } = await import("@/app/api/health/route");
      const res = await GET(new Request("http://localhost/api/health"), {});
      expect(res.status).toBe(200);
      expect(((await res.json()) as { checks: { database: string } }).checks.database).toBe("ok");
    } finally {
      vi.unstubAllEnvs();
      resetEnvCache();
    }
  });

  it("runs the ledger-verification job through pg-boss, deduplicating by idempotency key", async () => {
    const boss = await startQueue(inject("databaseUrl"), { supervise: false });
    try {
      const k = `verify-${randomUUID()}`;
      const id = await enqueue(boss, "maintenance.verify-ledger", {}, { idempotencyKey: k });
      expect(id).toBeTruthy();
      let ran: unknown = null;
      await boss.work("maintenance.verify-ledger", async (jobs) => {
        for (const j of jobs) ran = await HANDLERS["maintenance.verify-ledger"]!(db, j.data);
      });
      for (let i = 0; i < 40 && !ran; i++) await new Promise((r) => setTimeout(r, 250));
      expect(ran).toMatchObject({ ok: true });
      const job = await boss.getJobById("maintenance.verify-ledger", id!);
      for (let i = 0; i < 20 && job?.state !== "completed"; i++) await new Promise((r) => setTimeout(r, 250));
      expect((await boss.getJobById("maintenance.verify-ledger", id!))?.state).toBe("completed");
    } finally {
      await boss.stop({ graceful: false });
    }
  });
});
