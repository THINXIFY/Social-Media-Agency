# AI-09 — AI Product Experience & Monetization Foundation

AI-09 turns SociVanta AI into one connected product. It adds four connected experiences:

- an **AI Command Center**;
- optional **goal-based onboarding**;
- a transparent **Usage & allowances** dashboard;
- an honest **Plans** experience, made up of a public pricing page and a private plans view.

Real AI generation, social connections, publishing and billing are unchanged. Generation stays off, every AI tool shows *Coming soon*, and no subscription or checkout exists.

## 1. Routes and features

| Route | Access | What it is |
|---|---|---|
| `/dashboard/ai` | Customer, noindex | Command Center: welcome, 8 quick actions, recommendations, My workspace, Discover more, usage and plans links |
| `/dashboard/ai/welcome` | Customer, noindex | Three-step onboarding: persona, goals, preview; skip on every step; also used to edit preferences |
| `/dashboard/ai/usage` | Customer, noindex | Per-tool daily allowances, used and remaining runs, reset time, today's request outcomes, usage rules |
| `/dashboard/ai/plans` | Customer, noindex | Current plan (decided on the server), plan cards, comparison, billing facts |
| `/pricing` | Public, indexable | SociVanta AI plans & pricing: plan cards, comparison, how billing works, FAQ |
| `GET/PUT /api/ai/profile` | Customer, same-origin for PUT | Read or save the caller's own preferences (`complete` or `skip`) |

### New files

- **Shared logic:**
  - `src/lib/ai/workspace.ts`: routes, personas, goals, destinations, recommendations, view types.
  - `src/lib/ai/plans.ts`: plan definitions.
- **Server:**
  - `src/server/ai/workspace.ts`: preferences, workspace snapshot, usage, Command Center data.
  - `src/server/ai/plans.ts`: entitlements.
- **UI:** `src/components/ai-workspace/*`. This covers `command-center`, `onboarding`, `usage`, `plans`, `plans-view`, `pricing`, `parts`, `glyph` and `loader`.
- **Pages:** `src/app/dashboard/ai/**` and `src/app/pricing/{page,opengraph-image}.tsx`.
- **Database:** `drizzle/0010_ai_profiles.sql`, plus its rollback in `drizzle/rollback/0010_ai_profiles.down.sql`.

### Small additive changes to existing files

- `src/server/ai/run.ts` gains a read-only `usageEventsToday()`, which uses the same subject hash and UTC day as the quota check. Accounting itself is untouched.
- `src/server/auth/pages.ts` adds `userId` to the server-side viewer. It is never sent to the browser.
- Navigation, settings, footer and sitemap changes are described in §6 and §7.

## 2. Dashboard UX decisions

Each area has its own composition, so the pages don't repeat one generic card grid.

- **Header:**
  - A personal kicker ("Welcome, Jordan") that uses the account's real first name.
  - The headline "Your creative workspace starts here." with its supporting line.
  - Two honest status pills: *Plan: Free* and *AI generation: Coming soon/Live*.
- **Quick actions:** one panel with a soft violet and lime wash.
  - A short explanation sits on the left, and the 8 action tiles on the right (2 columns on mobile, 4 on desktop).
  - Each tile shows its live state. The 7 AI actions say *Coming soon*; Explore Social Management says *Open*.
- **Recommended for you:**
  - Before onboarding, this is a graphite invitation ("Make this workspace yours", with *Personalize* and *Not now*) above balanced starter picks.
  - After onboarding, it shows the persona and goal chips, an *Edit preferences* link and 4 recommendation cards. Each card explains why it was picked, for example "Popular with creators · Create better content".
- **My workspace:** shows only records the customer owns:
  - the 3 most recent drafts and the total count;
  - planned content and the next planned date;
  - active automations out of the total;
  - open inbox items;
  - connected accounts.

  A new account sees an honest empty state with *Write a draft* and *Create an automation*. There is no fake activity, and there are no Saved AI Projects (still deferred).
- **Discover more:** a keyboard-operable tab set (arrow keys, Home and End) over five groups: Content Studio, Growth Intelligence, Assistant & Search, Order & Support AI, and Social workspace.
  - Only one group's compact list shows at a time, so the page never shows one huge grid.
  - Workspace areas carry honest notes, such as "Drafts work today. Live publishing is off."
- **Usage and plans links:** two link cards close the page.

## 3. Onboarding and personalization

- **The three steps:**
  1. Persona, one of: Content Creator, Small Business, Marketing Agency, Ecommerce Brand, Freelancer, Exploring AI Tools.
  2. Goals, multiple choice from six options.
  3. A preview of the persona, goals and the 4 tools that will appear first.
- **Controls:**
  - Native radio and checkbox inputs inside choice cards, so keyboard and screen readers work as standard.
  - A progress bar, Back and Continue (Continue is disabled until a choice is made), and *Skip for now* on every step.
  - On mobile, a sticky action bar with 44px touch targets.
- **Accessibility and motion:**
  - On each step change, focus moves to the new step's heading.
  - Transitions use Motion (already a dependency) and respect reduced motion, including the dashboard's own setting.
- **Saved data:** only the persona and goals are stored, in `ai_profiles` keyed by customer.
  - *Skip* records `skipped` but never erases earlier choices.
  - Users can edit later from *Edit preferences* or **Settings → Preferences → Edit AI preferences**. Settings strings are translated into all 6 languages.
- **Recommendations** come from `recommend()` and never call a model:
  - Persona picks score 10, 9 and 8; each goal adds 6, 5 and 4 to its picks; ties keep catalogue order.
  - When picks overlap, a fixed fill list completes the 4 slots, so the layout never has a gap.
  - Without a profile, a starter set is used.
  - The brief's examples hold: Creator gets Captions, Post Ideas and Calendar. Small Business gets Growth Advisor, Roadmap and Service Recommender. Agency gets Calendar, Campaign Studio and Social Management.

## 4. Usage calculation and data sources

All usage figures come from the existing `ai_usage_events` records and registry allowances.

- **Matching records:** events are matched on the same HMAC subject hash and UTC day as the quota check in `runTool`.
- **Used:** `ok` plus `pending` events. These are exactly what the quota counts, since a pending run holds a reservation.
- **Allowance:** `allowanceFor()`, including operator overrides set in `AI_DAILY_ALLOWANCES`.
- **Remaining:** `max(0, allowance − used)`.
- **Not counted:** `rejected_quota` (allowance reached), `rejected_budget` (platform safety limit), `provider_error` and `timeout` (AI service problems), and `invalid_output` (a result we couldn't use).
  - The page lists counted and uncounted outcomes in separate columns.
- **Reset:** 00:00 UTC. The page shows a live countdown and the time in the viewer's own time zone.
- **Not shown:** tokens, costs, credits and savings are never displayed.
- **Coming-soon tools:** each shows its allowance as "N a day · At launch" beside a hatched meter, under a notice that nothing can run or count yet.
- **Missing data:**
  - Unknown or retired tool ids in the records are ignored.
  - If usage can't be read (for example, the sign-in secret isn't set), the page says so and shows "—". It does not show zeros.
- **Usage rules section:** per-tool allowances, what counts, what doesn't, the reset, the real pace limit (5 requests a minute across tools), the platform safety limit, and wallet separation.

## 5. Plan architecture and billing readiness

- **Plan definitions** live in code, in `src/lib/ai/plans.ts`:
  - **Free:** what works today, marked *Included*:
    - the social workspace (drafts and calendar);
    - Automation Studio (25 workflows, 10 active, matching the server limits);
    - the usage dashboard.

    AI tool allowances and social connections are marked *At launch*.
  - **Pro** and **Business:** shown as *Proposed* with *Pricing not announced*. Every feature is marked *Planned*, and the call to action reads *Not available yet* with no button. There are no prices, numbers, "unlimited", discounts or urgency.
  - On the Free card, the price line says "No cost" because the plan name already says "Free".
- **Entitlements:** `planFor()` in `src/server/ai/plans.ts` is server-only and always returns Free. Nothing a browser sends can change it; the profile API rejects any extra field such as `plan`.
- **Integration boundary**, documented in code and not built:
  - A future subscriptions table, written only by a verified billing-provider webhook and read by `planFor()`.
  - AI billing stays separate from the SMM wallet, orders and ledger.
  - Wallet balances can never pay for a plan.
  - A plan never changes allowances without a reviewed entitlement change.
- **Checkout:** there is no checkout, payment method, invoice, Stripe or other gateway code. A test confirms no checkout, subscription or billing endpoint exists.

## 6. Navigation changes

- **Main sidebar:** the existing *SociVanta AI* group now holds **AI workspace** (new, Sparkles icon) above *Social accounts*. The SMM navigation is unchanged. The label is translated into all 6 languages.
- **AI area navigation:** a compact bar with Home, Usage, Plans and Social workspace, in the same style as the Social workspace bar.
- **Discoverability:** the Command Center reaches every part of SociVanta AI:
  - Content Studio, Growth Intelligence, the Assistant and Service Search, and the Order & Support tools;
  - Social Management, Publishing, Calendar, Campaign Studio and Automation Studio;
  - Usage and Plans.
- **Settings:** a link to restart or edit onboarding.
- **Footer:** the *AI & Social* column gains *AI Plans & Pricing*.

## 7. SEO, AEO and GEO

- **`/pricing` metadata:**
  - Unique title (44 characters) and description (156 characters).
  - Relative canonical, Open Graph and Twitter cards, and its own OG image.
- **Page content:**
  - Server-rendered, with one H1 and logical H2 and H3 headings.
  - A direct answer comes first ("SociVanta AI is free to start…").
  - Six FAQs unique to this page, covering free use, unannounced pricing, launch, what counts, the wallet, and SMM pricing.
  - Internal links to `/ai-tools`, `/social-management` and registration.
- **JSON-LD:** WebPage, BreadcrumbList and FAQPage, matching the visible text. **No Offer or Product markup**, because paid prices aren't announced.
- **Sitemap:** now has 16 URLs including `/pricing`. All `/dashboard/ai/**` pages stay noindex, sit behind authentication and are disallowed in robots.txt.

## 8. Security boundaries

- Every page and API call resolves the customer on the server. Preferences, snapshot and usage queries are always scoped by the session's customer or user id, and the body can never name another account.
- PUT requests require the same origin. Input uses a strict Zod discriminated union, and the database enforces persona, onboarding and goal constraints as well.
- Usage reading is read-only. Quotas, reservations, budgets, provider-disabled states and the AI-02–AI-08 execution rules are unchanged.
- A test confirms that saving preferences and loading usage or plan data writes nothing to wallets, journals or posts.
- The following are unchanged:
  - the 118 SMM services, orders, checkout, wallets, payments and ledger;
  - authentication architecture;
  - social OAuth;
  - publishing authorisation;
  - automation safeguards.

  No new dependencies, credentials, Git or deployment.

## 9. Exact test results

| Check | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | Pass |
| Lint (`eslint`, whole project) | Pass, 0 problems |
| Production build | Pass. 4 new dashboard routes (dynamic) and `/pricing` (static) |
| Vitest (all) | **415 / 415** (394 before plus 21 new) |
| New unit tests (`tests/unit/ai-workspace.test.ts`) | 12: recommendations, destinations, strict input, honest plans, no checkout endpoint, pricing SEO |
| New integration tests (`tests/integration/ai-workspace.test.ts`) | 9: complete, edit and skip; validation and database constraints; snapshot isolation; inbox counts; usage maths and outcomes; overrides; unreadable usage; route auth, origin and ownership; no wallet or ledger writes |
| Migration test | Updated: 60 tables, 11 migrations, 0010 rollback step |
| Browser QA, AI-09 (Edge, production build, scratch UTF-8 database) | **57 / 57** |
| Regression browser QA | AI-08 38/38 · AI-07 40/40 · AI-06 86/86 · SEO crawl 193/193 (now includes `/pricing`) |

The browser checks covered:

- signed-out redirects, noindex, and real first names;
- quick-action states, keyboard tabs, skip, all three onboarding steps (keyboard, focus, Back), finish, and resuming from *Edit preferences*;
- real workspace counts, cross-account isolation, and rejection of forged fields;
- usage maths and notices, plans and pricing honesty, the footer link and the sitemap;
- reduced motion, mobile touch targets, no horizontal overflow at 320, 375, 768, 1024 and 1440px in light and at 320, 375 and 1440px in dark, and zero console errors.

**Bugs found and fixed during QA:**

1. **Focus after a step change:** focus didn't move to the new step's heading, because the heading mounts after the exit animation. Fixed with a callback ref.
2. **Returning to onboarding:** Next keeps the onboarding route mounted, so *Edit preferences* reopened the old step 3. The flow now resets to step 1, with saved answers, after saving.
3. **Mobile overflow:** the Command Center overflowed horizontally at 320 and 375px because single-column grid items grew to their content width. Fixed with explicit `grid-cols-1` and `min-w-0`.
4. **Recommendation gaps:** some persona and goal combinations returned only 3 picks. Fixed with the deterministic fill list.

Design refinements after reviewing the screenshots:

- The *My workspace* panel no longer stretches to leave a blank gap.
- Workspace areas say *Open* rather than *Ready*.
- The Free card no longer repeats "Free".

## 10. Known limitations and activation requirements

- **AI tools:** stay *Coming soon* until a provider is configured, priced and verified (`npm run ai:verify`) and generation is switched on. The Command Center, usage and recommendations then show *Ready* and *Available* automatically from `effectiveAvailability()`.
- **Paid plans:** require approved pricing, product eligibility, business rules and an approved billing provider. They must then be built along the documented boundary in §5. Until then, nothing can be bought.
- **Social connections and live publishing:** unchanged. They depend on platform approvals and the AI-06 and AI-07 activation steps.
- **Deferred:** Saved AI Projects is still deferred, as the brief asked.
- **Database:** migration 0010 is applied to `socivanta_dev` (WIN1252, still the active `DATABASE_URL`, unchanged) and to the `socivanta_dev_utf8` copy. Persona and goal values are ASCII ids, so the WIN1252 database is fine for this feature.
- **Dev server and production builds:** running `next build` while `next dev` is running can leave the dev server with stale modules. After AI-09 delivery this caused a "WORKSPACE_TOOLS is not iterable" error on `/dashboard/ai`. The fix:
  - restart the dev server with a clean `.next/dev`;
  - `src/server/ai/workspace.ts` now reads the tool list when called rather than at module load.
- **Static pages and `APP_URL`:** `/pricing` is static, so its canonical uses the `APP_URL` present at build time. Build production with the real `APP_URL`, as for the other public pages.
