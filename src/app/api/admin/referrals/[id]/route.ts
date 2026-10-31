import { clientInfo, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { adminReferral, reviewReferral } from "@/server/referrals/referrals";

type Ctx = { params: Promise<{ id: string }> };

/** One referral with its review signals and history (Referrals: View). */
export const GET = route<Ctx>(async (_request, { params }) => {
  await requireStaff("referrals:view");
  return privateJson({ referral: await adminReferral(getDb(), (await params).id) });
});

/** Review actions: mark for review, reject with a reason, restore. Qualifying is refused (Referrals: Manage). */
export const POST = route<Ctx>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireStaff("referrals:manage");
  const { id } = await params;
  const db = getDb();
  await reviewReferral(db, actor, id, await request.json().catch(() => ({})), await clientInfo());
  return privateJson({ referral: await adminReferral(db, id) });
});
