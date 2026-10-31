import { resolveRange } from "@/lib/admin-overview";
import { requireStaff } from "@/server/auth";
import { adminOverview } from "@/server/analytics/overview";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { privateJson, route } from "@/server/http";
import { loadReporting } from "@/server/settings/reporting";

/**
 * Admin Overview analytics (Overview: View). `range` is today, 7d, 30d, 90d
 * or custom with `from`/`to` (YYYY-MM-DD in the reporting timezone, at most
 * 366 days); without it, the saved default range applies. Each section is
 * included only when the viewer's role can view its module.
 */
export const GET = route(async (request) => {
  const actor = await requireStaff("overview:view");
  const db = getDb();
  const prefs = await loadReporting(db);
  const p = new URL(request.url).searchParams;
  const range = resolveRange(p.get("range") ?? prefs.defaultRange, p.get("from"), p.get("to"), new Date(), prefs.timezone);
  if (!range) throw new AppError("VALIDATION_FAILED", "Choose a valid date range: a start date on or before the end date, not in the future, up to 366 days.", { details: { field: "range" } });
  return privateJson(await adminOverview(db, getEnv(), actor.context.access!, range));
});
