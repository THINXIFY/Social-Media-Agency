import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { aiProfile, saveAiProfile } from "@/server/ai/workspace";
import { assertSameOrigin, privateJson, route } from "@/server/http";

/** The signed-in customer's own Sociotix AI preferences. */
export const GET = route(async () => {
  const actor = await requireCustomer();
  return privateJson({ profile: await aiProfile(getDb(), actor.customerId) });
});

/** Saves the onboarding choices (or "skip") for the signed-in customer only; the body can't name another account. */
export const PUT = route(async (request) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  return privateJson({ profile: await saveAiProfile(getDb(), actor.customerId, await request.json().catch(() => ({}))) });
});
