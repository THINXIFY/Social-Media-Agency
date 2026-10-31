import "server-only";
import { z } from "zod";
import { BUDGET_RANGES, GROWTH_GOALS, PLATFORM_CHOICES } from "@/lib/ai/registry";
import type { Generator } from "../run";
import { assertNoUnsupportedClaims, GROWTH_RULES, line, shortText } from "./growth-shared";
import { brief, cleanAll, OutputRuleError, optional, text } from "./shared";

/*
 * AI Campaign Studio (AI-07). A goal-based campaign plan: themes, a weekly
 * plan, formats, caption/CTA ideas, improvements, metrics to review and next
 * steps. No account analytics are authorised for any customer yet, so the
 * plan is always labelled goal-based by the server — never by the model —
 * and invented statistics, audience demographics or results are rejected.
 * It suggests; it never drafts, schedules or publishes anything itself.
 */

export const CAMPAIGN_WEEKS = ["2", "4", "6", "8"] as const;

const input = z
  .object({
    niche: text(10, 600),
    objective: z.enum(GROWTH_GOALS),
    platforms: z.array(z.enum(PLATFORM_CHOICES as [string, ...string[]])).min(1).max(3),
    audience: shortText(240),
    weeks: z.enum(CAMPAIGN_WEEKS).transform(Number),
    themes: shortText(300),
    budget: optional(z.enum(BUDGET_RANGES)),
    context: shortText(600),
  })
  .strict();
type Input = z.infer<typeof input>;

const shape = (weeks: number, platforms: string[]) =>
  z
    .object({
      objective: line(240),
      assumptions: z.array(line(200)).min(1).max(4).describe("What this plan assumes about the business, stated as assumptions — never as facts or data."),
      themes: z.array(z.object({ name: line(80), why: line(200) }).strict()).min(2).max(5),
      weeklyPlan: z.array(z.object({ focus: line(160), activities: z.array(line(180)).min(2).max(4) }).strict()).length(weeks),
      formats: z.array(z.object({ platform: z.enum(platforms as [string, ...string[]]), format: line(80), why: line(200) }).strict()).min(2).max(6),
      captionIdeas: z.array(z.object({ platform: z.enum(platforms as [string, ...string[]]), caption: z.string().min(10).max(600), cta: line(120) }).strict()).min(2).max(6),
      improvements: z.array(line(220)).min(2).max(5),
      metrics: z.array(line(120)).min(2).max(6).describe("Metric names to review on the platform — not targets or numbers."),
      nextSteps: z.array(line(200)).min(2).max(4),
    })
    .strict();

const output = z
  .object({
    basis: z.literal("goal-based"),
    weeks: z.number().int(),
    objective: z.string(),
    assumptions: z.array(z.string()),
    themes: z.array(z.object({ name: z.string(), why: z.string() })),
    weeklyPlan: z.array(z.object({ week: z.string(), focus: z.string(), activities: z.array(z.string()) })),
    formats: z.array(z.object({ platform: z.string(), format: z.string(), why: z.string() })),
    captionIdeas: z.array(z.object({ platform: z.string(), caption: z.string(), cta: z.string() })),
    improvements: z.array(z.string()),
    metrics: z.array(z.string()),
    nextSteps: z.array(z.string()),
  })
  .strict();
export type CampaignOutput = z.infer<typeof output>;

const SYSTEM = `${GROWTH_RULES}

Task: plan a social media campaign for the customer in the brief.
- This plan is goal-based: you have NO analytics for the customer. Never describe their audience's demographics, past performance or trends as facts; put anything you assume under "assumptions".
- One weekly entry per campaign week, in order, each building on the last.
- Formats and caption ideas only for the platforms in the brief. Caption ideas are starting points the customer will edit.
- Metrics are names of things to review on the platform (for example "saves per post"), never numeric targets.
- Never suggest paid ads spending amounts, buying engagement or anything that would act on the customer's accounts.`;

// Audience demographics stated as fact ("your audience is mostly women aged 25–34").
const DEMOGRAPHIC = /\b(?:your|the)\s+(?:audience|followers|customers)\s+(?:is|are)\s+(?:mostly|mainly|primarily|largely)\b|\baged?\s+\d{2}\s*[-–]\s*\d{2}\b/i;

export const campaignGenerator: Generator<Input, CampaignOutput> = {
  input,
  output,
  async execute(i, ask) {
    const res = cleanAll(
      await ask({
        system: SYSTEM,
        input: brief({ task: "campaign plan", business: i.niche, objective: i.objective, platforms: i.platforms, audience: i.audience ?? "not stated", campaignLength: `${i.weeks} weeks`, themesToInclude: i.themes ?? null, monthlyBudget: i.budget ?? "not stated", existingContext: i.context ?? null }),
        output: shape(i.weeks, i.platforms),
      }),
    );
    const result: CampaignOutput = { basis: "goal-based", weeks: i.weeks, ...res, weeklyPlan: res.weeklyPlan.map((w, k) => ({ week: `Week ${k + 1}`, ...w })) };
    assertNoUnsupportedClaims(result);
    if (DEMOGRAPHIC.test(JSON.stringify(result))) throw new OutputRuleError("states audience demographics as fact");
    return result;
  },
};
