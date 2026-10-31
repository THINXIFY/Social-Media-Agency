import "server-only";
import { z } from "zod";
import type { Generator } from "../run";
import { brief, cleanAll, norm, OutputRuleError, platforms, RULES, text } from "./shared";

const input = z.object({ topic: text(3, 600), platforms: platforms(3) }).strict();

export const HASHTAG_GROUPS = ["Broad", "Specific", "Niche & community"] as const;

/*
 * Deliberately no numbers: the answer can't carry search volume, popularity,
 * difficulty, trend or performance figures, because the model doesn't have
 * real data for any of them.
 */
const output = z
  .object({
    groups: z
      .array(
        z.object({
          group: z.enum(HASHTAG_GROUPS),
          tags: z.array(z.string().min(2).max(60)).min(3).max(10),
        }),
      )
      .length(3),
    keywords: z.array(z.string().min(2).max(80)).min(3).max(10).describe("Plain search phrases people might type, without #."),
  })
  .strict();

export type HashtagOutput = z.infer<typeof output>;

const SYSTEM = `${RULES}

Task: suggest hashtags and search keywords for the topic in the brief, suited to the platforms listed.
- Return three groups, in this order: "Broad" (wide, general tags), "Specific" (clearly about this topic), "Niche & community" (smaller communities and specific interests).
- 5–8 hashtags per group. Each hashtag starts with # and contains only letters, numbers and underscores — no spaces or punctuation. No duplicates across groups.
- Only suggest tags that are plausibly relevant to the topic. Never describe tags as popular, trending, high-volume, low-competition or "best performing", and don't include any numbers about them.
- Then 5–8 keywords: natural phrases people might search for, without #.`;

const TAG = /^#[\p{L}\p{N}_]{1,59}$/u;

/** Tidy and de-duplicate tags; drop anything that isn't a valid hashtag. */
function tidy(tags: string[], seen: Set<string>) {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = `#${raw.trim().replace(/^#+/, "").replace(/\s+/g, "")}`;
    const key = tag.toLowerCase();
    if (!TAG.test(tag) || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export const hashtagGenerator: Generator<z.infer<typeof input>, HashtagOutput> = {
  input,
  output,
  async execute(i, ask) {
    const raw = cleanAll(await ask({ system: SYSTEM, input: brief({ task: "hashtags and keywords", topic: i.topic, platforms: i.platforms }), output }));
    const seen = new Set<string>();
    const groups = HASHTAG_GROUPS.map((g) => ({ group: g, tags: tidy(raw.groups.find((x) => x.group === g)?.tags ?? [], seen) }));
    if (groups.some((g) => g.tags.length < 2)) throw new OutputRuleError("too few valid hashtags in a group");
    const keys = new Set<string>();
    const keywords = raw.keywords.map((k) => k.replace(/^#+/, "").trim()).filter((k) => k.length >= 2 && !keys.has(norm(k)) && keys.add(norm(k)));
    if (keywords.length < 2) throw new OutputRuleError("too few keywords");
    return { groups, keywords };
  },
};
