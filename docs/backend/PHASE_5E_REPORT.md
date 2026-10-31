# Phase 5E — Real Orders & Manual Fulfillment: Implementation Report

Status: **complete within scope**. The order backend, atomic wallet charging, the manual fulfilment workflow and the live customer and admin order screens are built and tested.

Public checkout stays **off**:
- `commerce.checkout_enabled` is unset.
- No service has all six eligibility gates.
- Every real environment therefore refuses orders, both in the service and in the database.

## Order architecture

One authoritative `orders` row, with three **separate** states:

| State | Values | Meaning |
|---|---|---|
| `status` (operations) | `pending_review` Awaiting review · `queued` Approved / ready · `in_progress` In progress · `partial` Partially delivered (reserved) · `needs_customer_action` Needs customer information · `completed` · `rejected` · `cancelled` · `failed` · `refunded` (reserved) | The lifecycle. Staff, customers and the database all use the same mapping (`src/lib/orders.ts`), which replaces the two demo vocabularies |
| `payment_status` | `charged` · `released` · `refund_review` · `refunded` | Money. Charged at placement; released (returned to the wallet) on cancellation or rejection before work starts; held for refund review if it fails after work started |
| `revenue_status` | `deferred` · `recognized` · `reversed` | Revenue, per the D5 policy (see below) |

Each order also stores:
- **Frozen snapshot:** `price_snapshot`, holding the service name, platform, category, pricing model, unit price, limits, price version and its effective date.
- **Customer input:** quantity, link and validated details.
- **Money references:** total cents, the price version, and the charge, release and recognition ledger entry ids.
- **Fulfilment:** assignee, method (`manual`) and an internal reference.
- **Timestamps:** placed, started, completed and closed.
- **Review:** an `order_reviews` decision.
- **History:** an append-only `order_events` timeline.
- **Notes:** internal `staff_notes`.

## Secure creation and atomic charging

`createOrder` (`src/server/orders/orders.ts`) re-checks everything on the server and never trusts a client price, status or balance. The body is strict: extra keys such as `totalCents` or `status` get 400.

1. **Account:** an active, verified customer. Same-origin is required, plus a mandatory `Idempotency-Key`.
2. **Checkout switch:** `commerce.checkout_enabled` must be true.
3. **Service:** visible, not archived, not a draft.
4. **Eligibility:** a row in `purchasable_services`, meaning all six gates (policy, supplier, fulfilment, payment acceptance, legal, technical) and a current price. Budget-based (`fee`) services are refused because they're arranged with staff.
5. **Order details:** quantity within the price version's limits (1 for fixed-price services); an https link where required; details matching the service's own form fields, with credential-like text refused.
6. **Total:** computed in integers with half-up rounding of micro-dollars to cents (`totalCentsFor`).
7. **One transaction:**
   - Lock the customer row (serialising the 10-orders-per-minute rate limit).
   - Insert the order with its snapshot.
   - Post `order_debit` (wallet → `orders_in_progress`) through the ledger, which locks the wallet and refuses to go negative.
   - Link the entry.
   - Write the `created` event and the audit record.

   Any failure rolls back everything. Insufficient funds means no order exists.

The database repeats the checks:
- **SV009:** the checkout switch and purchasability are checked on insert.
- **SV011:** a deferred trigger refuses any order without its charge at commit (no unpaid or partially paid orders). The charge must take exactly the total from that customer's wallet.

Retries with the same key return the original order. A reused key with different details gets 409. Concurrent orders can't overdraw a wallet.

## Lifecycle rules (service + database trigger SV011)

| From | Allowed to | Who / requirements |
|---|---|---|
| Awaiting review | Approved, Needs info, Rejected, Canceled | Approve and request information: Orders: Manage. Reject and cancel: Orders: Manage + re-auth, with funds returned. The customer can cancel |
| Needs info | Awaiting review (customer updates details), Rejected, Canceled | Only the link and details can change, and only in this state; price and quantity never change |
| Approved | In progress, Needs info, Canceled, Failed | Start needs an assignee plus an internal fulfilment reference. Failing here (nothing worked on) cancels and returns the funds |
| In progress | Completed, Failed (Partially delivered reserved) | Complete: Orders: Manage + re-auth, evidence of at least 20 characters, two confirmations, an optional https evidence link. Fail: re-auth and a reason; payment goes to `refund_review` |
| Failed | Refunded (reserved; refunds disabled) | — |
| Completed, Rejected, Canceled, Refunded | — | Final. The only later change allowed is recognising a completed order's revenue once |

The database also refuses:
- any change to identity, customer, service, price version, quantity, prices, snapshot or idempotency fields;
- changing a recorded ledger reference;
- completion without a recorded start time, reference and completion time;
- cancellation or rejection without released funds;
- a release that doesn't return exactly the total;
- deleting orders, or editing order events.

**Never fabricated:** the system invents no delivered quantities, percentages or provider responses. Progress is a factual note with an optional evidence link entered by staff.

## Financial postings

| Event | Debit | Credit | Kind |
|---|---|---|---|
| Order placed | `wallet:<c>` | `orders_in_progress` (committed / deferred) | `order_debit` |
| Canceled or rejected before work, or failed while still Approved | `orders_in_progress` | `wallet:<c>` | `order_cancel` (idempotent per order) |
| Completed, only when `REVENUE_RECOGNITION_POLICY=on_completion` | `orders_in_progress` | `revenue:orders` | `order_revenue` (idempotent per order) |
| Failed after work started | — (held) | — | `payment_status = refund_review`; refunds are disabled |

**Revenue (D5):** decision D5 is unresolved, so the default `REVENUE_RECOGNITION_POLICY=deferred` recognises nothing; completed orders stay in `orders_in_progress`. The `on_completion` path is implemented and tested, but only an explicit configuration change switches it on. Seek accounting advice before using these figures for financial statements.

## Reconciliation additions

`reconcile()` now also checks:
- every order's charge equals its total on its customer's wallet;
- every released order returned exactly its total;
- no `order_debit` exists without an order;
- `orders_in_progress` equals the totals of charged or refund-review orders that are still deferred;
- `revenue:orders` equals the totals of recognised orders.

`financialSummary` reports `committedToOrdersCents` separately from wallet liabilities and revenue. It is still read-only: problems are reported, never repaired.

## Notification-ready events

`order_events` rows are durable and carry a `notify` key: `order.created`, `order.awaiting_review`, `order.needs_info`, `order.accepted`, `order.rejected`, `order.fulfillment_started`, `order.completed`, `order.failed`, `order.cancelled` and `order.refund_review`. Nothing is sent; the `notifications.send` job stays disabled.

## APIs

| Method and path | Auth | Notes |
|---|---|---|
| `GET /api/account/orders` | customer | Own orders only. `q`, `status` (`open`, `attention`, `completed`, `closed`), `page`, `pageSize` ≤ 50 |
| `POST /api/account/orders` | customer + same-origin + `Idempotency-Key` | Returns 503 while checkout is off or the service isn't purchasable; 201 when created, 200 when replayed |
| `GET /api/account/orders/:ref` | customer | Own only (404 otherwise). Shows customer-safe events; internal references and notes stay internal |
| `POST /api/account/orders/:ref/cancel` | customer + same-origin | Awaiting review or Needs info only; returns the full amount |
| `POST /api/account/orders/:ref/details` | customer + same-origin | Needs info only; the order returns to review |
| `GET /api/admin/orders` | `orders:view` | `q`, `status`, `platform`, `assigned` (`me`, `unassigned`), `sort`, `page`. Includes queue counts, checkout state and whether the viewer can manage |
| `GET /api/admin/orders/:ref` | `orders:view` | Snapshot, money states, ledger ids, fulfilment, timeline, notes, next step, blockers |
| `GET /api/admin/orders/assignees` | `orders:view` | Active staff with Orders: Manage |
| `POST /api/admin/orders/:ref/{approve,request-info,assign,start,progress,notes}` | `orders:manage` + same-origin | — |
| `POST /api/admin/orders/:ref/{complete,reject,cancel,fail}` | `orders:manage` + **re-auth** + same-origin | Money-moving or closing actions. Unknown actions get 404 |

## UI (live mode)

- **Customer My Orders:**
  - Real orders with filter chips (Active, Needs you, Completed, Canceled & failed), search and pagination.
  - A detail sheet deep-linked as `?order=`, with working Back and Forward. It shows the status explanation and reason, details, payment state and the recorded activity timeline.
  - Actions: cancel and return the funds, send updated details when asked, order again.
  - An honest empty state.
- **New Order:** the wizard is now usable in live mode with the real balance. Final checkout stays disabled ("Checkout isn't open yet — nothing is charged").
- **Overview:** links to New Order and My Orders.
- **Admin Orders:**
  - Queue cards (Awaiting review, Needs info, Ready, In progress) and a checkout on/off indicator.
  - Search and filters held in the URL, so deep links and Back/Forward work.
  - A drawer with **one primary next action** (Approve → Assign to me → Start fulfilment → Complete with evidence) and **More** for asking for information, recording progress, reject, cancel and mark failed.
  - Shown in the drawer: the frozen snapshot, payment and revenue cards, fulfilment details with assignment, the activity timeline and internal notes.
  - Staff who can only view see no actions.
  - The re-auth dialog is now shared with Payments (`src/components/admin/reauth.tsx`).
- **Demo mode** is unchanged.

## Migration `0005_orders_5e`

- **New columns:** `request_hash`, `payment_status`, `revenue_status`, `release_entry_id`, `recognition_entry_id`, `price_snapshot`, `status_reason`, `assigned_to`, `fulfillment_method`, `fulfillment_ref`, `started_at`, `completed_at`, `closed_at`.
- **New status:** `rejected` (also allowed in `order_events`).
- **New CHECKs:** payment and revenue states, `manual` as the only fulfilment method, text lengths, released ⇔ release entry, recognised ⇔ recognition entry.
- **Triggers:** `orders_change_check` (SV011), `orders_no_delete`, and the deferred `orders_paid_check`.
- **Rollback:** `drizzle/rollback/0005_orders_5e.down.sql`.
- **Applied to:** `socivanta_dev`. After applying, the dev database still has 0 purchasable services, 0 orders and 0 journal entries, and the checkout setting is unset.

## Tests (exact results, final run)

| Suite | Result |
|---|---|
| Unit + integration (real PostgreSQL 18.4) | **180 / 180** across 17 files |
| New: `tests/integration/orders.test.ts` (19 tests) | Runs in its **own scratch database**: checkout and gates are enabled only there, and test wallets are funded by test-only postings. Covers:<br>• checkout off refuses orders (service and SV009);<br>• a missing gate refuses even with checkout on;<br>• atomic charge with a frozen snapshot that survives later price changes;<br>• validation of quantity, link, details, credentials and the strict body;<br>• insufficient funds creates nothing;<br>• duplicate and concurrent idempotency;<br>• concurrent orders can't overdraw;<br>• rate limit;<br>• database refuses money edits, invalid transitions, detail edits, deletes and event edits;<br>• integer half-up maths;<br>• full manual flow with evidence and an internal reference hidden from the customer;<br>• closed orders are final;<br>• deferred versus on-completion revenue;<br>• customer cancel with exactly one release;<br>• reject and pre-start fail return funds; post-start fail holds them for refund review (refunds disabled);<br>• information request round-trip;<br>• notes and assignment rules;<br>• ownership and route auth, CSRF, header, permissions, re-auth and unknown action;<br>• reconciliation |
| Updated tests | Migrations up/down/up across 6 migrations. The 5A gates test now charges its order in the same transaction and asserts an unpaid order is refused (SV011) |
| Typecheck, ESLint (`--max-warnings=0`), production build | Pass |
| Browser, live mode, checkout off (`ord5e off`, production build) | **11 / 11**: empty My Orders with no demo orders; New Order wizard usable with $0.00 balance; API refuses with 503; admin shows "Checkout off" and an honest empty state; 320 px dark with no horizontal scroll on 3 pages |
| Browser, live mode, isolated "on" database (`ord5e on`) | **22 / 22**, no console errors: three orders charged ($20 → $14); real list; deep link plus Back and Forward; customer cancel returns funds; keyboard Enter opens the admin drawer; Approve → Assign to me → Start with reference → Complete with evidence after re-auth (real TOTP); revenue shows Deferred; Reject via More returns funds; customer sees recorded activity and the rejection reason and never the internal reference; ledger balance $18.00; reduced-motion context; support is view-only; 320 px light and dark |

## Intentionally disabled

- Public checkout: the switch is off, no service is purchasable, and the New Order final step is disabled.
- External provider submission and automated fulfilment: manual only.
- Refunds after work starts: held in `refund_review`, and `requestRefund` still refuses.
- Revenue recognition: deferred by default (D5).
- Real notifications.

## Remaining launch requirements

1. **D2:** an approved list of services that may legally and commercially be sold, with each of the six gates recorded by an accountable person.
2. **D3 / funding:** a verified way for customers to fund wallets (bank transfer configured, or an approved processor).
3. **D5:** a revenue-recognition decision with accounting advice. Then set `REVENUE_RECOGNITION_POLICY` and recognise any completed backlog through a reviewed procedure.
4. **Refund workflow:** an approver, partial amounts capped by trigger SV004, an `order_refunds` record, reconciliation, and then flipping `REFUNDS_ENABLED` through code review.
5. **Checkout switch:** an owner-only, audited control for `commerce.checkout_enabled` (today it's a database setting with no UI).
6. **Operations:** a written manual-fulfilment procedure (what counts as evidence per service), staffing with Orders: Manage, and alerting on failed reconciliation jobs.
7. **Next phase (5F providers):** provider adapters on `fulfillment_attempts` with health and supplier review, always behind the same eligibility gates.
