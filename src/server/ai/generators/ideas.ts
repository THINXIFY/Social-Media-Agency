import "server-only";
import { z } from "zod";
import { GOAL_CHOICES } from "@/lib/ai/registry";
import type { Generator } from "../run";
import { brief, cleanAll, norm, OutputRuleError, platforms, RULES, text } from "./shared";

const input = z.object({ brand: text(3, 600), goal: z.enum(GOAL_CHOICES), platforms: platforms(3) }).strict();

export const IDEA_CATEGORIES = ["Educational", "Behind the scenes", "Promotional", "Community", "Entertaining", "Inspirational", "Social proof"] as const;
export const POST_FORMATS = ["Carousel", "Short video", "Single image", "Story", "Text post", "Live", "Poll"] as const;

const output = z
  .object({
    ideas: z
      .array(
        z.object({
          title: z.string().min(3).max(90),
          category: z.enum(IDEA_CATEGORIES),
          format: z.enum(POST_FORMATS),
          platform: z.string().max(20),
          hook: z.string().min(3).max(160).describe("The opening line or first frame."),
          outline: z.array(z.string().min(3).max(160)).min(3).max(5).describe("Points to build the post from."),
        }),
      )
      .min(5)
      .max(8),
  })
  .strict();

export type IdeasOutput = z.infer<typeof output>;

const SYSTEM = `${RULES}

Task: suggest 6 post ideas for the brand in the brief that serve its goal on the platforms listed.
- Spread the ideas across at least 4 different categories and at least 3 different formats. No two ideas may share the same angle.
- Assign each idea to one of the listed platforms (exact names) and pick a format that platform supports.
- Each idea has a short title, a hook (the opening line or first frame) and an outline of 3–5 points to build the post from.
- Ideas are starting points: practical, specific to the brand, and achievable without a big budget. Don't promise results.`;

export const ideasGenerator: Generator<z.infer<typeof input>, IdeasOutput> = {
  input,
  output,
  async execute(i, ask) {
    const result = cleanAll(await ask({ system: SYSTEM, input: brief({ task: "post ideas", brand: i.brand, goal: i.goal, platforms: i.platforms }), output }));
    // Platform must be one the customer picked; fall back to the first pick rather than show a wrong one.
    for (const idea of result.ideas) if (!i.platforms.includes(idea.platform)) idea.platform = i.platforms[0];
    if (new Set(result.ideas.map((x) => norm(x.title))).size !== result.ideas.length) throw new OutputRuleError("duplicate ideas");
    return result;
  },
};
