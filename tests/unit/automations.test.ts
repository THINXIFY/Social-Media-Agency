import { describe, expect, it } from "vitest";
import { AI_TOOL_BY_ID, AI_TOOLS, WORKSPACE_TOOLS } from "@/lib/ai/registry";
import { COMPATIBLE, definitionSchema, describeAction, describeTrigger, frequency, nextRunAt, permissionsFor, TEMPLATES, UNAVAILABLE_TEMPLATES } from "@/lib/social/automations";
import { automationAssistantGenerator } from "@/server/ai/generators/automation";
import { OutputRuleError } from "@/server/ai/generators/shared";
import { GENERATORS } from "@/server/ai/run";
import { JOBS } from "@/server/jobs/definitions";

/* AI-08 pure logic: the allowlist, DST-safe scheduling, templates, and the AI assistant's validation. */

const base = { name: "Monday plan", timezone: "Europe/London", trigger: { type: "weekly", days: [1], time: "09:00" }, action: { type: "reminder", title: "Plan the week", message: "" } };

describe("allowlist", () => {
  it("accepts supported definitions and sanitises text", () => {
    const d = definitionSchema.parse({ ...base, name: "  Plan ☕\u0007 week  ", trigger: { type: "weekly", days: [3, 1, 1], time: "09:00" } });
    expect(d.name).toBe("Plan ☕ week");
    expect(d.trigger).toEqual({ type: "weekly", days: [1, 3], time: "09:00" });
    expect(d.onlyIfFound).toBe(true);
  });
  it("rejects unknown triggers and actions, extra fields and incompatible pairs", () => {
    for (const bad of [
      { ...base, action: { type: "publish_post", postId: "x" } },
      { ...base, action: { type: "http_request", url: "https://evil.example" } },
      { ...base, action: { type: "create_order", serviceId: "instagram-followers" } },
      { ...base, trigger: { type: "webhook", url: "https://evil.example" } },
      { ...base, action: { ...base.action, webhook: "https://evil.example" } },
      { ...base, script: "process.exit()" },
      { ...base, trigger: { type: "draft_due", time: "09:00", withinDays: 3 } },
      { ...base, trigger: { type: "account_attention", time: "09:00" }, action: { type: "checklist", title: "x", items: ["a"] } },
      { ...base, trigger: { type: "weekly", days: [], time: "09:00" } },
      { ...base, trigger: { type: "daily", time: "25:00" } },
      { ...base, action: { type: "checklist", title: "x", items: Array.from({ length: 13 }, (_, i) => `item ${i}`) } },
      { ...base, name: "x".repeat(81) },
      { ...base, name: "   " },
      { ...base, timezone: "Nowhere/Land" },
    ])
      expect(definitionSchema.safeParse(bad).success, JSON.stringify(bad).slice(0, 90)).toBe(false);
  });
  it("only has internal actions — nothing that publishes, orders, pays or messages", () => {
    const actions = new Set(Object.values(COMPATIBLE).flat());
    expect([...actions].sort()).toEqual(["checklist", "draft_suggestion", "flag_drafts", "health_check", "reminder"]);
    expect(permissionsFor({ type: "draft_suggestion", title: "x", text: "y" }).join(" ")).toMatch(/only when you approve/);
    expect(JOBS["automations.run-due"]).toMatchObject({ enabled: true, phase: "AI-08" });
  });
});

describe("scheduling (DST-safe)", () => {
  const at = (iso: string) => new Date(iso);
  it("weekly and daily schedules in the workflow's zone", () => {
    // Sunday 1 Nov 2026 → Monday 2 Nov 09:00 London (GMT).
    expect(nextRunAt({ type: "weekly", days: [1], time: "09:00" }, "Europe/London", at("2026-11-01T12:00:00Z"))?.toISOString()).toBe("2026-11-02T09:00:00.000Z");
    // Strictly after: at exactly 09:00 Monday the next is the following Monday.
    expect(nextRunAt({ type: "weekly", days: [1], time: "09:00" }, "Europe/London", at("2026-11-02T09:00:00Z"))?.toISOString()).toBe("2026-11-09T09:00:00.000Z");
    expect(nextRunAt({ type: "daily", time: "08:30" }, "Asia/Kolkata", at("2026-07-01T04:00:00Z"))?.toISOString()).toBe("2026-07-02T03:00:00.000Z");
  });
  it("a time skipped by spring-forward runs at the first valid minute; a repeated time runs once, at its first occurrence", () => {
    expect(nextRunAt({ type: "daily", time: "02:30" }, "America/New_York", at("2026-03-08T00:00:00Z"))?.toISOString()).toBe("2026-03-08T07:00:00.000Z"); // 03:00 EDT
    expect(nextRunAt({ type: "daily", time: "01:30" }, "America/New_York", at("2026-11-01T04:00:00Z"))?.toISOString()).toBe("2026-11-01T05:30:00.000Z"); // first 01:30 (EDT)
    expect(nextRunAt({ type: "daily", time: "01:30" }, "America/New_York", at("2026-11-01T05:30:00Z"))?.toISOString()).toBe("2026-11-02T06:30:00.000Z"); // not the repeated 01:30 EST
  });
  it("one-off triggers run once and never again", () => {
    expect(nextRunAt({ type: "once", at: "2026-12-01T10:00" }, "UTC", at("2026-11-01T00:00:00Z"))?.toISOString()).toBe("2026-12-01T10:00:00.000Z");
    expect(nextRunAt({ type: "once", at: "2026-12-01T10:00" }, "UTC", at("2026-12-01T10:00:00Z"))).toBeNull();
  });
  it("describes workflows in plain language", () => {
    expect(describeTrigger({ type: "weekly", days: [1, 4], time: "09:00" })).toBe("Every Monday and Thursday at 09:00");
    expect(describeTrigger({ type: "weekly", days: [1, 2, 3, 4, 5], time: "08:00" })).toBe("Every weekday at 08:00");
    expect(describeTrigger({ type: "once", at: "" })).toBe("Once (choose a date and time)");
    expect(describeAction({ type: "flag_drafts", withinDays: 3 })).toBe("Flag drafts planned in the next 3 days for review");
    expect(frequency({ type: "weekly", days: [1, 3], time: "09:00" })).toBe("Up to 2 times a week.");
  });
});

describe("templates", () => {
  it("are all valid, compatible and schedulable — and unavailable ideas are listed honestly", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(["weekly-content-reminder", "content-planning-routine", "draft-review-reminder", "publishing-preparation", "campaign-review", "account-health-check"]);
    for (const t of TEMPLATES) {
      const d = definitionSchema.parse({ ...t.definition, timezone: "Europe/London" });
      expect(nextRunAt(d.trigger, d.timezone, new Date("2026-11-01T00:00:00Z")), t.id).not.toBeNull();
    }
    expect(UNAVAILABLE_TEMPLATES.map((u) => u.name)).toContain("Auto-publish approved posts");
  });
});

describe("AI Workflow Assistant", () => {
  const run = (out: unknown) => automationAssistantGenerator.execute!(automationAssistantGenerator.input.parse({ request: "Remind me every Monday to review my calendar", timezone: "Europe/London" }), async () => out as never);
  const good = { name: "Monday calendar review", description: "Weekly reminder", trigger: { type: "weekly", days: [1], time: "09:00", at: "ignored" }, action: { type: "reminder", title: "Review your content calendar", message: "Check what's planned this week.", url: "https://evil.example" }, explanation: "A weekly reminder." };

  it("is dashboard-only and wired into the pipeline", () => {
    expect(AI_TOOLS.some((t) => t.id === "automation-assistant")).toBe(false);
    expect(WORKSPACE_TOOLS.map((t) => t.id)).toEqual(["campaign-planner", "automation-assistant"]);
    expect(AI_TOOL_BY_ID["automation-assistant"]).toMatchObject({ phase: "AI-08", availability: "coming_soon", auth: "account" });
    expect(GENERATORS["automation-assistant"]).toBeTruthy();
  });
  it("returns only an allowlisted draft, dropping fields the schema doesn't know", async () => {
    const out = await run(good);
    expect(out.suggestion).toEqual({ name: "Monday calendar review", description: "Weekly reminder", trigger: { type: "weekly", days: [1], time: "09:00" }, action: { type: "reminder", title: "Review your content calendar", message: "Check what's planned this week." }, onlyIfFound: true, templateId: undefined });
    expect(JSON.stringify(out)).not.toContain("evil.example");
    expect(out.permissions[0]).toMatch(/Automation inbox/);
  });
  it("rejects invalid or incompatible model output", async () => {
    await expect(run({ ...good, trigger: { type: "draft_due", time: "09:00", withinDays: 3 } })).rejects.toBeInstanceOf(OutputRuleError);
    await expect(run({ ...good, trigger: { type: "daily", time: "9am" } })).rejects.toBeInstanceOf(OutputRuleError);
    await expect(run({ ...good, action: { type: "checklist", title: "x", items: [] } })).rejects.toBeInstanceOf(OutputRuleError);
    await expect(run({ ...good, trigger: { type: "weekly", days: [9], time: "09:00" } })).rejects.toBeInstanceOf(OutputRuleError);
  });
});
