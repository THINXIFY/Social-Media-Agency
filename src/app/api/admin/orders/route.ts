import { requireStaff } from "@/server/auth";
import { allows } from "@/server/auth/permissions";
import { getDb } from "@/server/db/client";
import { privateJson, route } from "@/server/http";
import { checkoutEnabled, listOrdersForStaff } from "@/server/orders/orders";

/** Orders for staff (Orders: View), with queue counts and what this viewer may do. */
export const GET = route(async (request) => {
  const actor = await requireStaff("orders:view");
  const p = new URL(request.url).searchParams;
  const db = getDb();
  const list = await listOrdersForStaff(db, Object.fromEntries([...p.entries()].filter(([, v]) => v !== "")), actor.userId);
  return privateJson({ ...list, checkoutEnabled: await checkoutEnabled(db), can: { manage: allows(actor.context.access!, "orders:manage") } });
});
