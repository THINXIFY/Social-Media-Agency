/**
 * Timezone-safe scheduling helpers (AI-07). Instants are stored in UTC; what
 * a customer types is a wall-clock time in an IANA time zone. Conversion uses
 * Intl only (no dependencies) and handles daylight-saving transitions
 * explicitly: a time that doesn't exist (clocks jump forward) is refused, and
 * a time that happens twice (clocks go back) resolves to the first occurrence
 * and says so.
 */

export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const parts = (ms: number, tz: string) => {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
};

/** The zone's offset from UTC at an instant, in minutes. */
export function zoneOffsetMinutes(ms: number, tz: string): number {
  const p = parts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

export type ZonedResult = { ok: true; iso: string; ambiguous: boolean } | { ok: false; reason: "invalid" | "nonexistent" };

/** "2026-03-08T02:30" in "America/New_York" → the UTC instant it names. */
export function zonedToUtc(local: string, tz: string): ZonedResult {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m || !isTimeZone(tz)) return { ok: false, reason: "invalid" };
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(naive);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return { ok: false, reason: "invalid" };
  // Candidate instants from the offsets around that wall time; keep those that format back to it.
  const offsets = new Set([zoneOffsetMinutes(naive - 864e5, tz), zoneOffsetMinutes(naive, tz), zoneOffsetMinutes(naive + 864e5, tz)]);
  const matches = [...offsets]
    .map((off) => naive - off * 60_000)
    .filter((ms) => {
      const p = parts(ms, tz);
      return p.year === y && p.month === mo && p.day === d && p.hour === h && p.minute === mi;
    })
    .sort((a, b) => a - b);
  if (!matches.length) return { ok: false, reason: "nonexistent" };
  return { ok: true, iso: new Date(matches[0]!).toISOString(), ambiguous: new Set(matches).size > 1 };
}

/** UTC instant → "YYYY-MM-DDTHH:mm" wall time in a zone (for date inputs). */
export function utcToZonedInput(iso: string, tz: string): string {
  const p = parts(Date.parse(iso), tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Calendar day key ("YYYY-MM-DD") of an instant in a zone. */
export const dayKey = (iso: string, tz: string) => utcToZonedInput(iso, tz).slice(0, 10);

/** The browser's zone, falling back to UTC. */
export function browserTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isTimeZone(tz) ? tz : "UTC";
  } catch {
    return "UTC";
  }
}
