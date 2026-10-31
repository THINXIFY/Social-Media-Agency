# Sociotix — Backend Setup and Developer Guide (Phase 5A)

The frontend runs exactly as before with **no** backend configuration. Everything below is only needed to work on server code.

## Requirements

- Node.js 22 or later (developed on Node 24.21).
- PostgreSQL 16 or later. Docker is **not** required: `npm run db:local` starts a real PostgreSQL 18 from the `embedded-postgres` dev dependency. You can also use your own server.

## First-time setup

1. Copy the example environment file. It is git-ignored.

   ```bash
   cp .env.example .env.local
   ```

2. In `.env.local`:
   - Set `DATABASE_URL`. Choose your own user and password; never reuse a real one. Shape: `postgresql://<user>:<password>@localhost:5433/socivanta_dev`
   - Run `npm run auth:secrets` and paste the two lines it prints (`AUTH_SECRET`, `DATA_ENCRYPTION_KEY`).
   - Optionally set `DEMO_MODE=true` to see the illustrative dashboard and admin records after signing in.

3. Start the local database. Leave this terminal open.

   ```bash
   npm run db:local
   ```

4. In a second terminal, create the tables and load reference data:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

   The seed loads 5 roles, the 118 catalog services (none purchasable) and 6 platform ledger accounts.

5. Run the app:

   ```bash
   npm run dev
   ```

   Then open `http://localhost:3000/api/health` and check for `"database":"ok"`.

6. Create the first Owner (once):

   ```bash
   npm run auth:bootstrap-owner -- --email hello@thinxify.com --name "Farhan Z."
   ```

   Open `http://localhost:3000/dev/mailbox` (development only) and click the setup link. Set a password, scan the QR code with an authenticator app and save the recovery codes. Customers register at `/register`; their confirmation emails also appear in the dev mailbox. Full procedures are in [AUTHENTICATION.md](AUTHENTICATION.md).

**Stopping the database:**
- Press Ctrl+C in the `db:local` terminal.
- If you closed that terminal instead, run `npm run db:local -- --stop`.

## Commands

| Command | What it does | Where it may run |
|---|---|---|
| `npm run dev` / `build` / `start` | Next.js as before | anywhere |
| `npm run typecheck` | `tsc --noEmit` | anywhere |
| `npm run lint` | ESLint | anywhere |
| `npm test` | Unit and integration tests | anywhere (integration tests start a throwaway PostgreSQL) |
| `npm run test:unit` | Pure logic, no database | anywhere |
| `npm run test:integration` | Real PostgreSQL tests | anywhere |
| `npm run db:local` | Local PostgreSQL in `./.local/postgres` | APP_ENV development/test, localhost only |
| `npm run db:generate` | Generate a migration from schema changes | dev |
| `npm run db:migrate` | Apply pending migrations (idempotent) | any environment, including the production release step |
| `npm run db:seed` | Reference data only (roles, catalog, ledger accounts) | **development/test on localhost only** |
| `npm run db:reset [-- --seed]` | Drop and recreate the schema, migrate, optionally seed | **development/test on localhost only** |
| `npm run db:studio` | Drizzle Studio | dev |
| `npm run worker` | Background job worker (runs only the read-only ledger verification job) | needs `DATABASE_URL` |
| `npm run auth:secrets` | Print fresh `AUTH_SECRET` / `DATA_ENCRYPTION_KEY` values | anywhere (paste into `.env.local` or the host's secret store) |
| `npm run auth:bootstrap-owner -- --email … --name "…" [--resend]` | One-time first Owner invite (setup link by email) | operator only; refuses once an owner exists |
| `npm run dev:accounts -- --owner … --customer … --name "…"` | Create local Owner + Customer through the real flows (bootstrap/setup link, registration/verification link). Password from `DEV_ACCOUNT_PASSWORD` or a hidden prompt; existing accounts are never changed; owner MFA is enrolled by the owner at first sign-in | **development/test on localhost with captured email only** |
| `npm run auth:reset-mfa -- --email … --confirm` | Operator recovery: remove a staff member's authenticator and sign them out (audited) | operator only |

The seed and reset commands **refuse** to run when APP_ENV is preview or production, or when the database host isn't localhost. Scripts print `host:port/database`, never credentials.

## Environment variables

Validated in `src/server/env.ts`. Error messages name the variable, never its value.

| Variable | Required | Notes |
|---|---|---|
| `APP_ENV` | Yes when `NODE_ENV=production` | `development`, `test`, `preview` or `production` |
| `DATABASE_URL` | Production and preview; optional in development | Outside localhost it must include `sslmode=require` (or `verify-ca` or `verify-full`). Under `APP_ENV=test` the database name must contain `test` |
| `DATABASE_POOL_MAX` | No (default 10) | 1–50 connections per process |
| `LOG_LEVEL` | No (default `info`) | pino levels or `silent` |
| `TEST_DATABASE_URL` | No | Use your own test server instead of the embedded one. The database name must contain `test`; it is wiped |

Reserved for later phases (do not set yet): `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `EMAIL_API_KEY`.

## Migrations

- `drizzle/0000_foundation.sql` is generated from `src/server/db/schema/*`: 49 tables, keys, indexes and CHECK constraints.
- `drizzle/0001_safeguards.sql` is hand-written: triggers, the `purchasable_services` view and the order kill switch.
- `drizzle/0002_auth.sql` adds the authentication columns and rate-limit buckets (Phase 5B).
- `drizzle/0003_catalog_wallets.sql` adds the service editing columns (`version` for optimistic concurrency) and the `customers_open_wallet` trigger with its backfill (Phase 5C). Apply it with `npm run db:migrate`.

- `drizzle/0004_deposits_5d.sql` adds deposit idempotency and status-reason columns, the `cancelled` state, and the SV010 deposit state-machine trigger (Phase 5D).

**Payments configuration (Phase 5D):** every payment method is off by default. Bank transfer turns on only with `PAYMENTS_BANK_ENABLED=true` plus the business's real `PAYMENTS_BANK_ACCOUNT_NAME`, `PAYMENTS_BANK_NAME`, `PAYMENTS_BANK_ACCOUNT` (and optional `PAYMENTS_BANK_ROUTING`); never put made-up values here. Crypto, card and PayPal can't be enabled by configuration — they need an approved processor and an adapter. Run `npm run worker` to expire requests and reconcile the ledger on schedule.

- `drizzle/0005_orders_5e.sql` adds order payment/revenue states, the frozen price snapshot, manual-fulfilment fields and the SV011 order trigger (Phase 5E).

**Orders (Phase 5E):** checkout stays off unless `platform_settings['commerce.checkout_enabled']` is true **and** a service has all six eligibility gates and a current price — never set these in a real environment without approval. `REVENUE_RECOGNITION_POLICY` defaults to `deferred` (decision D5).

**Demo vs live:** `DEMO_MODE=true` in `.env.local` shows the illustrative dashboard and admin data; `DEMO_MODE=false` shows real records with honest empty states. Restart the dev server after changing it. Production refuses demo mode.

**Changing the schema:**
1. Edit `src/server/db/schema/*`.
2. Run `npm run db:generate -- --name <change>` and review the generated SQL.
3. Run `npm run db:migrate`.
4. For trigger or SQL-only changes, use `npx drizzle-kit generate --custom --name <change>`.

**Rollback:**
- Production is forward-only: write a new migration, or use point-in-time recovery for disasters.
- For development and test, `drizzle/rollback/*.down.sql` reverts each migration in reverse order. The test suite exercises up → down → up.

## Backend folder structure

```
src/server/                     # server-only code (every file imports "server-only")
  env.ts                        # validated configuration
  log.ts                        # pino logger with secret redaction
  errors.ts                     # AppError, error codes, Postgres → AppError mapping
  http.ts                       # route() wrapper + consistent JSON error responses
  health.ts                     # readiness check
  db/
    client.ts                   # pooled Drizzle client (getDb, createDb, pingDatabase)
    schema/                     # table definitions (plain, loadable by drizzle-kit)
      enums.ts helpers.ts identity.ts catalog.ts ledger.ts commerce.ts engagement.ts
  auth/
    index.ts                    # Actor, getCurrentActor (null until 5B), requireCustomer/requireStaff, authorize
    permissions.ts              # Permission type + allows()
    role-templates.ts           # approved role templates (kept in sync with the admin UI)
  ledger/
    money.ts                    # integer cents, exact BigInt order totals
    accounts.ts                 # system accounts, wallets, clearing accounts
    ledger.ts                   # postJournalEntry (idempotent, locked), balanceOf, verifyLedger
    operations.ts               # creditDeposit / chargeOrder / refundOrder / adjustWallet — all fail closed
  jobs/
    definitions.ts              # every job, enabled or disabled, with retry policy
    queue.ts                    # pg-boss start + enqueue (idempotency key, disabled jobs refused)
    handlers.ts                 # handlers for enabled jobs (ledger verification only)
src/worker/index.ts             # worker process entry
src/app/api/health/route.ts     # GET /api/health
scripts/db/                     # local, migrate, seed, reset (+ shared guards)
drizzle/                        # migrations, meta, rollback/
tests/unit, tests/integration, tests/setup
```

## Integration tests

- `tests/setup/postgres.ts` starts a throwaway embedded PostgreSQL. It uses a random port and password, migrates it, and deletes it afterwards.
- Set `TEST_DATABASE_URL` to use another server instead.
- Test files run one at a time against one database and use unique data, so the append-only tables never need truncating.
