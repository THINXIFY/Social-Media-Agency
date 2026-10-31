import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { metadata as pricingMetadata } from "@/app/pricing/page";
import sitemap from "@/app/sitemap";
import { PRICING_DESCRIPTION, PRICING_FAQ, PRICING_TITLE } from "@/components/ai-workspace/pricing";
import { BILLING_FACTS } from "@/components/ai-workspace/plans";
import { PLAN_COMPARISON, PLANS } from "@/lib/ai/plans";
import { AI_TOOL_BY_ID, aiToolHref } from "@/lib/ai/registry";
import { DESTINATIONS, destinationAvailability, GOAL_IDS, PERSONA_IDS, profileInputSchema, QUICK_ACTION_IDS, recommend } from "@/lib/ai/workspace";
import { planFor } from "@/server/ai/plans";

/* AI-09 pure logic: deterministic recommendations, strict preferences, honest plans and the public pricing page. */

const ids = (persona: Parameters<typeof recommend>[0], goals: Parameters<typeof recommend>[1] = [], limit = 3) => recommend(persona, goals, limit).map((r) => r.destination.id);

describe("recommendations", () => {
  it("follow the persona examples from the brief", () => {
    expect(ids("creator")).toEqual(["caption-generator", "post-ideas", "content-calendar"]);
    expect(ids("small_business")).toEqual(["growth-advisor", "growth-roadmap", "service-recommender"]);
    expect(ids("agency")).toEqual(["content-calendar", "campaigns", "social"]);
  });

  it("are deterministic, de-duplicated, explain themselves and blend in goals", () => {
    for (const p of PERSONA_IDS) {
      for (const g of GOAL_IDS) {
        const a = recommend(p, [g], 4);
        expect(recommend(p, [g], 4)).toEqual(a);
        expect(new Set(a.map((r) => r.destination.id)).size).toBe(a.length);
        expect(a.length).toBe(4);
        for (const r of a) expect(r.reasons.length).toBeGreaterThan(0);
      }
    }
    // A goal shared with the persona's picks lifts a matching tool; a different goal adds its own.
    expect(ids("creator", ["save_time"], 4)).toContain("automations");
    expect(recommend("creator", ["content"], 4)[0].reasons).toEqual(["Popular with creators", "Create better content"]);
  });

  it("without a profile, offer a balanced starter set; goals alone still work", () => {
    expect(ids(null)).toEqual(["caption-generator", "growth-advisor", "assistant"]);
    expect(ids(null, ["services"])).toEqual(["service-recommender", "service-search", "order-assistant"]);
  });
});

describe("destinations", () => {
  it("quick actions are the eight from the brief, in order, each a real destination", () => {
    expect(QUICK_ACTION_IDS.map((id) => DESTINATIONS.find((d) => d.id === id)?.action)).toEqual([
      "Create a caption",
      "Find hashtags",
      "Generate post ideas",
      "Build a content calendar",
      "Get growth advice",
      "Create a growth roadmap",
      "Find marketing services",
      "Explore Social Management",
    ]);
  });

  it("AI destinations link to their registered tool pages; dashboard links point at real routes", () => {
    for (const d of DESTINATIONS) {
      if (d.toolId && d.href.startsWith("/ai-tools/")) expect(d.href).toBe(aiToolHref(AI_TOOL_BY_ID[d.toolId]));
      if (d.toolId) expect(AI_TOOL_BY_ID[d.toolId]).toBeTruthy();
      if (d.href.startsWith("/dashboard/")) expect(existsSync(join("src/app", d.href, "page.tsx"))).toBe(true);
    }
  });

  it("follow live availability: AI tools show Coming soon unless the server says otherwise; workspace areas work today", () => {
    const caption = DESTINATIONS.find((d) => d.id === "caption-generator")!;
    const autos = DESTINATIONS.find((d) => d.id === "automations")!;
    expect(destinationAvailability(caption, {})).toBe("coming_soon");
    expect(destinationAvailability(caption, { "caption-generator": "available" })).toBe("available");
    expect(destinationAvailability(autos, {})).toBe("available");
  });
});

describe("preferences input", () => {
  it("accepts the onboarding choices only", () => {
    expect(profileInputSchema.parse({ action: "complete", persona: "creator", goals: ["content"] })).toEqual({ action: "complete", persona: "creator", goals: ["content"] });
    expect(profileInputSchema.parse({ action: "skip" })).toEqual({ action: "skip" });
    for (const bad of [
      { action: "complete", persona: "creator", goals: [] },
      { action: "complete", persona: "ceo", goals: ["content"] },
      { action: "complete", persona: "creator", goals: ["content"], email: "x@example.com" },
      { action: "complete", persona: "creator", goals: ["content"], plan: "business" },
      { action: "skip", persona: "creator" },
      { action: "upgrade" },
    ]) {
      expect(profileInputSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("plans", () => {
  it("only Free is available; paid tiers have no price, no numbers and nothing included", () => {
    expect(PLANS.map((p) => p.id)).toEqual(["free", "pro", "business"]);
    expect(PLANS[0].price).toEqual({ kind: "free", label: "Free" });
    for (const p of PLANS.slice(1)) {
      expect(p.price).toEqual({ kind: "not_announced", label: "Pricing not announced" });
      expect(p.features.every((f) => f.state === "planned")).toBe(true);
    }
    const copy = JSON.stringify({ PLANS, PLAN_COMPARISON, BILLING_FACTS, PRICING_FAQ });
    expect(copy).not.toMatch(/[$€£]\s?\d|\d+\s?(usd|eur|\/mo|per month)|unlimited|discount|save \d|limited time|credits?\b|trial/i);
  });

  it("entitlements come from the server only and every account is on Free", () => {
    expect(planFor("any-customer").id).toBe("free");
    const src = readFileSync("src/server/ai/plans.ts", "utf8");
    expect(src).toMatch(/import "server-only"/);
    expect(src).not.toMatch(/from "[^"]*(wallet|ledger|commerce|orders|stripe)/i);
  });

  it("there is no checkout, subscription or billing endpoint", () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
    const routes = walk("src/app/api").map((p) => p.replace(/\\/g, "/"));
    expect(routes.filter((p) => /checkout|subscri|billing|stripe|invoice/i.test(p))).toEqual([]);
    expect(routes.filter((p) => p.includes("/api/ai/")).every((p) => !/plan/i.test(p))).toBe(true);
  });
});

describe("pricing page (SEO)", () => {
  it("is indexable with a canonical, sized metadata and social cards, listed once in the sitemap", () => {
    expect(pricingMetadata.alternates?.canonical).toBe("/pricing");
    expect(pricingMetadata.robots).toBeUndefined();
    expect((pricingMetadata.title as { absolute: string }).absolute).toBe(PRICING_TITLE);
    expect(PRICING_TITLE.length).toBeLessThanOrEqual(60);
    expect(PRICING_DESCRIPTION.length).toBeGreaterThanOrEqual(120);
    expect(PRICING_DESCRIPTION.length).toBeLessThanOrEqual(175);
    expect(pricingMetadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect(`${PRICING_TITLE} ${PRICING_DESCRIPTION}`).not.toMatch(/unlimited|guarantee|publish|auto-post/i);
    process.env.APP_URL = "https://www.example.com";
    expect(sitemap().filter((e) => e.url.endsWith("/pricing"))).toHaveLength(1);
    expect(sitemap().some((e) => e.url.includes("/dashboard"))).toBe(false);
  });

  it("FAQ answers are direct and the page has no price markup", () => {
    expect(new Set(PRICING_FAQ.map((f) => f.q)).size).toBe(PRICING_FAQ.length);
    for (const f of PRICING_FAQ) expect(f.a.length).toBeLessThanOrEqual(260);
    const page = readFileSync("src/app/pricing/page.tsx", "utf8");
    expect(page).not.toMatch(/offers?\(|priceCurrency|AggregateOffer|"@type":\s*"(Offer|Product)"/);
  });
});
