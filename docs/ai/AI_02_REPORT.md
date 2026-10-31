# SociVanta AI — AI-02: Functional AI Content Studio

## Status

| | |
|---|---|
| Implementation | **Complete**: Caption Generator, Hashtag & Keyword Finder, Post Ideas Generator, Content Calendar |
| Provider adapter | **Built**: Anthropic, through the official SDK (`@anthropic-ai/sdk`) |
| Mock-based tests | **Pass**: 226 / 226 tests in total (33 new); browser QA 35 / 35 for AI-02 and 9 / 9 for admin |
| Live provider verification | **Pending.** No AI credentials are configured in this environment, so no real request has been made. |
| Generation | **Off.** Every tool still shows *Coming soon*, and the run API answers 503. |

Live AI generation has **not** been shown to work against a real provider. To enable it, follow *Going live* below.

## Going live

1. In the server environment (never in the browser or in git), set:
   ```
   AI_PROVIDER=anthropic
   AI_API_KEY=<Anthropic API key>
   AI_MODEL=claude-opus-5-5          # or claude-sonnet-5-5 / claude-haiku-5-5. See "Model choice".
   AI_DAILY_BUDGET_MICROS=5000000    # e.g. $5 per UTC day across all customers
   ```
2. Run `npm run ai:verify`. This makes four real, billed requests, one per tool, through the full pipeline. It prints a summary, the cost and the token counts for each tool. It works while generation is still off.
3. Read the output. If all four pass, set `AI_GENERATION_ENABLED=true` and restart.
4. Check **Admin → AI usage**: the status should read *Live*. Tool badges switch to *Available* automatically.
5. Update the landing-page copy that says the tools are "in the works". The copy was left unchanged on purpose, because the brief said not to redesign the landing page, and it is still accurate while generation is off.

If any gate is missing, generation stays off. Admin → AI usage shows the exact reason.

## What was built

### Tools

| Tool | Input | Result | Calls per run | Free runs / day |
|---|---|---|---|---|
| Caption Generator | Topic, 1–3 platforms, tone, audience | **3 distinct caption variations per platform** (each labelled with its angle), 3–5 hooks, 2–3 CTAs. Editable, with copy on everything and regenerate. | 1 | 10 |
| Hashtag & Keyword Finder | Topic, 1–3 platforms | Three groups (Broad, Specific, Niche & community), with copy per tag and per group, plus keywords | 1 | 10 |
| Post Ideas Generator | Brand, goal, 1–3 platforms | 6 ideas, each with a category, format, platform, hook and outline. Category filter and copy. | 1 | 10 |
| Content Calendar | Brand, goal, 1–3 platforms, posts per week (1–14), **7 or 30 days** | Weekly themes and a day-by-day plan with editable themes, topics and notes. Copy, **CSV export** and **print**. | 1 (7 days) / **5** (30 days, one week per call) | 3 |

Allowances match the registry (10 / 10 / 10 / 3, signed-in only; anonymous is 0). Every tool requires a signed-in account with a verified email.

### Workspace states

- **Coming soon:** the current state. Fields are a preview and nothing can be submitted.
- **Live, signed out:** a "Free with a SociVanta account" prompt with Log in and Sign up links.
- **Live, email unverified:** a prompt to verify, with a link to resend the email.
- **Live and verified:**
  - Today's remaining runs are shown.
  - The form validates like the server does, so no run is wasted on a mistake.
  - The run can be cancelled. Results get regenerate; errors get *Try again*.
  - When the quota is used up, Generate is disabled with a note that it resets at midnight UTC.

## Architecture

```
Browser ─ GET  /api/ai/tools/[id]      → live availability, account state, today's usage
        └ POST /api/ai/tools/[id]/run  → runTool()
runTool: tool implemented → generation enabled → access policy → input schema & size
       → redact every string → per-call cost ceiling vs model price → burst limit (5/min)
       → quota + budget reserved under advisory locks (calls × ceiling)
       → generator.execute(input, ask) — each ask: timeout + cancel + one safe retry,
         structured output, JSON + Zod validation, 20k-char cap
       → tool rules + sanitising → final schema → usage row (metadata only)
```

- **`src/server/ai/anthropic.ts`:** the adapter.
  - Uses the SDK's `messages.create` with `output_config: { effort: "low", format: zodOutputFormat(schema) }`, so answers are constrained to the tool's JSON schema.
  - `maxRetries: 0`, because the pipeline owns the single retry.
  - The key and base URL are passed explicitly. Ambient `ANTHROPIC_*` variables or SDK profiles can't redirect requests or swap the key; a test covers this.
  - Error mapping: 429 → rate limited; 5xx / 529 / network → outage (retried once); other 4xx → rejected (not retried); abort → timeout; `stop_reason: refusal` → rejected; `max_tokens` → truncated JSON, which is rejected as invalid output with its cost still counted.
- **`src/server/ai/pricing.ts`:** built-in prices (Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50 per million tokens), with an env override for other models.
  - A model with no known price can't run.
  - Blank env values mean "not set". An empty price can never become $0.
- **`src/server/ai/provider.ts`:**
  - `providerStatus()` checks that a provider is configured, has an adapter, a key and model, a price, and a budget.
  - `generationStatus()` adds the launch switch, `AI_GENERATION_ENABLED`.
- **`src/server/ai/generators/`:** one module per tool, plus `shared.ts` for prompt rules, delimiting, sanitising and duplicate checks.
  - Generators can make several calls, as the 30-day calendar does.
  - Each declares its maximum number of calls, and the pipeline reserves budget for all of them before the first call.
- **`src/server/ai/run.ts`:**
  - Supports multi-call generators.
  - Redacts the whole input object.
  - Refuses a model whose worst-case cost per call exceeds the tool's ceiling. The ceilings are sized so even Opus 5.5 fits: $0.10 per call with 4,000 output tokens, thinking included.
  - Accounts total cost across calls. If a run fails after some calls completed, those calls' cost still counts toward the budget, but not toward the customer's allowance.
- **Availability:**
  - Pages stay static and show each tool's declared state.
  - The client asks `/api/ai/tools` and `/api/ai/tools/[id]` for the live state.
  - Badges and the workspace upgrade only when the server confirms the tool can run.

### Model choice

The model is a configuration setting. `.env.example` defaults to `claude-opus-5-5`, the most capable of the three.

For short captions and hashtags, `claude-haiku-5-5` costs roughly 40× less per token and is worth evaluating with `npm run ai:verify` before choosing. That trade-off is the operator's call. The code supports all three models with correct cost accounting.

## Security and honesty

- **Prompt injection:**
  - The customer's brief is serialised as JSON inside `<brief>`, with `<` and `>` escaped, so it can't close the element or pose as instructions.
  - The fixed rules tell the model to ignore instructions found inside the brief.
  - The brief never enters the system prompt.
  - Answers can only take the tool's schema.
- **Untrusted output:**
  - Every answer is re-validated against its schema and the tool's rules: the right platforms, three genuinely distinct captions, valid deduplicated hashtags, days in range.
  - Every string is then sanitised: links, emails, phone and card numbers, and control and bidirectional characters are removed.
  - Results are rendered only as React text or form values. A browser test confirms an injected `<img onerror>` stays inert text.
  - Nothing generated can trigger an action.
- **CSV export:** values that start with `= + - @` are prefixed, so spreadsheets don't run formulas.
- **No fabricated data:**
  - Hashtag output has no numeric fields, so volume, popularity, difficulty or trend figures can't be carried. Any extra field fails validation.
  - The rules forbid such claims.
  - The UI states "Suggestions only — no search volume, popularity or trend data."
  - The calendar uses day numbers, not dates or "best times", and states that nothing is scheduled.
- **Privacy:**
  - Personal and secret-looking data is redacted before sending.
  - No prompt or output is stored. Usage rows hold only metadata and an HMAC of the account.
- **Server-side refusal fallbacks are not enabled.** A fallback bills a different model outside the per-request cost reservation that protects the daily budget. A refusal is shown as "The AI couldn't help with that brief" and doesn't use the allowance. If needed, fallbacks can be added later with matching cost accounting.

## Operations: Admin → AI usage (`/admin/ai`)

- **Access:** visible to roles with `settings:view`. Owners and administrators can see it; support, orders and finance roles can't.
- **Contents:**
  - Generation status, with the exact blocking reason and a readiness checklist: provider, model and price, budget, provider ready, launch switch.
  - Today's spend and reservations against the budget.
  - Request outcomes for today and the last 7 days: succeeded, provider failures (outages and timeouts), invalid output, quota rejections and budget rejections.
  - A per-tool breakdown with average latency.
  - The 10 most recent failures.
- **Data:** usage metadata only. The API key is never shown.

## Files

| New | Purpose |
|---|---|
| `src/server/ai/anthropic.ts` | Anthropic adapter (official SDK) |
| `src/server/ai/pricing.ts` | Model prices, cost and worst-case calculations |
| `src/server/ai/types.ts` | Shared provider types |
| `src/server/ai/generators/{shared,caption,hashtag,ideas,calendar,index}.ts` | Content Studio generators |
| `src/server/ai/diagnostics.ts` | Operations aggregates |
| `src/app/api/ai/tools/[id]/route.ts` | Per-tool live status |
| `src/app/admin/(panel)/ai/page.tsx`, `src/components/admin/ai-diagnostics.tsx` | Admin AI usage view |
| `src/components/ai/results.tsx` | Result views: captions, hashtags, ideas, calendar (CSV, print) |
| `src/components/ai/use-ai-status.ts`, `src/components/ai/live-badge.tsx` | Live availability on the client |
| `scripts/ai/verify.ts` (`npm run ai:verify`) | Live provider test |
| `tests/unit/ai-provider.test.ts`, `tests/unit/ai-generators.test.ts`, `tests/integration/ai-content-studio.test.ts` | Tests |

| Changed | What changed |
|---|---|
| `src/server/ai/run.ts`, `provider.ts` | Multi-call generators, the launch switch, the cost ceiling, deep redaction. Availability is checked before the sign-in check. |
| `src/server/env.ts`, `.env.example` | `AI_GENERATION_ENABLED` and price overrides; blank values mean "not set" |
| `src/lib/ai/registry.ts` | Goal and tone lists, a platform limit of 3, the calendar's 7/30-day field, per-call guards. IDs, routes and allowances are unchanged. |
| `src/components/ai/workspace.tsx` | The live workspace, described above |
| `src/app/ai-tools/[tool]/page.tsx`, `src/components/ai/directory.tsx` | Live badges; "N free runs a day" |
| `src/app/api/ai/tools/[id]/run/route.ts` | Unverified accounts are asked to verify their email |
| `src/components/admin/nav.ts`, `src/server/auth/pages.ts` | AI usage entry, mapped to `settings:view` |
| `src/app/globals.css` | Print styles for the calendar |
| `tests/integration/ai.test.ts`, `tests/unit/boundaries.test.ts` | Updated for the new provider states and env example |

## Tests and QA

| Check | Result |
|---|---|
| Typecheck, ESLint, production build | Pass |
| Vitest (unit and integration) | **226 / 226** (193 before AI-02). One run hit a known TOTP time-window flake in `auth-staff.test.ts`, which I didn't change; it passed 3/3 alone and in the next full run. |
| Adapter (mocked HTTP) | Request shape (model, `max_tokens`, system, effort, JSON schema, no forced `tool_choice`); bearer key; ambient credentials and base URL ignored; 429 / 529 / 500 / 401 / 400 / network / refusal / abort / `max_tokens` handling; no SDK retries; key never in errors |
| Generators (scripted model) | Input rules, injection delimiting, sanitising, platform matching, distinct variations, hashtag clean-up and no-statistics schema, idea categories, 30-day chunking (5 calls, themes carried forward, out-of-range days dropped), CSV formula safety |
| Pipeline (scripted provider, real database) | Redaction and escaping end to end; metadata-only rows; a 30-day run reserved up front and charged at actual cost; a mid-run outage keeps paid cost and not the customer's run; rule-breaking output rejected; expensive models refused before any call; refusals not retried; budget covers every call; only the four tools go live and only with the switch on; status and run endpoints; diagnostics |
| Browser, production build (`ai02`, 35 checks) | The real server stays locked (503). Live states via a network-edge double in the browser only: signed-out prompt, Available badge, usage, validation, platform limit, safe rendering, editing with character count, copy, platform tabs, regenerate, error recovery, quota exhaustion, hashtag copy, idea filter, calendar CSV and print, 375 px dark, keyboard-only use. No console errors. |
| Admin (`admin-ai`, 9 checks) | Owner sees status, reason and tables, with no secrets; 375 px dark has no overflow; the support role is denied and has no sidebar link |
| Regression (`ai01`, 55 checks) | Landing page, tool pages, header, footer and dashboard entry are unchanged |
| Live provider | **Not run** — no credentials (see *Going live*) |

## Scope kept

These are unchanged:

- The 118 services.
- Ordering, checkout, deposits, payments and fulfillment.
- Customer and admin workflows, apart from the new AI usage entry.
- Authentication.

Not added:

- Growth Intelligence (AI-03).
- Social account integrations.
- Posting or scheduling.
- Image or video generation.
- Subscriptions.
- Saved AI Projects.

The landing-page design was not changed. No Git, and nothing was deployed.

A small QA fixture (two staff sessions) was created in the dev database for the admin browser check and deleted afterwards.
