"use client";

import * as React from "react";
import Link from "next/link";
import { CircleAlert, Info } from "lucide-react";
import { useHydrated } from "@/components/dashboard/shared";
import { AI_ROUTES, DESTINATION_BY_ID, DESTINATION_GROUPS, type ToolUsageRow, USAGE_OUTCOMES, type UsageData, type UsageOutcome } from "@/lib/ai/workspace";
import { formatNumber, formatTime, useDisplay } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DestinationGlyph, StateChip } from "./glyph";
import { AiHeader, aiPage, sectionTitle } from "./parts";

export function UsageView({ data }: { data: UsageData }) {
  const groups = DESTINATION_GROUPS.map((g) => ({ ...g, rows: data.tools.filter((t) => t.group === g.id) })).filter((g) => g.rows.length);
  return (
    <div className={aiPage}>
      <AiHeader kicker="Usage" title="Usage & allowances" subtitle="How many free runs each AI tool includes, what you've used today, and when it resets." />

      <div className="mt-7 flex flex-col gap-8 sm:mt-9">
        <Summary data={data} />

        {!data.generation ? (
          <Notice icon={Info}>
            <strong className="font-semibold">AI tools haven&apos;t launched yet.</strong> The allowances below are what each tool will include for free once it&apos;s live. Until then nothing can run, and nothing is counted.
          </Notice>
        ) : null}
        {!data.readable ? (
          <Notice icon={CircleAlert} tone="warn">
            <strong className="font-semibold">We couldn&apos;t read today&apos;s usage right now.</strong> Allowances are shown, but used and remaining runs aren&apos;t. Try again in a moment.
          </Notice>
        ) : null}

        <section aria-labelledby="allowances-title">
          <h2 id="allowances-title" className={sectionTitle}>
            Daily allowances
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Per account, per tool, per day (UTC).</p>
          <div className="mt-4 overflow-hidden rounded-[1.5rem] border bg-card shadow-soft">
            {groups.map((g, gi) => (
              <div key={g.id} className={cn(gi > 0 && "border-t")}>
                <h3 className="bg-surface px-4 py-2.5 text-[0.72rem] font-bold tracking-[0.12em] text-muted-foreground uppercase sm:px-5">{g.name}</h3>
                <ul className="divide-y">
                  {g.rows.map((r) => (
                    <UsageRow key={r.toolId} row={r} readable={data.readable} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <Activity data={data} />
        <Rules />
      </div>
    </div>
  );
}

function Summary({ data }: { data: UsageData }) {
  useDisplay();
  const hydrated = useHydrated();
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);
  const left = now === null ? null : Math.max(0, Date.parse(data.resetAt) - now);
  const countdown = left === null ? null : `${Math.floor(left / 3_600_000)}h ${Math.floor((left % 3_600_000) / 60_000)}m`;

  return (
    <dl className="grid overflow-hidden rounded-[1.5rem] border bg-card shadow-soft sm:grid-cols-3">
      <div className="flex flex-col gap-1 p-5 sm:p-6">
        <dt className="text-[0.8rem] font-medium text-muted-foreground">Your plan</dt>
        <dd className="font-heading text-[1.5rem] leading-tight font-extrabold">{data.plan.name}</dd>
        <dd className="text-sm text-muted-foreground">
          No payment needed.{" "}
          <Link href={AI_ROUTES.plans} className="font-semibold text-primary hover:underline dark:text-[#c4b5ff]">
            Compare plans
          </Link>
        </dd>
      </div>
      <div className="flex flex-col gap-1 border-t p-5 sm:border-t-0 sm:border-l sm:p-6">
        <dt className="text-[0.8rem] font-medium text-muted-foreground">Runs counted today</dt>
        <dd className="font-heading text-[1.5rem] leading-tight font-extrabold tabular-nums">{data.readable ? formatNumber(data.totals.counted) : "—"}</dd>
        <dd className="text-sm text-muted-foreground">{data.readable ? (data.totals.notCounted ? `${formatNumber(data.totals.notCounted)} more not counted` : "Across all tools") : "Not available right now"}</dd>
      </div>
      <div className="flex flex-col gap-1 border-t p-5 sm:border-t-0 sm:border-l sm:p-6">
        <dt className="text-[0.8rem] font-medium text-muted-foreground">Next reset</dt>
        <dd className="font-heading text-[1.5rem] leading-tight font-extrabold tabular-nums">{countdown ? `in ${countdown}` : "00:00 UTC"}</dd>
        <dd className="text-sm text-muted-foreground">Every day at 00:00 UTC{hydrated ? ` (${formatTime(data.resetAt)} your time)` : ""}</dd>
      </div>
    </dl>
  );
}

function UsageRow({ row: r, readable }: { row: ToolUsageRow; readable: boolean }) {
  const live = r.availability === "available";
  const pct = r.allowance > 0 ? Math.min(100, Math.round((r.used / r.allowance) * 100)) : 0;
  const d = Object.values(DESTINATION_BY_ID).find((x) => x.toolId === r.toolId) ?? (r.toolId === "automation-assistant" ? DESTINATION_BY_ID.automations : undefined);
  const name = r.href ? (
    <Link href={r.href} className="font-semibold hover:text-primary hover:underline focus-visible:underline focus-visible:outline-none">
      {r.name}
    </Link>
  ) : (
    <span className="font-semibold">{r.name}</span>
  );
  return (
    <li className="grid grid-cols-[auto_1fr] items-center gap-x-3.5 gap-y-2.5 px-4 py-3.5 sm:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_7.5rem] sm:px-5">
      {d ? <DestinationGlyph icon={d.icon} group={d.group} size="sm" /> : <span className="size-8" />}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {name}
          <StateChip value={r.availability} readyLabel="Available" />
        </div>
      </div>
      <div className="col-span-2 sm:col-span-1">
        <div
          role="meter"
          aria-label={`${r.name} runs used today`}
          aria-valuemin={0}
          aria-valuemax={r.allowance}
          aria-valuenow={readable ? r.used : 0}
          aria-valuetext={live && readable ? `${r.used} of ${r.allowance} used` : `Allowance of ${r.allowance} a day, not active yet`}
          className={cn("h-2 overflow-hidden rounded-full", live ? "bg-muted" : "bg-[repeating-linear-gradient(135deg,var(--muted)_0_6px,transparent_6px_10px)] ring-1 ring-border ring-inset")}
        >
          {live && readable ? <span className={cn("block h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none", r.remaining === 0 ? "bg-destructive" : pct >= 80 ? "bg-soon" : "bg-primary")} style={{ width: `${pct}%` }} /> : null}
        </div>
      </div>
      <div className="col-span-2 flex items-baseline justify-between gap-2 text-sm sm:col-span-1 sm:flex-col sm:items-end sm:gap-0">
        {live ? (
          <>
            <span className="font-semibold tabular-nums">{readable ? `${formatNumber(r.used)} / ${formatNumber(r.allowance)}` : `${formatNumber(r.allowance)} a day`}</span>
            <span className="text-xs text-muted-foreground">{readable ? (r.remaining ? `${formatNumber(r.remaining)} left today` : "None left today") : "Usage unavailable"}</span>
          </>
        ) : (
          <>
            <span className="font-semibold tabular-nums">{formatNumber(r.allowance)} a day</span>
            <span className="text-xs text-muted-foreground">At launch</span>
          </>
        )}
      </div>
    </li>
  );
}

function Activity({ data }: { data: UsageData }) {
  const totals = new Map<UsageOutcome, number>();
  for (const t of data.tools) for (const [k, v] of Object.entries(t.outcomes)) totals.set(k as UsageOutcome, (totals.get(k as UsageOutcome) ?? 0) + v);
  const entries = (Object.keys(USAGE_OUTCOMES) as UsageOutcome[]).map((k) => ({ k, ...USAGE_OUTCOMES[k], n: totals.get(k) ?? 0 }));
  const any = entries.some((e) => e.n > 0);
  const column = (counted: boolean, title: string, note: string) => (
    <div className="p-5 sm:p-6">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">{note}</p>
      <dl className="mt-3 space-y-1.5">
        {entries
          .filter((e) => e.counted === counted)
          .map((e) => (
            <div key={e.k} className="flex items-center justify-between gap-3 text-sm">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <span className={cn("size-2 rounded-full", counted ? "bg-primary" : "bg-muted-foreground/40")} aria-hidden />
                {e.label}
              </dt>
              <dd className="font-semibold tabular-nums">{formatNumber(e.n)}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
  return (
    <section aria-labelledby="activity-title">
      <h2 id="activity-title" className={sectionTitle}>
        Today&apos;s requests
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">Every request you made today and whether it counted toward an allowance.</p>
      {!data.readable ? null : any ? (
        <div className="mt-4 grid overflow-hidden rounded-[1.5rem] border bg-card shadow-soft md:grid-cols-2">
          {column(true, "Counted", "These use your free runs.")}
          <div className="border-t md:border-t-0 md:border-l">{column(false, "Not counted", "Errors and limits never use your free runs.")}</div>
        </div>
      ) : (
        <p className="mt-4 rounded-[1.5rem] border border-dashed px-5 py-6 text-sm text-muted-foreground">No AI requests today. When you use a tool, each request and its outcome will show here.</p>
      )}
    </section>
  );
}

const RULES: { title: string; body: string }[] = [
  { title: "Each tool has its own allowance", body: "Allowances are per account and per tool. Using one tool never reduces another's." },
  { title: "What counts", body: "A completed run counts. A run in progress is held against your allowance until it finishes, so two tabs can't go over it." },
  { title: "What doesn't count", body: "AI service errors, timeouts, results we couldn't use, and requests stopped by a limit are never counted." },
  { title: "When it resets", body: "Every day at 00:00 UTC. Unused runs don't carry over." },
  { title: "Pace and safety limits", body: "Up to 5 requests a minute across tools. A platform-wide daily safety limit may also pause tools until the reset; paused requests aren't counted." },
  { title: "Separate from your wallet", body: "AI usage is never charged to your SociVanta wallet. Your wallet is only for SMM service orders." },
];

function Rules() {
  return (
    <section aria-labelledby="rules-title" className="rounded-[1.5rem] bg-surface p-5 sm:p-7">
      <h2 id="rules-title" className={sectionTitle}>
        How usage works
      </h2>
      <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {RULES.map((r) => (
          <div key={r.title}>
            <dt className="font-semibold">{r.title}</dt>
            <dd className="mt-1 text-sm text-pretty text-muted-foreground">{r.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Notice({ icon: Icon, tone = "info", children }: { icon: typeof Info; tone?: "info" | "warn"; children: React.ReactNode }) {
  return (
    <div role="note" className={cn("flex gap-3 rounded-2xl px-4 py-3.5 text-sm sm:px-5", tone === "info" ? "bg-primary/[0.06] text-foreground ring-1 ring-primary/15 dark:bg-primary/15" : "bg-soon-soft text-foreground ring-1 ring-soon/25")}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "info" ? "text-primary dark:text-[#c4b5ff]" : "text-soon")} aria-hidden />
      <p className="text-pretty">{children}</p>
    </div>
  );
}
