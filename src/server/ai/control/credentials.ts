import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { AI_PROVIDER_BY_ID } from "@/lib/ai/provider-catalog";
import { audit } from "../../audit";
import { decrypt, encrypt } from "../../auth/crypto";
import { hit } from "../../auth/rate-limit";
import type { Db, Executor } from "../../db/client";
import { aiCredentials, users } from "../../db/schema";
import type { Env } from "../../env";
import { AppError, errors } from "../../errors";
import { type FreeTestResult, freeKeyTest, makeProvider, TEST_MESSAGE, type TestCode } from "./adapters";
import { recordDiscovered } from "./models";

/*
 * Provider API keys: Save → Test → Activate.
 *
 *  - Saving encrypts the key (AES-256-GCM with DATA_ENCRYPTION_KEY) as a new
 *    version; it never replaces the active key.
 *  - Testing uses the provider's non-billed check where one exists. A billable
 *    test runs only with explicit confirmation and is labelled as billable.
 *  - Activating needs a passing test and an explicit switch. It's atomic: the
 *    previous key is retired in the same transaction, under a per-provider
 *    lock, so a failed switch leaves the working key active.
 *  - Keys are never returned, logged or audited; only a masked hint is shown.
 */

type Staff = { userId: string };
type Client = { ip?: string | null; userAgent?: string | null };
type Fetch = typeof fetch;

const known = (providerId: string) => {
  const info = AI_PROVIDER_BY_ID[providerId];
  if (!info || info.id === "custom-openai") throw errors.notFound("That AI provider");
  return info;
};

export const saveKeySchema = z.strictObject({
  providerId: z.string().min(1).max(40),
  label: z.string().trim().max(60).optional().default(""),
  key: z.string().trim().min(16, "That doesn't look like a complete API key.").max(500).regex(/^\S+$/, "Remove spaces or line breaks from the key."),
});

const hintOf = (key: string) => `${key.slice(0, 3)}…${key.slice(-4)}`;

export async function saveCredential(db: Db, staff: Staff, raw: unknown, client: Client = {}) {
  const input = saveKeySchema.parse(raw);
  const info = known(input.providerId);
  const [v, iv, tag, ct] = encrypt(input.key).split(".");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai-cred:${info.id}`}))`);
    const [{ next }] = await tx.select({ next: sql<number>`coalesce(max(${aiCredentials.version}), 0) + 1` }).from(aiCredentials).where(eq(aiCredentials.providerId, info.id));
    const [row] = await tx
      .insert(aiCredentials)
      .values({ providerId: info.id, version: next, label: input.label, ciphertext: ct, iv, authTag: tag, keyVersion: v === "v1" ? 1 : 0, hint: hintOf(input.key), status: "saved", createdBy: staff.userId })
      .returning({ id: aiCredentials.id, version: aiCredentials.version });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "ai_control.key_saved", targetType: "ai_provider", targetId: info.id, after: { version: row.version, hint: hintOf(input.key) }, ip: client.ip, userAgent: client.userAgent });
    return row;
  });
}

/** Read model: never selects ciphertext. */
export async function listCredentials(db: Executor) {
  const rows = await db
    .select({
      id: aiCredentials.id,
      providerId: aiCredentials.providerId,
      version: aiCredentials.version,
      label: aiCredentials.label,
      hint: aiCredentials.hint,
      status: aiCredentials.status,
      verifiedAt: aiCredentials.verifiedAt,
      lastTestAt: aiCredentials.lastTestAt,
      lastTestCode: aiCredentials.lastTestCode,
      lastTestBillable: aiCredentials.lastTestBillable,
      activatedAt: aiCredentials.activatedAt,
      retiredAt: aiCredentials.retiredAt,
      createdAt: aiCredentials.createdAt,
      createdBy: sql<string | null>`coalesce(${users.name}, ${users.email})`,
    })
    .from(aiCredentials)
    .leftJoin(users, eq(users.id, aiCredentials.createdBy))
    .orderBy(aiCredentials.providerId, desc(aiCredentials.version));
  return rows.map((r) => ({
    ...r,
    lastTestMessage: r.lastTestCode ? (TEST_MESSAGE[r.lastTestCode as TestCode] ?? r.lastTestCode) : null,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    lastTestAt: r.lastTestAt?.toISOString() ?? null,
    activatedAt: r.activatedAt?.toISOString() ?? null,
    retiredAt: r.retiredAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

async function lockCredential(tx: Executor, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw errors.notFound("That key");
  const [row] = await tx.select().from(aiCredentials).where(eq(aiCredentials.id, id)).for("update").limit(1);
  if (!row) throw errors.notFound("That key");
  return row;
}

const plain = (row: typeof aiCredentials.$inferSelect) => decrypt([`v${row.keyVersion}`, row.iv, row.authTag, row.ciphertext].join("."));

export const testSchema = z.strictObject({
  /** Set only after the admin confirmed a billable request. */
  billable: z.boolean().optional().default(false),
  /** The model a billable test calls; required for billable tests. */
  modelId: z.string().max(120).optional(),
});

/**
 * Tests a saved key. The result (code only, never a response body) is
 * recorded; a passing test marks the key verified but never activates it.
 */
export async function testCredential(db: Db, staff: Staff, id: string, raw: unknown, env: Env, deps: { fetch?: Fetch } = {}, client: Client = {}) {
  const input = testSchema.parse(raw);
  const limited = await hit(db, "ai-key-test", staff.userId, { limit: 10, windowSeconds: 300 });
  if (!limited.ok) throw new AppError("RATE_LIMITED", `Too many key tests. Try again in ${limited.retryAfter} seconds.`);
  const [row] = await db.select().from(aiCredentials).where(eq(aiCredentials.id, id)).limit(1);
  if (!row) throw errors.notFound("That key");
  if (row.status === "retired" || row.status === "disabled") throw errors.conflict("Retired or disabled keys can't be tested. Save a new key instead.");
  const info = known(row.providerId);
  const key = plain(row);

  let code: TestCode;
  let billable = false;
  let discovered: FreeTestResult["models"] = [];
  if (!input.billable) {
    const r = await freeKeyTest(info, key, deps);
    code = r.code;
    discovered = r.models;
  } else {
    if (!input.modelId) throw new AppError("VALIDATION_FAILED", "Choose a model for the billable test.", { details: { field: "modelId" } });
    const provider = makeProvider(info, key, input.modelId, null, env, deps);
    if (!provider) throw new AppError("FEATURE_DISABLED", "This provider has no generation adapter yet, so a billable test isn't possible.");
    billable = true;
    try {
      await provider.generate({ system: "Reply with the JSON object {\"ok\": true}.", input: "Connection test.", output: z.object({ ok: z.boolean() }), maxOutputTokens: 16, signal: AbortSignal.timeout(15_000) });
      code = "ok";
    } catch (e) {
      const kind = (e as { kind?: string }).kind;
      code = kind === "rate_limited" ? "rate_limited" : kind === "outage" ? "provider_unavailable" : kind === "timeout" ? "network" : "invalid_key";
    }
  }

  await db.transaction(async (tx) => {
    const current = await lockCredential(tx, id);
    const status = code === "ok" ? (current.status === "active" ? "active" : "verified") : current.status === "active" ? "active" : "failed";
    await tx
      .update(aiCredentials)
      .set({ status, lastTestAt: new Date(), lastTestCode: code, lastTestBillable: billable, verifiedAt: code === "ok" ? new Date() : current.verifiedAt })
      .where(eq(aiCredentials.id, id));
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "ai_control.key_tested", targetType: "ai_provider", targetId: info.id, after: { version: current.version, code, billable }, ip: client.ip, userAgent: client.userAgent });
  });
  if (code === "ok" && discovered.length) await recordDiscovered(db, info.id, discovered);
  return { code, message: TEST_MESSAGE[code], billable, discovered: discovered.length };
}

export const activateSchema = z.strictObject({ confirm: z.literal(true, { message: "Confirm the switch to this key." }) });

/** Makes a verified key the active one for its provider, retiring the previous key atomically. */
export async function activateCredential(db: Db, staff: Staff, id: string, raw: unknown, client: Client = {}) {
  activateSchema.parse(raw);
  await db.transaction(async (tx) => {
    const [peek] = await tx.select({ providerId: aiCredentials.providerId }).from(aiCredentials).where(eq(aiCredentials.id, id)).limit(1);
    if (!peek) throw errors.notFound("That key");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai-cred:${peek.providerId}`}))`);
    const row = await lockCredential(tx, id);
    if (row.status === "active") return;
    if (row.status !== "verified" || !row.verifiedAt || row.lastTestCode !== "ok") throw errors.conflict("Only a key that passed its latest test can be activated. Test it first.");
    const [previous] = await tx.select({ id: aiCredentials.id, version: aiCredentials.version }).from(aiCredentials).where(and(eq(aiCredentials.providerId, row.providerId), eq(aiCredentials.status, "active"))).for("update").limit(1);
    if (previous) await tx.update(aiCredentials).set({ status: "retired", retiredAt: new Date() }).where(eq(aiCredentials.id, previous.id));
    await tx.update(aiCredentials).set({ status: "active", activatedAt: new Date() }).where(eq(aiCredentials.id, id));
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "ai_control.key_activated", targetType: "ai_provider", targetId: row.providerId, after: { version: row.version, replaced: previous?.version ?? null }, ip: client.ip, userAgent: client.userAgent });
  });
}

/** Disables a key. Disabling the active key leaves the provider without one: it fails closed. */
export async function disableCredential(db: Db, staff: Staff, id: string, client: Client = {}) {
  await db.transaction(async (tx) => {
    const row = await lockCredential(tx, id);
    if (row.status === "disabled" || row.status === "retired") return;
    await tx.update(aiCredentials).set({ status: "disabled", retiredAt: new Date() }).where(eq(aiCredentials.id, id));
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "ai_control.key_disabled", targetType: "ai_provider", targetId: row.providerId, after: { version: row.version, wasActive: row.status === "active" }, ip: client.ip, userAgent: client.userAgent });
  });
}

/** Server-only: the active key and its version for a provider, or null. Read per request, so new requests use the current version. */
export async function activeKey(db: Executor, providerId: string): Promise<{ key: string; version: number } | null> {
  const [row] = await db.select().from(aiCredentials).where(and(eq(aiCredentials.providerId, providerId), eq(aiCredentials.status, "active"))).limit(1);
  return row ? { key: plain(row), version: row.version } : null;
}
