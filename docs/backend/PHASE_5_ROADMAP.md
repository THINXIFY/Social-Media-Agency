# SociVanta — Phase 5 Roadmap

## Sequence and why it differs from the brief

The brief lists Orders (5C) before Payments and Wallets (5D). In this codebase, an order is paid from the wallet (`AdminOrder.amount` is "charged from the customer's wallet"), so a real order cannot exist without a working ledger and a way to fund it.

The sequence below builds the ledger first, then deposits, then orders. It also gives provider automation its own phase *after* orders work with manual fulfilment, which is the safest way to test the order lifecycle.

| Phase | Scope | Rough size |
|---|---|---|
| 5A | Foundation: repo hygiene, database, environment, CI, admin lock-down | S |
| 5B | Authentication, customer accounts, staff access and permissions | L |
| 5C | Catalog and eligibility, admin customers, **ledger core** | M |
| 5D | Deposits, payment processor, verification, reconciliation | L |
| 5E | Real orders with manual fulfilment, refunds | L |
| 5F | Provider integrations and automated fulfilment | M |
| 5G | Support, referrals, notifications and email, attachments | L |
| 5H | Analytics, settings, audit viewer, global search | M |
| 5I | Security hardening, end-to-end suite, load and concurrency, launch checklist | M |

Every phase ends with:
- Typecheck, lint, unit and integration tests, and build all green.
- The relevant end-to-end flows passing.
- A short report.

Checkout stays **off in production** until 5I sign-off and decision D2.

---

## 5A — Foundation

> **Status: implemented.** See [PHASE_5A_REPORT.md](PHASE_5A_REPORT.md) for results and deviations, including embedded PostgreSQL instead of docker compose, and CI and e2e deferred until the Git baseline. Setup is in [BACKEND_SETUP.md](BACKEND_SETUP.md).

**Scope:**
- `git init` and a baseline tag (see the Git safety section).
- `src/server/` skeleton with `server-only`.
- Postgres via docker compose; Drizzle config and first migration (`users`, `audit_log`).
- `.env.example`, environment validation with Zod, pino logging, Sentry.
- `/api/health`.
- CI pipeline. Vitest set up; the existing browser checks moved into `tests/e2e`.
- Demo-environment guard.
- Interim lock: admin and dashboard routes behind basic protection on any public deploy.

**Prerequisites:** decisions D1 (hosting and database), D8 (ORM), D11 (git baseline).

**Deliverables:** running local stack, CI, empty but migrated database, seed script loading current demo data with identical IDs.

**Acceptance criteria:**
- `npm run dev` works with and without the database.
- The UI is visually unchanged.
- The seed reproduces Overview totals: $1,078.17 net revenue, $796.83 wallet liabilities, $1,875.00 credited deposits, $525.00 pending deposits.

**Critical tests:** environment validation fails fast; health check; migration up and down on a clean database; end-to-end smoke of every existing page.

**Risks:** Next 16 conventions differ from older ones (`proxy.ts`, Cache Components), so read the bundled docs before writing code.

## 5B — Authentication, accounts and staff access

> **Status: implemented.** See [PHASE_5B_REPORT.md](PHASE_5B_REPORT.md) and [AUTHENTICATION.md](AUTHENTICATION.md).

**Scope:**
- Users, sessions, email verification, password reset.
- Customer sign-up and sign-in pages, matching the design system.
- Profile and preferences backed by the database.
- Staff invitations via email token, staff TOTP two-factor authentication.
- Roles and permissions tables seeded from `admin-staff.ts`; `requireStaff()`.
- Optimistic redirects in `proxy.ts`.
- Owner bootstrap (CLI command creates the first owner).
- Last-owner trigger.
- Audit of staff changes.
- The admin Staff page switches to real data.

**Prerequisites:** 5A; D4 (email provider); D9 (auth library).

**Deliverables:**
- `/admin/**` inaccessible without a staff session and two-factor authentication.
- `/dashboard/**` requires a customer session.
- `DEMO_USER` and `ADMIN_USER` replaced by the session user.

**Acceptance criteria:**
- Unauthenticated and wrong-role requests are refused at the action level, not just hidden.
- The last owner cannot be removed.
- Sessions are revocable.
- Rate limits work.

**Critical tests:**
- Calling every admin action directly without a session returns 401/403.
- IDOR tests across two customers.
- Brute-force limits.
- Token reuse rejected.
- Two-factor authentication required for staff.

**Risks:** Cache Components plus per-user data; follow the bundled authentication guide.

## 5C — Catalog, customers, ledger core

> **Status: complete** — see [PHASE_5C_REPORT.md](PHASE_5C_REPORT.md). Delivered: database catalog, server-side service and pricing edits (versioned, audited, conflict-checked), one zero-balance USD wallet per customer (trigger + backfill), read-only ledger balance and history, live customer dashboard and admin Customers, and an explicit demo/live mode boundary. Deferred to 5D: staff wallet adjustments with four-eyes approval, the nightly ledger verification job, and customer notes and flags. No balance may change in 5C.

**Scope:**
- Platforms, services, fields, price versions, eligibility gates in the database. The admin Services editor writes to the server; the public catalog reads from it.
- Admin Customers backed by the database, with server-side notes.
- **Ledger:** accounts, journal entries and lines, `wallet_balances`, posting service with idempotency, nightly verification job, staff wallet adjustment (`adjustWallets` plus four-eyes approval).

**Prerequisites:** 5B.

**Deliverables:** `postJournal()` with invariants; catalog read models; customer wallet balance and transactions read from the ledger.

**Acceptance criteria:**
- No service is purchasable unless every gate is recorded.
- Ledger entries always balance.
- Balances can never go negative.
- Adjustments need two staff members.

**Critical tests:**
- Property tests: random postings keep sum = 0 and balance = sum of lines.
- 50 parallel debits against one wallet never overdraw.
- Duplicate idempotency key returns the original entry.

**Risks:** rounding of per-1,000 prices; agree rounding rule (half-up to cents at order time).

## 5D — Deposits and payments

> **Status: complete within scope** — see [PHASE_5D_REPORT.md](PHASE_5D_REPORT.md). Delivered: payment-method registry, deposit requests (idempotent), bank-transfer verification by two staff members with re-authentication, exactly-once ledger credits, database-enforced deposit state machine (migration 0004), read-only reconciliation and scheduled jobs, fail-closed webhook architecture, and the live customer Add Funds/Transactions and admin Payments screens. Not enabled: any processor (D3 pending), refunds, manual adjustments, checkout. Bank transfer turns on only when the operator configures the real receiving account.

**Scope:**
- Deposit intents, processor integration (sandbox), signed webhooks, event store, settlement verification, crediting.
- Bank-transfer manual review with two-step approval above the threshold.
- Expiry job.
- Admin Payments queue on real data.
- Customer Add Funds and Transactions on real data.
- Daily reconciliation report.

**Prerequisites:** 5C; D3 (processors and acceptance confirmed in writing).

**Deliverables:** end-to-end sandbox deposit → credited wallet; reconciliation dashboard figures from the ledger.

**Acceptance criteria:**
- Replayed or forged webhooks never credit.
- Each payment credits exactly once.
- Pending is never in a wallet.
- Reconciliation shows zero differences on the sandbox.

**Critical tests:** webhook signature, replay, out-of-order events, duplicate delivery, processor timeout; reviewer ≠ approver.

**Risks:** processor refusal for this category (R7); crypto confirmations and network fees (`CRYPTO_FEES` are null today and must be configured, not guessed).

## 5E — Real orders (manual fulfilment)

> **Status: complete within scope** — see [PHASE_5E_REPORT.md](PHASE_5E_REPORT.md). Delivered: unified order model with separate operational, payment and revenue states; atomic, idempotent wallet charging with frozen price snapshots; database-enforced lifecycle and money integrity (migration 0005); manual fulfilment with evidence; cancellation/rejection releases; refund-review holding; order reconciliation; live My Orders, New Order (checkout disabled) and Admin Orders. Public checkout remains off; revenue stays deferred until D5.

**Scope:**
- Server quote and place-order action.
- Atomic debit plus order.
- Review queue (Settings → review policy).
- Manual fulfilment by staff.
- Order events and timeline, customer status projection.
- Cancel and refund (`issueRefunds`), partial refunds.
- Link-fix flow.
- Admin Orders and customer Orders on real data.

**Prerequisites:** 5C, 5D; D2 (at least one service legally purchasable); D5 (revenue recognition); D7 (order ID format).

**Deliverables:** the New Order final step is enabled **only** for purchasable services, behind a feature flag per environment.

**Acceptance criteria:**
- The client cannot change the price.
- Orders are idempotent.
- Refunds can never exceed the amount paid.
- Every status change has an event.
- Customer and admin views agree.

**Critical tests:**
- Double-submit.
- Insufficient funds race.
- Tampered price, quantity or link.
- Cancel versus complete race.
- Refund caps.

**Risks:** policy and legal exposure; keep the flag off in production until 5I.

## 5F — Provider integrations

**Scope:**
- Provider CRUD with encrypted credentials.
- Mappings.
- Worker-based submission and status polling with retries and backoff.
- Fallback provider.
- Health checks deriving "connected".
- Cost capture into the ledger.
- Partial-delivery handling.

**Prerequisites:** 5E; D12 (which suppliers, contracts and APIs).

**Acceptance criteria:**
- Keys are never returned to the client.
- SSRF protections hold.
- Exactly one active fulfilment attempt per order.
- Provider failures move orders to `failed` and then to refund or requeue, never silently.

**Critical tests:** mock provider (success, partial, timeout, 500, duplicate callback); credential rotation.

## 5G — Support, referrals, notifications

**Scope:**
- Tickets, messages, internal notes, attachments (object storage).
- Referral codes, attribution, policy versions, qualification job, holds, approvals, idempotent reward credit.
- In-app notifications, email outbox and sender, preferences.

**Prerequisites:** 5B, 5E (qualification needs completed orders); D4, D6 (reward destination), D13 (file storage).

**Acceptance criteria:**
- One reward per referral.
- Self-referral blocked.
- Refunded orders excluded when the policy says so.
- Reward credit is idempotent.
- Internal notes are never visible to customers.
- Uploads are validated.

**Critical tests:** referral fraud scenarios; attachment type spoofing; email outbox retry; cross-customer ticket access.

## 5H — Analytics, settings, audit

**Scope:**
- Roll-up jobs.
- Analytics on SQL with the same metric definitions.
- Server CSV export.
- Settings persisted (whitelisted keys).
- Real maintenance flag via `proxy.ts`.
- Audit log viewer (owner).
- Global admin search over the database.

**Acceptance criteria:** analytics totals equal ledger and order sums; settings changes audited.

## 5I — Hardening and launch readiness

**Scope:**
- CSP and headers.
- Dependency and secret scanning.
- Backup restore drill.
- Load test of order placement.
- Full end-to-end regression suite: the existing UI checks plus new auth, money and order flows.
- Incident runbook.
- Privacy policy and terms alignment.
- Production feature-flag review.

**Acceptance criteria:** all Critical and High risks in SECURITY.md closed or formally accepted by the owner; reconciliation clean for 7 consecutive days on staging.

---

## Git safety and frontend preservation

Observed: this folder is **not a Git repository** (`git status` fails). I made no Git changes.

Recommended steps, **only after owner approval**:

1. `.gitignore` already covers `node_modules`, `.next`, `.env*`, `*.tsbuildinfo` and `next-env.d.ts` (verified); no change needed.
2. `git init`, then a first commit of the current tree: "Frontend complete (customer dashboard + 11 admin modules)".
3. Tag the commit `frontend-v1.0`.
4. Push to a **private** remote.
5. Create the branch `backend/phase-5a`; one branch per phase, merged by pull request with CI.
6. Commit the `AGENTS.md` block as-is (`next dev` re-adds it).

Frontend preservation rules:
- No UI rewrite.
- Each module swaps its demo import for a server query **returning the same TypeScript shape**, so components stay untouched.
- Keep the Playwright checks green at every step.
- Remove demo-only copy, such as "Demo" tags, only when that module is truly live.
