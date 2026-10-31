import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { privateJson, route } from "@/server/http";
import { getOwnTicket } from "@/server/support/tickets";

/** One of the caller's own tickets. Another customer's reference is simply "not found". */
export const GET = route<{ params: Promise<{ ref: string }> }>(async (_request, { params }) => {
  const actor = await requireCustomer();
  const ticket = await getOwnTicket(getDb(), actor.customerId, (await params).ref);
  if (!ticket) throw errors.notFound("That ticket");
  return privateJson({ ticket });
});
