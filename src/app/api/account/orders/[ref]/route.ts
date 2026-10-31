import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { privateJson, route } from "@/server/http";
import { getOwnOrder } from "@/server/orders/orders";

export const GET = route<{ params: Promise<{ ref: string }> }>(async (_request, { params }) => {
  const actor = await requireCustomer();
  const order = await getOwnOrder(getDb(), actor.customerId, (await params).ref);
  if (!order) throw errors.notFound("That order");
  return privateJson({ order });
});
