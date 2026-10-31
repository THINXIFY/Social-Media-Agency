import { clientInfo, requireStaff } from "@/server/auth";
import { requireRecentReauth } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { getDepositForStaff, rejectDeposit } from "@/server/payments/deposits";

/** Reject a deposit request; the reason is shown to the customer. Needs "Approve deposits" and a fresh re-authentication. */
export const POST = route<{ params: Promise<{ ref: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireStaff("approveDeposits");
  requireRecentReauth(actor.context.session);
  const { ref } = await params;
  await rejectDeposit(getDb(), actor, ref, await request.json().catch(() => ({})), await clientInfo());
  return privateJson({ deposit: await getDepositForStaff(getDb(), ref, actor.userId) });
});
