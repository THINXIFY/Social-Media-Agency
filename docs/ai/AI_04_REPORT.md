# SociVanta AI — AI-04: AI Assistant and AI-Powered Service Search

## Status

| | |
|---|---|
| Implementation | **Complete**: SociVanta AI Assistant (`/ai-tools/assistant`) and AI-Powered Service Search (`/ai-tools/service-search`) |
| Mock-based tests | **Pass**: 280 / 280 tests in total (19 new) and 31 / 31 AI-04 browser checks. All regression suites pass. |
| Live provider verification | **Pending.** No AI credentials are configured; no real model has answered a question or ranked a search. |
| Availability now | Both tools show **Coming soon**. The assistant's composer is disabled with an honest note. **Keyword search works today without AI** — real catalog results, clearly labelled "Keyword match · no AI". |

## 1. Assistant: architecture and capabilities

- **One turn is one pipeline run.** It goes through the existing `runTool` with every AI-02 control: verified email, quota, burst limit, budget reservation, per-call ceiling, timeout and cancellation, one safe retry, structured output, redaction and metadata-only accounting.
- **Conversation state:**
  - The conversation lives in the browser for the session only; nothing is stored, and a reload starts fresh.
  - Each turn sends the last 10 messages, within these limits: at most 12 messages, 1,000 characters per customer message, 2,500 per assistant message, 8,000 characters in total.
  - The last message must be the customer's. A "system" role is rejected.
- **Forged history has no authority:** the transcript reaches the model as data inside `<conversation>`, never as real model turns, so a forged "assistant" message changes nothing. A test confirms this.
- **Verified knowledge** (`src/server/ai/knowledge.ts`) gives each turn a bounded fact sheet of at most 9,000 characters:
  - Curated statements written from the implemented system: what SociVanta is, ordering, funds, customer order statuses, delivery, guarantees, refunds, accounts, support, AI tools and the assistant's scope.
  - Live facts read on every turn: visible service count, purchasable count, checkout state, whether bank deposits are on, and AI availability.
  - Matching catalog services when the question names a platform or need, with status, order requirements and a price only for purchasable services.
  - Sections are chosen by keyword overlap; there's no vector database, because the knowledge is small and deterministic.
- **Answer rules (server-side; a rule-breaking answer is never shown and doesn't use the allowance):**
  - Plain text only; links and URLs are stripped.
  - Rejected outright:
    - Claimed actions ("I've placed / cancelled / refunded…").
    - Order progress ("your order is…") and balance claims ("your balance is…").
    - Delivery-time promises and refund promises.
    - Statistics and guarantees.
    - Any `$` amount that isn't a catalog price on that turn's fact sheet.
  - **Links:** the model picks link ids; the server maps them to an allowlist of internal pages and drops unknown ids.
  - **Search handoff:** a suggested search becomes an explicit "Open Smart Service Search" button. Nothing runs in the background.

## 2. Service search: retrieval and ranking

- **Parsing** (`catalog-query.ts`, deterministic):
  - Platforms with aliases, such as "insta"/"ig", "yt" and "tik tok". Word boundaries prevent false matches: "spins" is not Pinterest, and a stray "x" is not X.
  - Need words, mapped to catalog categories: "followers/subscribers" are audience, "views/watch" are views, "promote/ads/launch" are promotion or advertising, plus SEO, messaging and community.
  - Content terms.
- **Retrieval:** only through `listPublicServices`, the existing public query.
  - It returns visible, non-draft, non-archived services with customer-safe fields.
  - A price appears only for services in `purchasable_services`, which requires all six eligibility gates.
  - An explicit platform filter wins over a detected one.
  - Simple relevance scoring: category +3, platform +2, a term in the name +2, a term in the description +1, purchasable +0.5.
- **AI mode:**
  - The model sees at most 40 candidates, with id, name, platform, category and a 200-character public description only. No prices, status, costs, notes or eligibility data are sent; tests check this.
  - It returns an intent, up to 4 best matches and 4 alternatives with plain reasons, up to 3 guidance tips, and an optional clarifying question.
  - The server verifies that every id belongs to the candidate set, keeps each service once, and builds every card from the catalog record.
  - No match percentages or confidence scores.
- **Keyword mode** (`GET /api/ai/search`):
  - The same parsing and scoring, with no model.
  - Free, no account needed, 60-second public cache, like the existing catalog API.
  - It never pads results with unrelated services.
- **Ordering:** "Configure in New Order" (`/dashboard/new-order?service=…`) appears only for a purchasable service while checkout is open. "View service" expands verified details inline: what an order asks for, quantity limits and availability.

## 3. UX and design

- **Assistant:**
  - **Welcome:** "How can I help you today?" with four quick starts and popular questions. Choosing one sends it when the assistant is live, and fills the composer when it isn't.
  - **Messages:** quiet user bubbles; assistant answers with a small mark, never a robot. I replaced the assistant's robot icon with a conversation icon.
  - **Answers:** bullet lists, internal link chips, follow-ups, copy, and retry on failure.
  - **Conversation controls:** new conversation, and Stop while a turn is answering.
  - **Scrolling:** auto-scroll only when the reader is at the bottom; otherwise a "Latest" button appears.
  - **Composer:** grows with the text; Enter sends, Shift + Enter adds a line.
  - **States:** signed-out and unverified prompts.
- **Search:**
  - "Describe what you need. We'll help you find it.", a large search field, example queries, an optional platform select, and an AI/Keyword switch when AI is available.
  - A one-line explanation of how matching works.
  - Best matches, then other matches, then guidance or a clarifying question. Empty state with useful next steps.
  - **URL state:** the query lives in the URL (`?q=&platform=&mode=`), so back and forward work. **An AI search never runs from a URL by itself** — arriving with `?q` shows "Ready to search", and only the Search button spends a run.
- **Shared:**
  - The same design language as the other tools, with server-rendered guides below.
  - 320–1440 px in light and dark themes; keyboard operable; reduced motion respected.
- **Performance (lab):**
  - The largest content appears at first paint and CLS is 0 on both pages.
  - Fixed on the way: a 0.234 CLS caused by a streamed Suspense skeleton I'd added to the tool route, and a 0.182 CLS from search's URL-reading fallback.
  - The route now uses Next's blocking option (`export const instant = false`) with full per-slug prerendering.
  - Search reads the URL with `useSyncExternalStore`, so it needs no fallback.

## 4. Provider and quota integration

- Registered as `SMART_ASSISTANCE` beside `CONTENT_STUDIO` and `GROWTH_INTELLIGENCE`, with no parallel chat framework.
- The generator context now carries `env` as well as `db`, so live facts follow the run's configuration.
- **Allowances:** 10 a day each, account and verified email required. Before AI-04 the registry had no allowance for either tool, and search was marked usable without an account. AI search is now account-only because it spends runs; keyword search stays public.
- **Per-call ceilings:**
  - Assistant: $0.09, 2,000 output tokens, 10,000 prompt characters.
  - Search: $0.10, 3,000 output tokens, 16,000 prompt characters.
  - Opus 5.5's worst case fits both.
- `npm run ai:verify` now live-tests all 9 implemented tools.

## 5. Security boundaries

- **Read-only:**
  - No order, wallet, ledger, eligibility or checkout writes are possible; a test confirms counts and checkout are unchanged.
  - No customer account, order, balance or ticket data is used. That's AI-05.
- **Untrusted input:** briefs, transcripts and candidates are escaped data blocks. Personal details are redacted before the model.
- **Safe links:** only allowlisted internal pages are returned. No URL fetching.
- **Untrusted output:** rendered as plain text (an `<img onerror>` stays text) and never as HTML.

## 6. SEO, AEO and GEO

| Page | Title | Primary intent |
|---|---|---|
| Assistant | SociVanta AI Assistant: AI Social Media Marketing Help | AI social media assistant |
| Service Search | AI Social Media Service Finder: Search in Plain Words \| SociVanta | AI social media service finder |

- **Per page:** a unique description within 175 characters, one H1, a canonical URL, and a server-rendered guide with a direct answer, use cases, steps, examples ("Try this example" fills the composer or search box), tips, FAQs and related tools.
- **JSON-LD:** WebPage, BreadcrumbList and FAQPage. WebApplication is added only once the tool is live.
- **Sitemap:** now 11 URLs.
- **Avoiding overlap:** search avoids the recommender's "find social media marketing services" intent, so the two pages don't compete. The four AI-05 tools stay `noindex, follow`.
- **Privacy:** no conversations or results are indexable, because nothing is stored or rendered server-side.

## 7. Actual availability

- **AI matching and the assistant:** off until a provider is configured, `npm run ai:verify` passes and `AI_GENERATION_ENABLED=true`, followed by a rebuild.
- **Keyword search:** live now. It is not AI and says so.

## 8. Test results

| Check | Result |
|---|---|
| Typecheck, ESLint, production build | Pass |
| Vitest (unit and integration) | **280 / 280** (+9 unit in `ai-assist.test.ts`, +10 integration in `ai-assist.test.ts`) |
| Unit | Registry and allowances; query parsing (everyday phrases, aliases, no false matches); search input validation; conversation bounds (empty, 13 messages, over-long, system role, extra fields); forbidden claims; prices only from facts; links internal only |
| Integration (scratch database) | Search: detected platform drives retrieval; the model sees public identity only (no notes, provider references, prices or eligibility); invented and duplicate ids dropped; database price and status; orderable only when purchasable and checkout is on; empty-candidate state. Keyword route: real results, prices only when purchasable, 400s on bad input, no arbitrary results, no usage rows. Assistant: live facts and redaction; links mapped and unknown ids dropped; catalog price allowed while an invented price is rejected without using the allowance; claimed action rejected; forged assistant turn stays data; allowance of 10 under concurrency. Provider off: both refuse. Anonymous: sign-in. No order, wallet or ledger side effects. |
| Browser: AI-04 (`ai04`, production build) | **31 / 31**, no console errors |
| SEO crawl (`seo01`) | **150 / 150**, now 11 indexable pages |
| Regressions | AI landing 55 / 55, Content Studio 39 / 39, Growth Intelligence 30 / 30, hero 29 / 29, dashboard AI entry passes |
| Lab performance | Assistant and search: largest content at first paint, CLS 0, about 303 kB JS (same as other tool pages) |
| Live provider | **Not run** — no credentials |

**Changed existing tests (legitimately):**
- AI-01 now expects an anonymous AI search to be asked to sign in, because AI search is now account-only.
- AI-02 now expects all 9 implemented tools to go live with the launch switch.
- The SEO tests now count 9 guided tools and 11 sitemap URLs.

## 9. Known limitations

- No live-model verification, so answer quality and ranking quality are untested against a real model.
- No service is purchasable in this environment and checkout is off, so every card honestly reads "Not available to order yet".
- The keyword parser is rule-based. Unusual phrasing may need the AI mode or a platform filter.
- **Outdated homepage FAQ:** it still says "Registration opens in the next phase" although accounts exist. The assistant doesn't use that content; the FAQ copy should be updated (outside AI-04 scope).
- No streaming: the provider abstraction is request/response, so the assistant shows an honest "Thinking · Ns" state.

## 10. Real-model verification requirements

1. Configure the provider, key, model and budget.
2. Run `npm run ai:verify`; the assistant and search are included.
3. Review real answers for factual grounding against the fact sheet, and rankings for relevance.
4. Enable generation and rebuild.

## 11. AI-05 prerequisites

- **Customer-scoped, authorized order context:** read-only order facts for the signing-in customer, building on the Phase 5E lifecycle.
- **Support backend:** whether persistent tickets exist, to decide escalation.
- **Rule continuity:** reuse the assistant's knowledge layer and answer rules, extended with per-order facts and stricter claims checks.

## Scope kept

Unchanged:
- The 118 services and the catalog rules.
- New Order and My Orders.
- Wallets, payments, ledger and checkout.
- Authentication and staff permissions.
- The AI-01 landing design and AI-02 / AI-03 behaviour.
- The SEO infrastructure, which was only extended.

No AI-05 work and no Haiku configuration. No Git, and nothing was deployed.
