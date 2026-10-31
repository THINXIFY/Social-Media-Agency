import { requireStaff } from "@/server/auth";
import { allows } from "@/server/auth/permissions";
import { getDb } from "@/server/db/client";
import { privateJson, route } from "@/server/http";
import { adminReferrals, loadProgram } from "@/server/referrals/referrals";

/** Referral list with filters and totals (Referrals: View). */
export const GET = route(async (request) => {
  const actor = await requireStaff("referrals:view");
  const p = new URL(request.url).searchParams;
  const db = getDb();
  const [list, program] = await Promise.all([adminReferrals(db, { status: (p.get("status") || undefined) as never, q: p.get("q") ?? undefined }), loadProgram(db)]);
  return privateJson({ ...list, program, can: { manage: allows(actor.context.access!, "referrals:manage") } });
});
