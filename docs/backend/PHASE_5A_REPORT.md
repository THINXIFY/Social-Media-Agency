# Phase 5A — Backend Foundation: Implementation Report

Status: **complete, with the remaining items listed below.** The frontend is unchanged: no page, component or demo store was modified.

## What was built

| Area | Delivered |
|---|---|
| Stack | Next.js 16 modular monolith. PostgreSQL via **Drizzle ORM 0.45** and drizzle-kit migrations. Zod 4 validation. **pg-boss 12** for jobs. pino logging |
| Schema | 49 tables covering identity, sessions and MFA, customers, staff, roles and permissions, invitations, catalog, price versions, eligibility, orders, order events, reviews, refunds, providers, credentials, mappings, health checks, fulfilment attempts, ledger accounts, entries, lines, balances, deposits, deposit reviews, webhook events, tickets, messages, internal notes, attachments, referral codes, policies, referrals, rewards and events, notifications, notification preferences, email outbox, settings, staff notes and the audit log |
| Status types | Text columns with CHECK lists from `schema/enums.ts`, which Zod reuses |
| Database safeguards | Append-only ledger, price history, order events, refunds, deposit reviews, referral events and audit log. Balanced entries checked at commit. Trigger-maintained balances that can't go negative for wallets. Refund cap. Last-owner protection, safe under concurrency. Owner role locked. Distinct second deposit reviewer. `purchasable_services` view. Orders refused unless checkout is switched on **and** the service passes every gate |
| Ledger service | `postJournalEntry`: validation, request hashing, idempotency including concurrent retries, row locks in a stable order, a friendly insufficient-funds error, and four-eyes approval. Also `balanceOf` and `verifyLedger` |
| Fail-closed boundary | `getCurrentActor()` returns null, so `requireCustomer` and `requireStaff` always refuse. `authorize()` reads the staff member's current role and status from the database. All money operations are hard-wired off (`FINANCIAL_OPERATIONS_ENABLED = false`) |
| Errors and HTTP | `AppError` with stable codes. Postgres and safeguard errors are mapped. `route()` adds a request ID, returns no-store JSON errors, never echoes inputs, and lets Next control flow through (`unstable_rethrow`) |
| Logging | pino JSON with redaction of passwords, tokens, keys, cookies, authorization headers, ciphertext and connection strings. URL passwords are scrubbed in error messages |
| Environment | Zod-validated and lazy, so the frontend works without it. Production requires explicit APP_ENV and a TLS database. The test environment only accepts databases named `*test*` |
| Jobs | Registry of 7 jobs. Only `maintenance.verify-ledger` (read-only) is enabled; queuing the other six fails closed. Worker process with graceful shutdown |
| Health | `GET /api/health`: 200 when configuration and database are OK; otherwise 503 with `not_configured`, `unreachable` or `invalid`, and no details |
| Scripts | `db:local`, `db:migrate`, `db:seed`, `db:reset`, `worker`. Destructive scripts are guarded to development/test on localhost |
| Docs | [BACKEND_SETUP.md](BACKEND_SETUP.md), this report, and corrections in the other planning documents |

## Tests: exact results (last run)

| Suite | Result | Notes |
|---|---|---|
| Unit (`npm run test:unit`) | **32 / 32 passed** | Env validation, error/HTTP format, log redaction, money maths, permission model and template sync with the admin UI, fail-closed guards and money ops, disabled jobs, health without a database, server-only boundaries, `.env.example` placeholders |
| Integration (`npm run test:integration`) | **31 / 31 passed** against **real PostgreSQL 18.4** (embedded server started by the test setup) | Migrations up, idempotent, down and up again. FK, unique and check constraints. Owner, last-owner, second-review, refund-cap and order kill-switch safeguards. Ledger balancing, immutability (including raw SQL and TRUNCATE), negative-balance protection (including raw SQL), **25 concurrent debits → exactly 10 succeed**, idempotent replay including 12 concurrent same-key posts, four-eyes approval. Seed idempotency. Database-backed authorization. `/api/health` with a database. pg-boss job execution |
| Typecheck | Pass | |
| ESLint (`--max-warnings=0`) | Pass | |
| Production build | Pass | `/api/health` is dynamic; all existing pages still build |
| Manual script run | Pass | `db:local` → `db:migrate` twice → `db:seed` twice → `db:reset --seed`. Guards refused production and a remote host. The worker registered its job. `next start` against the database returned health 200. No output contained the password |
| Frontend regressions | All passed | Browser scripts outside the repo: customer journey 38/38, admin shell 19/19, KPIs 23/23, analytics 65/65, referrals 73/73, settings 74/74, staff 76/76, payments 50/50 (49/50 in the batch run; the Back-closes-drawer check passed on rerun), dropdowns 48/48. In the batch, 1–2 "Escape closes, focus returns" checks failed intermittently because of the script's fixed 250 ms wait; with 700 ms they passed 48/48 twice. No frontend code changed in 5A |

## Deviations from the approved plan

| Plan | Actual | Why |
|---|---|---|
| Local Postgres via docker compose | `embedded-postgres` dev dependency (`npm run db:local`); any external Postgres also works | Docker isn't installed on this machine. This still runs a genuine PostgreSQL server, not an in-memory substitute |
| Vitest (latest) | Vitest **4.1.12** | Vitest 5 requires `@types/node` 22 or later. Upgrading the frontend's pinned `@types/node` 20 was out of scope |
| Sentry in 5A | Not added | Needs an account/DSN decision. pino is in place; Sentry moves to 5I (or earlier once D1 is decided) |
| Move browser checks into `tests/e2e`, add CI | Not done | There is no Git repository (D11), and Playwright isn't a project dependency. Planned with the Git baseline |
| Interim admin lock for public deploys | Not implemented in code | Real protection is Phase 5B. **Do not deploy publicly before 5B**, or put the deploy behind the host's password protection |
| Separate down migrations in drizzle-kit | `drizzle/rollback/*.down.sql`, used by tests | drizzle-kit is forward-only by design |
| `legal_reviewed` gate | Added as a sixth eligibility gate | SECURITY.md §6 lists legal review; the gate makes it enforceable |
| Order kill switch | `platform_settings['commerce.checkout_enabled']` must be `true`, plus the service must be purchasable, checked by a database trigger | Defence in depth against accidental checkout |

## Assumptions (pending owner decisions)

- **D5 (revenue recognition):** the ledger is modelled for revenue *at completion*, using the `orders_in_progress` account. Revenue-at-payment would only change which postings are used.
- **D7 (order IDs):** `orders.public_ref` is unique but its format isn't constrained yet.
- **D6 (reward destination):** policies support both `rewards` and `wallet`.
- Money columns use `bigint` read as JavaScript numbers. That is exact up to about $90 trillion; `assertCents` caps any single amount at $100M.

## Remaining blockers

1. **No Git repository (D11).** Nothing is version-controlled yet. Approve `git init` and the baseline tag before 5B.
2. **Hosting and managed Postgres (D1).** Needed for preview and production databases and for CI.
3. **Auth library (D9), email provider (D4), domain (D14).** Needed to start 5B.

## Phase 5B prerequisites

- D11 Git baseline. D1 hosting. D9 auth approach. D4 and D14 email and domain (verification, reset and invitations send email).
- Generate a `DATA_ENCRYPTION_KEY` (MFA secrets) and a `SESSION_SECRET` in the host's secret store; never commit them.
- **The only change 5B needs at the auth boundary:** implement `getCurrentActor()` in `src/server/auth/index.ts` from a database session. Then add `proxy.ts` optimistic redirects for `/admin` and `/dashboard`.
- Bootstrap the first owner with a one-off CLI script. Never seed a default admin.
