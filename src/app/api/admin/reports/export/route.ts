import { EXPORT_RATE } from "@/lib/reports";
import { clientInfo, requireStaff } from "@/server/auth";
import { hit } from "@/server/auth/rate-limit";
import { audit } from "@/server/audit";
import { assertCanView, exportReport } from "@/server/analytics/reports";
import { reportRequest } from "@/server/analytics/request";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { route } from "@/server/http";

/**
 * CSV export of a report's table with the same filters as the view.
 * Permission-checked like the report, rate-limited per staff member,
 * capped in size and recorded in the audit log (filters and row count only).
 */
export const GET = route(async (request) => {
  const actor = await requireStaff("overview:view");
  const db = getDb();
  const { id, range, filters } = await reportRequest(db, request.url);
  const access = actor.context.access!;
  assertCanView(access, id);
  const limit = await hit(db, "report-export", actor.userId, EXPORT_RATE);
  if (!limit.ok) throw new AppError("RATE_LIMITED", `You've exported several reports recently. Please try again in ${Math.ceil(limit.retryAfter / 60)} minutes.`);
  const { csv, rows, filename } = await exportReport(db, getEnv(), access, id, range, filters);
  const client = await clientInfo();
  const applied: Record<string, unknown> = { ...filters };
  delete applied.page;
  await audit(db, { actorUserId: actor.userId, actorType: "staff", action: "report.exported", targetType: "report", targetId: id, after: { report: id, from: range.from, to: range.to, timezone: range.tz, filters: applied, rows }, ip: client.ip, userAgent: client.userAgent });
  return new Response(`﻿${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});
