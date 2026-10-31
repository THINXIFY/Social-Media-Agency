# Phase 5B — Authentication, Accounts & Permissions: Implementation Report

Status: **complete**. Design and procedures are in [AUTHENTICATION.md](AUTHENTICATION.md); setup steps are in [BACKEND_SETUP.md](BACKEND_SETUP.md).

## Delivered

| Area | What was built |
|---|---|
| Auth approach | Next.js database-session / DAL pattern on the 5A schema, with argon2id (`@node-rs/argon2`), RFC 6238 TOTP (`otpauth`), `qrcode` and Node crypto. Better Auth was reviewed and rejected (it stores recoverable backup codes and session tokens). D9 resolved |
| Migration 0002 | `users.name`, `sessions.reauthenticated_at`, `mfa_factors.last_used_step` (TOTP replay guard), `rate_limit_buckets`, index on `sessions(user_id, kind)`. Rollback in `drizzle/rollback/0002_auth.down.sql` |
| Customer screens | `/register`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password` and `/dashboard/security`. Brand two-panel layout with show/hide password, inline errors with focus management, loading states, light and dark themes, 320 px and up |
| Staff screens | `/admin/login`, `/admin/setup`, `/admin/mfa`, `/admin/mfa/setup` (QR and setup key, one-time recovery codes) and `/admin/account` (MFA status, regenerate codes after re-auth, sessions, password) |
| Owner bootstrap | `npm run auth:bootstrap-owner` (operator CLI only). Invited owner, no password, single-use 2-hour email link. Refuses once an owner exists (advisory lock plus unique marker). `--resend` while unfinished |
| Mandatory staff MFA | Admin pages and APIs require a second factor verified in this session. TOTP secrets are encrypted (AES-256-GCM). Recovery codes are HMAC'd and single-use. Replay is prevented. 5 attempts per 5 minutes per session. Re-auth (password + TOTP, 10 minutes) for sensitive actions |
| Sessions | HttpOnly, SameSite=Lax, `__Host-` and Secure on https. SHA-256 at rest. Idle and absolute lifetimes (customer 7 d / 30 d, staff 30 min / 12 h). Rotation after privilege changes. Sign out one, others or everywhere |
| Authorization | `requireCustomer`, `requireStaffSession` and `requireStaff(permission)` read the database on every call. `SectionGate` on all 11 admin modules (server-side Access Denied). Nav filtering is cosmetic only |
| Route protection | `src/proxy.ts`: optimistic redirects plus `private, no-store` and `noindex`. The authoritative checks live in layouts, pages, actions and route handlers |
| APIs | `/api/account/me`, `/api/account/sessions[/:id]`, `/api/admin/me`, `/api/admin/staff[/:id]` and `/api/admin/reauth`. Same-origin check on writes |
| Email | One interface. `capture` (development/test, `/dev/mailbox`, 404 elsewhere) and Resend/Postmark (production). Production refuses `capture` |
| Demo isolation | `DEMO_MODE` (default off, refused in production). With it off, signed-in users see "not connected yet" instead of illustrative balances, orders or admin records. Demo data was never put in the database |
| Fail-safe config | Missing secrets mean sign-in is unavailable; a missing database means private areas are closed. Money operations and checkout are still disabled |

## Tests (exact results, final run)

| Suite | Result |
|---|---|
| Unit | **46 / 46** (adds auth primitives: argon2id, policy, AES-GCM tamper detection, HMAC, TOTP ±1 step, recovery-code format, cookie flags, open-redirect guard, production env rules, browser-storage scan) |
| Integration (real PostgreSQL 18.4) | **70 / 70**: 31 from 5A (ledger, safeguards, migrations up/down/up across 3 migrations) plus 39 new (17 customer auth, 10 staff and MFA, 12 route authorization) |
| Typecheck, ESLint (`--max-warnings=0`), production build | Pass. No `AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, argon2, MFA ciphertext or `DATABASE_URL` strings in `.next/static` |
| Browser end-to-end (`auth68`, dev server + real database) | **45 / 45**: redirects, registration, captured-email verification, sign-in and errors, HttpOnly cookie, nothing in localStorage, customer blocked from admin, security page, sign-out-everywhere, reset with single-use link, enumeration-safe forgot, CLI bootstrap (second run refused), setup link, password-only staff blocked, MFA enrolment, recovery codes, TOTP replay rejected, recovery-code sign-in. Auth screens at 320/375/768/1440 px × light/dark with no overflow and all inputs labelled. Keyboard order |
| Frontend regressions (signed in via the test harness) | journey 38/38, admin shell 19/19, KPIs 23/23, analytics 65/65, payments 50/50, referrals 73/73, staff 76/76, settings 73/74, dropdowns 46/48. The 3 failures assert the old hard-coded "Farhan Z." identity and "not secured" banner, which now correctly show the signed-in staff member and the new banner |

## Bugs found and fixed during verification

- After a successful password reset, the page re-rendered with the used token and showed "expired". Reset and verification now redirect to sign-in with a notice.
- After MFA enrolment, the setup page's re-render redirected away before the **one-time recovery codes** were visible. The page now keeps the component mounted.
- Session reads touched the environment before the cookie, which broke the prerender. The cookie is now read first, and configuration errors fail closed.
- Per-page gates needed their own `<Suspense>` for client-side navigation.

## Limitations and open items

- **Staff invitations beyond the owner** are not wired into the Staff page UI yet; it still shows local demo drafts. The server pieces exist and are tested (setup links, role change, disable, MFA reset). Inviting UI arrives in 5H.
- **Customer two-factor authentication** (D16) is not built; it is optional per the plan.
- **Breached-password check** is not built; the local policy blocks common passwords.
- **Per-IP rate limits** need `TRUST_PROXY_HEADERS=true` behind a trusted proxy; per-account limits always apply.
- **Email provider** (D4) is not chosen; production refuses to start without one.
- **No Git repository** (D11): all work is uncommitted files.

## Local environment left running

- `.env.local` was created with freshly generated development secrets and `DEMO_MODE=true` (git-ignored).
- The embedded PostgreSQL runs on port 5433. The dev server runs at `http://localhost:3000`.
- The dev database was reset after testing.
- The real owner **Farhan Z. (hello@thinxify.com)** was bootstrapped. The setup email is in `http://localhost:3000/dev/mailbox`; the link expires 2 hours after bootstrap. If it expires, run `npm run auth:bootstrap-owner -- --email hello@thinxify.com --name "Farhan Z." --resend`.

## Phase 5C prerequisites

1. Complete the owner setup (password + authenticator) and keep the recovery codes.
2. Decide D11 (Git baseline) before more backend work.
3. Decide D1 (hosting / managed Postgres) and D4 (email provider) before any public deploy.
4. 5C (catalog, customers and ledger core) builds on `requireStaff()` / `requireCustomer()`. Every new route and action must call one of them, and money operations stay behind `FINANCIAL_OPERATIONS_ENABLED`.
