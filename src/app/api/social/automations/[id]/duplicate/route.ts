import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { duplicateAutomation } from "@/server/social/automations";

/** Copies an automation as an inactive draft. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  return privateJson({ automation: await duplicateAutomation(getDb(), actor.customerId, (await params).id) }, { status: 201 });
});
