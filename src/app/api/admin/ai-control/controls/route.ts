import { z } from "zod";
import { clientInfo } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { manager, sensitive } from "@/server/ai/control/admin";
import { saveControls, setEmergency } from "@/server/ai/control/controls";

const SaveBody = z.strictObject({ controls: z.unknown(), version: z.number().int().min(0) });
const EmergencyBody = z.strictObject({ paused: z.boolean() });

/** Budgets, limits and disabled providers (Security settings + re-authentication). */
export const PUT = route(async (request) => {
  assertSameOrigin(request);
  const actor = await sensitive();
  const body = SaveBody.parse(await request.json().catch(() => ({})));
  await saveControls(getDb(), actor, body.controls, body.version, await clientInfo());
  return privateJson({ ok: true });
});

/** Emergency pause: pausing is fast (Settings: Manage); resuming needs Security settings + re-authentication. */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const { paused } = EmergencyBody.parse(await request.json().catch(() => ({})));
  const actor = paused ? await manager() : await sensitive();
  await setEmergency(getDb(), actor, paused, await clientInfo());
  return privateJson({ ok: true });
});
