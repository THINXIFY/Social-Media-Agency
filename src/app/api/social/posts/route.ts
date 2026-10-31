import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { saveDraft } from "@/server/social/publishing";

/** Creates a draft for the signed-in customer. Nothing is scheduled or published. */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  return privateJson({ post: await saveDraft(getDb(), actor.customerId, null, await request.json().catch(() => ({}))) }, { status: 201 });
});
