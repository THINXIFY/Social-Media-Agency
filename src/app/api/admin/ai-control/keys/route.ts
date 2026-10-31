import { clientInfo } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { sensitive } from "@/server/ai/control/admin";
import { saveCredential } from "@/server/ai/control/credentials";

/** Saves a key as a new, inactive version. The response never includes the key. */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const actor = await sensitive();
  const saved = await saveCredential(getDb(), actor, await request.json().catch(() => ({})), await clientInfo());
  return privateJson({ id: saved.id, version: saved.version }, { status: 201 });
});
