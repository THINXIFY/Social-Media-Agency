import { getDb } from "@/server/db/client";
import { privateJson, route } from "@/server/http";
import { controlAudit, viewer } from "@/server/ai/control/admin";

/** Control Center history from the audit log. Entries never contain keys. */
export const GET = route(async () => {
  await viewer();
  return privateJson({ entries: await controlAudit(getDb()) });
});
