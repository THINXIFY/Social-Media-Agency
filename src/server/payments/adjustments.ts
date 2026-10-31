import "server-only";
import { z } from "zod";
import { AppError, errors } from "../errors";

/**
 * Refunds and manual wallet adjustments — prepared, validated and permission-
 * checked, but switched off (Phase 5D scope boundary).
 *
 * The rules they will follow once their evidence, approval and reconciliation
 * procedures are verified:
 *  - every request references the original transaction (order or deposit) and
 *    states a reason; adjustments also cite supporting evidence (a ticket);
 *  - refunds can never exceed what was paid for the order (database trigger
 *    SV004) and are credited back to the customer's wallet, not to a card;
 *  - adjustments need two people: the requester and a different approver, both
 *    with "Adjust wallet balances" and fresh re-authentication; the journal
 *    entry records both (four-eyes CHECK on journal_entries);
 *  - a single adjustment is capped, and a negative adjustment can never take a
 *    wallet below zero (allow_negative = false);
 *  - each posts one immutable ledger entry with an idempotency key; mistakes
 *    are corrected with a reversal entry, never an edit.
 */

export const ADJUSTMENT_LIMIT_CENTS = 50_000;
export const REFUNDS_ENABLED = false as boolean;
export const ADJUSTMENTS_ENABLED = false as boolean;

export const refundRequestSchema = z
  .object({
    orderRef: z.string().regex(/^ORD-[A-Z0-9]{4,20}$/, "Enter the original order reference."),
    amountCents: z.number().int().positive(),
    reason: z.string().trim().min(20, "Explain the refund in at least 20 characters.").max(500),
  })
  .strict();

export const adjustmentRequestSchema = z
  .object({
    customerRef: z.string().regex(/^CUS-[A-Z0-9]{1,20}$/, "Enter the customer reference."),
    amountCents: z
      .number()
      .int()
      .refine((v) => v !== 0, "An adjustment can't be zero.")
      .refine((v) => Math.abs(v) <= ADJUSTMENT_LIMIT_CENTS, `A single adjustment is limited to $${ADJUSTMENT_LIMIT_CENTS / 100}.`),
    reason: z.string().trim().min(20, "Explain the adjustment in at least 20 characters.").max(500),
    evidenceRef: z.string().regex(/^(TCK|DEP|ORD)-[A-Z0-9]{4,20}$/, "Reference the ticket, deposit or order that supports this."),
  })
  .strict();

/** Validates the request (so the rules are exercised and tested) and then refuses: refunds aren't enabled. */
export function requestRefund(raw: unknown) {
  refundRequestSchema.parse(raw);
  if (!REFUNDS_ENABLED) throw errors.featureDisabled("Refunds");
  throw new AppError("FEATURE_DISABLED", "Refunds aren't implemented yet.");
}

/** Validates the request and then refuses: manual adjustments aren't enabled. */
export function requestAdjustment(raw: unknown) {
  adjustmentRequestSchema.parse(raw);
  if (!ADJUSTMENTS_ENABLED) throw errors.featureDisabled("Wallet adjustments");
  throw new AppError("FEATURE_DISABLED", "Wallet adjustments aren't implemented yet.");
}
