import "server-only";
import { z } from "zod";
import { CATALOG_PLATFORM_CHOICES } from "@/lib/ai/registry";
import { findCandidates, forModel, parseServiceQuery, platformName, type ServiceCard, toCard } from "../catalog-query";
import { logger } from "../../log";
import { checkoutEnabled } from "../../orders/orders";
import type { Generator } from "../run";
import { assertNoUnsupportedClaims, GROWTH_RULES, line } from "./growth-shared";
import { brief, cleanAll, optional, text } from "./shared";

/*
 * AI-Powered Service Search. Same grounding as the Service Recommender:
 * the server parses the request and retrieves public catalog candidates; the
 * model only interprets intent and ranks candidate ids; every id is checked
 * against the candidate set; every card is built from the catalog record.
 * No match percentages or confidence scores — only plain reasons.
 */

const PLATFORM_IDS = Object.keys(CATALOG_PLATFORM_CHOICES) as [string, ...string[]];

const input = z
  .object({
    query: text(3, 300),
    platform: optional(z.enum(PLATFORM_IDS)),
  })
  .strict();
type Input = z.infer<typeof input>;

const pick = z.object({ serviceId: z.string().max(80), why: line(200).describe("Why it matches, in plain words.") }).strict();
const answer = z
  .object({
    intent: line(160).describe("What the customer is looking for, restated in one short sentence."),
    best: z.array(pick).max(4),
    alternatives: z.array(pick).max(4),
    guidance: z.array(line()).max(3),
    clarifyingQuestion: z.string().max(200).describe("One short question if the request is too vague to match well; otherwise empty."),
  })
  .strict();

const card = z.object({ id: z.string(), name: z.string(), description: z.string(), platform: z.object({ id: z.string(), name: z.string() }), category: z.string(), categoryLabel: z.string(), status: z.enum(["available", "preview"]), price: z.object({ amount: z.number(), unit: z.string() }).nullable(), limits: z.object({ min: z.number().nullable(), max: z.number().nullable() }).nullable(), fields: z.array(z.object({ id: z.string(), label: z.string(), required: z.boolean() })), orderable: z.boolean(), why: z.string() }).strict();
const output = z
  .object({
    mode: z.literal("ai"),
    query: z.string(),
    intent: z.string(),
    detected: z.object({ platforms: z.array(z.string()), categories: z.array(z.string()) }),
    candidatesConsidered: z.number().int().min(0),
    checkoutOpen: z.boolean(),
    best: z.array(card).max(4),
    alternatives: z.array(card).max(4),
    guidance: z.array(z.string()).max(3),
    clarifyingQuestion: z.string(),
  })
  .strict();
export type SearchOutput = z.infer<typeof output>;

const SYSTEM = `${GROWTH_RULES}

Task: match the customer's request to services in SociVanta's catalog.
- Choose only from the candidates provided, by their exact ids. Never include a service that doesn't genuinely fit — an empty list is better than a weak match.
- best: up to 4 services that directly serve the request. alternatives: up to 4 that could also help. No service in both.
- Explain each match in plain words. Never mention prices, discounts, delivery times, availability, match percentages or results.
- If the request is too vague to match well (for example no platform or goal), ask one short clarifying question and keep the lists short.
- guidance: up to 3 practical tips for the request that don't require buying anything.`;

export const searchGenerator: Generator<Input, SearchOutput> = {
  input,
  output,
  async execute(i, ask, ctx) {
    if (!ctx) throw new Error("Service Search needs read access to the catalog.");
    const parsed = parseServiceQuery(i.query);
    const candidates = await findCandidates(ctx.db, parsed, { platform: i.platform, limit: 40, includeUnscored: true });
    const open = await checkoutEnabled(ctx.db);
    const byId = new Map(candidates.map((s) => [s.id, s]));

    const raw = cleanAll(
      await ask({
        system: SYSTEM,
        input: `${brief({ task: "service search", request: i.query, platformFilter: i.platform ? platformName(i.platform) : null, detectedPlatforms: parsed.platforms.map(platformName), detectedNeeds: parsed.categories })}\n\n<candidates>\n${JSON.stringify(candidates.map(forModel)).replace(/</g, "\\u003c")}\n</candidates>${candidates.length ? "" : "\nThere are no candidates: return empty lists and helpful guidance."}`,
        output: answer,
      }),
    );
    assertNoUnsupportedClaims(raw);

    // Server verification: real candidates only, each shown once, best before alternatives.
    const seen = new Set<string>();
    const verify = (picks: z.infer<typeof pick>[]): ServiceCard[] =>
      picks.flatMap((p) => {
        const s = byId.get(p.serviceId);
        if (!s || seen.has(p.serviceId)) return [];
        seen.add(p.serviceId);
        return [toCard(s, p.why, open)];
      });
    const best = verify(raw.best);
    const alternatives = verify(raw.alternatives);
    const dropped = raw.best.length + raw.alternatives.length - best.length - alternatives.length;
    if (dropped) logger().warn({ tool: "service-search", dropped }, "ai search returned services outside the candidate set; dropped");

    return {
      mode: "ai" as const,
      query: i.query,
      intent: raw.intent,
      detected: { platforms: parsed.platforms.map(platformName), categories: parsed.categories },
      candidatesConsidered: candidates.length,
      checkoutOpen: open,
      best,
      alternatives,
      guidance: raw.guidance,
      clarifyingQuestion: raw.clarifyingQuestion.trim(),
    };
  },
};
