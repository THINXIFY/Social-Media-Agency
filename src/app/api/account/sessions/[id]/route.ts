import { requireCustomer } from "@/server/auth";
import { revokeSession } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { assertSameOrigin, privateJson, route } from "@/server/http";

/** Signs out one of the caller's sessions. Someone else's session id is indistinguishable from a missing one. */
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  const { id } = await params;
  if (!(await revokeSession(getDb(), id, actor.userId))) throw errors.notFound("That session");
  return privateJson({ revoked: true });
});
