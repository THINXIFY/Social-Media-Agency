import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { updateOwnOrderDetails } from "@/server/orders/orders";

/** Supply the information our team asked for; the order returns to review. */
export const POST = route<{ params: Promise<{ ref: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  return privateJson({ order: await updateOwnOrderDetails(getDb(), actor, (await params).ref, await request.json().catch(() => ({}))) });
});
