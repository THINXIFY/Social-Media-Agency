import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { isTimeZone } from "@/lib/admin-overview";
import { audit } from "../audit";
import type { Db, Executor } from "../db/client";
import { platformSettings } from "../db/schema";
import { errors } from "../errors";

/*
 * Reporting preferences (Phase 5H-B): the timezone that report days are
 * grouped by and the default date range for Overview and Reports. Stored
 * timestamps never change; only how windows are cut and labelled.
 */

export const REPORTING_KEY = "reporting.preferences";
export const DEFAULT_REPORTING = { timezone: "UTC", defaultRange: "30d" as const };
export const reportingSchema = z.strictObject({
  timezone: z.string().refine(isTimeZone, "Choose a valid timezone."),
  defaultRange: z.enum(["today", "7d", "30d", "90d"]),
});
export type ReportingPreferences = z.infer<typeof reportingSchema>;

export async function loadReporting(db: Executor): Promise<ReportingPreferences & { version: number; updatedAt: string | null }> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, REPORTING_KEY)).limit(1);
  if (!row) return { ...DEFAULT_REPORTING, version: 0, updatedAt: null };
  const parsed = reportingSchema.safeParse(row.value);
  // An unreadable value falls back to UTC rather than failing every report.
  return { ...(parsed.success ? parsed.data : DEFAULT_REPORTING), version: row.version, updatedAt: row.updatedAt.toISOString() };
}

/** Saves with optimistic concurrency (`version` must match what the admin read). Audited with before/after. */
export async function saveReporting(db: Db, staff: { userId: string }, raw: unknown, version: number, client: { ip?: string | null; userAgent?: string | null } = {}) {
  const next = reportingSchema.parse(raw);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(platformSettings).where(eq(platformSettings.key, REPORTING_KEY)).for("update").limit(1);
    if ((row?.version ?? 0) !== version) throw errors.conflict("Someone else changed these settings. Reload to see the latest values.");
    if (row) await tx.update(platformSettings).set({ value: next, version: row.version + 1, updatedBy: staff.userId, updatedAt: new Date() }).where(eq(platformSettings.key, REPORTING_KEY));
    else await tx.insert(platformSettings).values({ key: REPORTING_KEY, value: next, version: 1, updatedBy: staff.userId });
    await audit(tx, { actorUserId: staff.userId, actorType: "staff", action: "settings.reporting_saved", targetType: "setting", targetId: REPORTING_KEY, before: row ? (row.value as Record<string, unknown>) : DEFAULT_REPORTING, after: next, ip: client.ip, userAgent: client.userAgent });
  });
}
