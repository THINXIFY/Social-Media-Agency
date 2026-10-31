import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { listNotifications, markRead } from "@/server/support/notifications";

/** The signed-in customer's own in-app notifications. */
export const GET = route(async () => {
  const actor = await requireCustomer();
  return privateJson(await listNotifications(getDb(), actor.userId));
});

/** Marks the customer's own notifications read (`{ ids }` or `{ all: true }`). */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  await markRead(getDb(), actor.userId, await request.json().catch(() => ({})));
  return privateJson(await listNotifications(getDb(), actor.userId));
});
