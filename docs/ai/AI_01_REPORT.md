# SociVanta AI — AI-01: Platform Foundation & AI Tools Landing Page

Status: **complete**. SociVanta AI has a public landing page, a tools directory, a reusable tool workspace and a secure, tested execution foundation.

**No AI generation is live.** No generator is implemented and no provider is configured, so every tool is honestly labelled *Coming soon* (or *Unavailable*) and every run request is refused (503).

The SMM platform (Phases 5A–5E) is unchanged in behaviour. Checkout, payments and provider fulfilment stay disabled.

## Baseline (before AI-01)

| Check | Result |
|---|---|
| Typecheck | 0 errors |
| ESLint | 0 warnings |
| Tests | 180 / 180 |
| Production build | Pass |

These results come from the end-of-5E run; no code changed between that run and the start of AI-01.

## 1. Files and routes

### Routes

| Route | Type | Purpose |
|---|---|---|
| `/ai-tools` | Static (prerendered) | Landing page and tools directory |
| `/ai-tools/[tool]` | 13 static pages | Reusable tool workspace, one per registered tool. Unknown slugs return a real **404** via `src/proxy.ts`, because streamed pages can't change their status code later |
| `GET /api/ai/tools` | Dynamic | Public tool list with *effective* availability; no provider details or secrets |
| `POST /api/ai/tools/:id/run` | Dynamic | Runs a tool through the shared pipeline. Same-origin required. Returns 503 for every tool in AI-01 |

### New files

- `src/lib/ai/registry.ts`: the code-defined tool registry (client-safe).
- `src/server/ai/provider.ts`: provider interface and configuration status.
- `src/server/ai/redact.ts`: removes personal and secret data before anything reaches a provider.
- `src/server/ai/run.ts`: the execution pipeline, quotas, budget and usage accounting.
- `src/server/db/schema/ai.ts`: the `ai_usage_events` table.
- `src/components/ai/parts.tsx`: icons, `AvailabilityBadge`, `ToolGlyph`, `ToolCard`, `AiMark`.
- `src/components/ai/workspace.tsx`: `AiWorkspace` and `RelatedTools`.
- `src/components/ai/hero-visual.tsx`: the interactive workflow preview.
- `src/components/ai/directory.tsx`: the filterable directory.
- `src/components/ai/landing.tsx`: the landing sections and FAQ content.
- `src/app/ai-tools/page.tsx` and `src/app/ai-tools/[tool]/page.tsx`: the routes.
- `drizzle/0006_ai_usage.sql` and `drizzle/rollback/0006_ai_usage.down.sql`.
- `tests/integration/ai.test.ts`.

### Changed files (integration only)

- `src/components/site/header.tsx`:
  - An **AI Tools** link: desktop from 768 px, and in the mobile menu.
  - A `page` prop, so section links work from other pages.
  - Tighter spacing below 640 px. This fixes a **pre-existing** 21 px horizontal overflow at 320 px, which also affected the homepage.
- `src/components/site/footer.tsx`: a `page` prop, so catalog and section links work off the homepage, plus an **AI Tools** link.
- `src/components/dashboard/top-bar.tsx`: an **AI Tools** entry in the customer account menu. No dashboard module was added and no navigation item was renamed or moved.
- `src/proxy.ts`: the AI 404 branch. AI pages bypass the private and `noindex` headers so they stay indexable.
- `src/server/env.ts`: the AI configuration, which fails closed.
- `src/server/db/schema/index.ts`: exports the AI schema.
- `tests/integration/migrations.test.ts`: covers 7 migrations.

## 2. Architecture decisions

- **Separate module, shared foundations.** All AI code lives under `src/lib/ai`, `src/server/ai`, `src/components/ai` and `src/app/ai-tools`. It reuses the existing auth sessions, rate-limit table, error and HTTP helpers, PostgreSQL and Drizzle, and design tokens. No second login, identity, wallet or dependency was added.
- **The SMM business logic is untouched.** AI code imports nothing from orders, payments, wallets or catalog services, and those modules import nothing from AI.
- **Static metadata lives in code.** The registry is versioned with the code that will implement each tool. The database holds only usage accounting.
- **Availability is honest by construction.** `effectiveAvailability()` can only *downgrade* a tool: it is "available" only when its generator exists **and** a verified provider is configured.
- **Copy is server-rendered.** Interactive islands (hero visual, directory filter, workspace) are client components; every descriptive word is in the HTML.

## 3. Reusable components

| Component | Use |
|---|---|
| `AiWorkspace` | The one tool layout: brief (fields generated from the registry, platform chips, selects, number and text inputs, help text) → results (structured sections, copy per item, regenerate, loading, error and empty states) → context (what it does, limitations, usage, privacy). Supports `coming_soon`, `idle`, `loading`, `error` and `result` states today; AI-02 only has to supply data. A compact variant serves embeds |
| `ToolCard`, `AvailabilityBadge`, `ToolGlyph`, `AiMark`, `RelatedTools` | Directory and cross-linking |
| `AiDirectory` | Category filter plus grouped grid, driven by the registry |
| `AiHeroVisual` | The real workflow — example *brief* → tool → the tool's real output structure. It never shows invented answers |

## 4. Provider abstraction

- **Interface:** `AiProvider.generate({ system, input, maxOutputTokens, signal })` returns `{ text, model, usage: { inputTokens, outputTokens, costMicros } }`. Tools never call a vendor SDK directly.
- **Configuration:**
  - `AI_PROVIDER` is `none` (the default), `anthropic` or `openai`. Choosing a provider requires `AI_API_KEY` and `AI_MODEL`; validation fails otherwise.
  - `AI_TIMEOUT_MS` defaults to 20 s.
  - `AI_DAILY_BUDGET_MICROS` defaults to **0**, meaning no spending.
  - `AI_ANONYMOUS_ENABLED` defaults to **false**.
- **`providerStatus()` fails closed** when:
  - no provider is configured;
  - credentials are missing;
  - the budget is zero;
  - no adapter is built. The adapter registry is **empty in AI-01**.
- **Errors:** `ProviderError` kinds are `timeout`, `outage`, `rate_limited` and `rejected`. Only outages and rate limits are retried, once.
- **Testing:** mock providers exist only inside `tests/integration/ai.test.ts`, injected through an explicit test seam (`RunDeps`) that no route passes.

## 5. Usage and security controls (`runTool`)

1. **Tool checks:** the tool must exist and have an implemented generator; otherwise 503.
2. **Access policy:** account-only tools need a verified session. Anonymous use is refused unless `AI_ANONYMOUS_ENABLED`, and stays off until cost controls are proven. Tools without a free allowance are refused.
3. **Input:** strict Zod schema per tool, then a per-tool size limit (`guard.maxInputChars`).
4. **Redaction:** private keys, API-key-like tokens, `password:`-style secrets, emails, IBAN-like account numbers, card-like numbers and phone numbers. More specific patterns run first.
5. **Provider availability** check.
6. **Burst limit:** 5 requests a minute per subject, using the shared rate-limit table.
7. **Quota and platform budget:** decided under per-subject and budget advisory locks. A `pending` row reserves the tool's cost ceiling, so concurrent requests can't exceed the quota or the budget. Quota and budget rejections are recorded.
8. **Provider call:** timeout plus caller cancellation (`AbortSignal.any`) and one safe retry. Failures don't count against the user's allowance.
9. **Output:** JSON parse plus a strict Zod schema plus a 20 000-character cap. Invalid output is never shown; its cost still counts toward the budget.
10. **Cost:** `maxOutputTokens` per tool, the actual cost recorded, and a warning when the per-tool ceiling is exceeded.
11. **Safe errors only:** no provider message, prompt or stack reaches the client.

**Privacy:** `ai_usage_events` stores metadata only:
- tool, status, provider and model;
- character counts, token counts, cost and latency;
- an **HMAC** of the account id or visitor IP.

No prompt or output text is stored, and usage isn't joined to account records. AI tools can't place orders, move money or change accounts: they only return validated data for display.

**Migration `0006_ai_usage`:** one table with status, subject-kind, tool-id and amount checks, plus two indexes. Applied to `socivanta_dev`; rollback provided.

## 6. Available versus planned

| Tool | Category | Status | Planned phase | Planned free use (signed in) |
|---|---|---|---|---|
| AI Caption Generator | Content Creation | Coming soon | AI-02 | 10 / day |
| AI Hashtag & Keyword Finder | Content Creation | Coming soon | AI-02 | 10 / day |
| AI Post Ideas Generator | Content Creation | Coming soon | AI-02 | 10 / day |
| AI Content Calendar | Content Creation | Coming soon | AI-02 | 3 / day |
| AI Growth Advisor | Growth & Strategy | Coming soon | AI-03 | 3 / day |
| AI Growth Roadmap | Growth & Strategy | Coming soon | AI-03 | 2 / day |
| AI Service Recommender | Growth & Strategy | Coming soon | AI-03 | 5 / day |
| SociVanta AI Assistant | Smart Assistance | Coming soon | Later | — |
| AI-Powered Service Search | Smart Assistance | Coming soon | Later | — |
| Smart Order Assistant | Smart Assistance | Coming soon | Later | — |
| AI Order Explanation | Smart Assistance | Coming soon | Later | — |
| AI Support Assistant | Smart Assistance | Coming soon | Later | — |
| AI Workflow Automation | Smart Assistance | **Unavailable** (needs approval controls) | Later | — |

**Available today:** the landing page, the directory, 13 tool pages in Coming Soon state, the workspace UI, and the server foundation (registry, provider interface, pipeline, quotas, budget, accounting). **Not available:** any AI generation.

Free allowances are labelled "planned" everywhere they appear. Anonymous use is planned at 0.

## 7. Test results (final run)

| Suite | Result |
|---|---|
| Unit + integration (real PostgreSQL 18.4) | **193 / 193** across 18 files. New: `ai.test.ts`, 13 tests (below). Updated: migrations up/down/up across 7 migrations |
| Typecheck, ESLint (`--max-warnings=0`), production build | Pass. `.next/static` contains no AI key names or test secrets; `.env.local` has no AI settings |
| Browser QA, production build (`ai01`) | **49 / 49**, no console errors (below) |
| Browser, true dark theme | **15 / 15**: no horizontal overflow at 320/375/768/1024/1440 on `/ai-tools`, a tool page and the homepage. Screenshots reviewed in light and dark |
| SMM regression, demo mode (dev server) | Demo dashboard pages unchanged. The one flagged check is the known Phase 5C false positive (existing Settings copy contains the searched phrase). The account menu shows **AI Tools** and opens `/ai-tools` |

The 13 tests in `ai.test.ts` cover:
- the registry: 13 unique tools, categories and honest availability;
- the public list leaking no key, provider, model or prompt;
- fail-closed provider configuration: none, missing credentials, zero budget, no adapter;
- every tool refusing to run, through the service and the API, with the CSRF check and zero spend;
- the full mock pipeline with redaction verified at the provider boundary and metadata-only storage (HMAC subject);
- input validation, size limits and the anonymous and account policies;
- daily quota under 5 concurrent requests: exactly 3 allowed;
- the burst limit;
- timeouts, outages, a single retry, no retry for rejections, and failures not using the allowance;
- caller cancellation;
- invalid or oversized output never shown, with its cost counted toward the budget;
- the platform budget stopping spend;
- redaction patterns.

The 49 browser checks cover:
- 200 status, title and description, a single h1, server-rendered copy, and FAQ structured data;
- the directory: all 13 tools, none claiming availability, one Unavailable, and the category filter;
- the hero CTAs reaching `#tools` and `#how-it-works`, and the hero visual tool switch;
- the workspace preview locked, with no fake output;
- header and footer links working from the AI page;
- keyboard: the skip link first, then the primary CTA reachable;
- all 13 tool pages showing an honest status, and unknown tools returning 404;
- locked fields and generate button, plus the limits and privacy copy;
- the run API returning 503 and the tools API exposing no secrets;
- no horizontal overflow at 320/375/768/1024/1440 (the 375 px context ran with reduced motion);
- the homepage navigation unchanged, its AI Tools link working, and the mobile menu link.

Issues found by QA and fixed:
- **Redaction ordering:** the phone rule left half an IBAN behind.
- **Hydration mismatch** in the hero visual under reduced motion.
- **Unknown tool pages returned 200.**
- **The pre-existing 320 px header overflow.**

## 8. AI-02 prerequisites

1. **Choose and approve a provider**, then implement its adapter in `src/server/ai/provider.ts` (the `ADAPTERS` map). The adapter maps provider errors to `ProviderError` kinds, reports usage and cost, honours `signal`, and uses structured JSON output. Load the provider's current API documentation first.
2. **Set the configuration** in each environment: `AI_PROVIDER`, `AI_API_KEY` (a secret manager, never committed), `AI_MODEL`, and a conservative `AI_DAILY_BUDGET_MICROS`.
3. **Implement Content Studio generators**, registered in `GENERATORS` (`run.ts`):
   - Caption, Hashtag, Post Ideas and Calendar.
   - Each has an input schema mirroring the registry fields, a strict output schema, and fixed instructions with clearly delimited user content (prompt-injection hygiene).
   - Then set each tool's registry `availability` to `"available"`.
4. **Wire the workspace:** submit to `POST /api/ai/tools/:id/run`, map `output` into `WorkspaceState.result`, and show `usage`.
5. **Sign-in path:** prompt anonymous visitors to sign in on account-only tools.
6. **Operations:**
   - A small read-only admin view or alert for daily AI spend and error rates, from `ai_usage_events`.
   - A retention policy for usage rows.
   - A privacy-policy entry describing AI processing.
7. **Keep anonymous use off** until spend under abuse has been measured.

**AI-03 note:** the Service Recommender must read the real catalog and recommend only services in `purchasable_services`. AI can never make a service purchasable or start an order.

## Scope kept

Not built:
- AI-02 or AI-03 business logic;
- a profile analyzer;
- social account connections;
- scheduling or publishing;
- subscriptions;
- saved projects;
- agents or automation.

Not changed:
- SMM services, orders, checkout or payments;
- the admin architecture.

No external infrastructure was configured. The Phase 5F–5I roadmap is untouched.

---

## Addendum — Premium redesign & art direction

The AI-01 frontend was redesigned as a whole, not restyled. AI architecture, security, routes, tool IDs, migrations and the SMM platform are unchanged. No generation, payments or fulfilment were enabled.

### Art direction

- **Light editorial base, three deliberate dark moments:**
  - the Growth Intelligence block inside the directory;
  - a full-bleed workspace showcase;
  - a full-bleed free-use band.

  Dark sections are true dark islands: the `dark` class scopes the existing design tokens, so components render correctly with no duplicated styles. Hairline gradient borders mark the transitions.
- **Typography:** one consistent, larger Manrope display scale (tight tracking, deliberate two-line breaks, a muted second clause), an eyebrow system and larger body copy.
- **Restraint:** lime is used only for the hero underline marker, "Up next" and "Free to use" labels and the allowance numerals. Violet carries the brand; neutrals do the rest.
- **Tool identity by family:**
  - Content Studio: violet gradient tiles.
  - Growth Intelligence: graphite tiles with lime icons.
  - Smart Assistance: quiet outlined tiles.

### What changed

- **Hero:**
  - Headline "Create smarter. / Grow further." with the homepage's lime marker.
  - Benefit-led subheading, refined CTAs and a "Written for" platform row.
  - A layered product composition:
    - a Content Studio window with a tool rail, a self-typing *example brief*, platform chips, a tone selector and a locked Generate button;
    - an overlapping dark results panel showing the selected tool's **real output structure** as shimmering placeholders;
    - floating annotation cards.
  - Tools cycle automatically and pause on hover or focus; everything is static under reduced motion.
- **Directory:** an editorial bento instead of identical cards.
  - Content Studio leads, with a large Caption Generator tile showing a mini brief → results preview and a Calendar tile with a week strip.
  - Growth Intelligence is a dark block linking to the Growth Intelligence showcase.
  - Smart Assistance is a calm roadmap list.
  - Family navigation cards show counts. All 13 tools appear once, with their real status.
- **Workspace showcase:** a full-width dark band presenting the real workspace, plus three concise benefits.
- **How it works:** three outlined numerals on a dashed connector, each with a mini UI vignette instead of a card.
- **Growth Intelligence:** an alternating editorial layout with labelled layout previews.
  - Roadmap stages on a dark card.
  - A catalog-match preview stating "only services you can actually order" and "never orders for you".
- **Why SociVanta AI:** four principles in a ruled grid, plus audience chips. The separate audience card section was merged in.
- **Free use:** a dark band with display type ("Free. Every day."), allowance numerals, account CTAs and an honest "planned" note.
- **FAQ and closing:** a minimal ruled FAQ (FAQPage structured data unchanged). The closing visual arranges all 13 tool marks above "Start with one idea."
- **Tool pages:**
  - A premium header: grid backdrop, family colour light, large mark, family eyebrow, status, and a facts strip (you get, platforms, free use, account).
  - Comfortable 44 px fields and an "In development" notice.
  - Shimmering placeholders, plus redesigned loading (status line and shimmer cards) and error (icon, message, retry) states.
  - The context panel no longer repeats the header, and related tools are a refined list.
- **Header:**
  - Between 1024 and 1279 px the AI Tools link becomes icon-only (same accessible name) and nav spacing tightens.
  - Labels no longer wrap. This fixes nav wrapping at 1024 px and a 69 px overflow found during QA.
- **Copy:** rewritten throughout to give each section a distinct reason, without repeating "AI-powered", "smarter" or "growth". It stays truthful: Coming soon labels, planned allowances, and no generation, analytics or account connections.

### Redesign QA

| Check | Result |
|---|---|
| Browser QA, production (`ai01`, updated for the new directory) | **50 / 50**, no console errors. A hydration mismatch introduced by the new typing animation was found and fixed by gating reduced motion on hydration |
| True dark theme, 320–1440 px, on `/ai-tools`, a tool page and the homepage | **15 / 15**, no horizontal overflow |
| Header, 1024 / 1100 / 1180 / 1280 / 1440 px, homepage and AI page | Single line (65 px), no overflow |
| Visual review | Full page at 1440 px (light and dark) and 375 px (light and dark); hero at 1440, 1024, 768 and 375 px; every major light/dark transition; tool pages in light, dark and mobile |
| Typecheck, ESLint, production build | Pass |
| Tests | 193 / 193 |
| Dashboard regression | AI Tools menu entry works |

## Addendum — Premium UI/UX refinement

A focused pass on the approved redesign. Nothing outside the AI landing and tool-page components changed: no backend, registry, route, limit or SMM changes.

- **Hero:** one studio card (`hero-visual.tsx`) holds an example brief, platform and tone chips, the tool's real result structure as placeholders, and a four-tool switcher.
  - The switcher supports arrow keys.
  - No floating cards, no auto-rotation, a single soft glow.
  - The headline and lime underline are unchanged.
- **Tools directory** (`directory.tsx`): category tabs: All tools (13), Content Studio (4), Growth Intelligence (3), Smart Assistance (6).
  - It follows the ARIA tablist pattern with Arrow, Home and End keys.
  - Every tool uses one card layout and appears exactly once.
- **Workspace** (`workspace-preview.tsx`): a two-area dark window, Input (brief and preferences) and Results (organised sections).
  - The third column was removed.
  - The window has no buttons and says plainly that no sample text is shown.
- **How it works:** three equal step cards, each with a small visual. Step 2 copy is exactly as specified.
- **Growth Intelligence:** condensed to a single row.
- **FAQ:**
  - A sticky introduction with a support card.
  - Numbered accordion cards (`<details name="ai-faq">`, so only one is open at a time; the first starts open).
  - Six topics: what it does, availability, free tools, limits, social accounts, privacy. FAQPage structured data follows the new copy.

### Refinement QA

| Check | Result |
|---|---|
| Browser QA, production (`ai01`, updated for tabs, workspace and accordion) | **55 / 55**, no console errors |
| Tabs | Click and keyboard (Arrow, Home) filter to 3 / 6 / 13 tools |
| FAQ | First item open; opening one closes the others; all can collapse |
| Width 320, 375, 768, 1024, 1440 px × light/dark, landing and tool page | No horizontal overflow; 375 px runs with reduced motion |
| True dark theme (`ai01darkw`) | **15 / 15** |
| Visual review | Hero at 1440 / 1024 / 375 px; tools, workspace, how it works and FAQ at 1440 and 375 px; full page in light and dark; tool pages |
| Typecheck, ESLint, production build | Pass |
| Tests | 193 / 193 |
| Dashboard regression | AI Tools menu entry works |
