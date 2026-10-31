import { z } from "zod";
import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { updateInboxItem } from "@/server/social/automations";

const Body = z.object({ status: z.enum(["open", "done", "dismissed"]).optional(), toggle: z.number().int().min(0).max(20).optional() }).strict();

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  await updateInboxItem(getDb(), actor.customerId, (await params).id, Body.parse(await request.json().catch(() => ({}))));
  return privateJson({ ok: true });
});
