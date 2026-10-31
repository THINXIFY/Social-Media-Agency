import { z } from "zod";
import { tzLabel } from "@/lib/admin-overview";
import { clientInfo, requireStaff } from "@/server/auth";
import { requireRecentReauth } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { loadReporting, saveReporting } from "@/server/settings/reporting";

const Body = z.object({ value: z.unknown(), version: z.number().int().min(0) });

/** Saves reporting preferences (Settings: Manage, recent re-authentication). Audited with before/after values. */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const actor = await requireStaff("settings:manage");
  requireRecentReauth(actor.context.session);
  const { value, version } = Body.parse(await request.json().catch(() => ({})));
  const db = getDb();
  await saveReporting(db, actor, value, version, await clientInfo());
  const reporting = await loadReporting(db);
  return privateJson({ reporting: { ...reporting, label: tzLabel(reporting.timezone) } });
});
