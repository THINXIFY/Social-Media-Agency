"use client";

import * as React from "react";
import { ArrowRight, Ban, Clock, KeyRound, LayoutGrid, Link2, Link2Off, MousePointerClick, RefreshCw, ShieldCheck, UserRoundCheck, type LucideIcon } from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { PLATFORMS } from "@/lib/catalog";
import { CAPABILITY_LABEL, SOCIAL_PLATFORM, SOCIAL_PLATFORMS, type SocialPlatform, type SocialProviderId } from "@/lib/social/platforms";
import { cn } from "@/lib/utils";

/*
 * The Social Management hero's interactive product demonstration (AI-06).
 * Purely illustrative: placeholder identities, no figures, no connected state,
 * and every status is the platform's real availability from the server. It
 * rotates Overview → Accounts → Activity on its own, and pauses whenever the
 * visitor is looking closely (hover, focus, interaction), when it's offscreen
 * or the tab is hidden, and entirely under reduced motion.
 */

const TAB_MS = 7000;
const IDLE_RESUME_MS = 12000;
const TABS = ["Overview", "Accounts", "Activity"] as const;
type Tab = (typeof TABS)[number];

const CATALOG = new Map(PLATFORMS.map((p) => [p.id, p]));
function Tile({ id, size = "sm", className }: { id: SocialProviderId; size?: "xs" | "sm" | "md"; className?: string }) {
  const p = CATALOG.get(id);
  return p ? <PlatformTile platform={p} size={size} className={className} /> : null;
}
const insightLabels = (p: SocialPlatform) => p.capabilities.filter((c) => c !== "profile").map((c) => (c === "audience" ? p.nouns.audience : c === "content-count" ? p.nouns.content : CAPABILITY_LABEL[c]));

const DEMO_ACCOUNTS: { id: SocialProviderId; name: string; handle: string }[] = [
  { id: "instagram", name: "Your brand", handle: "@yourbrand" },
  { id: "youtube", name: "Your channel", handle: "@yourchannel" },
  { id: "tiktok", name: "Your creator profile", handle: "@yourprofile" },
];

const EXAMPLE_EVENTS: { id: SocialProviderId; icon: LucideIcon; kind: string; title: string; meaning: string }[] = [
  { id: "instagram", icon: Link2, kind: "Connection", title: "Connected Your brand", meaning: "Recorded when you approve read-only access on Instagram. SociVanta never sees your password." },
  { id: "youtube", icon: RefreshCw, kind: "Refresh", title: "Refreshed Your channel", meaning: "Recorded each time you ask for the latest details. Figures appear exactly as YouTube reports them." },
  { id: "tiktok", icon: KeyRound, kind: "Access renewal", title: "Renewed access to Your creator profile", meaning: "Recorded when access is renewed automatically, so the connection keeps working without signing in again." },
  { id: "x", icon: Link2Off, kind: "Disconnection", title: "Disconnected Your profile", meaning: "Recorded when you disconnect. SociVanta deletes its stored access and tells you whether X confirmed the removal." },
];

/* -------------------------------------------------------------------------- */
/*  Rotation: state + every reason to pause                                   */
/* -------------------------------------------------------------------------- */

function useRotation(root: React.RefObject<HTMLElement | null>) {
  const [tab, setTab] = React.useState(0);
  const [cycle, setCycle] = React.useState(0);
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [interacted, setInteracted] = React.useState(false);
  const [visible, setVisible] = React.useState(true);
  const [pageVisible, setPageVisible] = React.useState(true);
  const [reduced, setReduced] = React.useState(false);
  const idle = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMq = () => setReduced(mq.matches);
    const onVis = () => setPageVisible(document.visibilityState === "visible");
    onMq();
    onVis();
    mq.addEventListener("change", onMq);
    document.addEventListener("visibilitychange", onVis);
    const el = root.current;
    const io = el ? new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.25 }) : null;
    if (el && io) io.observe(el);
    return () => {
      mq.removeEventListener("change", onMq);
      document.removeEventListener("visibilitychange", onVis);
      io?.disconnect();
      if (idle.current) clearTimeout(idle.current);
    };
  }, [root]);

  const paused = hovered || focused || interacted || !visible || !pageVisible || reduced;

  /** The visitor chose something: hold their choice until they've been idle for a while. */
  const touch = React.useCallback(() => {
    setInteracted(true);
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => setInteracted(false), IDLE_RESUME_MS);
  }, []);

  const select = React.useCallback(
    (i: number) => {
      touch();
      setTab(i);
      setCycle((c) => c + 1);
    },
    [touch],
  );
  const advance = React.useCallback(() => {
    setTab((t) => (t + 1) % TABS.length);
    setCycle((c) => c + 1);
  }, []);

  return { tab, cycle, paused, reduced, select, advance, touch, setHovered, setFocused };
}

/* -------------------------------------------------------------------------- */
/*  Small parts                                                               */
/* -------------------------------------------------------------------------- */

function Awaiting({ ready, className }: { ready: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[0.62rem] leading-none font-semibold whitespace-nowrap ring-1 ring-inset", ready ? "bg-ok-soft text-ok ring-ok/15" : "bg-soon-soft/70 text-soon ring-soon/15", className)}>
      <span className={cn("size-1 rounded-full", ready ? "bg-ok" : "bg-soon")} aria-hidden />
      {ready ? "Ready to connect" : "Awaiting approval"}
    </span>
  );
}

/** Staggered rise for items in the panel that just became active (CSS only; static under reduced motion). */
const rise = (i: number): React.CSSProperties => ({ animationDelay: `${80 + i * 60}ms` });

/* -------------------------------------------------------------------------- */
/*  Panels                                                                    */
/* -------------------------------------------------------------------------- */

function OverviewPanel({ ready, selected, onSelect }: { ready: Record<SocialProviderId, boolean>; selected: number; onSelect: (i: number) => void }) {
  const a = DEMO_ACCOUNTS[selected]!;
  const p = SOCIAL_PLATFORM[a.id];
  return (
    <div className="grid h-full grid-cols-1 gap-3 sm:grid-cols-[14rem_minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-4">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-1 sm:content-start" role="group" aria-label="Example accounts">
        {DEMO_ACCOUNTS.map((d, i) => {
          const on = i === selected;
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(i)}
              style={rise(i)}
              className={cn(
                "sv-rise group/acc flex min-w-0 flex-col items-center gap-2 rounded-2xl border p-2.5 text-center transition-[border-color,background-color,box-shadow] duration-300 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none sm:flex-row sm:p-3 sm:text-start",
                on ? "border-primary/40 bg-primary/[0.05] shadow-[0_10px_24px_-18px_rgb(112_71_235/0.7)] dark:bg-primary/[0.12]" : "border-border bg-background/60 hover:border-foreground/15 dark:bg-white/[0.02]",
              )}
            >
              <Tile id={d.id} size="sm" className={cn("transition-transform duration-300 motion-reduce:transition-none", on && "scale-105")} />
              <span className="w-full min-w-0 flex-1">
                <span className="block truncate text-[0.72rem] font-bold sm:text-[0.82rem]">{d.name}</span>
                <span className="hidden truncate text-[0.7rem] text-muted-foreground sm:block">{SOCIAL_PLATFORM[d.id].name}</span>
              </span>
              <span className={cn("hidden size-1.5 shrink-0 rounded-full transition-colors sm:block", on ? "bg-primary" : "bg-transparent")} aria-hidden />
            </button>
          );
        })}
      </div>

      <div key={a.id} className="sv-fade flex min-h-0 flex-col rounded-2xl border bg-background/60 p-4 dark:bg-white/[0.02]">
        <div className="flex items-start gap-3">
          <Tile id={a.id} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-[1rem] font-bold">{a.name}</p>
            <p className="truncate text-[0.74rem] text-muted-foreground">
              {a.handle} · {p.name}
            </p>
          </div>
          <Awaiting ready={ready[a.id]} />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[0.74rem]">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Account type</dt>
            <dd className="truncate font-semibold">{p.accountKind}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Access</dt>
            <dd className="flex items-center gap-1 font-semibold">
              <ShieldCheck className="size-3.5 text-ok" aria-hidden /> Read-only
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-[0.68rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">Insights {p.name} can share</p>
        <ul className={cn("mt-2 grid gap-2", insightLabels(p).length === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {insightLabels(p).map((m, i) => (
            <li key={m} style={rise(i)} className="sv-rise rounded-xl bg-muted/60 px-2.5 py-2 dark:bg-white/[0.04]">
              <p className="truncate text-[0.64rem] font-semibold text-muted-foreground">{m}</p>
              <p className="mt-0.5 text-[0.8rem] font-bold text-foreground/35">—</p>
            </li>
          ))}
        </ul>

        <p className="mt-auto flex items-center gap-1.5 pt-3 text-[0.68rem] text-muted-foreground">
          <Clock className="size-3 shrink-0" aria-hidden /> Figures appear only after {p.name} approves SociVanta and you connect.
        </p>
      </div>
    </div>
  );
}

function AccountsPanel({ ready }: { ready: Record<SocialProviderId, boolean> }) {
  const steps = [
    { icon: MousePointerClick, label: "Choose a platform" },
    { icon: KeyRound, label: "Review permissions" },
    { icon: UserRoundCheck, label: "Authorize on the platform" },
  ];
  return (
    <div className="grid h-full grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-4">
      <ul className="min-h-0 divide-y divide-border/60 overflow-hidden rounded-2xl border bg-background/60 dark:bg-white/[0.02]">
        {SOCIAL_PLATFORMS.map((p, i) => (
          <li key={p.id} style={rise(i)} className="sv-rise flex items-center gap-2.5 px-3 py-[0.45rem] sm:gap-3 sm:py-2">
            <Tile id={p.id} size="xs" className="size-7 rounded-lg [&_svg]:size-3.5" />
            <span className="w-[4.5rem] shrink-0 truncate text-[0.78rem] font-bold sm:w-20">{p.name}</span>
            <span className="hidden min-w-0 flex-1 truncate text-[0.7rem] text-muted-foreground sm:block">{["Profile", ...insightLabels(p)].join(" · ")}</span>
            <Awaiting ready={ready[p.id]} className="ms-auto" />
          </li>
        ))}
      </ul>
      <div className="hidden flex-col rounded-2xl border bg-background/60 p-4 lg:flex dark:bg-white/[0.02]">
        <p className="text-[0.78rem] font-bold">How connecting works</p>
        <ol className="mt-3 space-y-3">
          {steps.map((s, i) => (
            <li key={s.label} style={rise(i + 2)} className="sv-rise flex items-center gap-2.5 text-[0.76rem]">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/[0.08] text-primary dark:bg-primary/20 dark:text-[#c9bcff]">
                <s.icon className="size-3.5" aria-hidden />
              </span>
              {s.label}
            </li>
          ))}
        </ol>
        <p className="mt-auto flex items-start gap-1.5 rounded-xl bg-muted/60 px-2.5 py-2 text-[0.68rem] leading-relaxed text-muted-foreground dark:bg-white/[0.04]">
          <Ban className="mt-0.5 size-3 shrink-0" aria-hidden /> No passwords. No posting. Disconnect any time.
        </p>
      </div>
      <p className="flex items-center gap-1.5 text-[0.68rem] text-muted-foreground lg:hidden">
        <KeyRound className="size-3 shrink-0" aria-hidden /> Choose → review permissions → authorize on the platform. No passwords.
      </p>
    </div>
  );
}

function ActivityPanel({ selected, onSelect }: { selected: number; onSelect: (i: number) => void }) {
  const e = EXAMPLE_EVENTS[selected]!;
  return (
    <div className="grid h-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-4">
      <div className="min-h-0">
        <p className="mb-2 flex items-center gap-1.5 text-[0.68rem] font-semibold text-muted-foreground">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[0.6rem] font-bold tracking-[0.08em] uppercase dark:bg-white/[0.06]">Examples</span>
          What your history will record
        </p>
        <ul className="space-y-1.5" role="group" aria-label="Example events">
          {EXAMPLE_EVENTS.map((ev, i) => {
            const on = i === selected;
            const Icon = ev.icon;
            return (
              <li key={ev.title} style={rise(i)} className="sv-rise">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onSelect(i)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-start transition-[border-color,background-color] duration-300 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none",
                    on ? "border-primary/40 bg-primary/[0.05] dark:bg-primary/[0.12]" : "border-transparent bg-background/60 hover:border-border dark:bg-white/[0.02]",
                  )}
                >
                  <span className="relative shrink-0">
                    <Tile id={ev.id} size="xs" className="size-7 rounded-lg [&_svg]:size-3.5" />
                    <span className="absolute -end-1 -bottom-1 grid size-3.5 place-items-center rounded-full bg-card text-primary ring-1 ring-border">
                      <Icon className="size-2" aria-hidden />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.76rem] font-semibold">{ev.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div key={selected} className="sv-fade hidden flex-col rounded-2xl border bg-background/60 p-4 sm:flex dark:bg-white/[0.02]">
        <div className="flex items-center gap-2.5">
          <Tile id={e.id} size="sm" />
          <p className="min-w-0 text-[0.82rem] leading-snug font-bold">{e.title}</p>
        </div>
        <p className="mt-3 text-[0.68rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">What this means</p>
        <p className="mt-1.5 text-[0.76rem] leading-relaxed text-muted-foreground">{e.meaning}</p>
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-[0.7rem]">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Platform</dt>
            <dd className="truncate font-semibold">{SOCIAL_PLATFORM[e.id].name}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Event</dt>
            <dd className="truncate font-semibold">{e.kind}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Visible to</dt>
            <dd className="truncate font-semibold">Only you</dd>
          </div>
        </dl>
        <p className="mt-auto pt-3 text-[0.68rem] text-muted-foreground">Example only — nothing has been connected yet.</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function SocialHeroPreview({ ready }: { ready: Record<SocialProviderId, boolean> }) {
  const root = React.useRef<HTMLDivElement>(null);
  const r = useRotation(root);
  const [account, setAccount] = React.useState(0);
  const [event, setEvent] = React.useState(0);
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const id = React.useId();

  // Inside the active tab, gently move the highlight through its items while rotating.
  React.useEffect(() => {
    if (r.paused || r.tab === 1) return;
    const t = setInterval(() => {
      if (r.tab === 0) setAccount((a) => (a + 1) % DEMO_ACCOUNTS.length);
      else setEvent((e) => (e + 1) % EXAMPLE_EVENTS.length);
    }, r.tab === 0 ? TAB_MS / 3 : TAB_MS / 4);
    return () => clearInterval(t);
  }, [r.paused, r.tab, r.cycle]);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? (i + 1) % 3 : e.key === "ArrowLeft" ? (i + 2) % 3 : e.key === "Home" ? 0 : e.key === "End" ? 2 : -1;
    if (next < 0) return;
    e.preventDefault();
    r.select(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div
      ref={root}
      onPointerEnter={() => r.setHovered(true)}
      onPointerLeave={() => r.setHovered(false)}
      onFocus={() => r.setFocused(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && r.setFocused(false)}
      data-paused={r.paused ? "true" : "false"}
      className="overflow-hidden rounded-[1.75rem] border bg-card shadow-[0_50px_100px_-60px_rgb(32_33_39/0.5),0_0_0_1px_rgb(32_33_39/0.02)] dark:bg-[#111217] dark:shadow-[0_50px_100px_-50px_rgb(0_0_0/0.9)]"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 border-b bg-subtle/60 px-4 py-3 sm:px-5 dark:bg-white/[0.02]">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-graphite text-lime dark:bg-white/10">
          <LayoutGrid className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[0.88rem] font-bold">Social workspace</p>
          <p className="hidden truncate text-[0.7rem] text-muted-foreground sm:block">SociVanta AI</p>
        </div>
        <span className="ms-auto shrink-0 rounded-full border border-dashed border-foreground/20 px-2.5 py-1 text-[0.62rem] font-bold tracking-[0.12em] text-muted-foreground uppercase md:order-last md:ms-0">Preview</span>

        <div role="tablist" aria-label="Preview sections" className="relative order-last grid w-full grid-cols-3 rounded-full bg-muted/80 p-1 text-[0.76rem] font-semibold md:order-none md:ms-auto md:w-[19rem] dark:bg-white/[0.05]">
          <span
            className="pointer-events-none absolute inset-y-1 start-1 w-[calc((100%-0.5rem)/3)] overflow-hidden rounded-full bg-card shadow-soft transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:bg-white/10"
            style={{ transform: `translateX(${r.tab * 100}%)` }}
            aria-hidden
          >
            {/* Progress toward the next section; frozen while paused, hidden under reduced motion. */}
            {!r.reduced ? (
              <span
                key={r.cycle}
                onAnimationEnd={r.advance}
                className="sv-progress absolute inset-x-3 bottom-0.5 h-[2px] origin-left rounded-full bg-primary/70"
                style={{ animationDuration: `${TAB_MS}ms`, animationPlayState: r.paused ? "paused" : "running" }}
              />
            ) : null}
          </span>
          {TABS.map((t, i) => (
            <button
              key={t}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${i}`}
              aria-selected={r.tab === i}
              aria-controls={`${id}-panel-${i}`}
              tabIndex={r.tab === i ? 0 : -1}
              onClick={() => r.select(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn("relative z-10 h-8 rounded-full transition-colors duration-300 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none", r.tab === i ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Stage: fixed height, panels crossfade in place (no layout shift). */}
      <div className="relative h-[25.5rem] sm:h-[20.5rem] lg:h-[19.5rem]">
        {TABS.map((t: Tab, i) => {
          const on = r.tab === i;
          return (
            <div
              key={t}
              role="tabpanel"
              id={`${id}-panel-${i}`}
              aria-labelledby={`${id}-tab-${i}`}
              aria-hidden={!on}
              inert={!on}
              className={cn(
                "absolute inset-0 p-3 transition-[opacity,transform] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:p-4 lg:p-5",
                on ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
              )}
            >
              {/* Re-keyed on every activation so its items rise in again. */}
              <div key={on ? `on-${r.cycle}` : "off"} className="h-full">
                {i === 0 ? (
                  <OverviewPanel
                    ready={ready}
                    selected={account}
                    onSelect={(n) => {
                      r.touch();
                      setAccount(n);
                    }}
                  />
                ) : i === 1 ? (
                  <AccountsPanel ready={ready} />
                ) : (
                  <ActivityPanel
                    selected={event}
                    onSelect={(n) => {
                      r.touch();
                      setEvent(n);
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-[0.68rem] text-muted-foreground sm:px-5">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <RefreshCw className="size-3 shrink-0" aria-hidden />
          <span className="truncate">Refreshed only when you ask — never in the background</span>
        </span>
        <span className="hidden shrink-0 items-center gap-1 sm:inline-flex">
          Read-only <ArrowRight className="size-3" aria-hidden /> no posting
        </span>
      </div>
    </div>
  );
}
