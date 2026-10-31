# Phase 5H-B: Advanced Reports, CSV Exports & Platform Settings

Status: **complete within scope.** In live mode (`DEMO_MODE` off):

- `/admin/reports` is a real reporting workspace with secure CSV export;
- `/admin/settings` is a centralised, honest settings workspace;
- the old `/admin/analytics` URL redirects to Reports.

Demo mode keeps the illustrative pages.

Nothing in orders, fulfilment, payments, wallets, the ledger, revenue policy, AI execution, AI provider management, publishing, support, referrals or authentication changed.

## 1. Routes

| Route | Access | Purpose |
|---|---|---|
| `/admin/reports` | Overview: View (the report list is filtered by role on the server) | Seven reports with range, filters, charts, breakdowns, a searchable paginated table and Export CSV |
| `GET /api/admin/reports?report=…&range\|from\|to&q&status&platform&category&flagged&page` | Overview: View **and** the report's module: View | One report |
| `GET /api/admin/reports/export?…` (same query) | Same as the report, plus a rate limit | CSV of the report's table |
| `/admin/settings` | Settings: View | Platform settings workspace |
| `GET /api/admin/settings` | Settings: View | Settings read model (no secrets) |
| `POST /api/admin/settings/reporting` | Settings: Manage + recent re-auth + same origin | Save reporting preferences |
| `GET /api/admin/overview` (5H-A) | unchanged | Now uses the saved timezone and default range |

**Code:**

- Server: `src/server/analytics/reports.ts`, `src/server/analytics/request.ts`, `src/server/settings/{reporting,overview}.ts`
- Shared: `src/lib/reports.ts`, with timezone helpers added to `src/lib/admin-overview.ts`
- UI: `src/components/admin/live-reports.tsx` and `src/components/admin/live-settings.tsx`
- Navigation: Analytics became **Reports**

## 2. Reports and metric definitions

Every report reuses the 5H-A definitions (`compared`, `series`, `financialSummary`, `adminOverview`, `catalogCounts`). An integration test confirms the Financial report and the Overview return identical revenue, funding and wallet figures.

| Report (module) | Key figures | Charts and breakdowns | Table (= export) |
|---|---|---|---|
| **Business overview** (overview) | The Overview's KPIs the role may see | Orders, registrations, funding (if allowed); order status | Export: the per-day figures behind the charts |
| **Customers** (customers) | All-time customers, new (with comparison), confirmed email (%), customers who ordered (only with orders:view) | Registrations | New customers: reference, name, joined (UTC), email confirmed, order count (only with orders:view). **No emails.** |
| **Orders & services** (orders) | Placed (with comparison), gross order value ("not revenue"), completed, closed | Orders; by status (drill-down), platform, category; catalog readiness note (only with services:view) | Orders: reference, placed (UTC), service, platform, category, quantity, value, status. Filters: status, platform, search. |
| **Financial activity** (payments) | Recognised revenue (net of refunds; notes when the policy is deferred), revenue to date, order value (only with orders:view), wallet funding, wallet balances, committed to open orders, deposits to verify | Revenue and funding series; wallet movements by kind; deposits by status | Deposit requests: reference, requested (UTC), customer reference, method, amount, status. Filters: status. |
| **Customer support** (support) | Opened (with comparison), resolved in period, open now, staff replies, **median first response** (first staff message after opening) | Opened; by topic; by status | Tickets: reference, opened, topic, priority, status, first response (minutes), resolved. **No subjects or messages.** |
| **Referrals** (referrals) | Referred sign-ups (with comparison), confirmed email, flagged awaiting review, under review, rejected | Sign-ups; by status; by source | Referrals: date, referrer and referred references, code, via, status, review signals, confirmed. Filters: status, flagged only. |
| **AI & automation** (settings) | Requests, errors, stopped by limits, tokens (hidden when not reported), **estimated cost** ("not a provider invoice") | Requests; by provider; internal automation runs | AI usage by tool, with estimated cost |

**Honest states:**

- Profit and margin aren't shown, because provider costs aren't in the ledger.
- There's no first-response figure when no ticket has a staff reply.
- Qualification is shown as locked.
- AI generation state and the reason it's off are shown.
- Charts mark periods before the first record as "no history".

## 3. Timezones and date windows

- **Reporting timezone:** an editable setting, UTC by default. Each window's days start at **local midnight**, converted to exact UTC instants (`zonedMidnight`).
- **DST:** handled correctly; a test checks a 25-hour day on 2026-11-01 in New York. Labels name the zone and offset (for example "America/New_York, GMT-4") and note "includes a daylight-saving change".
- **Stored timestamps are untouched.** Grouping uses `to_char(column at time zone <tz>)`, matched to the same local keys in code.
- **One window per request:** KPIs, charts, breakdowns, the table and the export all use the same `[start, end)`. Tests confirm that a chart's total equals its KPI, which equals the table total, which equals the CSV row count, with and without filters.
- **Lifetime vs period:** lifetime and current-state figures are labelled ("all time", "Current") separately from period figures.
- **Table display vs export:** tables show times in the reporting timezone; CSV columns are UTC (`*_utc`).

## 4. CSV export safeguards

- **Permissions:** the same as the report (module View), checked independently in the export route. Cross-module columns appear only when allowed.
- **Same data as the view:** each report has one table definition used by both the paginated view and the export, with identical filters and ordering.
- **Formula injection:** text starting with `= + - @ TAB CR` gets an apostrophe prefix. Quoting follows RFC 4180, and numbers are written as plain numbers.
- **Size limit:** 10,000 rows. Larger exports are refused with "Narrow the date range or filters".
- **Rate limit:** 10 exports per staff member per 10 minutes, returning 429.
- **Audit:** each export writes `report.exported` with the report, window, timezone, filters and row count. Rows themselves and personal data aren't logged.
- **Response headers:** `text/csv; charset=utf-8` with a BOM, `attachment; filename=socivanta-<report>-<from>-to-<to>.csv`, `private, no-store`, `nosniff`.
- **Clear labels:** money columns are `*_usd`; AI cost is labelled as an estimate, not an invoice. There are no PDF, Excel or scheduled exports.
- **UI feedback:** "Exported N rows to …", or the server's error message.

## 5. Platform settings

The workspace has five sections: General, Orders & services, Financial policies, AI & integrations, and Security & administration. Each row is either **Editable** or **Read-only**; read-only rows link to the workspace that manages them.

**Editable (real persistence, real effect):**

- **Reporting timezone** (every IANA zone plus UTC; validated on the server).
- **Default date range** (Today, 7, 30 or 90 days).
- Stored in `platform_settings` under `reporting.preferences`.
- Used by the Overview and Reports whenever no range is given in the URL.
- Saving needs Settings: Manage, re-authentication (the existing re-auth dialog) and the same origin. It uses an optimistic version check, so a stale save returns 409.
- Each save writes an audit entry (`settings.reporting_saved`) with the before and after values.
- The UI shows unsaved changes, with Discard and Save.

**Read-only, from existing sources:**

- site address, environment and demo mode;
- checkout state;
- orderable services and provider readiness;
- **revenue recognition policy**: locked here, explained, and changeable only through a separate approved release;
- payment method readiness;
- a glossary explaining revenue, order value, funding and liabilities;
- AI generation state (Live, Off or Paused, with the reason);
- verified AI providers and the active key count (never key values);
- email, social connection and publishing readiness;
- staff MFA requirement, session lengths and the re-auth window (from `SESSION_POLICY` and `REAUTH_WINDOW_MS`);
- active staff by role and MFA enrolment (only with staff:view);
- recent administrative changes.

No switch can activate an integration, payments, AI generation, publishing or rewards.

## 6. Permissions and security

- **Every report, export and settings call is checked on the server.** The page also filters the report list server-side, and the API re-checks each request.
- **Support role:**
  - can open Business overview, Customers, Orders, Support and Referrals;
  - gets **403** for Financial and AI reports and exports, and for Settings;
  - the Business overview it sees has no revenue or funding fields (tested).
- **Finance role:** can't save settings (403).
- **Data minimisation:** no emails in any report or export (tested); ticket subjects and messages aren't included.
- **Secrets:** an integration test confirms that `AUTH_SECRET`, `DATA_ENCRYPTION_KEY` and the API keys never appear in the settings response.
- **Input validation:** filters are checked against strict patterns and enums, pages are clamped, and invalid ranges or timezones return 400.
- **Indexing:** all admin pages stay authenticated and noindex.

## 7. Database

Migration **`0016_reports_5h`** (rollback included) adds indexes only: `tickets(created_at)`, `referrals(attributed_at)` and `deposits(requested_at)`. It's applied to `socivanta_dev` and `socivanta_dev_utf8`, and the migration test now expects 17 migrations. Settings reuse the existing `platform_settings` table, with no schema change.

## 8. Test results

| Check | Result |
|---|---|
| Typecheck, ESLint (whole project, 0 problems), production build | Pass |
| New integration tests (`tests/integration/reports.test.ts`) | **11 / 11** |
| New unit tests (`tests/unit/reports.test.ts`) | **6 / 6** |
| Updated tests | `migrations` (0016) |
| Full Vitest (includes 5H-A, referral, support, AI and payments regressions) | **528 / 528** |
| Browser QA (production build, scratch database) | **69 / 69** |

**What the integration tests cover:**

- KPIs, chart, table and CSV reconcile, including under filters;
- financial figures stay separate and match the Overview;
- honest empty states;
- formula injection is neutralised and no emails are exported;
- the size limit;
- the rate limit (the 11th export returns 429) and audit entries without personal data;
- per-role 403s;
- request validation;
- settings contain no secrets;
- settings saves need Manage, re-auth, the same origin, valid values and the current version, and are audited;
- the Overview and Reports adopt the saved timezone and default range;
- local-midnight boundaries.

**What the unit tests cover:**

- CSV escaping;
- filter parsing;
- local midnight in New York and Kolkata;
- the DST 25-hour day and its label;
- "today" following the local calendar day;
- the report-to-module mapping.

**What the browser QA covers:**

- settings: read-only states, no secrets, unsaved changes, Discard, saving through the re-auth guard, and the Overview reflecting the new timezone and default range;
- all seven reports with exact fixture values ($14.00 gross, $2.00 revenue, $680.00 funding, $666.00 wallets);
- the status filter changes the KPIs and the table, and the downloaded CSV matches the filtered table;
- search, row drill-down to the order, custom range, the flagged filter's empty state, and keyboard navigation;
- the Support role's restricted reports, API and settings;
- no horizontal overflow on 4 views at 320, 375, 768, 1024 and 1440 px in light and dark (dark with reduced motion);
- no console errors.

**Issues found and fixed:**

1. The settings save response lacked the timezone label, so "Currently …" kept showing the old zone.
2. Filter placeholders read "All status"; they're now "Any status".
3. The audit label for saving preferences was unreadable ("Settings reporting saved"); it's now "Reporting preferences changed".

## 9. Known limitations

- **Revenue under the default policy:** with `REVENUE_RECOGNITION_POLICY=deferred` (the default), revenue stays $0, and the reports say why.
- **No profit or margin:** provider costs (`provider_cost` entries) and AI invoice reconciliation don't exist yet.
- **Timezone scope:** the timezone is platform-wide, not per viewer. Exports use UTC by design.
- **Export size:** exports are synchronous and capped at 10,000 rows; there are no background or scheduled exports.
- **Support report:** first response is the first staff message. The report has no business-hours or SLA logic and doesn't include subjects.
- **Data history:** cohort and retention analysis isn't included; it needs a longer data history to be meaningful.

## 10. Phase 5I prerequisites

- **Cost data:** provider cost postings and an accounting decision, before any margin reporting.
- **Recognition policy changes:** an approved release process if the recognition policy should be changeable in the UI (owner-only, re-auth, four-eyes).
- **Large exports:** background export jobs with expiring, audited download links, for sets above 10,000 rows.
- **Per-viewer preferences:** saved views and per-viewer timezone, if needed.
- **Retention:** a policy for audit and export records.
