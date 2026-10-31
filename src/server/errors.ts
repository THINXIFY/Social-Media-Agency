import "server-only";

/**
 * One error type for the whole backend. Services throw AppError; the HTTP and
 * action layers turn it into a safe response. Internal details (SQL, stack,
 * values) never reach the client.
 */

export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  MFA_REQUIRED: 401,
  EMAIL_UNVERIFIED: 403,
  REAUTH_REQUIRED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  INSUFFICIENT_FUNDS: 409,
  LEDGER_INVARIANT: 409,
  FEATURE_DISABLED: 503,
  SERVICE_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Safe to show to the user. */
  readonly publicMessage: string;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, publicMessage: string, options: { details?: Record<string, unknown>; cause?: unknown } = {}) {
    super(publicMessage, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.publicMessage = publicMessage;
    this.details = options.details;
  }
}

export const errors = {
  unauthenticated: () => new AppError("UNAUTHENTICATED", "Sign in to continue."),
  forbidden: (what = "do this") => new AppError("FORBIDDEN", `You don't have permission to ${what}.`),
  notFound: (what = "That record") => new AppError("NOT_FOUND", `${what} wasn't found.`),
  conflict: (message: string) => new AppError("CONFLICT", message),
  featureDisabled: (feature: string) => new AppError("FEATURE_DISABLED", `${feature} isn't available yet.`, { details: { feature } }),
  payloadTooLarge: () => new AppError("PAYLOAD_TOO_LARGE", "That request is too large."),
  unavailable: (message = "The service is temporarily unavailable.") => new AppError("SERVICE_UNAVAILABLE", message),
  insufficientFunds: () => new AppError("INSUFFICIENT_FUNDS", "There isn't enough balance for this."),
  idempotencyConflict: () => new AppError("IDEMPOTENCY_CONFLICT", "This request was already made with different details."),
  ledger: (message: string) => new AppError("LEDGER_INVARIANT", message),
};

/** SQLSTATEs raised by our own triggers (drizzle/0001_safeguards.sql). */
const SV_CODES: Record<string, () => AppError> = {
  SV001: () => errors.ledger("Recorded history can't be changed."),
  SV002: () => errors.ledger("Ledger entries must balance."),
  SV003: () => errors.insufficientFunds(),
  SV004: () => errors.conflict("Refunds can't exceed the amount paid."),
  SV005: () => errors.conflict("At least one active owner is required."),
  SV006: () => errors.forbidden("change the owner role"),
  SV007: () => errors.conflict("A second review needs a first review by a different person."),
  SV008: () => errors.ledger("Balances are maintained by the ledger only."),
  SV009: () => errors.featureDisabled("Ordering this service"),
  SV010: () => errors.conflict("This deposit can't change that way."),
  SV011: () => errors.conflict("This order can't change that way."),
  SV012: () => errors.conflict("A mapping can only be active for a fully eligible service on an enabled, reviewed provider."),
  SV013: () => errors.conflict("This fulfilment attempt can't change that way."),
  SV014: () => errors.conflict("Referral rewards aren't enabled. Qualification and reward activation need approved rules first."),
};

/** Walks `cause` chains (Drizzle wraps driver errors) to find a Postgres error. */
export function pgErrorOf(e: unknown): { code: string; constraint?: string; message: string } | null {
  for (let cur: unknown = e, depth = 0; cur && depth < 5; cur = (cur as { cause?: unknown }).cause, depth++) {
    const c = cur as { code?: unknown; constraint?: unknown; message?: unknown };
    if (typeof c.code === "string" && /^[0-9A-Z]{5}$/.test(c.code)) return { code: c.code, constraint: typeof c.constraint === "string" ? c.constraint : undefined, message: String(c.message ?? "") };
  }
  return null;
}

/** Maps database errors to AppErrors; returns null for anything unexpected. */
export function fromDatabaseError(e: unknown): AppError | null {
  const pg = pgErrorOf(e);
  if (!pg) return null;
  if (SV_CODES[pg.code]) return SV_CODES[pg.code]();
  if (pg.code === "23505") return new AppError("CONFLICT", "That already exists.", { details: { constraint: pg.constraint }, cause: e });
  if (pg.code === "23503") return new AppError("CONFLICT", "A related record is missing or still in use.", { details: { constraint: pg.constraint }, cause: e });
  if (pg.code === "23514" || pg.code === "23502" || pg.code === "22P02") return new AppError("VALIDATION_FAILED", "Some details aren't valid.", { details: { constraint: pg.constraint }, cause: e });
  if (pg.code === "40001" || pg.code === "40P01") return new AppError("CONFLICT", "Please try again.", { cause: e });
  return null;
}

export function toAppError(e: unknown): AppError | null {
  if (e instanceof AppError) return e;
  return fromDatabaseError(e);
}
