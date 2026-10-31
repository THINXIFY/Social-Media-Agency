import "server-only";
import { z } from "zod";
import { TIME_AVAILABLE } from "@/lib/ai/registry";
import type { Generator } from "../run";
import { assertNoUnsupportedClaims, budget, experience, GROWTH_RULES, growthGoal, growthPlatform, line, shortText } from "./growth-shared";
import { brief, cleanAll, norm, OutputRuleError, text } from "./shared";
import { PRIORITIES } from "./advisor";

/*
 * AI Growth Roadmap: 7 days (one stage per day), 30 days (one per week) or
 * 90 days (one per month, each with weekly milestones). The 90-day plan is
 * generated a month at a time (3 calls, all reserved up front); each month
 * sees what came before so the plan builds instead of repeating. Stage
 * labels and order are set by the server, never by the model.
 */

const input = z
  .object({
    niche: text(10, 600),
    platform: growthPlatform,
    objective: growthGoal,
    time: z.enum(TIME_AVAILABLE),
    duration: z.enum(["7", "30", "90"]).transform(Number),
    challenge: shortText(200),
    experience,
    budget,
  })
  .strict();
type Input = z.infer<typeof input>;

const task = z.object({ task: line(160), priority: z.enum(PRIORITIES), detail: z.string().max(220).describe("How to do it, in one sentence; may be empty.") }).strict();
const stage = z
  .object({
    title: line(80),
    focus: line(200),
    milestone: line(200).describe("What 'done' looks like at the end of this stage."),
    tasks: z.array(task).min(2).max(5),
    activities: z.array(line(160)).min(1).max(3).describe("Suggested content activities."),
    dependsOn: z.string().max(200).describe("What must be done first; may be empty."),
    checkpoint: line(200).describe("What to review at the end of this stage."),
  })
  .strict();
const month = stage.extend({ weeks: z.array(line(160)).length(4).describe("One milestone per week of this month.") });

const planHead = z.object({ objective: line(240), successIndicators: z.array(line(160)).min(2).max(5).describe("What to measure — metric names, not targets."), nextSteps: z.array(line()).min(2).max(4) }).strict();

const outStage = stage.extend({ period: z.string(), weeks: z.array(z.string()).optional() });
const output = z
  .object({
    duration: z.union([z.literal(7), z.literal(30), z.literal(90)]),
    objective: z.string(),
    stages: z.array(outStage).min(3).max(7),
    successIndicators: z.array(z.string()).min(2).max(5),
    nextSteps: z.array(z.string()).min(2).max(4),
  })
  .strict();
export type RoadmapOutput = z.infer<typeof output>;

/** How many stages each plan has, and what they're called. */
export const stagesFor = (d: number) => (d === 7 ? Array.from({ length: 7 }, (_, i) => `Day ${i + 1}`) : d === 30 ? ["Week 1", "Week 2", "Week 3", "Week 4 (days 22–30)"] : ["Month 1", "Month 2", "Month 3"]);

const SYSTEM = `${GROWTH_RULES}

Task: build part of a growth roadmap for the customer in the brief.
- Size the work to the time they say they have. With little time, fewer and simpler tasks.
- Each stage has a title, a focus, a milestone (what "done" looks like), 2–5 prioritised tasks, 1–3 content activities, what it depends on (or an empty string) and a review checkpoint.
- Build stage on stage: later stages use what earlier ones set up. Never repeat a task from an earlier stage.
- Success indicators are metric names to watch, not numeric targets.`;

const context = (i: Input) =>
  brief({ task: "growth roadmap", business: i.niche, mainPlatform: i.platform, objective: i.objective, timeAvailable: i.time, challenge: i.challenge ?? null, experience: i.experience ?? "not stated", monthlyBudget: i.budget ?? "not stated", planLength: `${i.duration} days` });

export const roadmapGenerator: Generator<Input, RoadmapOutput> = {
  input,
  output,
  calls: (i) => (i.duration === 90 ? 3 : 1),
  async execute(i, ask) {
    const labels = stagesFor(i.duration);
    let head: z.infer<typeof planHead>;
    let stages: (z.infer<typeof stage> & { weeks?: string[] })[];

    if (i.duration !== 90) {
      const shape = planHead.extend({ stages: z.array(stage).length(labels.length) });
      const res = cleanAll(await ask({ system: SYSTEM, input: `${context(i)}\n\nPlan ${labels.length} stages in order: ${labels.join(", ")}.`, output: shape }));
      head = { objective: res.objective, successIndicators: res.successIndicators, nextSteps: res.nextSteps };
      stages = res.stages;
    } else {
      // Month 1 also sets the objective and indicators; months 2–3 continue from what came before.
      const first = cleanAll(await ask({ system: SYSTEM, input: `${context(i)}\n\nPlan Month 1 of 3, with one milestone per week. Also set the overall objective, success indicators and immediate next steps.`, output: planHead.extend({ month }) }));
      head = { objective: first.objective, successIndicators: first.successIndicators, nextSteps: first.nextSteps };
      stages = [first.month];
      for (const n of [2, 3]) {
        const prior = stages.map((s, k) => ({ month: k + 1, title: s.title, milestone: s.milestone, tasks: s.tasks.map((t) => t.task) }));
        const res = cleanAll(await ask({ system: SYSTEM, input: `${context(i)}\n\nOverall objective: ${JSON.stringify(head.objective)}\nAlready planned: ${JSON.stringify(prior)}\n\nPlan Month ${n} of 3, with one milestone per week. Build on what's already planned and don't repeat its tasks.`, output: z.object({ month }).strict() }));
        stages.push(res.month);
      }
    }

    // No task twice across the plan; every stage must keep at least one task.
    const seen = new Set<string>();
    for (const s of stages) {
      s.tasks = s.tasks.filter((t) => {
        const k = norm(t.task);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (!s.tasks.length) throw new OutputRuleError("a stage repeats earlier tasks only");
      s.tasks.sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority));
    }
    const result = { duration: i.duration as 7 | 30 | 90, ...head, stages: stages.map((s, k) => ({ ...s, period: labels[k] })) };
    assertNoUnsupportedClaims(result);
    return result;
  },
};
