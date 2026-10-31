"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronDown, Circle, Download, Gauge, Lightbulb, Printer, Repeat2, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./results";

/*
 * Growth Intelligence results (AI-03). AI text is untrusted and only ever
 * rendered as plain text. In the Service Recommender, every service name,
 * price and status comes from the SociVanta catalog — never from the model —
 * and ordering is offered only when the server says a service is orderable.
 */

type Priority = "High" | "Medium" | "Low";

export interface AdvisorResult {
  assessment: { goal: string; challenges: string[]; opportunities: string[]; assumptions: string[]; missingInfo: string[] };
  recommendations: { priority: Priority; title: string; why: string; steps: string[]; activities: string[] }[];
  quickWins: string[];
  nextSteps: { thisWeek: string[]; measure: string[]; adjust: string[] };
}
export interface RoadmapResult {
  duration: 7 | 30 | 90;
  objective: string;
  stages: { period: string; title: string; focus: string; milestone: string; tasks: { task: string; priority: Priority; detail: string }[]; activities: string[]; dependsOn: string; checkpoint: string; weeks?: string[] }[];
  successIndicators: string[];
  nextSteps: string[];
}
export interface RecommenderResult {
  platform: { id: string; name: string };
  focus: string | null;
  checkoutOpen: boolean;
  candidatesConsidered: number;
  recommendations: { id: string; name: string; description: string; categoryLabel: string; status: "available" | "preview"; price: { amount: number; unit: string } | null; limits: { min: number | null; max: number | null } | null; fit: "Strong" | "Good" | "Possible"; reason: string; limitations: string; orderable: boolean }[];
  guidance: string[];
}

const PRIORITY_STYLE: Record<Priority, string> = {
  High: "bg-primary text-primary-foreground",
  Medium: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-[#c9bcff]",
  Low: "bg-muted text-muted-foreground",
};

function PriorityBadge({ value }: { value: Priority }) {
  return <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[0.68rem] font-semibold", PRIORITY_STYLE[value])}>{value} priority</span>;
}

const bullets = (items: string[]) => items.map((x) => `- ${x}`).join("\n");

export function advisorMarkdown(r: AdvisorResult) {
  return [
    "# Growth strategy",
    `**Goal:** ${r.assessment.goal}`,
    "## Assessment",
    "**Challenges**",
    bullets(r.assessment.challenges),
    "**Opportunities**",
    bullets(r.assessment.opportunities),
    "**Assumptions**",
    bullets(r.assessment.assumptions),
    ...(r.assessment.missingInfo.length ? ["**Would help to know**", bullets(r.assessment.missingInfo)] : []),
    "## Recommended strategy",
    ...r.recommendations.map((x, i) => `### ${i + 1}. ${x.title} (${x.priority} priority)\n${x.why}\n\n**Steps**\n${x.steps.map((s, k) => `${k + 1}. ${s}`).join("\n")}\n\n**Activities**\n${bullets(x.activities)}`),
    "## Quick wins",
    bullets(r.quickWins),
    "## Next steps",
    "**This week**",
    bullets(r.nextSteps.thisWeek),
    "**What to measure**",
    bullets(r.nextSteps.measure),
    "**How to adjust**",
    bullets(r.nextSteps.adjust),
    "",
    "_AI-written suggestions from SociVanta AI. Not a guarantee of results._",
  ].join("\n\n");
}

export function roadmapMarkdown(r: RoadmapResult) {
  return [
    `# ${r.duration}-day growth roadmap`,
    `**Objective:** ${r.objective}`,
    ...r.stages.map((s) =>
      [
        `## ${s.period}: ${s.title}`,
        `**Focus:** ${s.focus}`,
        `**Milestone:** ${s.milestone}`,
        ...(s.weeks?.length ? ["**Weekly milestones**", s.weeks.map((w, k) => `${k + 1}. ${w}`).join("\n")] : []),
        "**Tasks**",
        s.tasks.map((t) => `- [${t.priority}] ${t.task}${t.detail ? ` — ${t.detail}` : ""}`).join("\n"),
        "**Content activities**",
        bullets(s.activities),
        ...(s.dependsOn ? [`**Depends on:** ${s.dependsOn}`] : []),
        `**Checkpoint:** ${s.checkpoint}`,
      ].join("\n\n"),
    ),
    "## Success indicators",
    bullets(r.successIndicators),
    "## Next steps",
    bullets(r.nextSteps),
    "",
    "_AI-written plan from SociVanta AI. Milestones are suggestions, not predictions._",
  ].join("\n\n");
}

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printResults() {
  document.body.classList.add("ai-printing");
  const done = () => {
    document.body.classList.remove("ai-printing");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

const actionBtn = "inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none";

function Actions({ copyLabel, text, file }: { copyLabel: string; text: string; file: string }) {
  return (
    <div className="flex flex-wrap gap-1.5 print:hidden">
      <CopyButton text={text} label={copyLabel}>
        Copy
      </CopyButton>
      <button type="button" onClick={() => download(file, text)} className={actionBtn}>
        <Download className="size-3.5" aria-hidden /> Markdown
      </button>
      <button type="button" onClick={printResults} className={actionBtn}>
        <Printer className="size-3.5" aria-hidden /> Print
      </button>
    </div>
  );
}

function Heading({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 font-heading text-[0.98rem] font-bold">
      <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20 dark:text-[#c9bcff]" aria-hidden>
        <Icon className="size-3.5" />
      </span>
      {children}
    </h3>
  );
}

function List({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("space-y-1.5 text-sm leading-relaxed", className)}>
      {items.map((x, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── Growth Advisor ───────────────────────────────────────────────────── */

export function AdvisorResults({ result }: { result: AdvisorResult }) {
  const r = result;
  return (
    <div className="ai-print-area space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{r.recommendations.length} recommendations · based only on what you shared</p>
        <Actions copyLabel="Copy the strategy" text={advisorMarkdown(r)} file="socivanta-growth-strategy.md" />
      </div>

      {/* Assessment */}
      <section aria-labelledby="adv-assess" className="rounded-2xl border bg-card p-4 sm:p-5">
        <Heading icon={Target}>
          <span id="adv-assess">Growth assessment</span>
        </Heading>
        <p className="mt-3 rounded-xl bg-subtle px-3.5 py-2.5 text-sm dark:bg-white/[0.03]">
          <span className="font-semibold">Your goal: </span>
          {r.assessment.goal}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Challenges</h4>
            <List items={r.assessment.challenges} className="mt-2" />
          </div>
          <div>
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Opportunities</h4>
            <List items={r.assessment.opportunities} className="mt-2" />
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-dashed p-3.5">
          <h4 className="text-xs font-semibold">What this advice assumes</h4>
          <List items={r.assessment.assumptions} className="mt-1.5 text-muted-foreground" />
          {r.assessment.missingInfo.length ? (
            <>
              <h4 className="mt-3 text-xs font-semibold">Would help to know</h4>
              <List items={r.assessment.missingInfo} className="mt-1.5 text-muted-foreground" />
            </>
          ) : null}
        </div>
      </section>

      {/* Strategy */}
      <section aria-labelledby="adv-strategy">
        <Heading icon={Gauge}>
          <span id="adv-strategy">Recommended strategy</span>
        </Heading>
        <ol className="mt-3 space-y-3">
          {r.recommendations.map((x, i) => (
            <li key={x.title} className="rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgb(32_33_39/0.04)] sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md bg-foreground text-[0.7rem] font-bold text-background">{i + 1}</span>
                <h4 className="flex-1 font-semibold">{x.title}</h4>
                <PriorityBadge value={x.priority} />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{x.why}</p>
              <ol className="mt-3 space-y-1.5 text-sm">
                {x.steps.map((s, k) => (
                  <li key={k} className="flex gap-2.5">
                    <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full border text-[0.65rem] font-semibold text-muted-foreground">{k + 1}</span>
                    <span className="leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 flex flex-wrap gap-1.5">
                {x.activities.map((a) => (
                  <span key={a} className="rounded-lg bg-subtle px-2.5 py-1 text-xs dark:bg-white/[0.04]">
                    {a}
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Quick wins + next steps */}
      <section aria-labelledby="adv-quick" className="rounded-2xl border bg-lime/15 p-4 sm:p-5 dark:bg-lime/[0.06]">
        <Heading icon={Lightbulb}>
          <span id="adv-quick">Quick wins</span>
        </Heading>
        <ul className="mt-3 space-y-2 text-sm">
          {r.quickWins.map((w, i) => (
            <li key={i} className="flex gap-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span className="leading-relaxed">{w}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="adv-next">
        <Heading icon={Repeat2}>
          <span id="adv-next">Next steps</span>
        </Heading>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {(
            [
              ["This week", r.nextSteps.thisWeek],
              ["What to measure", r.nextSteps.measure],
              ["How to adjust", r.nextSteps.adjust],
            ] as const
          ).map(([title, items]) => (
            <div key={title} className="rounded-2xl border bg-card p-4">
              <h4 className="text-sm font-semibold">{title}</h4>
              <List items={[...items]} className="mt-2 text-muted-foreground" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ── Growth Roadmap ───────────────────────────────────────────────────── */

export function RoadmapResults({ result }: { result: RoadmapResult }) {
  const r = result;
  return (
    <div className="ai-print-area space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {r.duration}-day plan · {r.stages.length} stages · nothing is scheduled for you
        </p>
        <Actions copyLabel="Copy the roadmap" text={roadmapMarkdown(r)} file={`socivanta-${r.duration}-day-roadmap.md`} />
      </div>
      <div className="rounded-2xl border bg-card p-4 sm:p-5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Objective</p>
        <p className="mt-1 font-heading text-[1.05rem] leading-snug font-bold">{r.objective}</p>
      </div>

      <ol className="relative space-y-3 before:absolute before:top-3 before:bottom-3 before:left-[0.95rem] before:w-px before:bg-border">
        {r.stages.map((s, i) => (
          <li key={s.period} className="relative pl-10">
            <span className="absolute top-3.5 left-1.5 grid size-5 place-items-center rounded-full bg-primary text-[0.6rem] font-bold text-primary-foreground ring-4 ring-background" aria-hidden>
              {i + 1}
            </span>
            <details open={i < 2} className="group rounded-2xl border bg-card shadow-[0_1px_2px_rgb(32_33_39/0.04)] print:break-inside-avoid" aria-label={`${s.period}: ${s.title}`}>
              <summary className="flex cursor-pointer list-none items-start gap-3 rounded-2xl p-4 outline-none focus-visible:ring-3 focus-visible:ring-primary/30 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-primary dark:text-[#c9bcff]">{s.period}</span>
                  <span className="mt-0.5 block font-semibold">{s.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{s.milestone}</span>
                </span>
                <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none print:hidden" aria-hidden />
              </summary>
              <div className="space-y-4 border-t px-4 pt-3.5 pb-4 text-sm">
                <p className="text-muted-foreground">
                  <span className="font-semibold text-foreground">Focus: </span>
                  {s.focus}
                </p>
                {s.weeks?.length ? (
                  <div>
                    <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Weekly milestones</h4>
                    <ol className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {s.weeks.map((w, k) => (
                        <li key={k} className="rounded-lg bg-subtle px-3 py-2 dark:bg-white/[0.03]">
                          <span className="text-xs font-semibold text-muted-foreground">Week {k + 1} · </span>
                          {w}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
                <div>
                  <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tasks</h4>
                  <ul className="mt-2 space-y-2">
                    {s.tasks.map((t, k) => (
                      <li key={k} className="flex gap-2.5">
                        <Circle className={cn("mt-1 size-3 shrink-0", t.priority === "High" ? "fill-primary text-primary" : t.priority === "Medium" ? "text-primary" : "text-muted-foreground")} aria-hidden />
                        <span>
                          <span className="font-medium">{t.task}</span> <span className="sr-only">({t.priority} priority)</span>
                          {t.detail ? <span className="block text-muted-foreground">{t.detail}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Content activities</h4>
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {s.activities.map((a) => (
                      <span key={a} className="rounded-lg bg-subtle px-2.5 py-1 text-xs dark:bg-white/[0.04]">
                        {a}
                      </span>
                    ))}
                  </p>
                </div>
                {s.dependsOn ? (
                  <p className="text-muted-foreground">
                    <span className="font-semibold text-foreground">Depends on: </span>
                    {s.dependsOn}
                  </p>
                ) : null}
                <p className="rounded-xl border border-dashed px-3.5 py-2.5">
                  <span className="font-semibold">Checkpoint: </span>
                  {s.checkpoint}
                </p>
              </div>
            </details>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4">
          <Heading icon={Gauge}>Success indicators</Heading>
          <List items={r.successIndicators} className="mt-3 text-muted-foreground" />
        </div>
        <div className="rounded-2xl border bg-lime/15 p-4 dark:bg-lime/[0.06]">
          <Heading icon={ArrowRight}>Start here</Heading>
          <List items={r.nextSteps} className="mt-3" />
        </div>
      </div>
    </div>
  );
}

/* ── Service Recommender ──────────────────────────────────────────────── */

const FIT_STYLE = { Strong: "bg-primary text-primary-foreground", Good: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-[#c9bcff]", Possible: "bg-muted text-muted-foreground" } as const;
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n < 1 ? 3 : 2, maximumFractionDigits: 3 })}`;

function ServiceCard({ s, checkoutOpen }: { s: RecommenderResult["recommendations"][number]; checkoutOpen: boolean }) {
  return (
    <li className="rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgb(32_33_39/0.04)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{s.categoryLabel}</p>
          <h4 className="mt-0.5 font-semibold">{s.name}</h4>
        </div>
        <span className={cn("inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[0.68rem] font-semibold", FIT_STYLE[s.fit])}>{s.fit} fit</span>
      </div>
      <p className="mt-2.5 text-sm leading-relaxed">{s.reason}</p>
      {s.limitations ? <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">Keep in mind: {s.limitations}</p> : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3.5">
        <p className="text-sm">
          {s.status === "available" && s.price ? (
            <>
              <span className="font-semibold tabular-nums">{money(s.price.amount)}</span> <span className="text-muted-foreground">{s.price.unit} · listed price</span>
            </>
          ) : (
            <span className="text-muted-foreground">Not available to order yet</span>
          )}
        </p>
        {s.orderable ? (
          <Link href={`/dashboard/new-order?service=${encodeURIComponent(s.id)}`} prefetch={false} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
            Configure in New Order <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : s.status === "available" && !checkoutOpen ? (
          <span className="text-xs text-muted-foreground">Ordering isn&apos;t open yet</span>
        ) : null}
      </div>
    </li>
  );
}

export function recommenderText(r: RecommenderResult) {
  return [
    `Service recommendations for ${r.platform.name}`,
    ...r.recommendations.map((s) => `- ${s.name} (${s.fit} fit): ${s.reason}${s.status === "available" && s.price ? ` — ${money(s.price.amount)} ${s.price.unit}` : " — not available to order yet"}`),
    "",
    "Guidance:",
    ...r.guidance.map((g) => `- ${g}`),
  ].join("\n");
}

export function RecommenderResults({ result }: { result: RecommenderResult }) {
  const r = result;
  const orderable = r.recommendations.filter((s) => s.orderable);
  const other = r.recommendations.filter((s) => !s.orderable);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Matched against {r.candidatesConsidered} SociVanta {r.candidatesConsidered === 1 ? "service" : "services"} for {r.platform.name}
          {r.focus ? ` · ${r.focus}` : ""}. Prices and availability come from SociVanta, not the AI.
        </p>
        <CopyButton text={recommenderText(r)} label="Copy the recommendations">
          Copy
        </CopyButton>
      </div>

      {orderable.length ? (
        <section aria-labelledby="rec-ok">
          <h3 id="rec-ok" className="font-heading text-[0.98rem] font-bold">
            Recommended services you can order
          </h3>
          <ul className="mt-3 space-y-3">
            {orderable.map((s) => (
              <ServiceCard key={s.id} s={s} checkoutOpen={r.checkoutOpen} />
            ))}
          </ul>
        </section>
      ) : (
        <div role="status" className="rounded-2xl border border-dashed bg-card px-5 py-6 text-center">
          <p className="font-heading font-bold">No eligible services currently match your goal.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {r.recommendations.length ? "Some relevant services are listed below, but none can be ordered right now." : "Nothing in the catalog is a good fit for this goal yet. The guidance below still applies."}
          </p>
        </div>
      )}

      {other.length ? (
        <section aria-labelledby="rec-other">
          <h3 id="rec-other" className="font-heading text-[0.98rem] font-bold">
            Relevant, but not available to order right now
          </h3>
          <ul className="mt-3 space-y-3">
            {other.map((s) => (
              <ServiceCard key={s.id} s={s} checkoutOpen={r.checkoutOpen} />
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="rec-guide" className="rounded-2xl border bg-lime/15 p-4 sm:p-5 dark:bg-lime/[0.06]">
        <Heading icon={Lightbulb}>
          <span id="rec-guide">Guidance for your goal</span>
        </Heading>
        <List items={r.guidance} className="mt-3" />
      </section>
    </div>
  );
}
