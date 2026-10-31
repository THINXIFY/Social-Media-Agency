/**
 * Admin service management: catalog records, pricing maths and demo state.
 *
 * The customer catalog (`@/lib/catalog`) stays the single source of service
 * definitions. Admin edits are stored as overrides per service id, plus any
 * services an admin creates, in this browser only under `sv-admin-services`.
 * Nothing here changes what customers see, activates checkout or contacts a
 * provider. Pricing helpers are pure so the same rules can run on a server.
 */

import * as React from "react";
import {
  CATEGORY_FIELDS,
  CATEGORY_META,
  isQuantityBased,
  PLATFORM_BY_ID,
  SERVICES,
  type ServiceCategory,
} from "@/lib/catalog";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

/** per1000/unit: quantity services. fixed: a flat fee per order. fee: a % service fee on a customer's campaign budget. */
export type PricingModel = "per1000" | "unit" | "fixed" | "fee";

export interface Pricing {
  model: PricingModel;
  /** Supplier cost in USD (or % for the fee model). null = not set. */
  cost: number | null;
  /** Customer selling price in USD (or % for the fee model). null = not set. */
  price: number | null;
}

export interface ServiceRecord {
  id: string;
  name: string;
  description: string;
  platformId: string;
  category: ServiceCategory;
  /** Shown in the customer catalog. Independent from purchase. */
  visible: boolean;
  pricing: Pricing;
  limits: { min: number | null; max: number | null };
  instructions: string;
  notes: string;
  fulfillment: { type: "manual" | "provider"; providerRef: string; notes: string };
  /** Admin attestations. Simulated in this demo. */
  checks: { fulfillmentVerified: boolean; policyReviewed: boolean };
  archived: boolean;
  /** Created in this demo and not yet saved as a full service. */
  draft: boolean;
  origin: "catalog" | "custom";
  updatedAt: string | null;
  /** Live mode: the stored version this record was read at (optimistic concurrency). */
  version?: number;
}

export const PRICING_MODELS: Record<PricingModel, { label: string; unit: string; help: string; percent?: boolean }> = {
  per1000: { label: "Per 1,000", unit: "per 1,000", help: "Charged per 1,000 units — 2,500 followers costs 2.5 × this price." },
  unit: { label: "Per unit", unit: "per unit", help: "Charged for each single unit ordered." },
  fixed: { label: "Fixed fee", unit: "per order", help: "One flat amount per order, whatever its size." },
  fee: { label: "Budget fee", unit: "of budget", help: "A percentage of the customer's campaign budget — 10% of a $500 budget is $50.", percent: true },
};

export const modelsFor = (category: ServiceCategory): PricingModel[] => (isQuantityBased(category) ? ["per1000", "unit"] : ["fixed", "fee"]);

/* -------------------------------------------------------------------------- */
/*  Pricing maths (pure, cents-rounded)                                       */
/* -------------------------------------------------------------------------- */

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Gross profit and margin per pricing unit. null when either side isn't set. */
export function unitMargin(p: Pricing) {
  if (p.cost === null || p.price === null) return null;
  const profit = p.price - p.cost;
  return { profit, margin: p.price > 0 ? (profit / p.price) * 100 : null };
}

/** A sample order total: quantity for per1000/unit, budget for fee, ignored for fixed. */
export function quote(p: Pricing, amount: number) {
  if (p.cost === null || p.price === null) return null;
  const factor = p.model === "per1000" ? amount / 1000 : p.model === "unit" ? amount : p.model === "fee" ? amount / 100 : 1;
  const customer = round2(p.price * factor);
  const cost = round2(p.cost * factor);
  const profit = round2(customer - cost);
  return { customer, cost, profit, margin: customer > 0 ? (profit / customer) * 100 : null };
}

const MONEY_DP = { per1000: 4, unit: 4, fixed: 2, fee: 2 } as const;

/** Validates a price or cost the way a server should. */
export function priceError(raw: string, model: PricingModel, label: string) {
  if (!raw.trim()) return null;
  const n = Number(raw);
  if (!/^\d+(\.\d+)?$/.test(raw.trim()) || !Number.isFinite(n)) return `${label} must be a number, like 4.50.`;
  const dp = raw.split(".")[1]?.length ?? 0;
  if (dp > MONEY_DP[model]) return `${label} can have at most ${MONEY_DP[model]} decimal places.`;
  if (model === "fee" && n > 100) return `${label} can't be more than 100%.`;
  if (n > 1_000_000) return `${label} looks too large.`;
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Status                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * Three independent answers per service:
 * - lifecycle: draft or archived (or neither);
 * - pricing: set the moment a valid cost and price are saved — no approval step;
 * - purchase: only "ready" when every activation requirement is genuinely met.
 */

export type PricingStatus = "priced" | "not_priced";
export type PurchaseStatus = "ready" | "not_enabled";

export const isPriced = (s: ServiceRecord) => s.pricing.cost !== null && s.pricing.price !== null;
export const pricingStatus = (s: ServiceRecord): PricingStatus => (isPriced(s) ? "priced" : "not_priced");
export const purchaseStatus = (s: ServiceRecord): PurchaseStatus => (eligibility(s).ready ? "ready" : "not_enabled");
export const lifecycleOf = (s: ServiceRecord) => (s.archived ? "archived" : s.draft ? "draft" : null);

/** Purchase needs every check; payment-provider approval can't pass until a processor is connected. */
export const PAYMENT_PROVIDER_APPROVED = false;

export type RequirementId = "visible" | "pricing" | "fulfillment" | "policy" | "payments";

export interface Requirement {
  id: RequirementId;
  label: string;
  ok: boolean;
  /** What's true when met, or why it isn't. */
  detail: string;
  /** Admins can't complete it here (needs an integration). */
  locked?: boolean;
}

/** Activation readiness: every requirement must be met before purchase can be enabled. */
export function eligibility(s: ServiceRecord) {
  const visible = s.visible && !s.archived;
  const items: Requirement[] = [
    { id: "visible", label: "Catalog visibility", ok: visible, detail: visible ? "Customers can find it." : s.archived ? "Archived services are hidden." : "Hidden from the catalog." },
    { id: "pricing", label: "Pricing configured", ok: isPriced(s), detail: isPriced(s) ? "Cost and selling price are set." : "Supplier cost and selling price aren't set." },
    {
      id: "fulfillment",
      label: "Fulfilment verified",
      ok: s.checks.fulfillmentVerified,
      detail: s.checks.fulfillmentVerified ? "Delivery process confirmed." : "Confirm how orders are delivered.",
    },
    { id: "policy", label: "Platform-policy review", ok: s.checks.policyReviewed, detail: s.checks.policyReviewed ? "Reviewed against platform terms." : "Not reviewed yet." },
    {
      id: "payments",
      label: "Payment-provider approval",
      ok: PAYMENT_PROVIDER_APPROVED,
      detail: PAYMENT_PROVIDER_APPROVED ? "Approved." : "No payment provider is connected.",
      locked: !PAYMENT_PROVIDER_APPROVED,
    },
  ];
  const done = items.filter((i) => i.ok).length;
  return { items, done, total: items.length, ready: done === items.length };
}

/* -------------------------------------------------------------------------- */
/*  Baseline from the customer catalog                                        */
/* -------------------------------------------------------------------------- */

function baseline(): ServiceRecord[] {
  return SERVICES.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    platformId: s.platformId,
    category: s.category,
    visible: true,
    pricing: { model: modelsFor(s.category)[0], cost: null, price: s.price?.amount ?? null },
    limits: { min: s.limits?.min ?? null, max: s.limits?.max ?? null },
    instructions: "",
    notes: "",
    fulfillment: { type: "manual", providerRef: "", notes: "" },
    checks: { fulfillmentVerified: false, policyReviewed: false },
    archived: false,
    draft: false,
    origin: "catalog",
    updatedAt: null,
  }));
}

const BASELINE = baseline();
const BASELINE_BY_ID = Object.fromEntries(BASELINE.map((s) => [s.id, s]));

/** Fields an order form asks for, from the service type. */
export const requiredFields = (category: ServiceCategory) => CATEGORY_FIELDS[category].filter((f) => f.required);

/* -------------------------------------------------------------------------- */
/*  Store                                                                     */
/* -------------------------------------------------------------------------- */

const KEY = "sv-admin-services";
const listeners = new Set<() => void>();

interface Stored {
  /** Full records for catalog services an admin edited, and for custom services. */
  records: Record<string, ServiceRecord>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const CATEGORIES = Object.keys(CATEGORY_META) as ServiceCategory[];

/** Only well-formed records survive a reload. */
function parseRecord(id: string, v: unknown): ServiceRecord | null {
  if (!isObj(v)) return null;
  const category = CATEGORIES.includes(v.category as ServiceCategory) ? (v.category as ServiceCategory) : null;
  const platformId = typeof v.platformId === "string" && PLATFORM_BY_ID[v.platformId] ? v.platformId : null;
  if (!category || !platformId || !/^[a-z0-9-]{2,80}$/.test(id)) return null;
  const p = isObj(v.pricing) ? v.pricing : {};
  const model = modelsFor(category).includes(p.model as PricingModel) ? (p.model as PricingModel) : modelsFor(category)[0];
  const l = isObj(v.limits) ? v.limits : {};
  const f = isObj(v.fulfillment) ? v.fulfillment : {};
  const c = isObj(v.checks) ? v.checks : {};
  return {
    id,
    name: str(v.name, 120) || id,
    description: str(v.description, 600),
    platformId,
    category,
    visible: v.visible === true,
    pricing: { model, cost: numOrNull(p.cost), price: numOrNull(p.price) },
    limits: { min: numOrNull(l.min), max: numOrNull(l.max) },
    instructions: str(v.instructions, 1000),
    notes: str(v.notes, 1000),
    fulfillment: { type: f.type === "provider" ? "provider" : "manual", providerRef: str(f.providerRef, 80), notes: str(f.notes, 1000) },
    checks: { fulfillmentVerified: c.fulfillmentVerified === true, policyReviewed: c.policyReviewed === true },
    archived: v.archived === true,
    draft: v.draft === true,
    origin: BASELINE_BY_ID[id] ? "catalog" : "custom",
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : null,
  };
}

let memo: { raw: string | null; list: ServiceRecord[] } | null = null;

function read(): ServiceRecord[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (memo && memo.raw === raw) return memo.list;
  let records: Record<string, ServiceRecord> = {};
  try {
    const data = raw ? (JSON.parse(raw) as Stored) : null;
    for (const [id, v] of Object.entries(isObj(data?.records) ? data!.records : {})) {
      const r = parseRecord(id, v);
      if (r) records[id] = r;
    }
  } catch {
    records = {};
  }
  const list = [...BASELINE.map((b) => records[b.id] ?? b), ...Object.values(records).filter((r) => r.origin === "custom")];
  memo = { raw, list };
  return list;
}

function write(records: Record<string, ServiceRecord>) {
  try {
    if (Object.keys(records).length) localStorage.setItem(KEY, JSON.stringify({ records } satisfies Stored));
    else localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

function storedRecords(): Record<string, ServiceRecord> {
  return Object.fromEntries(read().filter((r) => r.origin === "custom" || r !== BASELINE_BY_ID[r.id]).map((r) => [r.id, r]));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => (e.key === KEY || e.key === null) && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

const serverSnapshot = () => BASELINE;

/** Every service record (catalog plus custom), with this browser's admin edits applied. */
export function useServiceRecords() {
  return React.useSyncExternalStore(subscribe, read, serverSnapshot);
}

export const serviceExists = (id: string) => read().some((r) => r.id === id);

/** Saves one record. Catalog ids and custom ids are never reused for something else. */
export function saveService(record: ServiceRecord) {
  const records = storedRecords();
  records[record.id] = { ...record, updatedAt: new Date().toISOString(), origin: BASELINE_BY_ID[record.id] ? "catalog" : "custom" };
  write(records);
}

export function updateServices(ids: string[], patch: Partial<Pick<ServiceRecord, "visible" | "archived">>) {
  const records = storedRecords();
  const all = Object.fromEntries(read().map((r) => [r.id, r]));
  const at = new Date().toISOString();
  for (const id of ids) if (all[id]) records[id] = { ...all[id], ...patch, updatedAt: at };
  write(records);
}

/** Number of services changed in this browser (for the reset control). */
export const changedCount = (list: ServiceRecord[]) => list.filter((r) => r.updatedAt !== null).length;

export function resetAdminServices() {
  write({});
}

/** A unique id from a name: "Instagram Followers" → "instagram-followers", "-2" if taken. */
export function uniqueId(name: string, taken: (id: string) => boolean) {
  const base =
    name
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 70) || "service";
  if (!taken(base)) return base;
  for (let i = 2; ; i++) if (!taken(`${base}-${i}`)) return `${base}-${i}`;
}

export function blankService(): ServiceRecord {
  return {
    id: "",
    name: "",
    description: "",
    platformId: "instagram",
    category: "audience",
    visible: false,
    pricing: { model: "per1000", cost: null, price: null },
    limits: { min: null, max: null },
    instructions: "",
    notes: "",
    fulfillment: { type: "manual", providerRef: "", notes: "" },
    checks: { fulfillmentVerified: false, policyReviewed: false },
    archived: false,
    draft: true,
    origin: "custom",
    updatedAt: null,
  };
}
