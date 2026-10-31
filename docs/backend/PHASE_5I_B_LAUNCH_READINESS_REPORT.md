# Phase 5I-B: Performance, UI/UX & Launch Readiness

Audit date: 2026-10-31. This builds on the Phase 5I-A security baseline (`PHASE_5I_A_SECURITY_REPORT.md`). Every measurement used a production build (`next build` + `next start`) on this machine, against **scratch databases only**. No external service was contacted, no payment was processed, nothing was published, and no real record, database or environment setting was changed.

## A. Executive summary

**Overall readiness:** the application is in good shape to enter Phase 6 under the conditions in section H. Confirmed defects found in this phase are fixed, re-measured and covered by tests:

- a performance bottleneck that grew with the ledger;
- the homepage's largest paint hidden behind an animation;
- colour contrast failing on every page in dark mode;
- a set of accessibility semantics defects;
- missing error boundaries.

**It is not approved for public launch or for any real integration.**

**Key improvements:**

| Area | Before | After |
|---|---|---|
| Admin Overview at scale (20k customers, 105k orders, 400k ledger lines) | ≈ 1.0 s per load, growing with the ledger | 0.2–0.4 s; the all-time ledger scan is gone (619 ms → 10 ms for that step) |
| Homepage Largest Contentful Paint (lab, desktop) | 1.57 s median (heading held invisible until JavaScript ran) | 0.36 s median, the same moment as first paint |
| Homepage layout shift (lab, 375 px, 4× CPU slowdown) | up to 0.201 (fails the 0.1 target) | 0 in all 5 runs |
| Automated accessibility (axe, WCAG 2.2 AA, 73 routes × light + dark) | 179 rule failures, 428 elements; colour contrast failed on all 73 routes | **0 violations on all 73 routes in both themes** |
| Content Security Policy | framing/plugins/base/form-action only | adds no inline event handlers, plus same-origin-only fetch, images, fonts, media, frames and workers. Verified in the browser, including attacks that are refused. |
| Request bodies | unbounded (5I-A H-02) | declared bodies over 1 MB refused with 413 before parsing |
| Error handling | Next.js default page for public/admin errors | branded, safe error boundaries for public pages, admin, dashboard and the root layout |
| Worker shutdown | could hang on a stuck job, or run twice | one shutdown, 30 s deadline, unhandled rejections logged |

**What could not be delivered as specified:** a nonce-based `script-src` policy. It was implemented and tested in a production build, and it **broke hydration on every session page**. Next.js 16 serves prerendered (PPR) shells under `cacheComponents`, and those can't carry a per-request nonce. Following the brief, it was not shipped; the evidence and options are in section D.

**Remaining launch blockers** are infrastructure and approvals, not application defects:

- managed backups with point-in-time recovery, and a restore drill;
- a trusted proxy with edge rate and body limits;
- the WIN1252 → UTF-8 database cutover;
- SSRF controls before any supplier adapter;
- monitoring and alerting.

All are listed in section H.

## B. Performance

### Method

- **Page sweep:** 73 routes (34 public sitemap URLs, 4 sign-in/sign-up pages, a 404, 21 customer pages, 13 admin pages). Each was loaded cold (fresh browser context) at 1440 px. The sweep recorded TTFB, Largest Contentful Paint, Cumulative Layout Shift and transferred (compressed) JavaScript.
- **These are lab numbers on localhost:** no network latency, no throttling unless stated. They show relative weight and regressions, not field Core Web Vitals.
- **Throttled probe:** a 4× CPU slowdown, 375 px probe for the homepage.
- **Load test:** a separate scratch database with 20,008 customers, 105,007 orders, 200,025 journal entries (400,050 lines), 200,016 audit rows and 5,001 tickets.
  - Rows were copied from the QA fixture, with triggers bypassed for this synthetic copy only, and timestamps spread over a year.
  - Each figure is the median of 5 warm calls of the real analytics functions.

### Baseline (before changes)

| Area | Routes | TTFB median (max) | LCP median (max) | CLS max | JS transferred median (max) |
|---|---|---|---|---|---|
| Public | 34 | 19 ms (912 ms, first request after start) | 308 ms (**2,312 ms**, homepage) | 0 | 289 KB (380 KB) |
| Sign-in / sign-up | 4 | 10 ms | 260 ms | 0 | 295 KB |
| Customer dashboard | 6 measured* | 8 ms (100 ms) | 248 ms (420 ms) | 0 | 392 KB (418 KB) |
| Admin | 13 | 5 ms (18 ms) | 188 ms (508 ms) | 0.054 | 372 KB (398 KB) |

\*The first baseline pass used a fixture customer whose email was unverified, so 15 customer pages measured the verification gate rather than the page. Those rows are excluded here; all 21 were re-measured in the final run.

**Load test, baseline:** Admin Overview 983 / 969 / 980 ms (7 / 30 / 90 days). Business report 969 / 1,051 ms. Financial report 902 / 884 ms. All three were nearly constant whatever the range: the signature of a full scan.

### Optimisations implemented

1. **Admin analytics no longer scan the whole ledger** (`src/server/payments/reconcile.ts`, `src/server/analytics/{overview,reports}.ts`).
   - **Problem:** Overview, Business and Financial called `financialSummary()`. Besides cheap reads of the maintained balances, it ran an all-time `count(distinct)` over every wallet ledger line, and on the load data that sort spilled to disk. The analytics pages never displayed those figures.
   - **Fix:** a new `balanceSummary()` returns only the balance-based fields. `financialSummary()` = `balanceSummary()` + movements, still used by payments reconciliation.
   - **No figure changed:** an integration test asserts the two return identical balance fields. This isn't a change to any financial policy or calculation.
   - **Before/after on the same data:** that step went from 619 ms to 10 ms.

   | Call (load data, median of 5) | Before | After |
   |---|---|---|
   | Admin Overview, 7 / 30 / 90 days | 983 / 969 / 980 ms | 213 / 215 / 374 ms |
   | Business report, 30 / 90 days | 969 / 1,051 ms | 213 / 364 ms |
   | Financial report, 30 / 90 days | 902 / 884 ms | 186 / 308 ms |
   | Orders report, 30 / 90 days | — | 16 / 149 ms |
   | CSV export, orders, 7 days (1,753 rows) | — | 13 ms |

   The "before" column was measured while the synthetic orders still shared one timestamp; the 619 → 10 ms isolation run used the final data.

2. **Homepage heading painted with the first HTML** (`src/components/site/hero.tsx`).
   - **Problem:** the `<h1>` and intro paragraph entered with `opacity: 0` and a blur until JavaScript ran. First paint happened at 388 ms, but the heading (the LCP element) appeared at about 1.6–1.9 s. That breaks the SEO standard "don't hide the LCP element behind an entrance animation".
   - **Fix:** they keep a small slide-in but are never hidden.

3. **Homepage layout shift on mobile:**
   - **Problem:** under CPU throttling the hero paints progressively as HTML streams in, growing 685 → 909 → 1,260 px. A decorative background blob anchored to the hero's bottom edge moved with every step, and it was the only shifting element.
   - **Fix:** it is now anchored to the top. No visible change.

### Final measurements

Final build, every route, median of **3** cold loads each, run one at a time with nothing else running (more robust than the single-load baseline):

| Area | Routes | TTFB median (max) | LCP median (max) | CLS max | JS transferred median (max) |
|---|---|---|---|---|---|
| Public | 34 | 9 ms (877 ms, see note) | 236 ms (1,148 ms, homepage) | 0 | 291 KB (382 KB) |
| Sign-in / sign-up | 4 | 10 ms | 192 ms | 0 | 297 KB |
| Customer dashboard | 21 | 6 ms (825 ms, see note) | 240 ms (1,060 ms) | 0.011 | 406 KB (478 KB, AI workspace) |
| Admin | 13 | 6 ms (10 ms) | 196 ms (468 ms) | 0.054 (Payments) | 375 KB (401 KB) |

**Note on the two TTFB outliers:**

- **`/`** was the first route of the run, so its 3 loads were the browser process's first navigations. With curl, `/` answers in 6–13 ms (5 requests). The dedicated homepage probe (5 cold loads, after warm-up) gives **TTFB 10 ms, first paint 356 ms, LCP 356 ms** (the hero heading).
- **`/dashboard/add-funds`** answers in 3–21 ms with curl (4 requests), and its 825 ms didn't recur.

**Homepage on a slow phone (lab: 375 px, 4× CPU slowdown, 5 cold loads):** LCP 864 ms (the intro paragraph) and **CLS 0 in every run**. The baseline was CLS up to 0.201.

**Customer pages:** the baseline couldn't measure most of them because of the fixture issue noted above. Their final numbers are healthy (LCP median 240 ms).

### Remaining bottlenecks (not changed, by design or for a later phase)

- **JavaScript weight:** about 290 KB compressed on public pages and 370–420 KB in the dashboards.
  - The animation library (`motion`, about 140 KB raw) loads on public pages. Its lighter loading mode would still need the full feature set, because `layout`/`layoutId` animations are used, so the saving is small.
  - Code-splitting the large dashboard client components is the larger, riskier lever. Recommended post-launch, with real-user INP data.
- **Ranged analytics queries grow with the selected period:** 90-day Overview is 374 ms at 105k orders. Indexes from 5H-A/5H-B are used.
  - If data grows by another order of magnitude, add daily roll-up tables or cache the series for about 60 s. Freshness is a product decision, so neither was done now.
- **Payments reconciliation (`financialSummary`) still runs the all-time movements scan.** That's correct for a reconciliation screen and job. At 400k lines it takes about 0.6 s.
- **Worker publishing/automation loops** process bounded batches item by item and deliberately re-validate each item. That isn't an N+1 problem worth changing.

## C. UI/UX & accessibility

### Areas reviewed

**Automated checks:**

- **Coverage:**
  - every public page in the sitemap;
  - the sign-in, sign-up and recovery pages;
  - the 404 page;
  - every customer dashboard section (Overview, New Order, Orders, Add Funds, Transactions, Service Finder, AI, AI usage/plans, Social and its sub-areas, Support, Referrals, Settings, Profile, Security);
  - every admin section (Overview, Services, Orders, Providers, Customers, Payments, Support, Referrals, AI, Reports, Settings, Staff, Account).
- **What ran on each route:**
  - axe-core 4.14 with WCAG 2.0/2.1/2.2 A/AA plus best-practice rules, at 1440 px in light **and** dark mode;
  - a horizontal-overflow check at 320, 375, 768, 1024 and 1440 px in light mode, and at 320–1024 px in dark mode;
  - console-error capture;
  - screenshots.

**Manual and scripted checks:**

- keyboard operation of the marketplace dialog (focus moves in, Escape closes, focus returns);
- skip links on the public site, dashboard and admin;
- visible focus indicators;
- reduced-motion behaviour;
- screenshot review at mobile and desktop in both themes.

### Issues fixed

| # | Problem (evidence) | Fix |
|---|---|---|
| 1 | **Dark-mode primary colour failed contrast everywhere** (73/73 routes). White on `#8562f2` was 4.18:1 (buttons, CTAs); `#8562f2` text on cards was 4.28:1 (links). No single violet passes both ways. | Dark tokens: `--primary #9277f4` with `--primary-foreground #14121f`. Button labels 5.43:1, violet text on cards 5.26:1 and on the page 5.62:1. Light mode unchanged (brand `#7047EB`, 5.5:1). **Visible change:** dark-mode primary buttons now have dark labels, the usual accessible dark-theme pattern. |
| 2 | 11 places hard-coded `text-white` on primary fills (social builder, calendar, studio, workspace preview, dashboard sidebar button) and would bypass the token | Switched to `text-primary-foreground`. The sidebar button's hard-coded hover colour became `hover:bg-primary/90`. |
| 3 | Sidebar section labels in both shells at 3.1–3.8:1 (`text-white/35`, `/40`) | `text-white/55`, about 5.8:1 |
| 4 | Count badges dimmed with `opacity-60` on already-muted text (2.5–3.2:1) in 9 components; the footer's "About · Soon" at 2.8:1 | Removed the extra dimming |
| 5 | Avatar initials white on a gradient ending at `#9b7bff` (3.15:1; axe can't measure gradients) | Gradient pinned to `#7047EB → #5A35D8` (5.5–7.2:1 in both themes) |
| 6 | **Label in name (WCAG 2.5.3):** <ul><li>marketplace service cards (`aria-label="View service: …"` hid the card's text)</li><li>AI hub tabs</li><li>both account-menu buttons</li><li>the admin logo</li></ul> | <ul><li>Cards are named by their content.</li><li>Tabs use "visible label: full tool name".</li><li>Menus append a screen-reader "Account menu" to the visible name.</li><li>The logo's name comes from its text, with an explicit label only when collapsed.</li></ul> |
| 7 | Two landmarks with the same name on the assistant tool pages | The chat region is named "Chat with {tool}" |
| 8 | Invalid `<dl>` on Admin › Orders (`<dt>/<dd>` inside buttons) | A labelled button group ("Filter by queue") |
| 9 | Two `<h1>`s on Admin › AI (the embedded diagnostics view had its own) | Demoted to `<h2>` |
| 10 | No error boundary for public or admin pages, no `global-error`. The dashboard boundary said "We couldn't load your overview" on every dashboard page. | Shared `ErrorState`: `app/error.tsx`, `app/global-error.tsx`, `app/admin/(panel)/error.tsx`, and corrected dashboard copy. They show only safe text and the opaque error reference (digest), never messages or stacks. |
| 11 | Homepage heading hidden until JavaScript ran, and a mobile layout shift | See section B |
| 12 | Light-mode red (`--destructive #d93d3d`) at 4.25–4.48:1. Affected danger text and outline buttons in Settings, Security, Admin › AI and Admin › Account. | `#c93232`: 5.0–5.3:1 on all light surfaces, and 5.27:1 with white on it. Dark mode unchanged (`#f06a6a` already passes). |
| 13 | New Order stepper: accessible names ("Step 2: Service") didn't contain the visible text | The visible number and label are the name; a screen-reader-only ", current step"/", completed" is added. On narrow screens the label is visually hidden but kept for screen readers (`max-md:sr-only` instead of `hidden`). |
| 14 | Admin sign-in page logo link labelled "SociVanta home" while showing "SociVanta Admin" | Named by its visible text, with a screen-reader-only ", home page" |
| 15 | Social calendar: other-month day numbers at 2.1–2.6:1 | Current-month days in the foreground colour, other-month days in the muted colour (≥ 4.5:1). They stay distinct. |

### Responsive coverage

**No horizontal overflow** on any of the 73 routes at 320, 375, 768, 1024 or 1440 px, in light or dark mode. That's 657 page loads per sweep, run before and after the changes.

Screenshots at 375 and 768 px (light) and 375 px (dark) were reviewed for the main areas. There's no clipping, and the mobile bottom navigation and top bars are intact.

### Accessibility checks that pass

- **Touch targets:** axe `target-size` (WCAG 2.2 2.5.8) found nothing on any route.
- **Skip links:** the first Tab shows a visible skip link on the public site, the dashboard and admin, and Enter moves focus into the main content.
- **Focus indicators:** visible on the focused control.
- **Reduced motion:** the marquee stops and the hero heading is fully visible.
- **Dialogs:** the marketplace dialog moves focus in, Escape closes it, and focus returns to the trigger.

### Outstanding limitations (honest list)

- **No screen-reader testing with real assistive technology** (NVDA, JAWS, VoiceOver, TalkBack). Automated rules and keyboard checks don't prove a good screen-reader experience.
- **Charts:** the admin and report charts have text labels, legends and tables for the same data (5H-A/5H-B), but their spoken experience wasn't tested with a screen reader.
- **Contrast on images, gradients and translucent overlays** can't be computed by axe. The avatar was checked by hand; other decorative overlays weren't exhaustively checked.
- **Translations:** dashboard copy in Arabic and Urdu (RTL) was out of scope for this audit's visual review.

## D. Security

### Content Security Policy: what was attempted

The brief asked for a nonce-based `script-src`. It was implemented in `src/proxy.ts` (a fresh nonce per request, `'strict-dynamic'`, the nonce forwarded to Next.js through the request CSP header) and tested on a production build:

- **The nonce reached only dynamically streamed scripts.** The framework's own `<script>` tags in the **prerendered PPR shell** had no nonce. Every session page (`/login`, `/register`, `/dashboard/*`, `/admin/*`) is partially prerendered under `cacheComponents`.
- **Result:** the browser blocked the framework chunks, and hydration failed on all 14 pages tested (20 of 25 checks failed). The theme script was blocked too.
- **Cause:** Next.js documents nonces as requiring fully dynamic rendering and as incompatible with Partial Prerendering. Its code applies the nonce only in the dynamic render path.

**Options, none taken in a hardening phase:**

- **Turn off `cacheComponents` and render every page dynamically.** This is a major architecture change: no static public pages, no CDN caching, slower pages and higher server cost, and broad code changes.
- **Hashes of every inline script in every prerendered shell**, served per route by the proxy from a build-time manifest. This is technically possible but fragile, and isn't supported by the framework.
- **Next.js's experimental Subresource Integrity.** It covers external scripts only, not the inline bootstrap scripts.

**Decision:** the nonce code was removed rather than shipped broken. This is a documented blocker for a strict `script-src`.

### What shipped

The policy is static, applied to every response from `next.config.ts`, and exported as `CONTENT_SECURITY_POLICY`:

```
frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';
script-src-attr 'none'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self';
media-src 'self'; frame-src 'none'; worker-src 'self' blob:; manifest-src 'self'
```

- **`script-src-attr 'none'`** blocks injected inline event handlers (`<img onerror=…>` and the like).
- **The same-origin directives** mean injected code can't send data to, or load content from, another site.
- **No `script-src` exists,** so nothing adds `'unsafe-inline'` or `'unsafe-eval'`; inline `<script>` elements are as before.
- **Development builds** add `ws:` to `connect-src` for hot reload.
- **No `upgrade-insecure-requests`:** HSTS already enforces HTTPS in production, and the directive would break plain-HTTP origins.
- **Unchanged since 5I-A:** `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `COOP` and production HSTS.

**Verification:**

- **Rendered HTML:** contains no inline handlers, no `javascript:` URLs and no cross-origin loads.
- **Unit tests** in `tests/unit/security.test.ts`:
  - the directives, with no unsafe keywords;
  - that every response carries the policy;
  - the 1 MB body cap.
- **Browser check, 28/28 passing on a production build:**
  - 17 public, sign-in, customer and admin pages load and hydrate with **zero violations**;
  - the dark theme script runs;
  - the sign-in server action, client-side navigation and admin report fetches work.
- **Negative controls, all refused:**
  - an injected `onerror` handler doesn't run;
  - `fetch()` and an image beacon to `csp-test.invalid` (a name that never resolves) are refused and reported.

### Request size (5I-A H-02)

`route()` now refuses any request whose `Content-Length` exceeds 1 MB with `413 PAYLOAD_TOO_LARGE`, before the handler reads the body. That covers all 98 route files that use it; the remaining one, the OAuth callback, is GET-only and reads no body.

Bodies sent chunked, without a length, are still only bounded by a reverse-proxy limit, which remains an infrastructure requirement.

### Phase 5I-A conditions

| # | Condition | Status after 5I-B |
|---|---|---|
| 1 | Managed PostgreSQL backups + point-in-time recovery | **Open** (infrastructure). Not configurable from the app. |
| 2 | Successful restore test | **Open.** No `pg_dump`/`pg_restore` is available locally. A drill is needed on the managed service. |
| 3 | Trusted proxy (`TRUST_PROXY_HEADERS=true`) + public/auth rate limiting | **Open** (infrastructure). The app-level limiters exist; no edge limits exist yet. |
| 4 | Request-size limits | **Partly done:** application cap for declared sizes (above). The proxy limit is still required. |
| 5 | Controlled WIN1252 → UTF-8 database migration | **Open; needs your approval.** Plan in the 5I-A report, section D. Not performed. |
| 6 | SSRF protections before supplier adapters | **Open; not yet needed.** No adapter is registered (asserted by test). Required before enabling any supplier. |

### Unresolved risks

- **No `script-src` restriction:** if an XSS sink were introduced, injected `<script>` elements could still run. Mitigations:
  - React escaping and the JSON-LD escaping tested in 5I-A;
  - no inline handlers;
  - no exfiltration to other origins;
  - httpOnly session cookies.
- The rest are in the table above.

## E. SEO / AEO / GEO

### Crawl results

The crawl ran on a production build with `APP_URL=https://www.socivanta.example`, the same origin served at runtime. It reads raw HTML without JavaScript: **225 checks passed, 0 failed.** It covers:

- **Metadata:** unique titles and descriptions; canonicals matching sitemap URLs; no `localhost` anywhere in HTML, canonicals, Open Graph or JSON-LD.
- **Sitemap and robots:** `sitemap.xml` has 34 canonical URLs on the configured origin, with no noindex pages; `robots.txt` disallows the private areas and gives an absolute sitemap URL.
- **Structured data:** JSON-LD parses, with no ratings, reviews or invented offers. Homepage: Organization + WebSite. AI hub: CollectionPage + ItemList.
- **Pages and errors:** Open Graph images return 200 PNG; unknown pages and tools return real 404s (branded and noindex); there's no empty or generic link text, and every image has alt text.
- **Content:**
  - guide content is server-rendered and gives direct answers;
  - availability is honest ("coming soon", no live claims, no statistics);
  - each tool's FAQ works with the keyboard;
  - contextual links connect related tools.

### Indexability of private pages

Verified for signed-in sessions, not only anonymous ones.

- `/dashboard`, `/dashboard/orders`, `/admin` and `/admin/reports` send `X-Robots-Tag: noindex, nofollow` and `Cache-Control: private, no-store`.
- `/login`, `/register` and `/admin/login` carry a robots `noindex` meta tag.
- Anonymous requests to `/dashboard` and `/admin` redirect to sign-in.
- `robots.txt` disallows `/dashboard`, `/admin`, `/api/` and `/dev/`.

### Metadata and schema issues and fixes

No metadata or schema defects were found in this phase. The changes that affect search and AI readability are the homepage LCP fix (the heading now paints immediately) and the accessibility semantics fixes in section C: names, landmarks and heading order. Real-user Core Web Vitals can only be confirmed after launch.

**Content honesty:** no claims were added or changed. Availability text still comes from server state (5G/SEO-01 standards).

## F. Reliability

### Checks performed

| Area | Finding |
|---|---|
| Health/readiness | `GET /api/health` checks configuration validity and a database ping (bounded by the 5 s connect timeout). It returns 200 or 503, sends `no-store`, and exposes no versions, hosts or secrets (verified in the journey script). It's a readiness probe; use the same endpoint, or a TCP check, for liveness. |
| Worker | <ul><li>**Previously:** a second signal started a second shutdown, and a stuck job could keep the process alive forever.</li><li>**Now:** one shutdown with a 30 s hard deadline (pg-boss gets 25 s to finish gracefully; unfinished jobs are retried after their lease expires). Shutdown errors and unhandled rejections are logged.</li></ul> |
| Jobs | pg-boss queues have retry limits with backoff and expiry. Recurring jobs are queued once per time bucket (`singletonKey`), so multiple workers don't duplicate them. Disabled jobs are refused at enqueue. |
| Error boundaries | Branded, safe boundaries for public pages, admin, dashboard and the root layout (section C). Server errors are logged with a request id; the client sees only a generic message and a reference. |
| Database | Statement (30 s) and idle-in-transaction (60 s) timeouts from 5I-A are verified by tests. Pool errors are logged without crashing. |
| Logging | Secret redaction and connection-string scrubbing are covered by 5I-A unit tests. No new log statements in this phase print request bodies or values. |
| Audit integrity | Append-only, trigger-enforced history (5I-A). Unchanged. |
| Configuration | Strict environment validation in production (5I-A). Invalid configuration makes `/api/health` report `config: invalid` (503). |
| Unavailable integrations | Payments webhooks return 503 `FEATURE_DISABLED`. No supplier adapters are registered. AI generation is off and social publishing has no adapters, so the corresponding pages state this (verified in the journey script). |

### Monitoring and alerting (required before launch; not configured, and not claimed)

- **Uptime:**
  - on `/api/health` from outside the network, alerting on 503 or a timeout for 2 minutes or longer;
  - a separate heartbeat for the worker, which has no HTTP endpoint. Alert if the `audit/reconcile` scheduled jobs stop completing.
- **Errors:** log aggregation with alerts on `level >= error`, on `unhandled error` and on `request refused` bursts (5xx rate), keyed by request id.
- **Database:** CPU, connections (pool `max` × instances), slow queries over 1 s, replication/backup status, storage.
- **Business safety:** alert if reconciliation reports exceptions, or if `journal_entries` with `kind = reward_credit` ever appear while rewards are disabled.
- **Edge:** rate-limit hits, 413s and 429s from the proxy.

### Infrastructure dependencies

- **PostgreSQL (managed):** UTF-8, backups and PITR.
- **Reverse proxy or CDN:** TLS, HSTS preload is optional, `X-Forwarded-For` trusted only from the proxy, rate limits, and a body limit of 1 MB or less.
- **One or more web instances** plus **one or more worker processes:** both need `DATABASE_URL` and the secrets.
- **Transactional email provider** before account emails can reach real users. Development uses the in-app mailbox.

## G. Testing

### Automated

| Check | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | Pass |
| Lint (`eslint src tests`) | Pass: 0 errors, 0 warnings |
| Production build (`next build`) | Pass (normal build, and again with `APP_URL=https://www.socivanta.example`) |
| Vitest: full suite | **548 / 548** passed in 49 files (203 unit), up from 543 in 5I-A |
| `npm audit --omit=dev` | **0 vulnerabilities** |

**New regression tests:**

- `tests/unit/security.test.ts` (+4):
  - CSP: no inline handlers, same-origin-only directives;
  - CSP: no unsafe keywords and no `script-src`;
  - CSP: every response carries the policy;
  - the 1 MB body cap returns 413 before the handler runs.
- `tests/integration/overview.test.ts` (+1): `balanceSummary` equals the balance fields of `financialSummary`, and reconciliation still gets the movements.

### Browser (production build, scratch database, Microsoft Edge via Playwright)

| Suite | Result |
|---|---|
| Audit sweep, baseline: 73 routes × axe (light + dark) + overflow at 5 widths (light) and 4 widths (dark) | 179 axe rule failures (428 elements), 0 overflow, 0 console errors |
| Audit sweep, final: same routes and checks | **0 axe violations, 0 overflow, 0 console errors** on all 73 routes. Ran in parallel shards, then re-checked the 8 routes changed afterwards. |
| CSP verification | **28 / 28** (17 pages with zero violations and confirmed hydration, 3 attack controls refused, server action, client navigation, admin fetches, other headers) |
| End-to-end journeys and accessibility | **43 / 43** (list below) |
| SEO crawl (stand-in production origin) | **225 / 225** |
| Performance pass | 72 routes × 3 cold loads; homepage probes 5 × desktop and 5 × throttled mobile |
| Load test (analytics at scale) | 18 timed calls, median of 5 each, before and after |

**Journey coverage (43 checks):**

- **Marketplace:** service discovery, the details dialog by keyboard (focus moves in, Escape closes, focus returns), and honest availability.
- **Registration from a referral link:** "Check your email" confirmation; the account is stored unverified; attribution happens on the server and is not qualified; no reward entry exists.
- **Ordering:** an unverified service shows "Ordering opens …" and has no enabled purchase button.
- **Add Funds:** choosing a coin and network (keyboard radios) shows *"No payment processor has been approved … A deposit request isn't a payment"*, and the request can't be submitted.
- **Help and support:** Help Center search; a customer opens a support ticket, which is stored. The support safeguard also refused a subject containing a long digit run as a possible card number or code, as intended.
- **Referrals:** the page shows the real code and "Rewards coming soon".
- **AI and social:** the AI tool page says generation isn't live; the social accounts page shows connections aren't available.
- **Permissions:** the Support role reaches Support, sees "You don't have access to this area" on Payments, and gets 403 from the financial export API.
- **Keyboard and motion:** skip links and focus indicators on the public site, dashboard and admin; reduced motion is respected.
- **Indexability and health:**
  - noindex and `no-store` on 7 private and credential pages;
  - `/api/health` returns 200 with no internals.

### Skipped or unavailable

- **Backup/restore:** no `pg_dump` available locally; carried over from 5I-A.
- **Screen readers:** no testing with real assistive technology.
- **Field Core Web Vitals:** there's no production traffic; only lab numbers on localhost without network latency.
- **Lighthouse:** not installed. Lab metrics were collected with the browser's Performance APIs instead.
- **External services:** no test touched a real provider, processor, social platform or AI model, by instruction.
- **Edge rate limits, WAF and proxy body limits:** they don't exist yet, so they couldn't be tested.

### Reproducing the evidence

The browser scripts used are kept outside the repository, in this session's scratchpad: `audit5ib.mjs`, `perf5ib.mjs`, `csp5ib.mjs`, `e2e5ib.mjs`, `lcp5ib.mjs` and `cls5ib.mjs`.

Each runs against `next start` with a scratch database seeded by a temporary fixture. That fixture created 8 customers, 7 orders, a ticket, a referral, and owner, support and customer sessions; it was deleted afterwards.

The load-test database was built by copying the fixture's rows at scale, with triggers bypassed for that synthetic copy only. Both scratch databases were dropped afterwards, and `socivanta_dev` / `socivanta_dev_utf8` were not touched.

Rerun the repository tests with:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `next build`

## H. Production launch checklist

**Application blockers:** none open. Items to repeat at launch:

1. [ ] Re-run the full suite, the production build, the SEO crawl (with the real `APP_URL`) and the CSP browser check on the release candidate.
2. [ ] Re-verify that real-user Core Web Vitals meet the targets in `SEO_STANDARDS.md` after launch, since the numbers here are lab numbers.

**Infrastructure blockers:**

1. [ ] Managed PostgreSQL (UTF-8) with daily snapshots and point-in-time recovery, encrypted at rest.
2. [ ] Restore drill: restore into a scratch instance, run the migration check and reconciliation, and compare ledger totals.
3. [ ] **UTF-8 cutover**, with your approval (`npm run db:utf8-copy -- --replace`, then you update `DATABASE_URL`). The old database is kept for rollback.
4. [ ] Reverse proxy: TLS, `TRUST_PROXY_HEADERS=true`, edge rate limits on `/login`, `/register`, `/forgot-password`, `/api/ai/*`, `/api/catalog/*` and search, and a request-body limit of 1 MB or less.
5. [ ] Monitoring and alerting as in section F, including the worker heartbeat.
6. [ ] Production secrets generated (`npm run auth:secrets`) and stored in the platform's secret store, never in files. Owner bootstrapped with MFA.
7. [ ] Transactional email configured and tested (verification and password reset).

**External integration approvals** (each needs explicit approval; all are off today):

1. [ ] **Payments:** processor contract, webhook secret, live test in the processor's sandbox, then enable.
2. [ ] **Supplier/fulfilment:** SSRF controls (allow-list, or blocking private, link-local and metadata ranges after DNS resolution) **before** registering any adapter. Supplier verification, then per-service eligibility.
3. [ ] **AI generation:** provider key, priced model, daily budget, the live provider test (AI Control Center), then the launch switch.
4. [ ] **Social publishing:** each platform's app review and OAuth credentials, then adapters.
5. [ ] **Referral rewards:** approved rules and policy. The database guard (SV014) stays until then.

**Optional post-launch improvements:**

1. [ ] Strict `script-src`. Revisit when Next.js supports nonces or hashes with Partial Prerendering, or consider a per-route hash manifest.
2. [ ] Code-split the largest dashboard client components. Measure INP in the field first.
3. [ ] Daily roll-ups or short-lived caching for long-range analytics, if data grows by another order of magnitude.
4. [ ] Screen-reader testing (NVDA plus VoiceOver) of ordering, support and reports.
5. [ ] Dependency majors for dev tooling (the 25 dev-only advisories from 5I-A).

## I. Final readiness decision

**READY FOR PHASE 6 — WITH CONDITIONS**

- **No application issues block the move to Phase 6.** Every confirmed defect found in this audit is fixed and verified, and the business safeguards are intact:
  - the 118 services, pricing and eligibility;
  - orders, wallet, ledger and revenue recognition;
  - fulfilment safety;
  - AI-01 to AI-09;
  - social publishing safeguards;
  - support and referral rules;
  - RBAC and authentication.
- **The conditions** are the infrastructure blockers and integration approvals in section H, and the documented CSP limitation in section D.
- **This decision is not approval for a public launch or for any real integration.** Real payments, AI generation, supplier fulfilment, social publishing and monetary rewards remain disabled. Each needs its own explicit approval and the launch checks above.
