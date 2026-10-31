import { describe, expect, it } from "vitest";
import { buckets, bucketKey, isTimeZone, resolveRange, tzLabel, zonedMidnight } from "@/lib/admin-overview";
import { REPORTS } from "@/lib/reports";
import { csvCell, parseFilters } from "@/server/analytics/reports";

/* Phase 5H-B: CSV safety, filters and timezone-aware windows. */

describe("csvCell", () => {
  it("neutralises formulas and quotes properly", () => {
    for (const bad of ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\tx", "\rx"]) expect(csvCell(bad).replace(/^"/, "")).toMatch(/^'/);
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(" padded ")).toBe('" padded "');
    expect(csvCell(-12.5)).toBe("-12.5"); // numbers aren't text, so they're left alone
    expect(csvCell(true)).toBe("yes");
    expect(csvCell(null)).toBe("");
    expect(csvCell("Plain")).toBe("Plain");
  });
});

describe("parseFilters", () => {
  it("keeps only well-formed values", () => {
    const f = parseFilters(new URLSearchParams("q=%20abc%20&status=pending_review&platform=Bad%20Value&category=x;drop&flagged=1&page=-3"));
    expect(f).toEqual({ q: "abc", status: "pending_review", platform: "", category: "", flagged: true, page: 1 });
  });
});

describe("timezone-aware windows", () => {
  it("cuts days at local midnight, as exact UTC instants", () => {
    expect(isTimeZone("America/New_York")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(zonedMidnight("2026-07-01", "America/New_York").toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(zonedMidnight("2026-12-01", "America/New_York").toISOString()).toBe("2026-12-01T05:00:00.000Z");
    expect(zonedMidnight("2026-07-01", "Asia/Kolkata").toISOString()).toBe("2026-06-30T18:30:00.000Z");
  });

  it("handles a daylight-saving change inside the window", () => {
    // US clocks fall back on 2026-11-01.
    const r = resolveRange("custom", "2026-10-31", "2026-11-02", new Date("2026-12-01T00:00:00Z"), "America/New_York")!;
    const b = buckets(r);
    expect(b.map((x) => bucketKey(x, "day", r.tz))).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(b[2].getTime() - b[1].getTime()).toBe(25 * 3_600_000);
    expect(r.end.toISOString()).toBe("2026-11-03T05:00:00.000Z");
    expect(r.label).toMatch(/America\/New_York, GMT-4\) · includes a daylight-saving change$/);
    expect(tzLabel("UTC")).toBe("UTC");
  });

  it("'today' and presets follow the local calendar day", () => {
    const now = new Date("2026-10-31T02:00:00Z"); // still Oct 30 in New York
    const t = resolveRange("today", null, null, now, "America/New_York")!;
    expect(t.from).toBe("2026-10-30");
    expect(t.start.toISOString()).toBe("2026-10-30T04:00:00.000Z");
    expect(buckets(t)).toHaveLength(22);
    expect(resolveRange("7d", null, null, now, "Not/AZone")).toBeNull();
    expect(resolveRange("custom", "2026-10-31", "2026-10-31", now, "America/New_York")).toBeNull(); // tomorrow, locally
  });
});

describe("catalogue", () => {
  it("maps every report to a real permission module", () => {
    const modules = ["overview", "orders", "customers", "services", "payments", "providers", "support", "referrals", "settings", "staff"];
    for (const r of REPORTS) expect(modules, r.id).toContain(r.module);
  });
});
