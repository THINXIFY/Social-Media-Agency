# AI-07: Social Publishing Studio & AI Campaign Intelligence

**Status:** implementation complete and tested.

Customers can write drafts, adapt them per platform, preview them, organise them and plan them on a calendar today.

**Not available yet:**
- **Real publishing:** no platform has approved SociVanta's posting permission, so no publish adapter is activated and nothing can be scheduled.
- **Real AI campaign plans:** no AI provider is configured.

Both states are shown honestly in the product.

## 1. Pages and features

| Route | What it does |
|---|---|
| `/dashboard/social` (Overview) | Adds three next actions: Write a post, Plan your month, Plan a campaign |
| `/dashboard/social/publishing` | Content library: search, filters (All, Drafts, Scheduled, Published, Needs attention), duplicate, delete with confirmation, last edited time, publishing status notice |
| `/dashboard/social/publishing/new` and `/[id]` | Composer (see below) |
| `/dashboard/social/calendar` | Month and week views, platform filters, the viewer's time zone, details dialog with a planned-date editor, mobile agenda |
| `/dashboard/social/campaigns` | AI Campaign Studio |
| `/dashboard/social/accounts` and `/activity` | Unchanged AI-06 pages. Activity now also shows post events: scheduled, cancelled, published, failed, unconfirmed |

**Navigation:** the Social area's own tab bar is now Overview · Publishing · Calendar · Campaigns · Accounts · Activity. The dashboard sidebar is unchanged.

**Composer:**
- Choose platforms, then write one text with optional per-platform variants.
- Live character limits per platform, counting emoji once.
- A YouTube title field.
- A media section that states uploads aren't available yet and shows what will be accepted.
- An optional planned date (planning only; nothing is posted).
- A list of the accounts for the selected platforms.
- Unsaved-change warnings, both in-app and when the browser leaves.
- Previews for all six platforms, labelled "Approximate layout — not the exact platform design". They show no reaction or follower counts and display platform-rule issues inline.
- "Schedule" explains exactly what's missing. Once a platform is activated, the same dialog becomes a real scheduler: time, eligible accounts and explicit confirmation.

**Design:** light-first, using the existing Panel and token system, Manrope and Inter, and violet/graphite/lime. There are designed empty states for:
- no drafts;
- nothing planned;
- no AI provider;
- no connected accounts;
- platforms that need media;
- needs-review and failed posts.

No fake posts, figures or zero-filled dashboards appear anywhere.

## 2. Database and scheduling architecture

**Migration:** `drizzle/0008_social_publishing.sql`, with a rollback. It adds two tables and extends the `social_events` types.

**`social_posts`** (owned by a customer):
- body (5,000 characters max), per-platform variants, media references, platforms;
- status: `draft`, `scheduled` or `cancelled`;
- `planned_at` (planning only), `scheduled_at`, the customer's IANA time zone;
- `approved_at`, set only by the owner's schedule action.

Check constraints enforce the length limits and that a scheduled post has both an approval and a time.

**`social_post_targets`** (one per post and account):
- statuses: `scheduled`, `publishing`, `published`, `failed`, `cancelled`, `reconciliation_required`;
- a unique idempotency key (`svp_<uuid>`);
- attempts (capped at 10 by the database, 3 by the engine), `next_attempt_at` and a lease;
- a partial unique index allows only one live target per post and account.

**Engine:** `runPublishingTick` runs as the `social.publish-due` job on the existing pg-boss worker, every 60 seconds. It is enabled, and makes no external calls unless a platform is activated.
1. **Recover.** A `publishing` target whose lease expired means a worker died mid-call. It becomes `reconciliation_required` and is never retried.
2. **Claim.** Due targets are claimed in one statement (`UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)`) with a 5-minute lease.
3. **Re-check eligibility before any call:** the post is still scheduled and approved; the account is still active (not disconnected or needing reauthorisation); publishing is still enabled for the platform; the posting permission was granted; the content still passes the platform's rules. Any failure here ends the target as `failed` with nothing sent.
4. **Settle exactly one outcome,** and only while the row is still `publishing`:
   - `published`: confirmed by the platform.
   - `rejected` and retryable (rate limits only): back to `scheduled`, with exponential backoff (60 s, 120 s, 240 s… capped at 30 minutes, honouring `Retry-After`), for up to 3 attempts.
   - `rejected` and not retryable: `failed`.
   - `uncertain` (timeouts, 5xx after sending, unreadable replies): `reconciliation_required`, never retried automatically, so there are no duplicate posts.

**Scheduling, cancelling and rescheduling:**
- **Time conversion:** times are converted from the customer's wall time in their IANA zone using Intl only, with no new dependencies.
- **Daylight saving:**
  - a time skipped by spring-forward is refused with a clear message;
  - a time that occurs twice resolves to the first occurrence, and the customer is told.
- **Time window:** 5 minutes to 1 year ahead.
- **Rescheduling:** allowed only while every target is still waiting; the old targets are cancelled and new ones created with new keys.
- **Cancelling:** stops everything not yet started. A target already publishing is reported, not silently ignored.

## 3. Publishing adapter readiness

**Contract** (`src/server/social/publish-adapters.ts`): `publish(input) → published | rejected | uncertain`.
- Adapters must call `requestJson(..., { retries: 0 })` for any request that creates content; this option was added to the AI-06 HTTP client.
- They pass the idempotency key wherever the platform supports one.
- `classifyPublishError` maps provider errors, and anything that might have reached the platform counts as `uncertain`.

**Platform rules** (`src/lib/social/publishing.ts`): accepted formats, text limits, media requirements, title rules, and the write scopes publishing would need.

| Platform | Formats | Text limit | Needs | Publish scope (not requested) |
|---|---|---|---|---|
| Instagram | image, video | 2,200 | media | `instagram_business_content_publish` |
| Facebook Pages | text, image, video | 63,206 | — | `pages_manage_posts` |
| TikTok | video | 2,200 | video | `video.publish` |
| YouTube | video | 5,000 (description) | video, title ≤ 100 | `youtube.upload` |
| X | text, image, video | 280 (approximate weighting) | — | `tweet.write` |
| LinkedIn | text, image, video | 3,000 | — | `w_member_social` |

**Activated adapters: none** (`ADAPTERS = {}`). Limits and scopes follow each platform's published documentation as I know it. Re-verify them against current docs, app-review terms and a live test account before activating any platform.

## 4. What works today and what's disabled

| Capability | State |
|---|---|
| Drafts, variants, previews, library, duplicate, delete | Works for every signed-in customer |
| Planned dates and calendar | Works (planning only) |
| Scheduling and publishing | Disabled: no platform approval, no activated adapter, no connected accounts. The UI explains why |
| Media uploads | Disabled: no secure storage configured. Validation (type, size, byte signature) is built and tested |
| AI Campaign Studio | Built on the shared AI pipeline (quotas, budget, redaction, validation). Shows "Coming soon" until a provider is configured and `ai:verify` passes |
| Worker publishing job | Enabled and safe. With no adapters, nothing can be claimed because nothing can be scheduled |

**AI Campaign Studio details:**
- `campaign-planner` is a dashboard-only workspace tool (`WORKSPACE_TOOLS`). It's runnable by ID, with 5 free plans a day once live, but it's absent from public `/ai-tools` pages, the sitemap and the directory counts.
- Its output is always labelled goal-based by the server.
- Invented statistics, guarantees and audience demographics stated as fact are rejected.
- It never drafts, schedules or publishes: the customer saves an idea as a draft with an explicit click.
- `npm run ai:verify` now covers it.

## 5. Security controls

- **Ownership:** every read and write is scoped to the session's customer. Other customers' posts, accounts and schedules return 404. The edit page only loads the owner's posts.
- **Approval:** only the owner's schedule action sets `approved_at`, and eligibility is checked at schedule time and again at execution.
- **Cross-site requests:** same-origin is required on every write route; sessions are HttpOnly and SameSite=Lax.
- **Rate limits:** 300 post writes per hour per customer, at most 500 posts per customer, and at most 10 targets claimed per worker pass.
- **Input sanitisation:** NFC normalisation, control characters stripped, length checked in code points, strict schemas (unknown fields rejected), and media refused until storage exists.
- **Tokens:** decrypted only inside the worker, immediately before a call, and never sent to the browser. The pages are verified to contain no ciphertext.
- **No autonomy:** no AI-initiated actions, and no ads, spending, orders or payments.

## 6. SEO, AEO and GEO

- **Public `/social-management`:**
  - The "Can I schedule or publish posts?" answer and the matching FAQ JSON-LD now accurately say drafts, previews and a content calendar exist, and that publishing stays off until platform approval and the customer's own permission.
  - The workspace section's note was updated the same way.
  - The title, description, canonical URL, sitemap (15 URLs) and structured data are otherwise unchanged.
- **Private pages:** all new pages live under `/dashboard`, so they're noindex (meta tag and `X-Robots-Tag` header), private no-store, and disallowed in robots.txt.

## 7. Test results

| Check | Result |
|---|---|
| Typecheck, lint (whole repo), production build | Pass |
| Vitest, all projects | 369 / 369 |
| New unit tests (`tests/unit/publishing.test.ts`) | 16 |
| New integration tests (`tests/integration/publishing.test.ts`, UTF-8 scratch database) | 14 |
| AI-07 browser checks | 40 / 40 |
| AI-06 regression | 86 / 86 |
| Hero preview checks | 29 / 29 |
| SEO crawl | 185 / 185 |

**Unit tests cover:**
- time zones, including the US and UK daylight-saving gaps and the repeated hour;
- platform limits and media requirements;
- media byte sniffing, including rejecting an executable and an SVG;
- post state derivation;
- error classification;
- backoff;
- availability gating;
- input sanitisation;
- Campaign Studio rules and dashboard-only registration.

**Integration tests cover:**
- multilingual and emoji round-trips;
- ownership;
- duplicate and delete;
- the friendly error on a WIN1252 database;
- every scheduling refusal;
- unique idempotency keys;
- locked edits;
- reschedule and cancel;
- publish-once with the key;
- three concurrent ticks giving one call;
- crash recovery going to review with no republish;
- an uncertain outcome never retried;
- bounded rate-limit retries;
- execution-time eligibility (disconnected account, publishing switched off);
- the real build publishing nothing;
- route checks for same origin and ownership.

The migration test was updated to 56 tables and 9 migrations, including rollback.

**Browser checks** ran against the production build in Edge:
- noindex and the redirect for signed-out visitors;
- the six-tab navigation;
- empty states;
- the composer flow: write, validate, X limit, Instagram media rule, schedule explanation, save, reload with emoji and Chinese text intact, unsaved-change prompt, duplicate, delete, search;
- the calendar in America/New_York, including correct daylight-saving placement on 1 November, the details dialog, week view and navigation;
- state badges and the needs-attention filter;
- Campaign Studio's honest locked state and the 3-platform cap;
- no overflow on 5 pages at 320, 375, 768, 1024 and 1440 px in light and dark, plus reduced motion;
- no credentials in pages, and no console or hydration errors.

The signed-in checks used a dropped scratch database with session-only QA customers and sample posts inserted only there.

## 8. UTF-8 database status

- **Your current dev database:** `socivanta_dev` is **WIN1252**, which cannot store emoji or most non-Latin text.
  - Saving such text there now fails with a clear message ("needs a UTF-8 database"), not a crash; this is tested.
  - Plain Latin text works.
- **The copy:** I added `npm run db:utf8-copy` and ran it. It created **`socivanta_dev_utf8`** (UTF-8), applied all migrations and copied all 386 rows across 56 tables. Every table's row count matches, and an emoji, Chinese and Arabic round-trip on the copy succeeded.
- **Your original database:** `socivanta_dev` was only read, not changed, and stays your backup.
- **Your action needed:** point `DATABASE_URL` in `.env.local` at `…/socivanta_dev_utf8` and restart. I didn't change your env.
- **Verified:** multilingual storage on UTF-8 (the copy and every scratch test database). **Not verified:** your running dev server, until you switch.
- **Production:** must use a UTF-8 database, which is standard for managed Postgres.

## 9. Activating a platform

1. AI-06 connection requirements: credentials, `SOCIAL_PROVIDERS_ENABLED` and the redirect URI.
2. The platform's app review approves its posting scope (table above), and the platform's terms for scheduled posting are met.
3. Implement that platform's adapter to the contract, re-checking the current API docs. Use non-retrying create calls and idempotency where supported, and document its upload flow and status confirmation.
4. Add the scope to that platform's connection request (customers reconnect and explicitly grant it). AI-06 currently requests read-only scopes only.
5. Configure media storage, if the platform needs media.
6. Verify end to end with a real test account: connect, schedule, publish, cancel, and a failure path.
7. Add the platform to `SOCIAL_PUBLISHING_ENABLED` and rebuild.

## 10. Remaining blockers

- Platform approvals and posting permissions for all six platforms.
- No publish adapters are implemented against live APIs, by design until step 9.
- No secure media storage (an object store with signed uploads, malware scanning and lifecycle cleanup) is configured. Plan storage costs and retention before enabling it.
- No AI provider is configured for Campaign Studio, which needs `ai:verify` to pass.
- Switching the local dev database to UTF-8 is up to you (see §8).
- AI-08 (workflow automation), AI-09 (subscriptions), multi-brand workspaces and Saved AI Projects are not implemented.

**Unchanged:** services, ordering and checkout, wallets and payments, authentication architecture, AI-01 to AI-06 behaviour (AI-06 connections stay read-only) and the SEO foundations. No Git operations and nothing deployed.
