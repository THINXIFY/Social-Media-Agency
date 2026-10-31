import { z } from "zod";
import { isTimeZone } from "@/lib/social/time";
import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { approveSuggestion } from "@/server/social/automations";

const Body = z.object({ timezone: z.string().refine(isTimeZone) }).strict();

/** The customer approves a suggestion: it becomes an unscheduled draft. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  const { timezone } = Body.parse(await request.json().catch(() => ({})));
  return privateJson(await approveSuggestion(getDb(), actor.customerId, (await params).id, timezone));
});
