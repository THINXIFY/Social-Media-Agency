import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buckets, MAX_CUSTOM_DAYS, resolveRange } from "@/lib/admin-overview";

/* Phase 5H-A date ranges: UTC days, one window per request. */

const NOW = new Date("2026-10-31T15:30:00Z");

describe("resolveRange", () => {
  it("presets end now and start at UTC midnight", () => {
    const t = resolveRange("today", null, null, NOW)!;
    expect(t).toMatchObject({ unit: "hour", from: "2026-10-31", to: "2026-10-31" });
    expect(t.start.toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(buckets(t)).toHaveLength(16);
    const w = resolveRange("7d", null, null, NOW)!;
    expect(w.start.toISOString()).toBe("2026-10-25T00:00:00.000Z");
    expect(buckets(w)).toHaveLength(7);
    expect(w.prevStart.getTime()).toBe(w.start.getTime() - (NOW.getTime() - w.start.getTime()));
    expect(buckets(resolveRange("90d", null, null, NOW)!)).toHaveLength(90);
    expect(resolveRange(null, null, null, NOW)!.preset).toBe("30d");
  });

  it("custom ranges are inclusive, capped at now and validated", () => {
    const c = resolveRange("custom", "2026-10-01", "2026-10-31", NOW)!;
    expect(c.end).toEqual(NOW);
    expect(buckets(c)).toHaveLength(31);
    expect(c.label).toBe("Oct 1, 2026 – Oct 31, 2026 (UTC)");
    const past = resolveRange("custom", "2026-01-01", "2026-01-31", NOW)!;
    expect(past.end.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    for (const [f, t] of [["", ""], ["2026-02-01", "2026-01-01"], ["2026-13-01", "2026-12-01"], ["2026-11-01", "2026-11-02"], ["2024-01-01", "2026-01-01"], ["01/01/2026", "2026-01-02"]]) expect(resolveRange("custom", f, t, NOW), `${f}..${t}`).toBeNull();
    expect(resolveRange("custom", "2025-11-01", "2026-10-31", NOW)).not.toBeNull();
    expect(MAX_CUSTOM_DAYS).toBe(366);
    expect(resolveRange("1y", null, null, NOW)).toBeNull();
  });
});

describe("dashboard copy", () => {
  it("labels money honestly and never calls deposits revenue", () => {
    const ui = readFileSync("src/components/admin/live-overview.tsx", "utf8");
    expect(ui).toContain("Your Business, At a Glance.");
    expect(ui).toMatch(/not revenue/);
    expect(ui).toMatch(/Not configured/);
    expect(ui).toMatch(/not provider invoices/);
    expect(ui).not.toMatch(/setInterval/); // no polling
  });
});
