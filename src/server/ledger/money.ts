import "server-only";
import { AppError } from "../errors";

/**
 * Money is integer USD cents everywhere on the server. Per-unit rates are
 * micro-dollars (1e-6 USD) because per-1,000 prices can be fractions of a cent.
 * Totals are rounded once, half-up, to cents.
 */

export const MAX_CENTS = 100_000_000_00; // $100M — far above any single movement; catches unit mistakes.

export function assertCents(n: number, label = "amount"): number {
  if (!Number.isSafeInteger(n)) throw new AppError("VALIDATION_FAILED", `The ${label} must be a whole number of cents.`);
  if (Math.abs(n) > MAX_CENTS) throw new AppError("VALIDATION_FAILED", `The ${label} is out of range.`);
  return n;
}

/** Half-up division of non-negative bigints. */
const divRound = (num: bigint, den: bigint) => (num + den / BigInt(2)) / den;

export type PricingModel = "per1000" | "unit" | "fixed" | "fee";

/** Order total in cents from a rate in micro-dollars, computed exactly with BigInt. */
export function orderTotalCents(model: PricingModel, priceMicros: number, quantity: number): number {
  if (!Number.isSafeInteger(priceMicros) || priceMicros <= 0) throw new AppError("VALIDATION_FAILED", "The price isn't valid.");
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new AppError("VALIDATION_FAILED", "The quantity isn't valid.");
  const micros = BigInt(priceMicros);
  const q = BigInt(quantity);
  const totalMicros = model === "per1000" ? divRound(micros * q, BigInt(1000)) : model === "unit" ? micros * q : micros;
  const cents = Number(divRound(totalMicros, BigInt(10_000)));
  return assertCents(Math.max(cents, 1), "total");
}

export const formatUsd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
