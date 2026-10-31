import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { schedulePost } from "@/server/social/publishing";

/** The owner's explicit approval to publish at a time, to accounts that can publish now. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  return privateJson(await schedulePost(getDb(), actor.customerId, (await params).id, await request.json().catch(() => ({})), { env: getEnv(), actorUserId: actor.userId }));
});
