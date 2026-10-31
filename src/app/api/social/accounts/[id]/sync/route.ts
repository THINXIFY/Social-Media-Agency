import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { syncConnection } from "@/server/social/service";

/** Refreshes one of the caller's own connected accounts (read-only). Manual only, with a cooldown. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  return privateJson(await syncConnection(getDb(), { customerId: actor.customerId, connectionId: (await params).id }, { env: getEnv() }));
});
