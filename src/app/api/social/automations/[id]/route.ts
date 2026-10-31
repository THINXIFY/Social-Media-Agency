import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { deleteAutomation, saveAutomation } from "@/server/social/automations";
import { parseSave } from "../body";

type Ctx = { params: Promise<{ id: string }> };

/** Edits the caller's own automation. Without explicit re-activation an active one is paused. */
export const PATCH = route<Ctx>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  const { definition, activate } = parseSave(await request.json().catch(() => ({})));
  return privateJson({ automation: await saveAutomation(getDb(), actor.customerId, (await params).id, definition, { activate, actorUserId: actor.userId }) });
});

export const DELETE = route<Ctx>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  await deleteAutomation(getDb(), actor.customerId, (await params).id, actor.userId);
  return privateJson({ deleted: true });
});
