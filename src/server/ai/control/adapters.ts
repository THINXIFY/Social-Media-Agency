import "server-only";
import { z } from "zod";
import { type ProviderInfo } from "@/lib/ai/provider-catalog";
import type { Env } from "../../env";
import { anthropicProvider } from "../anthropic";
import { costMicros, type Price, worstCaseMicros } from "../pricing";
import { type AiProvider, type AiRequest, type AiResult, ProviderError } from "../types";

/*
 * Provider transports for the Admin AI Control Center.
 *
 *  - Anthropic reuses the existing SDK adapter (AI-02) unchanged.
 *  - OpenAI (native) and every "openai_compatible" provider share one
 *    Chat Completions transport with JSON-schema output.
 *  - Gemini uses generateContent with a JSON response schema.
 *
 * All requests go to the catalog's fixed https base URL with the key passed
 * explicitly; nothing reads ambient environment credentials. No retries here:
 * runTool owns timeouts, cancellation and its single retry. `fetch` is
 * injectable for tests only.
 */

type Fetch = typeof fetch;

function headersFor(info: ProviderInfo, key: string): Record<string, string> {
  const h = info.validation?.header ?? (info.id === "anthropic" ? "x-api-key" : info.id === "gemini" ? "x-goog-api-key" : "bearer");
  if (h === "x-api-key") return { "x-api-key": key, "anthropic-version": "2023-06-01" };
  if (h === "x-goog-api-key") return { "x-goog-api-key": key };
  return { authorization: `Bearer ${key}` };
}

function statusError(status: number): ProviderError {
  if (status === 429) return new ProviderError("rate_limited");
  if (status >= 500) return new ProviderError("outage");
  return new ProviderError("rejected");
}

async function post(f: Fetch, url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal) {
  let res: Response;
  try {
    res = await f(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal });
  } catch (e) {
    if (signal.aborted) throw new ProviderError("timeout", "The request was cancelled.");
    throw new ProviderError("outage", e instanceof Error ? "The AI service couldn't be reached." : undefined);
  }
  if (!res.ok) throw statusError(res.status);
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

const schemaOf = (output: z.ZodType) => z.toJSONSchema(output, { target: "draft-7" }) as Record<string, unknown>;

/** OpenAI Chat Completions, used natively and by documented OpenAI-compatible endpoints. */
export function chatCompletionsProvider(info: ProviderInfo, key: string, model: string, price: Price | null, f: Fetch = fetch): AiProvider {
  return {
    id: info.id,
    worstCaseMicros: (chars, max) => (price ? worstCaseMicros(price, chars, max) : null),
    async generate(req: AiRequest): Promise<AiResult> {
      const body = {
        model,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.input },
        ],
        // OpenAI's current parameter; compatible endpoints document max_tokens.
        ...(info.id === "openai" ? { max_completion_tokens: req.maxOutputTokens } : { max_tokens: req.maxOutputTokens }),
        response_format: { type: "json_schema", json_schema: { name: "result", schema: schemaOf(req.output), strict: false } },
      };
      const json = await post(f, `${info.baseUrl}/chat/completions`, headersFor(info, key), body, req.signal);
      const choice = (json?.choices as { message?: { content?: string | null; refusal?: string | null } }[] | undefined)?.[0];
      if (!choice?.message) throw new ProviderError("outage", "The AI service returned an unreadable reply.");
      if (choice.message.refusal) throw new ProviderError("rejected", "The AI declined this request.");
      const usage = json?.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
      const inputTokens = usage?.prompt_tokens ?? null;
      const outputTokens = usage?.completion_tokens ?? null;
      return { text: choice.message.content ?? "", model: typeof json?.model === "string" ? json.model : model, usage: { inputTokens, outputTokens, costMicros: price && inputTokens !== null && outputTokens !== null ? costMicros(price, inputTokens, outputTokens) : null } };
    },
  };
}

/** Gemini API generateContent with a JSON response schema. */
export function geminiProvider(info: ProviderInfo, key: string, model: string, price: Price | null, f: Fetch = fetch): AiProvider {
  return {
    id: info.id,
    worstCaseMicros: (chars, max) => (price ? worstCaseMicros(price, chars, max) : null),
    async generate(req: AiRequest): Promise<AiResult> {
      const body = {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.input }] }],
        generationConfig: { maxOutputTokens: req.maxOutputTokens, responseMimeType: "application/json", responseJsonSchema: schemaOf(req.output) },
      };
      const json = await post(f, `${info.baseUrl}/models/${encodeURIComponent(model)}:generateContent`, headersFor(info, key), body, req.signal);
      const cand = (json?.candidates as { content?: { parts?: { text?: string }[] }; finishReason?: string }[] | undefined)?.[0];
      if (!cand) throw new ProviderError("rejected", "The AI declined this request.");
      if (cand.finishReason === "SAFETY" || cand.finishReason === "PROHIBITED_CONTENT") throw new ProviderError("rejected", "The AI declined this request.");
      const meta = json?.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } | undefined;
      const inputTokens = meta?.promptTokenCount ?? null;
      // Thinking tokens are billed as output.
      const outputTokens = meta?.candidatesTokenCount !== undefined ? meta.candidatesTokenCount + (meta.thoughtsTokenCount ?? 0) : null;
      return { text: (cand.content?.parts ?? []).map((p) => p.text ?? "").join(""), model, usage: { inputTokens, outputTokens, costMicros: price && inputTokens !== null && outputTokens !== null ? costMicros(price, inputTokens, outputTokens) : null } };
    },
  };
}

/** Builds a generation provider for a catalog entry, or null when no adapter exists. */
export function makeProvider(info: ProviderInfo, key: string, model: string, price: Price | null, env: Env, opts: { fetch?: Fetch } = {}): AiProvider | null {
  if (info.generation === "pending" || !info.baseUrl) return null;
  if (info.id === "anthropic") {
    // The AI-02 adapter reads its key, model and price from an Env-shaped object.
    const scoped = { ...env, AI_PROVIDER: "anthropic", AI_API_KEY: key, AI_MODEL: model, AI_PRICE_INPUT_PER_MTOK: price?.input, AI_PRICE_OUTPUT_PER_MTOK: price?.output } as Env;
    return anthropicProvider(scoped, opts.fetch ? { fetch: opts.fetch } : {});
  }
  if (info.id === "gemini") return geminiProvider(info, key, model, price, opts.fetch);
  return chatCompletionsProvider(info, key, model, price, opts.fetch);
}

/* -------------------------------------------------------------------------- */
/*  Credential testing (non-billed)                                           */
/* -------------------------------------------------------------------------- */

export type TestCode = "ok" | "invalid_key" | "permission" | "not_found" | "rate_limited" | "provider_unavailable" | "network" | "no_free_check";
export const TEST_MESSAGE: Record<TestCode, string> = {
  ok: "The key works.",
  invalid_key: "The provider rejected this key. Check it was copied completely and hasn't been revoked.",
  permission: "The key is valid but isn't allowed to do this. Check its permissions or project in the provider's console.",
  not_found: "The provider's check endpoint wasn't found. The catalog entry may need updating.",
  rate_limited: "The provider is rate-limiting this key right now. Try again in a minute.",
  provider_unavailable: "The provider had a problem answering. Try again later.",
  network: "We couldn't reach the provider (network or timeout).",
  no_free_check: "This provider has no free key check wired up. A test needs a confirmed, billable request.",
};

const MODEL_ID = /^[A-Za-z0-9._:\/@-]{1,120}$/;

export interface FreeTestResult {
  code: TestCode;
  billable: false;
  /** Model ids the provider listed (only from list-model endpoints), with any limits it reported. */
  models: { id: string; name?: string; contextTokens?: number; maxOutputTokens?: number }[];
}

/** Tests a key with the provider's documented non-billed endpoint. Response bodies are never stored. */
export async function freeKeyTest(info: ProviderInfo, key: string, opts: { fetch?: Fetch; timeoutMs?: number } = {}): Promise<FreeTestResult> {
  if (!info.validation || !info.baseUrl) return { code: "no_free_check", billable: false, models: [] };
  const f = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await f(`${info.baseUrl}${info.validation.path}`, { headers: headersFor(info, key), signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) });
  } catch {
    return { code: "network", billable: false, models: [] };
  }
  const code: TestCode = res.ok ? "ok" : res.status === 401 ? "invalid_key" : res.status === 403 ? "permission" : res.status === 404 ? "not_found" : res.status === 429 ? "rate_limited" : res.status >= 500 ? "provider_unavailable" : "invalid_key";
  if (code !== "ok") return { code, billable: false, models: [] };
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { code, billable: false, models: parseModels(info, body) };
}

function parseModels(info: ProviderInfo, body: Record<string, unknown> | null) {
  const out: FreeTestResult["models"] = [];
  const list = (Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : []) as Record<string, unknown>[];
  for (const m of list.slice(0, 500)) {
    // Gemini lists "models/<id>"; others use "id" (OpenAI style) or "name".
    const raw = typeof m.id === "string" ? m.id : typeof m.name === "string" ? m.name : null;
    const id = raw && info.id === "gemini" ? raw.replace(/^models\//, "") : raw;
    if (!id || !MODEL_ID.test(id)) continue;
    const name = typeof m.display_name === "string" ? m.display_name : typeof m.displayName === "string" ? m.displayName : undefined;
    const ctx = typeof m.inputTokenLimit === "number" ? m.inputTokenLimit : typeof m.context_length === "number" ? m.context_length : undefined;
    const outTok = typeof m.outputTokenLimit === "number" ? m.outputTokenLimit : undefined;
    out.push({ id, name: name?.slice(0, 120), contextTokens: ctx, maxOutputTokens: outTok });
  }
  return out;
}
