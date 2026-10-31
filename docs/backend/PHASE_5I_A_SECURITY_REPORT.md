# Phase 5I-A: Security Audit & Backend Hardening

Audit date: 2026-10-31. This was a risk-based review of the code plus automated and browser verification on scratch databases only. No external service was contacted, no real record was changed, and no integration was enabled.

## A. Executive summary

**Overall assessment:** the backend's security design is sound. The audit found **no Critical or High vulnerabilities**. These boundaries were all already in place and were verified:

- server-side authorisation, re-checked against the database on every call;
- mandatory staff MFA and re-authentication for sensitive changes;
- hashed session tokens, Argon2id passwords and encrypted MFA/AI/OAuth secrets;
- same-origin CSRF checks;
- strict production environment validation;
- append-only, trigger-enforced financial history;
- idempotency keys;
- single-send provider attempts with human review of uncertain outcomes;
- fail-closed external integrations.

**Confirmed findings:** five, all **Medium or Low**. All five are fixed (SEC-01 to SEC-05). Several hypothetical or operational risks are documented in sections B and F.

**Major improvements:**

- security headers on every response (anti-framing CSP, nosniff, HSTS in production and others);
- the production dependency audit reduced from 6 advisories to **0**;
- database statement and idle-in-transaction timeouts;
- an MFA gap in "sign out everywhere" closed;
- a new **automated route sweep**: 112 handlers in 91 route files refuse anonymous, cross-account, lower-privilege and cross-site requests.

**Production-blocking items:** operational rather than code defects. See section F. The main ones:

- no verified backup/restore tooling;
- the WIN1252 development database still in use;
- edge rate limiting and request-body limits to be configured in front of the app.

## B. Findings

Each item is labelled **Confirmed** (reproduced or evidenced in code and fixed), **Hypothetical** (not exploitable today) or **Not tested**.

| ID | Severity | Status | Component | Evidence | Impact | Fix | Verification | Remaining risk |
|---|---|---|---|---|---|---|---|---|
| **SEC-01** | Medium | Confirmed, fixed | HTTP responses (`next.config.ts`) | No frame, nosniff, HSTS, permissions or CSP headers on any route; the only header set was `Referrer-Policy` on private paths. `X-Powered-By` was exposed. | Clickjacking of admin and customer actions (for example a framed admin page); MIME sniffing; no forced HTTPS. | Site-wide headers: `CSP: frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `COOP: same-origin`, HSTS (1 year) in production builds, and `poweredByHeader: false`. | `tests/unit/security.test.ts` (headers). Live `curl` on `/`, `/admin/login`, `/dashboard`, `/api/health` and `/help` on a production build. Browser smoke test: both sign-in forms submit, interactive pages hydrate, no CSP violations. SEO crawl 225/225. | The CSP doesn't yet restrict `script-src`/`style-src`: Next.js inline scripts need nonces, which is deferred to 5I-B. |
| **SEC-02** | Medium | Confirmed, fixed | Dependencies | `npm audit --omit=dev`: 6 advisories (deepmerge prototype poisoning, minimatch ReDoS) via `shadcn`, a scaffolding CLI listed as a runtime dependency. The app only needs its CSS at build time, and Tailwind is already a dev dependency. | Vulnerable code installed in production. | Moved `shadcn` to `devDependencies` (4.22.1 → 4.23.0, a minor update within the existing range). | `npm audit --omit=dev`: **0 vulnerabilities**. Build, lint and all tests pass. | Dev-only advisories remain (25: 23 moderate, 2 low) via drizzle-kit, eslint, eslint-config-next and shadcn. They're never shipped; fixes would need major upgrades, which were avoided by instruction. |
| **SEC-03** | Low | Confirmed, fixed | `signOutEverywhereAction` | It used `getStaffSession()`, which accepts sessions that haven't passed MFA. | Someone holding only a staff password (no authenticator) could sign the real user out of every device (denial of service). | A staff session that hasn't passed MFA now revokes **only itself**; fully verified sessions still sign out everywhere. | `tests/integration/security.test.ts` → "session safety" (2 tests). | None known. |
| **SEC-04** | Medium | Confirmed, fixed | Database pool (`src/server/db/client.ts`) | Pool had no `statement_timeout` or `idle_in_transaction_session_timeout`. Wallet, order and deposit flows take `FOR UPDATE` row locks. | A runaway query, or a request that dies mid-transaction, could hold connections and locks indefinitely and stall financial writes. | `statement_timeout = 30s` and `idle_in_transaction_session_timeout = 60s` on every pooled connection. Migrations opt out of the statement limit (index builds). | `security.test.ts` → "database connection limits": settings present; a runaway statement is cancelled and the pool recovers. Full suite passes. | Very long legitimate reports above 30 s would now fail fast. None exist at current data sizes. |
| **SEC-05** | Low | Confirmed, documented (configuration) | Public endpoints and per-IP limits | Client IPs are trusted only when `TRUST_PROXY_HEADERS` is on (correct, prevents spoofing). Without it, per-IP limits are skipped. Public catalogue, search and tool-list endpoints have no limiter. Anonymous AI use then shares one "unknown" allowance bucket (fails safe, no bypass). | Abuse of anonymous endpoints is bounded only by per-email/global limits and the AI budget. | Production must run behind a trusted proxy with `TRUST_PROXY_HEADERS=true`, plus edge rate limiting and a request-body size limit. No code change, to avoid breaking flows. | Code review of `clientInfo`, `rate-limit.ts`, `ai/run.ts`. Global AI budget enforcement is already tested (`ai-control` tests). | Operational prerequisite (section F). |
| H-01 | — | Hypothetical | Provider endpoints (SSRF) | Admins can save `https://` endpoints, but **no provider adapter is registered** (`ADAPTERS = {}`, asserted in a test), so nothing is fetched. | When real adapters ship, an admin-supplied URL could target internal hosts. | None needed today. | `security.test.ts` asserts no adapters. | Before enabling any supplier: an allow-list or blocking of private, link-local and metadata IP ranges after DNS resolution. |
| H-02 | — | Hypothetical | JSON body size | Route handlers parse JSON without a size cap. All payloads are Zod-bounded after parsing. | Memory pressure from huge bodies. | Reverse-proxy body limit (section F). | Code review. | Operational. |
| NT-01 | — | Not tested | Backup and restore | The embedded PostgreSQL bundle ships no `pg_dump`/`pg_restore`. | Unknown recoverability. | — | — | **Production blocker** until managed backups/PITR are configured and a restore drill passes. |

**Reviewed and found sound (no change needed):**

| Area | What was verified |
|---|---|
| SQL injection | All queries are Drizzle-parameterised. The one `sql.raw` uses a constant format string. |
| XSS | Only one `dangerouslySetInnerHTML`, for JSON-LD, escaped and unit-tested. All user text is rendered as React text. |
| Open redirects | `safeNext` enforces a prefix and rejects `//`, backslash and CR/LF (unit-tested). The OAuth callback redirects only to fixed pages. |
| OAuth | Hashed single-use `state` with a TTL, bound to customer and platform; PKCE S256; tokens encrypted; redirects carry no codes or tokens. |
| Payment webhooks | Refused before the body is parsed when no adapter is approved (tested: 503 `FEATURE_DISABLED`). |
| Error handling | 500 responses contain no internals; Zod errors return paths only; logs redact secrets and scrub URLs/bearer tokens (unit-tested). |
| Dev endpoints | `/dev/mailbox` returns 404 unless `APP_ENV=development`. Production refuses capture email, demo mode or a missing `APP_ENV`. |
| Uploads | No upload endpoints exist; attachments are disabled. |
| Health endpoint | `/api/health` exposes only ok/degraded states. |

## C. Security coverage matrix

| Area | Result | Evidence |
|---|---|---|
| Authentication & MFA | **Pass** | `auth-customer` (17), `auth-staff` (10), `auth-routes` (12) tests; SEC-03 tests; lockout limits (login 5/15 min per email, MFA 5/5 min per session and 10/15 min per user, re-auth 5/15 min). |
| RBAC & data isolation | **Pass** | New route sweep (anonymous, customer to admin, Support role writing outside Support) across 112 handlers; per-module tests in support, referrals, reports, overview, orders and payments. |
| API security (CSRF, validation, errors, headers) | **Pass** | Sweep: every state-changing handler returns 403 from a foreign origin; SEC-01 headers verified live; unit tests for redirects and escaping. |
| Database integrity | **Pass** | `constraints` (14), `migrations` (up, down, re-apply for 0000–0016), append-only triggers (SV001), referral guard (SV014). |
| Financial safeguards | **Pass** | `ledger` (9: concurrent debits never overdraw; idempotency under concurrency), `payments` (23: two-person verification credits once even when simultaneous), `orders` (19), `catalog-wallet` (22); revenue policy unchanged. |
| AI credentials & budgets | **Pass** | `ai-control` (14: encrypted and masked keys, re-auth for key changes, emergency pause, budget reservation), `ai` (13: fails closed when disabled). |
| External integrations | **Pass** (fail-closed) | Webhooks refused, no supplier adapters, publishing gated by `SOCIAL_PUBLISHING_ENABLED` (`publishing` 14), OAuth gated (`social` 15). No live provider was contacted. |
| Background workers | **Pass** | `providers` (24: single send, concurrent workers claim once, uncertain outcome becomes `unknown` and needs human review), `publishing` (retries, no retry of uncertain outcomes), `automations` (14: one run per trigger slot). SEC-04 timeouts. |
| Secrets & configuration | **Pass** | Env validation (production requires secrets, real email, no demo); settings and API responses contain no secret values (`reports.test.ts`); log redaction. |
| Dependencies | **Pass** (production) / **Fail** (dev-only, accepted) | Production 0; dev 25 moderate/low, not shipped. |
| Backups & recovery | **Not tested** | NT-01. |

## D. Database assessment

Read-only inspection of both development databases:

| | `socivanta_dev` (current `DATABASE_URL`) | `socivanta_dev_utf8` (verified copy) |
|---|---|---|
| Encoding / collation | **WIN1252** / English_United States.1252 | **UTF8** / C |
| PostgreSQL | 18.4 | 18.4 |
| Migrations applied | 17 (0000–0016) | 17 |
| Tables / triggers | 65 / 44 | 65 / 44 |
| Ledger lines sum | 0 (balanced, no money moved) | 0 |
| Total rows | 400 | 386 |

**Parity:**

- The **schema is identical** in both databases.
- **The data has drifted since the copy was made.** `socivanta_dev` has extra rows in `ai_models` (3 vs 0), `ai_profiles` (1 vs 0), `audit_log` (30 vs 23) and `rate_limit_buckets` (7 vs 4), because development continued on the WIN1252 database. All other tables match.
- There is no non-ASCII service text in either database.

**Cutover recommendation (not performed; your approval required):**

1. Stop the dev server and workers, so nothing writes during the copy.
2. Run `npm run db:utf8-copy -- --replace`. It drops only the earlier **copy**, re-copies every row from the source (read-only), resets sequences and verifies row counts table by table.
3. Re-run the parity check in this section; every count must match.
4. Point `DATABASE_URL` in `.env.local` at `socivanta_dev_utf8` yourself.
5. Run `npm run db:migrate` (expect "applied", no changes) and the full test suite.
6. Keep `socivanta_dev` untouched as the rollback for at least one release cycle.

**Collation note:** the copy uses `C` collation, so text `ORDER BY` becomes byte order. No current query relies on locale-aware ordering.

**Backups:** no `pg_dump` is available locally, so backup and restore were **not verified** (NT-01). For production, use managed PostgreSQL with daily snapshots plus point-in-time recovery, encrypted at rest, with a documented restore drill (restore into a scratch instance, run the migration check and the reconciliation job, compare ledger totals) before launch.

**Blockers:** none for the UTF-8 cutover itself. The backup capability is a production blocker.

## E. Test results

| Check | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | Pass |
| ESLint (whole project) | Pass, 0 problems |
| Production build | Pass (built twice: once with a stand-in public origin for the SEO crawl, then a normal rebuild) |
| Full Vitest | **543 / 543** passed (49 files), 0 skipped |
| New: `tests/integration/security.test.ts` | **11 / 11** (4 sweeps across 112 handlers, 2 session-safety tests, 2 fail-closed integration tests, 2 database-limit tests, 1 coverage count) |
| New: `tests/unit/security.test.ts` | **4 / 4** (headers, open redirects, log redaction, JSON-LD escaping) |
| Dependency audit | Production 0; full 25 (dev-only: 23 moderate, 2 low) |
| Live header check (production build) | All security headers present on pages, redirects and API routes; HSTS present; `X-Powered-By` absent |
| Browser smoke test under the new CSP | **5 / 5** |
| Public SEO crawl regression | **225 / 225** |

**Notes on these results:**

- The SEO crawl script still expected 33 sitemap URLs; Phase 5G-B added a 34th (the referral guide), so the script was updated.
- The crawl first failed when run against a `localhost` build. Public pages are prerendered with the build-time `APP_URL`, so it was rebuilt with the stand-in origin, as in earlier phases. This wasn't an application defect.

**Testing limitations:**

- No live penetration test, fuzzing or DAST against a deployed environment.
- No test against real payment, AI, social or supplier providers (by policy).
- Load and DoS behaviour weren't measured.
- Backup/restore wasn't tested.
- The route sweep calls handlers with dummy parameters; deep business-logic authorisation is covered by the per-module suites.

## F. Remaining risks (ranked)

1. **Production blocker:** backups. Managed backups, PITR and a passed restore drill are required before real customer or financial data exists.
2. **Production blocker (configuration):** run behind a trusted reverse proxy or CDN with:
   - `TRUST_PROXY_HEADERS=true`;
   - edge rate limiting for `/api/ai/*`, `/api/catalog/*`, `/login`, `/register` and `/admin/login`;
   - a request-body limit (for example 1 MB);
   - TLS only (SEC-05, H-02).
3. **Medium:** the CSP lacks a `script-src` nonce policy (SEC-01 residual). Planned for 5I-B.
4. **Medium (data):** the development database is still WIN1252; cutover per section D, with your approval.
5. **Low:** dev-only dependency advisories (SEC-02 residual). Re-evaluate at the next planned major toolchain upgrade.
6. **Before enabling any supplier adapter:** SSRF controls on provider endpoints (H-01).
7. **Before enabling any external integration:** security review of each adapter, webhook signature verification for payments, and secrets stored in a managed secret store with a rotation runbook. AI keys can already be rotated in AI Management.

**Approvals required (none taken in this phase):**

- the UTF-8 cutover;
- enabling payments, AI generation, supplier fulfilment, publishing or rewards;
- any change to revenue recognition policy;
- the production hosting choice and its backup, WAF and secrets services.

## G. Phase 5I-B handoff

| Area | Tasks |
|---|---|
| **Security** | CSP with `script-src`/`style-src` nonces via middleware; `report-to` endpoint; review cookie `__Host-` prefixes on HTTPS (already automatic). |
| **Performance** | Query plans at realistic data volumes (reports, overview, catalog); connection-pool sizing per instance; static asset caching; bundle size review for admin pages. |
| **Monitoring** | Structured log shipping; error tracking with personal data scrubbed; uptime checks on `/api/health`; alerts for reconciliation exceptions, failed jobs, `unknown` fulfilment outcomes and AI budget thresholds. |
| **Deployment readiness** | Hosting choice; managed PostgreSQL with PITR and a restore drill; trusted proxy, WAF and rate limits; secret manager; CI running typecheck, lint, tests and `npm audit --omit=dev`; migration runbook. |
| **UI/UX & accessibility** | Full WCAG 2.2 AA audit (screen readers, focus order, contrast in both themes); error and empty state review; mobile admin ergonomics. |
| **SEO** | Re-verify with the real production origin; Search Console; structured-data validation. |

## H. Readiness decision

**READY WITH DOCUMENTED CONDITIONS.** The code is ready to proceed to Phase 5I-B: no open Critical or High vulnerabilities, all confirmed findings fixed and tested, and financial and integration safeguards intact. It is **not production-ready** until the conditions in section F are met. Passing automated tests is not, on its own, evidence of production readiness.
