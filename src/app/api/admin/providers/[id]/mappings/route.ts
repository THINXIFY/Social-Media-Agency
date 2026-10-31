import { clientInfo, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { getProvider, saveMapping } from "@/server/providers/providers";

/** Creates or edits a mapping (Providers: Manage). Mappings are always saved inactive. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireStaff("providers:manage");
  const { id } = await params;
  await saveMapping(getDb(), actor, id, await request.json().catch(() => ({})), await clientInfo());
  return privateJson({ provider: await getProvider(getDb(), id) });
});
