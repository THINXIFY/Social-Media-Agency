/**
 * Display settings (language, currency, time zone, date format), translation
 * and formatting for the customer dashboard.
 *
 * Settings live in this browser and sync across tabs. Formatting helpers read
 * the current settings, so `money()`, `formatDate()` and friends follow the
 * customer's choices everywhere. During server render and hydration the
 * defaults are used, so markup always matches; the shell then switches to the
 * saved settings and every subscribed page re-renders.
 *
 * Canonical data never changes: timestamps stay ISO strings in UTC and every
 * amount stays in USD. Only the displayed text is localized.
 */

import * as React from "react";
import {
  CURRENCIES,
  type CurrencyCode,
  DEMO_FX,
  ENABLED_LANGUAGES,
  LANGUAGE_BY_CODE,
  type LanguageCode,
} from "./config";
import { type MessageKey, MESSAGES } from "./messages";

export * from "./config";
export type { MessageKey } from "./messages";

export type DateFormat = "mdy" | "dmy" | "iso";

export interface DisplaySettings {
  language: LanguageCode;
  currency: CurrencyCode;
  /** IANA time zone. */
  timezone: string;
  dateFormat: DateFormat;
}

export const DEFAULT_DISPLAY: DisplaySettings = { language: "en", currency: "USD", timezone: "UTC", dateFormat: "mdy" };

/* -------------------------------------------------------------------------- */
/*  Store                                                                     */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = "sv-display";
const listeners = new Set<() => void>();
let cache: DisplaySettings | null = null;
let hydrated = false;

function validTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function parse(raw: string | null): DisplaySettings {
  if (!raw) return DEFAULT_DISPLAY;
  try {
    const v = JSON.parse(raw) as Partial<DisplaySettings>;
    return {
      // A saved language that isn't offered right now falls back to English.
      language: v.language && ENABLED_LANGUAGES.includes(v.language) ? v.language : DEFAULT_DISPLAY.language,
      currency: v.currency && CURRENCIES.includes(v.currency) ? v.currency : DEFAULT_DISPLAY.currency,
      timezone: validTimeZone(v.timezone) ? v.timezone : DEFAULT_DISPLAY.timezone,
      dateFormat: v.dateFormat === "dmy" || v.dateFormat === "iso" ? v.dateFormat : "mdy",
    };
  } catch {
    return DEFAULT_DISPLAY;
  }
}

function read(): DisplaySettings {
  if (cache) return cache;
  try {
    cache = parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    cache = DEFAULT_DISPLAY;
  }
  return cache;
}

const notify = () => listeners.forEach((l) => l());

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY && e.key !== null) return;
    cache = null;
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** The saved settings, regardless of hydration (for syncing them to the account). */
export const savedDisplay = () => read();

/** The settings in effect right now: defaults until the dashboard has hydrated. */
const current = () => (hydrated ? read() : DEFAULT_DISPLAY);
const serverSnapshot = () => DEFAULT_DISPLAY;

function markDisplayHydrated() {
  if (hydrated) return;
  hydrated = true;
  notify();
}

/** Subscribes to display settings without affecting when saved settings take over (shell, top bar). */
export function useDisplaySettings() {
  return React.useSyncExternalStore(subscribe, current, serverSnapshot);
}

/**
 * For page components: subscribes to display settings and, once the page has
 * hydrated, switches every subscriber from the defaults to the saved settings.
 * Switching any earlier would make later-hydrating parts of the page mismatch.
 */
export function useDisplay() {
  const settings = useDisplaySettings();
  React.useEffect(() => markDisplayHydrated(), []);
  return settings;
}

export function saveDisplay(patch: Partial<DisplaySettings>) {
  const next = { ...read(), ...patch };
  if (!ENABLED_LANGUAGES.includes(next.language)) next.language = DEFAULT_DISPLAY.language;
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  notify();
}

export const languageOf = (s: DisplaySettings = current()) => LANGUAGE_BY_CODE[s.language];

/* -------------------------------------------------------------------------- */
/*  Translation                                                               */
/* -------------------------------------------------------------------------- */

const fill = (text: string, vars?: Record<string, string | number>) =>
  vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;

/** Translates a dashboard string. Every key exists in every language (enforced by types). */
export function t(key: MessageKey, vars?: Record<string, string | number>) {
  return fill(MESSAGES[current().language][key], vars);
}

/** Like `t`, but `{name}` placeholders can be React nodes (links, emphasis). */
export function tRich(key: MessageKey, parts: Record<string, React.ReactNode>) {
  const text = MESSAGES[current().language][key];
  return text.split(/(\{\w+\})/g).map((chunk, i) => {
    const m = /^\{(\w+)\}$/.exec(chunk);
    return m && m[1] in parts ? React.createElement(React.Fragment, { key: i }, parts[m[1]]) : chunk;
  });
}

/* -------------------------------------------------------------------------- */
/*  Formatting                                                                */
/* -------------------------------------------------------------------------- */

const cacheBy = <T,>(make: (key: string) => T) => {
  const map = new Map<string, T>();
  return (key: string) => {
    let v = map.get(key);
    if (!v) {
      v = make(key);
      map.set(key, v);
    }
    return v;
  };
};

const numberFormat = cacheBy((key) => {
  const [locale, currency] = key.split("|");
  return new Intl.NumberFormat(locale, currency ? { style: "currency", currency } : undefined);
});

/**
 * Formats a USD amount in the display currency.
 * Pass `{ usd: true }` where the amount must stay in USD (payment entry).
 */
export function formatMoney(usd: number, opts?: { usd?: boolean }) {
  const s = current();
  const code: CurrencyCode = opts?.usd ? "USD" : s.currency;
  return numberFormat(`${languageOf(s).intl}|${code}`).format(usd * DEMO_FX.rates[code]);
}

/** Splits a formatted amount at the decimal separator, for large balances with smaller cents. */
export function formatMoneyParts(usd: number) {
  const s = current();
  const code = s.currency;
  const parts = numberFormat(`${languageOf(s).intl}|${code}`).formatToParts(usd * DEMO_FX.rates[code]);
  // Right-to-left amounts stay one run; splitting them would reorder the pieces.
  const at = languageOf(s).dir === "rtl" ? -1 : parts.findIndex((p) => p.type === "decimal");
  const join = (list: Intl.NumberFormatPart[]) => list.map((p) => p.value).join("");
  return at === -1 ? { main: join(parts), rest: "" } : { main: join(parts.slice(0, at)), rest: join(parts.slice(at)) };
}

/** Formats an amount that is already in `currency` (catalog prices). */
export function formatPrice(amount: number, currency: string) {
  return numberFormat(`${languageOf().intl}|${currency}`).format(amount);
}

export function formatNumber(n: number) {
  return numberFormat(`${languageOf().intl}|`).format(n);
}

/** True when amounts are shown in something other than USD. */
export const isConverted = () => current().currency !== "USD";

const dateParts = cacheBy((key) => {
  const [locale, timeZone, year] = key.split("|");
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: year ? "numeric" : undefined, timeZone });
});
const isoParts = cacheBy((timeZone) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }));
const timeFormat = cacheBy((key) => {
  const [locale, timeZone] = key.split("|");
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone });
});

/**
 * A short date in the customer's time zone and date format, e.g. "Oct 27",
 * "27 Oct" or "2026-10-27". The ISO format always includes the year.
 */
export function formatDate(iso: string | number | Date, opts?: { year?: boolean; format?: DateFormat }) {
  const s = current();
  const d = new Date(iso);
  const format = opts?.format ?? s.dateFormat;
  if (format === "iso") return isoParts(s.timezone).format(d);
  const parts = dateParts(`${languageOf(s).intl}|${s.timezone}|${opts?.year ? "y" : ""}`).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const [month, day, year] = [get("month"), get("day"), get("year")];
  const md = format === "dmy" ? `${day} ${month}` : `${month} ${day}`;
  return year ? (format === "dmy" ? `${md} ${year}` : `${md}, ${year}`) : md;
}

export function formatTime(iso: string | number | Date) {
  const s = current();
  return timeFormat(`${languageOf(s).intl}|${s.timezone}`).format(new Date(iso));
}

/** Date and time, e.g. "Oct 27, 9:14 AM". */
export function formatDateTime(iso: string | number | Date, opts?: { year?: boolean }) {
  return `${formatDate(iso, opts)}, ${formatTime(iso)}`;
}

const relative = cacheBy((locale) => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }));

/** "Just now", "5 minutes ago", "3 hours ago", then a short date. */
export function formatRelative(iso: string) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  const mins = Math.round((Date.now() - time) / 60_000);
  const rtf = relative(languageOf().intl);
  if (mins < 1) return t("time.justNow");
  if (mins < 60) return rtf.format(-mins, "minute");
  if (mins < 24 * 60) return rtf.format(-Math.round(mins / 60), "hour");
  return formatDate(iso);
}

const currencyNames = cacheBy((locale) => new Intl.DisplayNames(locale, { type: "currency" }));
export const currencyName = (code: CurrencyCode) => currencyNames(languageOf().intl).of(code) ?? code;

/** The time zone's localized generic name, e.g. "Pacific Time" or "Hora del Pacífico". */
export function timeZoneName(timeZone: string, fallback: string) {
  try {
    const parts = new Intl.DateTimeFormat(languageOf().intl, { timeZone, timeZoneName: "longGeneric" }).formatToParts(new Date(DEMO_FX.asOf));
    return parts.find((p) => p.type === "timeZoneName")?.value ?? fallback;
  } catch {
    return fallback;
  }
}
