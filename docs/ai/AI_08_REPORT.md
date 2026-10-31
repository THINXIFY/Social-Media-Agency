# AI-08: AI Workflow Automation (Automation Studio)

**Status:** implementation complete and tested. Customers can create, edit, activate, pause, duplicate and delete workflows, and the worker runs them on schedule. Every run's real outcome appears in the run history, and its result lands in an in-app inbox.

The **AI Workflow Assistant** is built on the shared AI pipeline but stays **Coming soon**: no AI provider is configured. The manual builder works fully without it.

## 1. Features and routes

| Route | What it does |
|---|---|
| `/dashboard/social/automations` | The studio (details below) |
| `/dashboard/social/automations/new` | Guided builder; `?template=<id>` opens a template on the Configure step |
| `/dashboard/social/automations/[id]` | One workflow (details below) |
| `/dashboard/social/automations/[id]/edit` | The builder, prefilled |

**The studio page:**
- Inbox of real results: tick checklist items, approve suggestions as drafts, mark done, dismiss.
- Your automations: search, filters (All, Active, Paused, Not activated), sorting (recently edited, name, next run).
- Templates, plus an honest list of ideas that aren't possible as automations.
- Needs attention and Recent runs.
- An AI assistant card.
- A designed empty state with onboarding steps.

**The workflow page:**
- A flow preview of what it does.
- Next run, last run, frequency and time zone.
- What it may access.
- Controls: activate (with confirmation), pause, edit, duplicate, delete.
- Run history with filters, expandable details and "Retry safely" on eligible failed runs.

**Navigation:** "Automations" joins the Social area's tab bar (Overview · Publishing · Calendar · Campaigns · Automations · Accounts · Activity). The dashboard sidebar is unchanged.

## 2. UI and UX decisions

- **No node canvas.** Every workflow is shown as a compact vertical flow: *When → Only if → Then*. The same component appears on cards, in the builder preview, in review and on the activation dialog, so a workflow reads the same everywhere.
- **A four-step builder:**
  1. Trigger: five cards.
  2. Action: actions incompatible with the chosen trigger are disabled, with the reason shown.
  3. Configure: day chips, time and date inputs, the drafts window, the action's content, a name, and advanced options behind a toggle.
  4. Review & activate: a plain-language summary, how often it runs, the first run date, what it may access, what it never does, and an explicit authorisation checkbox.

  "Save without activating" is always available.
- **Templates** open straight on Configure, already filled in.
- **Editing an active workflow** clearly warns that saving without re-activating pauses it.
- **Inbox checklists** update instantly and revert if the server refuses; finishing a checklist marks the item done.
- **Future times** (for example the next run) show an exact date. Relative wording ("3 minutes ago") is used only for the past; previously a future time could display as "Just now".
- **Design system:** violet, graphite and lime, Manrope and Inter, existing panels and tokens, and careful dark mode. Transitions (step changes, template hover, state badges, inbox items) are short and switch off under reduced motion.

## 3. Supported triggers and actions (strict allowlist)

**Triggers:**

| Trigger | Meaning |
|---|---|
| `weekly` | Chosen weekdays at a time |
| `daily` | Every day at a time |
| `once` | A single date and time; the workflow becomes *Completed* after it runs |
| `draft_due` | Checked daily: drafts planned within 1–14 days |
| `account_attention` | Checked daily: a connected account needs a reconnect, its last refresh failed, or it hasn't been refreshed in 14 days |

**Actions** (all internal to SociVanta):

| Action | What it does |
|---|---|
| `reminder` | Creates an in-app reminder |
| `checklist` | Creates a tickable checklist (up to 12 items) |
| `flag_drafts` | Lists the customer's own drafts planned within N days |
| `health_check` | Lists the customer's own connections needing attention |
| `draft_suggestion` | Prepares post text that becomes an unscheduled draft only when the customer clicks Approve |

**Compatibility:** `draft_due` runs only `flag_drafts`, and `account_attention` runs only `health_check`. Scheduled triggers can run any action. Data actions skip by default when there's nothing to review.

**One schema for everything:** the builder, the API, the worker and the AI assistant all use the same strict Zod schema in `src/lib/social/automations.ts`. Unknown types, extra fields (URLs, webhooks, scripts), incompatible pairs and out-of-range values are all rejected.

**Templates (all functional):**
- Weekly content reminder
- Content planning routine
- Draft review reminder
- Publishing preparation checklist
- Campaign review reminder
- Social account health check

**Listed as not available:** auto-publishing (publishing is off, and automations never publish without confirmation), a weekly performance digest (no analytics available), and replying to comments (automations never message anyone).

## 4. Automation architecture

**Migration:** `drizzle/0009_automations.sql`, with a rollback.

**`automations`:**
- The definition (stored as validated JSON), time zone and status: `draft`, `active`, `paused` or `completed`.
- `version`, `authorized_at` and `authorized_version`.
- `next_run_at` and `last_run_at`.
- A database check: a workflow can only be `active` when the customer has authorised its current version.

**`automation_runs`:**
- One row per trigger slot, with a unique idempotency key: `<automation id>:<slot time>`, or `…:retry:n` for retries.
- Records the status (`running`, `succeeded`, `skipped`, `failed`), the outcome text, attempts, the lease and `retry_of`.
- **Append-only**, enforced by a database trigger: runs can't be deleted, and finished runs can't be rewritten. The only allowed change is clearing the automation link when a workflow is deleted, so its history survives.

**`automation_inbox`:**
- The run's result: kind, title, body, checklist, references to posts or accounts, status, and the draft created from an approved suggestion.
- **At most one item per run**, enforced by a unique `run_id`.

**Engine:** `runAutomationTick` runs as the `automations.run-due` job on the existing pg-boss worker, every 60 seconds.
1. **Recover:** runs whose lease expired are re-executed. That's safe because every action is internal and idempotent. Each run gets at most 3 attempts, then it's marked failed.
2. **Claim:** due active workflows are claimed with `SELECT … FOR UPDATE SKIP LOCKED` (20 per pass). Each claim inserts the slot's run (`ON CONFLICT DO NOTHING`) and computes the next slot from now, so a worker that was down doesn't replay a backlog of missed runs.
3. **Execute** under a lease, re-checking immediately before acting:
   - the workflow still exists;
   - it's still active (or completed, for a one-off);
   - it's still authorised;
   - its version still matches the run's version.

   Otherwise the run is *skipped* with a clear reason. It's also skipped if the inbox already has 200 open items.

**Scheduling:**
- Wall-clock times in the workflow's IANA time zone, converted with the AI-07 Intl helpers.
- A time skipped by spring-forward runs at the first valid minute after the gap.
- A time that occurs twice runs once, at its first occurrence.
- `once` triggers in the past are refused when activating.

## 5. Security and approval boundaries

- **Never possible:** publishing, scheduling posts, orders, wallet or payment changes, refunds, ad spend, price changes, permission changes, messages to anyone, external HTTP calls, webhooks or code execution. There is no code path for any of these, and an integration test checks that no posts, publish targets or orders are created.
- **Explicit authorisation:**
  - The API requires both `activate: true` and `confirmed: true`; without them it returns 403.
  - The UI asks for the authorisation checkbox in both the review step and the activation dialog.
  - Authorisation is bound to the version: editing an active workflow without re-confirming pauses it, and any run planned for the old version is skipped.
- **Ownership:** every query is scoped to the session's customer. Other customers' workflows, runs and inbox items return 404, and pages only load the owner's data.
- **Limits:** 25 workflows and 10 active per customer, 200 open inbox items, 200 writes per hour, 20 workflows claimed per worker pass, 3 attempts per run, at most 2 manual retries per run.
- **Safe retries:** only failed runs of active workflows can be retried. A retry creates a new run, so history is never rewritten.
- **Input:** NFC-normalised, control characters stripped, lengths checked in code points, and strict schemas.
- **AI suggestions:** read-only. The customer reviews them in the builder and activates them themselves.

## 6. AI Workflow Assistant

`automation-assistant` is a dashboard-only workspace tool, with 10 free requests a day once live. It reuses the shared pipeline: quotas, budget reservations, redaction (the time zone is passed through as a validated identifier) and output validation.

- The model fills a plain shape. The result must then pass `definitionSchema`; fields not used by the chosen type are dropped before validation, so smuggled URLs never survive.
- Invalid or incompatible suggestions are rejected as output errors.
- The output includes the permissions the workflow needs and an explanation.
- `npm run ai:verify` now covers it.

Until a provider is configured and verified, the request box and Suggest button are disabled and labelled Coming soon.

## 7. SEO, AEO and GEO

- I didn't add a separate public Automation Studio page, to avoid a thin keyword page.
- `/social-management` gains one accurate FAQ, "Can I automate routine social media tasks?". It's included word for word in the FAQ JSON-LD (now 8 questions), and AI-assisted drafts are described as coming soon.
- Title, description, canonical URL, sitemap (15 URLs) and other structured data are unchanged.
- All automation pages live under `/dashboard`, so they're noindex (meta tag and header), private no-store, and disallowed in robots.txt.

## 8. Test results

| Check | Result |
|---|---|
| Typecheck, lint (whole repo), production build | Pass |
| Vitest, all projects | **394 / 394** |
| New unit tests (`tests/unit/automations.test.ts`) | 11 |
| New integration tests (`tests/integration/automations.test.ts`, UTF-8 scratch database) | 14 |
| Migration test | Updated to 59 tables and 10 migrations, rollback including the trigger |
| AI-08 browser checks | 38 / 38 |
| AI-07 regression | 40 / 40 |
| AI-06 regression | 86 / 86 |
| SEO crawl | 185 / 185 |

**Unit tests cover:**
- the allowlist (rejects publish, HTTP, order and webhook actions, scripts, extra fields, incompatible pairs, empty days, bad times, oversized checklists, bad names and zones);
- input sanitisation;
- weekly, daily and one-off scheduling;
- the New York spring-forward gap and the repeated hour;
- plain-language descriptions;
- all templates being valid and schedulable;
- the Workflow Assistant: dashboard-only, allowlisted output with smuggled fields dropped, invalid or incompatible output rejected.

**Integration tests cover:**
- Unicode round-trips;
- drafts that don't run;
- the database refusing an unauthorised active workflow;
- ownership;
- schedules that never run being refused;
- the active limit;
- three racing ticks producing one run and one item, with the next slot scheduled;
- pause and edit cancellation immediately before execution;
- crash recovery producing exactly one item;
- checklist completion;
- data actions reading only the owner's data, and skipping when nothing is found;
- suggestion approval creating one unscheduled draft;
- one-off workflows completing;
- append-only history surviving deletion;
- retry rules;
- no posts, targets or orders created;
- routes requiring confirmation, the same origin and ownership.

**Browser checks** ran against the production build in Edge, in the Europe/London time zone:
- redirect and noindex;
- the Automations tab;
- the empty state and templates;
- the template → configure → validation → review → activate flow;
- the detail page with no fabricated history;
- edit-pauses-until-reactivated;
- the activation dialog consent;
- duplicate and delete;
- incompatible actions explained;
- the populated inbox (checklist ticks, account references), needs attention and filters;
- run details and a safe retry adding a run;
- no credentials in pages;
- no overflow on the studio and builder at 320, 375, 768, 1024 and 1440 px in light and dark;
- keyboard use and reduced motion;
- no console or hydration errors.

The signed-in checks used a dropped scratch database with session-only QA customers and sample workflows inserted only there.

## 9. UTF-8

- Workflow names, descriptions, reminders and checklists are stored and rendered correctly on UTF-8 databases. Tests cover emoji, German, Spanish and Chinese.
- Your active `DATABASE_URL` still points at **`socivanta_dev` (WIN1252)**. I didn't change it.
  - Plain text works there.
  - Text the encoding can't represent is refused with a clear "needs a UTF-8 database" message, instead of an error.
- Migration 0009 was applied to both `socivanta_dev` and the validated copy `socivanta_dev_utf8`. To switch, point `DATABASE_URL` at `…/socivanta_dev_utf8`; the original stays intact as a backup.

## 10. Provider limitations and activation requirements

- **AI Workflow Assistant:** configure an AI provider, pass `npm run ai:verify` (which now includes the assistant), then turn on `AI_GENERATION_ENABLED`.
- **The worker must be running** (`npm run worker`) for workflows to fire. The web app alone doesn't run them. The job is enabled and only touches internal tables.
- **No external integrations exist or are planned for automations.** Publishing stays behind AI-07's approval gates, and automations can never trigger it.

## 11. AI-09 prerequisites (subscriptions; not started)

- **Plan-aware limits:** the automation limits (workflow count, active count, inbox size) and the AI allowances are named constants or configuration, ready to vary by plan.
- **Billing must not alter automation safety:** paid plans may raise limits but never add autonomous publishing, ordering or spending.
- **Usage metering:** `automation_runs` and `ai_usage_events` already provide per-customer, append-only usage history.

**Unchanged:** services, ordering, checkout and fulfilment, wallets, payments and ledger, authentication architecture, AI-01 to AI-07 behaviour (including AI-06 OAuth and AI-07's publishing safeguards) and customer permissions. No new credentials, no Git, nothing deployed.
