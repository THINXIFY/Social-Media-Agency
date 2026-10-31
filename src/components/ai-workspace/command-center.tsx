"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, BarChart3, CalendarClock, FilePen, Gauge, Inbox, Layers3, Link2, Settings2, Sparkles, Workflow } from "lucide-react";
import { socialApi, When } from "@/components/social/parts";
import {
  AI_ROUTES,
  type CommandCenterData,
  DESTINATION_BY_ID,
  DESTINATION_GROUPS,
  type DestinationGroup,
  destinationAvailability,
  DESTINATIONS,
  GOAL_BY_ID,
  PERSONA_BY_ID,
  QUICK_ACTION_IDS,
  recommend,
} from "@/lib/ai/workspace";
import { formatNumber } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DestinationGlyph, StateChip } from "./glyph";
import { AiHeader, aiPage, sectionTitle } from "./parts";

export function CommandCenter({ data }: { data: CommandCenterData }) {
  return (
    <div className={aiPage}>
      <AiHeader
        kicker={`Welcome, ${data.firstName}`}
        title="Your creative workspace starts here."
        subtitle="Explore AI tools, organize your ideas, and discover smarter ways to grow."
        aside={<StatusStrip data={data} />}
      />
      <div className="mt-7 flex flex-col gap-8 sm:mt-9 sm:gap-10">
        <QuickActions data={data} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-7">
          <div className="min-w-0 lg:col-span-7">
            <ForYou data={data} />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <MyWorkspace data={data} />
          </div>
        </div>
        <Discover data={data} />
        <AccountLinks data={data} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function StatusStrip({ data }: { data: CommandCenterData }) {
  return (
    <dl className="flex flex-wrap items-center gap-2 text-[0.8rem]">
      <div className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 shadow-soft">
        <dt className="text-muted-foreground">Plan</dt>
        <dd className="font-semibold">{data.plan.name}</dd>
      </div>
      <div className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 shadow-soft">
        <dt className="text-muted-foreground">AI generation</dt>
        <dd className={cn("font-semibold", data.generation ? "text-ok" : "text-primary dark:text-[#c4b5ff]")}>{data.generation ? "Live" : "Coming soon"}</dd>
      </div>
    </dl>
  );
}

/* -------------------------------------------------------------------------- */
/*  Quick actions                                                             */
/* -------------------------------------------------------------------------- */

function QuickActions({ data }: { data: CommandCenterData }) {
  return (
    <section aria-labelledby="quick-title" className="relative overflow-hidden rounded-[1.75rem] border bg-card p-4 shadow-soft sm:p-6 lg:p-7">
      {/* A quiet wash of brand colour behind the actions; decoration only. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_22rem_at_0%_0%,rgb(112_71_235/0.10),transparent_60%),radial-gradient(30rem_16rem_at_100%_100%,rgb(200_255_82/0.16),transparent_65%)] dark:bg-[radial-gradient(60rem_22rem_at_0%_0%,rgb(112_71_235/0.22),transparent_60%),radial-gradient(30rem_16rem_at_100%_100%,rgb(200_255_82/0.06),transparent_65%)]" />
      <div className="relative grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-4 lg:py-1">
          <h2 id="quick-title" className={sectionTitle}>
            What would you like to do?
          </h2>
          <p className="mt-2 text-sm text-pretty text-muted-foreground">
            {data.generation
              ? "Jump straight into a tool. Each one explains what it needs and what you'll get."
              : "The AI tools are launching soon. Open any of them to see what it will ask for and how results are organised. Nothing runs until a tool is live."}
          </p>
        </div>
        <ul className="grid min-w-0 grid-cols-2 gap-2 sm:gap-2.5 lg:col-span-8 lg:grid-cols-4">
          {QUICK_ACTION_IDS.map((id) => {
            const d = DESTINATION_BY_ID[id];
            const state = destinationAvailability(d, data.tools);
            return (
              <li key={id}>
                <Link
                  href={d.href}
                  className="group flex h-full min-h-[6.75rem] flex-col justify-between gap-3 rounded-2xl border bg-background/70 p-3 backdrop-blur-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_14px_30px_-20px_rgb(112_71_235/0.55)] focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-3.5 dark:bg-background/40"
                >
                  <span className="flex items-start justify-between gap-2">
                    <DestinationGlyph icon={d.icon} group={d.group} size="sm" />
                    <ArrowUpRight className="size-4 text-muted-foreground/60 transition-[color,transform] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary motion-reduce:transition-none" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.92rem] leading-snug font-semibold">{d.action}</span>
                    <StateChip value={state} readyLabel="Open" className="mt-1.5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Recommended for you                                                       */
/* -------------------------------------------------------------------------- */

function ForYou({ data }: { data: CommandCenterData }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const profile = data.profile;
  const personalised = profile?.onboarding === "completed" && profile.persona !== null;
  const picks = recommend(profile?.persona ?? null, profile?.goals ?? [], 4);

  const skip = async () => {
    setPending(true);
    setError(null);
    const r = await socialApi("/api/ai/profile", { method: "PUT", body: JSON.stringify({ action: "skip" }) });
    setPending(false);
    if (r.ok) router.refresh();
    else setError(r.message);
  };

  return (
    <section aria-labelledby="foryou-title" className="flex h-full flex-col gap-4">
      {personalised ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="foryou-title" className={sectionTitle}>
              Recommended for you
            </h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{PERSONA_BY_ID[profile.persona!].label}</span>
              {profile.goals.map((g) => (
                <span key={g} className="rounded-full bg-muted px-2 py-0.5 text-[0.75rem] font-medium">
                  {GOAL_BY_ID[g].label}
                </span>
              ))}
            </p>
          </div>
          <Link href={AI_ROUTES.welcome} className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
            <Settings2 className="size-4" aria-hidden /> Edit preferences
          </Link>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-[1.5rem] bg-graphite p-5 text-white sm:p-6 dark:bg-[#17181d] dark:ring-1 dark:ring-white/10">
          <div aria-hidden className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-primary/40 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-24 left-10 size-48 rounded-full bg-lime/15 blur-3xl" />
          <div className="relative">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[0.72rem] font-semibold text-lime">
              <Sparkles className="size-3" aria-hidden /> 3 quick questions
            </p>
            <h2 id="foryou-title" className="mt-3 font-heading text-[1.35rem] leading-tight font-extrabold tracking-tight sm:text-[1.55rem]">
              Make this workspace yours
            </h2>
            <p className="mt-1.5 max-w-md text-sm text-white/70">Tell us what describes you and what you want to achieve. We&apos;ll put the most useful tools first. You can change it any time.</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Link
                href={AI_ROUTES.welcome}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-lime px-4.5 text-sm font-bold text-graphite transition-[filter] hover:brightness-95 focus-visible:ring-3 focus-visible:ring-lime/50 focus-visible:outline-none"
              >
                Personalize my workspace <ArrowRight className="size-4" aria-hidden />
              </Link>
              {!profile ? (
                <button
                  type="button"
                  onClick={skip}
                  disabled={pending}
                  className="inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-3 focus-visible:ring-white/30 focus-visible:outline-none disabled:opacity-60"
                >
                  {pending ? "Saving…" : "Not now"}
                </button>
              ) : null}
            </div>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-[#ffb4a8]">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      )}

      <div>
        {!personalised ? <h3 className="mb-2.5 text-sm font-semibold text-muted-foreground">Good places to start</h3> : null}
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {picks.map(({ destination: d, reasons }) => (
            <li key={d.id}>
              <Link
                href={d.href}
                className="group flex h-full flex-col gap-3 rounded-2xl border bg-card p-4 shadow-soft transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-[0_16px_34px_-24px_rgb(112_71_235/0.6)] focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
              >
                <span className="flex items-start justify-between gap-3">
                  <DestinationGlyph icon={d.icon} group={d.group} />
                  <StateChip value={destinationAvailability(d, data.tools)} readyLabel={d.toolId ? "Ready" : "Open"} />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold leading-snug">{d.name}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{d.blurb}</span>
                </span>
                <span className="mt-auto flex flex-wrap gap-1">
                  {reasons.slice(0, 2).map((r) => (
                    <span key={r} className="rounded-md bg-primary/[0.06] px-1.5 py-0.5 text-[0.7rem] font-medium text-primary dark:bg-primary/15 dark:text-[#c4b5ff]">
                      {r}
                    </span>
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  My workspace                                                              */
/* -------------------------------------------------------------------------- */

function MyWorkspace({ data }: { data: CommandCenterData }) {
  const w = data.workspace;
  const empty = w.drafts.total === 0 && w.planned.total === 0 && w.automations.total === 0 && w.accounts.connected === 0;
  return (
    <section aria-labelledby="mine-title" className="flex flex-col rounded-[1.5rem] border bg-card shadow-soft">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
        <h2 id="mine-title" className={sectionTitle}>
          My workspace
        </h2>
        <Link href="/dashboard/social" className="text-sm font-semibold text-primary hover:underline focus-visible:underline focus-visible:outline-none dark:text-[#c4b5ff]">
          Open social workspace
        </Link>
      </div>

      {empty ? (
        <div className="m-5 mt-4 flex flex-1 flex-col items-start justify-center rounded-2xl border border-dashed p-5 sm:m-6 sm:mt-4">
          <Layers3 className="size-6 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-semibold">Nothing here yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Your drafts, planned content and automations will appear here as you create them.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/dashboard/social/publishing/new" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none">
              <FilePen className="size-4" aria-hidden /> Write a draft
            </Link>
            <Link href="/dashboard/social/automations/new" className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-semibold hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
              <Workflow className="size-4" aria-hidden /> Create an automation
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col">
          <div className="px-5 pb-4 sm:px-6">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold">Recent drafts</h3>
              <span className="text-sm text-muted-foreground tabular-nums">{formatNumber(w.drafts.total)} in total</span>
            </div>
            {w.drafts.recent.length ? (
              <ul className="mt-2 divide-y rounded-xl border">
                {w.drafts.recent.map((d) => (
                  <li key={d.id}>
                    <Link href={`/dashboard/social/publishing/${encodeURIComponent(d.id)}`} className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none">
                      <FilePen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate font-medium">{d.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        <When iso={d.updatedAt} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">
                No drafts yet.{" "}
                <Link href="/dashboard/social/publishing/new" className="font-semibold text-primary hover:underline dark:text-[#c4b5ff]">
                  Write one
                </Link>
              </p>
            )}
          </div>
          <dl className="grid grid-cols-2 border-t">
            <Stat href="/dashboard/social/calendar" icon={CalendarClock} label="Planned content" value={w.planned.total} detail={w.planned.next ? <When iso={w.planned.next.at} prefix="Next" /> : "Nothing planned"} />
            <Stat href="/dashboard/social/automations" icon={Workflow} label="Active automations" value={w.automations.active} detail={w.automations.total ? `${formatNumber(w.automations.total)} in total` : "None yet"} className="border-l" />
            <Stat href="/dashboard/social/automations" icon={Inbox} label="Inbox items" value={w.automations.openInbox} detail={w.automations.openInbox ? "Waiting for you" : "All clear"} className="border-t" />
            <Stat href="/dashboard/social/accounts" icon={Link2} label="Connected accounts" value={w.accounts.connected} detail={w.accounts.connected ? "In your workspace" : "None connected yet"} className="border-t border-l" />
          </dl>
        </div>
      )}
    </section>
  );
}

function Stat({ href, icon: Icon, label, value, detail, className }: { href: string; icon: typeof Inbox; label: string; value: number; detail: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <Link href={href} className="flex h-full flex-col gap-1 px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none sm:px-6">
        <dt className="flex items-center gap-1.5 text-[0.78rem] font-medium text-muted-foreground">
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </dt>
        <dd className="font-heading text-[1.6rem] leading-none font-extrabold tabular-nums">{formatNumber(value)}</dd>
        <dd className="truncate text-xs text-muted-foreground">{detail}</dd>
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Discover more                                                             */
/* -------------------------------------------------------------------------- */

function Discover({ data }: { data: CommandCenterData }) {
  const [group, setGroup] = React.useState<DestinationGroup>("content");
  const tabs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const current = DESTINATION_GROUPS.find((g) => g.id === group)!;

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = DESTINATION_GROUPS.length;
    const next = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setGroup(DESTINATION_GROUPS[next].id);
    tabs.current[next]?.focus();
  };

  return (
    <section aria-labelledby="discover-title" className="rounded-[1.75rem] border bg-surface p-4 sm:p-6 lg:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="discover-title" className={sectionTitle}>
            Discover more
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Everything in SociVanta AI, grouped by what it helps with.</p>
        </div>
        <Link href="/ai-tools" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline focus-visible:underline focus-visible:outline-none dark:text-[#c4b5ff]">
          Browse the AI tools directory <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      </div>

      <div role="tablist" aria-label="Tool groups" className="-mx-1 mt-5 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {DESTINATION_GROUPS.map((g, i) => {
          const on = g.id === group;
          return (
            <button
              key={g.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${g.id}`}
              aria-selected={on}
              aria-controls={`panel-${g.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setGroup(g.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none",
                on ? "bg-card text-foreground shadow-soft ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {g.name}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`panel-${group}`} aria-labelledby={`tab-${group}`} key={group} className="mt-4 animate-in duration-300 fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
        <p className="mb-3 text-sm text-muted-foreground">{current.description}</p>
        <ul className="grid gap-2 md:grid-cols-2">
          {DESTINATIONS.filter((d) => d.group === group).map((d) => (
            <li key={d.id}>
              <Link href={d.href} className="group flex items-center gap-3.5 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/30 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:p-3.5">
                <DestinationGlyph icon={d.icon} group={d.group} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold">{d.name}</span>
                    <StateChip value={destinationAvailability(d, data.tools)} readyLabel={d.toolId ? "Ready" : "Open"} />
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{d.note ?? d.blurb}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function AccountLinks({ data }: { data: CommandCenterData }) {
  const runs = data.runsToday;
  return (
    <section aria-label="Usage and plans" className="grid gap-3 sm:grid-cols-2">
      <Link href={AI_ROUTES.usage} className="group flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-soft transition-colors hover:border-primary/30 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/[0.08] text-primary dark:bg-primary/20 dark:text-[#c4b5ff]">
          <Gauge className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Usage &amp; allowances</span>
          <span className="block text-sm text-muted-foreground">
            {runs === null ? "See each tool's daily allowance and when it resets." : runs === 0 ? "No AI runs today. See each tool's daily allowance." : `${formatNumber(runs)} ${runs === 1 ? "run" : "runs"} counted today. See what's left.`}
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
      </Link>
      <Link href={AI_ROUTES.plans} className="group flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-soft transition-colors hover:border-primary/30 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-lime/40 text-graphite dark:bg-lime/15 dark:text-lime">
          <BarChart3 className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Plans</span>
          <span className="block text-sm text-muted-foreground">You&apos;re on {data.plan.name}. Paid plans haven&apos;t been announced.</span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
      </Link>
    </section>
  );
}
