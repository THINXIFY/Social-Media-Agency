import "server-only";
import { type Executor } from "../db/client";
import { ledgerAccounts } from "../db/schema";
import type { LEDGER_ACCOUNT_TYPE } from "../db/schema/enums";

type AccountType = (typeof LEDGER_ACCOUNT_TYPE)[number];

/**
 * Platform accounts (DATABASE.md §6.1). Customer funds (wallets), revenue,
 * refunds and provider costs are always separate accounts.
 */
export const SYSTEM_ACCOUNTS: { code: string; type: AccountType; purpose: string }[] = [
  { code: "orders_in_progress", type: "liability", purpose: "Paid for orders not yet delivered (deferred revenue)" },
  { code: "revenue:orders", type: "revenue", purpose: "Recognised order revenue" },
  { code: "refunds", type: "contra_revenue", purpose: "Refunds against recognised revenue" },
  { code: "referral_rewards", type: "expense", purpose: "Referral rewards paid" },
  { code: "provider_costs", type: "expense", purpose: "Cost of fulfilment" },
  { code: "manual_adjustments", type: "expense", purpose: "Staff wallet adjustments" },
];

export const walletCode = (customerId: string) => `wallet:${customerId.toLowerCase()}`;
export const processorClearingCode = (processor: string) => `processor_clearing:${processor}`;
export const providerPayableCode = (providerId: string) => `provider_payable:${providerId}`;

/** Idempotent: creates the platform accounts that don't exist yet. */
export async function ensureSystemAccounts(db: Executor) {
  await db
    .insert(ledgerAccounts)
    .values(SYSTEM_ACCOUNTS.map((a) => ({ code: a.code, type: a.type, isSystem: true, allowNegative: true })))
    .onConflictDoNothing({ target: ledgerAccounts.code });
}

/** Idempotent: a customer's wallet — a liability that can never go negative. */
export async function openWallet(db: Executor, customerId: string) {
  await db.insert(ledgerAccounts).values({ code: walletCode(customerId), type: "liability", customerId, allowNegative: false }).onConflictDoNothing({ target: ledgerAccounts.code });
  return walletCode(customerId);
}

/** Idempotent: an asset account for money held at a payment processor. */
export async function openClearingAccount(db: Executor, processor: string) {
  const code = processorClearingCode(processor);
  await db.insert(ledgerAccounts).values({ code, type: "asset", isSystem: true, allowNegative: true }).onConflictDoNothing({ target: ledgerAccounts.code });
  return code;
}
