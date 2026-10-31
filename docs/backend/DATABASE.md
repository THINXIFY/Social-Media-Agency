# SociVanta — Database Design (PostgreSQL)

Proposal only. Table and column names are indicative; the final schema is written as Drizzle (or Prisma) migrations in Phase 5A–5C.

## 1. Conventions

**IDs:**
- `id uuid primary key` internally, plus a **human-readable public reference** where the UI already shows one. These formats stay stable:

| Entity | Public reference |
|---|---|
| Customer | `CUS-…` |
| Order | `ORD-…` |
| Deposit | `DEP-…` |
| Ticket | `TCK-…` |
| Invitation | `INV-…` |
| Account number | `ACC-…` |

- Generated server-side from sequences and `UNIQUE`.
- The customer-side demo order format `SV-…` and the admin `ORD-…` must be unified: **pick one (decision D7)**.

**Money:** `bigint` **cents** (USD) for every amount.
- Per-1,000 rates can be fractions of a cent, so they are stored as `bigint` **micro-dollars**.
- Totals are computed server-side, rounded half-up to cents **once**, and snapshotted on the order.

**Time:** `timestamptz`, stored in UTC. Display time zones are a presentation concern (`sv-display` today).

**Common columns:**
- Every table: `created_at`, `updated_at`.
- Mutable configuration: `version int` for optimistic locking.

**Soft deletion** only where history matters (services, providers, staff): use `archived_at`. Financial rows are **never** updated or deleted.

**Enums** are Postgres `text` columns with `CHECK` constraints, which are easier to migrate than enum types.

## 2. Identity, customers, staff

| Table | Key columns | Constraints and indexes |
|---|---|---|
| `users` | id, email (citext), email_verified_at, password_hash (argon2id), status (`active`,`locked`,`disabled`), mfa_enabled | `UNIQUE(email)` |
| `sessions` | id, user_id, token_hash, kind (`customer`,`staff`), created_at, last_seen_at, expires_at, ip, user_agent, mfa_verified_at | `UNIQUE(token_hash)`, idx(user_id) |
| `auth_tokens` | id, user_id, purpose (`verify_email`,`reset_password`,`staff_invite`), token_hash, expires_at, used_at | `UNIQUE(token_hash)`; single use |
| `mfa_factors` | id, user_id, type (`totp`), secret_encrypted, confirmed_at | one active TOTP per user |
| `mfa_recovery_codes` | id, user_id, code_hash, used_at | |
| `customers` | id, user_id, public_ref `CUS-…`, account_ref `ACC-…`, first/last/display name, country, account_type (`personal`,`business`), business_name, website, phone | `UNIQUE(user_id)`, `UNIQUE(public_ref)` |
| `customer_preferences` | customer_id, language, display_currency, timezone, date_format, notification flags (json), reduce_motion | PK customer_id. Replaces `sv-display` and the prefs in `sv-demo-state` |
| `customer_flags` | id, customer_id, kind, note, created_by, resolved_at | Staff-only |
| `staff_members` | id, user_id, role_id, status (`invited`,`active`,`disabled`), disabled_at, disabled_by | `UNIQUE(user_id)` |
| `roles` | id, key (`owner`,`admin`,`support`,`orders`,`finance`, custom), name, is_system, version | `UNIQUE(key)` |
| `role_module_access` | role_id, module, level (`none`,`view`,`manage`) | PK(role_id, module) |
| `role_sensitive_permissions` | role_id, permission | PK(role_id, permission) |
| `staff_invitations` | id, public_ref `INV-…`, email, role_id, message, invited_by, token_hash, expires_at, accepted_at, revoked_at | partial `UNIQUE(lower(email)) WHERE accepted_at IS NULL AND revoked_at IS NULL` |

**Last-owner protection:** a deferred constraint trigger rejects any transaction that leaves zero `active` staff on the `owner` role. The service layer also checks this, for a friendly error.

## 3. Catalog, pricing, eligibility

| Table | Key columns | Notes |
|---|---|---|
| `platforms` | id (slug, e.g. `instagram`), name, icon_key, sort | Seeded from `catalog.ts` |
| `services` | id (slug, e.g. `instagram-followers`, **kept**), platform_id, category, name, description, visible, archived_at, origin (`catalog`,`custom`) | slug IDs are already used in URLs, favourites and mappings |
| `service_order_fields` | service_id or category, field key, kind, required, rules (json) | From `CATEGORY_FIELDS` |
| `service_price_versions` | id, service_id, pricing_model (`per1000`,`unit`,`fixed`,`fee`), cost_micros, price_micros, min_qty, max_qty, effective_from, created_by | Append-only; the current price is the latest row by `effective_from`. Orders reference the version |
| `service_eligibility` | service_id PK, policy_reviewed_at/by, fulfillment_verified_at/by, supplier_verified_at/by, payment_accepted (bool, set from processor policy), technical_ready_at, purchasable (generated) | `purchasable = all gates true AND visible AND not archived AND current price exists` |

**Purchasability is never implied.** A priced or mapped service stays unpurchasable until every gate in `service_eligibility` is recorded by an authorized person.

Each gate change writes an audit event. Changing price or mapping does not reset the policy review, but **does** require re-confirming the technical-readiness gate.

## 4. Orders and fulfilment

| Table | Key columns | Constraints |
|---|---|---|
| `orders` | id, public_ref, customer_id, service_id, price_version_id, quantity, link (validated URL), field_values (json, PII-scrubbed), unit_price_micros, total_cents, status, review_required, customer_status (generated), placed_at, idempotency_key | `UNIQUE(customer_id, idempotency_key)`, `CHECK(total_cents > 0)`, idx(customer_id, placed_at desc), idx(status) |
| `order_events` | id, order_id, type, from_status, to_status, actor (customer/staff/system/provider), data (json), at | Append-only. It is the order timeline the UI already renders |
| `order_reviews` | order_id, decision (`approved`,`rejected`), reason, decided_by, decided_at | |
| `fulfillment_attempts` | id, order_id, provider_id, provider_service_ref, provider_order_id, status (`queued`,`submitted`,`in_progress`,`partial`,`completed`,`failed`,`cancelled`), delivered_qty, cost_micros, request_hash, submitted_at, last_polled_at, error | `UNIQUE(provider_id, provider_order_id)`; at most one *active* attempt per order (partial unique index) |
| `order_refunds` | id, order_id, amount_cents, reason, journal_entry_id, created_by | `SUM(refunds) ≤ total_cents`, enforced in the transaction under a row lock |

**Canonical order states:**

```
pending_review ─approve→ queued ─submit→ in_progress ─→ completed
      │                    │                 ├─→ partial ─refund remainder→ completed (partially refunded)
      └─reject→ cancelled  └─cancel→ cancelled          └─fail→ failed ─→ requeue | cancel(refund)
needs_customer_action (bad link etc.) ↔ queued | in_progress
cancelled / failed with refund → refunded
```

Customer projection (`customer_status`), matching today's dashboard:

| Canonical state | Customer status |
|---|---|
| `pending_review`, `queued` | `pending` |
| `in_progress`, `partial` | `processing` |
| `needs_customer_action` | `attention` |
| `completed` | `completed` |
| `cancelled`, `refunded`, `failed` | `cancelled` (with the refund shown) |

Transitions are allowed only through `orders.service.transition()`, which locks the row, validates the edge, writes an `order_events` row and any journal entry in **one transaction**.

## 5. Providers

| Table | Key columns | Notes |
|---|---|---|
| `providers` | id (slug), name, type (`manual`,`api`), description, endpoint (https, allow-listed host), auth_method, enabled, supplier_reviewed_at/by, fallback_provider_id, limitations, archived_at | Mirrors the `Provider` type in `admin-providers.ts` |
| `provider_credentials` | id, provider_id, ciphertext, iv, key_version, last4, created_by, rotated_at | Never selected by read models used for the UI |
| `provider_service_mappings` | provider_id, service_id, provider_ref, priority, active, verified_at | `PK(provider_id, service_id)`; partial `UNIQUE(service_id) WHERE active AND priority = 1` |
| `provider_health_checks` | id, provider_id, ok, latency_ms, balance_cents, error, checked_at | Written only by the worker |

`statusOf()` in the UI can never return "connected". In the backend, `connected` is derived from a **successful server-side health check within N minutes**.

## 6. Payments, wallets and the ledger

### 6.1 Ledger accounts

| Table | Key columns |
|---|---|
| `ledger_accounts` | id, code (unique), type (`asset`,`liability`,`revenue`,`contra_revenue`,`expense`), customer_id (nullable), currency `USD`, is_system |

**System accounts:**

| Code | Type | Purpose |
|---|---|---|
| `processor_clearing:<processor>` | asset | Money settled at a processor or bank |
| `orders_in_progress` | liability | Money taken for orders not yet delivered (deferred revenue) |
| `revenue:orders` | revenue | Recognized order revenue |
| `refunds` | contra_revenue | Refunds against recognized revenue |
| `referral_rewards` | expense | Referral rewards paid |
| `provider_costs` | expense | Cost of fulfilment |
| `provider_payable:<provider>` | liability | Amounts owed to providers |
| `manual_adjustments` | expense | Staff wallet adjustments |

**Per-customer accounts:** `wallet:<customer>` (liability; money we owe the customer) and, if decision D6 chooses a separate balance, `rewards:<customer>` (liability).

### 6.2 Journal

| Table | Key columns | Constraints |
|---|---|---|
| `journal_entries` | id, kind (`deposit_credit`,`order_debit`,`order_revenue`,`refund`,`reward_credit`,`adjustment`,`reversal`), idempotency_key, reference_type/id, description, created_by, approved_by, created_at | `UNIQUE(idempotency_key)`; **no UPDATE/DELETE** (revoked privileges and a trigger) |
| `journal_lines` | id, entry_id, account_id, amount_cents (signed; debit +, credit −) | Deferred constraint trigger: `SUM(amount_cents) = 0` per entry |
| `wallet_balances` | account_id PK, balance_cents, version | `CHECK(balance_cents >= 0)`; updated in the same transaction as the lines; verified nightly against `SUM(journal_lines)` |

Corrections are new **reversal** entries, never edits.

### 6.3 Deposits

| Table | Key columns | Constraints |
|---|---|---|
| `deposits` | id, public_ref `DEP-…`, customer_id, amount_cents, method (`crypto`,`card`,`bank`,`paypal`), processor, processor_ref, status, requested_at, settled_at, credited_entry_id, expires_at | `UNIQUE(processor, processor_ref)`; `credited_entry_id` set exactly once |
| `deposit_reviews` | deposit_id, step (`first`,`second`), decision, checklist (json), decided_by, decided_at | Second step required when amount ≥ threshold; second reviewer ≠ first |
| `payment_webhook_events` | id, processor, event_id, signature_valid, payload (json, scrubbed), received_at, processed_at, error | `UNIQUE(processor, event_id)`; replay-safe |

**Deposit states:**

```
created → awaiting_payment → (processor: confirmed) settling → settled → credited
                         ↘ expired      ↘ failed               ↘ (manual) under_review → credited | rejected
```

- `pending` money is **never** in a wallet.
- Crediting requires either a verified processor settlement event, or (for bank transfers) staff review with the `approveDeposits` permission, plus the second review above the threshold.

### 6.4 Key postings

| Event | Debit | Credit |
|---|---|---|
| Deposit credited | `processor_clearing` | `wallet:<c>` |
| Order paid | `wallet:<c>` | `orders_in_progress` |
| Order completed (recognize) | `orders_in_progress` | `revenue:orders` |
| Order cancelled before completion | `orders_in_progress` | `wallet:<c>` |
| Refund after completion | `refunds` | `wallet:<c>` |
| Referral reward credited | `referral_rewards` | `wallet:<c>` (or `rewards:<c>`) |
| Provider cost accrued | `provider_costs` | `provider_payable:<p>` |
| Staff adjustment (+) | `manual_adjustments` | `wallet:<c>` |

**Reconciliation invariants** (checked nightly):
- Sum of all `wallet:*` balances equals the wallet liabilities shown on the Overview.
- Every `deposits.credited_entry_id` matches exactly one entry with the same amount.
- Every `orders.total_cents` equals `order_debit` minus all refunds credited back.

These are the same identities the demo already reconciles: credited deposits $1,875.00 − order payments + refunds = wallet liabilities $796.83.

**Concurrency:**
- An order debit runs `SELECT … FROM wallet_balances WHERE account_id = $1 FOR UPDATE`, checks the balance is at least the total, inserts lines, updates the balance, and inserts the order, all in one transaction.
- Retries use the same idempotency key, so they return the original result.

## 7. Support

| Table | Key columns |
|---|---|
| `tickets` | id, public_ref `TCK-…`, customer_id, subject, category (`order`,`payment`,`refund`,`service`,`account`,`technical`,`other`), priority (`normal`,`urgent`), status (`awaiting`,`waiting`,`resolved`,`closed`), order_id, deposit_id, assigned_to, last_customer_message_at, last_staff_message_at |
| `ticket_messages` | id, ticket_id, author_type (`customer`,`staff`,`system`), author_id, body (plain text, rendered escaped), created_at |
| `ticket_internal_notes` | id, ticket_id, staff_id, body, created_at. **Never** exposed to customer queries |
| `attachments` | id, owner_type/id, storage_key, filename, mime, size_bytes, sha256, scan_status, uploaded_by |

**Indexes:** idx(customer_id, updated_at), idx(status, last_customer_message_at).

## 8. Referrals

| Table | Key columns | Constraints |
|---|---|---|
| `referral_codes` | id, customer_id, code, created_at, disabled_at | `UNIQUE(code)`; one active per customer |
| `referral_policies` | id, version, reward_type (`fixed`,`percent`), fixed_cents, percent_bp, cap_cents, min_spend_cents, qualifying_days, hold_days, min_orders, count_refunded, max_per_referrer, destination, distribution (`manual`,`auto`), status, effective_from, created_by | append-only versions (mirrors `PolicyTerms` in `admin-referrals.ts`) |
| `referrals` | id, referrer_customer_id, referee_customer_id, code_id, via (`link`,`code`), policy_id (locked at signup), attributed_at, status (`signed_up`,`pending`,`qualified`,`ineligible`), ineligible_reason, qualified_at | `UNIQUE(referee_customer_id)`, so a customer can be referred only once; `CHECK(referrer ≠ referee)` |
| `referral_rewards` | id, referral_id, amount_cents, status (`pending`,`holding`,`awaiting_approval`,`approved`,`credited`,`reversed`), hold_until, approved_by/at, credited_entry_id, reversed_reason | `UNIQUE(referral_id)` (one reward per referral); `credited_entry_id` unique |
| `referral_events` | id, referral_id, type, data, actor, at | Append-only |

## 9. Notifications, settings, audit

| Table | Key columns |
|---|---|
| `notifications` | id, recipient_user_id, kind, title, body, link, read_at, created_at |
| `notification_preferences` | user_id, kind, channel (`in_app`,`email`), enabled. Covers both customer prefs and the admin events in Settings |
| `email_outbox` | id, to, template, data, status, attempts, provider_message_id, sent_at. Written in-transaction, sent by the worker |
| `platform_settings` | key, value (json), version, updated_by, updated_at. Replaces `sv-admin-settings`; only whitelisted keys |
| `audit_log` | id, actor_user_id, actor_type, action, target_type, target_id, before (json), after (json), ip, user_agent, request_id, at. Append-only, idx(target_type, target_id, at), idx(actor_user_id, at) |
| `staff_notes` | id, target_type (`order`,`customer`,`deposit`,`ticket`,`referral`,`referrer`), target_id, staff_id, body, created_at. Replaces the per-module note stores, with the same "no credentials" validation (`looksSensitive`) applied server-side |

## 10. Analytics

- **No separate warehouse.** Reports read from the transactional tables, plus nightly roll-up tables (`daily_order_stats`, `daily_ledger_stats`) built by the worker.
- Definitions stay identical to `admin-analytics.ts`:
  - Net revenue = order payments − refunds (or recognized revenue, per decision D5).
  - Deposits are not revenue.
  - Wallet liabilities are a point-in-time balance.
- CSV exports keep the existing formula-injection guard (`toCsv`) and run server-side, with the `overview:view` permission.
