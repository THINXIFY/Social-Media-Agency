import { requireStaff } from "@/server/auth";
import { buildReport } from "@/server/analytics/reports";
import { reportRequest } from "@/server/analytics/request";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { privateJson, route } from "@/server/http";

/**
 * One report (Overview: View to enter; the report's own module to read it).
 * Query: report, range|from|to, q, status, platform, category, flagged, page.
 */
export const GET = route(async (request) => {
  const actor = await requireStaff("overview:view");
  const db = getDb();
  const { id, range, filters } = await reportRequest(db, request.url);
  return privateJson(await buildReport(db, getEnv(), actor.context.access!, id, range, filters));
});
