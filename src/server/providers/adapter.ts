import "server-only";
import { z } from "zod";
import { hit } from "../auth/rate-limit";
import type { Executor } from "../db/client";

/*
 * Provider adapter contract (Phase 5F).
 *
 * One small interface every future, approved integration implements. The
 * platform never talks to a provider directly: calls go through `callProvider`,
 * which applies a per-provider rate limit, a timeout, retries for read-only
 * calls only, response validation and error classification.
 *
 * No real integration is installed in this phase (see ./registry.ts).
 */

export interface AdapterCapabilities {
  /** Accepts new orders. */
  submit: boolean;
  /** Reports an order's progress by the provider's order id. */
  status: boolean;
  /** Finds an order by our idempotency key: the only safe way to settle an uncertain submission. */
  lookupByKey: boolean;
  /** Reports the account balance in health checks. */
  balance: boolean;
}

export interface AdapterContext {
  /** Decrypted credential, or null when none is configured. Never log or return it. */
  credential: string | null;
  endpoint: string | null;
  signal: AbortSignal;
}

export const submitRequestSchema = z.strictObject({
  idempotencyKey: z.string().regex(/^ful_[a-z0-9]{24,64}$/),
  providerServiceRef: z.string().min(1).max(120),
  link: z.string().max(500),
  quantity: z.number().int().positive().max(100_000_000),
});
export type SubmitRequest = z.infer<typeof submitRequestSchema>;

export const providerOrderSchema = z.object({
  providerOrderId: z.string().trim().min(1).max(120),
  /** The provider's own status wording, normalised by `normalizeStatus`. */
  status: z.string().trim().max(60),
  /** Units the provider says it delivered so far, if it reports them. */
  delivered: z.number().int().min(0).max(100_000_000).nullable().optional(),
});
export type ProviderOrder = z.infer<typeof providerOrderSchema>;

export const healthSchema = z.object({ ok: z.boolean(), balanceCents: z.number().int().nullable().optional(), message: z.string().max(300).optional() });

export interface ProviderAdapter {
  id: string;
  name: string;
  capabilities: AdapterCapabilities;
  /** Whether a credential must be configured before any call. */
  needsCredential: boolean;
  health(ctx: AdapterContext): Promise<unknown>;
  submit?(req: SubmitRequest, ctx: AdapterContext): Promise<unknown>;
  status?(providerOrderId: string, ctx: AdapterContext): Promise<unknown>;
  /** Returns null when the provider has no order for the key. */
  lookup?(idempotencyKey: string, ctx: AdapterContext): Promise<unknown>;
}

/**
 * How a failed call is classified.
 *  - rejected:    the provider definitely refused; nothing was created. Safe to record as failed.
 *  - unavailable: the provider definitely didn't process it (429/503 before acceptance). Safe to try later.
 *  - unknown:     we can't tell whether it was processed (timeout, dropped connection, unreadable reply).
 *                 A submission in this state is never retried blindly; it must be reconciled.
 */
export type ProviderErrorKind = "rejected" | "unavailable" | "unknown" | "not_configured" | "rate_limited";

export class ProviderCallError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    /** A short machine code for logs and history (e.g. "timeout", "http_503"); never the provider's raw text. */
    readonly code: string = kind,
  ) {
    super(message);
  }
}

/** Plain-language messages for staff. Provider wording is never shown raw. */
export const ERROR_MESSAGE: Record<ProviderErrorKind, string> = {
  rejected: "The provider refused the request. Nothing was created there.",
  unavailable: "The provider wasn't available. Nothing was processed; it can be tried again later.",
  unknown: "We couldn't confirm what happened at the provider. Check the provider before doing anything else.",
  not_configured: "This provider isn't fully set up yet.",
  rate_limited: "Too many requests to this provider just now. Nothing was sent; try again in a minute.",
};

/** Common SMM-panel status wording → our fulfilment statuses. Unrecognised wording returns null (left for a person). */
export function normalizeStatus(raw: string): "submitted" | "in_progress" | "partial" | "completed" | "cancelled" | null {
  const s = raw.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (["pending", "queued", "awaiting", "accepted", "new"].includes(s)) return "submitted";
  if (["in progress", "processing", "active", "running", "started"].includes(s)) return "in_progress";
  if (["partial", "partially completed", "partially delivered"].includes(s)) return "partial";
  if (["completed", "complete", "done", "delivered", "success"].includes(s)) return "completed";
  if (["canceled", "cancelled", "refunded", "rejected", "failed", "error"].includes(s)) return "cancelled";
  return null;
}

export const RATE_LIMIT = { limit: 60, windowSeconds: 60 };
export const DEFAULT_TIMEOUT_MS = 10_000;

export interface CallOptions {
  db: Executor;
  providerId: string;
  adapter: ProviderAdapter;
  credential: string | null;
  endpoint: string | null;
  /** Read-only calls (health, status, lookup) may be retried; a submission never is. */
  readOnly: boolean;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

/** Runs one adapter call with the platform's guardrails; the result is validated by `schema`. */
export async function callProvider<T>(opts: CallOptions, run: (ctx: AdapterContext) => Promise<unknown>, schema: z.ZodType<T>): Promise<T> {
  if (opts.adapter.needsCredential && !opts.credential) throw new ProviderCallError("not_configured", "No credential is configured for this provider.");
  const retries = opts.readOnly ? Math.max(0, Math.min(3, opts.retries ?? 2)) : 0;
  for (let attempt = 0; ; attempt++) {
    const limited = await hit(opts.db, "provider-call", opts.providerId, RATE_LIMIT);
    if (!limited.ok) throw new ProviderCallError("rate_limited", ERROR_MESSAGE.rate_limited);
    try {
      return await once(opts, run, schema);
    } catch (e) {
      const err = classify(e);
      const retryable = err.kind === "unavailable" || (opts.readOnly && err.kind === "unknown");
      if (!retryable || attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, (opts.backoffMs ?? 500) * 2 ** attempt));
    }
  }
}

async function once<T>(opts: CallOptions, run: (ctx: AdapterContext) => Promise<unknown>, schema: z.ZodType<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ProviderCallError("unknown", "The provider didn't answer in time.", "timeout"));
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  });
  try {
    const raw = await Promise.race([run({ credential: opts.credential, endpoint: opts.endpoint, signal: controller.signal }), timeout]);
    const parsed = schema.safeParse(raw);
    // A reply we can't read may still mean the provider acted, so it's "unknown", not "rejected".
    if (!parsed.success) throw new ProviderCallError("unknown", "The provider's reply couldn't be read.", "invalid_response");
    return parsed.data;
  } finally {
    clearTimeout(timer);
  }
}

function classify(e: unknown): ProviderCallError {
  if (e instanceof ProviderCallError) return e;
  return new ProviderCallError("unknown", "The provider call failed unexpectedly.", "network");
}
