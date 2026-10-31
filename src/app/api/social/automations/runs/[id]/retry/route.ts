import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { retryRun } from "@/server/social/automations";

/** Retries one of the caller's own failed runs (internal, idempotent actions only). */
export const POST = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  return privateJson({ result: await retryRun(getDb(), actor.customerId, (await params).id) });
});
