import { z } from "zod";
import { clientInfo, requireStaff } from "@/server/auth";
import { requireRecentReauth } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { getProvider, removeMapping, setMappingActive } from "@/server/providers/providers";

type Ctx = { params: Promise<{ id: string; serviceId: string }> };
const Body = z.strictObject({ active: z.boolean() });

/** Activating needs Configure providers and a fresh re-authentication, and passes only for eligible services. */
export const PATCH = route<Ctx>(async (request, { params }) => {
  assertSameOrigin(request);
  const { active } = Body.parse(await request.json().catch(() => ({})));
  const actor = await requireStaff(active ? "configureProviders" : "providers:manage");
  if (active) requireRecentReauth(actor.context.session);
  const { id, serviceId } = await params;
  await setMappingActive(getDb(), actor, id, serviceId, active, await clientInfo());
  return privateJson({ provider: await getProvider(getDb(), id) });
});

export const DELETE = route<Ctx>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireStaff("providers:manage");
  const { id, serviceId } = await params;
  await removeMapping(getDb(), actor, id, serviceId, await clientInfo());
  return privateJson({ provider: await getProvider(getDb(), id) });
});
