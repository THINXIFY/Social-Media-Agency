import "server-only";
import { z } from "zod";
import { CATALOG_PLATFORM_CHOICES, SERVICE_FOCUS } from "@/lib/ai/registry";
import type { ServiceCategory } from "@/lib/catalog";
import { listPublicServices, type PublicService } from "../../catalog/catalog";
import { logger } from "../../log";
import { checkoutEnabled } from "../../orders/orders";
import type { Generator } from "../run";
import { assertNoUnsupportedClaims, budget, GROWTH_RULES, line } from "./growth-shared";
import { brief, cleanAll, optional, text } from "./shared";

/*
 * AI Service Recommender. The PostgreSQL catalog is authoritative:
 *
 *  1. Candidates come from the public catalog query (visible, non-draft,
 *     non-archived services; customer-safe fields only). Prices appear only
 *     for services in `purchasable_services` — all six eligibility gates.
 *  2. The model sees only id, name, category and a trimmed public
 *     description. Never prices, costs, notes, providers or eligibility data.
 *  3. The model ranks candidates and explains fit. Every returned id is
 *     checked against the candidate set; anything else is dropped.
 *  4. Name, price, limits and status shown to the customer come from the
 *     database, not the model. Ordering is offered only for a purchasable
 *     service while checkout is open — and even then the customer completes
 *     the normal New Order flow, which re-checks everything.
 *
 * Read-only: nothing here can approve a service, change a price or
 * eligibility, create an order, touch a wallet or submit fulfillment.
 */

const PLATFORM_IDS = Object.keys(CATALOG_PLATFORM_CHOICES) as [string, ...string[]];

/** "Kind of help" → catalog categories. */
export const FOCUS_CATEGORIES: Record<(typeof SERVICE_FOCUS)[number], ServiceCategory[]> = {
  Audience: ["audience", "community"],
  Engagement: ["engagement", "comments"],
  Views: ["views", "music"],
  Advertising: ["advertising", "promotion", "messaging", "seo"],
};

const input = z
  .object({
    goal: text(10, 500),
    platform: z.enum(PLATFORM_IDS),
    focus: optional(z.enum(SERVICE_FOCUS)),
    budget,
  })
  .strict();
type Input = z.infer<typeof input>;

export const FITS = ["Strong", "Good", "Possible"] as const;
const MAX_CANDIDATES = 30;

const answer = z
  .object({
    picks: z
      .array(
        z
          .object({
            serviceId: z.string().max(80).describe("Exactly one id from the candidates list."),
            fit: z.enum(FITS),
            reason: line(260).describe("Why this service fits the customer's goal."),
            limitations: z.string().max(220).describe("What it won't do or what to keep in mind; may be empty."),
          })
          .strict(),
      )
      .max(5),
    guidance: z.array(line()).min(2).max(4).describe("Practical, non-purchase advice for the goal."),
  })
  .strict();

const recommendation = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    category: z.string(),
    categoryLabel: z.string(),
    status: z.enum(["available", "preview"]),
    price: z.object({ amount: z.number(), unit: z.string() }).nullable(),
    limits: z.object({ min: z.number().nullable(), max: z.number().nullable() }).nullable(),
    fit: z.enum(FITS),
    reason: z.string(),
    limitations: z.string(),
    orderable: z.boolean(),
  })
  .strict();
const output = z
  .object({
    platform: z.object({ id: z.string(), name: z.string() }),
    focus: z.string().nullable(),
    checkoutOpen: z.boolean(),
    candidatesConsidered: z.number().int().min(0),
    recommendations: z.array(recommendation).max(5),
    guidance: z.array(z.string()).min(2).max(4),
  })
  .strict();
export type RecommenderOutput = z.infer<typeof output>;

const SYSTEM = `${GROWTH_RULES}

Task: recommend services from Sociotix's catalog for the customer's goal.
- Choose only from the candidates provided. Use their exact ids. If none genuinely fit, return no picks — never stretch a poor match.
- Pick at most 5, best fit first. For each: how well it fits (Strong, Good or Possible), why it fits this goal, and an honest limitation (for example that paid services support a strategy but don't replace good content).
- Don't mention prices, discounts, delivery times, availability or results — Sociotix shows verified details itself.
- Also give 2–4 pieces of practical guidance for the goal that don't require buying anything.`;

/** Authorized catalog candidates for a platform (and optional focus). Public fields only. */
export async function serviceCandidates(db: Parameters<typeof listPublicServices>[0], platform: string, focus?: (typeof SERVICE_FOCUS)[number]): Promise<PublicService[]> {
  const { items } = await listPublicServices(db, { platform, pageSize: 48, sort: "name" });
  const wanted = focus ? new Set<string>(FOCUS_CATEGORIES[focus]) : null;
  return items.filter((s) => !wanted || wanted.has(s.category)).slice(0, MAX_CANDIDATES);
}

export const recommenderGenerator: Generator<Input, RecommenderOutput> = {
  input,
  output,
  async execute(i, ask, ctx) {
    if (!ctx) throw new Error("The Service Recommender needs read access to the catalog.");
    const { db } = ctx;
    const candidates = await serviceCandidates(db, i.platform, i.focus);
    const open = await checkoutEnabled(db);
    const byId = new Map(candidates.map((s) => [s.id, s]));
    const forModel = candidates.map((s) => ({ id: s.id, name: s.name, category: s.categoryLabel, description: s.description.slice(0, 200) }));

    const raw = cleanAll(
      await ask({
        system: SYSTEM,
        input: `${brief({ task: "service recommendations", goal: i.goal, platform: CATALOG_PLATFORM_CHOICES[i.platform], kindOfHelp: i.focus ?? "any", monthlyBudget: i.budget ?? "not stated" })}\n\n<candidates>\n${JSON.stringify(forModel).replace(/</g, "\\u003c")}\n</candidates>${forModel.length ? "" : "\nThere are no candidates for this platform: return no picks."}`,
        output: answer,
      }),
    );
    assertNoUnsupportedClaims(raw);

    // Server verification: only real, authorized candidates, each once.
    const seen = new Set<string>();
    const verified = raw.picks.filter((p) => {
      const ok = byId.has(p.serviceId) && !seen.has(p.serviceId);
      if (ok) seen.add(p.serviceId);
      return ok;
    });
    const dropped = raw.picks.length - verified.length;
    if (dropped) logger().warn({ tool: "service-recommender", dropped }, "ai recommended services outside the candidate set; dropped");

    return {
      platform: { id: i.platform, name: CATALOG_PLATFORM_CHOICES[i.platform] },
      focus: i.focus ?? null,
      checkoutOpen: open,
      candidatesConsidered: candidates.length,
      recommendations: verified.map((p) => {
        const s = byId.get(p.serviceId)!; // facts from the database, never the model
        return { id: s.id, name: s.name, description: s.description, category: s.category, categoryLabel: s.categoryLabel, status: s.status, price: s.price, limits: s.limits, fit: p.fit, reason: p.reason, limitations: p.limitations, orderable: s.status === "available" && open };
      }),
      guidance: raw.guidance,
    };
  },
};
