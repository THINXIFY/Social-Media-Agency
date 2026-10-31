import "server-only";
import { z } from "zod";
import { GOAL_CHOICES } from "@/lib/ai/registry";
import type { Generator } from "../run";
import { POST_FORMATS } from "./ideas";
import { brief, cleanAll, OutputRuleError, optional, platforms, RULES, text } from "./shared";

/*
 * Content calendar: a 7- or 30-day posting plan. Thirty days are generated
 * one week at a time (5 calls) so each answer stays small and reliable; each
 * week sees the themes already chosen so the month doesn't repeat itself.
 * Days are numbered (Day 1…30), not dated: nothing is scheduled or posted.
 */

const input = z
  .object({
    brand: text(3, 600),
    goal: z.enum(GOAL_CHOICES),
    platforms: platforms(3),
    frequency: optional(z.coerce.number().int().min(1).max(14)).transform((n) => n ?? 3),
    days: z.enum(["7", "30"]).transform(Number),
  })
  .strict();

type Input = z.infer<typeof input>;

const chunk = z
  .object({
    theme: z.string().min(3).max(80).describe("This week's focus."),
    posts: z
      .array(
        z.object({
          day: z.number().int().min(1).max(60).describe("Day number inside the requested range."),
          platform: z.string().max(20),
          format: z.enum(POST_FORMATS),
          topic: z.string().min(3).max(140),
          notes: z.string().max(220).describe("One practical tip for making this post; may be empty."),
        }),
      )
      .min(1)
      .max(28),
  })
  .strict();

const post = z.object({ day: z.number().int().min(1).max(30), week: z.number().int().min(1).max(5), platform: z.string(), format: z.enum(POST_FORMATS), topic: z.string(), notes: z.string() });
const output = z
  .object({
    days: z.union([z.literal(7), z.literal(30)]),
    frequency: z.number().int().min(1).max(14),
    weeks: z.array(z.object({ week: z.number().int().min(1).max(5), theme: z.string(), startDay: z.number().int(), endDay: z.number().int() })).min(1).max(5),
    posts: z.array(post).min(1).max(70),
  })
  .strict();

export type CalendarOutput = z.infer<typeof output>;

/** Week-sized ranges: 7 days → [1–7]; 30 days → [1–7] [8–14] [15–21] [22–28] [29–30]. */
export function weeksOf(days: number) {
  const out: { week: number; start: number; end: number }[] = [];
  for (let start = 1, week = 1; start <= days; start += 7, week++) out.push({ week, start, end: Math.min(days, start + 6) });
  return out;
}

/** Posts expected in a range, keeping the weekly rhythm for a short final range. */
export const postsFor = (frequency: number, length: number) => Math.min(length * 2, Math.max(1, Math.round((frequency * length) / 7)));

const SYSTEM = `${RULES}

Task: plan one stretch of a social media content calendar for the brand in the brief.
- Give the stretch one clear theme that serves the goal, different from any themes already used.
- Plan exactly the number of posts requested, on days inside the requested range only. Spread them sensibly across the days and across the listed platforms (exact names).
- For each post give the format, a specific topic, and one short practical note (or an empty string).
- Vary formats and angles; don't repeat topics from earlier themes.
- Never give posting times, and never claim a day or time performs best.`;

export const calendarGenerator: Generator<Input, CalendarOutput> = {
  input,
  output,
  calls: (i) => weeksOf(i.days).length,
  async execute(i, ask) {
    const weeks: CalendarOutput["weeks"] = [];
    const posts: CalendarOutput["posts"] = [];
    for (const w of weeksOf(i.days)) {
      const count = postsFor(i.frequency, w.end - w.start + 1);
      const res = cleanAll(
        await ask({
          system: SYSTEM,
          input: `${brief({ task: "content calendar", brand: i.brand, goal: i.goal, platforms: i.platforms, postsPerWeek: i.frequency })}\n\nPlan days ${w.start}–${w.end} (week ${w.week} of ${weeksOf(i.days).length}) with exactly ${count} ${count === 1 ? "post" : "posts"}.${weeks.length ? ` Themes already used: ${JSON.stringify(weeks.map((x) => x.theme))}.` : ""}`,
          output: chunk,
        }),
      );
      const inRange = res.posts.filter((p) => p.day >= w.start && p.day <= w.end).slice(0, count);
      if (inRange.length < Math.ceil(count / 2)) throw new OutputRuleError(`week ${w.week} is missing posts`);
      weeks.push({ week: w.week, theme: res.theme, startDay: w.start, endDay: w.end });
      for (const p of inRange.sort((a, b) => a.day - b.day)) posts.push({ ...p, week: w.week, platform: i.platforms.includes(p.platform) ? p.platform : i.platforms[0] });
    }
    return { days: i.days as 7 | 30, frequency: i.frequency, weeks, posts };
  },
};
