"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ClipboardList, FilePlus2, Gauge, Layers, Lightbulb, ListChecks, Lock, MessageSquareQuote, Sparkles, Target } from "lucide-react";
import { useToolStatus } from "@/components/ai/use-ai-status";
import { Panel } from "@/components/dashboard/shared";
import { BUDGET_RANGES, GROWTH_GOALS, PLATFORM_CHOICES } from "@/lib/ai/registry";
import type { SocialProviderId } from "@/lib/social/platforms";
import { postHref, type PostView, type PublishingData } from "@/lib/social/publishing";
import { browserTimeZone } from "@/lib/social/time";
import { cn } from "@/lib/utils";
import { page, primaryButton, quietButton, SocialHeader } from "./parts";
import { EmptyIllustration, postsApi } from "./publishing-parts";

/*
 * AI Campaign Studio (AI-07). Goal-based campaign planning through the shared
 * AI pipeline. While generation is off it says so and shows what a plan will
 * contain — never sample output. Results are suggestions: the customer turns
 * the ones they like into drafts with an explicit click; nothing is scheduled
 * or published by AI.
 */

interface Plan {
  basis: "goal-based";
  weeks: number;
  objective: string;
  assumptions: string[];
  themes: { name: string; why: string }[];
  weeklyPlan: { week: string; focus: string; activities: string[] }[];
  formats: { platform: string; format: string; why: string }[];
  captionIdeas: { platform: string; caption: string; cta: string }[];
  improvements: string[];
  metrics: string[];
  nextSteps: string[];
}

const PROVIDER_OF: Record<string, SocialProviderId> = { Instagram: "instagram", TikTok: "tiktok", YouTube: "youtube", Facebook: "facebook", X: "x", LinkedIn: "linkedin" };
const field = "w-full rounded-2xl border bg-background px-3.5 py-2.5 text-[0.9rem] outline-none focus-visible:border-primary/40 focus-visible:ring-3 focus-visible:ring-primary/20 dark:bg-white/[0.02]";
const label = "text-[0.78rem] font-semibold";

const SECTIONS = [
  { icon: Target, title: "Objective & assumptions", body: "What the campaign is for, and what the plan assumes — stated as assumptions, never as data." },
  { icon: Layers, title: "Themes & weekly plan", body: "Two to five themes and one focus with a few activities for every week." },
  { icon: MessageSquareQuote, title: "Formats & caption ideas", body: "Post formats and caption and call-to-action starting points for each platform you choose." },
  { icon: Gauge, title: "What to review", body: "Metric names worth checking on each platform — no invented targets or results." },
];

export function CampaignStudio({ data }: { data: PublishingData }) {
  const { status } = useToolStatus("campaign-planner");
  const live = status?.availability === "available";
  const [niche, setNiche] = React.useState("");
  const [objective, setObjective] = React.useState<string>(GROWTH_GOALS[0]);
  const [platforms, setPlatforms] = React.useState<string[]>(["Instagram"]);
  const [audience, setAudience] = React.useState("");
  const [weeks, setWeeks] = React.useState("4");
  const [themes, setThemes] = React.useState("");
  const [budget, setBudget] = React.useState("");
  const [context, setContext] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [saved, setSaved] = React.useState<Record<number, string>>({});

  const ready = niche.trim().length >= 10 && platforms.length > 0;
  const togglePlatform = (p: string) => setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : cur.length >= 3 ? cur : [...cur, p]));

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!live || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/tools/campaign-planner/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ niche, objective, platforms, audience, weeks, themes, budget, context }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) setError(body?.error?.message ?? "The plan couldn't be created. Please try again.");
      else {
        setPlan(body.output as Plan);
        setSaved({});
      }
    } catch {
      setError("We couldn't reach SociVanta. Check your connection and try again.");
    }
    setBusy(false);
  }

  async function saveIdea(i: number, idea: Plan["captionIdeas"][number]) {
    const provider = PROVIDER_OF[idea.platform];
    const r = await postsApi<{ post: PostView }>("/api/social/posts", { method: "POST", body: JSON.stringify({ text: `${idea.caption}\n\n${idea.cta}`.slice(0, 5000), providers: provider ? [provider] : [], timezone: browserTimeZone() }) });
    if (r.ok) setSaved((s) => ({ ...s, [i]: r.data.post.id }));
    else setError(r.message);
  }

  return (
    <div className={page}>
      <SocialHeader title="Campaign Studio" subtitle="Plan a focused campaign, then turn the ideas you like into drafts." />

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Panel className="self-start p-4 sm:p-5">
          <form onSubmit={run} className="space-y-4">
            <label className="block">
              <span className={label}>Your business or niche</span>
              <textarea value={niche} onChange={(e) => setNiche(e.target.value)} maxLength={600} rows={3} required className={cn(field, "mt-1.5 resize-y")} placeholder="e.g. Independent bakery selling sourdough and pastries in Leeds" />
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={label}>Objective</span>
                <select value={objective} onChange={(e) => setObjective(e.target.value)} className={cn(field, "mt-1.5")}>
                  {GROWTH_GOALS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend className={label}>Length</legend>
                <div className="mt-1.5 grid grid-cols-4 rounded-2xl border bg-background p-1 dark:bg-white/[0.02]">
                  {["2", "4", "6", "8"].map((w) => (
                    <button key={w} type="button" aria-pressed={weeks === w} onClick={() => setWeeks(w)} className={cn("h-8 rounded-xl text-[0.78rem] font-semibold", weeks === w ? "bg-graphite text-white dark:bg-white dark:text-graphite" : "text-muted-foreground hover:text-foreground")}>
                      {w}w
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <fieldset>
              <legend className={label}>
                Platforms <span className="font-normal text-muted-foreground">(up to 3)</span>
              </legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {PLATFORM_CHOICES.map((p) => (
                  <button key={p} type="button" aria-pressed={platforms.includes(p)} onClick={() => togglePlatform(p)} className={cn("inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[0.78rem] font-semibold transition-colors", platforms.includes(p) ? "border-primary/40 bg-primary/[0.06] text-foreground dark:bg-primary/15" : "bg-card text-muted-foreground hover:text-foreground")}>
                    {platforms.includes(p) ? <Check className="size-3.5 text-primary" aria-hidden /> : null}
                    {p}
                  </button>
                ))}
              </div>
            </fieldset>
            <details className="group rounded-2xl border px-3.5 py-2.5 open:pb-4">
              <summary className="cursor-pointer list-none text-[0.8rem] font-semibold text-muted-foreground group-open:text-foreground [&::-webkit-details-marker]:hidden">More context (optional)</summary>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className={label}>Target audience</span>
                  <input value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={240} className={cn(field, "mt-1.5")} placeholder="e.g. Local families and office workers" />
                </label>
                <label className="block">
                  <span className={label}>Themes to include</span>
                  <input value={themes} onChange={(e) => setThemes(e.target.value)} maxLength={300} className={cn(field, "mt-1.5")} placeholder="e.g. Behind the scenes, seasonal specials" />
                </label>
                <label className="block">
                  <span className={label}>Monthly budget</span>
                  <select value={budget} onChange={(e) => setBudget(e.target.value)} className={cn(field, "mt-1.5")}>
                    <option value="">Not stated</option>
                    {BUDGET_RANGES.map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={label}>Anything else</span>
                  <textarea value={context} onChange={(e) => setContext(e.target.value)} maxLength={600} rows={2} className={cn(field, "mt-1.5 resize-y")} placeholder="e.g. Opening a second shop in March" />
                </label>
              </div>
            </details>
            {error ? (
              <p role="alert" className="rounded-xl bg-destructive/[0.07] px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <button type="submit" className={cn(primaryButton, "w-full")} disabled={!live || !ready || busy} aria-describedby="campaign-why">
              {live ? <Sparkles className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}
              {busy ? "Planning…" : live ? "Plan my campaign" : "Coming soon"}
            </button>
            <p id="campaign-why" className="text-[0.72rem] leading-relaxed text-muted-foreground">
              {live
                ? `Goal-based advice — SociVanta has no access to your accounts' analytics. ${status?.usage ? `${status.usage.allowance - status.usage.used} of ${status.usage.allowance} plans left today.` : ""}`
                : "AI planning isn't switched on yet. You can fill this in now; nothing is sent and no allowance is used."}
            </p>
          </form>
        </Panel>

        {plan ? (
          <div className="min-w-0 space-y-4">
            <Panel className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-secondary px-2.5 py-1 text-[0.68rem] font-bold tracking-wide text-secondary-foreground uppercase">Goal-based plan</span>
                <span className="text-[0.75rem] text-muted-foreground">{plan.weeks} weeks · not based on account analytics</span>
              </div>
              <h2 className="mt-3 font-heading text-xl font-bold">{plan.objective}</h2>
              <ul className="mt-3 space-y-1 text-[0.82rem] text-muted-foreground">
                {plan.assumptions.map((a) => (
                  <li key={a}>Assumes: {a}</li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                {plan.themes.map((t) => (
                  <span key={t.name} title={t.why} className="rounded-full border px-3 py-1 text-[0.78rem] font-semibold">
                    {t.name}
                  </span>
                ))}
              </div>
            </Panel>
            <Panel className="p-5">
              <h3 className="flex items-center gap-2 font-heading font-bold">
                <ClipboardList className="size-4 text-primary" aria-hidden /> Weekly plan
              </h3>
              <ol className="mt-3 space-y-3">
                {plan.weeklyPlan.map((w) => (
                  <li key={w.week} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 text-[0.85rem]">
                    <span className="font-semibold text-muted-foreground">{w.week}</span>
                    <span>
                      <span className="font-semibold">{w.focus}</span>
                      <span className="mt-1 block text-muted-foreground">{w.activities.join(" · ")}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </Panel>
            <Panel className="p-5">
              <h3 className="flex items-center gap-2 font-heading font-bold">
                <MessageSquareQuote className="size-4 text-primary" aria-hidden /> Caption ideas
              </h3>
              <ul className="mt-3 space-y-2.5">
                {plan.captionIdeas.map((c, i) => (
                  <li key={i} className="rounded-2xl bg-muted/50 p-3.5 text-[0.85rem] dark:bg-white/[0.03]">
                    <p className="text-[0.7rem] font-bold tracking-wide text-muted-foreground uppercase">{c.platform}</p>
                    <p className="mt-1 whitespace-pre-wrap">{c.caption}</p>
                    <p className="mt-1 font-semibold">{c.cta}</p>
                    {saved[i] ? (
                      <Link href={postHref(saved[i]!)} className="mt-2 inline-flex text-[0.78rem] font-semibold text-ok">
                        Saved as a draft — open it →
                      </Link>
                    ) : (
                      <button type="button" onClick={() => saveIdea(i, c)} className={cn(quietButton, "mt-2 h-8 px-3 text-[0.75rem]")}>
                        <FilePlus2 className="size-3.5" aria-hidden /> Save as draft
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Panel className="p-5">
                <h3 className="flex items-center gap-2 font-heading font-bold">
                  <Gauge className="size-4 text-primary" aria-hidden /> Metrics to review
                </h3>
                <ul className="mt-2 space-y-1 text-[0.82rem] text-muted-foreground">
                  {plan.metrics.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </Panel>
              <Panel className="p-5">
                <h3 className="flex items-center gap-2 font-heading font-bold">
                  <ListChecks className="size-4 text-primary" aria-hidden /> Next steps
                </h3>
                <ul className="mt-2 space-y-1 text-[0.82rem] text-muted-foreground">
                  {[...plan.nextSteps, ...plan.improvements].map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </Panel>
            </div>
          </div>
        ) : (
          <Panel className="min-w-0 self-start overflow-hidden">
            <div className="flex items-start gap-4 border-b p-5 sm:p-6">
              <EmptyIllustration icon={Lightbulb} />
              <div>
                <h2 className="font-heading text-lg font-bold">{live ? "Your plan will appear here" : "What a campaign plan includes"}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {live ? "Fill in the brief and choose Plan my campaign." : "AI Campaign Studio is coming soon. Here's exactly what each plan will contain — no sample output is shown."}
                </p>
              </div>
            </div>
            <ul className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-y-0">
              {SECTIONS.map((s, i) => (
                <li key={s.title} className={cn("p-5", i < 2 && "sm:border-b", i % 2 === 0 && "sm:border-e")}>
                  <s.icon className="size-5 text-primary" aria-hidden />
                  <p className="mt-3 text-sm font-semibold">{s.title}</p>
                  <p className="mt-1 text-[0.8rem] leading-relaxed text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ul>
            <p className="border-t px-5 py-3.5 text-[0.75rem] leading-relaxed text-muted-foreground sm:px-6">
              {data.workspace.accounts.length ? "Plans are goal-based: SociVanta doesn't read your accounts' analytics to make them." : "No accounts are connected, so plans are goal-based advice."} AI never schedules or publishes — you choose which ideas become drafts.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}
