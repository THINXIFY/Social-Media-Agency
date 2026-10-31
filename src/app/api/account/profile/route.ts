import { clientInfo, requireCustomer } from "@/server/auth";
import { getOwnProfile, updateOwnProfile } from "@/server/customers/customers";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";

/** The signed-in customer's own profile. The customer id comes from the session only. */
export const GET = route(async () => {
  const actor = await requireCustomer();
  return privateJson(await getOwnProfile(getDb(), actor.customerId));
});

export const PATCH = route(async (request) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  const body = await request.json().catch(() => ({}));
  return privateJson(await updateOwnProfile(getDb(), actor, body, await clientInfo()));
});
