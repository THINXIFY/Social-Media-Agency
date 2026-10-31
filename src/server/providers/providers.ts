import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "../audit";
import { decrypt, encrypt } from "../auth/crypto";
import type { Db, Executor } from "../db/client";
import { fulfillmentAttempts, platforms, providerCredentials, providerEvents, providerHealthChecks, providers, providerServiceMappings, serviceEligibility, services, users } from "../db/schema";
import { ACTIVE_FULFILLMENT_STATUS, PROVIDER_EVENT_TYPE } from "../db/schema/enums";
import { AppError, errors } from "../errors";
import { callProvider, ERROR_MESSAGE, healthSchema, ProviderCallError, type ProviderAdapter } from "./adapter";
import { ADAPTERS } from "./registry";

/*
 * Provider management (Phase 5F): records, write-only credentials, health
 * checks, service mappings and an append-only history. Nothing here enables a
 * provider, activates a service, changes a price or touches money.
 */

type Staff = { userId: string };
type Client = { ip?: string | null; userAgent?: string | null };
export type Deps = { adapters?: Record<string, ProviderAdapter>; timeoutMs?: number; backoffMs?: number };

export const GATES = [
  ["policyReviewedAt", "Policy review"],
  ["supplierVerifiedAt", "Supplier verified"],
  ["fulfillmentVerifiedAt", "Fulfilment verified"],
  ["paymentAcceptedAt", "Payment provider accepts it"],
  ["legalReviewedAt", "Legal review"],
  ["technicalReadyAt", "Technical readiness"],
] as const;

export type ProviderState = "archived" | "not_connected" | "needs_credential" | "disabled" | "attention" | "ready";
const STATE_COPY: Record<ProviderState, { label: string; detail: string }> = {
  archived: { label: "Archived", detail: "Kept for history. It can't be used." },
  not_connected: { label: "Not connected", detail: "No approved integration is installed for this provider, so it can't receive orders." },
  needs_credential: { label: "Needs credentials", detail: "The integration needs an API credential before it can be checked." },
  disabled: { label: "Disabled", detail: "Configured but switched off. Enabling needs a recorded supplier review." },
  attention: { label: "Needs attention", detail: "The last health check failed." },
  ready: { label: "Ready", detail: "Enabled, reviewed and passing health checks." },
};

export async function recordEvent(tx: Executor, providerId: string, type: (typeof PROVIDER_EVENT_TYPE)[number], message: string, opts: { ok?: boolean; actorUserId?: string | null; data?: Record<string, unknown> } = {}) {
  await tx.insert(providerEvents).values({ providerId, type, message, ok: opts.ok ?? true, actorUserId: opts.actorUserId ?? null, data: opts.data ?? {} });
}

const adapterFor = (key: string | null, deps: Deps = {}) => (key ? ((deps.adapters ?? ADAPTERS)[key] ?? null) : null);

function stateOf(p: typeof providers.$inferSelect, hasCredential: boolean, lastHealthOk: boolean | null, deps: Deps = {}): ProviderState {
  if (p.archivedAt) return "archived";
  const adapter = adapterFor(p.adapter, deps);
  if (!adapter) return "not_connected";
  if (adapter.needsCredential && !hasCredential) return "needs_credential";
  if (!p.enabled) return "disabled";
  if (lastHealthOk === false) return "attention";
  return "ready";
}

/** Why a provider can't be enabled yet, in plain words. Enabling itself isn't offered in this phase. */
function enableBlockers(p: typeof providers.$inferSelect, hasCredential: boolean, deps: Deps = {}) {
  const out: string[] = [];
  const adapter = adapterFor(p.adapter, deps);
  if (!adapter) out.push("No approved integration is installed for this provider.");
  if (adapter?.needsCredential && !hasCredential) out.push("No API credential is configured.");
  if (!p.supplierReviewedAt) out.push("No supplier review has been recorded (decision D2).");
  out.push("Provider submission is switched off for every provider in this phase.");
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Read models (never select credential ciphertext)                          */
/* -------------------------------------------------------------------------- */

async function credentialMeta(db: Executor, ids: string[]) {
  if (!ids.length) return new Map<string, { last4: string | null; createdAt: Date }>();
  const rows = await db
    .select({ providerId: providerCredentials.providerId, last4: providerCredentials.last4, createdAt: providerCredentials.createdAt })
    .from(providerCredentials)
    .where(and(inArray(providerCredentials.providerId, ids), isNull(providerCredentials.rotatedAt)));
  return new Map(rows.map((r) => [r.providerId, { last4: r.last4, createdAt: r.createdAt }]));
}

async function lastHealth(db: Executor, ids: string[]) {
  if (!ids.length) return new Map<string, { ok: boolean; checkedAt: Date; error: string | null }>();
  const rows = await db
    .selectDistinctOn([providerHealthChecks.providerId], { providerId: providerHealthChecks.providerId, ok: providerHealthChecks.ok, checkedAt: providerHealthChecks.checkedAt, error: providerHealthChecks.error })
    .from(providerHealthChecks)
    .where(inArray(providerHealthChecks.providerId, ids))
    .orderBy(providerHealthChecks.providerId, desc(providerHealthChecks.checkedAt));
  return new Map(rows.map((r) => [r.providerId, r]));
}

export async function listProviders(db: Executor, deps: Deps = {}) {
  const rows = await db.select().from(providers).orderBy(asc(providers.archivedAt), asc(providers.name));
  const ids = rows.map((r) => r.id);
  const [creds, health, mapped] = await Promise.all([
    credentialMeta(db, ids),
    lastHealth(db, ids),
    ids.length
      ? db
          .select({ providerId: providerServiceMappings.providerId, total: count(), active: sql<number>`count(*) filter (where ${providerServiceMappings.active})::int` })
          .from(providerServiceMappings)
          .where(inArray(providerServiceMappings.providerId, ids))
          .groupBy(providerServiceMappings.providerId)
      : Promise.resolve([]),
  ]);
  const maps = new Map(mapped.map((m) => [m.providerId, m]));
  return rows.map((p) => {
    const c = creds.get(p.id);
    const h = health.get(p.id) ?? null;
    const state = stateOf(p, Boolean(c), h ? h.ok : null, deps);
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      state,
      stateLabel: STATE_COPY[state].label,
      enabled: p.enabled,
      integration: adapterFor(p.adapter, deps)?.name ?? null,
      credential: c ? { configured: true, last4: c.last4, setAt: c.createdAt.toISOString() } : { configured: false, last4: null, setAt: null },
      mappings: { total: maps.get(p.id)?.total ?? 0, active: maps.get(p.id)?.active ?? 0 },
      lastCheck: h ? { ok: h.ok, at: h.checkedAt.toISOString(), error: h.error } : null,
      archived: Boolean(p.archivedAt),
    };
  });
}

export async function getProvider(db: Executor, id: string, deps: Deps = {}) {
  const [p] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
  if (!p) return null;
  const [creds, health, events, mappings, attempts] = await Promise.all([
    credentialMeta(db, [id]),
    db.select().from(providerHealthChecks).where(eq(providerHealthChecks.providerId, id)).orderBy(desc(providerHealthChecks.checkedAt)).limit(10),
    db
      .select({ e: providerEvents, who: sql<string | null>`coalesce(${users.name}, ${users.email})` })
      .from(providerEvents)
      .leftJoin(users, eq(users.id, providerEvents.actorUserId))
      .where(eq(providerEvents.providerId, id))
      .orderBy(desc(providerEvents.at))
      .limit(40),
    mappingsFor(db, eq(providerServiceMappings.providerId, id)),
    db.select({ status: fulfillmentAttempts.status, n: count() }).from(fulfillmentAttempts).where(eq(fulfillmentAttempts.providerId, id)).groupBy(fulfillmentAttempts.status),
  ]);
  const c = creds.get(id);
  const state = stateOf(p, Boolean(c), health[0] ? health[0].ok : null, deps);
  const adapter = adapterFor(p.adapter, deps);
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    description: p.description,
    endpoint: p.endpoint,
    authMethod: p.authMethod,
    limitations: p.limitations,
    enabled: p.enabled,
    archived: Boolean(p.archivedAt),
    state,
    stateLabel: STATE_COPY[state].label,
    stateDetail: STATE_COPY[state].detail,
    integration: adapter ? { name: adapter.name, capabilities: adapter.capabilities } : null,
    supplierReviewedAt: p.supplierReviewedAt?.toISOString() ?? null,
    enableBlockers: p.enabled ? [] : enableBlockers(p, Boolean(c), deps),
    credential: c ? { configured: true, last4: c.last4, setAt: c.createdAt.toISOString() } : { configured: false, last4: null, setAt: null },
    health: health.map((h) => ({ ok: h.ok, latencyMs: h.latencyMs, error: h.error, at: h.checkedAt.toISOString() })),
    events: events.map(({ e, who }) => ({ id: e.id, type: e.type, message: e.message, ok: e.ok, by: who ?? (e.actorUserId ? "Staff" : "System"), at: e.at.toISOString() })),
    mappings,
    attempts: Object.fromEntries(attempts.map((a) => [a.status, a.n])),
    createdAt: p.createdAt.toISOString(),
  };
}

/** Mappings with their service, eligibility checklist and whether activation is possible. */
export async function mappingsFor(db: Executor, where: ReturnType<typeof eq>) {
  const rows = await db
    .select({ m: providerServiceMappings, s: { id: services.id, name: services.name, archivedAt: services.archivedAt }, platform: platforms.name, e: serviceEligibility, p: { enabled: providers.enabled, archivedAt: providers.archivedAt, name: providers.name } })
    .from(providerServiceMappings)
    .innerJoin(services, eq(services.id, providerServiceMappings.serviceId))
    .innerJoin(platforms, eq(platforms.id, services.platformId))
    .innerJoin(providers, eq(providers.id, providerServiceMappings.providerId))
    .leftJoin(serviceEligibility, eq(serviceEligibility.serviceId, services.id))
    .where(where)
    .orderBy(asc(platforms.name), asc(services.name));
  return rows.map(({ m, s, platform, e, p }) => {
    const gates = GATES.map(([key, label]) => ({ label, done: Boolean(e?.[key]) }));
    const blockers = [
      ...gates.filter((g) => !g.done).map((g) => `${g.label} isn't recorded`),
      ...(s.archivedAt ? ["The service is archived"] : []),
      ...(!p.enabled || p.archivedAt ? ["The provider isn't enabled"] : []),
    ];
    return {
      providerId: m.providerId,
      providerName: p.name,
      serviceId: s.id,
      serviceName: s.name,
      platform,
      providerRef: m.providerRef,
      priority: m.priority,
      note: m.note,
      active: m.active,
      gates,
      blockers,
      updatedAt: m.updatedAt.toISOString(),
    };
  });
}

/** Catalog services that can be mapped (not archived, not budget-based), with how many gates are recorded. */
export async function mappableServices(db: Executor) {
  const rows = await db
    .select({ id: services.id, name: services.name, platform: platforms.name, e: serviceEligibility, model: currentModel })
    .from(services)
    .innerJoin(platforms, eq(platforms.id, services.platformId))
    .leftJoin(serviceEligibility, eq(serviceEligibility.serviceId, services.id))
    .where(isNull(services.archivedAt))
    .orderBy(asc(platforms.name), asc(services.name));
  return rows
    .filter((r) => r.model !== "fee")
    .map((r) => ({ id: r.id, name: r.name, platform: r.platform, gatesDone: GATES.filter(([k]) => Boolean(r.e?.[k])).length, gatesTotal: GATES.length }));
}

/* -------------------------------------------------------------------------- */
/*  Provider records                                                          */
/* -------------------------------------------------------------------------- */

/** The service's current pricing model; the outer column is qualified so it can't bind to the price table's own id. */
const currentModel = sql<string | null>`(select v.pricing_model from service_price_versions v where v.service_id = "services"."id" and v.effective_from <= now() order by v.effective_from desc limit 1)`;

const text = (max: number) => z.string().trim().max(max);
export const providerInputSchema = z.strictObject({
  name: z.string().trim().min(2, "Give the provider a name.").max(80),
  type: z.enum(["api", "manual"]),
  description: text(500).optional().default(""),
  endpoint: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "Use a full https:// address.")
    .optional()
    .default(""),
  authMethod: z.enum(["api_key", "oauth", "basic", "none"]).nullable().optional().default(null),
  limitations: text(500).optional().default(""),
});

const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "provider";

export async function createProvider(db: Db, staff: Staff, raw: unknown, client: Client = {}) {
  const input = providerInputSchema.parse(raw);
  return db.transaction(async (tx) => {
    let id = slug(input.name);
    for (let n = 2; (await tx.select({ id: providers.id }).from(providers).where(eq(providers.id, id)).limit(1)).length; n++) id = `${slug(input.name).slice(0, 36)}-${n}`;
    // New providers are never enabled and have no integration; both are decided outside this form.
    await tx.insert(providers).values({ id, name: input.name, type: input.type, description: input.description, endpoint: input.endpoint || null, authMethod: input.authMethod, limitations: input.limitations, enabled: false, adapter: null });
    await recordEvent(tx, id, "created", `Provider "${input.name}" added (disabled, not connected).`, { actorUserId: staff.userId });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "provider.created", targetType: "provider", targetId: id, after: { name: input.name, type: input.type }, ip: client.ip, userAgent: client.userAgent });
    return id;
  });
}

export async function updateProvider(db: Db, staff: Staff, id: string, raw: unknown, client: Client = {}) {
  const input = providerInputSchema.parse(raw);
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(providers).where(eq(providers.id, id)).for("update").limit(1);
    if (!p) throw errors.notFound("That provider");
    if (p.archivedAt) throw errors.conflict("Archived providers can't be edited.");
    await tx.update(providers).set({ name: input.name, type: input.type, description: input.description, endpoint: input.endpoint || null, authMethod: input.authMethod, limitations: input.limitations, updatedAt: new Date() }).where(eq(providers.id, id));
    await recordEvent(tx, id, "updated", "Provider details updated.", { actorUserId: staff.userId });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "provider.updated", targetType: "provider", targetId: id, before: { name: p.name, type: p.type, endpoint: p.endpoint }, after: { name: input.name, type: input.type, endpoint: input.endpoint || null }, ip: client.ip, userAgent: client.userAgent });
  });
}

export async function archiveProvider(db: Db, staff: Staff, id: string, client: Client = {}) {
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(providers).where(eq(providers.id, id)).for("update").limit(1);
    if (!p) throw errors.notFound("That provider");
    if (p.archivedAt) return;
    const [{ n }] = await tx.select({ n: count() }).from(fulfillmentAttempts).where(and(eq(fulfillmentAttempts.providerId, id), inArray(fulfillmentAttempts.status, [...ACTIVE_FULFILLMENT_STATUS])));
    if (n > 0) throw errors.conflict("This provider has open fulfilment attempts. Resolve them before archiving.");
    // Archiving disables it; the trigger switches its mappings off.
    await tx.update(providers).set({ archivedAt: new Date(), enabled: false, updatedAt: new Date() }).where(eq(providers.id, id));
    await tx.update(providerCredentials).set({ rotatedAt: new Date() }).where(and(eq(providerCredentials.providerId, id), isNull(providerCredentials.rotatedAt)));
    await recordEvent(tx, id, "archived", "Provider archived. Its credential was retired and its mappings switched off.", { actorUserId: staff.userId });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "provider.archived", targetType: "provider", targetId: id, ip: client.ip, userAgent: client.userAgent });
  });
}

/* -------------------------------------------------------------------------- */
/*  Credentials: write-only, encrypted at rest                                */
/* -------------------------------------------------------------------------- */

export const credentialSchema = z.strictObject({ secret: z.string().trim().min(8, "That doesn't look like a complete credential.").max(4000) });

/** Stores a new credential (replacing any current one). The plain value is never stored, logged or returned. */
export async function setCredential(db: Db, staff: Staff, id: string, raw: unknown, client: Client = {}) {
  const secret = credentialSchema.parse(raw).secret.trim();
  const [v, iv, tag, ct] = encrypt(secret).split(".");
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(providers).where(eq(providers.id, id)).for("update").limit(1);
    if (!p) throw errors.notFound("That provider");
    if (p.archivedAt) throw errors.conflict("Archived providers can't hold credentials.");
    const now = new Date();
    const replaced = await tx.update(providerCredentials).set({ rotatedAt: now }).where(and(eq(providerCredentials.providerId, id), isNull(providerCredentials.rotatedAt))).returning({ id: providerCredentials.id });
    await tx.insert(providerCredentials).values({ providerId: id, ciphertext: ct, iv, authTag: tag, keyVersion: v === "v1" ? 1 : 0, last4: secret.slice(-4), createdBy: staff.userId });
    await recordEvent(tx, id, "credential_set", replaced.length ? "API credential replaced." : "API credential added.", { actorUserId: staff.userId });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: replaced.length ? "provider.credential_rotated" : "provider.credential_set", targetType: "provider", targetId: id, ip: client.ip, userAgent: client.userAgent });
  });
}

export async function removeCredential(db: Db, staff: Staff, id: string, client: Client = {}) {
  await db.transaction(async (tx) => {
    const done = await tx.update(providerCredentials).set({ rotatedAt: new Date() }).where(and(eq(providerCredentials.providerId, id), isNull(providerCredentials.rotatedAt))).returning({ id: providerCredentials.id });
    if (!done.length) return;
    await recordEvent(tx, id, "credential_removed", "API credential removed.", { actorUserId: staff.userId });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "provider.credential_removed", targetType: "provider", targetId: id, ip: client.ip, userAgent: client.userAgent });
  });
}

/** Server-only: the current credential for an adapter call. */
export async function loadCredential(db: Executor, id: string): Promise<string | null> {
  const [c] = await db.select().from(providerCredentials).where(and(eq(providerCredentials.providerId, id), isNull(providerCredentials.rotatedAt))).limit(1);
  if (!c) return null;
  return decrypt([`v${c.keyVersion}`, c.iv, c.authTag, c.ciphertext].join("."));
}

/* -------------------------------------------------------------------------- */
/*  Health checks                                                             */
/* -------------------------------------------------------------------------- */

/** Runs a health check and records its real outcome. Without an installed integration nothing is contacted. */
export async function runHealthCheck(db: Db, actor: Staff | null, id: string, deps: Deps = {}) {
  const [p] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
  if (!p) throw errors.notFound("That provider");
  if (p.archivedAt) throw errors.conflict("Archived providers aren't checked.");
  const adapter = adapterFor(p.adapter, deps);
  let ok = false;
  let error: string | null = null;
  let latencyMs: number | null = null;
  let balanceCents: number | null = null;
  if (!adapter) error = "No approved integration is installed, so nothing was contacted.";
  else {
    const started = Date.now();
    try {
      const credential = await loadCredential(db, id);
      const r = await callProvider({ db, providerId: id, adapter, credential, endpoint: p.endpoint, readOnly: true, timeoutMs: deps.timeoutMs, backoffMs: deps.backoffMs }, (ctx) => adapter.health(ctx), healthSchema);
      ok = r.ok;
      balanceCents = adapter.capabilities.balance ? (r.balanceCents ?? null) : null;
      if (!r.ok) error = "The provider reported a problem.";
    } catch (e) {
      error = e instanceof ProviderCallError ? ERROR_MESSAGE[e.kind] : ERROR_MESSAGE.unknown;
    }
    latencyMs = Date.now() - started;
  }
  await db.transaction(async (tx) => {
    await tx.insert(providerHealthChecks).values({ providerId: id, ok, latencyMs, balanceCents, error });
    await recordEvent(tx, id, "health_checked", ok ? "Health check passed." : `Health check failed: ${error}`, { ok, actorUserId: actor?.userId ?? null });
  });
  return { ok, error, latencyMs };
}

/* -------------------------------------------------------------------------- */
/*  Service mappings                                                          */
/* -------------------------------------------------------------------------- */

export const mappingSchema = z.strictObject({
  serviceId: z.string().min(1).max(80),
  providerRef: z
    .string()
    .trim()
    .min(1, "Enter the provider's service reference.")
    .max(120)
    .regex(/^[A-Za-z0-9._:\/#-]+$/, "Use letters, numbers and . _ : / # - only."),
  priority: z.number().int().min(1).max(5).optional().default(1),
  note: text(300).optional().default(""),
});

/** Creates or edits a mapping. Mappings are saved inactive; changing an active one switches it off for re-verification. */
export async function saveMapping(db: Db, staff: Staff, providerId: string, raw: unknown, client: Client = {}) {
  const input = mappingSchema.parse(raw);
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(providers).where(eq(providers.id, providerId)).limit(1);
    if (!p) throw errors.notFound("That provider");
    if (p.archivedAt) throw errors.conflict("Archived providers can't be mapped.");
    const [svc] = await tx
      .select({ id: services.id, name: services.name, archivedAt: services.archivedAt, model: currentModel })
      .from(services)
      .where(eq(services.id, input.serviceId))
      .limit(1);
    if (!svc) throw new AppError("VALIDATION_FAILED", "Choose a service from the catalog.", { details: { field: "serviceId" } });
    if (svc.archivedAt) throw new AppError("VALIDATION_FAILED", "Archived services can't be mapped.", { details: { field: "serviceId" } });
    if (svc.model === "fee") throw new AppError("VALIDATION_FAILED", "Budget-based services are arranged with staff and can't be mapped to a provider.", { details: { field: "serviceId" } });
    const [existing] = await tx.select().from(providerServiceMappings).where(and(eq(providerServiceMappings.providerId, providerId), eq(providerServiceMappings.serviceId, input.serviceId))).for("update").limit(1);
    if (existing) {
      const changed = existing.providerRef !== input.providerRef || existing.priority !== input.priority;
      await tx
        .update(providerServiceMappings)
        .set({ providerRef: input.providerRef, priority: input.priority, note: input.note, active: changed ? false : existing.active, verifiedAt: changed ? null : existing.verifiedAt, updatedAt: new Date() })
        .where(and(eq(providerServiceMappings.providerId, providerId), eq(providerServiceMappings.serviceId, input.serviceId)));
    } else {
      await tx.insert(providerServiceMappings).values({ providerId, serviceId: input.serviceId, providerRef: input.providerRef, priority: input.priority, note: input.note, active: false, createdBy: staff.userId });
    }
    await recordEvent(tx, providerId, "mapping_saved", `Mapping for "${svc.name}" saved as ${input.providerRef} (inactive until verified).`, { actorUserId: staff.userId, data: { serviceId: svc.id } });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "provider.mapping_saved", targetType: "provider", targetId: providerId, after: { serviceId: svc.id, providerRef: input.providerRef, priority: input.priority }, ip: client.ip, userAgent: client.userAgent });
  });
}

/** Activation is checked here (with readable reasons) and again by trigger SV012. */
export async function setMappingActive(db: Db, staff: Staff, providerId: string, serviceId: string, active: boolean, client: Client = {}) {
  await db.transaction(async (tx) => {
    const [m] = await mappingsFor(tx, and(eq(providerServiceMappings.providerId, providerId), eq(providerServiceMappings.serviceId, serviceId)) as ReturnType<typeof eq>);
    if (!m) throw errors.notFound("That mapping");
    if (m.active === active) return;
    if (active && m.blockers.length) throw new AppError("CONFLICT", `This mapping can't be activated yet: ${m.blockers.join("; ")}.`, { details: { blockers: m.blockers } });
    await tx.update(providerServiceMappings).set({ active, verifiedAt: active ? new Date() : null, updatedAt: new Date() }).where(and(eq(providerServiceMappings.providerId, providerId), eq(providerServiceMappings.serviceId, serviceId)));
    await recordEvent(tx, providerId, active ? "mapping_activated" : "mapping_deactivated", `Mapping for "${m.serviceName}" ${active ? "activated" : "switched off"}.`, { actorUserId: staff.userId, data: { serviceId } });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: active ? "provider.mapping_activated" : "provider.mapping_deactivated", targetType: "provider", targetId: providerId, after: { serviceId }, ip: client.ip, userAgent: client.userAgent });
  });
}

export async function removeMapping(db: Db, staff: Staff, providerId: string, serviceId: string, client: Client = {}) {
  await db.transaction(async (tx) => {
    const done = await tx.delete(providerServiceMappings).where(and(eq(providerServiceMappings.providerId, providerId), eq(providerServiceMappings.serviceId, serviceId))).returning({ ref: providerServiceMappings.providerRef });
    if (!done.length) throw errors.notFound("That mapping");
    await recordEvent(tx, providerId, "mapping_removed", `Mapping ${done[0].ref} removed.`, { actorUserId: staff.userId, data: { serviceId } });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "provider.mapping_removed", targetType: "provider", targetId: providerId, after: { serviceId }, ip: client.ip, userAgent: client.userAgent });
  });
}
