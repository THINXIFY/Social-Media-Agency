# Phase 5H-A: Admin Analytics & Business Intelligence Dashboard

Status: **complete within scope.** In live mode (`DEMO_MODE` off), `/admin` now shows a real business dashboard. Before this phase it showed a "not connected yet" state. Demo mode keeps the illustrative overview.

Everything is read-only, and every figure traces back to database records. Nothing in orders, the ledger, wallets, payments, AI execution, support, referrals or authentication changed.

## 1. Routes and components

| Piece | Path |
|---|---|
| Page (live/demo split via `SectionGate live=`) | `src/app/admin/(panel)/page.tsx` |
| Dashboard UI (client; no chart library) | `src/components/admin/live-overview.tsx` |
| API | `GET /api/admin/overview?range=today\|7d\|30d\|90d\|custom&from=YYYY-MM-DD&to=YYYY-MM-DD` |
| Analytics service | `src/server/analytics/overview.ts` (`adminOverview`) |
| Ranges and response types (shared) | `src/lib/admin-overview.ts` (`resolveRange`, `buckets`, `OverviewResponse`) |
| Indexes | `drizzle/0015_analytics_5h.sql`, with rollback |

## 2. Dashboard sections

The heading reads "Your Business, At a Glance." and the toolbar offers:

- **Range:** Today, 7 days, 30 days, 90 days, or Custom (date pickers, up to 366 days).
- **Refresh**, plus an "Updated hh:mm" note.
- **The exact window**, for example "Oct 1, 2026 – Oct 30, 2026 (UTC)".

The range is kept in the URL. There's no polling.

| Section | Contents |
|---|---|
| **A. Key figures** | Customers (total, new), Orders placed, Recognised revenue, Wallet funding (marked "not revenue"), Orderable services, Open tickets. Each card links to its workspace and shows its comparison with the previous period. |
| **B. Business performance** | Charts of orders placed and new registrations; order status breakdown (each row links to the filtered order list); wallet funding chart; a **"Money, kept separate"** panel (recognised revenue, revenue to date, gross order value, money committed to open orders, wallet balances). |
| **C. Operational health** | Current state, not tied to the selected period. Orders awaiting review, waiting on customers, ready or in progress; uncertain provider outcomes; provider integrations; deposits to verify; payment methods; tickets needing a reply; flagged referrals. Each tile links to its workspace, and items needing attention are highlighted. Providers and payment methods show **"Not configured"** when nothing is enabled. |
| **D. Customer & service insights** | Top 5 services ordered; orders by platform; service readiness (in the catalog → visible → priced → passed every eligibility check); checkout on/off. |
| **E. AI & automation** | AI generation state (Live, Off, or Paused in an emergency, with the reason); number of verified providers; requests, errors and tokens ("Not reported" when providers didn't report them); estimated cost labelled "not provider invoices"; requests stopped by allowances or budgets; internal automation runs, kept separate from **external publishing**, which reads Off unless enabled. |
| **F. Recent activity** | The latest 12 audit entries the viewer may see. Each shows a readable label, the area, the actor (a staff name, or just "Customer" / "System"), the time and a link. |

**Charts:**

- All charts are single-series columns in the brand violet (`--primary`). Previous-period comparisons appear as text, never as a second series.
- The dataviz palette validator passed the light and dark colours against the card surfaces.
- Each chart has:
  - a tooltip on hover;
  - an accessible summary;
  - a "View as table" alternative;
  - "No history yet" styling for periods before the first record;
  - an honest empty state.

## 3. Metric definitions and sources

| Metric | Definition | Source |
|---|---|---|
| Customers / new | Rows in `customers`; new = `created_at` inside the window | `customers` |
| Confirmed email (new) | New customers whose user has `email_verified_at` set | `customers` ⨝ `users` |
| Orders placed / order value | Count and gross `total_cents` with `placed_at` inside the window. **Order value is not revenue.** | `orders` |
| Order status breakdown | `status` of orders placed inside the window | `orders` |
| Top services / platforms | Grouped by `service_id` and the platform recorded in the price snapshot at checkout | `orders.price_snapshot` |
| **Recognised revenue** | Ledger lines inside the window on `revenue:orders` (credits) and `refunds` (contra-revenue debits). Net = −Σ amount. | `journal_lines` ⨝ `journal_entries` ⨝ `ledger_accounts` |
| Revenue to date | Balance of `revenue:orders` minus balance of `refunds` | `account_balances` |
| Recognition policy | `REVENUE_RECOGNITION_POLICY`. When `deferred` (the default), the revenue card says "Recognition is deferred by policy" instead of implying no sales. | env |
| **Wallet funding** | Wallet credits from `deposit_credit` entries inside the window. This is a liability, never revenue. | ledger |
| Wallet balances, committed, funded customers | Reuses `financialSummary` (Payments reporting) | `account_balances` |
| Deposits to verify | Deposits in `under_review` or `settled` (same as Payments) | `deposits` |
| Payment methods | `methodReadiness()`: methods accepting requests | env/config |
| Orderable services | Reuses `catalogCounts` (`purchasable_services` view: all six eligibility checks plus a current price) | catalog |
| Checkout | Reuses `checkoutEnabled` | `platform_settings` |
| Provider integrations | Providers that are enabled, supplier-reviewed and not archived | `providers` |
| Uncertain outcomes / active attempts | Fulfilment attempts in status `unknown`, or `queued` / `submitted` / `in_progress` | `fulfillment_attempts` |
| Tickets | Counts by status `awaiting`, `in_progress` and `waiting`; opened inside the window | `tickets` |
| Referrals | New inside the window; flagged = has review signals and status `signed_up` or `pending` | `referrals` |
| AI usage | Same filters as AI Management's usage report (statuses, tokens, estimated cost excluding pending) | `ai_usage_events` |
| AI state | Reuses `ai/control/usage.overview` (generation status, emergency pause, provider states) | controls + env |
| Automations | Runs started inside the window, by status | `automation_runs` |

**Comparisons:**

- The previous window is the same length, ending where the current one starts.
- It's shown **only when records exist from before it started**, judged by the earliest customer. Otherwise the card says "No earlier data to compare".
- A previous value of zero is described in words ("None in the previous period"), never as a misleading percentage.

## 4. Dates and timezone

- **Timezone:** all boundaries are UTC.
- **Presets:** start at UTC midnight (today, or N−1 days back) and end now.
- **Custom ranges:** include both dates and stop at now. They're rejected if invalid, reversed, in the future or longer than 366 days (returns 400).
- **One window per request:** every card, chart and comparison uses the same half-open interval `[start, end)`.
- **Buckets:** hourly for Today, otherwise daily. They're computed with `date_trunc` in SQL and filled with zeros in code. Zero is only shown for periods covered by data; earlier periods are marked as having no history.

## 5. Queries and performance

- **Query shape:** server-side aggregates only, run in parallel per section, with no N+1 queries and no row lists except the top-5 services and 12 activity entries.
- **Migration `0015_analytics_5h`** adds indexes for the window scans (indexes only, no data changes):
  - `orders(placed_at)`
  - `customers(created_at)`
  - `journal_entries(kind, created_at)`
  - `audit_log(at desc)`
  - `automation_runs(created_at)`
- **Verified:** an integration test checks with `EXPLAIN` that these indexes are used.
- **Applied to:** `socivanta_dev` and `socivanta_dev_utf8`.
- **Client:** one fetch per range change or Refresh. Charts are plain HTML/CSS; no new dependencies.

## 6. Security and permissions

- **Route permission:** the API needs `overview:view`. Each section is computed **only** when the role can view the module that owns it:
  - customers, orders, payments (finance), services, providers, support and referrals each need View on their own module;
  - AI & automation needs `settings:view`, the same rule as `/admin/ai`.
- **What each default role sees:**
  - **Support:** no revenue, funding, wallets, providers or AI. This is enforced in the API response, not just hidden in the UI (tested).
  - **Finance:** sees finance, but not AI or providers.
  - **Owner:** sees everything.
- **Activity feed:** filtered by the same module rules. `before`/`after` audit payloads are never selected; customer emails and names never appear; staff appear by name.
- **Responses:** private and `no-store`. Admin pages stay noindex. Customers get 401/403. Nothing is written or logged with personal data.

## 7. Test results

| Check | Result |
|---|---|
| Typecheck, ESLint (whole project, 0 problems), production build | Pass |
| New integration tests (`tests/integration/overview.test.ts`) | **7 / 7** |
| New unit tests (`tests/unit/admin-overview.test.ts`) | **3 / 3** |
| Updated test | `migrations` (16 migrations; 0015 rollback is indexes only) |
| Full Vitest (includes SMM, AI, referral, support and payments regressions) | **511 / 511** |
| Browser QA (production build; scratch databases with and without fixtures) | **56 / 56** |

**What the integration tests cover:**

- an empty platform shows zeros and no history;
- with controlled fixtures:
  - exact customer, order, status and top-service counts;
  - revenue equals only the completed order;
  - funding equals credited deposits;
  - wallet balance equals funding minus charges;
  - committed money equals open orders;
  - all four figures are distinct;
- a record 1 ms before the window is excluded while one exactly at its start is included;
- hourly buckets for Today;
- per-role section visibility through the real route;
- the activity feed hides payloads, emails and payment entries from Support;
- invalid ranges return 400;
- the endpoint writes no audit rows;
- index usage.

**What the browser QA covers:**

- KPI values match the fixtures exactly ($2.00 revenue, $680.00 funding, $14.00 order value, $666.00 wallets, $12.00 committed);
- the comparison appears only where history exists (7 days: +300%);
- Today, Custom and Refresh;
- chart tooltip and table view;
- operational tile drill-down to `/admin/orders?status=pending_review`;
- keyboard use of the range control;
- the Support role sees only authorised sections (UI and API);
- empty and "Not configured" states;
- no horizontal overflow on 3 views × 5 widths (320–1440 px) in light and dark (dark with reduced motion);
- no console errors.

**Issues found and fixed:**

- `FILTER` can't follow a wrapped expression; comparison totals now run as two simple windowed queries.
- An aggregate needed parentheses before a `::text` cast.
- AI stat tiles truncated at half width and the range pills clipped on phones.

## 8. Unavailable metrics and limitations

- **Revenue reads $0 under the default policy.** It's only recognised when `REVENUE_RECOGNITION_POLICY=on_completion`; the dashboard says so instead of guessing.
- **No profit or margin:** provider costs aren't posted (`provider_cost` entries don't exist yet), so none is shown.
- **No AI cost reconciliation:** AI cost is SociVanta's estimate; provider invoices aren't imported.
- **Cancelled orders stay in order value:** the gross order value includes them, by design ("placed"). The status breakdown shows the split.
- **History reference:** "History exists" is judged by the first customer record.
- **Timezone:** the dashboard uses UTC only; there's no per-viewer timezone yet.
- **Activity labels:** the activity feed shows the latest 12 entries, with labels derived from audit action names. Unusual actions read literally (for example, "Order fulfillment started").

## 9. Requirements for Phase 5H-B

- **Advanced reporting:** cohorts, retention, conversion funnels, and a per-service revenue breakdown once revenue is recognised.
- **CSV/PDF exports:** permission-checked and audited, with personal data minimised.
- **Per-viewer timezone and saved views.**
- **Margin reporting:** needs provider cost postings (`provider_cost`) and an accounting decision.
- **AI spend reconciliation:** against provider invoices.
- **Platform settings UI:** for recognition policy and checkout, behind re-authentication and the existing approvals.
