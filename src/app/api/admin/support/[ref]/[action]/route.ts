import { clientInfo, requireStaff } from "@/server/auth";
import { allows } from "@/server/auth/permissions";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { addNote, assignTicket, setPriority, setStatus, staffReply, staffTicket } from "@/server/support/tickets";

const ACTIONS = { reply: staffReply, status: setStatus, priority: setPriority, assign: assignTicket, note: addNote } as const;

/** Staff ticket actions (Support: Manage). Unknown actions are 404. */
export const POST = route<{ params: Promise<{ ref: string; action: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const { ref, action } = await params;
  const run = Object.hasOwn(ACTIONS, action) ? ACTIONS[action as keyof typeof ACTIONS] : undefined;
  if (!run) throw errors.notFound("That action");
  const actor = await requireStaff("support:manage");
  const db = getDb();
  await run(db, actor, ref, await request.json().catch(() => ({})), await clientInfo());
  return privateJson({ ticket: await staffTicket(db, ref, { canSeeOrders: allows(actor.context.access!, "orders:view") }) });
});
