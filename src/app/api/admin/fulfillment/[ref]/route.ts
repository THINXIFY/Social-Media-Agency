import { authorize, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { privateJson, route } from "@/server/http";
import { fulfillmentDetail } from "@/server/providers/fulfillment";

export const GET = route<{ params: Promise<{ ref: string }> }>(async (_request, { params }) => {
  const actor = await requireStaff("orders:view");
  await authorize(actor, "providers:view");
  const detail = await fulfillmentDetail(getDb(), (await params).ref);
  if (!detail) throw errors.notFound("That order");
  return privateJson({ order: detail });
});
