import { clientInfo, requireStaff } from "@/server/auth";
import { requireRecentReauth } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { getProvider, removeCredential, setCredential } from "@/server/providers/providers";

type Ctx = { params: Promise<{ id: string }> };

/** Stores a credential, encrypted server-side. Write-only: the response never contains it. */
export const PUT = route<Ctx>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireStaff("configureProviders");
  requireRecentReauth(actor.context.session);
  const { id } = await params;
  await setCredential(getDb(), actor, id, await request.json().catch(() => ({})), await clientInfo());
  return privateJson({ provider: await getProvider(getDb(), id) });
});

export const DELETE = route<Ctx>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireStaff("configureProviders");
  requireRecentReauth(actor.context.session);
  const { id } = await params;
  await removeCredential(getDb(), actor, id, await clientInfo());
  return privateJson({ provider: await getProvider(getDb(), id) });
});
