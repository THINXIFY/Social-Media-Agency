import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Env } from "../env";
import { costMicros, priceFor, worstCaseMicros } from "./pricing";
import { type AiProvider, type AiRequest, type AiResult, ProviderError } from "./types";

/**
 * Anthropic adapter (AI-02), through the official SDK.
 *
 * - Structured outputs: the answer is constrained to the tool's JSON schema
 *   (`output_config.format`); the pipeline still re-validates it.
 * - Effort "low": short-form copy doesn't need deep reasoning, and lower
 *   effort keeps latency and token spend down. Thinking (when the model uses
 *   it) counts inside max_tokens, so the cost ceiling stays a hard bound.
 * - No SDK retries: the pipeline owns timeouts, cancellation and its single
 *   retry, so attempts are counted in one place.
 * - No server-side refusal fallbacks: a fallback bills another model outside
 *   the per-request cost reservation. A refusal is reported as "rejected".
 *
 * The key and endpoint are always passed explicitly, so ambient variables
 * (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL, SDK profiles)
 * can never redirect requests or swap credentials. `fetch` is injectable for tests only.
 */
export function anthropicProvider(env: Env, options: { fetch?: typeof fetch } = {}): AiProvider {
  const model = env.AI_MODEL!;
  const price = priceFor(env);
  const client = new Anthropic({ apiKey: env.AI_API_KEY, baseURL: "https://api.anthropic.com", maxRetries: 0, ...(options.fetch ? { fetch: options.fetch } : {}) });

  return {
    id: "anthropic",
    worstCaseMicros: (inputChars, maxOutputTokens) => (price ? worstCaseMicros(price, inputChars, maxOutputTokens) : null),
    async generate(req: AiRequest): Promise<AiResult> {
      let message: Anthropic.Message;
      try {
        message = await client.messages.create(
          {
            model,
            max_tokens: req.maxOutputTokens,
            system: req.system,
            messages: [{ role: "user", content: req.input }],
            output_config: { effort: "low", format: zodOutputFormat(req.output) },
          },
          { signal: req.signal },
        );
      } catch (e) {
        throw toProviderError(e);
      }

      const inputTokens = message.usage.input_tokens + (message.usage.cache_creation_input_tokens ?? 0) + (message.usage.cache_read_input_tokens ?? 0);
      const outputTokens = message.usage.output_tokens;
      const usage = { inputTokens, outputTokens, costMicros: price ? costMicros(price, inputTokens, outputTokens) : null };
      if (message.stop_reason === "refusal") throw new ProviderError("rejected", "The AI declined this request.");
      // A max_tokens stop leaves truncated JSON; the pipeline rejects it as invalid output and still counts its cost.
      const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { text, model: message.model, usage };
    },
  };
}

/** Maps SDK errors to the pipeline's provider error kinds (most specific first). */
export function toProviderError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  if (e instanceof Anthropic.APIUserAbortError) return new ProviderError("timeout", "The request was cancelled.");
  if (e instanceof Anthropic.RateLimitError) return new ProviderError("rate_limited");
  if (e instanceof Anthropic.InternalServerError) return new ProviderError("outage"); // 5xx, including 529 overloaded
  if (e instanceof Anthropic.APIConnectionError) return new ProviderError("outage"); // network failures and SDK timeouts
  if (e instanceof Anthropic.APIError) return new ProviderError("rejected"); // 400/401/403/404/413 — retrying won't help
  return new ProviderError("outage");
}
