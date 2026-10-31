import { clientInfo } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { manager, sensitive } from "@/server/ai/control/admin";
import { activateAssignment, checkDraft, disableAssignment, saveDraft } from "@/server/ai/control/assignments";

/** Draft, check and disable need Settings: Manage; activating needs Security settings and re-authentication. */
export const POST = route<{ params: Promise<{ tool: string; action: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const { tool, action } = await params;
  if (!["draft", "check", "activate", "disable"].includes(action)) throw errors.notFound("That action");
  const actor = action === "activate" ? await sensitive() : await manager();
  const db = getDb();
  const client = await clientInfo();
  if (action === "draft") await saveDraft(db, actor, tool, await request.json().catch(() => ({})), client);
  else if (action === "check") return privateJson({ result: await checkDraft(db, actor, tool, client) });
  else if (action === "activate") await activateAssignment(db, actor, tool, client);
  else await disableAssignment(db, actor, tool, client);
  return privateJson({ ok: true });
});
