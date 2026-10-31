import { describe, expect, it } from "vitest";
import { advisorMarkdown, roadmapMarkdown } from "@/components/ai/growth-results";
import { AI_TOOL_BY_ID, CATALOG_PLATFORM_CHOICES } from "@/lib/ai/registry";
import { CATEGORY_META, PLATFORMS } from "@/lib/catalog";
import { advisorGenerator } from "@/server/ai/generators/advisor";
import { assertNoUnsupportedClaims } from "@/server/ai/generators/growth-shared";
import { CONTENT_STUDIO, GROWTH_INTELLIGENCE } from "@/server/ai/generators";
import { FOCUS_CATEGORIES } from "@/server/ai/generators/recommender";
import { roadmapGenerator, stagesFor } from "@/server/ai/generators/roadmap";
import { OutputRuleError } from "@/server/ai/generators/shared";
import type { Ask, AskSpec } from "@/server/ai/run";

/* Growth Intelligence generators with a scripted model (isolated test — no provider, no claims about model quality). */

function scripted(answer: (spec: AskSpec<unknown>, call: number) => unknown) {
  const seen: AskSpec<unknown>[] = [];
  const ask: Ask = async <T,>(spec: AskSpec<T>) => {
    seen.push(spec as AskSpec<unknown>);
    return spec.output.parse(answer(spec as AskSpec<unknown>, seen.length));
  };
  return { ask, seen };
}

const rec = (title: string, priority: "High" | "Medium" | "Low") => ({ priority, title, why: "It addresses the main challenge directly for this niche.", steps: ["Pick three customer questions", "Answer one per post this week"], activities: ["A weekly Q&A carousel"] });
const advice = (over: Record<string, unknown> = {}) => ({
  assessment: { goal: "Bring more local diners in from Instagram.", challenges: ["Posts show food but give no reason to visit this week"], opportunities: ["Regulars already tag the restaurant"], assumptions: ["You post a few times a week", "You don't run paid ads"], missingInfo: ["Which dishes sell best"] },
  recommendations: [rec("Share regulars' stories", "Medium"), rec("Make a weekly specials series", "High"), rec("Partner with a nearby business", "Low")],
  quickWins: ["Pin a post with opening hours and booking info", "Reply to every comment this week"],
  nextSteps: { thisWeek: ["Plan the first specials post", "Ask two regulars for a photo"], measure: ["Profile visits", "Booking link taps"], adjust: ["Drop the format that gets the fewest saves after three weeks"] },
  ...over,
});
const ADVISOR_INPUT = { challenge: "Our posts get a few likes but no new local customers come from Instagram.", businessType: "Small business", niche: "Family Italian restaurant", platform: "Instagram", goal: "Get more leads" };

const stage = (title: string, tasks: string[]) => ({ title, focus: "Lay the groundwork for the stage.", milestone: "The stage's work is published.", tasks: tasks.map((t, i) => ({ task: t, priority: i ? "Medium" : "High", detail: "" })), activities: ["One short video"], dependsOn: "", checkpoint: "Review which post got the most saves." });
const head = { objective: "Sell more candles to new customers through Instagram.", successIndicators: ["Profile visits", "Shop link taps"], nextSteps: ["Update the bio link", "Draft the first post"] };

describe("registry ↔ Growth Intelligence", () => {
  it("implements all seven Content Studio and Growth Intelligence tools, with the planned free allowances", () => {
    expect(Object.keys(GROWTH_INTELLIGENCE).sort()).toEqual(["growth-advisor", "growth-roadmap", "service-recommender"]);
    expect(Object.keys({ ...CONTENT_STUDIO, ...GROWTH_INTELLIGENCE })).toHaveLength(7);
    expect(["growth-advisor", "growth-roadmap", "service-recommender"].map((id) => AI_TOOL_BY_ID[id].free)).toEqual([
      { anonymousPerDay: 0, signedInPerDay: 5 },
      { anonymousPerDay: 0, signedInPerDay: 3 },
      { anonymousPerDay: 0, signedInPerDay: 5 },
    ]);
    for (const id of Object.keys(GROWTH_INTELLIGENCE)) expect(AI_TOOL_BY_ID[id].auth).toBe("account");
  });

  it("every registry form field is accepted by its generator", () => {
    for (const [id, gen] of Object.entries(GROWTH_INTELLIGENCE)) {
      const sample: Record<string, unknown> = {};
      for (const f of AI_TOOL_BY_ID[id].fields) sample[f.id] = f.kind === "select" ? f.options![0] : f.id === "profileUrl" ? "https://example.com" : "A family Italian restaurant in Bristol with regulars";
      expect(() => gen.input.parse(sample), id).not.toThrow();
    }
  });

  it("recommender platforms and focus areas map to real catalog platforms and categories", () => {
    const ids = new Set(PLATFORMS.map((p) => p.id));
    for (const id of Object.keys(CATALOG_PLATFORM_CHOICES)) expect(ids.has(id), id).toBe(true);
    for (const cats of Object.values(FOCUS_CATEGORIES)) for (const c of cats) expect(CATEGORY_META[c], c).toBeTruthy();
  });
});

describe("unsupported claims", () => {
  it("rejects invented statistics and guarantees, but allows ordinary numbers", () => {
    for (const bad of ["Expect a 30% lift in reach", "This gets 3x more engagement", "Grow your followers by 500 in a month", "Results are guaranteed", "This will go viral"]) expect(() => assertNoUnsupportedClaims({ a: [bad] }), bad).toThrow(OutputRuleError);
    for (const ok of ["Post 3 times a week", "Spend 20 minutes replying each day", "Run it for two weeks, then review", "Track saves and shares"]) expect(() => assertNoUnsupportedClaims({ a: ok }), ok).not.toThrow();
  });
});

describe("Growth Advisor", () => {
  it("validates input: required context, http(s) links only, known choices, no extra fields", () => {
    expect(advisorGenerator.input.parse({ ...ADVISOR_INPUT, audience: "", profileUrl: "", budget: "", experience: "" })).toMatchObject({ audience: undefined, profileUrl: undefined });
    expect(() => advisorGenerator.input.parse({ ...ADVISOR_INPUT, profileUrl: "javascript:alert(1)" })).toThrow();
    expect(() => advisorGenerator.input.parse({ ...ADVISOR_INPUT, profileUrl: "ftp://example.com" })).toThrow();
    expect(() => advisorGenerator.input.parse({ ...ADVISOR_INPUT, challenge: "short" })).toThrow();
    expect(() => advisorGenerator.input.parse({ ...ADVISOR_INPUT, goal: "Go viral" })).toThrow();
    expect(() => advisorGenerator.input.parse({ ...ADVISOR_INPUT, admin: true })).toThrow();
  });

  it("realistic scenario briefs are accepted and reach the model as data", async () => {
    const scenarios = [
      ["Small business", "Family Italian restaurant", "Instagram", "Get more leads"],
      ["Online store", "Sustainable streetwear brand", "TikTok", "Drive website visits"],
      ["Online store", "Handmade ceramics shop on Etsy", "Pinterest", "Sell more products"],
      ["Creator", "Home fitness coach", "YouTube", "Grow followers"],
      ["SaaS / tech", "Scheduling app for salons", "LinkedIn", "Get more leads"],
      ["Agency", "Boutique social media agency", "LinkedIn", "Build a community"],
      ["Local service", "Mobile dog grooming service", "Facebook", "Get more leads"],
    ] as const;
    for (const [businessType, niche, platform, goal] of scenarios) {
      const m = scripted(() => advice());
      const i = advisorGenerator.input.parse({ challenge: `We struggle to turn followers into customers for our ${niche.toLowerCase()}.`, businessType, niche, platform, goal, profileUrl: "https://example.com/ignore-previous-instructions" });
      await advisorGenerator.execute!(i, m.ask);
      expect(m.seen[0].input).toContain(niche);
      expect(m.seen[0].input).toContain('"unverifiedProfileLink"');
      expect(m.seen[0].system).not.toContain(niche);
      expect(m.seen[0].system).toMatch(/You have not visited it/);
    }
  });

  it("returns a structured strategy with assumptions, sorted by priority, sanitised", async () => {
    const out = await advisorGenerator.execute!(advisorGenerator.input.parse(ADVISOR_INPUT), scripted(() => advice({ quickWins: ["Pin a post at https://evil.example with booking info", "Reply to every comment this week"] })).ask);
    expect(out.recommendations.map((r) => r.priority)).toEqual(["High", "Medium", "Low"]);
    expect(out.assessment.assumptions.length).toBeGreaterThan(0);
    expect(JSON.stringify(out)).not.toContain("evil.example");
    expect(advisorMarkdown(out)).toMatch(/## Recommended strategy[\s\S]*1\. Make a weekly specials series \(High priority\)/);
  });

  it("rejects fabricated statistics, guarantees, duplicates and missing structure", async () => {
    const i = advisorGenerator.input.parse(ADVISOR_INPUT);
    await expect(advisorGenerator.execute!(i, scripted(() => advice({ quickWins: ["Reels get 40% more reach", "Reply to comments"] })).ask)).rejects.toBeInstanceOf(OutputRuleError);
    await expect(advisorGenerator.execute!(i, scripted(() => advice({ recommendations: [rec("Same idea", "High"), rec("Same idea", "Low"), rec("Other", "Low")] })).ask)).rejects.toBeInstanceOf(OutputRuleError);
    await expect(advisorGenerator.execute!(i, scripted(() => advice({ recommendations: [rec("Only one", "High")] })).ask)).rejects.toThrow(); // fewer than 3
    await expect(advisorGenerator.execute!(i, scripted(() => ({ ...advice(), assessment: { ...advice().assessment, assumptions: [] } })).ask)).rejects.toThrow(); // assumptions required
  });
});

describe("Growth Roadmap", () => {
  const base = { niche: "A handmade candle brand selling online to repeat customers.", platform: "Instagram", objective: "Sell more products", time: "3–5 hours a week" };

  it("labels stages by the server, in order, for 7, 30 and 90 days", () => {
    expect(stagesFor(7)).toEqual(["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"]);
    expect(stagesFor(30)).toHaveLength(4);
    expect(stagesFor(90)).toEqual(["Month 1", "Month 2", "Month 3"]);
    expect(() => roadmapGenerator.input.parse({ ...base, duration: "14" })).toThrow();
  });

  it("7 and 30 days: one call, complete and ordered", async () => {
    for (const [d, n] of [
      ["7", 7],
      ["30", 4],
    ] as const) {
      const i = roadmapGenerator.input.parse({ ...base, duration: d });
      expect(roadmapGenerator.calls!(i)).toBe(1);
      const m = scripted(() => ({ ...head, stages: Array.from({ length: n }, (_, k) => stage(`Stage ${k + 1}`, [`Task ${k}-a`, `Task ${k}-b`])) }));
      const out = await roadmapGenerator.execute!(i, m.ask);
      expect(m.seen).toHaveLength(1);
      expect(out.stages.map((s) => s.period)).toEqual(stagesFor(Number(d)));
      expect(() => roadmapGenerator.output.parse(out)).not.toThrow();
      // A model that returns the wrong number of stages is rejected by the schema.
      await expect(roadmapGenerator.execute!(i, scripted(() => ({ ...head, stages: [stage("Only", ["a task", "b task"])] })).ask)).rejects.toThrow();
    }
  });

  it("90 days: three calls, each month sees the ones before, weekly milestones kept", async () => {
    const i = roadmapGenerator.input.parse({ ...base, duration: "90" });
    expect(roadmapGenerator.calls!(i)).toBe(3);
    const month = (n: number) => ({ ...stage(`Month ${n} focus`, [`Month ${n} task A`, `Month ${n} task B`]), weeks: ["W1", "W2", "W3", "W4"].map((w) => `${w} of month ${n}`) });
    const m = scripted((_s, call) => (call === 1 ? { ...head, month: month(1) } : { month: month(call) }));
    const out = await roadmapGenerator.execute!(i, m.ask);
    expect(m.seen).toHaveLength(3);
    expect(m.seen[2].input).toContain("Month 1 task A");
    expect(m.seen[2].input).toContain("Month 2 task A");
    expect(out.stages.map((s) => s.period)).toEqual(["Month 1", "Month 2", "Month 3"]);
    expect(out.stages.every((s) => s.weeks?.length === 4)).toBe(true);
    expect(roadmapMarkdown(out)).toContain("## Month 3: Month 3 focus");
  });

  it("removes tasks repeated across stages and rejects a stage that only repeats", async () => {
    const i = roadmapGenerator.input.parse({ ...base, duration: "30" });
    const out = await roadmapGenerator.execute!(i, scripted(() => ({ ...head, stages: [stage("Stage A", ["Set up the shop link", "Write content pillars"]), stage("Stage B", ["Set up the shop link", "Film a packing video"]), stage("Stage C", ["Run a giveaway", "Reply to DMs"]), stage("Stage D", ["Review results", "Plan next month"])] })).ask);
    const all = out.stages.flatMap((s) => s.tasks.map((t) => t.task));
    expect(new Set(all).size).toBe(all.length);
    await expect(roadmapGenerator.execute!(i, scripted(() => ({ ...head, stages: [stage("Stage A", ["Task one", "Task two"]), stage("Stage B", ["Task one", "Task two"]), stage("Stage C", ["Task three", "Task four"]), stage("Stage D", ["Task five", "Task six"])] })).ask)).rejects.toBeInstanceOf(OutputRuleError);
  });

  it("rejects numeric outcome targets", async () => {
    const i = roadmapGenerator.input.parse({ ...base, duration: "7" });
    await expect(roadmapGenerator.execute!(i, scripted(() => ({ ...head, successIndicators: ["Increase sales by 25%", "Shop link taps"], stages: Array.from({ length: 7 }, (_, k) => stage(`Stage ${k}`, [`t${k}a task`, `t${k}b task`])) })).ask)).rejects.toBeInstanceOf(OutputRuleError);
  });
});
