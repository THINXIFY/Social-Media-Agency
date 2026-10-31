import { afterEach, describe, expect, it } from "vitest";
import { HELP_ARTICLES } from "@/lib/help/articles";
import { generateMetadata as toolMetadata } from "@/app/ai-tools/[tool]/page";
import { metadata as hubMetadata } from "@/app/ai-tools/page";
import { metadata as homeMetadata } from "@/app/page";
import { metadata as socialMetadata } from "@/app/social-management/page";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { isIndexableTool, TOOL_GUIDES } from "@/lib/ai/guides";
import { AI_TOOL_BY_ID, AI_TOOLS, aiToolHref } from "@/lib/ai/registry";
import { breadcrumbs, faqPage, graph, organization, serializeJsonLd, webApplication, webPage, website } from "@/lib/seo/schema";
import { absoluteUrl, siteOrigin } from "@/lib/seo/site";

const saved = { APP_URL: process.env.APP_URL, APP_ENV: process.env.APP_ENV };
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k];
  else process.env[k] = v;
});
const meta = (slug: string) => toolMetadata({ params: Promise.resolve({ tool: slug }) });

describe("canonical origin", () => {
  it("comes from APP_URL and never falls back to localhost in production", () => {
    process.env.APP_URL = "https://www.example.com/some/path";
    expect(siteOrigin()).toBe("https://www.example.com");
    expect(absoluteUrl("/ai-tools")).toBe("https://www.example.com/ai-tools");
    delete process.env.APP_URL;
    process.env.APP_ENV = "development";
    expect(siteOrigin()).toBe("http://localhost:3000");
    process.env.APP_ENV = "production";
    expect(() => siteOrigin()).toThrow(/APP_URL/);
  });
});

describe("sitemap and robots", () => {
  it("lists only canonical, indexable public pages on the configured origin", () => {
    process.env.APP_URL = "https://www.example.com";
    const urls = sitemap().map((e) => e.url);
    expect(urls).toEqual([
      "https://www.example.com/",
      "https://www.example.com/ai-tools",
      "https://www.example.com/ai-tools/caption-generator",
      "https://www.example.com/ai-tools/hashtag-keyword-finder",
      "https://www.example.com/ai-tools/post-ideas-generator",
      "https://www.example.com/ai-tools/content-calendar",
      "https://www.example.com/ai-tools/growth-advisor",
      "https://www.example.com/ai-tools/growth-roadmap",
      "https://www.example.com/ai-tools/service-recommender",
      "https://www.example.com/ai-tools/assistant",
      "https://www.example.com/ai-tools/service-search",
      "https://www.example.com/ai-tools/smart-order-assistant",
      "https://www.example.com/ai-tools/order-explanation",
      "https://www.example.com/ai-tools/support-assistant",
      "https://www.example.com/social-management",
      "https://www.example.com/pricing",
      ...["/help", ...HELP_ARTICLES.map((a) => `/help/${a.slug}`)].map((p) => `https://www.example.com${p}`),
    ]);
    expect(urls.join()).not.toMatch(/localhost|dashboard|admin|login|register|api/);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("blocks private areas from crawling and points to the sitemap", () => {
    process.env.APP_URL = "https://www.example.com";
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule).toMatchObject({ userAgent: "*", allow: "/", disallow: ["/dashboard", "/admin", "/api/", "/dev/"] });
    expect(r.sitemap).toBe("https://www.example.com/sitemap.xml");
    // Sign-in pages stay crawlable so their noindex is seen.
    expect(JSON.stringify(rule)).not.toMatch(/login|register/);
  });
});

describe("structured data", () => {
  it("escapes characters that could close the script tag", () => {
    const out = serializeJsonLd({ text: "</script><script>alert(1)</script> & \u2028" });
    expect(out).not.toMatch(/<|>|&|\u2028/);
    expect(JSON.parse(out).text).toBe("</script><script>alert(1)</script> & \u2028");
  });

  it("never includes ratings, reviews or invented prices", () => {
    const all = JSON.stringify(
      graph(organization(), website(), webPage({ path: "/", name: "x", description: "y" }), breadcrumbs([{ name: "a", path: "/" }]), faqPage([{ q: "q", a: "a" }]), webApplication({ path: "/ai-tools/caption-generator", name: "x", description: "y", featureList: ["z"] })),
    );
    expect(all).not.toMatch(/aggregateRating|ratingValue|review|reviewCount/i);
    expect(all.match(/"price":"(\d+)"/g) ?? []).toEqual(['"price":"0"']); // the real free allowance only
  });
});

describe("tool pages", () => {
  it("only tools with a guide are indexable; the rest are noindex, follow", async () => {
    expect(AI_TOOLS.filter((t) => isIndexableTool(t.id)).map((t) => t.id)).toEqual(["caption-generator", "hashtag-finder", "post-ideas", "content-calendar", "growth-advisor", "growth-roadmap", "service-recommender", "assistant", "service-search", "order-assistant", "order-explanation", "support-assistant"]);
    expect(AI_TOOLS.filter((t) => !isIndexableTool(t.id)).map((t) => t.id)).toEqual(["workflow-automation"]);
    for (const t of AI_TOOLS) {
      const m = await meta(t.slug);
      expect(m.alternates?.canonical).toBe(aiToolHref(t));
      if (isIndexableTool(t.id)) expect(m.robots).toBeUndefined();
      else expect(m.robots).toEqual({ index: false, follow: true });
    }
  });

  it("titles and descriptions are unique, sized for search results, and honest about availability", async () => {
    const titles = new Set<string>();
    for (const id of Object.keys(TOOL_GUIDES)) {
      const m = await meta(AI_TOOL_BY_ID[id].slug);
      const title = (m.title as { absolute: string }).absolute;
      expect(title.length, title).toBeLessThanOrEqual(65);
      titles.add(title);
      expect(String(m.description).length).toBeGreaterThan(110);
      expect(String(m.description).length).toBeLessThanOrEqual(175);
      // Generation is off in this environment: the description must say so and must not promise free runs now.
      expect(String(m.description)).toMatch(/Coming soon to Sociotix AI\.$/);
    }
    expect(titles.size).toBe(12);
    const all = [homeMetadata, hubMetadata, socialMetadata].map((m) => (m.title as { absolute: string }).absolute);
    expect(new Set([...all, ...titles]).size).toBe(15);
  });

  it("each page owns a distinct primary intent and links to other implemented tools", () => {
    const primaries = Object.values(TOOL_GUIDES).map((g) => g.intent.primary.toLowerCase());
    expect(new Set(primaries).size).toBe(primaries.length);
    for (const [id, g] of Object.entries(TOOL_GUIDES)) {
      expect(g.faqs.length).toBeGreaterThanOrEqual(3);
      expect(g.steps).toHaveLength(3);
      for (const n of g.next) {
        expect(isIndexableTool(n.toolId), n.toolId).toBe(true);
        expect(n.toolId).not.toBe(id);
      }
    }
  });

  it("guide copy never claims the tools work today or makes unsupported promises", () => {
    const text = JSON.stringify(TOOL_GUIDES).toLowerCase();
    for (const banned of ["available now", "try it now", "try it free", "live now", "guaranteed", "we guarantee", "guarantees growth", "go viral", "is trending", "trending hashtags", "most popular hashtags", "best time to post is", "boost your followers", "rank #1"]) expect(text, banned).not.toContain(banned);
    expect(text).not.toMatch(/\b\d[\d,.]*\s*(k|m)?\s*(searches|monthly searches|search volume|views guaranteed)/);
  });
});

describe("social management page (AI-06)", () => {
  it("is indexable with a canonical, sized metadata and social cards; the private workspace stays out", () => {
    expect(socialMetadata.alternates?.canonical).toBe("/social-management");
    expect(socialMetadata.robots).toBeUndefined();
    const title = (socialMetadata.title as { absolute: string }).absolute;
    expect(title.length).toBeLessThanOrEqual(60);
    expect(String(socialMetadata.description).length).toBeGreaterThanOrEqual(120);
    expect(String(socialMetadata.description).length).toBeLessThanOrEqual(175);
    expect(socialMetadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect(`${title} ${socialMetadata.description}`).not.toMatch(/schedul|publish|auto-post|guarantee/i);
    process.env.APP_URL = "https://www.example.com";
    expect(sitemap().map((e) => e.url).filter((u) => u.includes("social") && !u.includes("/help/"))).toEqual(["https://www.example.com/social-management"]);
  });
});

describe("site pages", () => {
  it("homepage and hub have canonicals and social metadata", () => {
    expect(homeMetadata.alternates?.canonical).toBe("/");
    expect(hubMetadata.alternates?.canonical).toBe("/ai-tools");
    for (const m of [homeMetadata, hubMetadata]) {
      expect(m.openGraph).toBeTruthy();
      expect(m.twitter).toMatchObject({ card: "summary_large_image" });
      expect(String(m.description).length).toBeLessThanOrEqual(200);
    }
    expect(String(homeMetadata.description)).not.toMatch(/guarantee|instant results|real followers/i);
  });
});
