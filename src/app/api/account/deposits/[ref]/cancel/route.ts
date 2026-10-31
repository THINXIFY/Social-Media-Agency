import { clientInfo, requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { cancelOwnDeposit } from "@/server/payments/deposits";

/** Cancel an own request while no payment has been recorded. */
export const POST = route<{ params: Promise<{ ref: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  return privateJson({ deposit: await cancelOwnDeposit(getDb(), actor, (await params).ref, await clientInfo()) });
});
