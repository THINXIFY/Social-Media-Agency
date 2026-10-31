import { clientInfo, requireStaff } from "@/server/auth";
import { requireRecentReauth } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { archiveProvider, getProvider, updateProvider } from "@/server/providers/providers";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_request, { params }) => {
  await requireStaff("providers:view");
  const provider = await getProvider(getDb(), (await params).id);
  if (!provider) throw errors.notFound("That provider");
  return privateJson({ provider });
});

/** Edits descriptive details. Enabling and integrations aren't editable here. */
export const PATCH = route<Ctx>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireStaff("configureProviders");
  const { id } = await params;
  await updateProvider(getDb(), actor, id, await request.json().catch(() => ({})), await clientInfo());
  return privateJson({ provider: await getProvider(getDb(), id) });
});

/** Archives (never deletes) a provider; needs a fresh re-authentication. */
export const DELETE = route<Ctx>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireStaff("configureProviders");
  requireRecentReauth(actor.context.session);
  const { id } = await params;
  await archiveProvider(getDb(), actor, id, await clientInfo());
  return privateJson({ provider: await getProvider(getDb(), id) });
});
