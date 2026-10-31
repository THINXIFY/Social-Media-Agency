# SociVanta — Authentication, MFA and Authorization (Phase 5B)

## 1. Decision: proven primitives on our own schema, not an auth framework

D9 recommended Better Auth "if it meets the session, two-factor and Postgres requirements on review". It was reviewed against the installed versions (Better Auth 1.7.14: compatible with Next 16 and Drizzle 0.45) and **not adopted**, for two reasons that conflict with explicit requirements:

1. **Recovery codes must be hashed and single-use.** Better Auth's two-factor plugin stores backup codes *encrypted* (recoverable), because it decrypts the list to compare codes.
2. **Session tokens must not be stored in usable form.** Better Auth keeps the session token itself in the `session` table, and its user/account/verification model clashes with the hardened 5A schema (hashed tokens, `timestamptz` verification, customer and staff separation).

Instead, the implementation follows the **Next.js authentication guide's database-session / Data Access Layer pattern** on the existing tables. It uses maintained, widely used libraries for every cryptographic step. **No custom cryptography.**

| Concern | Library or mechanism |
|---|---|
| Password hashing | `@node-rs/argon2` 2.2.2: **argon2id**, m = 19 MiB, t = 2, p = 1 (OWASP) |
| TOTP | `otpauth` 9.5.2: RFC 6238, 30 s, 6 digits, SHA-1 (authenticator-app compatible) |
| QR code | `qrcode` 1.5.4 (data URL, generated server-side during enrolment only) |
| Tokens, hashing, encryption | Node `crypto`: 256-bit random tokens, SHA-256, HMAC-SHA256, AES-256-GCM |
| Sessions | Opaque cookie token → `sessions` row (SHA-256), validated on every request |

## 2. How it works

### Customer accounts (`/register`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password`, `/dashboard/security`)

**Register:**
- Fields: name, email, password.
- Creates `users` + `customers` + `customer_preferences` and emails a 24-hour verification link.
- **No wallet, orders or payments are created.**
- Duplicate emails get the *same* response, and the real owner receives an "account already exists" email (no enumeration).

**Verify:**
- The link opens a page with a **Confirm** button. Verification happens by POST, so mail scanners that prefetch links can't use the token.
- Tokens are single-use. A new link invalidates older ones.

**Sign in:**
- Generic "Email or password is incorrect" for every failure.
- Rate limited: 5 attempts per email per 15 minutes; 30 per IP per 10 minutes when the proxy is trusted.
- Unverified accounts are refused and sent a fresh link.

**Reset:**
- Same answer whether or not the email exists.
- 1-hour single-use link.
- A new password signs out **every** device and sends a "password changed" email.

**Security page:**
- Review sessions, sign out one or all, and change the password (signs out other devices and rotates the current session).

### Staff accounts (`/admin/login`, `/admin/setup`, `/admin/mfa`, `/admin/mfa/setup`, `/admin/account`)

**Staff sign-in is two steps:**
1. The password creates a staff session that can only reach the MFA screens.
2. A TOTP code (or a recovery code) completes it.

| Rule | Detail |
|---|---|
| **Mandatory MFA** | A session is operational only when the user has a confirmed authenticator, `mfa_enabled = true`, the staff member is `active`, and *this session* verified a second factor. Pages redirect, and APIs return `401 MFA_REQUIRED`, otherwise |
| Enrolment | The secret is generated server-side, **encrypted with AES-256-GCM** (`DATA_ENCRYPTION_KEY`) and shown (QR plus setup key) only while unconfirmed. A correct code is required to activate |
| Recovery codes | 10 codes (`XXXXX-XXXXX`, ~50 bits each), shown once, stored as **HMAC-SHA256** (`AUTH_SECRET`), consumed atomically, an email notice on use. Regenerating requires re-authentication |
| Replay | Each accepted TOTP stores its time-step; a code can't be used twice (atomic compare-and-set) |
| Rate limits | 5 attempts per session per 5 minutes and 10 per user per 15 minutes |
| Re-authentication | Sensitive actions (role changes, disable/enable staff, new recovery codes) need password + TOTP within the last 10 minutes; otherwise `403 REAUTH_REQUIRED` |
| Session rotation | A new token is issued after MFA, password change and enrolment; the absolute lifetime is kept |

### Sessions and cookies

| | Customer | Staff |
|---|---|---|
| Cookie | `sv_session` (`__Host-sv_session` on https) | `sv_staff` (`__Host-sv_staff` on https) |
| Absolute lifetime | 30 days | 12 hours |
| Idle lifetime | 7 days | 30 minutes |
| Attributes | `HttpOnly; SameSite=Lax; Path=/`; `Secure` and `__Host-` on https | Same |

- Only SHA-256(token) is stored.
- Expired rows are deleted when read. Deleting rows revokes immediately; nothing is cached (no `use cache: private` on sessions).
- Disabling a user or staff member kills their sessions on the next request.

### CSRF, caching and enumeration

**CSRF:**
- Server Actions get Next.js's built-in Origin check.
- Mutating route handlers call `assertSameOrigin()`.
- Combined with `SameSite=Lax`.

**Caching:**
- `proxy.ts` marks `/dashboard`, `/admin`, `/api/account` and `/api/admin` responses `Cache-Control: private, no-store` plus `X-Robots-Tag: noindex`. Next adds `no-store` on dynamic pages.
- Private pages read the session inside `<Suspense>` per request and are never prerendered with user data.

**Enumeration:**
- Identical responses for register, resend and reset.
- Generic sign-in errors.
- Argon2 runs even for unknown emails (timing).

## 3. Authorization model (server-enforced)

- `src/server/auth/index.ts` is the single boundary:
  - `requireCustomer()`: verified customer; customer IDs always come from the session.
  - `requireStaffSession()`: MFA-complete staff.
  - `requireStaff(permission)`: plus a role check **read from the database on every call**.
- Permissions are the approved model: 10 modules × none/view/manage plus 8 sensitive permissions (each also needs Manage on its module).
- Five system roles are seeded from the templates designed in the admin UI. The owner role is immutable and the last active owner can't be removed (database triggers from 5A).
- **Admin pages:** the `(panel)` layout requires an MFA-complete staff session. Each module page is wrapped in `SectionGate`, which re-checks View permission on the server and renders a professional **Access Denied** state.
- **Dashboard pages:** the layout requires a verified customer session.
- **Navigation hiding is cosmetic only.**

| API | Requirement |
|---|---|
| `GET /api/account/me` | Verified customer |
| `GET /api/account/sessions` | Verified customer |
| `DELETE /api/account/sessions` | Verified customer + same origin |
| `DELETE /api/account/sessions/:id` | Own session only (others → 404) |
| `GET /api/admin/me` | MFA-complete staff |
| `GET /api/admin/staff` | `staff:view` |
| `PATCH /api/admin/staff/:id` (`{role}` or `{disabled}`) | `manageStaff` + recent re-auth + same origin; last-owner trigger enforced |
| `POST /api/admin/reauth` | MFA-complete staff, password + TOTP |

**Money stays off:**
- `creditDeposit`, `chargeOrder`, `refundOrder` and `adjustWallet` still fail closed (`FINANCIAL_OPERATIONS_ENABLED = false`).
- Checkout remains blocked by the database order trigger.

## 4. Demo data isolation

- `DEMO_MODE` (default `false`, **refused in production**) controls whether signed-in users see the illustrative dashboard and admin records.
- With it off, each dashboard and admin module shows "*… isn't connected yet*" instead, so **real accounts never receive demo balances, orders or tickets**.
- Demo records were not migrated into the database, and no real account is linked to them.
- In demo mode every screen still requires a real sign-in. The admin banner reads "*Demo data … Your sign-in and permissions are real and checked by the server*".

## 5. Owner bootstrap (one time)

```bash
npm run auth:bootstrap-owner -- --email hello@thinxify.com --name "Farhan Z."
```

- **Operator-only:** it needs server environment variables and database access. It is never exposed over HTTP, and nothing runs on app startup.
- Creates the owner as an **invited** staff member with **no password**, plus a 2-hour single-use setup link sent **by email**. The CLI prints only the masked address, never the link.
- Refuses to run again once any owner exists. This is serialised by a PostgreSQL advisory lock and a unique `auth.owner_bootstrap` settings row, and concurrent attempts are tested.
- `--resend` re-issues the link only while that owner is still unfinished, and invalidates the old link.
- The owner then:
  1. Opens the link, which proves the email address.
  2. Sets a password.
  3. Scans the QR code and enters a code.
  4. Saves the 10 recovery codes.
- Only then does the staff record become `active` and admin access open.

In development, the email is captured: open **http://localhost:3000/dev/mailbox** (404 in any other environment).

## 6. MFA recovery procedures

| Situation | Procedure |
|---|---|
| Lost phone, has recovery codes | Sign in with password + a recovery code, then generate new codes at **Admin → Account & security** (needs password + code) |
| Staff member lost phone and codes | The owner resets their MFA (`resetStaffMfa`, re-auth required): factor and codes deleted, sessions revoked, re-enrol at next sign-in. *A UI button for this arrives with real staff management in 5H; the server function is in place and tested* |
| The only owner lost phone and codes | Operator CLI: `npm run auth:reset-mfa -- --email <owner> --confirm` (audited). The owner then signs in with their password and enrols a new authenticator |
| Forgotten password (staff or customer) | `/forgot-password`. MFA is still required afterwards for staff |

## 7. Environment variables (new in 5B)

| Variable | Required | Purpose |
|---|---|---|
| `APP_URL` | preview/production (https) | Origin for email links and the CSRF origin check |
| `AUTH_SECRET` | preview/production | HMAC key (recovery codes, rate-limit keys). 32+ random bytes, base64 (`npm run auth:secrets`) |
| `DATA_ENCRYPTION_KEY` | preview/production | AES-256-GCM key for MFA secrets. 32+ random bytes, must differ from `AUTH_SECRET` |
| `EMAIL_TRANSPORT` | production: `resend` or `postmark` | `capture` is allowed in development/test only |
| `EMAIL_FROM`, `EMAIL_API_KEY` | with resend/postmark | Server-side only |
| `DEMO_MODE` | no (default `false`) | Show illustrative records; refused in production |
| `TRUST_PROXY_HEADERS` | no (default `false`) | Use `x-forwarded-for` for per-IP limits when behind a trusted proxy |

Without `AUTH_SECRET`/`DATA_ENCRYPTION_KEY`, sign-in fails closed with "Sign-in isn't available". Without a database, private pages show "Sign-in isn't available right now".
