import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateMetadata } from "@/app/help/[slug]/page";
import { metadata as helpMetadata } from "@/app/help/page";
import sitemap from "@/app/sitemap";
import { articleTitle, HELP_DESCRIPTION, HELP_TITLE } from "@/components/help/help-center";
import { searchHelp } from "@/components/help/search";
import { HELP_ARTICLE_BY_SLUG, HELP_ARTICLES, HELP_CATEGORIES, POPULAR } from "@/lib/help/articles";
import { CATEGORIES, STATUS_META, TICKET_STATUSES } from "@/lib/support";

/* Phase 5G-A Help Center content, metadata and search. */

describe("help content", () => {
  it("covers every category with unique, well-formed articles", () => {
    expect(HELP_CATEGORIES.map((c) => c.id)).toEqual(["getting-started", "account", "orders", "payments", "ai-tools", "social", "troubleshooting"]);
    for (const c of HELP_CATEGORIES) expect(HELP_ARTICLES.some((a) => a.category === c.id), c.id).toBe(true);
    expect(new Set(HELP_ARTICLES.map((a) => a.slug)).size).toBe(HELP_ARTICLES.length);
    expect(new Set(HELP_ARTICLES.map((a) => a.title)).size).toBe(HELP_ARTICLES.length);
    for (const a of HELP_ARTICLES) {
      expect(a.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(a.answer.length).toBeGreaterThan(40);
      for (const r of a.related) expect(HELP_ARTICLE_BY_SLUG[r], `${a.slug} → ${r}`).toBeTruthy();
    }
    for (const s of POPULAR) expect(HELP_ARTICLE_BY_SLUG[s]).toBeTruthy();
  });

  it("makes no promises the platform can't keep", () => {
    const text = JSON.stringify(HELP_ARTICLES);
    expect(text).not.toMatch(/guarantee(d)? (results|delivery|refund)|instant(ly)? deliver|24\/7|within \d+ (minutes|hours|days)|money-back|paypal|stripe|credit card payments|crypto/i);
    expect(text).toMatch(/aren't automatic/); // refunds after work starts
    expect(text).toMatch(/File attachments aren't available yet/);
  });

  it("describes ticket statuses and topics exactly as the product shows them", () => {
    const contact = HELP_ARTICLE_BY_SLUG["contact-support"];
    for (const s of TICKET_STATUSES) expect(contact.body!.join(" ")).toContain(STATUS_META[s].customer);
    expect(CATEGORIES).toHaveLength(7);
  });

  it("links only to routes that exist", () => {
    for (const p of ["dashboard/support", "dashboard/referrals", "dashboard/security", "dashboard/add-funds", "dashboard/orders", "dashboard/new-order", "dashboard/social/automations"]) expect(existsSync(join("src/app", p, "page.tsx")), p).toBe(true);
  });
});

describe("help SEO", () => {
  it("hub and articles have unique, sized titles and descriptions with canonicals", async () => {
    expect(helpMetadata.alternates?.canonical).toBe("/help");
    expect(HELP_TITLE.length).toBeLessThanOrEqual(60);
    expect(HELP_DESCRIPTION.length).toBeGreaterThanOrEqual(120);
    expect(HELP_DESCRIPTION.length).toBeLessThanOrEqual(175);
    const titles = new Set<string>();
    for (const a of HELP_ARTICLES) {
      const m = await generateMetadata({ params: Promise.resolve({ slug: a.slug }) });
      const title = (m.title as { absolute: string }).absolute;
      expect(title).toBe(articleTitle(a.title));
      expect(title.length, a.slug).toBeLessThanOrEqual(60);
      expect(a.description.length, a.slug).toBeGreaterThanOrEqual(110);
      expect(a.description.length, a.slug).toBeLessThanOrEqual(175);
      expect(m.alternates?.canonical).toBe(`/help/${a.slug}`);
      expect(m.robots).toBeUndefined();
      titles.add(title);
    }
    expect(titles.size).toBe(HELP_ARTICLES.length);
  });

  it("every public help page is in the sitemap; nothing private is", () => {
    process.env.APP_URL = "https://www.example.com";
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain("https://www.example.com/help");
    for (const a of HELP_ARTICLES) expect(urls).toContain(`https://www.example.com/help/${a.slug}`);
    expect(urls.join()).not.toMatch(/dashboard|admin|support\?/);
  });
});

describe("help search", () => {
  it("finds articles by the words people use", () => {
    expect(searchHelp("cancel order")[0].slug).toBe("cancel-an-order");
    expect(searchHelp("forgot password")[0].slug).toBe("reset-your-password");
    expect(searchHelp("refund").map((a) => a.slug)).toContain("refunds-and-cancellations");
    expect(searchHelp("ticket")[0].slug).toBe("contact-support");
    expect(searchHelp("zzzz")).toEqual([]);
    expect(searchHelp(" ")).toEqual([]);
  });
});
