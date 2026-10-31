# Sociotix — Backend Architecture

Status: **approved plan. Phase 5A (foundation) is implemented**: see [PHASE_5A_REPORT.md](PHASE_5A_REPORT.md) and [BACKEND_SETUP.md](BACKEND_SETUP.md). Sections below describe the target architecture; the 5A report lists where the implementation differs.
Companion documents: [DATABASE.md](DATABASE.md) · [FRONTEND_BACKEND_MAP.md](FRONTEND_BACKEND_MAP.md) · [SECURITY.md](SECURITY.md) · [PHASE_5_ROADMAP.md](PHASE_5_ROADMAP.md) · [OPEN_DECISIONS.md](OPEN_DECISIONS.md)

---

## Executive summary

**Current frontend readiness.**
- The public site, the customer dashboard (10 pages) and the admin panel (11 modules) are complete as **interfaces**.
- They are not yet a working product:
  - There is no server code, no database, no authentication, no API route, no `proxy.ts` and no environment configuration.
  - Every figure comes from demo data in `src/lib/*.ts` or from 15 `localStorage` keys.
  - Ordering and payments are deliberately switched off: no service is purchasable, and deposits are previews only.
- The interfaces are honest about this, and they encode a great deal of useful business logic that the backend should adopt: eligibility checks, verification checklists, validation rules, role templates and wallet reconciliation formulas.

**Recommended stack.** A modular monolith inside the existing Next.js 16 app:

| Layer | Recommendation |
|---|---|
| Server code | Route Handlers and Server Actions over a typed server-only domain layer |
| Database | PostgreSQL, accessed through Drizzle ORM with SQL migrations |
| Background work | One worker process using a Postgres-backed job queue (pg-boss), so there is no Redis |
| Authentication | Database-backed sessions; staff must use two-factor authentication |
| Money | Integer USD cents and an immutable double-entry ledger |
| Logging and errors | Structured logging (pino) and error tracking (Sentry) |
| Tests | Vitest for the domain layer and Playwright for end-to-end flows |

**The five highest-priority risks** (detail in [SECURITY.md](SECURITY.md)):
1. Admin routes and actions have no authentication or authorization. *Critical.*
2. No authoritative server-side money handling exists yet, so the client must never be trusted for prices or balances. *Critical.*
3. Payment webhooks could be spoofed or replayed, crediting the same payment twice. *Critical.*
4. Provider credentials could leak, or provider endpoints could be abused for SSRF. *High.*
5. Platform-policy and payment-processor acceptance risk for the catalog: many social-engagement services may be prohibited. *High; a business risk.*

**Proposed Phase 5 sequence** (refined from the brief; reasons in the roadmap):

| Phase | Scope |
|---|---|
| 5A | Foundation |
| 5B | Authentication and staff access |
| 5C | Catalog, customers and the ledger core |
| 5D | Deposits and payments |
| 5E | Real orders with manual fulfilment |
| 5F | Provider integrations |
| 5G | Support, referrals and notifications |
| 5H | Analytics, settings and audit |
| 5I | Hardening and launch readiness |

**Decisions needed before coding** (full list in [OPEN_DECISIONS.md](OPEN_DECISIONS.md)):
- Hosting and managed Postgres provider.
- Auth library, or building on a documented pattern.
- Payment processors, and confirmation that they accept this business category.
- Which catalog services are legally and commercially sellable.
- Revenue recognition: when an order payment becomes revenue.
- Referral reward destination.
- Putting the project under Git and agreeing a baseline (the folder is **not** a Git repository today).

---

## 1. What exists today (inspected)

| Area | Evidence | State |
|---|---|---|
| Framework | `package.json`: `next 16.4.3`, `react 19.3.0`, Tailwind v4, Base UI, lucide, motion, next-themes | Implemented |
| Config | `next.config.ts`: `cacheComponents: true`, `partialPrefetching: true`, Turbopack CSS rule | Implemented |
| Routes | `src/app/page.tsx`; `src/app/dashboard/*` (10 pages); `src/app/admin/*` (11 pages) | UI complete |
| Server code | No `route.ts`, no `"use server"`, no `proxy.ts`/`middleware.ts`, no `.env*` | **Missing** |
| Database / ORM | None in dependencies | **Missing** |
| Auth | None. The admin identity is the constant `ADMIN_USER`; the customer is the constant `DEMO_USER` | **Missing** |
| Data | `src/lib/catalog.ts` (15 platforms, 118 services, 10 categories, `ACTIVATIONS = {}`), `admin-demo.ts` (14 customers, 52 orders, deposits, 4 tickets), `demo-account.ts`, `demo-support.ts`, `demo-referrals.ts` | Demo, read-only |
| Browser storage | 15 keys: `sv-demo-state`, `sv-display`, `sv-finder-query`, `sv-sidebar-collapsed`, `sv-admin-*` (orders, orders-queue, services, customers, payments, providers, support, referrals, settings, staff, sidebar-collapsed) | Simulated persistence |
| Ordering | `new-order.tsx`: the final step is always disabled ("Checkout opens in the next phase") | Disabled by design |
| Payments | `payments.ts`: `PAYMENTS_LIVE = false`; `admin-services.ts`: `PAYMENT_PROVIDER_APPROVED = false`; Add Funds stores previews only | Disabled by design |
| Uploads | Ticket attachments are simulated metadata; the avatar uses a local object URL only | Simulated |
| Tests | No test runner, test files or CI in the repository. The Playwright checks used during development live outside it | **Missing in repo** |
| Deployment | No Dockerfile, CI config or platform config. `README.md` is the create-next-app default | **Missing** |
| Version control | `git status` fails: *not a git repository* | **Missing** |

Two demo datasets are intentionally separate:
- The customer dashboard uses account `ACC-7F3K29` with orders `SV-105xx`.
- The admin panel uses customers `CUS-1041…1054`, orders `ORD-48xxx`, deposits `DEP-…` and tickets `TCK-31xx`.

The two sides also use different order status vocabularies:
- Customer side: `pending`, `processing`, `attention`, `completed`, `cancelled`.
- Admin side: `review`, `queued`, `in_progress`, `completed`, `cancelled`, `refunded`.

The backend needs **one canonical status model with a customer-facing projection** (see [DATABASE.md](DATABASE.md) §4).

## 2. Architecture decisions

### 2.1 A modular monolith in the existing Next.js app

```
src/
  app/                     # existing pages (unchanged), plus app/api/** for webhooks and public JSON
  server/                  # NEW, server-only (import "server-only")
    db/                    # Drizzle schema, client, migrations
    auth/                  # sessions, password, MFA, getCurrentUser / requireStaff
    modules/
      catalog/  customers/  orders/  wallet/  payments/  providers/
      support/  referrals/  notifications/  settings/  staff/  audit/  analytics/
        *.service.ts       # business rules: the only code that writes
        *.queries.ts       # read models used by pages
        *.schema.ts        # Zod input schemas, shared with forms
        *.actions.ts       # thin Server Actions: authenticate → authorize → validate → call service
  worker/                  # NEW: job handlers run by a separate Node process
```

**Why.**
- There is one team, one deploy and one database, with strong transactional needs (wallet plus order in a single transaction).
- Microservices would add network failure modes around exactly the operations that must be atomic.
- Module boundaries are enforced by convention: modules call each other's services, never each other's tables.

**Server Actions or Route Handlers.**
- **Server Actions** handle form mutations from the existing UI. Next.js handles CSRF origin checks, and each action is wrapped by a helper that enforces authentication, permission, input schema, rate limit and audit.
- **Route Handlers** (`app/api/**`) handle:
  - Inbound webhooks from payment processors and providers.
  - Health checks.
  - Any JSON the client fetches directly, such as polling order status.

**Cache Components.**
- The app has `cacheComponents: true`. Session-dependent reads must follow `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`.
- That means a single `getCurrentUser()` in a Data Access Layer, and never caching per-user financial data across users.
- `AGENTS.md` warns that this Next.js version differs from older ones; developers must read the bundled docs before writing routing or auth code.

**Proxy.**
- In Next 16, `middleware.ts` is renamed **`proxy.ts`**.
- Use it only for *optimistic* redirects, such as sending a request to `/admin/**` without a staff session to the sign-in page.
- Real authorization happens in the Data Access Layer and every action. The bundled docs state Proxy must not be the authorization solution.

### 2.2 Database: PostgreSQL with Drizzle

- PostgreSQL provides transactions, row locks (`SELECT … FOR UPDATE`), `CHECK` constraints, partial unique indexes and `numeric`/`bigint`. The ledger depends on all of these.
- Drizzle is SQL-first and type-safe, has no runtime engine binary, and makes raw SQL easy where the ledger needs it. Migrations are generated by `drizzle-kit` and reviewed as SQL.
- Prisma is an acceptable alternative (an open decision); the schema in DATABASE.md is ORM-neutral.
- Use a managed Postgres with point-in-time recovery and daily backups. Use one database with schemas or table prefixes per module, not one database per module.

### 2.3 Authentication and sessions

**Customers:**
- Email and password, hashed with **argon2id**.
- Email verification and password reset use single-use, hashed, expiring tokens.
- Optional TOTP two-factor authentication.

**Staff:**
- Same identity table with a `staff_members` link.
- **TOTP two-factor authentication required**, with recovery codes.
- Shorter idle and absolute session lifetimes, and re-authentication for sensitive actions.

**Sessions:**
- Opaque random token in an `HttpOnly; Secure; SameSite=Lax` cookie. Only the token's hash is stored, in `sessions`.
- Sessions can be revoked: logout, password change and staff removal kill them instantly.
- Avoid stateless JWT sessions, because revocation matters for staff.

**Library:**
- Use a maintained library that supports this model with Postgres storage.
- Better Auth fits the stack, but this is an **open decision**. Rolling our own is acceptable only by following the Next.js authentication guide closely.

### 2.4 Authorization

- Permissions are checked **on the server for every action and every read of sensitive data**.
- The model mirrors what the admin UI already designed in `src/lib/admin-staff.ts`:
  - 10 modules × {none, view, manage}.
  - 8 named sensitive permissions (approve deposits, issue refunds, adjust wallets, change prices, configure providers, approve rewards, manage staff, security settings).
  - 5 role templates, with per-role caps.
- One function, `authorize(actor, permission, resource?)`, is used by every service. Customer-owned resources are always fetched with `WHERE customer_id = $actor` to prevent IDOR.
- Four-eyes approval (maker/checker) applies to configurable high-risk money actions, such as deposits at or above the "second review" threshold already present in Admin Settings.

### 2.5 Background jobs: one worker, a Postgres queue

- Use **pg-boss**, which keeps jobs in Postgres and supports retries, scheduling and singleton jobs.
- **Why not Redis or BullMQ:** one less piece of infrastructure, and jobs can be enqueued **in the same transaction** as the business change.
- Jobs:
  - Provider submission and status polling.
  - Webhook post-processing.
  - Emails.
  - Referral qualification and hold expiry.
  - Pending-deposit expiry.
  - Daily reconciliation.
  - Analytics roll-ups.
- The worker runs as a separate long-lived Node process (`node dist/worker.js`) from the same codebase.

### 2.6 Files (only where needed)

- Two genuine needs: **support ticket attachments** and **customer avatars**.
- Use S3-compatible object storage (for example Cloudflare R2 or S3) with private buckets, signed upload URLs and server-side type and size validation. Serve files through short-lived signed URLs.
- Deferred to 5G. Nothing else needs file storage. Deposit "proof" screenshots are **not** collected, because the payments design already treats them as non-evidence.

### 2.7 Secrets

**Platform secrets** live only in the hosting platform's secret store as environment variables, never in the repo:
- Database URL.
- Session secret.
- Encryption key.
- Processor and webhook secrets.
- Email API key.

**Provider API keys** entered by staff:
- Encrypted with AES-256-GCM under a key-encryption key from the environment (or a KMS), and stored in `provider_credentials`.
- Never returned to the browser; the UI shows only "configured" and the last 4 characters.
- Rotatable.
- This matches the UI's existing rule that keys never enter browser storage.

### 2.8 Logging, monitoring, errors

- **pino** JSON logs with request ID, actor ID and module. Personal data is redacted (emails masked; no tokens, keys or full links logged).
- **Sentry**, or an equivalent, for exceptions in web and worker, with personal data scrubbing.
- **`audit_log` table:** an append-only business audit (who did what, before and after, IP, user agent). This is separate from technical logs.
- **Health:** `/api/health` (database ping), plus worker heartbeat and queue-depth alerts.
- **Reconciliation alerts:** the daily ledger-versus-processor and ledger-sum checks page the owner on any mismatch.
- **Errors:** services throw typed domain errors (such as `InsufficientFunds` or `NotPurchasable`). Actions map them to user-safe messages in the tone the UI already uses. Stack traces never reach the client.

### 2.9 Local development, testing, deployment

**Local development:**
- `docker compose` with Postgres (plus Mailpit for email capture).
- `.env.example` checked in; `.env.local` ignored.
- A seed script loads the **existing demo data** (same IDs) into a dev database, so screens look identical while switching to real queries.

**Tests:**
- Vitest unit tests for pure rules: pricing, eligibility, referral qualification.
- Vitest integration tests against a real Postgres for the ledger, orders and concurrency (parallel debits must never overdraw).
- Playwright end-to-end tests, porting the existing browser checks into `tests/e2e/`.

**CI:** typecheck, lint, unit and integration tests, build, then end-to-end tests on a preview deploy.

**Deployment:** one web service plus one worker service plus managed Postgres, on a platform that runs both (open decision). Migrations run as a release step before traffic shifts.

## 3. Cross-cutting rules

1. **The server is the only source of truth for money, prices, eligibility and permissions.** The client sends intent (service, quantity, link); the server computes and snapshots the price.
2. **Every money movement is a balanced journal entry with an idempotency key.** Balances are derived from or verified against the ledger.
3. **Nothing purchasable by default.** A service sells only when every eligibility gate passes (DATABASE.md §3). This mirrors `eligibility()` in `admin-services.ts`.
4. **Demo data never mixes with real data.** Demo seeds load only in development and preview environments, behind an environment guard.
5. **Gradual replacement.** Each page swaps its `src/lib/demo-*` import for a server query with the same shape, one module at a time. The UI components stay.
