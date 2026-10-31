import "server-only";
import { type Plan, PLAN_BY_ID } from "@/lib/ai/plans";

/*
 * AI plan entitlements (AI-09). Server-authoritative and deliberately minimal:
 * no subscriptions exist, so every account is on Free and nothing a browser
 * sends can change that.
 *
 * Integration boundary (not built until billing is approved): a future
 * subscriptions table written only by a verified billing-provider webhook,
 * read here by customer id. AI billing must stay separate from the SMM wallet,
 * orders and ledger; wallet balances can never pay for a plan, and a plan
 * never changes allowances without an explicit, reviewed entitlement change.
 */
export function planFor(customerId: string): Plan {
  void customerId; // The key for the future subscription lookup.
  return PLAN_BY_ID.free;
}
