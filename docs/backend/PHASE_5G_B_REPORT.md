# Phase 5G-B: Referral Program (Attribution, Review and Locked Rewards)

Status: **complete within scope.**

Customers can share a personal referral link or code and track who joined with it. Staff can review referrals, flag abuse, draft future reward rules and switch the program on or off.

**Rewards are locked off** at three levels: the UI, the server, and a database guard (SV014). In particular:

- no wallet credit, payout, ledger entry, balance or discount is created;
- no referral can be qualified;
- no reward amount or payment date is promised.

## 1. Routes and interfaces

| Route | Access | Purpose |
|---|---|---|
| `/dashboard/referrals` | Customer, noindex | Live view of the referral program; demo mode keeps the illustrative page |
| `/register?ref=CODE` | Public | Prefills the code on sign-up (with a remove option); a manual "Have a referral code?" field is also offered |
| `/admin/referrals` | Staff, Referrals: View | Live workspace with Referrals, Reward rules, Program and History tabs |
| `/help/how-referrals-work` | Public, indexable | Accurate guide to the program, listed in the sitemap |
| `GET /api/account/referrals` | Customer | Own code, link, counts and history |
| `POST /api/account/referrals/code` | Customer, same origin | Replaces the code (3 per day); refused while sharing is off |
| `GET /api/admin/referrals` | Referrals: View | List with `status` (`all`, `flagged`, `signed_up`, `pending`, `qualified`, `ineligible`), search `q`, totals, program settings, `can.manage` |
| `GET /api/admin/referrals/:id` | Referrals: View | Detail with signals, both parties and event history |
| `POST /api/admin/referrals/:id` | Referrals: Manage, same origin | `review`, `reject` (reason required) or `restore`. `qualify` is always refused |
| `GET`, `POST /api/admin/referrals/rules` | View / Manage | List rules; save a **draft** |
| `POST /api/admin/referrals/rules/:id` | Referrals: Manage | `retire` a draft. `activate` always returns 409 |
| `POST /api/admin/referrals/program` | Referrals: Manage + recent re-auth | Attribution and sharing switches (optimistic version check) |
| `GET /api/admin/referrals/audit` | Referrals: View | Latest 100 `referral.*` audit entries |

**Code:**

- Server: `src/server/referrals/referrals.ts`
- Shared definitions: `src/lib/referrals.ts`
- UI: `src/components/dashboard/live-referrals.tsx` and `src/components/admin/live-referrals.tsx`

## 2. How attribution works

**Codes:**

- **Format:** `SV-` followed by 8 characters from a 30-character alphabet with no 0/O, 1/I/L or U (about 6.6 × 10¹¹ combinations), generated with `crypto.randomBytes`.
- **Creation:** made on first visit; safe when two requests create one at the same time.
- **Replacement:** replacing a code disables the old one for new sign-ups. Past referrals keep their history.

**At sign-up:**

- The link puts the code in a hidden form field. Refreshing the page keeps it, because it's part of the URL.
- `registerCustomer` creates the account exactly as before. It then calls `attributeReferral` in its own `try/catch`.
- A bad, unknown or replaced code, or a failure, never changes the sign-up response. The response is the same `check_email` with or without a code, so there's no enumeration.

**Once only:**

- The unique index on the referred customer allows one referral per person. A test with three concurrent attempts produced one row.
- Self-referral is refused by the existing database check, and also when the email is a variant of the same inbox (case, `+tags`, Gmail dots and `googlemail.com`).

**Other rules:**

- **Email verification:** `verifyEmail` records `verified_at` and an `email_verified` event. This step is non-blocking and idempotent.
- **No reward policy:** referrals are stored with `policy_id = null`. Migration 0014 made that column nullable.
- **No "Invited" status:** SociVanta doesn't send invitations, so no real invitation event exists. Copying a link is never counted as an invite. The customer page and help article say so.

## 3. Statuses

| Database value | Staff label | Customer label | Set by |
|---|---|---|---|
| `signed_up` | Signed up | Signed up | Attribution |
| `pending` | Under review | Under review | Staff, "Mark for review" |
| `ineligible` | Rejected | Not eligible | Staff, with a required reason (shown only to staff) |
| `qualified` | Qualified | Qualified | **Never in this phase.** Server refuses it; trigger SV014 blocks it without an approved policy |

Allowed staff moves:

- `signed_up` → `pending`;
- `signed_up` or `pending` → `ineligible`;
- `pending` or `ineligible` → `signed_up` (restore).

Each move takes a row lock and writes an append-only `referral_events` row, an `audit_log` entry and `reviewed_by`/`reviewed_at`.

## 4. Anti-abuse (lawful signals only)

Signals are recorded in `referrals.flags` at sign-up. They **only flag** a referral for staff. Nothing is rejected automatically, and the referrer never sees them.

- `same_network`: the sign-up IP matches an IP the referrer's sessions used in the last 30 days.
- `similar_email`: the inbox name matches the referrer's once dots and `+tags` are ignored, on a different domain.
- `high_volume`: the code has brought 10 or more sign-ups in the past 24 hours.

Only the IP the server already logs is used. There's no device fingerprinting, no tracking cookie and no third-party service.

Other limits:

- existing sign-up rate limits (global and per IP);
- 3 code replacements per customer per day;
- permission checks on every route;
- same-origin checks on every write;
- re-authentication for program settings.

## 5. Rewards foundation (locked)

**Drafts:**

- Staff with Referrals: Manage can save **draft** reward rules: fixed amount or percent with a cap, minimum spend, minimum orders, qualifying window, hold period and per-referrer maximum.
- Drafts are versioned, using an advisory lock so concurrent saves get distinct versions. Every draft is audited.
- Drafts are never shown to customers and never applied.

**Migration `0014_referrals_5g`** adds three guard triggers (SV014). Lifting any of them needs its own reviewed migration:

- `referral_policies_locked`: no policy can become `active`;
- `referral_rewards_locked`: no `referral_rewards` row can be inserted;
- `referrals_qualify_locked`: no referral can be `qualified` without a policy.

**UI:** "Activate" and "Qualify" are shown disabled with the reason. The Program tab shows Rewards as "Locked off", with no switch.

**What isn't touched:** nothing reads or writes wallets, deposits, payments, the ledger or orders. A test confirms the journal entry count is unchanged.

## 6. Privacy

- **Referrers see:** the referred person's first name and last initial (for example "Grace H."), the join date, whether their email is confirmed, and the customer status label.
- **Referrers never see:** emails, surnames, signals or rejection reasons.
- **Staff see:** both parties' names, emails and customer references, for review.
- **All referral API responses** are private and `no-store`.

## 7. Database (migration `0014_referrals_5g`, rollback included)

- **`referrals` changes:**
  - `policy_id` is now nullable;
  - new columns `verified_at`, `flags` (jsonb, default `[]`), `reviewed_by` (foreign key to users) and `reviewed_at`;
  - new index `(code_id, attributed_at)` for the volume signal.
- **Guards:** three SV014 guard functions and triggers. `SV014` maps to a friendly conflict message in `src/server/errors.ts`.
- **Applied to:** `socivanta_dev` and `socivanta_dev_utf8`.
- **Migration test:** now expects 15 migrations and includes the 0014 rollback step (3 triggers). Later offsets were adjusted.

## 8. Customer and admin experience

**Customer page, from top to bottom:**

1. The heading "Share SociVanta. Grow Together."
2. A share card with:
   - the link field;
   - **Copy link**, announced to screen readers;
   - native **Share** where the browser supports it;
   - copy-code;
   - "Get a new code", with a confirmation step.
3. Four tiles: joined, confirmed email, under review, and **Rewards: Coming soon**.
4. The "People who joined" list, with an honest empty state.
5. "How referrals work" in three steps.
6. A "Rewards coming soon" panel linking to the help article.
7. When sharing is paused, a clear notice; existing history is still shown.

**Admin page:**

- a rewards-off notice;
- filter chips with counts (All, Flagged, Signed up, Under review, Rejected) and search by code, email or customer reference;
- a master-detail view with signals explained in plain language;
- review actions;
- draft rules;
- program switches;
- audit history;
- view-only staff can inspect but get no action buttons.

**Sign-up form:** a referral banner with **Remove**, or a collapsible optional code field.

## 9. SEO

- **No thin landing page** was created, and rewards aren't advertised anywhere.
- **New help article:** "How do SociVanta referrals work?" (48-character title, 153-character description, canonical, OG image, WebPage and Breadcrumb schema). It sits in Getting Started, and the sitemap now has 34 URLs.
- **Private pages:** `/dashboard/referrals`, `/admin/referrals` and the API stay noindex and private.

## 10. Test results

| Check | Result |
|---|---|
| Typecheck, ESLint (whole project), production build | Pass |
| New integration tests (`tests/integration/referrals.test.ts`) | **16 / 16** |
| New unit tests (`tests/unit/referrals.test.ts`) | **7 / 7** |
| Updated tests | `migrations` (0014 up and down), `help` (route list) |
| Full Vitest | **501 / 501** |
| Browser QA, 5G-B (production build, scratch database) | **76 / 76** |

**What the integration tests cover:**

- concurrent code creation;
- replacement and its daily limit;
- end-to-end sign-up with a code, then email verification;
- refresh and duplicate safety;
- unknown, malformed and replaced codes not affecting sign-up;
- self-referral and inbox variants;
- concurrent duplicate attribution;
- all three signals;
- the attribution and sharing switches;
- customer isolation and privacy (no email or surname);
- the review, reject and restore lifecycle, with events, audit and append-only SV001;
- qualify, activate and reward insert refused by both the server and the database (SV014);
- draft validation and versioning under concurrency;
- View versus Manage permissions, same-origin checks, re-authentication and the stale-version conflict;
- search and filters;
- no ledger change.

**What the browser QA covers:**

- the customer page: real link, counts and history, no private data, copy, keyboard access, code replacement, and an empty state for another customer;
- referral prefill on sign-up, removing it, ignoring malformed codes, and the manual field;
- the help article and sitemap;
- admin flows: flagged filter, signals, mark for review, reject with a reason, restore, locked qualify, saving a draft, locked activate, the program switch reflected on the customer page, and audit history;
- view-only staff;
- no horizontal overflow on 4 views at 320, 390, 768, 1024 and 1440 px, in light and dark (dark with reduced motion);
- no console errors.

**Issues found and fixed:**

1. **Guard function:** a single trigger function across three tables failed, because PL/pgSQL resolves `NEW.policy_id` even on tables without that column. It was split into three functions.
2. **Lint:** the Web Share check now uses `useSyncExternalStore` instead of setting state in an effect.

## 11. Known limitations and decisions needed

- **Reward decisions before anything can be enabled:**
  - approved reward rules and an eligibility definition;
  - an accounting design for how rewards post to the ledger;
  - a separate reviewed migration to lift SV014.
- **No invitation emails,** so there's no "Invited" status. Adding it needs approved email sending, consent handling and an invitation-event table.
- **Code storage:** the code is kept only in the sign-up URL, not in a cookie. If someone leaves the page and comes back without the link, they can type the code into the manual field.
- **Signal accuracy:** shared networks (offices, mobile carriers) can trigger `same_network`. That's why signals only flag for review.
- **Search scope:** admin search covers code, emails and customer references, not names.
