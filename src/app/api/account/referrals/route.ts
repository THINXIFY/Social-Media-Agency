import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { privateJson, route } from "@/server/http";
import { ownReferralSummary } from "@/server/referrals/referrals";

/** The caller's referral code, link and the people who joined with it. */
export const GET = route(async () => {
  const actor = await requireCustomer();
  return privateJson(await ownReferralSummary(getDb(), actor.customerId));
});
