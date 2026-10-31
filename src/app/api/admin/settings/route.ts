import { requireStaff } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { privateJson, route } from "@/server/http";
import { settingsOverview } from "@/server/settings/overview";

/** Platform Settings read model (Settings: View). Read-only configuration plus the editable reporting preferences. */
export const GET = route(async () => {
  const actor = await requireStaff("settings:view");
  return privateJson(await settingsOverview(getDb(), getEnv(), actor.context.access!));
});
