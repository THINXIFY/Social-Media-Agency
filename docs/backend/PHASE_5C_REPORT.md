# Phase 5C — Real Data & Core Wallet Integration: Implementation Report

Status: **complete**. Customer and admin screens now read and write real records. Every money movement is still disabled: checkout, order creation, deposits, payments, wallet credits and debits, refunds, provider fulfilment and referral payouts.

## Delivered

| Area | What was built |
|---|---|
| Migration 0003 (`0003_catalog_wallets`) | `services` gains `instructions`, `internal_notes`, `fulfillment_type`, `fulfillment_provider_ref`, `fulfillment_notes`, `min_qty`/`max_qty`, `draft`, `version` (optimistic concurrency) and `updated_by`, plus CHECKs for quantities, fulfilment type and text lengths. A trigger `customers_open_wallet` opens exactly one USD wallet (`wallet:<customer uuid>`, liability, `allow_negative = false`) for every new customer. An idempotent backfill opens one for existing customers. Rollback: `drizzle/rollback/0003_catalog_wallets.down.sql` (wallet accounts are kept, because ledger accounts are immutable) |
| Catalog (server) | `src/server/catalog/catalog.ts`. A public read path (`listPublicServices`: visible, non-archived, non-draft only; search, platform, type, sort, pagination of at most 48) is kept separate from the staff path (`listAdminServices` and `getAdminService`). Public results carry customer-safe fields only. A price and limits appear only when the service is in `purchasable_services`, which is impossible while checkout is off |
| Service editing | `updateService` and `createService` re-run the editor's validation on the server: pricing model for the type, price and cost formats, price ≥ cost, limits, a permanent ID, provider references that look like secrets refused, and a saved price that can't be removed. A price change needs the `changePrices` permission and appends a new `service_price_versions` row. Review gates write `service_eligibility` with who and when. Every save names the version it was based on, and a stale version gets **409**. `bulkUpdateServices` (show/hide, archive/restore) is all-or-nothing. Audit events: `service.updated`, `service.created`, `service.price_versioned`, `service.gate_recorded`, `service.bulk_updated` |
| Wallets (server) | `src/server/wallet/wallet.ts`. Balance is `−Σ journal_lines` on the wallet account. Pending deposits are reported separately and aren't spendable. History is paginated, with customer-facing labels only. **There is no write path** — no endpoint, action or function credits or debits a wallet |
| Customers (server) | `src/server/customers/customers.ts`: own profile read and update (strict schema; email not editable; same validation as the form plus a country whitelist; audited as `customer.profile_updated`), preferences, `accountSnapshot` for the dashboard, the staff directory (search, verified/status filters, sort, at most 50 per page; balance from `account_balances`, order count from `orders`, last sign-in from `auth.login` audit entries) and staff detail by `CUS-…` reference |
| Mode boundary | `DemoGate` (customer) and `SectionGate` (admin) take a `live` view. `DEMO_MODE=true` renders the illustrative views. `DEMO_MODE=false` renders the live view, or "not connected yet" for areas without a backend. Demo mode is refused in production (5B rule). A failure in live mode shows an error state or the error page, **never** sample data. In live mode the demo-store hooks (`useProfile`, `useDemoOrders`, `useDemoActivity`, `useTickets`, `usePaymentPreviews`) return the real profile or empty lists, so no screen can show a sample record to a real account. The previously ungated **Transactions** and **Support** pages are now gated |
| Customer dashboard (live) | Overview: name, ledger balance, pending deposits, order count, honest empty states. New Order and Add Funds are shown as disabled "opens soon". Transactions: balance and read-only history. My Orders: empty state. Services: the database catalog with search, filters, sort and pagination. My Profile: the approved page, saving to the server with saving/error states (a field rejected by the server is highlighted) and the email read-only. Settings: the approved page; currency, time zone, date format and reduced motion sync to the account. Top bar: real balance (USD), real name and account ID, no demo reset, empty notifications. New Order, Add Funds, Support and Referrals stay "not connected yet" |
| Admin Services & Pricing (live) | The approved page and editor on a data-source layer (`src/components/admin/service-source.ts`). Set Price → Save → Priced persists to the database. Saves are pessimistic, so the list changes only after the server confirms (nothing to roll back). The editor shows a saving state, stays open on any error with every edit kept, and a version conflict reloads the list with a clear message. The demo tag and demo reset are hidden. A search bug (`/s+/` → `/\s+/`) is fixed |
| Admin Customers (live) | New directory (`src/components/admin/live-customers.tsx`) in the admin design language. Search, verification and status filters, sort, pagination and a responsive table/cards layout. A read-only detail sheet deep-links via `?customer=CUS-…`. Every figure is a stored one: balance, pending, orders, joined, last sign-in, open flags |
| Admin shell (live) | No sample queue counts, alerts, notifications or search results. Search explains that it isn't connected yet |
| API errors | Validation errors now include the rejected `field` name (never the submitted value) so forms can point at the input |

## APIs added

| Method and path | Auth | Notes |
|---|---|---|
| `GET /api/catalog/services` | public | `q`, `platform`, `category`, `sort` (name/platform), `page`, `pageSize` ≤ 48. `cache-control: public, max-age=60`. Customer-safe fields only |
| `GET`/`PATCH /api/account/profile` | customer | The id comes from the session only. Strict body (unknown keys, including `email` or another customer's id, give 400). Same-origin check on PATCH |
| `GET`/`PATCH /api/account/preferences` | customer | Display currency, time zone (whitelist), date format, reduced motion |
| `GET /api/account/wallet` | customer | `{ currency, availableCents, pendingCents, hasWallet }`. Read-only; any write method returns 405 |
| `GET /api/account/wallet/transactions` | customer | Own history, `page`, `pageSize` ≤ 50 |
| `GET /api/admin/services` | `services:view` | All records, with `version` |
| `POST /api/admin/services` | `services:manage` (+ `changePrices` to include a price) | Custom service; duplicate IDs refused |
| `PATCH /api/admin/services` | `services:manage` | Bulk `{ items:[{id,version}], patch:{visible}\|{archived} }`, at most 200 items, all or nothing |
| `GET`/`PATCH /api/admin/services/:id` | `services:view` / `services:manage` | PATCH body `{ version, record }`; stale version gives 409 |
| `GET /api/admin/customers` | `customers:view` | `q`, `verified`, `status`, `sort`, `page`, `pageSize` ≤ 50 |
| `GET /api/admin/customers/:ref` | `customers:view` | Read-only detail by `CUS-…` |

All private responses are `private, no-store`. Writes require a same-origin `Origin`. Authorization is re-checked against the database on every request. The UI hides nothing that the server would otherwise allow.

## Security review

- **IDOR:** customer routes take no customer id; it always comes from the session. Staff detail uses an opaque public reference behind `customers:view`. Tests prove cross-customer isolation.
- **Price manipulation:** prices are set only through the server with `changePrices`, kept as append-only versions, and never make a service purchasable (six database gates plus the checkout kill switch). The public API never returns cost, internal notes, fulfilment references, eligibility evidence, versions or editor ids; a test scans the response for them.
- **Wallet integrity:** no write path exists. Balances derive from append-only journal lines, the database forbids negative wallets, and `FINANCIAL_OPERATIONS_ENABLED` stays `false`.
- **Validation:** Zod at every boundary (strict where clients shouldn't add keys), plus the same business rules as the UI. Pagination is capped, and search terms are escaped for `ILIKE`.
- **Demo/real separation:** demo data was never written to the database. Live accounts see only their own records.

## Tests (exact results, final run)

| Suite | Result |
|---|---|
| Unit + integration (real PostgreSQL 18.4) | **138 / 138**. New in 5C: `tests/integration/catalog-wallet.test.ts` (22 tests): registration wallet, pre-5C backfill (idempotent), ledger-derived balance with separate pending, no wallet write endpoint, wallet API per customer, profile ownership and strict body, CSRF, profile validation and audit, catalog filters, search and pagination, public/internal separation, hidden/archived/draft never public, Set Price → versioned price → still not purchasable, gates recorded but not purchasable, `changePrices` enforcement, concurrent saves (exactly one wins) and stale 409, server-side price/limit/id/provider-reference validation, a saved price can't be removed, all-or-nothing bulk, admin route permissions (anonymous/customer 401, support 403 on writes), customer directory figures and page-size cap, account snapshot, field-named errors. Updated: migration up/down/up across 4 migrations; registration now expects one zero-balance wallet; last-owner test made independent of other files |
| Typecheck, ESLint, production build | Pass |
| Browser, live mode (`live5c`, production build, `DEMO_MODE=false`, throwaway database) | **51 / 51**, no console errors: dashboard, wallet, orders, catalog (118 services, search, pagination), profile save with validation and persistence, email read-only, CSRF and no wallet writes, disabled areas, settings, customer isolation, owner Set Price → Save → Priced and persistence, stale 409, public catalog without price or cost, customer directory, search and detail deep link, admin shell without sample data, support role refused with the editor kept open, 320 px with no horizontal scroll on 7 pages |
| Browser, demo mode (`demo5c`, dev server) | Demo views unchanged on all checked pages (one check was a false positive on existing copy) |

The live-mode browser run used a throwaway `socivanta_e2e` database with test-only accounts. It was dropped afterwards. The development accounts were not changed, and the owner's authenticator enrolment is still pending for you to complete.

## Development database

Migration 0003 is applied to `socivanta_dev`. The development customer has its USD wallet at **$0.00** with zero journal entries; the 118 seeded services are unchanged.

## Known limitations

- In live mode, notification preferences and "favourite platform" are still saved in the browser only (no database columns yet). Display preferences do sync.
- The customer Service Finder wizard is demo-only; live mode shows the catalog browser instead.
- Admin global search, the overview, queue counts and alerts have no live data yet; they arrive with their modules.
- Admin Services shows the server's refusal when a view-only role tries to save; the UI doesn't yet hide edit controls by permission (the server is authoritative).
- Customer notes and flag management from the original 5C plan, the nightly ledger verification job and staff wallet adjustments with four-eyes approval are **not** built. Adjustments were intentionally deferred: this phase forbids any balance change.
- Real customer counts on the admin overview, and activity beyond last sign-in, are not shown yet.

## Phase 5D prerequisites

1. Decide the payment processors and their approval status (OPEN_DECISIONS), plus the deposit limits per method.
2. Staff wallet adjustments with four-eyes approval (`adjustWallets`), built on `postJournalEntry`, before any credit path ships.
3. A nightly ledger verification job (sum = 0; `account_balances` = Σ lines) wired to alerts.
4. Deposit intent → review → approval flow on `deposits`/`deposit_reviews`, posting journal entries idempotently. Keep `FINANCIAL_OPERATIONS_ENABLED` gated per environment.
5. Webhook signature verification and replay protection per processor.
6. Then reconnect Add Funds and the Transactions history (already reading the ledger) to the new flow.
