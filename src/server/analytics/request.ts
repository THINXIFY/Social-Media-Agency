import "server-only";
import { resolveRange } from "@/lib/admin-overview";
import { isReportId } from "@/lib/reports";
import type { Db } from "../db/client";
import { AppError } from "../errors";
import { loadReporting } from "../settings/reporting";
import { parseFilters } from "./reports";

/** Validates a report request: report id, date range (in the reporting timezone) and filters. */
export async function reportRequest(db: Db, url: string) {
  const p = new URL(url).searchParams;
  const id = p.get("report");
  if (!isReportId(id)) throw new AppError("VALIDATION_FAILED", "Choose a report.", { details: { field: "report" } });
  const prefs = await loadReporting(db);
  const range = resolveRange(p.get("range") ?? prefs.defaultRange, p.get("from"), p.get("to"), new Date(), prefs.timezone);
  if (!range) throw new AppError("VALIDATION_FAILED", "Choose a valid date range: a start date on or before the end date, not in the future, up to 366 days.", { details: { field: "range" } });
  return { id, range, filters: parseFilters(p) };
}
