import { requireCustomer } from "@/server/auth";
import { getPreferences, updatePreferences } from "@/server/customers/customers";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";

export const GET = route(async () => {
  const actor = await requireCustomer();
  return privateJson(await getPreferences(getDb(), actor.customerId));
});

export const PATCH = route(async (request) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  return privateJson(await updatePreferences(getDb(), actor, await request.json().catch(() => ({}))));
});
