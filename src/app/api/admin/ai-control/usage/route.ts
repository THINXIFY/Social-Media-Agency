import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { privateJson, route } from "@/server/http";
import { viewer } from "@/server/ai/control/admin";
import { loadControls } from "@/server/ai/control/controls";
import { budgetUsage, usageReport } from "@/server/ai/control/usage";

export const GET = route(async (request) => {
  await viewer();
  const u = new URL(request.url).searchParams;
  const db = getDb();
  const [report, budget] = await Promise.all([usageReport(db, { days: u.get("days") ?? undefined, provider: u.get("provider") ?? undefined, tool: u.get("tool") ?? undefined }), loadControls(db).then((c) => budgetUsage(db, c, getEnv()))]);
  return privateJson({ ...report, budget });
});
