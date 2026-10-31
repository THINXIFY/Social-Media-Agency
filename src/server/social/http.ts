import "server-only";

/**
 * Outbound HTTP for social platform APIs (AI-06). Bounded: at most
 * MAX_RETRIES retries, only for rate limits and transient server errors,
 * with a capped backoff that honours Retry-After. Errors carry a category
 * and HTTP status only — never the response body, the URL's query string or
 * any token — so they're safe to log and to map to customer messages.
 */

export type ProviderErrorKind = "rate_limited" | "unauthorized" | "forbidden" | "unavailable" | "bad_response" | "no_accounts";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status: number | null;
  /** Seconds the platform asked us to wait (rate limits only). */
  readonly retryAfter: number | null;
  constructor(kind: ProviderErrorKind, opts: { status?: number | null; retryAfter?: number | null } = {}) {
    super(`social provider request failed: ${kind}${opts.status ? ` (${opts.status})` : ""}`);
    this.name = "ProviderError";
    this.kind = kind;
    this.status = opts.status ?? null;
    this.retryAfter = opts.retryAfter ?? null;
  }
}

export const MAX_RETRIES = 2;
/** Never wait longer than this inside one request; longer Retry-After values fail fast as rate_limited. */
export const MAX_WAIT_MS = 4_000;
export const ATTEMPT_TIMEOUT_MS = 10_000;

export interface HttpDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

export const defaultHttp = (): HttpDeps => ({ fetch: globalThis.fetch.bind(globalThis), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

function retryAfterSeconds(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const n = Number(raw);
  if (Number.isFinite(n)) return Math.max(0, n);
  const at = Date.parse(raw);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

function classify(status: number, retryAfter: number | null): ProviderError {
  if (status === 429) return new ProviderError("rate_limited", { status, retryAfter });
  if (status === 401) return new ProviderError("unauthorized", { status });
  // OAuth token endpoints answer invalid_grant (expired/revoked code or refresh token) with 400.
  if (status === 400) return new ProviderError("unauthorized", { status });
  if (status === 403) return new ProviderError("forbidden", { status });
  if (status >= 500) return new ProviderError("unavailable", { status });
  return new ProviderError("bad_response", { status });
}

/** Requests JSON with bounded retries. Throws ProviderError on any failure. */
export async function requestJson<T = Record<string, unknown>>(deps: HttpDeps, url: string, init: RequestInit = {}, opts: { retries?: number } = {}): Promise<T> {
  // Publishing passes retries: 0 — a repeated POST could publish twice.
  const maxRetries = opts.retries ?? MAX_RETRIES;
  let attempt = 0;
  for (;;) {
    let res: Response;
    try {
      res = await deps.fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS), headers: { accept: "application/json", ...(init.headers ?? {}) } });
    } catch {
      if (attempt < maxRetries) {
        await deps.sleep(backoff(attempt));
        attempt++;
        continue;
      }
      throw new ProviderError("unavailable");
    }
    if (res.ok) {
      try {
        return (await res.json()) as T;
      } catch {
        throw new ProviderError("bad_response", { status: res.status });
      }
    }
    const after = retryAfterSeconds(res);
    // Drain the body without reading it into errors or logs.
    await res.body?.cancel().catch(() => {});
    if (RETRYABLE.has(res.status) && attempt < maxRetries) {
      const wait = after !== null ? after * 1000 : backoff(attempt);
      if (wait <= MAX_WAIT_MS) {
        await deps.sleep(wait);
        attempt++;
        continue;
      }
    }
    throw classify(res.status, after);
  }
}

const backoff = (attempt: number) => Math.min(MAX_WAIT_MS, 500 * 2 ** attempt);

/** application/x-www-form-urlencoded body. */
export const form = (fields: Record<string, string | undefined>) => {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) body.set(k, v);
  return body;
};
