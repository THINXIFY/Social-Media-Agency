import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { saveAutomation } from "@/server/social/automations";
import { parseSave } from "./body";

/** Creates an automation for the signed-in customer (a draft unless explicitly activated). */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  const { definition, activate } = parseSave(await request.json().catch(() => ({})));
  return privateJson({ automation: await saveAutomation(getDb(), actor.customerId, null, definition, { activate, actorUserId: actor.userId }) }, { status: 201 });
});
