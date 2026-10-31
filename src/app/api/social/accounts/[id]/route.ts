import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { disconnectConnection } from "@/server/social/service";

/** Disconnects one of the caller's own accounts: deletes stored access and revokes it at the platform where supported. */
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  return privateJson(await disconnectConnection(getDb(), { customerId: actor.customerId, connectionId: (await params).id, actorUserId: actor.userId }, { env: getEnv() }));
});
