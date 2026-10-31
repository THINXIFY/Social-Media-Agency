import "server-only";
import { z } from "zod";
import { TONE_CHOICES as TONES } from "@/lib/ai/registry";
import type { Generator } from "../run";
import { brief, cleanAll, norm, optional, OutputRuleError, platforms, RULES, text } from "./shared";

const input = z
  .object({
    topic: text(3, 600),
    platforms: platforms(3),
    tone: optional(z.enum(TONES)),
    audience: optional(text(2, 160)),
  })
  .strict();

const variation = z.object({
  angle: z.string().min(2).max(40).describe("A two-to-four word label for this variation's approach, e.g. 'Story-led'."),
  text: z.string().min(10).max(2_200).describe("The full caption, ready to post."),
});

const output = z
  .object({
    platforms: z
      .array(z.object({ platform: z.string().max(20), variations: z.array(variation).length(3) }))
      .min(1)
      .max(3),
    hooks: z.array(z.string().min(3).max(140)).min(3).max(5).describe("Short opening lines the customer can swap in."),
    ctas: z.array(z.string().min(3).max(140)).min(2).max(3).describe("Closing calls to action."),
  })
  .strict();

export type CaptionOutput = z.infer<typeof output>;

const SYSTEM = `${RULES}

Task: write captions for the post described in the brief.
- For each platform listed in the brief, write exactly 3 caption variations. Each variation must take a clearly different approach (for example story-led, benefit-led, question-led) — not small rewordings of each other.
- Shape each caption for how people read on that platform: length, line breaks, emoji use and hashtag habits. Keep hashtags to at most 5 per caption, and none on LinkedIn unless they fit naturally.
- Match the tone and audience in the brief when given.
- Also write 3–5 short hook lines and 2–3 calls to action that suit the post.
- Return platforms in the same order as the brief, using the exact platform names given.`;

export const captionGenerator: Generator<z.infer<typeof input>, CaptionOutput> = {
  input,
  output,
  async execute(i, ask) {
    const raw = await ask({ system: SYSTEM, input: brief({ task: "captions", topic: i.topic, platforms: i.platforms, tone: i.tone ?? "Friendly", audience: i.audience ?? null }), output });
    const result = cleanAll(raw);
    // Exactly the requested platforms, each once, with three genuinely different captions.
    const names = result.platforms.map((p) => p.platform);
    if (names.length !== i.platforms.length || !i.platforms.every((p) => names.includes(p))) throw new OutputRuleError("platforms don't match the request");
    for (const p of result.platforms) {
      const texts = p.variations.map((v) => norm(v.text));
      if (texts.some((t) => t.length < 10) || new Set(texts).size !== texts.length) throw new OutputRuleError("variations aren't distinct");
    }
    result.platforms.sort((a, b) => i.platforms.indexOf(a.platform) - i.platforms.indexOf(b.platform));
    return result;
  },
};
