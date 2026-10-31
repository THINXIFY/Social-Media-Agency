import { clientInfo } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { errors } from "@/server/errors";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { sensitive } from "@/server/ai/control/admin";
import { activateCredential, disableCredential, testCredential } from "@/server/ai/control/credentials";

/** Test, activate or disable a key. All need Security settings and a fresh re-authentication. */
export const POST = route<{ params: Promise<{ id: string; action: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const { id, action } = await params;
  if (!["test", "activate", "disable"].includes(action)) throw errors.notFound("That action");
  const actor = await sensitive();
  const body = await request.json().catch(() => ({}));
  const db = getDb();
  const client = await clientInfo();
  if (action === "test") return privateJson({ result: await testCredential(db, actor, id, body, getEnv(), {}, client) });
  if (action === "activate") await activateCredential(db, actor, id, body, client);
  else await disableCredential(db, actor, id, client);
  return privateJson({ ok: true });
});
