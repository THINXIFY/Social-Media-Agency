import { requireStaff } from "@/server/auth";
import { allows } from "@/server/auth/permissions";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { privateJson, route } from "@/server/http";
import { staffTicket } from "@/server/support/tickets";

/** One ticket with notes and history (Support: View). Order details only for roles that may view orders. */
export const GET = route<{ params: Promise<{ ref: string }> }>(async (_request, { params }) => {
  const actor = await requireStaff("support:view");
  const ticket = await staffTicket(getDb(), (await params).ref, { canSeeOrders: allows(actor.context.access!, "orders:view") });
  if (!ticket) throw errors.notFound("That ticket");
  return privateJson({ ticket, can: { manage: allows(actor.context.access!, "support:manage") } });
});
