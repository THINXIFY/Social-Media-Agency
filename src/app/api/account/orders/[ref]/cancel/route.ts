import { clientInfo, requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { cancelOwnOrder } from "@/server/orders/orders";

/** Cancel an own order before review or while information is requested; the full amount returns to the wallet. */
export const POST = route<{ params: Promise<{ ref: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  return privateJson({ order: await cancelOwnOrder(getDb(), actor, (await params).ref, await clientInfo()) });
});
