/**
 * Shapes of the signed-in customer's real records as the browser receives
 * them (Phase 5C). Everything here comes from the database; nothing is
 * illustrative. Money is integer cents.
 */

import type { CurrencyCode } from "./i18n/config";
import type { DateFormat } from "./i18n";

export interface LiveProfile {
  accountRef: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  country: string;
  accountType: "personal" | "business";
  businessName: string;
  website: string;
  createdAt: string;
}

export interface LiveWallet {
  currency: "USD";
  /** Spendable balance derived from ledger entries. */
  availableCents: number;
  /** Deposits awaiting review; not spendable. */
  pendingCents: number;
  hasWallet: boolean;
}

export interface LivePreferences {
  language: string;
  displayCurrency: CurrencyCode;
  timezone: string;
  dateFormat: DateFormat;
  reduceMotion: boolean;
}

export interface LiveAccountSnapshot {
  profile: LiveProfile;
  wallet: LiveWallet;
  preferences: LivePreferences;
  orderCount: number;
}

export interface WalletEntry {
  id: string;
  label: string;
  /** From the customer's point of view: positive adds to the balance. */
  amountCents: number;
  at: string;
}

/** An error returned by one of our JSON APIs. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Same-origin JSON request. Non-2xx responses throw ApiError with the
 * server's safe message; network failures throw ApiError(0). Callers show
 * the error — there is never a fallback to sample data.
 */
export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "NETWORK", "We couldn't reach SociVanta. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; field?: string } } | null;
  if (!res.ok) {
    const e = body?.error;
    throw new ApiError(res.status, e?.code ?? "INTERNAL", e?.message ?? "Something went wrong. Please try again.", e?.field);
  }
  return body as T;
}
