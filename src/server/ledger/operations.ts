import "server-only";
import { requireCustomer, requireStaff } from "../auth";
import { AppError, errors } from "../errors";

/**
 * Money-moving operations exposed to the rest of the app. Every one fails
 * closed in Phase 5A: it requires an authenticated actor with the right
 * permission AND the financial-operations switch, which is hard-wired off until
 * Phase 5D/5E (processors, reviews and reconciliation) are in place.
 *
 * Do not flip this switch with an environment variable; enabling money
 * movement is a code change that goes through review.
 */
export const FINANCIAL_OPERATIONS_ENABLED = false as boolean;

async function gate(feature: string, authorise: () => Promise<unknown>, target: Record<string, unknown>): Promise<never> {
  if (!FINANCIAL_OPERATIONS_ENABLED) throw errors.featureDisabled(feature);
  await authorise();
  // Reached only once the switch is on but the operation hasn't been built.
  throw new AppError("FEATURE_DISABLED", `${feature} isn't implemented yet.`, { details: { feature, ...target } });
}

/**
 * Processor-driven deposit credits stay off until an approved processor and
 * its signed webhooks exist. Bank transfers are credited only through
 * `verifyAndCredit` (payments/deposits.ts) after two-person staff review.
 */
export const creditDeposit = (depositId: string) => gate("Crediting deposits", () => requireStaff("approveDeposits"), { depositId });

export const chargeOrder = (orderId: string) => gate("Checkout", () => requireCustomer(), { orderId });

export const refundOrder = (orderId: string, amountCents: number) => gate("Refunds", () => requireStaff("issueRefunds"), { orderId, amountCents });

export const adjustWallet = (customerId: string, amountCents: number, reason: string) => gate("Wallet adjustments", () => requireStaff("adjustWallets"), { customerId, amountCents, reason });
