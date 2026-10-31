# SociVanta — SEO-01: Technical SEO, AEO, GEO and Organic Search Foundation

**Status:**
- Implemented and verified locally against a production build.
- No ranking or traffic outcome is claimed.
- No keyword-volume data was available, so the keyword work below is qualitative.
- AI generation is still off (AI-02), and every page says so.

**One blocking deployment step:**
1. Set `APP_URL` to the real public https origin before the production build.
2. Then verify the site in Google Search Console and Bing Webmaster Tools (section 10).

---

## 1. Initial audit findings

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | No `metadataBase`. Relative canonicals (`/ai-tools`, tool pages) would resolve to **localhost** in production. | Critical | `metadataBase` from `APP_URL`. Refuses to fall back to localhost when `APP_ENV=production`. |
| 2 | No `robots.txt` and no XML sitemap. | High | `src/app/robots.ts`, `src/app/sitemap.ts` |
| 3 | The homepage had no canonical, and its title and description were only the root defaults. | High | Dedicated metadata, canonical `/`, Open Graph and Twitter |
| 4 | No Organization or WebSite structured data; no breadcrumbs. | Medium | Central schema builders (section 5) |
| 5 | The AI hub's FAQ JSON-LD used `.replace(/</g, "<")`, a no-op because `"<"` is `<`, so it wasn't escaped. | Medium | A shared `serializeJsonLd` escapes `< > & U+2028 U+2029`; unit tested |
| 6 | Tool pages were thin: tagline, form and two limits. | High | Substantial, server-rendered guides for the four Content Studio tools (section 7) |
| 7 | Nine "Coming soon" tool pages (Growth Intelligence, Smart Assistance) were indexable but had no independent value. | High | `noindex, follow` and kept out of the sitemap until they're useful |
| 8 | No Open Graph image or Twitter card. | Medium | Generated 1200×630 images for the site, the hub and each tool |
| 9 | No branded 404 page; the default Next page had no route back into the site. | Low | `src/app/not-found.tsx` (status stays 404, noindex) |
| 10 | Five unused create-next-app SVGs were in `public/`. | Low | Removed |
| 11 | The proxy treated everything after `/ai-tools/` as the slug, so sub-routes such as `/ai-tools/<tool>/opengraph-image` would 404. | Medium | Only the first segment identifies the tool |
| 12 | The tool fact strip said "10 free runs a day" while generation is off (introduced in AI-02). | Medium | Shows "10 a day, planned" until the tool is live |
| 13 | The footer's Terms, Privacy, Refund, About, Careers, Help and Contact links are buttons with no pages; the contact details are placeholders. | Medium | **Not changed.** No legal text was invented (section 12) |
| 14 | The homepage HTML is about 435 KB raw (57 KB gzipped), mostly the serialized 118-service catalog. | Medium | Not changed, because the catalog is out of scope (section 12) |
| 15 | The homepage hero H1 is server-rendered at `opacity: 0` and fades in after hydration. | Low–medium | Lab LCP was not affected (LCP = FCP); left unchanged to preserve the approved animation. Monitor field LCP. |

These were already sound:
- Private areas: the dashboard and admin send `noindex` metadata plus an `X-Robots-Tag` header and redirect anonymous visitors; auth pages are `noindex`.
- Unknown tool slugs return a real 404.
- One H1 per page; semantic landmarks.
- All content is server-rendered.
- No `<img>` elements without alt text (the site uses inline SVG).

## 2. Technical SEO changes

| Area | Change |
|---|---|
| Canonical origin | `src/lib/seo/site.ts` provides `siteOrigin()` and `absoluteUrl()` from `APP_URL`, with a localhost fallback only outside production. `metadataBase` is set in `src/app/layout.tsx`. |
| Metadata | Unique titles, descriptions and canonicals for the homepage, the hub and the four guided tool pages. Open Graph (with `siteName` and locale) and `summary_large_image` Twitter cards. |
| Indexing | The 4 Content Studio tool pages are indexable. The 9 other tool pages are `noindex, follow`. Auth pages, the dashboard, admin and the 404 page are `noindex`. |
| robots.txt | `Allow: /`. `Disallow: /dashboard`, `/admin`, `/api/` and `/dev/`. Absolute `Sitemap:` line. Sign-in pages stay crawlable so their `noindex` is seen. |
| Sitemap | 6 canonical URLs, generated from the registry plus the indexing policy. No `lastmod`, `changefreq` or `priority`. |
| Social images | `opengraph-image.tsx` at the root, `/ai-tools` and `/ai-tools/[tool]` (static, PNG). |
| 404 | A branded page with links to the homepage, AI tools and services. The real 404 status is kept. |
| Header and footer | New `page="other"` kind, so "AI Tools" isn't marked as the current page on unrelated pages. |
| Proxy | Only the first path segment identifies the tool slug. |

## 3. Page-by-page metadata

Titles are absolute (no template). The availability clause is computed at build time from the server's real state.

| URL | Index | Title | Meta description |
|---|---|---|---|
| `/` | Yes | SociVanta — Social Media Services for Every Major Platform | Browse 118 listed social media services across 15 platforms in one clear catalog — audience, engagement, views and more — with order tracking in one dashboard. |
| `/ai-tools` | Yes | AI Social Media Tools for Content Creators \| SociVanta AI | AI tools for social media content: a caption generator, hashtag and keyword finder, post ideas and a content calendar, shaped for each platform. Launching in stages. |
| `/ai-tools/caption-generator` | Yes | AI Caption Generator for Instagram, TikTok & More \| SociVanta | Describe your post, pick platforms and a tone, and get three distinct caption options per platform, plus hooks and calls to action to edit. *Coming soon to SociVanta AI.* |
| `/ai-tools/hashtag-keyword-finder` | Yes | AI Hashtag Generator & Keyword Finder \| SociVanta | Hashtags grouped from broad to niche, plus search keywords for your topic and platforms. Relevance-based suggestions — no invented trend data. *Coming soon to SociVanta AI.* |
| `/ai-tools/post-ideas-generator` | Yes | AI Social Media Post Ideas Generator \| SociVanta | Six practical post ideas for your brand and goal, each with a category, format, hook and outline — for Instagram, TikTok, Facebook and more. *Coming soon to SociVanta AI.* |
| `/ai-tools/content-calendar` | Yes | AI Social Media Content Calendar Generator \| SociVanta | Plan 7 or 30 days of posts: weekly themes plus a day-by-day plan you can edit, copy, export as CSV or print. Nothing is posted for you. *Coming soon to SociVanta AI.* |
| 9 other `/ai-tools/*` pages | `noindex, follow` | `{Tool name} — SociVanta AI` | The tool's tagline and description |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` | `noindex, nofollow` | Unchanged | Unchanged |
| `/dashboard/*`, `/admin/*`, `/dev/*` | `noindex, nofollow` and disallowed | Unchanged | Unchanged |

The "118" and "15" in the homepage description come from `CATALOG_TOTALS`, so they can't drift from the catalog. When a tool goes live, its clause becomes "Free with a SociVanta account — N runs a day."

## 4. Keyword-to-page mapping (qualitative)

No verified volume, difficulty or ranking data was available. Everything below is a hypothesis about intent, to be validated with Search Console queries after launch. Each page owns one primary intent; supporting terms appear naturally in its copy, not as keyword lists.

| Page | Primary intent | Supporting intents | Rationale |
|---|---|---|---|
| `/ai-tools` | AI social media tools | AI tools for content creators; AI tools for social media marketing; social media content creation tools | Hub that links to every tool. "Free AI social media tools" isn't targeted in the title until free generation is real. |
| Caption Generator | AI caption generator | Instagram / TikTok / Facebook / social media caption generator | One page covers all platforms, because the tool does; there are no per-platform doorway pages. |
| Hashtag & Keyword Finder | AI hashtag generator | Instagram / TikTok / social media hashtag generator; AI social media keyword generator | Explicit "no invented trend data" positioning |
| Post Ideas Generator | AI social media post ideas | Instagram post ideas generator; social media content ideas generator; AI content ideas for businesses | Answers "Can AI create post ideas for a small business?" |
| Content Calendar | Social media content calendar generator | AI content calendar generator; free social media content planner; Instagram content calendar | Answers "What is a social media content calendar?" |
| `/` | Social media services | SMM services; Instagram / TikTok / YouTube services | Describes the catalog accurately, with no follower or engagement promises |

The hashtag tool's primary intent is "AI hashtag generator" because that's the dominant phrasing; its URL keeps the existing registry slug (`hashtag-keyword-finder`). The four primary intents are unique, which a unit test enforces.

## 5. Schema implementations

Builders live in `src/lib/seo/schema.ts`. Each page renders one `@graph` through `<JsonLd>` (`src/components/seo/json-ld.tsx`).

| Page | Types |
|---|---|
| `/` | Organization, WebSite, WebPage |
| `/ai-tools` | CollectionPage, BreadcrumbList, ItemList (the 4 Content Studio tools), FAQPage (the visible FAQ, word for word) |
| Guided tool pages | WebPage, BreadcrumbList, FAQPage (visible questions) |
| Guided tool pages, **when the tool is live** | Adds WebApplication: `isAccessibleForFree` and an Offer of `0 USD`, reflecting the real free allowance. Not emitted while generation is off. |
| Other tool pages | WebPage, BreadcrumbList |

The schema never includes ratings, reviews, invented prices, fake offers or unsupported availability; unit and crawl tests check this. FAQ rich results aren't expected, since Google restricts them to authoritative government and health sites. FAQPage stays because it accurately describes visible content. Organization has no `logo` or `sameAs`, because no logo image file or official social profiles exist yet.

**Validation:**
- All JSON-LD parses on every indexable page.
- Every FAQPage question appears in the page HTML.
- No localhost URLs appear in the schema.
- The Rich Results Test and the Schema Markup Validator need the public URL: run both after deployment.

## 6. Indexing and sitemap strategy

- **Indexable:** pages with a clear purpose and independent value. That's the homepage, the AI hub and the four Content Studio tool pages, which now carry substantial guides.
- **Temporarily `noindex, follow`:** the 9 Growth Intelligence and Smart Assistance tool pages. They stay reachable and their links are followed. To make one indexable, write a guide for it in `src/lib/ai/guides.ts`, which flips `isIndexableTool`, the robots tag and the sitemap automatically.
- **Never indexed:** sign-in and account utilities, the dashboard, admin, `/dev`, the APIs (disallowed) and the 404 page. Authentication remains the real protection; robots rules are only hints.
- **Sitemap:** generated from the same policy, so it can't list a `noindex` page. Every listed URL equals its page's canonical; tests check both.
- **When generation goes live:** pages are statically prerendered, so **rebuild after turning on `AI_GENERATION_ENABLED`**. That updates the availability copy, the descriptions and the WebApplication schema. The live badges and workspace update on their own.

## 7. AEO and GEO content improvements

Each Content Studio page now has a server-rendered guide below the tool (`src/components/ai/tool-guide.tsx`, content in `src/lib/ai/guides.ts`):

- **Direct answer first:**
  - "What is an AI caption generator?"
  - "How do AI hashtag suggestions work?"
  - "Can AI create social media post ideas for a small business?"
  - "What is a social media content calendar?"

  Each opens with a two-sentence answer, then context.
- **Availability card:** generated from the real state. The current text is "isn't generating yet", plus the planned allowance and "no social account connection is needed".
- **Who it helps, how to use it** (3 steps), and **what you can customise**.
- **Example briefs**, labelled as describing the *structure* of results, not generated output.
- **Tips from the SociVanta team:** human-written guidance, for example "How do I write better Instagram captions?".
- **How results are made:** transparent about the model, redaction, validation and that nothing is stored or posted. It also shows each tool's limitations.
- **FAQs:** 3–4 per tool, different on each page, in an accessible one-open-at-a-time accordion.
- **Pairs well with:** contextual links with descriptive anchor text.
  - Caption Generator → Hashtag Finder and Content Calendar
  - Post Ideas → Content Calendar and Caption Generator
  - Content Calendar → Post Ideas and Caption Generator
  - Hashtag Finder → Caption Generator and Post Ideas

The guide doesn't claim the tools work today, promise results, or show search-volume, trend or popularity figures; unit tests ban these phrases. No AI-crawler files (for example `llms.txt`) were added; only standard, documented mechanisms are used. The hub keeps its approved design. Its tool descriptions, category notes and FAQ were already server-rendered and accurate, so only its metadata and schema changed.

## 8. Performance results (lab only)

Measured on a local production build in Microsoft Edge with mobile emulation (4× CPU slowdown, about 1.6 Mbps, 150 ms latency); median of 3 runs. **These are lab numbers, not field data.** There is no real-user (CrUX) data before deployment.

| Page | Before FCP / LCP | After FCP / LCP | CLS | JS transferred |
|---|---|---|---|---|
| `/` | 3,948 / 3,948 ms | 2,608 / 2,608 ms | 0 → 0 | 279 → 289 kB |
| `/ai-tools` | 3,728 / 3,728 ms | 2,468 / 2,852 ms | 0 → 0 | 254 → 255 kB |
| `/ai-tools/caption-generator` | 2,972 / 2,972 ms | 2,436 / 2,436 ms | 0 → 0 | 258 → 258 kB |

- **Read the timing differences as run-to-run variance, not improvement.** The homepage barely changed (metadata and JSON-LD only), yet its numbers moved by about 1.3 s.
- **Real effects of SEO-01:**
  - The guide is a server component, so it adds no client JavaScript.
  - The caption page's HTML grew from 13.7 KB to 21.3 KB gzipped (the guide text).
  - CLS stays 0.
  - The 10 kB JS difference on `/` is within the variance of route prefetching.
- **Biggest remaining opportunity:** the homepage's 435 KB of raw HTML and its serialized catalog (section 12).

## 9. Exact automated test results

| Check | Result |
|---|---|
| `tsc --noEmit` | Pass |
| ESLint | Pass |
| Production build | Pass (also built with `APP_URL=https://www.socivanta.example` to verify absolute URLs) |
| Vitest (unit and integration) | **236 / 236** (226 before; 10 new SEO tests in `tests/unit/seo.test.ts`) |
| SEO crawl (`seo01`, raw HTML as a crawler sees it, plus rendered checks) | **105 / 105** |
| AI landing regression (`ai01`) | **55 / 55** |
| AI-02 Content Studio regression (`ai02`) | **35 / 35** (selectors updated for the new guide copy) |
| Dashboard regression (`menu-ai`) | Pass |

The SEO crawl checks:
- **Every indexable page:** 200 status; one document title; unique title and description; absolute canonical on the configured origin; an absolute Open Graph image; Twitter card; exactly one H1; no localhost anywhere; JSON-LD that parses, with no ratings; FAQ questions visible.
- **Indexing:** the 9 `noindex, follow` tool pages; `noindex` meta and header on auth pages; dashboard and admin redirects.
- **robots.txt and sitemap:** robots.txt content; the sitemap's 6 URLs match the canonicals.
- **Status codes:** 404 for unknown pages and tools; Open Graph images return 200 PNG.
- **Links:** all 26 unique internal links resolve; no generic link text; images have alt text.
- **Rendered:** no horizontal overflow at 320, 375, 1024 and 1440 px in light and dark themes; keyboard-operable FAQ; no console errors.

## 10. Remaining deployment requirements

1. **Set `APP_URL`** to the public https origin, for example `https://www.<your-domain>`. It's required in production; the build stops rather than emit localhost URLs.
2. Build and deploy. Then check `https://<domain>/robots.txt` and `/sitemap.xml`, and confirm a page's canonical tag.
3. **Google Search Console:**
   - Add a Domain property and verify it with the DNS TXT record Google provides.
   - Submit `https://<domain>/sitemap.xml` under *Sitemaps*.
   - Use *URL Inspection* on the homepage, `/ai-tools` and one tool page, then request indexing.
   - Over the following weeks, watch *Pages* (indexing), *Performance* (queries, to validate section 4) and *Core Web Vitals* (field data).
4. **Bing Webmaster Tools:**
   - Import the site from Search Console, or verify by DNS or meta tag.
   - Submit the sitemap and check *Site Explorer* and *Search Performance*.
   - Bing powers several AI-assisted search experiences, so its reports are the closest view available of that visibility.
5. **Verification files:**
   - Google and Bing provide them; none are invented here and none are committed.
   - DNS verification needs no code.
   - If a meta tag is preferred, add it to `metadata.verification` in `src/app/layout.tsx`.
6. Run the Rich Results Test and the Schema Markup Validator against the live URLs.
7. **When Content Studio launches:**
   - Rebuild after enabling generation (section 6).
   - Update the hub's "in the works" copy.
   - Optionally re-submit the four tool URLs.
8. **Site identity:** publish real legal, privacy and contact pages, and add `logo` and `sameAs` to Organization once those assets exist.

## 11. Recommendations for future organic content

A roadmap only; nothing below was generated. Build each piece only when it can be genuinely useful and maintained.

- **Guides hub (`/guides`):** a few in-depth, human-edited articles that answer real questions, each linking to the relevant tool:
  - "How to write Instagram captions that get read" → Caption Generator
  - "How to choose hashtags without guesswork" → Hashtag Finder
  - "A simple monthly content calendar for small businesses" → Content Calendar
  - "30 post ideas for local businesses, by goal" → Post Ideas
- **Platform-specific guidance:** add sections inside existing pages (for example LinkedIn caption conventions) before considering new pages. Create a separate page only if it offers substantially distinct value. No templated per-platform doorway pages.
- **Service education:** plain-language explanations of how each service category works, with honest expectations and no guarantees, linked from the catalog.
- **Growth Intelligence (AI-03):** write a guide for each tool as it ships, which makes the page indexable automatically.
- **Measure before expanding:** use Search Console queries to confirm the intent hypotheses, then extend the pages that earn impressions.

## 12. Prioritized unresolved issues

1. **Blocking: production `APP_URL` and domain aren't configured.** Canonicals, the sitemap and Open Graph URLs depend on it.
2. **High: no legal, privacy, contact or about pages.** The footer links are placeholders. They matter for trust and are expected by search quality guidelines; the content needs the business's real details.
3. **High: Search Console and Bing aren't verified,** and there's no field Core Web Vitals data yet. Manual steps are in section 10.
4. **Medium: homepage payload.** About 435 KB of raw HTML, mostly the serialized catalog sent as both HTML and RSC data. Moving catalog filtering to the server, or paginating it, would cut first-load bytes. This is a catalog change, outside SEO-01's scope.
5. **Medium: copy that must change at launch.** The hub's "in the works" copy, plus a rebuild after enabling generation.
6. **Low–medium: homepage hero H1 fades in from `opacity: 0`.** It didn't affect lab LCP. If field LCP on mobile looks poor, render the heading visible at first paint and keep the motion on transform only.
7. **Low: Organization schema lacks `logo` and `sameAs`.** Add them once a logo image and official profiles exist.
8. **Low (pre-existing, outside SEO):** the marketing header's Log in and Sign up buttons open a "coming next" preview even though accounts exist.

## Scope kept

Unchanged:
- The approved landing designs.
- The 118 services, prices and order rules.
- SMM workflows, payments, wallets and checkout restrictions.
- AI generation, which stays off; no credentials were added and no model was configured.

Also: no AI-03 work, no bulk or doorway pages, no fake reviews or rankings, no Git, and nothing was deployed.
