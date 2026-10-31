/**
 * Admin settings: local demo preferences for the Settings Center.
 *
 * Every value here is a draft kept in this browser under its own admin-only
 * key. Nothing is enforced: customer pages, prices, payments, notifications
 * and the site itself never read these settings. Values controlled by code
 * (accounting currency, enabled languages, deposit limits, brand tokens) are
 * shown read-only from their real sources instead of being copied here.
 *
 * No field accepts credentials, keys, wallet addresses or card data, and free
 * text is checked so such things can't be pasted in by accident.
 */

import * as React from "react";
import { ADMIN_USER } from "@/lib/admin-demo";
import { looksSensitive } from "@/lib/admin-orders";
import { TIMEZONES } from "@/lib/account";
import { CURRENCIES, type CurrencyCode } from "@/lib/i18n/config";
import { DEFAULT_DISPLAY } from "@/lib/i18n";
import { DEPOSIT_LIMITS } from "@/lib/payments";

export type SettingsSection = "general" | "branding" | "orders" | "payments" | "notifications" | "integrations";
export type EditableSection = Exclude<SettingsSection, "integrations">;
export const EDITABLE: EditableSection[] = ["general", "branding", "orders", "payments", "notifications"];

/* -------------------------------------------------------------------------- */
/*  Shapes & defaults                                                         */
/* -------------------------------------------------------------------------- */

export interface GeneralSettings {
  platformName: string;
  platformUrl: string;
  supportEmail: string;
  displayCurrency: CurrencyCode;
  timezone: string;
  maintenancePreview: boolean;
  maintenanceMessage: string;
}

export type Appearance = "light" | "dark" | "system";

export interface BrandingSettings {
  displayName: string;
  primaryColor: string;
  accentColor: string;
  appearance: Appearance;
  senderName: string;
  replyTo: string;
}

export type ReviewMode = "all" | "flagged";
export type ProcessingMode = "manual" | "provider";
export type AssignmentMode = "staff" | "mapped";

export interface OrderSettings {
  /** Kept as text while editing so validation can explain bad input. */
  defaultMin: string;
  defaultMax: string;
  review: ReviewMode;
  processing: ProcessingMode;
  assignment: AssignmentMode;
  allowCancelBeforeStart: boolean;
  partialRefunds: boolean;
}

export interface PaymentSettings {
  secondReviewAt: string;
  pendingFlagHours: string;
  adjustmentReason: boolean;
  refundApprovalAbove: string;
}

export type NotifyKey = "newOrders" | "orderReview" | "tickets" | "deposits" | "providers" | "referrals";
export type Digest = "instant" | "daily";

export interface NotificationSettings {
  events: Record<NotifyKey, boolean>;
  digest: Digest;
}

export interface SettingsValues {
  general: GeneralSettings;
  branding: BrandingSettings;
  orders: OrderSettings;
  payments: PaymentSettings;
  notifications: NotificationSettings;
}

export const NOTIFY_EVENTS: { id: NotifyKey; label: string; description: string }[] = [
  { id: "newOrders", label: "New orders", description: "When a customer places an order." },
  { id: "orderReview", label: "Orders requiring review", description: "When an order is flagged or waits for staff approval." },
  { id: "tickets", label: "New support tickets", description: "When a customer opens a ticket or replies." },
  { id: "deposits", label: "Pending deposit verification", description: "When a deposit waits to be verified before crediting." },
  { id: "providers", label: "Provider issues", description: "When a provider needs setup, fails a check or is disabled." },
  { id: "referrals", label: "Referral reward reviews", description: "When a reward finishes its hold and needs approval." },
];

export const BRAND = { primary: "#7047EB", graphite: "#202127", accent: "#C8FF52" };

export const DEFAULTS: SettingsValues = {
  general: {
    platformName: "SociVanta",
    platformUrl: "",
    supportEmail: ADMIN_USER.email,
    displayCurrency: DEFAULT_DISPLAY.currency,
    timezone: "UTC",
    maintenancePreview: false,
    maintenanceMessage: "",
  },
  branding: {
    displayName: "SociVanta",
    primaryColor: BRAND.primary,
    accentColor: BRAND.accent,
    appearance: "light",
    senderName: "SociVanta",
    replyTo: ADMIN_USER.email,
  },
  orders: {
    defaultMin: "100",
    defaultMax: "10000",
    review: "all",
    processing: "manual",
    assignment: "staff",
    allowCancelBeforeStart: true,
    partialRefunds: true,
  },
  payments: {
    secondReviewAt: "500",
    pendingFlagHours: "24",
    adjustmentReason: true,
    refundApprovalAbove: "100",
  },
  notifications: {
    events: { newOrders: false, orderReview: true, tickets: true, deposits: true, providers: true, referrals: true },
    digest: "instant",
  },
};

/* -------------------------------------------------------------------------- */
/*  Validation                                                                */
/* -------------------------------------------------------------------------- */

export type Errors = Record<string, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const HEX = /^#[0-9a-f]{6}$/i;
const KEY_LIKE = /[A-Za-z0-9_\-+/=]{32,}/;
const secret = (s: string) => looksSensitive(s) || KEY_LIKE.test(s);
const SECRET_MSG = "Don't enter passwords, keys, wallet addresses or other credentials here.";

function text(errs: Errors, key: string, v: string, label: string, min: number, max: number) {
  const t = v.trim();
  if (!t) errs[key] = `Enter a ${label.toLowerCase()}.`;
  else if (t.length < min) errs[key] = min === 1 ? `Enter a ${label.toLowerCase()}.` : `${label} needs at least ${min} characters.`;
  else if (t.length > max) errs[key] = `${label} can be at most ${max} characters.`;
  else if (secret(t)) errs[key] = SECRET_MSG;
}

function int(errs: Errors, key: string, v: string, label: string, min: number, max: number) {
  const t = v.trim();
  if (!t) errs[key] = `Enter ${label.toLowerCase()}.`;
  else if (!/^\d+$/.test(t)) errs[key] = "Use a whole number, without commas or decimals.";
  else if (Number(t) < min || Number(t) > max) errs[key] = `Use a number from ${min.toLocaleString("en-US")} to ${max.toLocaleString("en-US")}.`;
  return /^\d+$/.test(t) ? Number(t) : null;
}

/** Relative luminance contrast ratio between two hex colours. */
export function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

export function validUrl(raw: string) {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" && u.hostname.includes(".") && !u.username && !u.password ? u : null;
  } catch {
    return null;
  }
}

export const VALIDATE: { [K in EditableSection]: (v: SettingsValues[K]) => Errors } = {
  general: (v) => {
    const e: Errors = {};
    text(e, "platformName", v.platformName, "Platform name", 2, 40);
    if (v.platformUrl.trim() && !validUrl(v.platformUrl)) e.platformUrl = "Use a full https:// address, like https://example.com.";
    if (!EMAIL.test(v.supportEmail.trim())) e.supportEmail = "Enter a valid email address, like support@example.com.";
    if (!CURRENCIES.includes(v.displayCurrency)) e.displayCurrency = "Choose a supported currency.";
    if (!TIMEZONES.some((t) => t.id === v.timezone)) e.timezone = "Choose a time zone.";
    if (v.maintenanceMessage.trim().length > 200) e.maintenanceMessage = "Keep the message under 200 characters.";
    else if (secret(v.maintenanceMessage)) e.maintenanceMessage = SECRET_MSG;
    else if (v.maintenancePreview && !v.maintenanceMessage.trim()) e.maintenanceMessage = "Add the message customers would see.";
    return e;
  },
  branding: (v) => {
    const e: Errors = {};
    text(e, "displayName", v.displayName, "Display name", 2, 40);
    if (!HEX.test(v.primaryColor.trim())) e.primaryColor = "Use a 6-digit hex colour, like #7047EB.";
    else if (contrast(v.primaryColor.trim(), "#ffffff") < 4.5) e.primaryColor = `White text on this colour is hard to read (${contrast(v.primaryColor.trim(), "#ffffff").toFixed(1)}:1). Choose a darker colour; 4.5:1 is the minimum.`;
    if (!HEX.test(v.accentColor.trim())) e.accentColor = "Use a 6-digit hex colour, like #C8FF52.";
    text(e, "senderName", v.senderName, "Sender name", 2, 40);
    if (!EMAIL.test(v.replyTo.trim())) e.replyTo = "Enter a valid email address.";
    return e;
  },
  orders: (v) => {
    const e: Errors = {};
    const min = int(e, "defaultMin", v.defaultMin, "a minimum", 1, 1_000_000);
    const max = int(e, "defaultMax", v.defaultMax, "a maximum", 1, 10_000_000);
    if (min !== null && max !== null && !e.defaultMin && !e.defaultMax && max <= min) e.defaultMax = "The maximum must be greater than the minimum.";
    if (v.processing === "provider") e.processing = "No provider is connected, so orders can only be processed manually.";
    return e;
  },
  payments: (v) => {
    const e: Errors = {};
    int(e, "secondReviewAt", v.secondReviewAt, "an amount", DEPOSIT_LIMITS.min, DEPOSIT_LIMITS.max);
    int(e, "pendingFlagHours", v.pendingFlagHours, "a number of hours", 1, 168);
    int(e, "refundApprovalAbove", v.refundApprovalAbove, "an amount", 1, 10_000);
    return e;
  },
  notifications: () => ({}),
};

/* -------------------------------------------------------------------------- */
/*  Store                                                                     */
/* -------------------------------------------------------------------------- */

export interface Stored {
  values: SettingsValues;
  savedAt: Partial<Record<EditableSection, string>>;
}

const KEY = "sv-admin-settings";
const EMPTY: Stored = { values: DEFAULTS, savedAt: {} };
const listeners = new Set<() => void>();
let memo: { raw: string | null; state: Stored } | null = null;

const str = (v: unknown, d: string, max = 200) => (typeof v === "string" ? v.slice(0, max) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T) => (allowed.includes(v as T) ? (v as T) : d);

/** Rebuild each section from known fields only, then drop any section that doesn't validate. */
function clean(raw: Record<string, Record<string, unknown> | undefined>): SettingsValues {
  const g = raw.general ?? {};
  const b = raw.branding ?? {};
  const o = raw.orders ?? {};
  const p = raw.payments ?? {};
  const n = raw.notifications ?? {};
  const D = DEFAULTS;
  const events = (n.events ?? {}) as Record<string, unknown>;
  const out: SettingsValues = {
    general: {
      platformName: str(g.platformName, D.general.platformName, 40),
      platformUrl: str(g.platformUrl, D.general.platformUrl, 200),
      supportEmail: str(g.supportEmail, D.general.supportEmail, 120),
      displayCurrency: pick(g.displayCurrency, CURRENCIES, D.general.displayCurrency),
      timezone: pick(g.timezone, TIMEZONES.map((t) => t.id), D.general.timezone),
      maintenancePreview: bool(g.maintenancePreview, false),
      maintenanceMessage: str(g.maintenanceMessage, "", 200),
    },
    branding: {
      displayName: str(b.displayName, D.branding.displayName, 40),
      primaryColor: str(b.primaryColor, D.branding.primaryColor, 7),
      accentColor: str(b.accentColor, D.branding.accentColor, 7),
      appearance: pick(b.appearance, ["light", "dark", "system"] as const, "light"),
      senderName: str(b.senderName, D.branding.senderName, 40),
      replyTo: str(b.replyTo, D.branding.replyTo, 120),
    },
    orders: {
      defaultMin: str(o.defaultMin, D.orders.defaultMin, 12),
      defaultMax: str(o.defaultMax, D.orders.defaultMax, 12),
      review: pick(o.review, ["all", "flagged"] as const, "all"),
      processing: pick(o.processing, ["manual", "provider"] as const, "manual"),
      assignment: pick(o.assignment, ["staff", "mapped"] as const, "staff"),
      allowCancelBeforeStart: bool(o.allowCancelBeforeStart, D.orders.allowCancelBeforeStart),
      partialRefunds: bool(o.partialRefunds, D.orders.partialRefunds),
    },
    payments: {
      secondReviewAt: str(p.secondReviewAt, D.payments.secondReviewAt, 12),
      pendingFlagHours: str(p.pendingFlagHours, D.payments.pendingFlagHours, 12),
      adjustmentReason: bool(p.adjustmentReason, D.payments.adjustmentReason),
      refundApprovalAbove: str(p.refundApprovalAbove, D.payments.refundApprovalAbove, 12),
    },
    notifications: {
      events: Object.fromEntries(NOTIFY_EVENTS.map((x) => [x.id, bool(events[x.id], D.notifications.events[x.id])])) as Record<NotifyKey, boolean>,
      digest: pick(n.digest, ["instant", "daily"] as const, "instant"),
    },
  };
  for (const s of EDITABLE) if (Object.keys((VALIDATE[s] as (v: unknown) => Errors)(out[s])).length) (out as unknown as Record<string, unknown>)[s] = D[s];
  return out;
}

function read(): Stored {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (memo?.raw === raw) return memo.state;
  let state = EMPTY;
  try {
    const data = raw ? (JSON.parse(raw) as { values?: Record<string, Record<string, unknown>>; savedAt?: Record<string, unknown> }) : null;
    if (data?.values) {
      const values = clean(data.values);
      const savedAt: Stored["savedAt"] = {};
      for (const s of EDITABLE) if (typeof data.savedAt?.[s] === "string" && data.values[s]) savedAt[s] = data.savedAt[s] as string;
      state = { values, savedAt };
    }
  } catch {}
  memo = { raw, state };
  return state;
}

function write(state: Stored) {
  try {
    if (Object.keys(state.savedAt).length) {
      const values = Object.fromEntries(EDITABLE.filter((s) => state.savedAt[s]).map((s) => [s, state.values[s]]));
      localStorage.setItem(KEY, JSON.stringify({ values, savedAt: state.savedAt }));
    } else localStorage.removeItem(KEY);
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

export function useAdminSettings() {
  return React.useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function saveSettings<K extends EditableSection>(section: K, values: SettingsValues[K]) {
  const s = read();
  write({ values: { ...s.values, [section]: values }, savedAt: { ...s.savedAt, [section]: new Date().toISOString() } });
}

export function resetSettings(section: EditableSection) {
  const s = read();
  const savedAt = { ...s.savedAt };
  delete savedAt[section];
  write({ values: { ...s.values, [section]: DEFAULTS[section] }, savedAt });
}
