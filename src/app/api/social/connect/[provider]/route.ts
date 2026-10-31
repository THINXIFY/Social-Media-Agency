import { z } from "zod";
import { isSocialProvider } from "@/lib/social/platforms";
import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { errors } from "@/server/errors";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { startConnection } from "@/server/social/service";

const Body = z.object({ connectionId: z.string().uuid().optional() }).strict();

/**
 * Starts connecting (or reconnecting) a social account for the signed-in
 * customer. Answers with the platform's authorization URL; the browser
 * navigates there. Refused while the platform isn't switched on.
 */
export const POST = route<{ params: Promise<{ provider: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  const { provider } = await params;
  if (!isSocialProvider(provider)) throw errors.notFound("That platform");
  const body = Body.parse(await request.json().catch(() => ({})));
  const { url } = await startConnection(getDb(), { customerId: actor.customerId, provider, connectionId: body.connectionId ?? null }, { env: getEnv() });
  return privateJson({ url });
});
