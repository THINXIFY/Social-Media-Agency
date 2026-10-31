import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { privateJson, route } from "@/server/http";
import { controlCenter, viewer } from "@/server/ai/control/admin";

/** Everything the Control Center shows. Credentials appear only as masked hints; ciphertext is never selected. */
export const GET = route(async () => {
  const actor = await viewer();
  return privateJson(await controlCenter(getDb(), getEnv(), actor.context.access!));
});
