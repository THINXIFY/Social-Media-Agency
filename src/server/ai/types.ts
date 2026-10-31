import "server-only";
import type { z } from "zod";

/** Shared provider types, kept separate so adapters and the registry of adapters don't import each other. */

export interface AiRequest {
  /** Fixed instructions owned by the tool (never user-controlled). */
  system: string;
  /** The user's (redacted) input, clearly delimited by the tool. */
  input: string;
  /** The JSON shape the answer must take (enforced by the provider where supported, always re-validated). */
  output: z.ZodType;
  maxOutputTokens: number;
  signal: AbortSignal;
}

export interface AiResult {
  text: string;
  model: string;
  usage: { inputTokens: number | null; outputTokens: number | null; costMicros: number | null };
}

export type ProviderErrorKind = "timeout" | "outage" | "rate_limited" | "rejected";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message = "The AI service couldn't complete the request.",
  ) {
    super(message);
    this.name = "ProviderError";
  }
  /** Only transient failures are retried, once. */
  get retryable() {
    return this.kind === "outage" || this.kind === "rate_limited";
  }
}

export interface AiProvider {
  id: string;
  generate(req: AiRequest): Promise<AiResult>;
  /** Most one call could cost, in micro-dollars, or null when unknown. */
  worstCaseMicros?(inputChars: number, maxOutputTokens: number): number | null;
}
