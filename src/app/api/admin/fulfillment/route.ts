import { authorize, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { privateJson, route } from "@/server/http";
import { fulfillmentQueue } from "@/server/providers/fulfillment";

/** Approved and in-progress orders with their provider state (Orders: View and Providers: View). */
export const GET = route(async (request) => {
  const actor = await requireStaff("orders:view");
  await authorize(actor, "providers:view");
  const u = new URL(request.url).searchParams;
  return privateJson({ items: await fulfillmentQueue(getDb(), { view: (u.get("view") ?? undefined) as never, q: u.get("q") ?? undefined }) });
});
