import { connection } from "next/server";
import { z } from "zod";
import { CATALOG_PLATFORM_CHOICES } from "@/lib/ai/registry";
import { findCandidates, parseServiceQuery, platformName, toCard } from "@/server/ai/catalog-query";
import { getDb } from "@/server/db/client";
import { route } from "@/server/http";
import { checkoutEnabled } from "@/server/orders/orders";

/**
 * Keyword service search (AI-04) — no AI. Parses the request with the same
 * deterministic rules AI Search uses (platform and need words), queries the
 * public catalog and ranks by simple relevance. Free, no account needed, no
 * model and no budget. Customer-safe fields only; prices only for services
 * that pass every eligibility gate. Results say plainly why they matched.
 */
const query = z.object({
  q: z.string().trim().min(2).max(300),
  platform: z.enum(Object.keys(CATALOG_PLATFORM_CHOICES) as [string, ...string[]]).optional(),
});

export const GET = route(async (request) => {
  await connection();
  const p = new URL(request.url).searchParams;
  const { q, platform } = query.parse({ q: p.get("q") ?? "", platform: p.get("platform") || undefined });
  const db = getDb();
  const parsed = parseServiceQuery(q);
  const [found, open] = await Promise.all([findCandidates(db, parsed, { platform, limit: 12 }), checkoutEnabled(db)]);
  return Response.json(
    {
      mode: "keyword",
      query: q,
      detected: { platforms: (platform ? [platform] : parsed.platforms).map(platformName), categories: parsed.categories },
      checkoutOpen: open,
      results: found.map((s) => toCard(s, s.matched.length ? `Matches ${s.matched.join(" · ")}` : "Matches your words", open)),
    },
    { headers: { "cache-control": "public, max-age=60" } },
  );
});
