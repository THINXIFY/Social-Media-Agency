# SociVanta — Security, Threat Model and Permissions

## 1. Assets and actors

**Assets:**
- Customer money (wallet balances and deposits).
- Platform revenue.
- Staff accounts.
- Provider credentials.
- Personal data: email, name, country, phone, target links, ticket contents.
- The service catalog's legal standing.

**Actors:**
- Anonymous visitors.
- Customers, including fraudulent ones.
- Staff of each role.
- Compromised staff accounts.
- Payment processors and providers, through webhooks and APIs.
- Automated bots.

## 2. Risk register

**Severity** is the impact if it is exploited in production: Critical, High, Medium or Low.

| # | Risk | Evidence in code today | Severity | Mitigation | Phase |
|---|---|---|---|---|---|
| R1 | **Unsecured admin routes and actions** — *addressed in 5B (MFA-gated staff sessions, server permission checks)* | No auth anywhere; the banner says "not secured" | Critical | Staff sessions with two-factor authentication. `proxy.ts` gives optimistic redirects. Every action and query calls `requireStaff(permission)`. Admin is never deployed publicly before 5B; until then, keep preview deploys behind platform password protection | 5A (block), 5B |
| R2 | **Client-trusted prices, balances, eligibility** | Prices and balances computed in browser (`quote()`, `walletSummary()`) | Critical | The server recomputes everything. Client values are display-only. The order action accepts only `{serviceId, quantity, link, fields, idempotencyKey}` | 5C–5E |
| R3 | **Webhook spoofing and replay causing double credits** | No webhook code yet | Critical | Verify the processor's signature against the raw body. Reject stale timestamps. `UNIQUE(processor,event_id)`. Credit via `UNIQUE(idempotency_key)` journal entries. Re-fetch the payment status from the processor API before crediting | 5D |
| R4 | **Wallet race conditions and negative balances** | Not applicable yet (no backend) | Critical | Row locks (`FOR UPDATE`) on `wallet_balances`, `CHECK(balance ≥ 0)`, single-transaction debit plus order. Concurrency integration tests | 5C/5E |
| R5 | **Provider credential leakage and SSRF via endpoints** | The UI already refuses keys in notes and stores none | High | Encrypted credential table, write-only API. Endpoint allow-list, https only, block private IPs and redirects. Outbound calls only from the worker, with timeouts | 5F |
| R6 | **IDOR on customer resources** — *pattern in place in 5B (session-scoped queries, tested)* | Not applicable yet | High | Every customer query is scoped by `customer_id` from the session, never from input. Public refs are not authorization. Tests for cross-account access | 5B onward |
| R7 | **Platform-policy and processor acceptance** | The catalog sells followers, likes and views across 15 platforms; `ACTIVATIONS = {}` | High (business) | Keep the purchasability gates. Obtain written processor acceptance per category. Legal review of which services may be sold where. Platform terms reviewed per service (`policyReviewed`). Do not launch services that are prohibited | Before 5E launch |
| R8 | **XSS via tickets, notes, links, names** | React escapes by default; no `dangerouslySetInnerHTML` found | Medium | Keep plain-text rendering. Validate links with `parseLink`. Strict CSP. Sanitize filenames. Never render staff notes as HTML | 5A (CSP), 5G |
| R9 | **CSRF** | Not applicable yet | Medium | Server Actions get Next.js origin checks. `SameSite=Lax` cookies. Route Handlers mutate only for webhooks, which are signature-authenticated | 5B |
| R10 | **SQL injection** | Not applicable yet | Medium | Use the ORM's parameterized queries. No string-built SQL; the review checklist flags any raw `sql` template with interpolation | 5A |
| R11 | **Unsafe uploads** | Uploads are simulated | Medium | Signed direct uploads to a private bucket. Allow-list MIME types (png, jpg, pdf), at most 10 MB. Magic-byte check. Malware scan before release. Downloads via short-lived signed URLs | 5G |
| R12 | **Referral abuse** (self-referral, multi-accounts, refund cycling) | Rules exist in UI (`checksOf`, `flagsOf`) | Medium | Unique referee. Referrer ≠ referee. Device, IP and payment-fingerprint heuristics flag cases for review. Hold periods. Exclude refunded orders. Manual approval by default. Cap per referrer | 5G |
| R13 | **Account takeover and brute force** — *addressed in 5B (argon2id, rate limits, mandatory staff MFA, session revocation)* | Not applicable yet | High | argon2id hashing. Rate limits per IP and per account. Breached-password check. Staff two-factor authentication. Session revocation on password change. Generic error messages | 5B |
| R14 | **Personal data exposure in support or admin** | Admin demo shows names and emails | Medium | Role-gated personal data, masked in lists. Audit of sensitive views. Logs redact personal data. CSV exports carry IDs only (as today) | 5B onward |
| R15 | **Spam and abuse** (tickets, sign-ups, invites) | Not applicable yet | Low/Medium | Rate limits, email verification before ordering, CAPTCHA on sign-up only if abuse appears | 5B/5G |
| R16 | **Insider misuse** (staff credits own wallet) | The UI anticipates second review | High | Sensitive permissions. Four-eyes approval above thresholds. Staff cannot approve their own requests. Immutable audit. Daily reconciliation report to the owner | 5D |
| R17 | **Secrets in repo or client bundle** | No `.env` exists; `.gitignore` present | High | Only `NEXT_PUBLIC_*` values reach the client, and none are secrets. Secret scanning in CI. `import "server-only"` in `src/server/**` | 5A |
| R18 | **Demo data leaking into production** | Demo constants are imported directly by pages | Medium | An environment guard throws if demo modules load in production. Remove demo imports per module as it is integrated | 5C–5H |

## 3. Authentication plan

**Passwords:**
- argon2id (memory ≥ 19 MiB, t = 2).
- Minimum 10 characters.
- Breached-password check (k-anonymity API).
- No composition rules.

**Email verification:**
- Required before depositing or ordering.
- Tokens are 32 random bytes, stored hashed, valid for 24 hours, single use.

**Password recovery:**
- Same token model, valid for 1 hour. All sessions are revoked on reset.
- Identical responses whether or not the email exists.

**Sessions:**

| | Customers | Staff |
|---|---|---|
| Absolute lifetime | 30 days | 12 hours |
| Idle lifetime | 7 days | 30 minutes |
| Two-factor authentication | Optional TOTP | **Required TOTP** |
| Re-authentication | — | Within the last 10 minutes for sensitive permissions |

All session tokens rotate on privilege change.

**Staff two-factor authentication:**
- Required at invitation acceptance.
- Recovery codes are hashed.
- Only the owner can reset another staff member's two-factor setup, and the reset is audited.

**Rate limits** (Postgres-backed counters, or the platform's edge rate limiting):

| Action | Limit |
|---|---|
| Sign-in | 5 per minute per account, 20 per minute per IP |
| Password reset | 3 per hour per account |
| Ticket creation | 10 per hour |
| Deposit intents | 10 per hour |

## 4. Authorization model

**Permission checks:**
- Each staff action declares a permission, either `module:level` or a named sensitive permission.
- `requireStaff(perm)` loads the staff member's role from the database on every request. Roles are never cached on the client and never trusted from a cookie.

**Sensitive permissions** need `manage` on their module plus the named grant:
- `approveDeposits`
- `issueRefunds`
- `adjustWallets`
- `changePrices`
- `configureProviders`
- `approveRewards`
- `manageStaff`
- `securitySettings`

This is the same model as `src/lib/admin-staff.ts`.

**Four-eyes approval:**
- Applies to deposits at or above the second-review threshold, wallet adjustments, and refunds above the approval threshold. These are the thresholds already present in Admin Settings → Payments.
- Maker and checker must be different staff members.

**Owner rules:**
- The `owner` role cannot be edited.
- The last active owner cannot be removed, disabled or demoted. This is enforced by a database trigger plus the service layer.

**Customer scope:** every query is `WHERE customer_id = session.customerId`.

**Audit:** every staff mutation writes `audit_log` with before/after (secrets redacted). Owners can read the audit log; no one can edit it.

## 5. Financial controls (summary; detail in DATABASE.md §6)

- Integer cents.
- Double-entry, balanced, immutable journal.
- Idempotency keys on every entry.
- `CHECK(balance ≥ 0)`.
- Row locks.
- Pending deposits are never credited.
- Settlement is verified with the processor before crediting.
- Refunds are capped at the amount paid.
- Nightly reconciliation (ledger versus balances versus processor reports), with alerts.
- No client-side figure is ever authoritative.

## 6. Platform and provider policy constraints

- Many social platforms' terms (Instagram, TikTok, YouTube, X and others) restrict artificial engagement. Card networks and processors frequently treat "social media growth" or "fake engagement" as restricted or prohibited.
- The catalog must therefore stay **gated per service**, recording:
  1. Platform-policy review.
  2. Supplier verification.
  3. Payment-processor acceptance for that category.
  4. Technical readiness.
  5. Legal review per target market.
- Services that fail any gate stay visible as "coming soon" (as today) or hidden; they are never sold.
- This is a business and legal decision (D2), not something code can settle.

## 7. Security headers and platform hardening (5A/5I)

- CSP with nonces, `frame-ancestors 'none'`, HSTS, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
- Dependency audit in CI, Renovate or Dependabot.
- Database user without DDL rights at runtime.
- Backups tested by restore.
- Admin under `/admin` with `noindex`.
