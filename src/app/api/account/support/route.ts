import { clientInfo, requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { createTicket, listOwnTickets, ownOrderChoices } from "@/server/support/tickets";

/** The caller's own tickets, plus their recent orders for linking a new ticket. */
export const GET = route(async (request) => {
  const actor = await requireCustomer();
  const p = new URL(request.url).searchParams;
  const db = getDb();
  const [list, orders] = await Promise.all([listOwnTickets(db, actor.customerId, { status: (p.get("status") || undefined) as never, q: p.get("q") ?? undefined }), ownOrderChoices(db, actor.customerId)]);
  return privateJson({ ...list, orders });
});

/** Opens a ticket. The body's `key` makes a retried submission return the original ticket. */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  const result = await createTicket(getDb(), actor, await request.json().catch(() => ({})), await clientInfo());
  return privateJson(result, { status: result.duplicate ? 200 : 201 });
});
