import { requireStaff } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { privateJson, route } from "@/server/http";
import { referralAudit } from "@/server/referrals/referrals";

/** Recent referral program audit entries (Referrals: View). */
export const GET = route(async () => {
  await requireStaff("referrals:view");
  return privateJson({ entries: await referralAudit(getDb()) });
});
