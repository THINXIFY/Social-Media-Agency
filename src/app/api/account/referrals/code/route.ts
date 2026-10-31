import { clientInfo, requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { loadProgram, ownReferralSummary, regenerateCode } from "@/server/referrals/referrals";

/** Replaces the caller's referral code (3 a day). The old code stops working for new sign-ups. */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  const db = getDb();
  if (!(await loadProgram(db)).sharingEnabled) throw errors.featureDisabled("Referral sharing");
  await regenerateCode(db, actor, await clientInfo());
  return privateJson(await ownReferralSummary(db, actor.customerId));
});
