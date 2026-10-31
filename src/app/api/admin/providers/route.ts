import { clientInfo, requireStaff } from "@/server/auth";
import { allows } from "@/server/auth/permissions";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { createProvider, listProviders, mappableServices } from "@/server/providers/providers";
import { SUBMISSIONS_ENABLED } from "@/server/providers/registry";

/** Provider directory (Providers: View). Credentials are never included, only whether one is set. */
export const GET = route(async (request) => {
  const actor = await requireStaff("providers:view");
  const access = actor.context.access!;
  const withServices = new URL(request.url).searchParams.get("include") === "services";
  return privateJson({
    providers: await listProviders(getDb()),
    services: withServices ? await mappableServices(getDb()) : undefined,
    submissionsEnabled: SUBMISSIONS_ENABLED,
    can: { configure: allows(access, "configureProviders"), manage: allows(access, "providers:manage"), orders: allows(access, "orders:manage") },
  });
});

/** Adds a provider record: always disabled and without an integration (Configure providers). */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const actor = await requireStaff("configureProviders");
  const id = await createProvider(getDb(), actor, await request.json().catch(() => ({})), await clientInfo());
  return privateJson({ id }, { status: 201 });
});
