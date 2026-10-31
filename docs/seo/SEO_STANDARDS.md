# SociVanta SEO standards

Every phase that adds or changes a public page must meet this checklist. The utilities named here are the single source of truth. Don't duplicate them in components.

## Purpose and indexing

- [ ] **One clear purpose and primary intent per page.** It doesn't compete with another page's intent; check the map in `docs/seo/SEO_01_REPORT.md` §4.
- [ ] **Index only pages with independent value.** Thin, placeholder, utility and account pages get `robots: { index: false, follow: … }`.
  - AI tool pages are indexable only when they have a guide in `src/lib/ai/guides.ts` (`isIndexableTool`).
- [ ] **The sitemap (`src/app/sitemap.ts`) lists only indexable, canonical URLs,** generated from the same policy. Never list a noindex page.
- [ ] **New private areas are protected by authentication first.** Add them to the proxy's noindex header and to `robots.ts`. robots.txt is a hint, never security.
- [ ] **Unknown URLs return a real 404.** Removed pages get a permanent redirect only to a genuinely equivalent page.

## Metadata

- [ ] **Unique `<title>`,** about 60 characters or fewer, written for people. Use `title: { absolute }` for public pages.
- [ ] **Unique meta description,** about 120–175 characters. Accurate, with no claims the page doesn't support.
- [ ] **Relative canonical in `alternates.canonical`.** It resolves against `metadataBase`, which comes from `APP_URL` (`src/lib/seo/site.ts`).
  - Never hard-code a domain or localhost.
  - Build absolute URLs with `absoluteUrl()`.
- [ ] **Open Graph and Twitter metadata,** with an `opengraph-image.tsx` (use `ogImage()` in `src/lib/seo/og.tsx`) for important sections.

## Content

- [ ] **Exactly one H1 and a logical H2/H3 order.** Use semantic landmarks (`main`, `nav`, `section` with labels).
- [ ] **Key content is server-rendered and readable without JavaScript.** Interactive client components may enhance it, but must not be the only place information lives.
- [ ] **Answer real questions directly:** a concise answer first, then context. FAQs must differ from page to page, and only where they're helpful.
- [ ] **Truthful availability, capabilities and limits.**
  - Never claim a feature works, is free or is live unless the server state says so.
  - Derive availability text from the real state (for example `effectiveAvailability`), never hard-code it.
  - Rebuild after a state change, because pages are statically prerendered.
- [ ] **No fabricated data:**
  - No search volume, popularity, rankings, statistics, testimonials or reviews.
  - No promises of followers, engagement or guaranteed results.
- [ ] **Label examples honestly.** Say whether they're human-written guidance or a description of the result structure.
- [ ] **Descriptive link text** (never "click here"). Real `<a href>`/`<Link>` for navigation, never buttons. Add contextual links between related pages.
- [ ] **Images:** meaningful `alt` text, or `alt=""` / `aria-hidden` for decoration. Use explicit dimensions; `next/image` for raster images.
- [ ] **No doorway pages:** no near-duplicate pages per keyword, city or platform. Extend an existing page first.

## Structured data

- [ ] **Build JSON-LD only with `src/lib/seo/schema.ts`.** Render it with `<JsonLd>`, which escapes safely; never call `JSON.stringify` directly into a script tag.
- [ ] **Every value matches visible content.**
  - FAQPage text must equal the on-page questions and answers.
  - No ratings, reviews, invented prices or offers.
  - `WebApplication` only for tools that work right now.
- [ ] **Validate after deployment** with the Rich Results Test and the Schema Markup Validator. Don't expect FAQ rich results for commercial pages.

## Performance and UX

- [ ] **Core Web Vitals targets at the 75th percentile of real users:** LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. Report lab numbers as lab numbers only.
- [ ] **Keep pages that don't need interactivity as server components.** Don't hide the LCP element behind an entrance animation (`opacity: 0` on first paint).
- [ ] **No horizontal overflow from 320 px up,** in light and dark themes. Interactive elements are keyboard operable, and reduced motion is respected.

## Before merging

- [ ] **Unit tests:** `tests/unit/seo.test.ts` passes. Extend it for new indexable pages, covering titles, canonicals, sitemap membership and banned claims.
- [ ] **Crawl check:**
  - Build with `APP_URL=https://<stand-in>`.
  - Confirm canonicals, the sitemap and Open Graph URLs use that origin, with no localhost.
  - JSON-LD parses, and internal links resolve.
- [ ] **Static checks:** typecheck, lint and the production build pass.
