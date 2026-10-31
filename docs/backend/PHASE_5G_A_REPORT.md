# Phase 5G-A: Help Center, Customer Support and Admin Ticket Management

Status: **complete within scope.** This phase delivers:

- a public, server-rendered Help Center;
- a real ticket system for customers;
- a master-detail Admin Support workspace;
- real in-app notifications;
- AI-05 updated to point customers to tickets.

Nothing external was activated. There's no email delivery, no attachment storage, no AI generation and no third-party support software.

## 1. Routes and interfaces

| Route | Access | Purpose |
|---|---|---|
| `/help` | Public, indexable | Help Center hub: search, popular questions, 7 topics, contact strip |
| `/help/[slug]` | Public, indexable | 16 articles, statically generated. Unknown slugs return a real 404 from `src/proxy.ts` |
| `/dashboard/support` | Customer, noindex | My tickets, new ticket, conversation (live mode). Demo mode keeps the demo center |
| `/admin/support` | Staff, Support: View | Queue and ticket workspace (live mode) |
| `GET/POST /api/account/support` | Customer | List own tickets (plus own orders for linking); create a ticket (`key` makes it idempotent) |
| `GET /api/account/support/:ref` | Customer | Own ticket only |
| `POST /api/account/support/:ref/reply\|close\|reopen` | Customer, same origin | Lifecycle actions |
| `GET/POST /api/account/notifications` | Customer | Own notifications; mark read (`ids` or `all`) |
| `GET /api/admin/support` | Support: View | Queue with views and filters, counts and `can.manage` |
| `GET /api/admin/support/:ref` | Support: View | Ticket, notes and history; order context needs Orders: View |
| `POST /api/admin/support/:ref/reply\|status\|priority\|assign\|note` | Support: Manage, same origin | Staff actions |
| `GET /api/admin/support/assignees` | Support: View | Active staff with Support: Manage |

**Server code:**

- `src/server/support/tickets.ts`
- `src/server/support/notifications.ts`
- Shared definitions in `src/lib/support.ts`

**UI:**

- `src/components/dashboard/live-support.tsx`
- `src/components/dashboard/live-notifications.tsx` (the live dashboard bell now shows real notifications instead of demo activity)
- `src/components/admin/live-support.tsx`
- `src/components/help/*`

## 2. Help Center content

The content lives in `src/lib/help/articles.ts`.

- **Categories:** Getting Started, Account & Security, Services & Ordering, Wallet & Payments, AI Tools, Social Management, Troubleshooting & Support.
- **Article structure:**
  - a title written as a natural question;
  - a direct **short answer**;
  - optional steps and detail;
  - related articles;
  - a last-updated date;
  - a contact-support call to action.
- **Popular questions** are a curated list, not popularity data.
- **Accuracy:** every statement was checked against implemented behaviour, including:
  - which order statuses customers can cancel;
  - password reset and resend-verification flows;
  - the Sign-in & security page;
  - AI allowances resetting at 00:00 UTC;
  - publishing being off.
- **Conditional features** (ordering, bank deposits, AI tools) are described conditionally.
- **No promises:** no delivery times, guarantees, refund promises or payment methods. A test enforces this.
- **Search:** instant and client-side, ranking title over keywords over text. It supports arrow keys, Enter and Escape. Every article is also linked in plain HTML, so the page works without JavaScript.

## 3. Ticket lifecycle

| Database value | Staff label | Customer label |
|---|---|---|
| `awaiting` | Open | Awaiting our reply |
| `in_progress` | In progress | In progress |
| `waiting` | Waiting for customer | Waiting for you |
| `resolved` | Resolved | Resolved |
| `closed` | Closed | Closed |

**What moves a ticket:**

- A **staff reply** sets the status the agent chooses: wait for customer (the default), keep in progress, or mark resolved. If the ticket is unassigned, the reply assigns it to that agent.
- A **customer reply** sends `waiting` or `resolved` tickets back to `awaiting`. A resolved ticket replied to is recorded as *reopened*.
- **Closing:** the customer can close a ticket at any time.
- **Reopening:**
  - customers can reopen a resolved ticket, or a closed one within 14 days, after which they open a new ticket;
  - staff can set any status.
- **Closed tickets** take no replies until they're reopened.
- **Customer-visible activity:** the activity log in `ticket_events` shows customers opened, replied, status-changed, reopened and closed-by-customer events. Priority and assignment events are staff-only.

## 4. Permissions and isolation

- **Customers:**
  - every query is scoped by the session's customer id;
  - another customer's reference returns 404;
  - linking an order checks that it's the customer's own;
  - the customer side never reads `ticket_internal_notes`;
  - staff appear to customers by first name only, never by email.
- **Staff:**
  - Support: View can read the queue and tickets;
  - Support: Manage can reply, change status or priority, assign and add notes;
  - assignment targets must be active staff with Support: Manage;
  - order context appears only for roles with Orders: View;
  - every staff session needs MFA, and roles are re-checked in the database.
- **Abuse limits:**
  - creating tickets: 5 per hour per customer;
  - customer replies: 20 per 10 minutes;
  - client keys stop double submissions (unique `(customer_id, idempotency_key)` and `(ticket_id, client_key)`, including when submissions race);
  - text that looks like a password, sign-in code, key or card number is refused before it's stored.
- **Safe rendering and audit:**
  - all text is stored plain and rendered escaped;
  - every action is written to `audit_log`;
  - no wallet, ledger or order data changes (a test confirms this).

## 5. Database (migration `0013_support_5g`, rollback included)

- `tickets`: gains the `in_progress` status and `low` and `high` priorities, plus `idempotency_key`, `resolved_at` and `closed_at`.
- `ticket_messages.client_key` added (unique per ticket).
- New `ticket_events` table.
- Append-only triggers (SV001) on `ticket_messages`, `ticket_internal_notes` and `ticket_events`. Removing support records needs a reviewed retention procedure.
- Applied to `socivanta_dev` and `socivanta_dev_utf8`. The migration test now expects 65 tables and 14 migrations, and includes the 0013 rollback step.

## 6. Notifications and attachments

- **In-app notifications:** persisted rows in the existing `notifications` table.
  - **Customers are notified of:** staff replies (including "resolved") and status changes.
  - **Customers aren't notified of:** priority, assignment or notes.
  - **Staff:** see the queue counts; there are no staff notifications yet.
  - **Bell behaviour:** refreshes every 60 seconds and on open; supports mark read and mark all read.
- **No email is sent.** Email delivery isn't part of this phase, and the UI never claims an email was sent.
- **Attachments are disabled.** No approved secure storage exists. The form and the help article say so honestly; the `attachments` table stays unused.

## 7. AI support readiness

- `SUPPORT_TICKETS_CONNECTED = true`.
- The verified help text now says customers open tickets from their dashboard, and that nothing typed to the assistant reaches the team.
- New assistant links: *Create a support ticket* (`/dashboard/support?new=1`) and *Help Center*.
- The escalation card shows a **Create a support ticket** button, which the customer opens themselves.
- The assistant still can't create, read or change tickets. Its output rules still reject "your ticket was created" or "I've forwarded this" claims.
- Execution contracts and provider-disabled states are unchanged.
- AI-05 tests were updated to the new truth while keeping their intent (28/28).

## 8. SEO, AEO and GEO

- **Metadata:**
  - unique titles (hub 41 characters; articles at most 60 characters, with a brand suffix only when it fits);
  - descriptions of 110–175 characters;
  - relative canonicals;
  - Open Graph and Twitter cards;
  - a hub OG image and per-article OG images.
- **Content:** one H1, logical H2 and H3 headings, server-rendered articles, question-style titles with direct answers, related links and breadcrumbs.
- **JSON-LD:**
  - hub: CollectionPage, BreadcrumbList, and FAQPage for the visible popular questions;
  - articles: WebPage and BreadcrumbList.
- **Sitemap:** `/help` plus all 16 articles (33 URLs in total). Dashboards and admin pages stay noindex. The footer now links Help Center and Contact Support.

## 9. Test results

| Check | Result |
|---|---|
| Typecheck, ESLint (whole project, 0 problems), production build | Pass |
| New integration tests (`tests/integration/support.test.ts`) | **13 / 13** |
| New unit tests (`tests/unit/help.test.ts`) | **7 / 7** |
| Updated tests | `migrations`, `seo` (sitemap and social filter), `ai-order-support` unit and integration |
| Full Vitest | **478 / 478** |
| Browser QA, 5G-A (production build, scratch database) | **45 / 45** |
| SEO crawl (public origin) | **225 / 225** |
| AI-09 dashboard regression (covers the new bell in the top bar) | **57 / 57** |

**What the integration tests cover:**

- idempotent creation;
- validation and refusing secrets;
- own orders only;
- full isolation (functions and routes);
- the full lifecycle, including the 14-day reopen window;
- concurrent double replies;
- the creation rate limit;
- search and filters;
- private notes and priority invisible to customers;
- assignment rules;
- View versus Manage permissions and origin checks;
- notifications (which events notify, ownership of mark-read);
- append-only history (SV001), audit, and no money moved.

**What the browser QA covers:**

- the Help Center hub and articles (server-rendered, canonical, schema, real 404, sitemap, instant search, Enter to open, no-results state, footer link);
- customer flows:
  - list isolation and the bell;
  - conversation styling, with no notes visible;
  - a double-click reply stored once;
  - close with confirmation, then reopen;
  - validation and a double-click create stored once;
  - attachments shown as unavailable;
  - another customer's ticket blocked;
- admin flows: queue, private note, reply, priority history, and view-only staff;
- the customer seeing the staff reply but not the notes or priority;
- no horizontal overflow on 7 views at 320–1440px in light and dark (dark with reduced motion);
- keyboard use;
- no console errors.

**Issues found and fixed:**

1. Unknown help slugs streamed with status 200 on their first request. They now 404 through the proxy, matching the AI tool pages.
2. `dynamicParams` isn't allowed with `cacheComponents`, so it was removed.
3. A permission test assumed Finance couldn't see support. It can (Support: View), so the test now checks view versus manage.

## 10. Known limitations

- No email notifications, no staff notifications and no attachments; each needs approved infrastructure.
- No SLA timers or response-time promises, by design.
- Ticket search covers subject, reference, customer reference and email, not message bodies.
- Retention and deletion of support records needs a written policy; the append-only triggers block deletion from the app.

## 11. Phase 5G-B prerequisites (referrals and rewards)

- **Decisions needed before any reward can apply:**
  - approved reward rules and an eligibility definition;
  - an accounting decision on how rewards post to the ledger (none exists today);
  - an anti-abuse policy using lawful signals.
- **What's already in place:** `referral_*` tables from 5A, the audit log, notifications (this phase) and staff permissions (`approveRewards`).
- **What 5G-B can build:** attribution and history safely, with any monetary reward kept disabled until those decisions are made.
