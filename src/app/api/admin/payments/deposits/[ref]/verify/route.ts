import { clientInfo, requireStaff } from "@/server/auth";
import { requireRecentReauth } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { getDepositForStaff, verifyAndCredit } from "@/server/payments/deposits";

/** Review 2 of 2: a different staff member verifies and the wallet is credited, exactly once. Needs "Approve deposits" and a fresh re-authentication. */
export const POST = route<{ params: Promise<{ ref: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireStaff("approveDeposits");
  requireRecentReauth(actor.context.session);
  const { ref } = await params;
  await verifyAndCredit(getDb(), actor, ref, await clientInfo());
  return privateJson({ deposit: await getDepositForStaff(getDb(), ref, actor.userId) });
});
