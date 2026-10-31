import "server-only";
import { and, asc, count, eq, ilike, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { modelsFor, priceError, type PricingModel, type ServiceRecord } from "@/lib/admin-services";
import { CATEGORY_FIELDS, CATEGORY_META, type ServiceCategory } from "@/lib/catalog";
import { audit } from "../audit";
import type { Db, Executor } from "../db/client";
import { platforms, serviceEligibility, servicePriceVersions, services } from "../db/schema";
import { PRICING_MODEL, SERVICE_CATEGORY } from "../db/schema/enums";
import { AppError, errors } from "../errors";

/**
 * The service catalog, from PostgreSQL.
 *
 * Two strictly separate views:
 *  - public: visible, non-draft, non-archived services with customer-safe
 *    fields only. Price and quantity rules appear only when the service is
 *    genuinely purchasable (every gate in `purchasable_services`); costs,
 *    notes, provider references and eligibility evidence never leave here.
 *  - staff: the full ServiceRecord the admin editor already uses, plus a
 *    `version` for optimistic concurrency.
 *
 * Prices are stored as append-only versions in micro-units (USD × 1e6, or
 * percent × 1e6 for the fee model). Saving a price never makes a service
 * purchasable: that still needs every eligibility gate.
 */

const MICRO = 1_000_000;
const toMicros = (v: number) => Math.round(v * MICRO);
const fromMicros = (v: number) => Math.round(v) / MICRO;
const fieldError = (field: string, message: string) => new AppError("VALIDATION_FAILED", message, { details: { field } });

/* -------------------------------------------------------------------------- */
/*  Public catalog                                                            */
/* -------------------------------------------------------------------------- */

export interface PublicService {
  id: string;
  name: string;
  description: string;
  platform: { id: string; name: string };
  category: ServiceCategory;
  categoryLabel: string;
  /** "available" only when every purchase requirement is met. */
  status: "available" | "preview";
  price: { amount: number; unit: string } | null;
  limits: { min: number | null; max: number | null } | null;
  /** What an order form asks for (from the service type). */
  fields: { id: string; label: string; kind: string; required: boolean }[];
}

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(80).optional().default(""),
  platform: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  category: z.enum(SERVICE_CATEGORY).optional(),
  sort: z.enum(["name", "platform"]).optional().default("name"),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(48).optional().default(24),
});
export type CatalogQuery = z.input<typeof catalogQuerySchema>;

const UNIT: Record<PricingModel, string> = { per1000: "per 1,000", unit: "per unit", fixed: "per order", fee: "% fee" };
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listPublicServices(db: Db, raw: CatalogQuery) {
  const q = catalogQuerySchema.parse(raw);
  const conds: SQL[] = [eq(services.visible, true), isNull(services.archivedAt), eq(services.draft, false)];
  if (q.platform) conds.push(eq(services.platformId, q.platform));
  if (q.category) conds.push(eq(services.category, q.category));
  for (const term of q.q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
    const p = `%${likeEscape(term)}%`;
    conds.push(or(ilike(services.name, p), ilike(services.description, p), ilike(platforms.name, p), ilike(services.category, p))!);
  }
  const where = and(...conds);
  const [{ total }] = await db.select({ total: count() }).from(services).innerJoin(platforms, eq(platforms.id, services.platformId)).where(where);
  const rows = await db
    .select({
      id: services.id,
      name: services.name,
      description: services.description,
      category: services.category,
      platformId: platforms.id,
      platformName: platforms.name,
      minQty: services.minQty,
      maxQty: services.maxQty,
      priceVersionId: sql<string | null>`(select ps.price_version_id from purchasable_services ps where ps.service_id = ${services.id})`,
    })
    .from(services)
    .innerJoin(platforms, eq(platforms.id, services.platformId))
    .where(where)
    .orderBy(...(q.sort === "platform" ? [asc(platforms.sort), asc(services.name)] : [asc(services.name)]))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);

  const versionIds = rows.map((r) => r.priceVersionId).filter((v): v is string => Boolean(v));
  const versions = versionIds.length ? await db.select().from(servicePriceVersions).where(inArray(servicePriceVersions.id, versionIds)) : [];
  const byId = new Map(versions.map((v) => [v.id, v]));

  const items: PublicService[] = rows.map((r) => {
    const v = r.priceVersionId ? byId.get(r.priceVersionId) : undefined;
    const category = r.category as ServiceCategory;
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      platform: { id: r.platformId, name: r.platformName },
      category,
      categoryLabel: CATEGORY_META[category].label,
      status: v ? "available" : "preview",
      price: v ? { amount: fromMicros(v.priceMicros), unit: UNIT[v.pricingModel as PricingModel] } : null,
      limits: v ? { min: v.minQty, max: v.maxQty } : r.minQty || r.maxQty ? { min: r.minQty, max: r.maxQty } : null,
      fields: CATEGORY_FIELDS[category].map((f) => ({ id: f.id, label: f.label, kind: f.kind, required: f.required })),
    };
  });
  return { items, total, page: q.page, pageSize: q.pageSize, pages: Math.max(1, Math.ceil(total / q.pageSize)) };
}

/* -------------------------------------------------------------------------- */
/*  Staff records                                                             */
/* -------------------------------------------------------------------------- */

export type AdminServiceRecord = ServiceRecord & { version: number };

async function latestVersions(db: Executor, ids?: string[]) {
  const rows = await db.execute<{ service_id: string; pricing_model: string; cost_micros: string; price_micros: string; min_qty: number | null; max_qty: number | null }>(sql`
    select distinct on (service_id) service_id, pricing_model, cost_micros::text, price_micros::text, min_qty, max_qty
    from service_price_versions
    ${ids ? sql`where service_id in ${ids}` : sql``}
    order by service_id, effective_from desc, created_at desc`);
  return new Map(rows.rows.map((r) => [r.service_id, r]));
}

async function loadRecords(db: Executor, ids?: string[]): Promise<AdminServiceRecord[]> {
  if (ids && !ids.length) return [];
  const rows = await db
    .select({ s: services, e: serviceEligibility })
    .from(services)
    .leftJoin(serviceEligibility, eq(serviceEligibility.serviceId, services.id))
    .where(ids ? inArray(services.id, ids) : undefined)
    .orderBy(asc(services.name));
  const prices = await latestVersions(db, ids);
  return rows.map(({ s, e }) => {
    const p = prices.get(s.id);
    const model = (p?.pricing_model ?? modelsFor(s.category as ServiceCategory)[0]) as PricingModel;
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      platformId: s.platformId,
      category: s.category as ServiceCategory,
      visible: s.visible,
      pricing: { model, cost: p ? fromMicros(Number(p.cost_micros)) : null, price: p ? fromMicros(Number(p.price_micros)) : null },
      limits: { min: s.minQty, max: s.maxQty },
      instructions: s.instructions,
      notes: s.internalNotes,
      fulfillment: { type: s.fulfillmentType === "provider" ? "provider" : "manual", providerRef: s.fulfillmentProviderRef, notes: s.fulfillmentNotes },
      checks: { fulfillmentVerified: Boolean(e?.fulfillmentVerifiedAt), policyReviewed: Boolean(e?.policyReviewedAt) },
      archived: Boolean(s.archivedAt),
      draft: s.draft,
      origin: s.origin === "custom" ? "custom" : "catalog",
      updatedAt: s.version > 1 ? s.updatedAt.toISOString() : null,
      version: s.version,
    };
  });
}

export const listAdminServices = (db: Db) => loadRecords(db);

export async function getAdminService(db: Executor, id: string) {
  const [r] = await loadRecords(db, [id]);
  return r ?? null;
}

const SECRET = /(api[_ -]?key|secret|token|password|bearer|sk_)/i;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const nullableNumber = z.number().finite().nonnegative().nullable();

export const serviceInputSchema = z
  .object({
    id: z.string().regex(SLUG, "Use lowercase letters, numbers and single dashes.").max(80),
    name: z.string().trim().min(3, "Use at least 3 characters.").max(120),
    description: z.string().trim().max(1000).default(""),
    platformId: z.string().regex(SLUG).max(40),
    category: z.enum(SERVICE_CATEGORY),
    visible: z.boolean(),
    pricing: z.object({ model: z.enum(PRICING_MODEL), cost: nullableNumber, price: nullableNumber }),
    limits: z.object({ min: z.number().int().min(1).nullable(), max: z.number().int().min(1).nullable() }),
    instructions: z.string().max(1000).default(""),
    notes: z.string().max(1000).default(""),
    fulfillment: z.object({ type: z.enum(["manual", "provider"]), providerRef: z.string().trim().max(40), notes: z.string().max(1000) }),
    checks: z.object({ fulfillmentVerified: z.boolean(), policyReviewed: z.boolean() }),
    archived: z.boolean(),
    draft: z.boolean(),
  })
  .passthrough();
export type ServiceInput = z.output<typeof serviceInputSchema>;

/** Business rules beyond types; mirrors the editor's checks so the server is the authority. */
function checkRules(r: ServiceInput) {
  if (!modelsFor(r.category).includes(r.pricing.model)) throw fieldError("price", "That pricing model doesn't fit this service type.");
  for (const [k, label] of [
    ["cost", "Supplier cost"],
    ["price", "Selling price"],
  ] as const) {
    const v = r.pricing[k];
    const problem = v === null ? null : priceError(String(v), r.pricing.model, label);
    if (problem) throw fieldError(k, problem);
  }
  const { cost, price } = r.pricing;
  if ((cost === null) !== (price === null)) throw fieldError(cost === null ? "cost" : "price", "Set both the supplier cost and the selling price, or neither.");
  if (price !== null && price <= 0) throw fieldError("price", "The selling price must be more than zero.");
  if (cost !== null && price !== null && price < cost) throw fieldError("price", "Selling price can't be below the supplier cost.");
  if (r.limits.min !== null && r.limits.max !== null && r.limits.max < r.limits.min) throw fieldError("max", "Maximum must be at least the minimum.");
  if (r.fulfillment.type === "provider") {
    const ref = r.fulfillment.providerRef;
    if (SECRET.test(ref)) throw fieldError("providerRef", "Never store API keys or credentials here — use a reference name only.");
    if (ref && !/^[A-Za-z0-9 ._-]{2,40}$/.test(ref)) throw fieldError("providerRef", "Use 2–40 letters, numbers, spaces, dots, dashes or underscores.");
  }
  for (const text of [r.notes, r.instructions, r.fulfillment.notes]) if (SECRET.test(text) && /[A-Za-z0-9_-]{24,}/.test(text)) throw fieldError("notes", "Don't store keys or credentials in notes.");
}

export interface Editor {
  userId: string;
  /** Holds the sensitive "Change service prices" permission. */
  canChangePrices: boolean;
  client?: { ip?: string | null; userAgent?: string | null };
}

function pricingDiffers(before: AdminServiceRecord | null, r: ServiceInput) {
  const b = before?.pricing;
  return !b || b.model !== r.pricing.model || b.cost !== r.pricing.cost || b.price !== r.pricing.price;
}

async function writePriceVersion(tx: Executor, id: string, r: ServiceInput, userId: string) {
  if (r.pricing.price === null || r.pricing.cost === null) return false;
  await tx.insert(servicePriceVersions).values({
    serviceId: id,
    pricingModel: r.pricing.model,
    costMicros: toMicros(r.pricing.cost),
    priceMicros: toMicros(r.pricing.price),
    minQty: r.limits.min,
    maxQty: r.limits.max,
    effectiveFrom: new Date(),
    createdBy: userId,
  });
  return true;
}

async function writeGates(tx: Executor, id: string, before: AdminServiceRecord | null, r: ServiceInput, userId: string) {
  const now = new Date();
  const patch: Partial<typeof serviceEligibility.$inferInsert> = {};
  if (!before || before.checks.fulfillmentVerified !== r.checks.fulfillmentVerified) Object.assign(patch, r.checks.fulfillmentVerified ? { fulfillmentVerifiedAt: now, fulfillmentVerifiedBy: userId } : { fulfillmentVerifiedAt: null, fulfillmentVerifiedBy: null });
  if (!before || before.checks.policyReviewed !== r.checks.policyReviewed) Object.assign(patch, r.checks.policyReviewed ? { policyReviewedAt: now, policyReviewedBy: userId } : { policyReviewedAt: null, policyReviewedBy: null });
  if (!Object.keys(patch).length) return false;
  await tx
    .insert(serviceEligibility)
    .values({ serviceId: id, ...patch })
    .onConflictDoUpdate({ target: serviceEligibility.serviceId, set: { ...patch, updatedAt: now } });
  return true;
}

/** Updates one service. `expectedVersion` must match, or nothing changes (CONFLICT). */
export async function updateService(db: Db, editor: Editor, id: string, raw: unknown, expectedVersion: number): Promise<AdminServiceRecord> {
  const r = serviceInputSchema.parse(raw);
  if (r.id !== id) throw fieldError("id", "A service's ID can't be changed.");
  checkRules(r);
  return db.transaction(async (tx) => {
    const before = await getAdminService(tx, id);
    if (!before) throw errors.notFound("That service");
    if (before.version !== expectedVersion) throw new AppError("CONFLICT", "Someone else changed this service. Reload to see the latest version, then try again.", { details: { currentVersion: before.version } });
    const priceChanged = pricingDiffers(before, r) && !(before.pricing.price === null && r.pricing.price === null);
    if (priceChanged && !editor.canChangePrices) throw errors.forbidden("change service prices");
    if (priceChanged && before.pricing.price !== null && r.pricing.price === null) throw fieldError("price", "A saved price can't be removed. Hide or archive the service instead.");
    const [platform] = await tx.select({ id: platforms.id }).from(platforms).where(eq(platforms.id, r.platformId));
    if (!platform) throw fieldError("platformId", "Choose a valid platform.");

    const updated = await tx
      .update(services)
      .set({
        name: r.name,
        description: r.description,
        platformId: r.platformId,
        category: r.category,
        visible: r.visible,
        instructions: r.instructions,
        internalNotes: r.notes,
        fulfillmentType: r.fulfillment.type,
        fulfillmentProviderRef: r.fulfillment.type === "provider" ? r.fulfillment.providerRef : "",
        fulfillmentNotes: r.fulfillment.notes,
        minQty: r.limits.min,
        maxQty: r.limits.max,
        draft: r.draft,
        archivedAt: r.archived ? (before.archived ? undefined : new Date()) : null,
        version: sql`${services.version} + 1`,
        updatedBy: editor.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(services.id, id), eq(services.version, expectedVersion)))
      .returning({ id: services.id });
    if (!updated.length) throw new AppError("CONFLICT", "Someone else changed this service. Reload to see the latest version, then try again.");

    const priced = priceChanged ? await writePriceVersion(tx, id, r, editor.userId) : false;
    const gates = await writeGates(tx, id, before, r, editor.userId);
    const c = editor.client ?? {};
    await audit(tx, {
      actorUserId: editor.userId,
      actorType: "staff",
      action: "service.updated",
      targetType: "service",
      targetId: id,
      before: { visible: before.visible, archived: before.archived, name: before.name, limits: before.limits, version: before.version },
      after: { visible: r.visible, archived: r.archived, name: r.name, limits: r.limits, version: expectedVersion + 1 },
      ip: c.ip,
      userAgent: c.userAgent,
    });
    if (priced) await audit(tx, { actorUserId: editor.userId, actorType: "staff", action: "service.price_versioned", targetType: "service", targetId: id, before: before.pricing as unknown as Record<string, unknown>, after: r.pricing as unknown as Record<string, unknown>, ip: c.ip, userAgent: c.userAgent });
    if (gates) await audit(tx, { actorUserId: editor.userId, actorType: "staff", action: "service.gate_recorded", targetType: "service", targetId: id, before: before.checks, after: r.checks, ip: c.ip, userAgent: c.userAgent });
    return (await getAdminService(tx, id))!;
  });
}

/** Creates a custom service (hidden until staff show it; never purchasable by default). */
export async function createService(db: Db, editor: Editor, raw: unknown): Promise<AdminServiceRecord> {
  const r = serviceInputSchema.parse(raw);
  checkRules(r);
  if (r.pricing.price !== null && !editor.canChangePrices) throw errors.forbidden("change service prices");
  return db.transaction(async (tx) => {
    const [platform] = await tx.select({ id: platforms.id }).from(platforms).where(eq(platforms.id, r.platformId));
    if (!platform) throw fieldError("platformId", "Choose a valid platform.");
    const inserted = await tx
      .insert(services)
      .values({
        id: r.id,
        platformId: r.platformId,
        category: r.category,
        name: r.name,
        description: r.description,
        visible: r.visible,
        origin: "custom",
        instructions: r.instructions,
        internalNotes: r.notes,
        fulfillmentType: r.fulfillment.type,
        fulfillmentProviderRef: r.fulfillment.type === "provider" ? r.fulfillment.providerRef : "",
        fulfillmentNotes: r.fulfillment.notes,
        minQty: r.limits.min,
        maxQty: r.limits.max,
        draft: r.draft,
        archivedAt: r.archived ? new Date() : null,
        updatedBy: editor.userId,
      })
      .onConflictDoNothing({ target: services.id })
      .returning({ id: services.id });
    if (!inserted.length) throw fieldError("id", "A service with this ID already exists.");
    await tx.insert(serviceEligibility).values({ serviceId: r.id }).onConflictDoNothing();
    await writeGates(tx, r.id, { checks: { fulfillmentVerified: false, policyReviewed: false } } as AdminServiceRecord, r, editor.userId);
    await writePriceVersion(tx, r.id, r, editor.userId);
    await audit(tx, { actorUserId: editor.userId, actorType: "staff", action: "service.created", targetType: "service", targetId: r.id, after: { name: r.name, visible: r.visible, draft: r.draft }, ip: editor.client?.ip, userAgent: editor.client?.userAgent });
    return (await getAdminService(tx, r.id))!;
  });
}

/** Shows/hides or archives/restores several services at once — all or nothing. */
export async function bulkUpdateServices(db: Db, editor: Editor, items: { id: string; version: number }[], patch: { visible?: boolean; archived?: boolean }) {
  if (!items.length || items.length > 200) throw errors.conflict("Select between 1 and 200 services.");
  return db.transaction(async (tx) => {
    for (const item of items) {
      const res = await tx
        .update(services)
        .set({
          ...(patch.visible !== undefined ? { visible: patch.visible } : {}),
          ...(patch.archived !== undefined ? { archivedAt: patch.archived ? new Date() : null } : {}),
          version: sql`${services.version} + 1`,
          updatedBy: editor.userId,
          updatedAt: new Date(),
        })
        .where(and(eq(services.id, item.id), eq(services.version, item.version)))
        .returning({ id: services.id });
      if (!res.length) throw new AppError("CONFLICT", "Some of these services changed since you loaded them. Reload and try again — nothing was changed.");
    }
    await audit(tx, { actorUserId: editor.userId, actorType: "staff", action: "service.bulk_updated", targetType: "service", targetId: null, after: { ids: items.map((i) => i.id), ...patch }, ip: editor.client?.ip, userAgent: editor.client?.userAgent });
    return loadRecords(tx, items.map((i) => i.id));
  });
}

/** Counts for the admin summary, straight from the database. */
export async function catalogCounts(db: Db) {
  const [row] = (
    await db.execute<{ total: number; visible: number; priced: number; purchasable: number }>(sql`
    select
      (select count(*)::int from services where archived_at is null) as total,
      (select count(*)::int from services where archived_at is null and visible and not draft) as visible,
      (select count(distinct service_id)::int from service_price_versions) as priced,
      (select count(*)::int from purchasable_services) as purchasable`)
  ).rows;
  return row;
}

