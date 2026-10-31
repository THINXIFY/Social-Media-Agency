# Sociotix Rebranding Report (SociVanta → Sociotix)

Date: 2026-10-31. This was a brand migration, not a product rebuild. Architecture, database, business logic, security controls and every disabled integration are unchanged. Nothing was deployed, and no domain, DNS, email-sender or OAuth setting was changed.

## 1. Executive summary

**Sociotix** is now the brand on every public, customer and admin interface, in metadata and structured data, in share images, and in every email template.

**The new identity:**

- **Tagline:** "Smarter Social. Bigger Impact."
- **Positioning:** "AI-Powered Social Growth & Marketing Platform".
- **Domain:** `sociotix.com`, prepared for when ownership is confirmed (section 8).

**Scope:**

- **Application, tests, scripts and config:** 157 files moved from "SociVanta" to "Sociotix".
- **Wordmarks:** rebuilt as "Socio" + violet "tix".
- **Help articles:** two URLs renamed, with permanent redirects from the old ones.

**What stayed and why:**

- **Persistent technical identifiers** (database names, a database lock key, session cookies) stay as they are.
- **Historical reports** keep the old name, as a record of the project's history.

**Verification:**

- Typecheck, lint and the production build pass.
- **548 / 548** tests pass, and the SEO crawl passes **225 / 225**.
- **No "SociVanta" text on any of the 73 rendered public, customer and admin routes.** The route sweep is in section 9.

## 2. Updated pages and components

All brand text changed in place; no layout or redesign changes were made, except the hero heading's new tagline.

- **Public:**
  - header, footer, homepage hero (now "Smarter Social. **Bigger Impact.**"), marketplace and service dialogs;
  - AI Tools hub and all 13 tool pages (and their guides), Social Management, pricing;
  - Help Center (all articles), the 404 page, sign-in, sign-up, recovery and verification.
- **Customer dashboard:**
  - sidebar, top bar, overview, New Order, orders, wallet and Add Funds, transactions, Service Finder;
  - AI workspace, plans and usage, the social workspace and Automation Studio;
  - support, referrals, settings, profile and security;
  - translated navigation (for example, the German "Sociotix-Dashboard").
- **Admin dashboard:**
  - shell and navigation, overview, services, orders, providers, customers, payments, support;
  - referrals, AI Management, reports, settings, staff and account;
  - the admin sign-in frame.
- **Assistant and AI copy:**
  - the knowledge-base answers and AI tool copy;
  - the assistant's starter prompts ("What can Sociotix help me with?").
- **Downloads:** recovery codes, report CSVs, the content calendar and growth exports are now named `sociotix-…`.

## 3. Branding and visual changes

- **Wordmark:** `Socio` + `tix` (Electric Violet `#7047EB`), in Manrope extra-bold, in `src/components/brand.tsx`. The same treatment appears in the share-image template (`src/lib/seo/og.tsx`) and the email header (`src/server/email/templates.ts`).
- **Logo mark:** the existing rounded violet "S" glyph with the lime dot was kept. It reads correctly for Sociotix, and the brief says not to invent new artwork. The favicon is the existing custom "S" icon (15 KB, not the framework default).
- **Design system unchanged:** Electric Violet `#7047EB`, Lime `#C8FF52`, Graphite `#202127`, Manrope and Inter, and light and dark themes, including the accessible dark-mode tokens from 5I-B.
- **Central constants** in `src/lib/seo/site.ts` (`SITE`):
  - `name: "Sociotix"`;
  - `aiName: "Sociotix AI"`;
  - `tagline: "Smarter Social. Bigger Impact."`;
  - new `positioning`;
  - an updated `description`.
  The default page title is built from `SITE.name` and `SITE.tagline`.
- **No PWA manifest exists,** so there was none to update.

## 4. SEO and metadata updates

- **Titles and descriptions:**
  - every `Sociotix — …` title and description;
  - the default title "Sociotix — Smarter Social. Bigger Impact.";
  - the homepage keeps its descriptive keyword title, "Sociotix — Social Media Services for Every Major Platform".
- **Social sharing:** Open Graph and Twitter use `siteName: SITE.name`. The site share image reads "Smarter Social. Bigger Impact." under the eyebrow "Social growth & marketing".
- **Structured data:** Organization `name`/`description` and breadcrumb names come from `SITE`.
- **Honest descriptions:** the public description describes what works today: a marketplace, order tracking, and AI tools "as they launch". The "AI-Powered" positioning lives in the brand constant and the README, and no page claims that AI generation, publishing, payments or fulfilment are active.
- **Help URLs:**

  | Old URL | New URL |
  |---|---|
  | `/help/what-is-socivanta` | `/help/what-is-sociotix` |
  | `/help/what-are-socivanta-ai-tools` | `/help/what-are-sociotix-ai-tools` |

  The old URLs return a **308** permanent redirect (`next.config.ts`, verified). The sitemap lists only the new URLs.
- **Canonicals, sitemap and robots** stay driven by `APP_URL`; nothing is hard-coded. They were verified with the stand-in origin `https://www.sociotix.example`. Private routes keep noindex and their robots disallows.

## 5. Email and template changes

- **Templates:** all six were updated (subject, HTML body and text body):
  - account verification;
  - "account already exists";
  - password reset;
  - password changed;
  - staff invitation and setup;
  - "recovery code used".
- **Email header:** the HTML header uses the new wordmark.
- **Sender address and display name:** unchanged in code. Both come from `EMAIL_FROM` (empty in `.env.example`), so nothing about real sending changed.
- **Authenticator issuer:** now `Sociotix` (`src/server/auth/totp.ts`), for newly scanned QR codes only. Codes are checked against the secret, so existing authenticators keep working. They just keep their old "SociVanta" label until re-enrolled.

## 6. Safe internal identifiers retained

| Identifier | Why it stays |
|---|---|
| Database names `socivanta_dev` and `socivanta_dev_utf8`, and test databases `socivanta_test` / `socivanta_*_test_*` | Real persistent databases. Renaming needs a coordinated operation and a `DATABASE_URL` change, which isn't allowed automatically. |
| `pg_advisory_xact_lock(hashtext('socivanta:owner-bootstrap'))` | A stable lock key, so any running versions serialise owner bootstrap on the same lock. Commented in code. |
| Session cookies `sv_session` / `sv_staff` (and `__Host-` variants) | Changing them would sign everyone out. The prefix isn't brand text. |
| Migrations `drizzle/0000`–`0016`, snapshots and rollbacks | History and checksums must not change. They contain no brand text. |
| Audit log and other stored records | Historical data, never rewritten |
| Environment variable names, routes, API contracts, callback paths | Stable contracts |
| `socivanta123` in the weak-password list | Kept **in addition to** the new `sociotix123`: both stay disallowed |
| `"socivanta"` keyword in the assistant knowledge base | An alias, so people typing the old name still get the "what is Sociotix" answer |
| Project folder name `socivanta/` and GitHub repository name `Social-Media-Agency` | Unchanged by instruction; rename separately if wanted |

**Renamed because it was safe:**

- the package name (`sociotix`, in `package.json` and the lockfile name fields only);
- the log service name;
- client-side event names (`sociotix:search-url`, `sociotix:ai-example`), where sender and listener live in the same code;
- download filenames;
- the help slugs (with redirects);
- the example domain in tests (`help@sociotix.example`).

## 7. Legacy SociVanta references intentionally preserved

- **Historical reports:**
  - `docs/backend/PHASE_5*_REPORT.md`, `PHASE_5I_A_SECURITY_REPORT.md`, `PHASE_5I_B_LAUNCH_READINESS_REPORT.md` and `PHASE_5_ROADMAP.md`;
  - `docs/ai/*`, `docs/seo/SEO_01_REPORT.md` and `docs/deployment/GITHUB_SYNC_REPORT.md`.

  They record what was built under the old name.
- **README:** a rebrand note explaining the change, plus the `socivanta_dev` database name in setup instructions (also in `docs/backend/BACKEND_SETUP.md` and `.env.example`).
- **`next.config.ts`:** the two redirect sources and a comment naming the rebrand.
- **Section 6:** the identifiers above.

**Current documentation was updated:** `README.md`, `docs/backend/{ARCHITECTURE,AUTHENTICATION,BACKEND_SETUP,DATABASE,FRONTEND_BACKEND_MAP,OPEN_DECISIONS,SECURITY}.md` and `docs/seo/SEO_STANDARDS.md`.

## 8. Domain-dependent tasks for later deployment

**Do these only once `sociotix.com` ownership and hosting are confirmed:**

1. **Production URL:** set `APP_URL=https://sociotix.com` (or the chosen `www` variant). Canonicals, the sitemap, Open Graph URLs and email links all follow it.
2. **Email domain:** verify `sociotix.com` with the email provider (SPF, DKIM, DMARC). Then set `EMAIL_FROM`, for example `Sociotix <hello@sociotix.com>`.
3. **Support address:** set **Support email** in Admin › Settings to the new address. It's a platform setting, shown on the Referrals page and used in the support assistant's escalation text.
4. **OAuth:** register the new callback URLs (`https://sociotix.com/api/social/callback/<provider>`) with each social platform when publishing is approved. Remove the old ones only after the switch.
5. **Search Console:** add and verify the new property, submit `https://sociotix.com/sitemap.xml`, and use the Change of Address tool if an old public domain was ever indexed.
6. **Old-domain redirect checklist (not deployed):**
   - Keep the old domain's DNS and TLS certificate active.
   - 301/308 every path to the same path on `sociotix.com`, keeping the query string.
   - Keep the redirects for at least 12 months.
   - Update backlinks and social profiles.
   - Monitor 404s.

   No public SociVanta domain was ever deployed, so this may not be needed.
7. **Repository name:** rename the GitHub repository if wanted (GitHub keeps a redirect from the old name).
8. **Staff authenticators:** optionally re-enrol them so the app label reads "Sociotix".

## 9. Test results and regressions

| Check | Result |
|---|---|
| Typecheck | Pass |
| Lint | Pass, 0 problems |
| Production build | Pass (stand-in origin `https://www.sociotix.example`) |
| Vitest, full suite | **548 / 548** passed in 49 files (unit 203 / 203). Brand assertions updated, nothing weakened. |
| SEO crawl (stand-in origin) | **225 / 225** |
| Raw-HTML brand sweep: 34 sitemap pages + sign-in/sign-up/recovery/admin sign-in + 404 (39 pages) | 0 "SociVanta" occurrences; every page contains "Sociotix" |
| Old help URLs | 308 to the new slugs |
| Rendered route sweep: all 73 routes (public, customer and owner sessions) | **0 issues**. No "SociVanta" in visible text, titles, meta, `aria-label`, `alt` or `title`; "Sociotix" present; no console errors; no horizontal overflow at 320 or 375 px in light or dark. Hero, dashboard and admin screenshots reviewed. |

**Covered by the full suite:** authentication and MFA, orders and wallet ledger, providers, referrals, reports and CSV exports (the export filename assertion is now `sociotix-orders-`), AI controls, and social safeguards.

**Business logic:** no change to business logic, pricing, eligibility or financial policy.

## 10. Outstanding branding assets and blockers

- **Logo artwork:** the "S" mark and text wordmark are a polished interim identity. A designed Sociotix logo, favicon set (ICO, PNG and Apple touch icon) and share-image artwork is a **separate design task**. Replace `Logo` in `src/components/brand.tsx`, `src/app/favicon.ico` and `src/lib/seo/og.tsx` when the artwork exists.
- **Domain:** blocked until ownership and deployment are confirmed (section 8).
- **Existing authenticator labels:** keep "SociVanta" until re-enrolment (cosmetic).
