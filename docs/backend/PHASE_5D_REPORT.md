# Phase 5D — Payments, Deposits & Wallet Operations: Implementation Report

Status: **complete within scope**. Deposit requests, two-person verification, ledger-backed wallet credits, reconciliation and the admin Payments workspace are built and tested.

Nothing can be paid in a real environment yet:
- **No processor is approved:** crypto, card and PayPal stay permanently unavailable.
- **Bank transfer is off:** it stays off until the operator supplies SociVanta's real receiving account.
- **Still disabled:** checkout, order creation, refunds and manual adjustments.

## What is operational

| Area | What was built |
|---|---|
| Payment-method registry | `src/server/payments/methods.ts`. The single source of truth for each method: configured or not, accepting requests or not, verification kind and availability, currencies (USD), networks, required customer information, limits ($10–$5,000), expiry, and blockers in plain language. Exposed at `GET /api/payments/methods` (no secrets or account details) |
| Bank transfer (the only operable method) | Enabled only by `PAYMENTS_BANK_ENABLED=true` plus the real `PAYMENTS_BANK_ACCOUNT_NAME`, `PAYMENTS_BANK_NAME` and `PAYMENTS_BANK_ACCOUNT` (optionally `PAYMENTS_BANK_ROUTING`). Missing values keep it off, and nothing is defaulted. Verification is bank-statement reconciliation by two staff members |
| Crypto, card, PayPal | Never configured, whatever the environment says. There is no approved processor (D3) and no adapter, so no address, rate, quote or confirmation is ever produced. Live mode hides the illustrative crypto quotes |
| Deposit requests | `src/server/payments/deposits.ts`. Customers create a request with amount, USD and method. A required `Idempotency-Key` (16–100 chars) makes retries return the original, and a reused key with different details gets 409. At most 5 open requests per customer, race-safe via a row lock. Requests are created as `awaiting_payment` with a 7-day expiry. Customers can list, view and cancel their own requests while nothing has been received. A request never changes a balance |
| Verification (two-person) | **Review 1 of 2** (`recordBankReceipt`): a staff member records the transfer from SociVanta's own bank statement — bank reference, amount received, date, payer — and confirms three checks. The amount must equal the request exactly; partial or excess payments can't be credited. A bank reference can be used once only (unique per processor). Late payments on expired requests can be recorded. **Review 2 of 2** (`verifyAndCredit`): a *different* staff member verifies, and the wallet is credited. Both steps need "Approve deposits" plus re-authentication (password + TOTP within 10 minutes). Customer screenshots or hashes are never accepted as evidence (the schema rejects extra fields) |
| Wallet credit | One transaction: lock the deposit row, check state and reviewers, insert the second review, post `deposit_credit` (debit `processor_clearing:bank_transfer`, credit `wallet:<customer>`) with the idempotency key `deposit:<id>:credit`, the recorder as `created_by` and the verifier as `approved_by`, then mark the deposit credited with the entry id. Retries return the original. Concurrent verifications credit exactly once |
| Rejection, expiry, notes | Rejection needs a reason of 10–300 characters, which is shown to the customer. After a receipt is recorded, only a different person can reject. The `deposits.expire` job (every 15 minutes) expires unpaid requests. Internal notes go in `staff_notes`, attributed and refusing credential-like text |
| Refunds & adjustments | `src/server/payments/adjustments.ts`. Request schemas (original reference, reason, evidence, a $500 cap on adjustments) and permission plus re-authentication routes exist, but `REFUNDS_ENABLED` and `ADJUSTMENTS_ENABLED` are `false`: valid requests get 503, invalid ones 400, and roles without permission 403. The admin UI shows them as disabled with the reason |
| Reconciliation | `src/server/payments/reconcile.ts`, read-only. Reports wallet liabilities, deposits by state, wallet movements by journal kind, clearing balances and revenue (deposits are never revenue). Checks: balanced entries; stored = computed balances; every credited deposit has exactly one matching `deposit_credit` entry for the same customer and amount; no orphan `deposit_credit`; no negative wallet; liabilities = Σ wallet movements. The `deposits.reconcile` job (daily) logs and fails on exceptions and **never** changes balances. Staff can also run it on demand |
| Webhooks | `src/server/payments/webhooks.ts`. HMAC-SHA256 over `t.body`, constant-time compare, 5-minute replay window, and unique `(processor, event_id)`. The adapter registry is empty, so `POST /api/payments/webhooks/:processor` returns 503 before reading or storing anything (fail closed) |
| Worker | `npm run worker` now queues recurring jobs: `deposits.expire` every 15 minutes, `maintenance.verify-ledger` every 6 hours and `deposits.reconcile` daily. Time-bucketed idempotency keys mean each run is queued once, however many workers run |
| Customer UI (live) | **Add Funds** keeps its approved layout; availability comes from the registry. Unconfigured methods show "Not available yet" with the server's reason, and the review is disabled. When bank transfer is configured, the review dialog creates a real request and shows its reference, status, expiry, the configured account details (copyable) and "nothing charged yet". The balance card shows the real USD balance and pending deposits separately. **Transactions** adds a "Deposit requests" section: status badges, reasons, payment details and cancellation. **Overview** links to Add Funds |
| Admin UI (live) | **Payments**, a new live workspace in the admin design: liabilities, credited, pending and awaiting-verification cards; method readiness; reconciliation with "Run check now"; a searchable, filterable deposit list (deep link `?deposit=DEP-…`); a detail sheet with next step, blockers, request facts, both reviews with their evidence, the linked ledger entry and notes. Actions appear only when permitted and valid, and a re-authentication dialog appears when the server asks. The person who recorded a receipt can't verify or reject it |

## Database migration `0004_deposits_5d`

- **New `deposits` columns:** `currency` (CHECK = 'USD'), `asset`, `network`, `idempotency_key`, `request_hash` and `status_reason` (3–300 characters).
- **New index:** a unique `(customer_id, idempotency_key)`.
- **New status:** `cancelled`.
- **Trigger `deposits_change_check` (SV010):**
  - Only allowed transitions:
    - `awaiting_payment` → `under_review`, `expired`, `cancelled`, `failed` or `rejected`;
    - `expired` → `under_review`;
    - `under_review` → `credited` or `rejected`;
    - the processor path `settling` → `settled` → `credited`.
  - Identity, customer, amount, currency, method, processor, idempotency key and request time never change. A recorded payment reference never changes.
  - Closed deposits never change.
  - `credited` requires a `deposit_credit` entry paying exactly the deposit amount into that customer's wallet.
- **Trigger `deposits_no_delete`:** deposits can't be deleted.
- **Rollback:** `drizzle/rollback/0004_deposits_5d.down.sql`.
- **Applied to:** `socivanta_dev`.

## APIs

| Method and path | Auth | Notes |
|---|---|---|
| `GET /api/payments/methods` | public | Readiness only |
| `GET /api/account/deposits` | customer | Own requests, `page`, `pageSize` ≤ 50 |
| `POST /api/account/deposits` | customer + same-origin | Body `{amountCents, currency:"USD", method}` (strict). `Idempotency-Key` header required. Returns 201 when created, 200 when replayed |
| `GET /api/account/deposits/:ref` | customer | Own only (404 otherwise). Includes payment details while payment is still due |
| `POST /api/account/deposits/:ref/cancel` | customer + same-origin | Only while awaiting payment |
| `GET /api/admin/payments/summary` | `payments:view` | Summary, methods and the viewer's capabilities |
| `GET /api/admin/payments/reconciliation` | `payments:view` | Runs the read-only checks |
| `GET /api/admin/payments/deposits` | `payments:view` | `q`, `status` (`open` or a single status), `method`, `sort`, `page`, `pageSize` ≤ 50 |
| `GET /api/admin/payments/deposits/:ref` | `payments:view` | Detail, evidence, notes, ledger entry, blockers and next step |
| `POST …/:ref/receipt` | `approveDeposits` + re-auth + same-origin | Review 1 of 2 |
| `POST …/:ref/verify` | `approveDeposits` + re-auth + same-origin | Review 2 of 2 and credit |
| `POST …/:ref/reject` | `approveDeposits` + re-auth + same-origin | `{reason}` |
| `POST …/:ref/notes` | `payments:manage` + same-origin | `{body}` |
| `POST /api/admin/payments/refunds` | `issueRefunds` + re-auth | Validated, then 503 (disabled) |
| `POST /api/admin/payments/adjustments` | `adjustWallets` + re-auth | Validated, then 503 (disabled) |
| `POST /api/payments/webhooks/:processor` | signature (none configured) | Always 503 (fail closed) |

## Financial protections verified

- **Requests never move money.** Pending deposits appear only as "pending", never as available, in the API, the customer UI and the admin summary.
- **Settlement must be independent.** Customer-supplied evidence is rejected. Without configured verification, nothing can be recorded, verified or credited, and there is no override.
- **Two different people are required.** This is enforced by the service, the API, the UI and the database trigger SV007; the person who recorded a receipt is refused at the second step.
- **Re-authentication is enforced.** A missing re-auth gets 403 `REAUTH_REQUIRED`; tested in the API and in the browser with a real TOTP.
- **Credits happen exactly once.** Retries replay the original entry; simultaneous verifiers produce one entry; one bank reference can't fund two deposits.
- **The ledger stays sound.** Entries balance; entries and closed deposits are immutable (SV001/SV010); wallets can't go negative; deposits can't be deleted.
- **The database refuses invalid state changes.** Skipping verification, editing the amount or reopening a closed deposit all fail.
- **Reconciliation detects problems without repairing them.** It flagged the test fixtures' untracked wallet credits and a staged orphan credit, and left balances unchanged.
- **Webhooks fail closed.** They refuse and store nothing for every processor name.
- **Refunds and adjustments stay off.** They're disabled even for the owner after re-authentication, with validation and permissions enforced first.
- **No configuration reaches the browser bundle.** A scan of `.next/static` found no secrets or bank configuration.

## Tests (exact results, final run)

| Suite | Result |
|---|---|
| Unit + integration (real PostgreSQL 18.4) | **161 / 161** across 16 files. New in 5D: `tests/integration/payments.test.ts`, **23 tests** covering method readiness; creation, validation and limits; duplicate and concurrent idempotency; the open-request cap under concurrency; ownership and route auth/CSRF/header; the database state machine (skip, amount edit, reopen, delete); expiry and late receipts; the full two-person flow with ledger checks; simultaneous verifications; missing, mismatched and reused evidence; no verification means no override; rejection rules; notes; staff route permissions and re-authentication; disabled refunds and adjustments; summary separation of liabilities, pending and revenue; webhook signature cases; fail-closed webhooks; reconciliation (pass, untracked credit detected, staged orphan detected). Updated: migrations up/down/up across 5 migrations, and the disabled-jobs list |
| Typecheck, ESLint (`--max-warnings=0`), production build | Pass |
| Browser, live mode, nothing configured (`pay5d off`, production build) | **18 / 18**: Add Funds shows real $0.00 with no demo tags; bank "Not available yet" with the reason; review disabled and no dialog opens; crypto shows no rate or address; the API refuses with 503; empty deposit requests; admin shows all 4 methods "Not configured", refunds and adjustments disabled, an honest empty state, and reconciliation passing; 320 px dark/light with no horizontal scroll |
| Browser, live mode, **fixture** bank configuration (`pay5d bank`, throwaway database) | **22 / 22**, no console errors: request created with reference, pending status, fixture account details and $0.00 balance; listed as Pending apart from the balance; re-auth dialog with a real TOTP; a wrong amount refused and shown; receipt recorded (1 of 2) with nothing credited; the recorder can't verify; the second reviewer sees the evidence and credits $50.00; the ledger entry is linked; reconciliation passes; the customer sees $50.00, history and "Verified"; a duplicate submission returns the original; support has no verify actions |

The fixture bank values ("SociVanta TEST FIXTURE", "TEST-0000-0000") existed only in a throwaway `socivanta_e2e` database and the test server's environment. Both were removed afterwards, and `.env.local` contains no payment configuration. **No real payment provider or settlement source has been tested, because none is configured.**

## Intentionally disabled

Checkout and real order creation; crypto, card and PayPal deposits (no approved processor); processor webhooks; refunds; manual wallet adjustments; provider fulfilment; referral payouts. `FINANCIAL_OPERATIONS_ENABLED` is still `false` for checkout, processor credits, refunds and adjustments.

## Remaining dependencies (before real money)

1. **D3:** written processor acceptance of the business model, then one adapter per processor (signing secret, event mapping, settlement report) on the webhook architecture above.
2. **Bank transfer go-live:**
   - SociVanta's real receiving account supplied as environment configuration.
   - A written internal procedure for statement checks.
   - At least two staff members with "Approve deposits" and enrolled authenticators.
3. **D15:** legal entity, terms for deposits and refunds, and data retention.
4. **Payments page:** the demo `AdminPayments` stays for demo mode only, and live mode uses `LivePayments`.
5. **Monitoring:** run `npm run worker` in every deployed environment, and alert on failed `deposits.reconcile` or `maintenance.verify-ledger` jobs.
6. **Before refunds and adjustments ship:**
   - The approval flow (requester plus a different approver).
   - Evidence linking to tickets.
   - Their own reconciliation checks.
   - Flipping the flags through code review.

## Phase 5E prerequisites

- Approved list of purchasable services (D2), plus revenue-recognition choice (D5).
- `chargeOrder` built on the same pattern: a wallet row lock, an idempotent `order_debit` (wallet → `orders_in_progress`), and the order kill switch and `purchasable_services` gates.
- Order cancellation and refund postings designed, with reconciliation extended to cover "order totals = debits − refunds".
- At least one verified funding path (bank transfer configured or an approved processor), so customers can hold a balance to order with.
