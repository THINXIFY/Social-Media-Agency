# Admin AI Control Center: Provider, Key, Model and Cost Management

Status: **complete within scope.** Authorised admins can do the following in the Admin Dashboard:

- manage provider API keys securely: save, test, activate, disable and rotate them, with no env edits or redeploys;
- inspect a model library that doesn't guess capabilities;
- prepare per-tool model assignments;
- set spending limits and an emergency pause;
- review real usage and an audit trail.

**Nothing was activated:**

- `AI_GENERATION_ENABLED` is still off, so customer generation stays disabled.
- No real key was configured.
- No provider was contacted, in tests or in browser QA.

## 1. Admin UI and routes

The page is `/admin/ai` (the existing "AI usage" sidebar entry, renamed **AI Management**). Seven tabs (URL `?tab=`, arrow-key navigation) keep the sidebar to one entry:

| Tab | What it does |
|---|---|
| **Overview** | Customer generation (live or off, with the exact reason), active keys, assignments, today's spend against its limit, every provider's honest state. The existing AI usage & health view is kept below. |
| **Providers & Keys** | 12 major providers and 4 enterprise or custom entries, each with its state, its auth method and a docs link. Per provider: keys by version, with masked hint, status, last test (free or billable) and outcome. Actions: Test (free), Billable test (needs a model and an explicit acknowledgement), Activate (with a confirmation dialog), Disable, Add a replacement key. |
| **Models** | Search and filter. Shows provider, official model id, source (SociVanta catalog, listed by the provider, added manually), capabilities (supported, not supported, not verified), limits, sourced price and status. Add or edit form. |
| **Tool Assignments** | Search tools. Provider and model pickers, then Save draft → Check (compatibility and cost) → Activate, plus Disable. Each tool shows its cost ceiling and output limit, with the check's reasons in plain words. |
| **Usage & Costs** | Filters for period, provider and tool. Budget consumption (today and month), and requests, successes, errors, blocked requests, tokens, estimated cost and last success, broken down by provider, model and tool. Recent provider errors. |
| **Budgets & Settings** | Daily, monthly and maximum-per-request limits, per-provider, per-model and per-tool daily limits, and disabled providers. |
| **Audit History** | Every Control Center change from `audit_log`, with masked hints only. |

The header has an **Emergency pause** button, or **Resume AI** with confirmation when paused, and shows a red banner while AI is paused.

**API (`src/app/api/admin/ai-control/`):**

- `GET /` (all data)
- `GET /usage`
- `GET /audit`
- `POST /keys`
- `POST /keys/:id/test|activate|disable`
- `POST /models`
- `POST /assignments/:tool/draft|check|activate|disable`
- `PUT /controls`
- `POST /controls` (emergency pause or resume)

## 2. Provider capability matrix

Provider definitions are in `src/lib/ai/provider-catalog.ts`. The states shown are:

- **Verified:** an active key passed a test here.
- **Supported:** an adapter exists.
- **Configuration available:** keys can be stored and tested, but there's no generation adapter.
- **Adapter pending.**
- **Disabled.**

| Provider | Generation | Free key check | Auth |
|---|---|---|---|
| Anthropic (Claude) | **Native** (existing SDK adapter) | `GET /v1/models` | x-api-key + anthropic-version |
| OpenAI (GPT) | **Native** (Chat Completions, JSON-schema output) | `GET /v1/models` | Bearer |
| Google Gemini API | **Native** (generateContent, JSON response schema) | `GET /v1beta/models` | x-goog-api-key |
| xAI (Grok) | OpenAI-compatible transport | `GET /v1/models` | Bearer |
| DeepSeek | OpenAI-compatible transport | `GET /models` | Bearer |
| Groq | OpenAI-compatible transport | `GET /openai/v1/models` | Bearer |
| OpenRouter | OpenAI-compatible transport | `GET /api/v1/key` | Bearer |
| Together AI | OpenAI-compatible transport | `GET /v1/models` | Bearer |
| Fireworks AI | OpenAI-compatible transport | none wired (billable test only) | Bearer |
| Moonshot AI (Kimi) | OpenAI-compatible transport | `GET /v1/models` | Bearer |
| Mistral AI | **Adapter pending** (configuration available) | `GET /v1/models` | Bearer |
| Cohere | **Adapter pending** (configuration available) | `GET /v1/models` | Bearer |
| Azure OpenAI / Foundry | Adapter pending (definition only) | n/a | api-key or Entra ID, per resource |
| Amazon Bedrock | Adapter pending (definition only) | n/a | AWS SigV4 |
| Google Vertex AI | Adapter pending (definition only) | n/a | Service-account OAuth |
| Custom OpenAI-compatible | Adapter pending; reserved for code review, not configurable in the UI | n/a | Bearer |

**How the endpoint details were sourced:** endpoints, headers and auth methods come from each provider's public API reference as I knew them. I didn't re-fetch the docs during this session. Each entry links its docs, and the catalog asks for re-checking before activation. In the app, a provider becomes **Verified** only after a passing test with a real key.

## 3. Adapters actually implemented (`src/server/ai/control/adapters.ts`)

- **Anthropic:** reuses the AI-02 SDK adapter unchanged.
- **OpenAI native and seven compatible providers:** one Chat Completions transport.
  - `response_format: json_schema`, using zod's built-in JSON-schema conversion.
  - `max_completion_tokens` for OpenAI, `max_tokens` for compatible providers.
  - A refusal maps to `rejected`; usage and cost come from the reported tokens.
- **Gemini:** generateContent with `responseJsonSchema`. Thinking tokens count as output.
- **All transports:**
  - fixed https base URLs, with the key passed explicitly (no ambient credentials);
  - no internal retries (runTool keeps its single retry);
  - HTTP 429 → rate limited, 5xx → outage, other 4xx → rejected, abort → timeout.
- No new dependencies were added; everything uses `fetch`. Every adapter is tested against an in-memory fetch mock.

## 4. Credential storage architecture

- **Storage:** an `ai_credentials` table (migration `0012_ai_control`). Keys are AES-256-GCM encrypted with the existing `DATA_ENCRYPTION_KEY` (env, never hardcoded), with iv, tag and key version stored separately. Because the database is the shared source, every instance sees the same active key; nothing is held process-locally.
- **Save → Test → Activate:**
  - **Save** stores a new *version* (status `saved`) under a per-provider advisory lock. It never touches the active key.
  - **Test** calls the provider's non-billed endpoint (rate-limited to 10 tests per 5 minutes per admin). A **billable test** (one request, at most 16 output tokens) runs only with `billable: true`, a chosen model and a UI acknowledgement, and is recorded as billable. Only the outcome *code* is stored: `ok`, `invalid_key`, `permission`, `not_found`, `rate_limited`, `provider_unavailable`, `network` or `no_free_check`. Response bodies are never stored. Models a passing test lists are added as *discovered* and *not verified*.
  - **Activate** needs `confirm: true` and a key whose latest test passed. In one transaction under the provider lock, the previous active key becomes `retired` and the new one becomes `active`. A unique partial index guarantees one active key per provider; concurrent activations leave exactly one.
  - **Disable:** a disabled active key leaves the provider without a key, so it fails closed.
- **Immutability:** trigger `ai_credentials_guard` (SV001) refuses any change to ciphertext, iv, tag, key version, version or hint, and any delete. Rotation always creates a new row, so a failed rotation can't overwrite a working key.
- **Never exposed:** keys are never returned to the browser (read models don't select the ciphertext), never logged, and never written to audit records or URLs. Only a hint such as `sk-…efgh` is shown. The key field is a password input with autocomplete off. Nothing is stored in localStorage.

## 5. Model discovery and assignments

- **The model library (`ai_models`) has three sources:**
  - **catalog:** the three Anthropic models already priced in `pricing.ts`, with structured output marked supported because the AI-02 adapter relies on it;
  - **discovered:** listed by a provider during a key test;
  - **manual:** an admin entered the id after checking the docs.
- **No assumed capabilities:** discovered and manual models start "not verified". Capabilities are three-state (supported, not supported, not verified). Marking a model *Verified* requires the structured-output answer to be recorded. A price requires a source (zod check plus a database CHECK). I didn't invent any OpenAI or Gemini model ids.
- **Assignment rules (`ai_tool_assignments`):**
  - Only tools with implemented generators and a free-use policy can be assigned.
  - **Check** requires:
    - an adapter for the provider;
    - the provider not disabled;
    - a verified model (status *available*) with structured output supported;
    - enough output tokens for the tool;
    - a sourced price;
    - a worst-case call cost within the tool's existing `guard.maxCostMicros`, and a worst-case run within the maximum cost per request.
  - **Activate** also needs an active key for the provider. A database CHECK prevents an active assignment that didn't pass.
  - Changing the model resets the assignment to draft. A failing re-check demotes an active assignment.
  - Tool input and output schemas, quotas and validators are unchanged.
- **Fixture test:** the "test against a bounded fixture" step is the free compatibility and cost check. A live fixture run would be billable, so it isn't offered per tool. The key's billable test (16 tokens, explicitly confirmed) covers live connectivity.

## 6. Routing and safe rotation (`routing.ts`, minimal change to `run.ts`)

- **Launch switch unchanged.** `runTool` still requires `AI_GENERATION_ENABLED`, and the env provider path is unchanged. A Control Center route is consulted **only** when generation is switched on and `AI_PROVIDER=none`.
- **Route checks:** emergency pause off, an active assignment, the provider not disabled, the assignment still compatible, an active key, a model price and an adapter. Any failure means *fail closed*. There is no fallback to another provider or model.
- **Rotation:** the key is read per request, so new requests use the current active version. A request in flight keeps its provider instance and its original reservation. Tests confirm that after a rotation the next request sends the new key.
- **Emergency pause and disabled providers** apply to every route, including the env one.
- **Known limitation:** the "Available / Coming soon" badges still follow the env configuration. If generation is someday enabled with database keys only, the badges must be updated at the same time (see §10).

## 7. Cost and budget controls (`controls.ts`)

**Storage:** controls live in `platform_settings` (`ai.controls`), shared by all instances and saved with optimistic versioning. An unreadable stored value fails closed (treated as paused).

**Limits:**

- a global daily limit: the effective limit is the **lower** of this and `AI_DAILY_BUDGET_MICROS`;
- a monthly limit;
- a maximum cost per request: refused before reserving anything if the tool's reservation is higher;
- per-provider, per-model and per-tool daily limits;
- disabled providers;
- the emergency pause.

**Enforcement:**

- Limits are checked **inside runTool's existing reservation transaction**, after its budget lock, so concurrent requests can't overspend.
- Reservations now record provider and model, so in-flight requests count toward per-provider and per-model limits.
- A blocked request is recorded as `rejected_budget` with a code (`daily_budget`, `monthly_budget`, `provider_budget`, `model_budget`, `tool_budget`) and a plain reason, and nothing is sent.
- Existing allowances, the env budget, the burst limit and the single retry are unchanged. No new automatic retries were added.

**Usage view:** reads the existing `ai_usage_events` (metadata only). Costs are SociVanta's **estimates** from recorded tokens and configured prices, or the reservation ceiling when a provider didn't report usage. The UI says so; no provider billing data is imported, and there are no projections.

## 8. Security

| Action | Permission | Re-auth |
|---|---|---|
| View | Settings: View | no |
| Models, drafts, checks, disabling an assignment, emergency **pause** | Settings: Manage | no |
| Save, test, activate or disable keys; activate an assignment; save limits; **resume** AI | **Security settings** (owner-only by default; grant to other roles explicitly) | **yes** |

All routes need an MFA-complete session, roles are re-checked in the database on every request, mutations are same-origin, input uses strict schemas, key tests are rate-limited, and every change is written to `audit_log`.

## 9. Exact test results

| Check | Result |
|---|---|
| Typecheck, ESLint (whole project, 0 problems), production build | Pass |
| New integration tests (`tests/integration/ai-control.test.ts`, scratch database, fetch mocks) | **14 / 14** |
| Existing AI suites (AI-01 to AI-09) after the `runTool` change | Pass (234 / 234 in the targeted run) |
| Migration test (64 tables, 13 migrations, 0012 rollback step) | Pass |
| Full Vitest | **458 / 458** |
| Browser QA (Edge, production build, scratch database, no provider contacted) | **35 / 35** |

**What the integration tests cover:**

- **Access control:** support, admin, owner and re-auth rules; pause versus resume; origin checks.
- **Credentials:**
  - encryption, write-only responses, masked hints, immutability (SV001), validation;
  - documented headers per provider and failure classification (401, 403, 429, 503, network, no free check);
  - discovery records unverified models;
  - billable tests need confirmation, a model and an adapter;
  - atomic rotation, a failed key never replaces the working one, one active key under concurrency, disabling fails closed.
- **Models:** no assumed capabilities; prices need a source.
- **Assignments:** compatibility reasons, cost ceiling, output limit, an active key required, unassignable tools refused, the database CHECK.
- **Generation:** stays off without the launch switch, even with an active assignment (no provider call). With the switch on in a test environment, a run uses the assignment and records provider, model, tokens and cost. Rotation is picked up by the next request.
- **Budgets:** tool, monthly and maximum-per-request limits block before any provider call; stale versions are refused.
- **Fail-closed paths:** disabled provider, disabled key, disabled assignment and the emergency pause (including the env route) all fail closed with no fallback.
- **Adapters:** Gemini and OpenAI-compatible request shapes and token accounting; pending providers have no adapter.

**What the browser QA covers:**

- support denied; admin can view but not manage keys; noindex;
- honest overview and provider states; existing diagnostics kept; no key material in the page;
- keyboard tabs;
- key list, rotation with confirmation (old key retired), saving a key (not activated, never shown again), billable test gated;
- models from all three sources with search; verifying needs the structured-output answer;
- assignment reasons; usage labelled as estimates;
- limits saved; emergency pause and resume; audit history;
- no horizontal overflow at 320 to 1440px in light and dark (dark with reduced motion);
- no requests to any external provider host;
- no console errors.

**Issue found and fixed:** the Overview's provider grid overflowed at 320px. It now uses an explicit single column with `min-w-0`.

## 10. Limitations and activation procedure

**Limitations:**

- Adapters for Mistral, Cohere, Azure, Bedrock, Vertex and custom endpoints are pending.
- Provider-reported billing isn't imported; costs are estimates.
- The OpenAI and Gemini model libraries are empty until a key test discovers models or an admin adds them. Their capabilities and prices must then be recorded from the official docs.
- Availability badges follow the env path (§6).
- The live fixture run per tool isn't offered (§5).

**To activate a provider (each step needs explicit approval):**

1. Re-check the provider's catalog entry against its current API docs.
2. Owner: **Save** a real key, then **Test (free)**. The billable test is optional and explicitly confirmed.
3. In **Models**, record the chosen model's structured-output support, limits and a sourced price, and mark it **Verified**.
4. Set **Budgets**: daily, monthly and maximum per request, plus a per-tool limit for the pilot tool.
5. **Activate** the key, then save and check a draft assignment, then **Activate** it for one tool.
6. Make the code change that lets availability badges reflect database routes. Then, with approval, set `AI_GENERATION_ENABLED=true` (with `AI_PROVIDER=none` so the Control Center route is used) after a supervised live test, and watch **Usage & Costs** daily.

**Database:** migration `0012_ai_control` (3 tables plus 1 trigger, rollback included) is applied to `socivanta_dev` and `socivanta_dev_utf8`. No Git, nothing deployed, and no real key configured.
