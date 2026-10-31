import { requireCustomer } from "@/server/auth";
import { revokeAllSessions } from "@/server/auth/sessions";
import { sessionRows } from "@/server/auth/session-view";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";

/** The caller's own sessions only. */
export const GET = route(async () => {
  const actor = await requireCustomer();
  return privateJson({ sessions: await sessionRows(actor.userId, "customer", actor.sessionId) });
});

/** Signs out every other session of the caller. */
export const DELETE = route(async (request) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  const revoked = await revokeAllSessions(getDb(), actor.userId, { except: actor.sessionId });
  return privateJson({ revoked });
});
