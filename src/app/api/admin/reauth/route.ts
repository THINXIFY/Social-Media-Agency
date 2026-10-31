import { z } from "zod";
import { clientInfo, requireStaffSession } from "@/server/auth";
import { reauthenticate } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";

const body = z.object({ password: z.string().min(1).max(200), code: z.string().min(6).max(12) }).strict();

/** Re-enter password + authenticator code; unlocks sensitive staff actions for 10 minutes. */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const ctx = await requireStaffSession();
  const input = body.parse(await request.json().catch(() => ({})));
  await reauthenticate(getDb(), ctx.session, input, await clientInfo());
  return privateJson({ reauthenticated: true });
});
