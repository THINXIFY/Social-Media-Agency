# Phase 5F — Provider Integration Architecture & Fulfilment Management: Implementation Report

Status: **complete within scope.** Phase 5F adds a working provider and fulfilment foundation:

- provider records;
- write-only encrypted credentials;
- health checks;
- service mappings;
- fulfilment preparation, reconciliation and manual resolution;
- one adapter contract;
- a live admin workspace.

It is built on the 5A tables and the 5E order architecture.

**Nothing real is active:**

- no integration is installed (`ADAPTERS = {}`);
- submission is switched off in code (`SUBMISSIONS_ENABLED = false`);
- no provider can be enabled without a supplier review and an installed integration;
- no mapping can be active for a service without all six eligibility gates;
- no money moves anywhere in this layer.

## 1. Inspection and dependencies

**Already in place (5A and 5E):**

- `providers`, `provider_credentials`, `provider_service_mappings`, `provider_health_checks` and `fulfillment_attempts` existed but nothing used them.
- The 5E order state machine (`staffTransition`), manual fulfilment, the `purchasable_services` view with the six eligibility gates, triggers SV009 and SV011, the audit log and staff roles were all in place.
- The admin Providers page showed demo data only.

**Unresolved 5E dependencies that keep things blocked:**

| Dependency | What it blocks |
|---|---|
| **D2:** approved services, with all six gates recorded by an accountable person. No service has them. | Mapping activation, and therefore preparing real attempts. |
| **Supplier review** of a real vendor. | Enabling any provider. |
| **D3:** wallet funding. **D5:** revenue recognition. **Refunds. The checkout switch.** | Real orders, so nothing reaches fulfilment in production. |
| **An approved integration** (vendor contract, API documentation, security review). | Any adapter, so nothing is contacted. |

**Safe to build now, and built:** records, encrypted credentials, mappings (inactive), health-check recording, the adapter contract with a test-only mock, fulfilment preparation, and the reconciliation and resolution workflow, all behind the gates above.

## 2. Implemented features

| Area | What it does |
|---|---|
| **Provider directory** | Real records only. Each shows a derived status: *Not connected*, *Needs credentials*, *Disabled*, *Needs attention*, *Ready* or *Archived*. Also shown: credential (masked), mappings (active out of total) and last check. Search, and filters for current / needs attention / archived. |
| **Provider details** | Type, integration, API address, authentication, supplier review, description and limitations. Lists every reason the provider can't receive orders yet. Edit and archive (never delete). |
| **Credentials** | AES-256-GCM via the existing `encrypt()`, keyed by `DATA_ENCRYPTION_KEY`, with iv, tag and key version stored separately. Write-only: read models never select the ciphertext and only the last four characters are returned. Replacing rotates the old one atomically. Removal and archiving retire it. |
| **Health checks** | Without an integration nothing is contacted and the honest outcome is recorded ("No approved integration is installed, so nothing was contacted."). With an adapter (tests), each check records ok, latency, balance if supported, and a plain-language error. |
| **History** | An append-only `provider_events` log of configuration, credential changes (never the secret), checks, mappings and attempts. Every sensitive action is also written to `audit_log`. |
| **Service mappings** | A catalog service mapped to a provider's service reference, with priority and a note. Always saved inactive; editing the reference or priority switches it off for re-verification. Shows a six-gate eligibility checklist and the reasons it can't be activated. |
| **Fulfilment queue** | Approved and in-progress orders with views: ready to prepare, with a provider, needs attention, all. Shows the latest attempt state and mapping availability. |
| **Fulfilment actions** | *Prepare (not sent)*, *Cancel attempt* (unsent only), *Check with provider* (reconcile), and *Resolve* an unknown outcome (re-auth). *Send to provider* is always disabled, with the reason shown. |

## 3. Provider architecture (`src/server/providers/`)

- **`adapter.ts`: the contract.**
  - `ProviderAdapter` declares its capabilities (`submit`, `status`, `lookupByKey`, `balance`) and whether it needs a credential, and implements `health`, `submit`, `status` and `lookup`.
  - Zod schemas validate requests and replies (`submitRequestSchema` is strict and needs a `ful_…` idempotency key).
  - `normalizeStatus()` maps common provider wording (Pending, In progress, Partial, Completed, Canceled or Refunded). Anything unrecognised is left for a person.
- **`callProvider()` guardrails:**
  - **Rate limit:** 60 calls a minute per provider, through the existing rate-limit buckets. When exceeded, nothing is sent.
  - **Timeout:** 10 s, enforced with an `AbortSignal`.
  - **Retries:** read-only calls only, at most 3, with backoff. A submission is never retried.
  - **Reply validation:** an unreadable reply is treated as *unknown*, never as *rejected*.
  - **Error classes:**

    | Class | Meaning |
    |---|---|
    | `rejected` | The provider definitely refused; nothing was created. |
    | `unavailable` | The provider definitely didn't process it. |
    | `unknown` | We can't tell whether it was processed. |
    | `not_configured` | Setup is incomplete. |
    | `rate_limited` | Our own limit stopped the call before sending. |

    Each class has a plain-language staff message; provider text is never echoed.
- **`registry.ts`:** `ADAPTERS = {}` and `SUBMISSIONS_ENABLED = false`. Both change only through code.
- **`mock.ts`:** a scriptable in-memory adapter for tests (ok, reject, unavailable, timeout, garbage, accept-then-drop, progress). It is never registered.
- **`providers.ts`:** records, credentials, health checks, mappings and read models.
- **`fulfillment.ts`:** prepare, cancel, submit (the trusted executor), reconcile, background reconciliation and resolution.

## 4. Service mapping rules

1. **The catalog is untouched.** All 118 services and their prices are unchanged (a test confirms both).
2. **Rejected mappings:**
   - unknown services;
   - archived services;
   - budget-based (`fee`) services, which are arranged with staff;
   - references containing characters outside `A–Z a–z 0–9 . _ : / # -`.
3. **Activation is decided twice:**
   - **Server:** readable reasons are shown to staff.
   - **Trigger SV012:** the service must have all six gates and not be archived, and the provider must be enabled and not archived.
   - **Automatic switch-off:** losing any gate, or disabling or archiving the provider, switches mappings off.
4. **Mappings never grant purchase permission.** `purchasable_services` doesn't read them (a test confirms the view is unchanged).
5. **No provider cost is ever shown to customers.** Mappings hold no cost. `fulfillment_attempts.cost_micros` is never returned by any API, and the queue and detail responses are checked for "cost".

## 5. Fulfilment state integration

- **No parallel order system.** Orders still change only through the 5E staff actions. An attempt never changes the order's status, payment, revenue or ledger; a test confirms journal entries and balances are unchanged.
- **Preparing** needs an approved order (`queued`) with its payment held (`charged`) and an active mapping, and no other open attempt (`queued`, `submitted`, `in_progress` or `unknown`). Trigger SV013 checks the same rules.
- **Submitting** happens in this order:
  1. **Claim:** a single atomic update (`queued → submitted`, `submit_count 0 → 1`). The provider must be enabled (SV013), and `submit_count` can never go back down, so exactly one worker wins and an attempt can never be sent twice.
  2. **Send:** the request goes out once, with the attempt's idempotency key.
  3. **Record the outcome:**
     - success: the provider order id and the normalised status;
     - definite refusal: `failed`;
     - anything uncertain: `unknown`, which blocks a new attempt.
- **Reconciling:** a sent attempt is checked by its provider order id. An unknown one is settled only by looking it up by the idempotency key. If the provider has no order for the key, it stays unknown for a person to decide.
- **Provider completion doesn't complete the order.** It is recorded on the order timeline as *"Provider reports it complete (needs staff evidence)"* (actor: provider). Completing still needs the existing *Complete with evidence* action. Finished attempts can't change (SV013).
- **Manual resolution of an unknown outcome** needs re-auth and a written confirmation: either *not received* (the attempt fails and a new one may be prepared) or *found at provider* (the provider order id is attached).
- **Background job:** `providers.poll-fulfillment` runs `reconcileDue()`, which claims up to 20 attempts with `FOR UPDATE SKIP LOCKED`. It stays **disabled** and has no registered handler.
- **Customer visibility:** provider events are staff-only. The customer timeline still shows only the 5E event types (a test confirms no provider text reaches the customer).

## 6. Security and audit controls

| Action | Permission | Re-auth |
|---|---|---|
| View providers | Providers: View | no |
| Add or edit a provider; run a health check | Configure providers (sensitive) | no |
| Set or remove a credential; archive a provider | Configure providers | **yes** |
| Save or remove a mapping; switch one off | Providers: Manage | no |
| Activate a mapping | Configure providers | **yes** |
| Fulfilment queue and details | Orders: View + Providers: View | no |
| Prepare, cancel, check with provider | Orders: Manage + Providers: View | no |
| Resolve an unknown outcome | Orders: Manage + Providers: View | **yes** |
| Send to provider | Refused in this phase (503) | n/a |

**General protections:**

- Every staff route needs an MFA-complete session, and roles are re-checked in the database on every request.
- Mutations check the request's origin.
- Input is parsed with strict schemas, so unknown fields such as `enabled` are refused.

**Credentials:**

- never returned, logged or written to audit or history;
- held only by the server-side `loadCredential()`, which passes the plain value only to an adapter call;
- the credential input is a password field with autocomplete off.

**Database safeguards (migration `0011_providers_5f`):**

- `providers_enable_check`: enabled needs a supplier review, an integration, and not being archived.
- `providers_text_check`.
- The SV012 mapping trigger and the two switch-off triggers.
- The SV013 attempt guard.
- An append-only trigger on `provider_events` (SV001).
- A unique idempotency key, and `submit_count` limited to 0–1.
- A rollback file is included. Migration 0011 is applied to `socivanta_dev` and the `socivanta_dev_utf8` copy.

## 7. UI and UX changes

The live admin page is `/admin/providers`, in `src/components/admin/live-providers.tsx`. Demo mode keeps the existing demo page.

- **Header:** one honest notice ("Sending orders to providers is switched off…", linking to Orders) and two tabs, *Providers* and *Fulfillment queue*. There are no KPI cards.
- **Directory table:** columns for status chips, credential, mappings and last check. Below 768px it collapses into readable cards.
- **Provider drawer:**
  - the reasons it can't receive orders yet;
  - details;
  - the credential, with write-only replace and remove;
  - health;
  - mappings, with the eligibility checklist and Activate disabled with its reasons;
  - history;
  - archive, behind a confirmation.
- **Fulfilment drawer:**
  - an order summary, with *Open in Orders*;
  - provider choice (inactive mappings are shown but can't be chosen);
  - Prepare (not sent);
  - Send to provider, disabled with its reason;
  - attempt cards with check, cancel (with a reason) and resolve. The resolve form warns about duplicates.
- **Feedback:** specific validation messages (https-only address, reference format), loading, empty and error states, and confirmation dialogs for destructive steps. Re-auth prompts use the existing dialog.
- **Orders timeline:** shows the new staff-only provider events with readable labels.

## 8. Test results (final run)

| Check | Result |
|---|---|
| Typecheck, ESLint (whole project, 0 problems), production build | Pass |
| New integration tests (`tests/integration/providers.test.ts`) | **24 / 24** |
| New unit tests (`tests/unit/providers.test.ts`) | **5 / 5** |
| Migration test (now 61 tables, 12 migrations, 0011 rollback step) and constraints test (updated for 5F rules) | Pass |
| Full Vitest | **444 / 444** on the final run. An earlier run failed one 5A constraints test, which used one-letter provider names and expected two inactive mappings to collide; it was updated for the 5F rules. |
| Browser QA (Edge, production build, scratch database) | **40 / 40** |

**What the integration tests cover:**

- **Posture:** no adapters, submission off, enabling blocked.
- **Authorisation:** support and finance roles get 403; orders staff are allowed. Origin checks, and unknown fields refused.
- **Credentials:** ciphertext only, write-only responses, rotation, re-auth, no secret in audit or history.
- **Mappings:** validation; budget-based services refused; 118 services and their prices unchanged; SV012 for direct writes; activation only when eligible; automatic switch-off on losing a gate or disabling the provider; activation through the API needs re-auth.
- **Health checks:** none without an integration; the credential reaches the adapter only; timeout with read-only retries; garbage replies; rate limit before sending.
- **Preparation:** gates, one open attempt, order and ledger untouched, customer can't see it, cancellation, SV013.
- **Submission:** off by default; exactly one wins among concurrent callers; never sent twice; a definite refusal isn't retried; uncertain outcomes become unknown and are settled by key lookup; unreadable replies; timeouts; resolution, with re-auth through the route.
- **Reconciliation:** progress, unrecognised statuses, provider-reported completion not completing the order (no money, order untouched, finished attempt immutable); concurrent background passes claim disjoint sets.
- **Safety:** routes enforce permissions and submission returns 503; history is append-only; archiving needs open attempts resolved.

**What the browser QA covers:**

- signed-out redirect, support denied (page and API), noindex;
- honest notice, real directory statuses, no secrets in the page;
- add provider by keyboard with validation;
- write-only credential;
- health check;
- mapping validation, inactive state with reasons, the six-gate checklist;
- history and archive with confirmation;
- fulfilment views, prepare (send disabled with its reason), cancel, check-with-provider explanation, resolving an unknown outcome;
- the Orders timeline event;
- no horizontal overflow at 320, 375, 768, 1024 and 1440px in light and dark;
- no console errors.

**Real issues found and fixed during QA:**

1. A subquery bound to the wrong `id`: Drizzle left the outer column unqualified. Fixed with an explicitly qualified column.
2. The fulfilment filter overflowed on phones. It is now a select below 640px.
3. A generic "Some details aren't valid." message. Specific client-side messages were added, matching the server rules.
4. The fixture needed the payment state `charged`, not `committed`, in the SV013 trigger. This was corrected before the migration was applied.

## 9. Remaining compliance and accounting blockers

- **D2:** the approved service list, with all six gates recorded by an accountable person.
- **Supplier review:** a named vendor reviewed (terms, delivery practices, refund and refill policy, data handling), recorded in `supplier_reviewed_at` and `supplier_reviewed_by`. There is no UI for this yet; it must be an owner-level, audited action.
- **Accounting for provider costs:** recording `cost_micros` and posting supplier payables or prepaid supplier balances needs an accounting decision. No ledger postings exist for provider costs.
- **D3 funding, D5 revenue recognition, refunds after work starts, and the checkout switch** are all unchanged from 5E.

## 10. Requirements before any live provider activation

1. The blockers in §9 are resolved and documented.
2. **An adapter for the approved vendor:**
   - written against its official API documentation and contract;
   - implementing `lookup` by idempotency key, or an equivalent way to settle uncertain outcomes;
   - tested with its own unit tests and a sandbox account;
   - security-reviewed (credential scope, IP allow-listing, TLS);
   - registered in `ADAPTERS` through code review.
3. A credential entered by an authorised owner (re-auth), a passing health check, the supplier review recorded, and the provider enabled through a reviewed, audited step. That control doesn't exist yet; it has to be built and reviewed first.
4. Mappings verified against the vendor's catalog, then activated individually with re-auth.
5. `SUBMISSIONS_ENABLED` turned on through code review. Enable the `providers.poll-fulfillment` job with a registered handler and alerting on unknown outcomes.
6. **A written runbook covering:**
   - resolving unknown outcomes;
   - what counts as delivery evidence when a provider reports completion;
   - when to prepare a new attempt;
   - partial deliveries and refunds.
7. **A staged rollout:** one service, one provider, a small daily cap, and ledger reconciliation reviewed daily.

No real provider was contacted, no credential was configured outside throwaway databases, and nothing was deployed. No Git.
