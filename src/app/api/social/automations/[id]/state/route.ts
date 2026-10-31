import { z } from "zod";
import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { setAutomationState } from "@/server/social/automations";

const Body = z.object({ action: z.enum(["activate", "pause"]), confirmed: z.boolean().optional() }).strict();

/** Pause any time; activating needs the explicit confirmation. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  const b = Body.parse(await request.json().catch(() => ({})));
  if (b.action === "activate" && b.confirmed !== true) throw errors.forbidden("activate an automation without confirming it");
  return privateJson({ automation: await setAutomationState(getDb(), actor.customerId, (await params).id, b.action, { actorUserId: actor.userId }) });
});
