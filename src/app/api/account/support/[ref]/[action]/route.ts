import { clientInfo, requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { closeOwn, getOwnTicket, reopenOwn, replyOwn } from "@/server/support/tickets";

/** Reply, close or reopen one of the caller's own tickets. */
export const POST = route<{ params: Promise<{ ref: string; action: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const { ref, action } = await params;
  if (!["reply", "close", "reopen"].includes(action)) throw errors.notFound("That action");
  const actor = await requireCustomer();
  const db = getDb();
  const client = await clientInfo();
  if (action === "reply") await replyOwn(db, actor, ref, await request.json().catch(() => ({})), client);
  else if (action === "close") await closeOwn(db, actor, ref, client);
  else await reopenOwn(db, actor, ref, client);
  return privateJson({ ticket: await getOwnTicket(db, actor.customerId, ref) });
});
