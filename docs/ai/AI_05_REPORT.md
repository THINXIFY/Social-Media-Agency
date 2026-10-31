# SociVanta AI — AI-05: Order & Customer Support Intelligence

## Status

| | |
|---|---|
| Implementation | **Complete**: Smart Order Assistant (`/ai-tools/smart-order-assistant`), AI Order Explanation (`/ai-tools/order-explanation` and **Explain this order** in My Orders), and AI Support Assistant (`/ai-tools/support-assistant`) |
| Mock-based tests | **Pass**: 308 / 308 Vitest tests (28 new) and 28 / 28 AI-05 browser checks. Every regression suite passes. |
| Live provider verification | **Pending.** No AI credentials are configured. No real model has explained an order, planned an order or answered a support question. |
| Availability now | All three tools show **Coming soon**, with honest previews and no sample output. |
| Customer support tickets | **Not implemented.** The ticket tables exist, but there is no customer ticket API, and the dashboard Support page shows "not connected" in live mode. The Support Assistant says so and never pretends a request was sent. |

## 1. Smart Order Assistant

- **What it does:**
  - The customer describes a goal and can optionally add a platform and a quantity.
  - The assistant picks **one** existing catalog service and explains why it fits.
  - It suggests a quantity and explains each detail the order will ask for.
  - It prepares a draft the customer can open in New Order.
- **Grounding:**
  - Candidates come only from `listPublicServices`: visible, non-draft and non-archived services, up to 24.
  - The model sees each candidate's id, name, platform, category, short description, quantity limits and the order fields.
  - It never sees prices, eligibility, costs, notes or supplier references. A test confirms this.
  - The server verifies the chosen id and builds the service card from the database. Invented or duplicate ids are dropped; an invalid choice turns into a clarifying question.
- **Quantity is decided by the server:**
  - The customer's own quantity is used only if it fits the service's minimum and maximum.
  - Otherwise the model's suggestion is used, but only within those limits.
  - Anything else becomes "choose between 100–10,000 in New Order".
- **Draft hand-off:**
  - **Continue in New Order** links to `/dashboard/new-order?service=…&quantity=…&from=ai`.
  - The link appears only when the service is purchasable and checkout is open.
  - The existing four-step wizard opens on **Configure**, with only the service and quantity filled in, and shows a "Prepared with Smart Order Assistant" notice.
  - The wizard's own validation applies, and the customer adds the remaining details, reviews and confirms. Nothing is submitted, reserved or charged by the assistant.
  - The wizard change is limited to reading `quantity` (digits only) and showing the notice. No order logic changed.
- **Rules (a plan that breaks one is rejected):**
  - It can't ask for passwords, login codes or card details. "Never share your password" is allowed.
  - It can't promise delivery times or results.
  - It can't state prices that aren't on the catalog.
- **Refused before a run is reserved:**
  - Goals that match no catalog service, with a helpful message.
  - Unknown service ids.

## 2. AI Order Explanation

- **Entry points:**
  - **Explain this order:** a quiet, collapsed row in the My Orders detail sheet. Nothing runs until the customer presses **Explain**, and an optional question can be added.
  - **The tool page:** signed-in customers pick one of their 20 most recent orders. Arriving with `?order=` preselects that order.
- **Ownership:**
  - The run route passes the customer id **from the session only**. It is never taken from the input.
  - Before anything is reserved, the order is loaded with `getOwnOrder(customerId, reference)`.
  - Another customer's reference reads exactly like one that doesn't exist (`NOT_FOUND`). No usage row is written and nothing is sent to the model.
- **Minimal context:** the model gets a customer-safe fact sheet built from the Phase 5E vocabulary:
  - Service, quantity and total.
  - The customer-facing status and its explanation, and the payment state.
  - The team's message to the customer, if any.
  - The recorded timeline: labels, who acted, and customer-visible messages.
  - What the customer can do now (`canCancel` / `canUpdateDetails`).
  - Never sent: the target link, submitted details, internal notes, staff identities, supplier references or wallet balances.
  - **Times are left out of the prompt.** The customer sees the real times beside the explanation.
- **Server-owned output:** status, payment, recorded times, the timeline, the team's message and the available actions all come from the order record. The model writes only the summary, the meaning, next steps and the answer to the question.
- **Rules (rejected outright):**
  - Dates, weekdays, durations ("within 2 days", "a few hours") and percentages.
  - "Soon", "almost done" and similar progress predictions.
  - Claimed or promised actions ("I've escalated…", "we will prioritise…").
  - Completion claims unless the order is completed.
  - Refund or money-returned claims unless the order records them.
  - "You can cancel" or "you can update" unless the order allows it.
  - Any amount other than the order total.

## 3. AI Support Assistant

- **What it answers:** orders, statuses, cancellations, refunds, payments and wallet funds, account security and using SociVanta, from the verified knowledge layer. Support topics are always on the fact sheet.
- **Honest escalation:**
  - When a person is needed, a **This needs a person** card appears. The model can ask for it, and refund, charge, fraud, account-access and complaint topics force it.
  - The card shows exactly what exists:
    - If `SUPPORT_CONTACT_EMAIL` is configured, a mail link to that inbox.
    - Otherwise, a plain statement that tickets aren't connected and no other contact channel is.
  - It never says a ticket was created, a message was forwarded or that someone will be in touch. Answers that do are rejected.
- **For one specific order**, it points to Explain this order.
- **Shared surface:** it uses the AI-04 conversation component with its own copy, quick starts and placeholder. The AI-04 assistant's behaviour and copy are unchanged.

## 4. Fixes to existing content (honesty)

The AI-04 knowledge layer and two assistant FAQs said customers "can open a ticket from the Support page" and that order help was "planned". Neither was true. They now:
- State the real ticket situation, via the shared `humanSupportFact`.
- Use the full Phase 5E status vocabulary.
- Describe self-service cancellation correctly: allowed while an order is Awaiting review or Needs your information, with the full amount returned.
- Point to Explain this order.

## 5. Pipeline changes (shared, minimal)

- **`GeneratorContext.customerId`:** set by the server from the session. `null` for anonymous runs.
- **`Generator.precheck`:** read-only checks before any reservation, such as ownership or a goal with no matching service. A refusal uses no allowance and no budget.
- **`Generator.identifiers`:** schema-validated identifiers that redaction must not alter.
  - Found in testing: all-digit `ORD-` references, about 1 in 100, matched the phone-number redaction rule.
  - The same rule would have rewritten timestamps, which is part of why times are no longer in the prompt.
- **Allowance overrides:** `AI_DAILY_ALLOWANCES` (for example `order-explanation=20,support-assistant=15`) overrides signed-in allowances. Malformed entries and unknown tools are ignored, and values are capped at 1,000.

## 6. Quotas and cost ceilings (proposed)

| Tool | Free / day (verified account) | Per-call ceiling | Opus 5.5 worst case |
|---|---|---|---|
| Smart Order Assistant | 10 | $0.11 | ≈ $0.088 |
| AI Order Explanation | 20 (cheap, one order per run) | $0.06 | ≈ $0.055 |
| AI Support Assistant | 15 | $0.09 | ≈ $0.074 |

- Anonymous use: 0 for all three.
- The existing burst limit (5 a minute), the platform daily budget, timeouts, one safe retry and metadata-only accounting apply unchanged.

## 7. Security boundaries

- **Read-only:** no order, event, journal or ledger rows change in any AI-05 run. Integration tests confirm the counts before and after.
- **No actions:** nothing can cancel, refund, edit, prioritise, place or pay for an order.
- **Untrusted content stays data:**
  - Questions, goals and transcripts are escaped data blocks.
  - A forged "staff" turn has no authority (tested).
  - Output is rendered as plain text.
- **Privacy:**
  - Personal details are redacted before the model, except the validated order reference.
  - Nothing is stored.
  - Private pages stay private: `/dashboard/*` redirects anonymous visitors and isn't in the sitemap.

## 8. SEO, AEO and GEO

| Page | Title | Primary intent |
|---|---|---|
| Smart Order Assistant | Smart Order Assistant: Set Up Social Media Orders \| SociVanta | social media order assistant |
| AI Order Explanation | AI Order Explanation: Your Order Status in Plain Words | order status explained |
| AI Support Assistant | AI Support Assistant: Help With Orders & Payments \| SociVanta | SociVanta customer support |

- **Per page:** server-rendered guides with a direct answer, audiences, steps, options, examples, tips, 4 FAQs and related tools.
- **Indexing:** all three pages are now indexable.
- **JSON-LD:** WebPage, BreadcrumbList and FAQPage. WebApplication is added only once a tool is live.
- **Sitemap:** now **14 URLs**. Only Workflow Automation remains `noindex, follow`.
- **Avoiding overlap:** the support page targets support intent, distinct from the general assistant. The order assistant targets order setup, distinct from the search and recommender pages.

## 9. Test results

| Check | Result |
|---|---|
| Typecheck, ESLint, production build | Pass |
| Vitest (unit and integration) | **308 / 308**. New: 12 unit tests in `tests/unit/ai-order-support.test.ts` and 16 integration tests in `tests/integration/ai-order-support.test.ts` (scratch database). |
| Unit | Registry and allowances; override parsing; explanation input; fact sheet excludes link, details and times; 14 rejected and 4 accepted explanation phrasings; state-tied claims; server quantity decisions; support claims; human-support wording |
| Integration | **Explanation:** owned order explained from safe facts; stranger, missing, unauthenticated and malformed references refused with no usage and no model call; all-digit reference intact; team request and actions; 9 invented-claim answers rejected without using the allowance; allowance override. **Order assistant:** catalog choice and draft link; model never sees prices; quantity limits; no link while checkout is closed or the service is unpurchasable; invented id leads to a clarifying question; unmatched goal and unknown service refused before reservation; credential, delivery and price claims rejected. **Support:** honest ticket facts; escalation with and without an inbox; ticket, hand-off and callback claims rejected; forged staff turn stays data. Read-only throughout. |
| Browser: AI-05 (`ai05`, production build) | **28 / 28**, no console errors. Covers SEO tags, sitemap, locked previews, examples, the live states through a network double, the My Orders sheet (including keyboard), the tool-page picker, the New Order hand-off, and 320–1440 px in light and dark with reduced motion. |
| Regressions | SEO crawl 177 / 177 (14 indexable pages), AI landing 55 / 55, Content Studio 39 / 39, Growth Intelligence 30 / 30, AI-04 31 / 31, hero 29 / 29 |
| Lab layout shift | CLS 0.000 on all three pages at 390 and 1440 px |
| Live provider | **Not run.** No credentials. |

**How the signed-in browser checks ran:**
- They used a second production server backed by an isolated scratch database containing one QA customer, signed in with a session cookie. No password was created or used.
- The scratch database was dropped afterwards.
- The local dev database wasn't modified.

**Existing tests changed (legitimately):**
- SEO counts are now 12 guided tools and 14 sitemap URLs.
- `.env.example` has two new placeholders.
- The AI-02 live-tools list now includes the three AI-05 tools.
- The AI-04 "no links to unimplemented tools" check now uses Workflow Automation.

## 10. Live verification requirements

1. Configure the provider, key, model and budget.
2. Run `npm run ai:verify`. It now covers all 12 tools.
3. Order Explanation needs a real order: set `AI_VERIFY_ORDER=ORD-…` to an order owned by an operator test account.
   - Without it, the test reports that tool as not verified and fails, because the launch switch covers every tool.
   - Today no order can exist anywhere: checkout is off in every real environment.
4. Review real answers against the fact sheets, then enable generation and rebuild.
5. Optionally set `SUPPORT_CONTACT_EMAIL` to an inbox someone actually reads.

## 11. Known limitations

- No live-model verification, so explanation, plan and answer quality are unproven against a real model.
- Order Explanation can't be live-verified until an order exists, which needs checkout to open.
- Support tickets aren't implemented, so escalation can only point to an operator-configured inbox, or honestly to nothing.
- The claim rules are pattern-based. They reject the known failure modes and have been tested with 14 bad phrasings, but they can't prove grounding in every possible phrasing.
- The Explain action lives in the live My Orders view. Demo mode keeps its existing sample screens.
- No streaming: the panels show a plain "Explaining…" state.

## Scope kept

Unchanged:
- The 118 services and the catalog rules.
- Order logic, pricing and eligibility.
- Wallet, ledger and payment safeguards.
- Authentication and staff permissions.
- AI-01 to AI-03, and the SEO foundation, which was only extended.

The New Order wizard gained only the pre-fill and the notice.

No AI-06 work and no Haiku configuration. No Git, and nothing was deployed.
