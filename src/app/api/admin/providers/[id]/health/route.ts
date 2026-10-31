import { requireStaff } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { getProvider, runHealthCheck } from "@/server/providers/providers";

/** Runs a health check and records the real outcome. Without an installed integration nothing is contacted. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireStaff("configureProviders");
  const { id } = await params;
  const result = await runHealthCheck(getDb(), actor, id);
  return privateJson({ result, provider: await getProvider(getDb(), id) });
});
