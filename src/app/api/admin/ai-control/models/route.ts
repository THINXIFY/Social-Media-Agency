import { clientInfo } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { manager } from "@/server/ai/control/admin";
import { saveModel } from "@/server/ai/control/models";

/** Adds a manual model or records verified capabilities, limits and a sourced price (Settings: Manage). */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const actor = await manager();
  await saveModel(getDb(), actor, await request.json().catch(() => ({})), await clientInfo());
  return privateJson({ ok: true });
});
