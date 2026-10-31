import { connection } from "next/server";
import { AI_TOOLS } from "@/lib/ai/registry";
import { privateJson, route } from "@/server/http";
import { effectiveAvailability } from "@/server/ai/run";

/** Public tool list with each tool's real availability right now. No provider details or secrets. */
export const GET = route(async () => {
  await connection();
  return privateJson({
    tools: AI_TOOLS.map((t) => ({ id: t.id, slug: t.slug, name: t.name, category: t.category, availability: effectiveAvailability(t), auth: t.auth, free: t.free })),
  });
});
