import "server-only";
import { z } from "zod";
import { BUSINESS_TYPES } from "@/lib/ai/registry";
import type { Generator } from "../run";
import { assertNoUnsupportedClaims, budget, experience, GROWTH_RULES, growthGoal, growthPlatform, line, shortText } from "./growth-shared";
import { brief, cleanAll, norm, OutputRuleError, optional, text } from "./shared";

/*
 * AI Growth Advisor: an assessment, 3–5 prioritised recommendations with
 * steps, quick wins and next steps. One model call. The profile link is
 * passed as unverified text and is never fetched.
 */

const input = z
  .object({
    challenge: text(10, 800),
    businessType: z.enum(BUSINESS_TYPES),
    niche: text(2, 120),
    platform: growthPlatform,
    goal: growthGoal,
    audience: shortText(160),
    // Context only: http(s) links, never fetched.
    profileUrl: optional(z.string().trim().max(200).regex(/^https?:\/\/[^\s<>"]+$/i, "Enter a full link, starting with https://")),
    budget,
    experience,
  })
  .strict();

export const PRIORITIES = ["High", "Medium", "Low"] as const;

const output = z
  .object({
    assessment: z
      .object({
        goal: line(200).describe("The customer's goal, restated in one sentence."),
        challenges: z.array(line()).min(1).max(4),
        opportunities: z.array(line()).min(1).max(4),
        assumptions: z.array(line()).min(1).max(5).describe("What you assumed because the brief didn't say."),
        missingInfo: z.array(line()).max(4).describe("Information that would make the advice more specific."),
      })
      .strict(),
    recommendations: z
      .array(
        z
          .object({
            priority: z.enum(PRIORITIES),
            title: line(90),
            why: line(260),
            steps: z.array(line()).min(2).max(5),
            activities: z.array(line(160)).min(1).max(4).describe("Concrete content or marketing activities."),
          })
          .strict(),
      )
      .min(3)
      .max(5),
    quickWins: z.array(line()).min(2).max(5),
    nextSteps: z
      .object({
        thisWeek: z.array(line()).min(2).max(5),
        measure: z.array(line()).min(2).max(4).describe("What to track — names of metrics, not invented targets."),
        adjust: z.array(line()).min(1).max(3).describe("How to change course based on what you see."),
      })
      .strict(),
  })
  .strict();

export type AdvisorOutput = z.infer<typeof output>;

const SYSTEM = `${GROWTH_RULES}

Task: write a growth strategy for the customer in the brief.
- assessment: restate their goal; list the key challenges and the most relevant opportunities for their niche and platform; list every important assumption you made; list what's missing that would sharpen the advice.
- recommendations: 3–5, ordered by priority (High first). Each has a clear title, why it matters for this customer, 2–5 practical steps and concrete activities (for example a specific post series or format).
- quickWins: actions they can do today or this week with little effort.
- nextSteps: what to do this week, what to measure (metric names only — no targets) and how to adjust.
- Size everything to their experience and budget when given; with no budget, rely on organic tactics.`;

export const advisorGenerator: Generator<z.infer<typeof input>, AdvisorOutput> = {
  input,
  output,
  async execute(i, ask) {
    const raw = await ask({
      system: SYSTEM,
      input: brief({
        task: "growth strategy",
        challenge: i.challenge,
        businessType: i.businessType,
        niche: i.niche,
        mainPlatform: i.platform,
        goal: i.goal,
        audience: i.audience ?? null,
        unverifiedProfileLink: i.profileUrl ?? null,
        monthlyBudget: i.budget ?? "not stated",
        experience: i.experience ?? "not stated",
      }),
      output,
    });
    const result = cleanAll(raw);
    assertNoUnsupportedClaims(result);
    // Distinct recommendations, highest priority first.
    if (new Set(result.recommendations.map((r) => norm(r.title))).size !== result.recommendations.length) throw new OutputRuleError("duplicate recommendations");
    result.recommendations.sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority));
    return result;
  },
};
