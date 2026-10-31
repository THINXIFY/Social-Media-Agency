/**
 * Fulfilment providers for the Admin demo.
 *
 * Providers and their service mappings are admin-only demo state, kept in this
 * browser under `sv-admin-providers` and validated on every read. Nothing here
 * talks to a supplier: there's no connection test, no health data and no
 * order submission, so no provider can ever be "Connected" in the demo.
 * Credentials are never collected — only the authentication *method* is
 * recorded, and free-text fields reject anything that looks like a secret.
 */

import * as React from "react";
import { ADMIN_NOW } from "@/lib/admin-demo";
import { looksSensitive } from "@/lib/admin-orders";
import type { ServiceRecord } from "@/lib/admin-services";

export type ProviderType = "manual" | "api";
export type AuthMethod = "" | "api_key" | "oauth" | "basic" | "none";
/** `connected` and `error` need a real, server-side connection check — the demo never produces them. */
export type ProviderStatus = "not_configured" | "draft" | "verification_required" | "connected" | "error" | "disabled";

export interface Mapping {
  serviceId: string;
  /** The provider's own reference for this service. */
  ref: string;
  updatedAt: string;
}

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  description: string;
  notes: string;
  enabled: boolean;
  draft: boolean;
  archived: boolean;
  endpoint: string;
  authMethod: AuthMethod;
  instructions: string;
  /** Staff confirmed the supplier passed eligibility review. A demo attestation, not a verified connection. */
  supplierReviewed: boolean;
  limitations: string;
  operationalNotes: string;
  fallbackId: string;
  mappings: Mapping[];
  /** Seeded sample providers, shown as simulated. */
  demo: boolean;
  createdAt: string;
  updatedAt: string;
}

export const TYPE_LABEL: Record<ProviderType, string> = { manual: "Manual", api: "API" };
export const AUTH_LABEL: Record<Exclude<AuthMethod, "">, string> = { api_key: "API key", oauth: "OAuth 2.0", basic: "Username & password", none: "No authentication" };

export const STATUS_META: Record<ProviderStatus, { label: string; explain: string; dot: string }> = {
  not_configured: { label: "Not configured", explain: "Required connection details are missing.", dot: "bg-off" },
  draft: { label: "Configuration draft", explain: "Saved as a draft. Finish setup and save it to make it a provider.", dot: "bg-muted-foreground" },
  verification_required: {
    label: "Verification required",
    explain: "Set up, but the connection has never been verified. Verification needs a secure backend, so it can't happen in this demo.",
    dot: "bg-soon",
  },
  connected: { label: "Connected", explain: "A real connection was verified by the backend.", dot: "bg-ok" },
  error: { label: "Connection error", explain: "The last real connection check failed.", dot: "bg-destructive" },
  disabled: { label: "Disabled", explain: "Turned off. It won't be offered for any service.", dot: "bg-off" },
};

/* -------------------------------------------------------------------------- */
/*  Validation                                                                */
/* -------------------------------------------------------------------------- */

/** Long unbroken strings look like keys or tokens; refuse them in free text. */
const KEY_LIKE = /[A-Za-z0-9_\-+/=]{32,}/;
export const secretError = (text: string) => (looksSensitive(text) || KEY_LIKE.test(text) ? "Don't paste keys, tokens, passwords or other credentials here." : null);

export function endpointError(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Add the provider's API endpoint.";
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return "Enter a full URL, like https://api.example.com/v2.";
  }
  if (url.protocol !== "https:") return "Use a secure https:// address.";
  if (url.username || url.password) return "Remove the username or password from the address.";
  if ([...url.searchParams.keys()].some((k) => /key|token|secret|auth|pass/i.test(k))) return "Remove credentials from the address. They're never stored here.";
  return null;
}

export const isConfigured = (p: Provider) => Boolean(p.name.trim()) && (p.type === "api" ? !endpointError(p.endpoint) && Boolean(p.authMethod) : p.instructions.trim().length >= 10);

export function statusOf(p: Provider): ProviderStatus {
  if (!p.enabled) return "disabled";
  if (p.draft) return "draft";
  if (!isConfigured(p)) return "not_configured";
  return "verification_required";
}

/** A service may be mapped only once its platform-policy review is done and it isn't archived. */
export function serviceEligibility(record: ServiceRecord | undefined): { ok: boolean; reason: string } {
  if (!record) return { ok: false, reason: "Service no longer exists." };
  if (record.archived) return { ok: false, reason: "Archived in Services & Pricing." };
  if (!record.checks.policyReviewed) return { ok: false, reason: "Platform-policy review not done in Services & Pricing." };
  return { ok: true, reason: "Platform-policy review done." };
}

export function refError(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Enter the provider's reference for this service.";
  if (v.length > 64) return "Keep the reference under 64 characters.";
  if (!/^[A-Za-z0-9._:/#-]+$/.test(v)) return "Use letters, numbers and . _ - : / # only.";
  if (looksSensitive(v)) return "That looks like a credential, not a service reference.";
  return null;
}

export type MappingState = { kind: "ok" } | { kind: "blocked"; reason: string } | { kind: "conflict"; others: string[] };

/** Per-mapping health: blocked if the service lost eligibility, conflict if another active provider maps it too. */
export function mappingState(m: Mapping, provider: Provider, all: Provider[], records: Record<string, ServiceRecord>): MappingState {
  const elig = serviceEligibility(records[m.serviceId]);
  if (!elig.ok) return { kind: "blocked", reason: elig.reason };
  const others = all.filter((p) => p.id !== provider.id && !p.archived && p.mappings.some((x) => x.serviceId === m.serviceId)).map((p) => p.name);
  return others.length ? { kind: "conflict", others } : { kind: "ok" };
}

export function compatibilityNote(record: ServiceRecord | undefined, provider: Provider): string | null {
  if (!record) return null;
  if (provider.type === "api" && record.fulfillment.type === "manual") return "This service is set to manual fulfilment in Services & Pricing.";
  if (provider.type === "manual" && record.fulfillment.type === "provider") return "This service expects an API provider in Services & Pricing.";
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Attention                                                                 */
/* -------------------------------------------------------------------------- */

export type Section = "general" | "connection" | "mapping" | "operations" | "review";

export interface ProviderIssue {
  id: string;
  title: string;
  detail: string;
  action: string;
  section: Section;
}

/** What's stopping a provider being usable, most fundamental first. */
export function issuesOf(p: Provider, all: Provider[], records: Record<string, ServiceRecord>): ProviderIssue[] {
  if (p.archived) return [];
  const list: ProviderIssue[] = [];
  if (!isConfigured(p)) {
    list.push(
      p.type === "api"
        ? { id: "endpoint", title: "Connection details missing", detail: endpointError(p.endpoint) ?? "Choose how the provider authenticates.", action: "Add connection details", section: "connection" }
        : { id: "instructions", title: "Fulfilment instructions missing", detail: "Describe how staff fulfil orders with this provider.", action: "Add instructions", section: "connection" },
    );
  }
  if (!p.supplierReviewed) list.push({ id: "supplier", title: "Supplier review pending", detail: "Services can't be mapped until the supplier passes eligibility review.", action: "Review supplier", section: "review" });
  if (p.draft && isConfigured(p)) list.push({ id: "draft", title: "Saved as a draft", detail: "Setup looks complete. Save it to finish.", action: "Finish setup", section: "review" });
  const states = p.mappings.map((m) => mappingState(m, p, all, records));
  const blocked = states.filter((s) => s.kind === "blocked").length;
  const conflicts = states.filter((s) => s.kind === "conflict").length;
  if (blocked) list.push({ id: "blocked", title: `${blocked} mapping${blocked === 1 ? "" : "s"} blocked`, detail: "Their services are no longer eligible for fulfilment.", action: "Fix mappings", section: "mapping" });
  if (conflicts) list.push({ id: "conflict", title: `${conflicts} mapping conflict${conflicts === 1 ? "" : "s"}`, detail: "Another provider maps the same service.", action: "Review mappings", section: "mapping" });
  const fb = p.fallbackId ? all.find((x) => x.id === p.fallbackId) : null;
  if (p.fallbackId && (!fb || fb.archived || !fb.enabled)) list.push({ id: "fallback", title: "Fallback provider unavailable", detail: "The fallback is archived, disabled or missing.", action: "Change fallback", section: "operations" });
  return list;
}

/** The one next step, including setup that isn't a problem yet. */
export function nextStepOf(p: Provider, all: Provider[], records: Record<string, ServiceRecord>): ProviderIssue | null {
  if (p.archived) return null;
  if (!p.enabled) return { id: "enable", title: "Disabled", detail: "Enable the provider to work on it again.", action: "Enable provider", section: "general" };
  const [first] = issuesOf(p, all, records);
  if (first) return first;
  if (!p.mappings.length) return { id: "map", title: "No services mapped", detail: "Map the SociVanta services this provider can fulfil.", action: "Map services", section: "mapping" };
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Store                                                                     */
/* -------------------------------------------------------------------------- */

const KEY = "sv-admin-providers";
const SEED_AT = ADMIN_NOW;

const base = (p: Partial<Provider> & Pick<Provider, "id" | "name" | "type">): Provider => ({
  description: "",
  notes: "",
  enabled: true,
  draft: false,
  archived: false,
  endpoint: "",
  authMethod: "",
  instructions: "",
  supplierReviewed: false,
  limitations: "",
  operationalNotes: "",
  fallbackId: "",
  mappings: [],
  demo: false,
  createdAt: SEED_AT,
  updatedAt: SEED_AT,
  ...p,
});

/** Simulated sample providers. None is connected, none has mappings until an admin creates them. */
export const SEED_PROVIDERS: Provider[] = [
  base({
    id: "northwind-supply",
    name: "Northwind Social Supply",
    type: "api",
    description: "Sample API wholesaler for audience and engagement services.",
    endpoint: "https://api.northwind.example/v2",
    authMethod: "api_key",
    limitations: "Sample: no private accounts; maximum 50,000 per order.",
    demo: true,
  }),
  base({
    id: "in-house-creative",
    name: "In-house Creative Team",
    type: "manual",
    description: "Sample internal team for content and channel-management services.",
    instructions: "Staff pick up the order in the ops queue, confirm the brief with the customer, then deliver within the agreed window.",
    supplierReviewed: true,
    operationalNotes: "Sample: weekdays only.",
    demo: true,
  }),
  base({ id: "atlas-growth", name: "Atlas Growth API", type: "api", description: "Sample provider still being evaluated.", draft: true, demo: true }),
];

const listeners = new Set<() => void>();
let memo: { raw: string | null; list: Provider[] } | null = null;

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");

function clean(v: unknown): Provider | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id, 48);
  if (!/^[a-z0-9][a-z0-9-]{1,46}$/.test(id) || !str(o.name)) return null;
  const type: ProviderType = o.type === "manual" ? "manual" : "api";
  const auth = (["api_key", "oauth", "basic", "none"] as const).find((a) => a === o.authMethod) ?? "";
  const mappings = Array.isArray(o.mappings)
    ? (o.mappings as unknown[])
        .filter((m): m is Mapping => !!m && typeof (m as Mapping).serviceId === "string" && typeof (m as Mapping).ref === "string")
        .map((m) => ({ serviceId: m.serviceId.slice(0, 80), ref: m.ref.slice(0, 64), updatedAt: str(m.updatedAt, 40) || SEED_AT }))
        .slice(0, 500)
    : [];
  return base({
    id,
    name: str(o.name, 80),
    type,
    description: str(o.description, 500),
    notes: str(o.notes, 1000),
    enabled: o.enabled !== false,
    draft: o.draft === true,
    archived: o.archived === true,
    endpoint: str(o.endpoint, 300),
    authMethod: auth,
    instructions: str(o.instructions, 2000),
    supplierReviewed: o.supplierReviewed === true,
    limitations: str(o.limitations, 1000),
    operationalNotes: str(o.operationalNotes, 1000),
    fallbackId: str(o.fallbackId, 48),
    mappings,
    demo: o.demo === true,
    createdAt: str(o.createdAt, 40) || SEED_AT,
    updatedAt: str(o.updatedAt, 40) || SEED_AT,
  });
}

function read(): Provider[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (memo?.raw === raw) return memo.list;
  let list = SEED_PROVIDERS;
  try {
    const data = raw ? (JSON.parse(raw) as { providers?: unknown[] }) : null;
    if (Array.isArray(data?.providers)) {
      const seen = new Set<string>();
      list = data.providers.map(clean).filter((p): p is Provider => !!p && !seen.has(p.id) && (seen.add(p.id), true));
    }
  } catch {}
  memo = { raw, list };
  return list;
}

function write(list: Provider[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ providers: list }));
  } catch {}
  listeners.forEach((l) => l());
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

export function useProviders() {
  return React.useSyncExternalStore(subscribe, read, () => SEED_PROVIDERS);
}

const stamp = () => new Date().toISOString();

export function saveProvider(p: Provider) {
  const list = read();
  const next = { ...p, updatedAt: stamp() };
  write(list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? next : x)) : [...list, next]);
}

export function patchProvider(id: string, patch: Partial<Provider>) {
  write(read().map((x) => (x.id === id ? { ...x, ...patch, updatedAt: stamp() } : x)));
}

export function setMapping(providerId: string, serviceId: string, ref: string, previousServiceId?: string) {
  write(
    read().map((p) => {
      if (p.id !== providerId) return p;
      const rest = p.mappings.filter((m) => m.serviceId !== serviceId && m.serviceId !== previousServiceId);
      return { ...p, mappings: [...rest, { serviceId, ref: ref.trim(), updatedAt: stamp() }], updatedAt: stamp() };
    }),
  );
}

export function removeMapping(providerId: string, serviceId: string) {
  write(read().map((p) => (p.id === providerId ? { ...p, mappings: p.mappings.filter((m) => m.serviceId !== serviceId), updatedAt: stamp() } : p)));
}

export function resetProviders() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

const providersChanged = () => {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
};

/** True once anything differs from the seeded providers, so Reset is worth offering. */
export function useProvidersChanged() {
  return React.useSyncExternalStore(subscribe, providersChanged, () => false);
}

export function providerIdFrom(name: string, taken: (id: string) => boolean) {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "provider";
  let id = slug.length < 2 ? `${slug}-1` : slug;
  for (let n = 2; taken(id); n++) id = `${slug}-${n}`;
  return id;
}

export function blankProvider(): Provider {
  return base({ id: "", name: "", type: "api", createdAt: stamp(), updatedAt: stamp() });
}
