# Sociotix — Frontend → Backend Integration Map

**How to read this.**
- "Reuse" lists existing UI or logic to keep.
- "Replace" lists the demo source to retire.
- Permissions use the admin role model (`module:view|manage`, plus named sensitive permissions).
- Phases refer to [PHASE_5_ROADMAP.md](PHASE_5_ROADMAP.md).

## Summary matrix

> **Phase 5E update:** live mode now connects customer My Orders and New Order (configuration and review; checkout disabled) and Admin Orders (review and manual fulfilment). See [PHASE_5E_REPORT.md](PHASE_5E_REPORT.md).

> **Phase 5D update:** live mode now connects customer Add Funds (deposit requests, availability from the server registry), Transactions (deposit requests alongside ledger history) and admin Payments (deposit review, two-person verification, reconciliation). See [PHASE_5D_REPORT.md](PHASE_5D_REPORT.md).

> **Phase 5C update:** connected (live mode): public catalog, admin Services & Pricing, admin Customers (read-only), customer profile, preferences, wallet balance and history, and the dashboard overview. Areas still "not connected yet" in live mode: orders, new order, add funds, support, referrals, and the admin modules other than Services, Customers and Staff. Details and APIs are in [PHASE_5C_REPORT.md](PHASE_5C_REPORT.md).

| Module | Status today | Core entities | Key server operations | Auth / permission | Phase |
|---|---|---|---|---|---|
| Public site and catalog | UI complete; 118 services, none purchasable | platforms, services, price versions, eligibility | list catalog, service detail, search | public (read) | 5C |
| Customer auth and profile | **missing** (constant `DEMO_USER`) | users, customers, sessions, preferences | sign up/in/out, verify email, reset, profile/prefs update | customer session | 5B |
| Customer orders and new order | UI complete; checkout disabled | orders, order_events, price versions | quote, place order, list/detail, fix link, cancel request | customer, own records only | 5E |
| Customer wallet: add funds and transactions | UI complete; previews only | deposits, journal, wallet_balances | create deposit intent, list transactions, balance | customer, own | 5D |
| Customer support | UI complete; local tickets | tickets, messages, attachments | create, reply, close, list | customer, own | 5G |
| Customer referrals | UI complete; sample data | referral_codes, referrals, rewards, policies | get code/link, list referrals and rewards | customer, own | 5G |
| Customer settings and region | UI complete (`sv-display`, prefs) | customer_preferences, notification_preferences | read/update | customer | 5B |
| Admin Overview | UI complete; demo figures | read models across modules | KPIs, attention queue, activity | `overview:view` | 5H (incremental from 5C) |
| Admin Orders | UI complete; notes local | orders, reviews, events, staff_notes | queue, approve/reject, assign, cancel, refund, notes | `orders:view/manage`; refund needs `issueRefunds` | 5E |
| Admin Services and pricing | UI complete; local overrides | services, price versions, eligibility, fields | edit, price, record eligibility gates, visibility | `services:manage`; prices need `changePrices` | 5C |
| Admin Customers | UI complete; notes local | customers, flags, notes, ledger read | search, profile, wallet history, flag, notes | `customers:view/manage` | 5C |
| Admin Payments | UI complete; notes local | deposits, reviews, journal, refunds | verification queue, approve/reject, reconcile, adjustments | `payments:*`; `approveDeposits`, `issueRefunds`, `adjustWallets` | 5D |
| Admin Providers | UI complete; local providers | providers, credentials, mappings, health | CRUD, set credential, map service, health check | `providers:manage`; `configureProviders` | 5F |
| Admin Support | UI complete; notes local | tickets, messages, internal notes | inbox, reply, assign, status, notes | `support:view/manage` | 5G |
| Admin Referrals | UI complete; local drafts | policies, referrals, rewards, events | review, approve or reverse rewards, publish policy version | `referrals:manage`; `approveRewards` | 5G |
| Admin Analytics | UI complete over demo data | roll-ups, transactional reads | reports, CSV export | `overview:view` | 5H |
| Admin Settings | UI complete; local | platform_settings, notification prefs | read/update whitelisted settings | `settings:manage`; security needs `securitySettings` | 5H |
| Admin Staff and permissions | UI complete; local templates and drafts | staff, roles, invitations, sessions | invite, accept, change role, disable, edit role | `staff:manage` + `manageStaff`; last-owner rule | 5B |
| Admin shell (search, alerts, identity) | UI complete; constant identity | cross-module search index, notifications | global search, alerts, current staff | staff session | 5B (identity), 5H (search) |

## Module details

### Catalog and services (public, customer, admin)
- **Reuse:**
  - `catalog.ts` structure (platforms, categories, `CATEGORY_FIELDS`, search synonyms).
  - `admin-services.ts` (`eligibility()`, `priceError()`, `quote()`, `modelsFor()`).
  - `service-editor.tsx`.
- **Replace:** `SERVICES` / `ACTIVATIONS` constants, `sv-admin-services`.
- **Rules:**
  - Price and limit validation exactly as in `priceError()`. A price below cost requires an explicit override with a reason.
  - `purchasable` only when every gate passes. Every price change is a new version.
- **Audit events:**
  - `service.updated`
  - `service.price_versioned`
  - `service.gate_recorded`
  - `service.visibility_changed`
- **Depends on:** auth (5B) for the admin side.

### Orders
- **Reuse:**
  - `new-order.tsx` steps and field rendering.
  - `links.ts` (`parseLink`, `LINK_HOSTS`, `isForeignHost`), which must also run server-side.
  - `admin-orders.ts` (`blockersOf`, `reviewChecklist`, `nextActionOf`, `milestonesOf`).
  - The order timelines.
- **Replace:**
  - `demo-account.ts` `ORDERS`, `admin-demo.ts` `ADMIN_ORDERS`.
  - The `fixes` and `reorderDraft` parts of `sv-demo-state`.
  - `sv-admin-orders`, `sv-admin-orders-queue`.
- **Rules:**
  - The server recomputes the price from the current price version.
  - Quantity must be within min/max. The link host must match the platform.
  - The service must be purchasable.
  - The balance must cover the total, using an atomic debit.
  - The order is created with an idempotency key.
  - Review is required by policy (Settings → order review).
- **Audit events:**
  - `order.placed`
  - `order.approved` / `order.rejected`
  - `order.assigned`
  - `order.cancelled`
  - `order.refunded`
  - `order.status_synced`
- **Depends on:** ledger (5C/5D), catalog (5C), providers (5F) for automated fulfilment.

### Wallet, deposits, transactions
- **Reuse:**
  - `payments.ts` (methods, `DEPOSIT_LIMITS`, crypto assets and networks).
  - `add-funds.tsx`, `wallet-ui.tsx`, `transactions.tsx`.
  - `admin-payments.ts` (`verificationOf`, `paymentIssues`, `nextStepOf`).
  - The reconciliation formulas.
- **Replace:**
  - The `previews` part of `sv-demo-state`, `TRANSACTIONS`, `ADMIN_DEPOSITS`, `ADMIN_TXNS`.
  - The `PAYMENTS_LIVE` and `PAYMENT_PROVIDER_APPROVED` constants, which become server configuration per processor.
- **Rules:**
  - Deposit limits $10–$5,000 (from code; also enforced server-side).
  - Pending money is never credited.
  - Crediting requires verified settlement or two-step staff review.
  - Webhooks are idempotent.
- **Audit events:**
  - `deposit.created`
  - `deposit.settled`
  - `deposit.credited`
  - `deposit.rejected`
  - `wallet.adjusted`
  - `refund.issued`
  - `reconciliation.mismatch`
- **Depends on:** payment processor decision (D3), auth, ledger core.

### Customers (admin)
- **Reuse:** `admin-customers.ts` (`factsOf`, `transactionsOf`), `customers.tsx`.
- **Replace:** `ADMIN_CUSTOMERS`, `sv-admin-customers`.
- **Rules:** staff see only what their role allows; contact details need `customers:view`.
- **Audit events:** `customer.flagged`, `customer.note_added`, `customer.viewed_pii` (optional, for sensitive views).

### Providers
- **Reuse:** `admin-providers.ts` (`endpointError`, `secretError`, `refError`, `mappingState`, `issuesOf`), `providers.tsx`.
- **Replace:** `SEED_PROVIDERS`, `sv-admin-providers`.
- **Rules:**
  - Endpoints must be https and on the allow-list.
  - Credentials are write-only.
  - A mapping is allowed only for a policy-reviewed, non-archived service (`serviceEligibility`).
  - One primary provider per service.
- **Audit events:**
  - `provider.created`
  - `provider.credential_set`
  - `provider.mapping_changed`
  - `provider.enabled` / `provider.disabled`
  - `provider.health_failed`

### Support
- **Reuse:** `support.tsx` (customer), `support-ui.tsx`, `ticket-thread.tsx`, `new-ticket.tsx`, admin `support.tsx`, `admin-support.ts` (`viewOf`, `nextActionOf`).
- **Replace:**
  - `TICKETS`, `ADMIN_TICKETS`.
  - The ticket parts of `sv-demo-state`, `sv-admin-support`.
  - Simulated attachments.
- **Rules:**
  - Message bodies are plain text, rendered escaped.
  - Internal notes are never returned to customers.
  - Attachments are type- and size-checked and scanned.
  - Rate limits apply to ticket creation.
- **Audit events:** `ticket.created`, `ticket.replied`, `ticket.assigned`, `ticket.status_changed`.

### Referrals
- **Reuse:** `admin-referrals.ts` (`rewardFor`, `checksOf`, `flagsOf`, `impactOf`, policy versions), the customer `referrals.tsx`, `demo-referrals.ts` status vocabulary.
- **Replace:** `REFERRALS`, `REWARDS`, `REFERRERS`, `sv-admin-referrals`.
- **Rules:** see SECURITY.md §5 and the roadmap 5G.
- **Audit events:**
  - `referral.attributed`
  - `referral.qualified` / `referral.ineligible`
  - `reward.approved`
  - `reward.credited`
  - `reward.reversed`
  - `policy.published`

### Analytics
- **Reuse:** `admin-analytics.ts` (windows, buckets, metric definitions, `toCsv`), `analytics.tsx`.
- **Replace:** the in-memory filtering of demo arrays, with SQL over date windows.
- **Rules:** comparisons only when the data covers the previous period (`previousOf`), the same as today.

### Settings
- **Reuse:** `admin-settings.ts` validation (`VALIDATE`, `contrast`, `validUrl`), `settings.tsx`.
- **Replace:** `sv-admin-settings`.
- **Rules:**
  - Only whitelisted keys can be saved.
  - Values marked "Set in code" (accounting currency, enabled languages, deposit limits) stay in code or environment, not in the database, unless decision D10 says otherwise.
  - Maintenance mode becomes real only through a server flag read by `proxy.ts`.

### Staff and permissions
- **Reuse:** `admin-staff.ts` (modules, sensitive permissions, role caps, `accessErrors`, `withLevel`, `inviteErrors`), `staff.tsx`.
- **Replace:** `OWNER_ENTRY` and `ADMIN_USER` constants, `sv-admin-staff`.
- **Rules:**
  - Invitations become single-use tokens (72 hours) sent by email. Acceptance creates the user and requires two-factor setup.
  - The owner role is protected (last-owner rule).
  - Role edits are versioned and audited.

### Notifications
- **Reuse:** the customer `NOTIFICATION_PREFS`, the admin `NOTIFY_EVENTS`, top-bar bells.
- **New:** `notifications` table, `email_outbox`, worker sender.
- **Depends on:** email provider decision (D4).

## Browser storage after integration

| Key | Fate |
|---|---|
| `sv-demo-state`, all `sv-admin-*` data keys | Removed once each module is server-backed. A one-time cleanup clears stale demo data |
| `sv-display` | Kept for signed-out visitors; signed-in users sync to `customer_preferences` |
| `sv-sidebar-collapsed`, `sv-admin-sidebar-collapsed`, `sv-finder-query` | Kept (pure UI conveniences) |
