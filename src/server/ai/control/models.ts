import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { AI_PROVIDER_BY_ID, type Capabilities } from "@/lib/ai/provider-catalog";
import { audit } from "../../audit";
import type { Db, Executor } from "../../db/client";
import { aiModels } from "../../db/schema";
import { errors } from "../../errors";
import { ANTHROPIC_PRICES, type Price } from "../pricing";

/*
 * The model library. Model ids come from three places only:
 *  - catalog: models SociVanta already runs and prices in code (Anthropic, AI-02);
 *  - discovered: ids a provider listed during a passing key test;
 *  - manual: an id an admin entered after checking the provider's docs.
 * Capabilities are never inferred from a name: a discovered or manual model
 * starts with every capability "not verified" until an admin records it.
 * Prices need a source.
 */

const CATALOG_SOURCE = "Anthropic list prices recorded in src/server/ai/pricing.ts (checked 2026-10)";

/** Ensures the code-catalog models exist (idempotent, never overwrites admin edits). */
export async function seedCatalog(db: Executor) {
  const rows = Object.entries(ANTHROPIC_PRICES).map(([modelId, p]) => ({
    providerId: "anthropic",
    modelId,
    displayName: modelId.replace(/^claude-/, "Claude ").replace(/-(\d+)-(\d+)$/, " $1.$2").replace(/-/g, " "),
    source: "catalog",
    status: "available",
    // The AI-02 adapter relies on structured outputs for these models.
    capabilities: { structured_output: true, streaming: true, tool_use: true, vision: null },
    priceInputPerMtok: String(p.input),
    priceOutputPerMtok: String(p.output),
    priceSource: CATALOG_SOURCE,
    priceCheckedAt: new Date("2026-10-01T00:00:00Z"),
    verifiedAt: new Date("2026-10-01T00:00:00Z"),
  }));
  if (rows.length) await db.insert(aiModels).values(rows).onConflictDoNothing();
}

export async function recordDiscovered(db: Executor, providerId: string, models: { id: string; name?: string; contextTokens?: number; maxOutputTokens?: number }[]) {
  if (!models.length) return;
  await db
    .insert(aiModels)
    .values(models.map((m) => ({ providerId, modelId: m.id, displayName: m.name ?? "", source: "discovered", status: "unverified", capabilities: {}, contextTokens: m.contextTokens ?? null, maxOutputTokens: m.maxOutputTokens ?? null })))
    // Re-discovery refreshes only what the provider itself reported.
    .onConflictDoUpdate({ target: [aiModels.providerId, aiModels.modelId], set: { contextTokens: sql`coalesce(excluded.context_tokens, ${aiModels.contextTokens})`, maxOutputTokens: sql`coalesce(excluded.max_output_tokens, ${aiModels.maxOutputTokens})`, updatedAt: new Date() } });
}

export type ModelView = Awaited<ReturnType<typeof listModels>>[number];

export async function listModels(db: Executor) {
  await seedCatalog(db);
  const rows = await db.select().from(aiModels).orderBy(asc(aiModels.providerId), asc(aiModels.modelId));
  return rows.map((m) => ({
    providerId: m.providerId,
    providerName: AI_PROVIDER_BY_ID[m.providerId]?.name ?? m.providerId,
    modelId: m.modelId,
    displayName: m.displayName || m.modelId,
    source: m.source,
    status: m.status,
    capabilities: m.capabilities as Capabilities,
    contextTokens: m.contextTokens,
    maxOutputTokens: m.maxOutputTokens,
    price: m.priceInputPerMtok !== null && m.priceOutputPerMtok !== null ? { input: Number(m.priceInputPerMtok), output: Number(m.priceOutputPerMtok), source: m.priceSource, checkedAt: m.priceCheckedAt?.toISOString() ?? null } : null,
    verifiedAt: m.verifiedAt?.toISOString() ?? null,
  }));
}

export async function modelPrice(db: Executor, providerId: string, modelId: string): Promise<{ price: Price | null; row: typeof aiModels.$inferSelect | null }> {
  const [row] = await db.select().from(aiModels).where(and(eq(aiModels.providerId, providerId), eq(aiModels.modelId, modelId))).limit(1);
  if (!row) return { price: null, row: null };
  return { row, price: row.priceInputPerMtok !== null && row.priceOutputPerMtok !== null ? { input: Number(row.priceInputPerMtok), output: Number(row.priceOutputPerMtok) } : null };
}

const capability = z.boolean().nullable();
export const modelInputSchema = z.strictObject({
  providerId: z.string().min(1).max(40),
  modelId: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:\/@-]+$/, "Use the model id exactly as the provider documents it."),
  displayName: z.string().trim().max(120).optional().default(""),
  status: z.enum(["available", "unverified", "deprecated", "unavailable"]).optional().default("unverified"),
  capabilities: z.strictObject({ structured_output: capability, streaming: capability, tool_use: capability, vision: capability }).partial().optional().default({}),
  contextTokens: z.number().int().positive().max(100_000_000).nullable().optional().default(null),
  maxOutputTokens: z.number().int().positive().max(10_000_000).nullable().optional().default(null),
  price: z
    .strictObject({ input: z.number().min(0).max(1_000), output: z.number().min(0).max(1_000), source: z.string().trim().min(8, "Say where the price comes from (for example the provider's pricing page and date).").max(300) })
    .nullable()
    .optional()
    .default(null),
});

/** Adds a manual model or edits one (capabilities, limits, sourced price, status). */
export async function saveModel(db: Db, staff: { userId: string }, raw: unknown, client: { ip?: string | null; userAgent?: string | null } = {}) {
  const m = modelInputSchema.parse(raw);
  if (!AI_PROVIDER_BY_ID[m.providerId]) throw errors.notFound("That AI provider");
  // "Available" means verified by a person: it needs the structured-output answer recorded either way.
  if (m.status === "available" && (m.capabilities.structured_output === undefined || m.capabilities.structured_output === null)) throw errors.conflict("Record whether the model supports structured JSON output before marking it available.");
  const values = {
    displayName: m.displayName,
    status: m.status,
    capabilities: m.capabilities,
    contextTokens: m.contextTokens,
    maxOutputTokens: m.maxOutputTokens,
    priceInputPerMtok: m.price ? String(m.price.input) : null,
    priceOutputPerMtok: m.price ? String(m.price.output) : null,
    priceSource: m.price?.source ?? null,
    priceCheckedAt: m.price ? new Date() : null,
    verifiedAt: m.status === "available" ? new Date() : null,
    updatedBy: staff.userId,
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(aiModels)
      .values({ providerId: m.providerId, modelId: m.modelId, source: "manual", ...values })
      .onConflictDoUpdate({ target: [aiModels.providerId, aiModels.modelId], set: values });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "ai_control.model_saved", targetType: "ai_model", targetId: `${m.providerId}/${m.modelId}`, after: { status: m.status, capabilities: m.capabilities, price: m.price }, ip: client.ip, userAgent: client.userAgent });
  });
}
