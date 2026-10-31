# AI-06: Social Account Connections & Unified Social Dashboard

**Status:** implemented and tested. **No platform can be connected yet.** No OAuth credentials or platform app approvals were provided, so every platform shows *Awaiting approval* and every Connect button is disabled, with the reason given on the page. No real connection or social account has been made, and no figure has been shown that didn't come from a platform.

## 1. Landing page and routes

| Route | What it is | Indexing |
|---|---|---|
| `/social-management` | Public landing page (static, server-rendered) | Indexable, canonical, in the sitemap |
| `/social-management/opengraph-image` | Image for social sharing | — |
| `/dashboard/social` | Workspace overview | Private, noindex (dashboard layout and proxy) |
| `/dashboard/social/accounts` | My social accounts. `?account=<id>` opens the details drawer; `?result=` shows the outcome of a connection attempt | Private, noindex |
| `/dashboard/social/activity` | Connection and refresh history | Private, noindex |
| `POST /api/social/connect/[provider]` | Starts an OAuth authorization and returns the platform's sign-in URL | Private, same-origin only |
| `GET /api/social/callback/[provider]` | OAuth redirect target | Private |
| `POST /api/social/accounts/[id]/sync` | Manual refresh | Private, same-origin only |
| `DELETE /api/social/accounts/[id]` | Disconnect | Private, same-origin only |

**Landing page sections:**
1. **Hero:** "Your social media. One smarter workspace." It has a single labelled *Preview* of the workspace, with placeholder names and shimmering placeholders instead of figures.
2. **Platforms:** six platforms, each showing its real status, plus a planned group (Threads, Pinterest) and a not-supported group (WhatsApp, Telegram).
3. **One workspace:** a dark section that combines the features with a preview of the account-details drawer.
4. **How connections work:** Connect → Authorize → Manage.
5. **Security & privacy.**
6. **FAQ:** seven questions.
7. **Final call to action.**

Scheduling and publishing are described only as "not in this release".

**Navigation:**
- The dashboard sidebar has one small **SociVanta AI** group containing a single **Social accounts** item.
- On mobile it appears under **More**.
- The Social area has its own Overview / Accounts / Activity tabs.
- The site footer links to Social Management.
- The SMM navigation and business logic are unchanged.

## 2. Dashboard and account UX

- **Overview, no accounts:** a designed empty state with:
  - the three connection steps;
  - "What each platform shares", showing each platform's status;
  - "Never, on any platform".

  There are no KPI cards and no placeholder figures.
- **Overview, with accounts:**
  - a one-line summary (accounts, how many need attention, last refresh);
  - a *Needs your attention* list that states the exact fix;
  - account cards showing real figures only;
  - recent activity.
- **My accounts:**
  - connected account cards, and a card for each platform with its capabilities and Connect state;
  - when no platform is available, one shared explanation instead of six repeated ones;
  - a banner after every OAuth return: connected, reconnected, cancelled, expired link, already linked elsewhere, no account shared, unavailable, or failed.
- **Connect flow:** Choose platform → Review permissions → Authorize → Connected, shown as a stepper in a dialog. The dialog lists:
  - each permission, with the reason SociVanta needs it;
  - what SociVanta never does;
  - account requirements (for example, Instagram needs a professional account);
  - how long access lasts.

  SociVanta never asks for a password.
- **Account details drawer:**
  - health and the recovery step;
  - *Account insights*, exactly as the platform reported them, with the time of the last refresh. A figure the platform withheld is named as missing, not shown as zero.
  - read-only permissions;
  - connection history;
  - Refresh, Reconnect and Disconnect, with confirmation before disconnecting.
- **Activity:** real events grouped by day and filterable by platform, including failures. Messages are plain language and never include credentials or raw responses from the platform.

## 3. Provider architecture

| Part | Files |
|---|---|
| Client-safe registry | `src/lib/social/platforms.ts`: capability matrix, permission copy, revocation support, renewal, view types |
| Adapters | `src/server/social/providers.ts`: one OAuth 2.0 authorization-code engine plus a small declarative adapter per platform |
| HTTP client | `src/server/social/http.ts`: bounded retries |
| Service | `src/server/social/service.ts`: availability, start, callback, sync, disconnect, events, views |
| Database | `drizzle/0007_social_connections.sql` (rollback in `drizzle/rollback/`). Tables: `social_oauth_states`, `social_connections`, `social_events` |

**What each adapter declares:**
- endpoints;
- minimal read-only scopes;
- PKCE support;
- client authentication style;
- optional long-lived token exchange, refresh and revoke;
- one function that maps the platform's official profile response to accounts.

**Sync interface:** `syncConnection` is the only way to refresh. It runs only when the customer asks, with a 5-minute cooldown per account. There is no background polling.

| Platform | Official API | Scopes | PKCE | Refresh | Revoke on disconnect | Reads |
|---|---|---|---|---|---|---|
| Instagram | Instagram API with Instagram Login | `instagram_business_basic` | — | Long-lived token renewal | No (manual) | Profile, followers, posts |
| Facebook | Facebook Login for Pages (Graph v23.0) | `pages_show_list`, `pages_read_engagement` | — | Page tokens don't expire | No (shared grant, manual) | Each Page: name, followers |
| TikTok | Login Kit v2 | `user.info.basic`, `user.info.profile`, `user.info.stats` | — | Yes | Yes | Profile, followers, videos |
| YouTube | Google OAuth + YouTube Data API v3 | `youtube.readonly` | S256 | Yes (offline) | Yes | Channel, subscribers, videos, views |
| X | X API v2 OAuth 2.0 | `users.read`, `tweet.read`, `offline.access` | S256 (required) | Yes | Yes | Profile, followers, posts |
| LinkedIn | Sign In with LinkedIn (OIDC) | `openid`, `profile` | — | No (reconnect after ~60 days) | No (manual) | Name only |

None of these scopes allows posting, messaging, editing, uploading or advertising, and a unit test enforces that.

**Before switching any platform on:** endpoints and scopes follow each platform's documentation as written. They have only been exercised against mocked responses, so they must be re-checked against the platform's current docs and a real test app.

## 4. Actual versus unavailable integrations

- **Live:** none.
- **Integration-ready, awaiting credentials and platform approval:** all six adapters above. They are mock-tested only.
- **Planned, not built:** Threads, Pinterest.
- **Not supported:** WhatsApp, Telegram.

**What a platform needs before it becomes connectable** (all three are required):
1. The platform is listed in `SOCIAL_PROVIDERS_ENABLED`. The operator confirms by doing this that the app review is complete.
2. `SOCIAL_<PLATFORM>_CLIENT_ID` and `SOCIAL_<PLATFORM>_CLIENT_SECRET` are set.
3. `AUTH_SECRET` and `DATA_ENCRYPTION_KEY` are set, so tokens can be encrypted.

The redirect URI to register with each platform is exactly `<APP_URL>/api/social/callback/<platform>`.

The landing page is static, so **rebuild it after switching a platform on**. Its status labels and the "Can I connect today?" FAQ answer are generated from the configuration at build time.

## 5. Security controls

- **Ownership:**
  - every query is scoped to the session's customer ID;
  - another customer's account returns 404 on refresh, disconnect and reconnect;
  - the workspace view only ever contains the caller's own rows.
- **OAuth state:**
  - 256-bit random values, stored only as SHA-256 hashes;
  - single use, consumed atomically before any other work;
  - expire after 10 minutes;
  - tied to both the customer and the platform: a mismatch is treated as unknown and the state is burnt;
  - at most 10 pending per customer.
- **PKCE (S256):** used where the platform documents it (YouTube, X). The verifier is stored encrypted.
- **Exact callback:** the redirect URI is built from `APP_URL`, never from the request. It is stored with the state and reused verbatim in the token exchange. The callback only redirects to the Accounts page with an outcome code: no code, state or platform message is echoed back, and the referrer policy is `no-referrer`.
- **Cross-site requests:** state-changing routes require the request to come from SociVanta's own origin. Session cookies are HttpOnly and SameSite=Lax.
- **Tokens at rest:**
  - stored as AES-256-GCM ciphertext and never returned to the browser or written to logs;
  - errors carry a category and status code only;
  - a database check refuses any disconnected row that still holds credentials.
- **Disconnect:** stored access is deleted in every case. Revocation is attempted only where the platform supports it. The result is recorded as `revoked`, `failed` or `not_supported`, and the customer sees exactly which, with the manual steps when revocation wasn't confirmed. A failure is never reported as revoked.
- **Bounded retries:**
  - at most 2 retries, only for 429 and 5xx responses;
  - `Retry-After` is honoured up to 4 seconds; longer waits fail immediately as rate-limited;
  - 10-second timeout per attempt;
  - each refresh is claimed atomically, so concurrent clicks can't double-call the platform.
- **One SociVanta account per platform account:** enforced by a partial unique index. An attempt to connect from a second account is refused and explained.
- **Read-only:** nothing posts, schedules, messages, edits a profile or spends money. The audit log records `social.connected` and `social.disconnected` without secrets.

## 6. SEO, AEO and GEO

- **Title:** "Social Media Management Platform | SociVanta AI" (47 characters). The meta description is about 155 characters.
- **Page structure:** one H1, and H2s that match how people search: "Manage multiple social media accounts in one place", "A social media dashboard that tells the truth", "Connect, authorize, manage", "Social media account management, done safely", "Social media management, answered".
- **Metadata:** relative canonical on the `APP_URL` origin, Open Graph and Twitter cards, and an OG image.
- **JSON-LD:**
  - WebPage, BreadcrumbList, and FAQPage matching the visible questions word for word;
  - no WebApplication, because nothing works live yet;
  - no ratings or offers.
- **Content:** answers come first in the FAQ, and the platform explanations are original. Internal links go to `/ai-tools`, the workspace and registration, and the footer links to the page site-wide.
- **Indexing:** the sitemap now has 15 URLs. `/dashboard/*` is disallowed in robots.txt and noindexed, and `/api/social/*` is no-store and noindexed.
- **Core Web Vitals:**
  - the page is static;
  - the LCP heading isn't hidden behind an animation;
  - lab CLS is ≤ 0.1;
  - the shimmer is static under reduced motion.

## 7. Test results

| Check | Result |
|---|---|
| Typecheck, lint, production build | Pass |
| Vitest (all projects) | **339 / 339** (31 new) |
| Unit tests | 128 total. New: `tests/unit/social.test.ts`, 15 tests covering registry and scopes, availability, OAuth URL and PKCE, bounded HTTP, adapter mapping, safe views, honest FAQ. SEO test extended. |
| Integration tests | New: `tests/integration/social.test.ts`, 15 tests against a UTF-8 scratch database (see below). Migration test updated to 54 tables and 8 migrations, including rollback. |
| AI-06 browser QA | 79 / 79. Production build; Edge; 320, 375, 768, 1024 and 1440 px; light and dark; keyboard (skip link, FAQ with Enter, Escape closes the drawer); reduced motion; CLS; no console errors. |
| SEO crawl (SEO-01 suite, updated to 15 pages) | 185 / 185 |

**What the integration tests cover:**
- disabled when unconfigured;
- state hashing, encryption and expiry;
- foreign, expired, replayed and cross-platform states rejected;
- cancellation;
- PKCE and exact redirect;
- encrypted tokens;
- reconnect in place;
- takeover refused;
- provider failure keeps no access;
- cooldown and token refresh;
- rate limits and needs-reconnect;
- ownership;
- revoked, failed and not-supported disconnects;
- the database credentials constraint;
- route checks for same origin, foreign IDs, disabled platforms and unknown platforms.

**How the signed-in browser checks were run:** against an isolated scratch database, which was dropped afterwards, with two session-only QA customers:
- one with no accounts, the real starting state;
- one with **fixture connection rows inserted directly into that scratch database**, used only to review the connected-account UI.

No platform was contacted, and no fixture data exists in the dev database or in live mode.

**Bug found by the browser QA:** a hydration mismatch in relative times ("12 minutes ago"). Fixed: the exact time renders first and the relative form after hydration.

## 8. Remaining external dependencies

- **Per platform:** a developer app; app review or approval (Meta for Instagram and Facebook, TikTok, Google's OAuth verification for the YouTube scope, an X API access tier, LinkedIn); the registered redirect URI; and the client ID and secret.
- **A live verification pass per platform before listing it in `SOCIAL_PROVIDERS_ENABLED`:** connect, refresh, token renewal and disconnect.
- **Privacy policy and terms:** they need to cover social data before launch. The footer links are still placeholders.
- **Database encoding:** the local Windows embedded Postgres cluster is **WIN1252**, a pre-existing setting. Account names and messages are Unicode, so production databases must be UTF-8, which is standard for managed Postgres. Tests and QA create UTF-8 scratch databases explicitly.

## 9. AI-07 prerequisites (scheduling and publishing; not started)

- **Separate, explicit write permissions per platform**, for example `instagram_business_content_publish`, `video.publish`, `tweet.write` or `w_member_social`. Requesting them needs fresh consent and usually a new app review. Never widen today's read-only grants silently.
- **Durable job execution:** pg-boss is already a dependency. Publishing also needs idempotency keys, per-platform rate limits and a retry policy.
- **A storage and media pipeline** with platform-specific constraints.
- **An audit trail** for every publish action, plus customer confirmation flows.
- **Reuse the AI-06 connection store, token refresh and health model.** Accounts in `needs_reauth` must block scheduling.

**Constraints respected:**
- The 118 services, orders, fulfillment, checkout, wallets, payments, authentication architecture, admin, AI-01 to AI-05 tool logic, AI quotas and the existing SEO foundation are unchanged.
- No AI-07 scheduling or publishing, AI-08 or subscriptions.
- No external APIs configured; no Git.

## Addendum: landing page and footer refinements

- **Hero:**
  - New headline: "All Your Social Accounts. One Smarter Workspace."
  - Calls to action: Open Social Workspace, See How It Works, and Explore Supported Platforms.
  - New SEO title: "Social Media Management Platform | SociVanta AI".
- **Hero preview** (`src/components/social/hero-preview.tsx`): an interactive product demonstration with Overview, Accounts and Activity tabs.
  - It rotates every 7 seconds, with a progress bar under the active tab, and crossfades at a fixed height.
  - It pauses on hover, focus, manual interaction (resuming after 12 seconds idle), when offscreen or the browser tab is hidden, and under reduced motion.
  - It uses proper tab semantics with arrow-key navigation.
  - Every status shows the real "Awaiting approval" availability, the Activity tab is labelled as examples, and no figures are shown.
- **Platforms section:** the two-column directory is kept. The rows fade in with a stagger (static under reduced motion), rows have hover tints, and the Planned / Not supported blocks were removed at the owner's request.
- **Global footer:**
  - Rebuilt with Marketplace, AI & Social, Company and Support columns, with every link audited.
  - Pages that don't exist yet (About, Help Center) are labelled "Soon". Legal links show the existing "published before launch" notice.
  - The placeholder contact box and Careers link were removed. No social profiles are shown, because none are configured.
  - There is no footer call-to-action band, because every page using the footer already ends with its own.
- **AI Tools page:** one contextual link to Social Management. The header is unchanged, at the owner's request.
- **Verification:**

  | Suite | Result |
  |---|---|
  | Hero preview checks: two full rotation loops, pause rules, keyboard, reduced motion, layout shift, 320–1440 px in light and dark | 29 / 29 |
  | Footer checks: links, anchors, keyboard, overflow | 29 / 29 |
  | AI-06 suite | 86 / 86 |
  | SEO crawl | 185 / 185 |
  | Unit tests | 128 / 128 |

  Typecheck, lint and the production build pass.
