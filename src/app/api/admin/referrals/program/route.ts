import { z } from "zod";
import { clientInfo, requireStaff } from "@/server/auth";
import { requireRecentReauth } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { loadProgram, saveProgram } from "@/server/referrals/referrals";

const Body = z.object({ attributionEnabled: z.boolean(), sharingEnabled: z.boolean(), version: z.number().int().min(0) });

/** Turns attribution or sharing on or off (Referrals: Manage, recent re-authentication). Rewards aren't a switch here. */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const actor = await requireStaff("referrals:manage");
  requireRecentReauth(actor.context.session);
  const { version, ...value } = Body.parse(await request.json().catch(() => ({})));
  const db = getDb();
  await saveProgram(db, actor, value, version, await clientInfo());
  return privateJson({ program: await loadProgram(db) });
});
