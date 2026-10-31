"use client";

import * as React from "react";
import {
  ArrowUpDown,
  BadgeCheck,
  Ban,
  Check,
  CircleCheck,
  Clock3,
  Copy,
  Gift,
  Hourglass,
  Link2,
  type LucideIcon,
  Mail,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Undo2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { DEMO_WALLET, formatDate, formatDateTime, money } from "@/lib/demo-account";
import {
  qualificationOf,
  REFERRAL_BY_ID,
  REFERRAL_PROGRAM as P,
  REFERRAL_STATUS_META,
  REFERRALS,
  type Referral,
  referralSummary,
  type ReferralStatus,
  REWARD_BY_ID,
  REWARD_STATUS_META,
  rewardDate,
  REWARDS,
  type Reward,
  type RewardStatus,
} from "@/lib/demo-referrals";
import { useDisplay } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { FxNote } from "./region";
import { DemoTag, enter, Panel, PanelHeader } from "./shared";

/* -------------------------------------------------------------------------- */
/*  Shared bits                                                               */
/* -------------------------------------------------------------------------- */

const SUMMARY = referralSummary();

const STATUS_STYLE: Record<ReferralStatus, { className: string; Icon: LucideIcon }> = {
  invited: { className: "bg-muted text-muted-foreground", Icon: Send },
  signed_up: { className: "bg-secondary text-secondary-foreground", Icon: UserPlus },
  pending: { className: "bg-soon-soft text-soon", Icon: Hourglass },
  qualified: { className: "bg-primary/12 text-primary dark:bg-primary/20", Icon: BadgeCheck },
  rewarded: { className: "bg-ok-soft text-ok", Icon: CircleCheck },
  ineligible: { className: "bg-off-soft text-off", Icon: Ban },
};

const REWARD_STYLE: Record<RewardStatus, { className: string; amount: string; Icon: LucideIcon }> = {
  pending: { className: "bg-muted text-muted-foreground", amount: "text-muted-foreground", Icon: Clock3 },
  approved: { className: "bg-primary/12 text-primary dark:bg-primary/20", amount: "text-primary", Icon: BadgeCheck },
  credited: { className: "bg-ok-soft text-ok", amount: "text-ok", Icon: CircleCheck },
  reversed: { className: "bg-off-soft text-off", amount: "text-muted-foreground line-through", Icon: Undo2 },
};

function StatusBadge({ status }: { status: ReferralStatus }) {
  const { className, Icon } = STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.72rem] font-semibold whitespace-nowrap ring-1 ring-current/15 ring-inset", className)}>
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      {REFERRAL_STATUS_META[status].label}
    </span>
  );
}

function RewardBadge({ status }: { status: RewardStatus }) {
  const { className, Icon } = REWARD_STYLE[status];
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-[0.72rem] font-semibold whitespace-nowrap", className)}>
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      {REWARD_STATUS_META[status].label}
    </span>
  );
}

/** Copies text and reports the result for a short while. */
function useCopy() {
  const [state, setState] = React.useState<{ key: string; ok: boolean } | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (key: string, text: string) => {
    let ok = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      ok = false;
    }
    setState({ key, ok });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState(null), 2400);
  };
  return [state, copy] as const;
}

const noopSubscribe = () => () => {};
/** Native sharing, only once we know the browser supports it. */
function useCanShare() {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  );
}

const SHARE_TEXT = `Join me on SociVanta with my invite code ${P.code}. (Demo preview: SociVanta invites aren't active yet, so nothing is tracked.)`;
const LINK_TEXT = `[Demo preview — not active] SociVanta invite …${P.invitePath} · code ${P.code}`;

/* -------------------------------------------------------------------------- */
/*  Hero & invite                                                             */
/* -------------------------------------------------------------------------- */

function Hero({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const [copied, copy] = useCopy();
  const canShare = useCanShare();
  const [shared, setShared] = React.useState<"idle" | "done">("idle");

  const share = async () => {
    try {
      await navigator.share({ title: "SociVanta invite (demo)", text: SHARE_TEXT });
      setShared("done");
    } catch {
      // Cancelled or unavailable — nothing to report.
    }
  };

  const copyBtn =
    "inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:outline-none";
  const announce =
    copied?.ok === false
      ? "Couldn't copy. Select the text to copy it."
      : copied?.key === "code"
        ? "Invite code copied. Demo only."
        : copied?.key === "link"
          ? "Link preview copied. It isn't active yet."
          : shared === "done"
            ? "Shared. Demo only."
            : "";

  return (
    <section
      aria-labelledby="rewards-title"
      className={cn("relative isolate overflow-hidden rounded-3xl bg-graphite p-5 text-white shadow-soft sm:p-8 lg:p-10", className)}
      style={style}
    >
      {/* Soft brand light */}
      <span className="pointer-events-none absolute -top-32 -end-24 -z-10 size-96 rounded-full bg-primary/45 blur-3xl" aria-hidden />
      <span className="pointer-events-none absolute -bottom-40 -start-20 -z-10 size-80 rounded-full bg-lime/15 blur-3xl" aria-hidden />

      <div className="grid grid-cols-1 items-center gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-10">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.16em] text-lime uppercase">
            <Gift className="size-4" aria-hidden /> SociVanta Rewards
          </p>
          <h1 id="rewards-title" className="mt-3 text-[2rem] leading-[1.05] font-extrabold tracking-tight text-balance sm:text-[2.6rem] lg:text-[3rem]">
            Good things are better shared.
          </h1>
          <p className="mt-3 max-w-xl text-[0.98rem] leading-relaxed text-white/70">
            Invite others to SociVanta, track your referrals and see your rewards in one place.
          </p>
          <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/75">
            <Clock3 className="size-3.5 text-lime" aria-hidden />
            Program preview · launching after verification
          </p>
        </div>

        {/* Invite card */}
        <div className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/12 backdrop-blur-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Your invite</p>
            <DemoTag className="text-white/60">Demo preview</DemoTag>
          </div>

          <p className="mt-4 text-[0.7rem] font-bold tracking-wider text-white/50 uppercase">Invite code</p>
          <div className="mt-1.5 flex items-center justify-between gap-3 rounded-xl bg-white/[0.06] p-2 ps-4 ring-1 ring-white/10">
            <span className="font-mono text-xl font-bold tracking-[0.12em] text-lime sm:text-2xl">{P.code}</span>
            <button
              type="button"
              onClick={() => copy("code", P.code)}
              className={cn(copyBtn, "h-9 bg-white text-graphite hover:bg-white/90 focus-visible:ring-lime/50")}
              aria-label={`Copy invite code ${P.code}`}
            >
              {copied?.key === "code" && copied.ok ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied?.key === "code" && copied.ok ? "Copied" : "Copy code"}
            </button>
          </div>

          <p className="mt-4 flex items-center gap-2 text-[0.7rem] font-bold tracking-wider text-white/50 uppercase">
            Invite link
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[0.6rem] tracking-wide text-white/70 normal-case">Preview · not active</span>
          </p>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-dashed border-white/20 px-3 py-2.5">
            <Link2 className="size-4 shrink-0 text-white/45" aria-hidden />
            <span className="min-w-0 truncate font-mono text-[0.82rem] text-white/60" title="Invite links aren't active yet">
              …{P.invitePath}
            </span>
          </div>

          <div className={cn("mt-4 grid gap-2", canShare ? "grid-cols-2" : "grid-cols-1")}>
            <button
              type="button"
              onClick={() => copy("link", LINK_TEXT)}
              className={cn(copyBtn, "bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary/45")}
            >
              {copied?.key === "link" && copied.ok ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied?.key === "link" && copied.ok ? "Preview copied" : "Copy link preview"}
            </button>
            {canShare ? (
              <button type="button" onClick={share} className={cn(copyBtn, "border border-white/20 text-white hover:bg-white/10 focus-visible:ring-white/30")}>
                <Share2 className="size-4" aria-hidden /> Share
              </button>
            ) : null}
          </div>
          <p role="status" className="mt-2 min-h-4 text-center text-xs text-lime/90">
            {announce}
          </p>

          <p className="mt-2 border-t border-white/10 pt-3 text-xs leading-relaxed text-white/60">
            <span className="font-semibold text-white/85">How attribution will work:</span> once the program launches, friends who sign up through
            your link or enter your code are linked to your account. Until then nothing is tracked, no cookies are set and copied links don&apos;t
            open a page.
          </p>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Overview & how it works                                                   */
/* -------------------------------------------------------------------------- */

function Stats({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const tiles: { label: string; value: string; note: string; Icon: LucideIcon; tone: string; dashed?: boolean }[] = [
    { label: "Total Invites", value: String(SUMMARY.invites), note: "Shared by link or code", Icon: Send, tone: "bg-muted text-foreground/75" },
    {
      label: "Successful Signups",
      value: String(SUMMARY.signups),
      note: `${Math.round((SUMMARY.signups / SUMMARY.invites) * 100)}% of invites`,
      Icon: UserPlus,
      tone: "bg-secondary text-secondary-foreground",
    },
    { label: "Qualified Referrals", value: String(SUMMARY.qualified), note: "Met the requirements", Icon: BadgeCheck, tone: "bg-primary/12 text-primary dark:bg-primary/20" },
    { label: "Rewards Earned", value: money(SUMMARY.earned), note: "Approved + credited", Icon: Gift, tone: "bg-ok-soft text-ok" },
    { label: "Pending Rewards", value: money(SUMMARY.pending), note: "In review", Icon: Clock3, tone: "bg-muted text-muted-foreground", dashed: true },
  ];
  return (
    <section aria-labelledby="overview-title" className={className} style={style}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 id="overview-title" className="text-base font-bold sm:text-[1.05rem]">
          Referral overview
        </h2>
        <DemoTag className="text-muted-foreground" />
      </div>
      <dl className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t, i) => (
          <div
            key={t.label}
            className={cn(
              "flex flex-col rounded-2xl border bg-card p-3.5 shadow-soft sm:p-4",
              t.dashed && "border-dashed shadow-none",
              i === tiles.length - 1 && "max-md:col-span-2",
            )}
          >
            <dt className="flex items-center gap-2 text-[0.8rem] font-medium text-muted-foreground">
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", t.tone)} aria-hidden>
                <t.Icon className="size-3.5" />
              </span>
              {t.label}
            </dt>
            <dd className="mt-3 font-heading text-2xl font-extrabold tabular-nums sm:text-[1.65rem]">{t.value}</dd>
            <dd className="mt-0.5 text-xs text-muted-foreground">{t.note}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2.5 px-1 text-xs text-muted-foreground">
        Reward amounts are illustrative. They aren&apos;t added to your {money(DEMO_WALLET.balance)} demo wallet and can&apos;t be spent.
      </p>
      <FxNote className="mt-1 px-1" />
    </section>
  );
}

function HowItWorks({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const steps = [
    { title: "Share your invite", body: "Send your code or link to people who'd find SociVanta useful.", Icon: Share2 },
    { title: "Your friend signs up", body: "They create a new SociVanta account using your link or code.", Icon: UserPlus },
    {
      title: "Earn rewards",
      body: `Once their completed orders reach ${money(P.qualifyingSpend)} within ${P.qualifyingDays} days and a ${P.holdDays}-day review passes.`,
      Icon: Gift,
    },
  ];
  return (
    <Panel className={cn("p-4 sm:p-6", className)} style={style} aria-labelledby="how-title">
      <PanelHeader id="how-title" title="How it works" description="Three steps. No affiliate jargon." />
      <ol className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex gap-3.5 rounded-2xl bg-muted/45 p-4 md:flex-col md:gap-3 dark:bg-muted/30">
            <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-card text-primary shadow-sm ring-1 ring-border">
              <s.Icon className="size-5" aria-hidden />
              <span className="absolute -top-1.5 -end-1.5 grid size-5 place-items-center rounded-full bg-primary text-[0.65rem] font-bold text-primary-foreground">
                {i + 1}
              </span>
            </span>
            <div>
              <h3 className="text-[0.95rem] font-bold">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/*  Referral activity                                                         */
/* -------------------------------------------------------------------------- */

type StatusFilter = "all" | ReferralStatus;
type Sort = "newest" | "oldest" | "progress";
const FILTERS: StatusFilter[] = ["all", "invited", "signed_up", "pending", "qualified", "rewarded", "ineligible"];

function rewardLine(r: Referral): { text: string; tone: string } {
  const rw = r.rewardId ? REWARD_BY_ID[r.rewardId] : null;
  if (rw) return { text: `${money(rw.amount)} · ${REWARD_STATUS_META[rw.status].label}`, tone: REWARD_STYLE[rw.status].amount };
  if (r.status === "ineligible") return { text: "Not eligible", tone: "text-muted-foreground" };
  return { text: `${money(P.reward.amount)} if they qualify`, tone: "text-muted-foreground" };
}

function Progress({ r }: { r: Referral }) {
  const q = qualificationOf(r);
  if (r.status === "pending") {
    return (
      <span className="block min-w-0">
        <span className="flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium tabular-nums">
            {money(r.spend)} <span className="text-muted-foreground">of {money(P.qualifyingSpend)}</span>
          </span>
          <span className="text-muted-foreground tabular-nums">{q.pct}%</span>
        </span>
        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="block h-full rounded-full bg-soon" style={{ width: `${q.pct}%` }} />
        </span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5" aria-label={`${q.done} of 4 steps complete`}>
      {q.steps.map((s) => (
        <span
          key={s.label}
          className={cn("h-1.5 flex-1 rounded-full", s.done ? (r.status === "ineligible" ? "bg-off/50" : r.status === "rewarded" ? "bg-ok" : "bg-primary") : "bg-muted")}
        />
      ))}
      <span className="ms-1 text-xs text-muted-foreground tabular-nums">{q.done}/4</span>
    </span>
  );
}

function Activity({ onOpen, className, style }: { onOpen: (id: string) => void; className?: string; style?: React.CSSProperties }) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [sort, setSort] = React.useState<Sort>("newest");

  const q = query.trim().toLowerCase();
  const matches = (r: Referral) => !q || r.id.toLowerCase().includes(q) || r.invitee.toLowerCase().includes(q);
  const count = (s: StatusFilter) => REFERRALS.filter((r) => matches(r) && (s === "all" || r.status === s)).length;
  const visible = REFERRALS.filter((r) => matches(r) && (status === "all" || r.status === status)).sort((a, b) =>
    sort === "progress"
      ? qualificationOf(b).done - qualificationOf(a).done || b.spend - a.spend
      : sort === "oldest"
        ? a.invitedAt.localeCompare(b.invitedAt)
        : b.invitedAt.localeCompare(a.invitedAt),
  );
  const filtered = Boolean(q) || status !== "all";
  const clear = () => {
    setQuery("");
    setStatus("all");
  };

  return (
    <Panel className={cn("overflow-hidden", className)} style={style} aria-labelledby="activity-title">
      <div className="space-y-4 p-4 sm:p-5">
        <PanelHeader id="activity-title" title="Referral activity" description="Everyone you've invited, with where each referral stands." />

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <div className="relative flex-1">
            <label htmlFor="ref-search" className="sr-only">
              Search referrals
            </label>
            <Search className="pointer-events-none absolute top-1/2 start-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              id="ref-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by referral ID or invitee"
              autoComplete="off"
              className="h-11 w-full rounded-xl border bg-card pe-10 ps-10 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute top-1/2 end-2.5 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
          <div className="relative sm:w-48">
            <label htmlFor="ref-sort" className="sr-only">
              Sort referrals
            </label>
            <select
              id="ref-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="h-11 w-full appearance-none rounded-xl border bg-card pe-9 ps-3.5 text-sm font-medium shadow-xs transition-colors outline-none hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="progress">Most progress</option>
            </select>
            <ArrowUpDown className="pointer-events-none absolute top-1/2 end-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          </div>
        </div>

        <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:-mx-5 sm:px-5">
          <div className="inline-flex gap-1 rounded-full bg-muted p-1" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => {
              const on = status === f;
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setStatus(f)}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.8rem] font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                    on && "bg-card text-foreground shadow-sm",
                  )}
                >
                  {f === "all" ? "All" : REFERRAL_STATUS_META[f].label}
                  <span className="text-[0.7rem] tabular-nums">{count(f)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <p aria-live="polite">
            {visible.length} referral{visible.length === 1 ? "" : "s"}
            {status !== "all" ? ` · ${REFERRAL_STATUS_META[status].note}` : ""}
          </p>
          {filtered ? (
            <button type="button" onClick={clear} className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary hover:underline">
              <X className="size-3.5" aria-hidden /> Clear
            </button>
          ) : null}
        </div>
      </div>

      {visible.length ? (
        <>
          <div
            className="hidden gap-4 border-y bg-muted/40 px-5 py-2.5 text-[0.68rem] font-bold tracking-wider text-muted-foreground uppercase xl:grid xl:grid-cols-[minmax(0,1.3fr)_6rem_11rem_minmax(0,1fr)_9.5rem]"
            aria-hidden
          >
            <span>Invitee</span>
            <span>Invited</span>
            <span>Status</span>
            <span>Qualification</span>
            <span className="text-end">Reward</span>
          </div>
          <ul className="divide-y border-t xl:border-t-0" aria-label="Referrals">
            {visible.map((r) => {
              const rw = rewardLine(r);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(r.id)}
                    aria-label={`${r.id}, ${r.invitee}: ${REFERRAL_STATUS_META[r.status].label}. View details`}
                    className="flex w-full flex-col gap-3 px-4 py-4 text-start transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none sm:px-5 xl:grid xl:grid-cols-[minmax(0,1.3fr)_6rem_11rem_minmax(0,1fr)_9.5rem] xl:items-center xl:gap-4"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground uppercase" aria-hidden>
                        {r.invitee.slice(0, 2)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold break-all xl:truncate">{r.invitee}</span>
                        <span className="block text-xs text-muted-foreground">
                          {r.id} · via {r.via}
                          <span className="xl:hidden"> · {formatDate(r.invitedAt)}</span>
                        </span>
                      </span>
                      <span className="xl:hidden">
                        <StatusBadge status={r.status} />
                      </span>
                    </span>
                    <span className="hidden text-sm text-muted-foreground xl:block">{formatDate(r.invitedAt)}</span>
                    <span className="hidden xl:block">
                      <StatusBadge status={r.status} />
                    </span>
                    <span className="flex items-center gap-4 xl:block">
                      <span className="min-w-0 flex-1 xl:block">
                        <Progress r={r} />
                      </span>
                      <span className={cn("shrink-0 text-xs font-semibold xl:hidden", rw.tone)}>{rw.text}</span>
                    </span>
                    <span className={cn("hidden text-end text-sm font-semibold xl:block", rw.tone)}>{rw.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="border-t px-6 py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <Users className="size-6" aria-hidden />
          </span>
          <p className="mt-4 font-semibold">{filtered ? "No referrals match" : "No referrals yet"}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {filtered ? "Try a different search or status." : "Share your invite code. People you invite will appear here."}
          </p>
          {filtered ? (
            <button
              type="button"
              onClick={clear}
              className="mt-4 inline-flex h-10 items-center rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:border-foreground/25"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/*  Referral details                                                          */
/* -------------------------------------------------------------------------- */

function ReferralDetails({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [shown, setShown] = React.useState(id);
  if (id && id !== shown) setShown(id);
  const r = REFERRAL_BY_ID[id ?? shown ?? ""];

  return (
    <Sheet open={Boolean(id)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[30rem]">
        {r ? <DetailsBody key={r.id} r={r} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailsBody({ r, onClose }: { r: Referral; onClose: () => void }) {
  const q = qualificationOf(r);
  const rw = r.rewardId ? REWARD_BY_ID[r.rewardId] : null;
  const timeline = [
    { label: "Invite shared", at: r.invitedAt },
    r.signedUpAt ? { label: "Signed up", at: r.signedUpAt } : null,
    r.qualifiedAt ? { label: "Qualified", at: r.qualifiedAt } : null,
    rw?.approvedAt ? { label: "Reward approved", at: rw.approvedAt } : null,
    rw?.creditedAt ? { label: "Reward credited (demo)", at: rw.creditedAt } : null,
    rw?.reversedAt ? { label: "Reward reversed", at: rw.reversedAt } : null,
  ].filter((e): e is { label: string; at: string } => Boolean(e));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-5 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground uppercase" aria-hidden>
            {r.invitee.slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-heading text-lg leading-tight font-bold break-all">{r.invitee}</SheetTitle>
            <SheetDescription className="mt-0.5 text-sm">
              {r.id} · invited by {r.via} · {formatDate(r.invitedAt)}
            </SheetDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close referral details"
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={r.status} />
          <DemoTag className="text-muted-foreground" />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5">
        <div className="rounded-2xl bg-muted/50 p-3.5 text-sm leading-relaxed">
          <p className="font-semibold">{REFERRAL_STATUS_META[r.status].label}</p>
          <p className="mt-0.5 text-muted-foreground">{r.reason ?? REFERRAL_STATUS_META[r.status].note}</p>
        </div>

        <section aria-labelledby="ref-progress">
          <h3 id="ref-progress" className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Qualification
          </h3>
          <ol className="mt-3 space-y-2.5">
            {q.steps.map((s, i) => (
              <li key={s.label} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full text-[0.7rem] font-bold",
                    s.done ? "bg-primary text-primary-foreground" : "border bg-card text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {s.done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn(s.done ? "font-medium" : "text-muted-foreground")}>
                  {s.label}
                  <span className="sr-only">{s.done ? ", done" : ", not yet"}</span>
                </span>
              </li>
            ))}
          </ol>
          {r.signedUpAt && !r.qualifiedAt && r.status !== "ineligible" ? (
            <div className="mt-4 rounded-2xl border p-3.5">
              <Progress r={r} />
              <p className="mt-2 text-xs text-muted-foreground">
                Completed orders so far. Qualifies at {money(P.qualifyingSpend)}
                {q.deadline ? ` by ${formatDate(q.deadline)}` : ""}.
              </p>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="ref-reward">
          <h3 id="ref-reward" className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Reward
          </h3>
          {rw ? (
            <div className="mt-2 rounded-2xl border p-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className={cn("font-heading text-lg font-extrabold tabular-nums", REWARD_STYLE[rw.status].amount)}>{money(rw.amount)}</span>
                <RewardBadge status={rw.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {rw.id} · {rw.reason ?? REWARD_STATUS_META[rw.status].note}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {r.status === "ineligible" ? "No reward for this referral." : `${money(P.reward.amount)} (example amount) once this referral qualifies and passes review.`}
            </p>
          )}
        </section>

        <section aria-labelledby="ref-timeline">
          <h3 id="ref-timeline" className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Timeline
          </h3>
          <ol className="mt-3 space-y-3 border-s ps-4">
            {timeline.map((e) => (
              <li key={e.label} className="relative text-sm">
                <span className="absolute top-1.5 -start-[1.3rem] size-2 rounded-full bg-primary/60 ring-4 ring-card" aria-hidden />
                <span className="font-medium">{e.label}</span>
                <span className="block text-xs text-muted-foreground">{formatDateTime(e.at)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="border-t bg-card px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] text-sm">
        <a
          href={`mailto:${P.supportEmail}?subject=${encodeURIComponent(`Referral ${r.id}`)}`}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border bg-card font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          <Mail className="size-4" aria-hidden /> Ask about this referral
        </a>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Rewards history                                                           */
/* -------------------------------------------------------------------------- */

type RewardFilter = "all" | RewardStatus;

function rewardTimes(r: Reward) {
  switch (r.status) {
    case "pending":
      return `Qualified ${formatDate(r.createdAt)} · Review ends ${formatDate(r.holdUntil)}`;
    case "approved":
      return `Qualified ${formatDate(r.createdAt)} · Approved ${formatDate(r.approvedAt!)}`;
    case "credited":
      return `Qualified ${formatDate(r.createdAt)} · Credited ${formatDate(r.creditedAt!)}`;
    case "reversed":
      return `Qualified ${formatDate(r.createdAt)} · Reversed ${formatDate(r.reversedAt!)}`;
  }
}

function RewardsHistory({ onOpen, className, style }: { onOpen: (id: string) => void; className?: string; style?: React.CSSProperties }) {
  const [filter, setFilter] = React.useState<RewardFilter>("all");
  const list = REWARDS.filter((r) => filter === "all" || r.status === filter).sort((a, b) => rewardDate(b).localeCompare(rewardDate(a)));
  const totals: { id: RewardStatus; value: number }[] = [
    { id: "pending", value: SUMMARY.pending },
    { id: "approved", value: SUMMARY.approved },
    { id: "credited", value: SUMMARY.credited },
    { id: "reversed", value: SUMMARY.reversed },
  ];

  return (
    <Panel className={cn("p-4 sm:p-5", className)} style={style} aria-labelledby="rewards-history-title">
      <PanelHeader id="rewards-history-title" title="Rewards history" description="Illustrative amounts. Never wallet balance." />

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Filter rewards">
        {totals.map((t) => {
          const on = filter === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(on ? "all" : t.id)}
              className={cn(
                "rounded-2xl border p-3 text-start transition-colors hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none",
                t.id === "pending" && "border-dashed",
                on && "border-primary bg-secondary/50 ring-1 ring-primary dark:bg-secondary/30",
              )}
            >
              <span className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                {REWARD_STATUS_META[t.id].label}
                <span className="tabular-nums">{SUMMARY.counts[t.id]}</span>
              </span>
              <span className={cn("mt-1 block font-heading text-lg font-extrabold tabular-nums", REWARD_STYLE[t.id].amount)}>{money(t.value)}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <p aria-live="polite">{filter === "all" ? `${list.length} entries` : REWARD_STATUS_META[filter].note}</p>
        {filter !== "all" ? (
          <button type="button" onClick={() => setFilter("all")} className="shrink-0 font-semibold text-primary hover:underline">
            Show all
          </button>
        ) : null}
      </div>

      {list.length ? (
        <ul className="mt-3 divide-y rounded-2xl border" aria-label="Rewards">
          {list.map((rw) => {
            const ref = REFERRAL_BY_ID[rw.referralId];
            const { Icon } = REWARD_STYLE[rw.status];
            return (
              <li key={rw.id} className="flex items-start gap-3 p-3.5">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", REWARD_STYLE[rw.status].className)} aria-hidden>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold">Referral reward</span>
                    <span className={cn("text-sm font-bold tabular-nums", REWARD_STYLE[rw.status].amount)}>
                      {money(rw.amount)}
                      <span className="sr-only">, {REWARD_STATUS_META[rw.status].label}, illustrative</span>
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {ref.invitee} qualified ·{" "}
                    <button
                      type="button"
                      onClick={() => onOpen(ref.id)}
                      className="font-semibold text-primary underline-offset-2 hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                    >
                      {ref.id}
                    </button>{" "}
                    · {rw.id}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{rewardTimes(rw)}</p>
                  {rw.reason ? <p className="mt-1 text-xs font-medium text-off">{rw.reason}</p> : null}
                </div>
                <RewardBadge status={rw.status} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No rewards here yet.</p>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/*  Program rules & FAQ                                                       */
/* -------------------------------------------------------------------------- */

function Rules({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const rules = [
    { term: "Who counts", detail: "New SociVanta customers only. Existing accounts and your own accounts don't qualify." },
    { term: "Qualifying", detail: `Their completed orders reach ${money(P.qualifyingSpend)} within ${P.qualifyingDays} days of signing up.` },
    { term: "Reward", detail: `${money(P.reward.amount)} per qualified referral. A flat example amount, not a commission or percentage.` },
    { term: "Review", detail: `Rewards are held for ${P.holdDays} days, then approved if the qualifying orders still stand.` },
    { term: "Limits", detail: P.monthlyCap ? `Up to ${P.monthlyCap} rewards a month.` : "No monthly limit is set in this preview." },
  ];
  const faqs = [
    {
      q: "When does a referral qualify?",
      a: `When your friend signs up as a new customer and their completed orders reach ${money(P.qualifyingSpend)} within ${P.qualifyingDays} days. Pending, cancelled and refunded orders don't count toward the total.`,
    },
    {
      q: "What's the difference between pending, approved and credited?",
      a: `Pending rewards are in the ${P.holdDays}-day review. Approved means the review passed. Credited means the reward was added to your rewards. In this preview, none of these are real money.`,
    },
    {
      q: "Can I spend my rewards?",
      a: `Not in this preview. Rewards are illustrative, aren't part of your ${money(DEMO_WALLET.balance)} demo wallet and can't be used for orders or withdrawn. How rewards can be used will be confirmed when the program launches.`,
    },
    {
      q: "What happens if an order is cancelled or refunded?",
      a: "If a qualifying order is cancelled or refunded, the referral may no longer qualify. A pending or approved reward is then reversed, and you'll see the reason in your history.",
    },
    {
      q: "Why is a referral ineligible?",
      a: "Common reasons: the person already had an account, they referred themselves, or their qualifying orders were refunded. Each ineligible referral shows its reason.",
    },
    {
      q: "Are these the final terms?",
      a: "No. Amounts, thresholds and timings shown here are example values. Final terms are published before the program launches and require backend verification.",
    },
  ];

  return (
    <Panel className={cn("p-4 sm:p-5", className)} style={style} aria-labelledby="rules-title">
      <PanelHeader
        id="rules-title"
        title="Program rules"
        description="Example terms. Final terms are confirmed at launch."
        action={<DemoTag className="mt-1 text-muted-foreground">Not final</DemoTag>}
      />
      <dl className="mt-4 divide-y rounded-2xl border">
        {rules.map((r) => (
          <div key={r.term} className="grid grid-cols-1 gap-0.5 p-3.5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-3">
            <dt className="text-sm font-semibold">{r.term}</dt>
            <dd className="text-sm text-muted-foreground">{r.detail}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-6 text-sm font-bold">Questions</h3>
      <Accordion className="mt-1">
        {faqs.map((f) => (
          <AccordionItem key={f.q} value={f.q}>
            <AccordionTrigger className="py-3 text-[0.9rem] font-semibold hover:no-underline">{f.q}</AccordionTrigger>
            <AccordionContent className="pb-3.5 leading-relaxed text-muted-foreground">
              <p>{f.a}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <div className="mt-4 flex items-start gap-3 rounded-2xl bg-muted/50 p-3.5 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p className="text-muted-foreground">
          Questions about a referral or reward? Email{" "}
          <a href={`mailto:${P.supportEmail}`} className="font-semibold text-primary underline-offset-2 hover:underline">
            {P.supportEmail}
          </a>{" "}
          with the referral ID.
        </p>
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function ReferralsRewards() {
  // Re-render when language, currency, time zone or date format change.
  useDisplay();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const a = [0, 1, 2, 3, 4, 5].map(enter);

  return (
    <div className="mx-auto max-w-[90rem] space-y-4 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-7 lg:px-8">
      <Hero className={a[0].className} style={a[0].style} />
      <Stats className={a[1].className} style={a[1].style} />
      <HowItWorks className={a[2].className} style={a[2].style} />
      <Activity onOpen={setOpenId} className={a[3].className} style={a[3].style} />
      <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 xl:grid-cols-2">
        <RewardsHistory onOpen={setOpenId} className={a[4].className} style={a[4].style} />
        <Rules className={a[5].className} style={a[5].style} />
      </div>
      <ReferralDetails id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
