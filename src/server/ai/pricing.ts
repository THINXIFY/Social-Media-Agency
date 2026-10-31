import "server-only";
import type { Env } from "../env";

/**
 * Model pricing for cost accounting and the per-request cost ceiling (AI-02).
 * Prices are USD per million tokens, which is the same number as
 * micro-dollars per token. A model with no known price can't be used: the
 * budget can only protect spending it can measure.
 *
 * Anthropic first-party list prices (checked 2026-10). Update when they change.
 */
export const ANTHROPIC_PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

export interface Price {
  input: number;
  output: number;
}

export function priceFor(env: Env): Price | null {
  if (env.AI_PRICE_INPUT_PER_MTOK !== undefined && env.AI_PRICE_OUTPUT_PER_MTOK !== undefined) return { input: env.AI_PRICE_INPUT_PER_MTOK, output: env.AI_PRICE_OUTPUT_PER_MTOK };
  if (env.AI_PROVIDER === "anthropic" && env.AI_MODEL) return ANTHROPIC_PRICES[env.AI_MODEL] ?? null;
  return null;
}

export const costMicros = (p: Price, inputTokens: number, outputTokens: number) => Math.ceil(inputTokens * p.input + outputTokens * p.output);

/**
 * Worst case for one call: a generous input estimate (2 characters per token,
 * which over-counts English) plus every output token allowed. Thinking tokens
 * are billed as output and are included in max_tokens, so this is a hard bound.
 */
export const worstCaseMicros = (p: Price, inputChars: number, maxOutputTokens: number) => costMicros(p, Math.ceil(inputChars / 2), maxOutputTokens);
