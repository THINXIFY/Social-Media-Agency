import { requireStaff } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { addDepositNote, getDepositForStaff } from "@/server/payments/deposits";

/** Internal note on a deposit (Payments: Manage). Never shown to the customer; no credentials allowed. */
export const POST = route<{ params: Promise<{ ref: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireStaff("payments:manage");
  const { ref } = await params;
  await addDepositNote(getDb(), actor, ref, await request.json().catch(() => ({})));
  return privateJson({ deposit: await getDepositForStaff(getDb(), ref, actor.userId) }, { status: 201 });
});
