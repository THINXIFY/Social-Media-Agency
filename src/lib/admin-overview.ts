/*
 * Admin Overview and Reports (Phases 5H-A/5H-B): date ranges and the response
 * shape shared by the server and the UI. Timestamps stay in UTC; a window's
 * days are local days in the reporting timezone (default UTC), converted to
 * exact UTC instants, so every KPI, chart, table and export in one request
 * uses the same [start, end) window, including across daylight-saving changes.
 */

export const RANGE_PRESETS = [
  ["today", "Today"],
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["90d", "90 days"],
  ["custom", "Custom"],
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number][0];

export const MAX_CUSTOM_DAYS = 366;
const DAY = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ResolvedRange = { preset: RangePreset; start: Date; end: Date; prevStart: Date; unit: "hour" | "day"; label: string; from: string; to: string; tz: string };

/** True for "UTC" and any IANA zone this runtime knows. */
export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const partsFmt = new Map<string, Intl.DateTimeFormat>();
function parts(at: Date, tz: string) {
  let f = partsFmt.get(tz);
  if (!f) partsFmt.set(tz, (f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })));
  return Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value])) as Record<string, string>;
}
/** Offset of `tz` from UTC at an instant, in ms (positive east of UTC). */
export function tzOffsetMs(at: Date, tz: string) {
  const p = parts(at, tz);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(at.getTime() / 1000) * 1000;
}
/** YYYY-MM-DD of an instant in `tz`. */
export const localDay = (at: Date, tz: string) => {
  const p = parts(at, tz);
  return `${p.year}-${p.month}-${p.day}`;
};
/** The UTC instant of local midnight starting `day` in `tz`. */
export function zonedMidnight(day: string, tz: string) {
  const guess = Date.parse(`${day}T00:00:00Z`);
  let t = guess - tzOffsetMs(new Date(guess), tz);
  t = guess - tzOffsetMs(new Date(t), tz);
  return new Date(t);
}
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** Grouping key of a bucket: local day, or local day + hour. Matches the SQL `to_char` formats used by the server. */
export const bucketKey = (at: Date, unit: "hour" | "day", tz: string) => {
  const p = parts(at, tz);
  return unit === "hour" ? `${p.year}-${p.month}-${p.day}T${p.hour}` : `${p.year}-${p.month}-${p.day}`;
};
/** e.g. "UTC", or "Europe/London, GMT+1". */
export function tzLabel(tz: string, at = new Date()) {
  if (tz === "UTC") return "UTC";
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(at).find((x) => x.type === "timeZoneName")?.value ?? "";
  return `${tz}, ${name}`;
}

const fmt = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Turns a preset (or custom from/to dates, local to `tz`) into a window ending now. Returns null for invalid input. */
export function resolveRange(preset: string | null | undefined, from?: string | null, to?: string | null, now = new Date(), tz = "UTC"): ResolvedRange | null {
  if (!isTimeZone(tz)) return null;
  const today = localDay(now, tz);
  const p = (preset ?? "30d") as RangePreset;
  let startDay: string;
  let end = now;
  if (p === "today") startDay = today;
  else if (p === "7d" || p === "30d" || p === "90d") startDay = addDays(today, -(Number(p.slice(0, -1)) - 1));
  else if (p === "custom") {
    if (!from || !to || !DATE.test(from) || !DATE.test(to)) return null;
    if (Number.isNaN(Date.parse(`${from}T00:00:00Z`)) || Number.isNaN(Date.parse(`${to}T00:00:00Z`)) || addDays(from, 0) !== from || addDays(to, 0) !== to) return null;
    if (to < from || from > today) return null;
    if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY + 1 > MAX_CUSTOM_DAYS) return null;
    startDay = from;
    end = new Date(Math.min(zonedMidnight(addDays(to, 1), tz).getTime(), now.getTime()));
  } else {
    return null;
  }
  const start = zonedMidnight(startDay, tz);
  const prevStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
  const lastDay = localDay(new Date(end.getTime() - 1), tz);
  const zone = tzLabel(tz, start);
  const dst = tz !== "UTC" && tzOffsetMs(start, tz) !== tzOffsetMs(new Date(end.getTime() - 1), tz) ? " · includes a daylight-saving change" : "";
  const label = p === "today" ? `Today, ${fmt(startDay)} (${zone})` : `${fmt(startDay)} – ${fmt(lastDay)} (${zone})${dst}`;
  return { preset: p, start, end, prevStart, unit: p === "today" ? "hour" : "day", label, from: startDay, to: lastDay, tz };
}

/** Bucket start instants covering the window, oldest first: local hours or local days (23–25 h around DST). */
export function buckets(r: Pick<ResolvedRange, "start" | "end" | "unit"> & { tz?: string }) {
  const out: Date[] = [];
  if (r.unit === "hour") {
    for (let t = r.start.getTime(); t < r.end.getTime(); t += 3_600_000) out.push(new Date(t));
    return out;
  }
  const tz = r.tz ?? "UTC";
  for (let day = localDay(r.start, tz), at = zonedMidnight(day, tz); at < r.end; day = addDays(day, 1), at = zonedMidnight(day, tz)) out.push(at);
  return out;
}

export type SeriesPoint = { t: string; value: number; beforeData: boolean };
/** Current-period value plus the previous equal-length period, which is null when there's no comparable history. */
export type Compared = { value: number; previous: number | null };

export interface OverviewResponse {
  range: { preset: RangePreset; from: string; to: string; label: string; unit: "hour" | "day"; start: string; end: string; timezone: string };
  generatedAt: string;
  /** Date of the earliest customer record; anything before it has no history. */
  dataSince: string | null;
  customers?: { total: number; new: Compared; verifiedNew: number; series: SeriesPoint[] };
  orders?: {
    total: number;
    placed: Compared;
    valueCents: Compared;
    byStatus: { status: string; count: number }[];
    series: SeriesPoint[];
    topServices: { id: string; name: string; platform: string; orders: number; valueCents: number }[];
    platforms: { name: string; orders: number }[];
    queues: { review: number; needsInfo: number; ready: number; inProgress: number };
  };
  finance?: {
    revenueCents: Compared;
    /** REVENUE_RECOGNITION_POLICY: with "deferred", completed orders are not recognised as revenue yet. */
    revenuePolicy: "deferred" | "on_completion";
    revenueLifetimeCents: number;
    recognizedOrders: number;
    fundingCents: Compared;
    fundingCount: number;
    fundingSeries: SeriesPoint[];
    walletLiabilitiesCents: number;
    committedToOrdersCents: number;
    fundedCustomers: number;
    depositsAwaitingReview: number;
    paymentMethods: { configured: number; total: number };
  };
  services?: { total: number; visible: number; priced: number; purchasable: number; checkoutEnabled: boolean };
  providers?: { ready: number; total: number; unknownOutcomes: number; activeAttempts: number };
  support?: { needsReply: number; inProgress: number; waiting: number; opened: Compared };
  referrals?: { new: Compared; flaggedOpen: number; underReview: number };
  ai?: {
    requests: number;
    succeeded: number;
    errors: number;
    blocked: number;
    inputTokens: number | null;
    outputTokens: number | null;
    estimatedCostMicros: number;
    generation: { enabled: boolean; live: boolean; reason: string | null };
    emergencyPaused: boolean;
    providersActive: number;
    providersTotal: number;
    automation: { runs: number; succeeded: number; failed: number; skipped: number };
    publishingProviders: number;
  };
  activity?: { id: string; label: string; area: string; href: string; actor: string; at: string }[];
}
