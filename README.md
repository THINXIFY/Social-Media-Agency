# Sociotix

**Smarter Social. Bigger Impact.** Sociotix is an AI-powered social growth and marketing platform in development: a marketplace for social media services, customer and admin dashboards, AI-assisted tools, and a social account management workspace. It is built on one Next.js codebase with a PostgreSQL backend.

> **Rebrand note:** the platform was previously called **SociVanta**. All public, customer and admin interfaces now use Sociotix. Some internal identifiers keep the old name for compatibility: the local database names (`socivanta_dev`), the project folder and the GitHub repository name. The phase reports in `docs/` keep the old name as historical records. See [`docs/branding/SOCIOTIX_REBRANDING_REPORT.md`](docs/branding/SOCIOTIX_REBRANDING_REPORT.md). The intended domain is `sociotix.com`. It is used only once ownership and deployment are confirmed, through `APP_URL`.

> **Status: in development, not live.** Sociotix isn't deployed, and it isn't production-ready. Real payments, AI generation, SMM provider fulfilment, external social publishing and monetary referral rewards are **disabled**, and each stays off until it's separately approved and configured. See [Activation limits](#activation-limits).

## Features

**Public website**
- Homepage and marketplace: 118 services across 15 platforms.
- AI tools hub with guided tool pages.
- Social management overview, pricing and a Help Center.

**Customer dashboard**
- Overview, New Order, Orders, Wallet/Add Funds, Transactions and Service Finder.
- AI workspace, plus Social workspace: accounts, publishing, calendar, automations, campaigns and activity.
- Support tickets, referrals, profile, settings and sign-in security.

**Admin dashboard**
- Overview analytics, Reports with CSV export, Services & Pricing, and Orders.
- Providers, Customers, Payments, Support and Referrals.
- AI Management (AI Control Center), Platform Settings, and Staff & Account.

**Backend**
- **Auth:** email/password with Argon2id. Mandatory staff MFA (TOTP), role-based permissions, and re-authentication for sensitive changes.
- **Money:** an append-only, trigger-enforced double-entry wallet ledger. Order and deposit workflows use idempotency keys.
- **Jobs:** a PostgreSQL-backed job queue (pg-boss) and a separate worker process.
- **Audit and security:** audit log, rate limiting, security headers and Content Security Policy.

## Activation limits

These integrations are built to **fail closed**: until each is approved, its code path refuses work, and the UI says so honestly.

| Capability | State | What turns it on |
|---|---|---|
| Payments / deposits | Off. No payment processor approved; webhooks return `FEATURE_DISABLED`. | A processor decision, credentials, a sandbox test, then explicit enablement |
| SMM provider fulfilment | Off. No provider adapter is registered. | Supplier verification, SSRF controls, an adapter, then per-service eligibility |
| AI generation | Off. The launch switch stays off until a live provider test passes. | Provider key, priced model, daily budget, then the AI Control Center test |
| Social publishing | Off. No platform adapters. | Each platform's app review, OAuth credentials, then adapters |
| Referral rewards | Off. A database guard blocks reward activation. | Approved reward rules and policy |

Production prerequisites (backups, a trusted proxy with rate and body limits, monitoring, a UTF-8 database) are listed in [`docs/backend/PHASE_5I_B_LAUNCH_READINESS_REPORT.md`](docs/backend/PHASE_5I_B_LAUNCH_READINESS_REPORT.md).

## Tech stack

| Area | Tools |
|---|---|
| App | Next.js 16 (App Router, Turbopack, `cacheComponents`), React 19, TypeScript |
| UI | Tailwind CSS v4, Base UI, lucide icons, Motion |
| Data | PostgreSQL 16+ with Drizzle ORM and SQL migrations; pg-boss for jobs |
| Validation and AI | zod; the Anthropic SDK, behind the AI Control Center |
| Testing | Vitest (unit tests, plus integration tests against real PostgreSQL) |

## Getting started

**Requirements:** Node.js 20.9 or later (developed on Node 24) and npm. Docker isn't needed: `npm run db:local` runs a real local PostgreSQL.

1. **Install and configure:**

   ```bash
   npm install
   cp .env.example .env.local
   ```

2. **Fill in `.env.local`:**
   - **`DATABASE_URL`:** choose your own local user and password. Never commit this file.
   - **`AUTH_SECRET` and `DATA_ENCRYPTION_KEY`:** run `npm run auth:secrets` and paste the two lines it prints.

3. **Start the database and app** (in separate terminals):

   ```bash
   npm run db:local        # local PostgreSQL on port 5433 (keep this terminal open)
   npm run db:migrate      # apply migrations
   npm run db:seed         # reference data only: roles, catalog, ledger accounts
   npm run dev             # http://localhost:3000
   ```

4. **Create the first Owner** (one time):

   ```bash
   npm run auth:bootstrap-owner -- --email you@example.com --name "Your Name"
   ```

In development, emails are captured in the in-app dev mailbox instead of being sent. The full guide is [`docs/backend/BACKEND_SETUP.md`](docs/backend/BACKEND_SETUP.md).

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js development server, production build, production server |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm run lint` | ESLint |
| `npm test` | All tests. Integration tests create and drop their own scratch databases. |
| `npm run test:unit` / `test:integration` | One test project only |
| `npm run worker` | Background job worker |
| `npm run db:local` | Local PostgreSQL in `./.local/postgres` (development only) |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply pending migrations (idempotent; also the production release step) |
| `npm run db:seed` / `db:reset` | Reference data / recreate the schema (**local development only**) |
| `npm run auth:secrets` | Print fresh `AUTH_SECRET` / `DATA_ENCRYPTION_KEY` values |
| `npm run auth:bootstrap-owner` / `auth:reset-mfa` | Operator tools for the first Owner and MFA recovery |

## Database migrations

- **Location:** migrations live in [`drizzle/`](drizzle/) (`0000`–`0016`), with matching rollback scripts in [`drizzle/rollback/`](drizzle/rollback/).
- **To change the schema:**
  1. Edit `src/server/db/schema`.
  2. Run `npm run db:generate -- --name <change>` and review the SQL.
  3. Run `npm run db:migrate`.
- **Financial history is append-only:** database triggers enforce ledger balance and immutability, and those safeguards must not be weakened.
- **More detail:** [`docs/backend/DATABASE.md`](docs/backend/DATABASE.md).

## Project structure

```
src/
  app/          routes: public site, (auth), dashboard, admin, api/*
  components/   UI: site, dashboard, admin, ai, social, auth, ui primitives
  lib/          shared types, catalog, SEO helpers, i18n, client utilities
  server/       backend: auth, db (schema + client), ledger, orders, payments,
                providers, ai, social, support, referrals, analytics, jobs
  worker/       background worker entry point
  proxy.ts      request proxy (optimistic routing and no-store/noindex headers)
drizzle/        SQL migrations, snapshots and rollbacks
scripts/        database, auth and dev tooling
tests/          unit/ and integration/ (Vitest)
docs/           architecture, security, SEO standards and phase reports
```

## Security

- **Secrets:** never commit secrets. `.env*` files are git-ignored, except `.env.example`, which holds variable names and safe placeholders only.
- **Server-side checks:** the proxy is not the security boundary. Every page, server action and route handler checks the session and permissions against the database.
- **Reporting:** report security concerns privately to the repository owner rather than in a public issue.

## Documentation

- **Architecture and backend:** [`docs/backend/ARCHITECTURE.md`](docs/backend/ARCHITECTURE.md), [`AUTHENTICATION.md`](docs/backend/AUTHENTICATION.md), [`DATABASE.md`](docs/backend/DATABASE.md), [`SECURITY.md`](docs/backend/SECURITY.md), [`OPEN_DECISIONS.md`](docs/backend/OPEN_DECISIONS.md)
- **Phase reports:** [`docs/backend/PHASE_5A_REPORT.md`](docs/backend/PHASE_5A_REPORT.md) through [`PHASE_5I_B_LAUNCH_READINESS_REPORT.md`](docs/backend/PHASE_5I_B_LAUNCH_READINESS_REPORT.md)
- **AI modules:** [`docs/ai/`](docs/ai/)
- **SEO standards:** [`docs/seo/SEO_STANDARDS.md`](docs/seo/SEO_STANDARDS.md)
- **GitHub sync record:** [`docs/deployment/GITHUB_SYNC_REPORT.md`](docs/deployment/GITHUB_SYNC_REPORT.md)
