import { describe, expect, it } from "vitest";
import { AI_TOOL_BY_ID, AI_TOOLS, WORKSPACE_TOOLS } from "@/lib/ai/registry";
import { charCount, checkMediaFile, postState, PUBLISH_RULES, sniffMedia, validateForPlatform, type PostContent } from "@/lib/social/publishing";
import { dayKey, utcToZonedInput, zonedToUtc } from "@/lib/social/time";
import { campaignGenerator } from "@/server/ai/generators/campaign";
import { OutputRuleError } from "@/server/ai/generators/shared";
import { GENERATORS } from "@/server/ai/run";
import { envSchema } from "@/server/env";
import { ProviderError } from "@/server/social/http";
import { ADAPTERS, classifyPublishError, hasPublishScopes } from "@/server/social/publish-adapters";
import { backoffSeconds, draftInput, publishingAvailability } from "@/server/social/publishing";

/* AI-07 pure logic: time zones and DST, platform rules, media safety, states, error classification, availability, Campaign Studio rules. */

describe("time zones and daylight saving", () => {
  it("converts wall time to UTC in the chosen zone", () => {
    expect(zonedToUtc("2026-07-01T09:00", "America/New_York")).toEqual({ ok: true, iso: "2026-07-01T13:00:00.000Z", ambiguous: false });
    expect(zonedToUtc("2026-01-15T09:00", "America/New_York")).toEqual({ ok: true, iso: "2026-01-15T14:00:00.000Z", ambiguous: false });
    expect(zonedToUtc("2026-03-01T10:30", "Asia/Kolkata")).toEqual({ ok: true, iso: "2026-03-01T05:00:00.000Z", ambiguous: false });
    expect(zonedToUtc("2026-06-01T00:00", "UTC")).toMatchObject({ iso: "2026-06-01T00:00:00.000Z" });
  });
  it("refuses a time skipped by spring-forward and resolves a repeated time to its first occurrence", () => {
    expect(zonedToUtc("2026-03-08T02:30", "America/New_York")).toEqual({ ok: false, reason: "nonexistent" });
    expect(zonedToUtc("2026-03-29T01:30", "Europe/London")).toEqual({ ok: false, reason: "nonexistent" });
    // 01:30 happens at 05:30Z (EDT) and again at 06:30Z (EST).
    expect(zonedToUtc("2026-11-01T01:30", "America/New_York")).toEqual({ ok: true, iso: "2026-11-01T05:30:00.000Z", ambiguous: true });
  });
  it("rejects malformed input and unknown zones, and round-trips", () => {
    for (const bad of ["2026-02-30T10:00", "2026-13-01T10:00", "2026-01-01 10:00", "2026-01-01T24:00"]) expect(zonedToUtc(bad, "UTC"), bad).toEqual({ ok: false, reason: "invalid" });
    expect(zonedToUtc("2026-01-01T10:00", "Mars/Olympus")).toEqual({ ok: false, reason: "invalid" });
    expect(utcToZonedInput("2026-07-01T13:00:00.000Z", "America/New_York")).toBe("2026-07-01T09:00");
    expect(dayKey("2026-07-01T23:30:00.000Z", "Asia/Tokyo")).toBe("2026-07-02");
  });
});

describe("platform rules", () => {
  const c = (over: Partial<PostContent> = {}): PostContent => ({ text: "Fresh sourdough every morning.", title: null, media: [], variants: {}, ...over });
  it("enforces each platform's text limit, counting an emoji once", () => {
    expect(charCount("🍞🥐")).toBe(2);
    expect(validateForPlatform(c({ text: "a".repeat(281) }), "x")[0]?.message).toMatch(/X allows 280 characters/);
    expect(validateForPlatform(c({ text: "🍞".repeat(280) }), "x")).toEqual([]);
    expect(validateForPlatform(c({ text: "a".repeat(281), variants: { x: "Short for X" } }), "x")).toEqual([]);
  });
  it("requires media and titles where the platform does", () => {
    expect(validateForPlatform(c(), "instagram").map((i) => i.message)).toContain(PUBLISH_RULES.instagram.note);
    expect(validateForPlatform(c(), "tiktok").length).toBeGreaterThan(0);
    expect(validateForPlatform(c({ media: [{ kind: "video", name: "v.mp4", bytes: 10, type: "video/mp4" }] }), "youtube").map((i) => i.message)).toContain("YouTube needs a title.");
    expect(validateForPlatform(c(), "linkedin")).toEqual([]);
    expect(validateForPlatform(c({ text: "" }), "facebook")[0]?.message).toMatch(/Add some text or media/);
  });
  it("never requests write scopes during AI-06 connection; publishing scopes are listed separately", () => {
    for (const [p, r] of Object.entries(PUBLISH_RULES)) expect(r.publishScopes.length, p).toBeGreaterThan(0);
    expect(hasPublishScopes("x", ["users.read", "tweet.read"])).toBe(false);
    expect(hasPublishScopes("x", ["users.read", "tweet.write"])).toBe(true);
  });
});

describe("media safety", () => {
  it("accepts only allowed types and sizes, and identifies files by their bytes", () => {
    expect(checkMediaFile({ type: "image/png", size: 1000 })).toEqual({ ok: true, kind: "image" });
    expect(checkMediaFile({ type: "image/png", size: 9 * 1024 * 1024 })).toMatchObject({ ok: false });
    expect(checkMediaFile({ type: "image/svg+xml", size: 10 })).toMatchObject({ ok: false });
    expect(checkMediaFile({ type: "application/x-msdownload", size: 10 })).toMatchObject({ ok: false });
    expect(sniffMedia(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMedia(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffMedia(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]))).toBe("video/mp4");
    expect(sniffMedia(new Uint8Array([0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20]))).toBe("video/quicktime");
    expect(sniffMedia(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
    expect(sniffMedia(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});

describe("post states", () => {
  it("derives what the customer sees from the post and its targets", () => {
    expect(postState("draft", null, [])).toBe("draft");
    expect(postState("draft", "2026-11-01T10:00:00.000Z", [])).toBe("planned");
    expect(postState("scheduled", null, [{ status: "scheduled" }])).toBe("scheduled");
    expect(postState("scheduled", null, [{ status: "published" }, { status: "publishing" }])).toBe("publishing");
    expect(postState("scheduled", null, [{ status: "published" }, { status: "failed" }])).toBe("partly_published");
    expect(postState("scheduled", null, [{ status: "published" }, { status: "reconciliation_required" }])).toBe("needs_review");
    expect(postState("cancelled", null, [{ status: "cancelled" }])).toBe("cancelled");
  });
});

describe("publishing safety", () => {
  it("never treats an outcome that might have succeeded as retryable", () => {
    expect(classifyPublishError(new ProviderError("rate_limited", { status: 429, retryAfter: 30 }))).toEqual({ kind: "rejected", code: "rate_limited", retryable: true, retryAfterSeconds: 30 });
    expect(classifyPublishError(new ProviderError("forbidden", { status: 403 }))).toMatchObject({ kind: "rejected", retryable: false });
    expect(classifyPublishError(new ProviderError("unavailable", { status: 503 }))).toEqual({ kind: "uncertain", code: "unavailable" });
    expect(classifyPublishError(new ProviderError("bad_response"))).toEqual({ kind: "uncertain", code: "bad_response" });
    expect(classifyPublishError(new Error("socket hang up"))).toEqual({ kind: "uncertain", code: "unknown" });
  });
  it("backs off exponentially within bounds", () => {
    expect([1, 2, 3, 4].map((n) => backoffSeconds(n))).toEqual([60, 120, 240, 480]);
    expect(backoffSeconds(1, 900)).toBe(900);
    expect(backoffSeconds(9, 99999)).toBe(1800);
  });
  it("keeps publishing off unless the platform is connectable, listed for publishing AND has an activated adapter", () => {
    const base = { ...process.env, APP_URL: "https://app.example.com", SOCIAL_PROVIDERS_ENABLED: "x", SOCIAL_X_CLIENT_ID: "client-id-123", SOCIAL_X_CLIENT_SECRET: "client-secret-456" };
    expect(Object.keys(ADAPTERS)).toEqual([]);
    expect(publishingAvailability(envSchema.parse(base), "x").ok).toBe(false);
    expect(publishingAvailability(envSchema.parse({ ...base, SOCIAL_PUBLISHING_ENABLED: "x" }), "x").ok).toBe(false); // no adapter activated
    const mock = { x: { provider: "x" as const, publish: async () => ({ kind: "uncertain" as const, code: "test" }) } };
    expect(publishingAvailability(envSchema.parse({ ...base, SOCIAL_PUBLISHING_ENABLED: "x" }), "x", mock).ok).toBe(true);
    expect(publishingAvailability(envSchema.parse({ ...base, SOCIAL_PUBLISHING_ENABLED: "x", SOCIAL_PROVIDERS_ENABLED: "" }), "x", mock).ok).toBe(false);
  });
  it("sanitises draft text and refuses media while storage isn't configured", () => {
    const d = draftInput.parse({ text: "Line one\r\nLine\u0007 two​ ok", timezone: "Europe/London", providers: ["x", "x", "linkedin"] });
    expect(d.text).toBe("Line one\nLine two​ ok");
    expect(d.providers).toEqual(["x", "linkedin"]);
    expect(() => draftInput.parse({ text: "a".repeat(5001), timezone: "UTC" })).toThrow();
    expect(() => draftInput.parse({ text: "hi", timezone: "Nowhere/Land" })).toThrow();
    expect(() => draftInput.parse({ text: "hi", timezone: "UTC", media: [{ kind: "image" }] })).toThrow();
    expect(() => draftInput.parse({ text: "hi", timezone: "UTC", customerId: "someone-else" })).toThrow();
  });
});

describe("AI Campaign Studio", () => {
  const brief = { niche: "Independent bakery selling sourdough in Leeds", objective: "Build a community", platforms: ["Instagram", "TikTok"], weeks: "2" };
  const good = {
    objective: "Build a loyal local community around the bakery.",
    assumptions: ["Assumes most customers live nearby."],
    themes: [
      { name: "Behind the bake", why: "Shows the craft behind every loaf." },
      { name: "Regulars", why: "Celebrates the people who visit." },
    ],
    weeklyPlan: [
      { focus: "Introduce the bakers", activities: ["Short video of the morning bake", "Photo of the team"] },
      { focus: "Invite participation", activities: ["Ask followers to name a loaf", "Share customer photos with permission"] },
    ],
    formats: [
      { platform: "Instagram", format: "Carousel", why: "Shows each step." },
      { platform: "TikTok", format: "Short video", why: "Fits a quick bake." },
    ],
    captionIdeas: [
      { platform: "Instagram", caption: "Meet the hands behind your morning loaf.", cta: "Say hi next time you visit." },
      { platform: "TikTok", caption: "4am at the bakery, start to finish.", cta: "Follow for tomorrow's bake." },
    ],
    improvements: ["Reply to comments the same day.", "Pin the visiting hours post."],
    metrics: ["Saves per post", "Replies to stories"],
    nextSteps: ["Film the first bake video.", "Plan week one posts."],
  };
  const run = (out: unknown) => campaignGenerator.execute!(campaignGenerator.input.parse(brief), async () => out as never);

  it("is dashboard-only: runnable through the pipeline but never listed publicly", () => {
    expect(AI_TOOLS.some((t) => t.id === "campaign-planner")).toBe(false);
    expect(WORKSPACE_TOOLS.map((t) => t.id)).toContain("campaign-planner");
    expect(AI_TOOL_BY_ID["campaign-planner"]).toMatchObject({ phase: "AI-07", auth: "account", availability: "coming_soon" });
    expect(GENERATORS["campaign-planner"]).toBeTruthy();
  });
  it("labels every plan goal-based and numbers the weeks itself", async () => {
    const out = await run(good);
    expect(out.basis).toBe("goal-based");
    expect(out.weeklyPlan.map((w) => w.week)).toEqual(["Week 1", "Week 2"]);
  });
  it("rejects invented statistics, guarantees and audience demographics", async () => {
    await expect(run({ ...good, improvements: ["This will increase engagement by 40%.", "Post daily."] })).rejects.toBeInstanceOf(OutputRuleError);
    await expect(run({ ...good, objective: "Your audience is mostly women aged 25-34, so target them." })).rejects.toBeInstanceOf(OutputRuleError);
    await expect(run({ ...good, nextSteps: ["This campaign is guaranteed to go viral.", "Plan week one."] })).rejects.toBeInstanceOf(OutputRuleError);
  });
  it("caps input and refuses unknown fields", () => {
    expect(() => campaignGenerator.input.parse({ ...brief, platforms: ["Instagram", "TikTok", "X", "LinkedIn"] })).toThrow();
    expect(() => campaignGenerator.input.parse({ ...brief, weeks: "52" })).toThrow();
    expect(() => campaignGenerator.input.parse({ ...brief, autoPublish: true })).toThrow();
  });
});
