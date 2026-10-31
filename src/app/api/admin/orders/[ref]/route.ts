import { requireStaff } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { privateJson, route } from "@/server/http";
import { getOrderForStaff } from "@/server/orders/orders";

export const GET = route<{ params: Promise<{ ref: string }> }>(async (_request, { params }) => {
  const actor = await requireStaff("orders:view");
  const order = await getOrderForStaff(getDb(), (await params).ref, actor.userId);
  if (!order) throw errors.notFound("That order");
  return privateJson({ order });
});
