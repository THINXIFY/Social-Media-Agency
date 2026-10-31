import "server-only";
import { type BankInstructions, DEPOSIT_LIMITS_CENTS, type DepositMethodId, type MethodReadiness } from "@/lib/deposits";
import { type Env, getEnv } from "../env";

/**
 * The server-side payment-method registry: the single source of truth for
 * what customers can use and what staff can verify.
 *
 * - Bank transfer is the only method Sociotix can operate without a
 *   third-party processor. It becomes available only when the operator turns
 *   it on and supplies the business's real receiving account (env), and it is
 *   verified by staff against the bank's own statement, by two people.
 * - Crypto, card and PayPal need an approved processor (OPEN_DECISIONS D3)
 *   and an integration that doesn't exist yet. They are never "configured",
 *   whatever the environment says: there is no adapter to verify settlement,
 *   so no address, rate or confirmation is ever produced for them.
 */

/** Processor key stored on each deposit (and used for clearing accounts and payment references). */
export const PROCESSOR: Record<DepositMethodId, string> = {
  bank: "bank_transfer",
  crypto: "crypto_processor",
  card: "card_processor",
  paypal: "paypal",
};

/** Bank requests stay open a week: transfers can take several business days. */
const BANK_EXPIRY_HOURS = 24 * 7;

const NO_PROCESSOR = "No payment processor has been approved for Sociotix's business model yet (decision D3), and no integration is built.";

function bankConfigured(env: Env) {
  return Boolean(env.PAYMENTS_BANK_ENABLED && env.PAYMENTS_BANK_ACCOUNT_NAME && env.PAYMENTS_BANK_NAME && env.PAYMENTS_BANK_ACCOUNT);
}

export function methodReadiness(env: Env | null = safeEnv()): MethodReadiness[] {
  const bank = env ? bankConfigured(env) : false;
  const limits = { minCents: DEPOSIT_LIMITS_CENTS.min, maxCents: DEPOSIT_LIMITS_CENTS.max };
  const unavailable = (id: DepositMethodId, name: string, category: MethodReadiness["category"], extra: string): MethodReadiness => ({
    id,
    name,
    category,
    configured: false,
    acceptingRequests: false,
    verification: { kind: "processor_webhook", available: false, description: "Would be confirmed by the processor's signed settlement notification. Not available: no processor is connected." },
    currencies: ["USD"],
    networks: [],
    requiredCustomerInfo: [],
    limits,
    expiresInHours: null,
    blockers: [NO_PROCESSOR, extra],
  });
  return [
    {
      id: "bank",
      name: "Bank Transfer",
      category: "bank",
      configured: bank,
      acceptingRequests: bank,
      verification: {
        kind: "bank_statement_review",
        available: bank,
        description: "Staff match the transfer on Sociotix's own bank statement (reference, amount, date, payer). A second staff member verifies before the wallet is credited.",
      },
      currencies: ["USD"],
      networks: [],
      requiredCustomerInfo: ["Send from a bank account in your own name.", "Include your deposit reference exactly as shown.", "Send the exact amount in USD."],
      limits,
      expiresInHours: BANK_EXPIRY_HOURS,
      blockers: bank ? [] : ["Sociotix's receiving bank account hasn't been configured, so bank transfers can't be accepted yet."],
    },
    unavailable("crypto", "Cryptocurrency", "crypto", "Deposit addresses are only ever issued by an approved processor; none are generated here."),
    unavailable("card", "Visa / Mastercard", "card", "Card payments need an approved card processor."),
    unavailable("paypal", "PayPal", "other", "PayPal payments need an approved PayPal business integration."),
  ];
}

export function readinessOf(id: DepositMethodId, env?: Env | null) {
  return methodReadiness(env).find((m) => m.id === id)!;
}

/** The business's real receiving account, for a specific deposit reference. Null when not configured. */
export function bankInstructions(reference: string, env: Env | null = safeEnv()): BankInstructions | null {
  if (!env || !bankConfigured(env)) return null;
  return {
    accountName: env.PAYMENTS_BANK_ACCOUNT_NAME!,
    bankName: env.PAYMENTS_BANK_NAME!,
    account: env.PAYMENTS_BANK_ACCOUNT!,
    routing: env.PAYMENTS_BANK_ROUTING ?? null,
    reference,
  };
}

/** Invalid configuration means nothing is available (fail closed). */
function safeEnv(): Env | null {
  try {
    return getEnv();
  } catch {
    return null;
  }
}
