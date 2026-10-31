import "server-only";
import { type Env, getEnv } from "../env";
import { anthropicProvider } from "./anthropic";
import { priceFor } from "./pricing";
import type { AiProvider } from "./types";

/**
 * AI provider abstraction. Tools talk to this interface, never to a vendor
 * SDK, so models can change without touching tool code.
 *
 * Generation needs every gate to pass: a provider with a built adapter, its
 * key and model, a known price, a daily budget above zero — and the launch
 * switch (AI_GENERATION_ENABLED), which an operator turns on only after a
 * successful live test. Credentials are read on the server only.
 */

export { type AiProvider, type AiRequest, type AiResult, ProviderError, type ProviderErrorKind } from "./types";

export type ProviderStatus = { ok: true; provider: AiProvider } | { ok: false; reason: string };

/** Implemented adapters. Each is covered by mock-based tests; live use needs AI_GENERATION_ENABLED. */
const ADAPTERS: Partial<Record<Exclude<Env["AI_PROVIDER"], "none">, (env: Env) => AiProvider>> = {
  anthropic: anthropicProvider,
};

/** Whether the configured provider could be called (the live-test script uses this). Fails closed on any doubt. */
export function providerStatus(env: Env | null = safeEnv()): ProviderStatus {
  if (!env) return { ok: false, reason: "Server configuration is invalid." };
  if (env.AI_PROVIDER === "none") return { ok: false, reason: "No AI provider is configured." };
  if (!env.AI_API_KEY || !env.AI_MODEL) return { ok: false, reason: "The AI provider is missing credentials." };
  if (env.AI_DAILY_BUDGET_MICROS <= 0) return { ok: false, reason: "No AI budget is set." };
  const make = ADAPTERS[env.AI_PROVIDER];
  if (!make) return { ok: false, reason: "The AI provider integration isn't built yet." };
  if (!priceFor(env)) return { ok: false, reason: "No price is known for the configured model; set AI_PRICE_INPUT_PER_MTOK and AI_PRICE_OUTPUT_PER_MTOK." };
  return { ok: true, provider: make(env) };
}

/** Whether customers may generate right now: the provider is ready and the launch switch is on. */
export function generationStatus(env: Env | null = safeEnv()): ProviderStatus {
  const status = providerStatus(env);
  if (!status.ok) return status;
  if (!env?.AI_GENERATION_ENABLED) return { ok: false, reason: "Generation is switched off until the live provider test passes (AI_GENERATION_ENABLED)." };
  return status;
}

function safeEnv(): Env | null {
  try {
    return getEnv();
  } catch {
    return null;
  }
}
