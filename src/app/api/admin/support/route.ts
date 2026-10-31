import { requireStaff } from "@/server/auth";
import { allows } from "@/server/auth/permissions";
import { getDb } from "@/server/db/client";
import { privateJson, route } from "@/server/http";
import { staffQueue } from "@/server/support/tickets";

/** The support queue (Support: View). */
export const GET = route(async (request) => {
  const actor = await requireStaff("support:view");
  const p = new URL(request.url).searchParams;
  const result = await staffQueue(getDb(), actor, { view: (p.get("view") || undefined) as never, q: p.get("q") ?? undefined, category: p.get("category") ?? undefined, priority: p.get("priority") ?? undefined, status: p.get("status") ?? undefined });
  return privateJson({ ...result, can: { manage: allows(actor.context.access!, "support:manage") } });
});
