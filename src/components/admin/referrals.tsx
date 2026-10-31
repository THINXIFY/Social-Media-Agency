"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  Ellipsis,
  Eye,
  EyeOff,
  FlaskConical,
  Lock,
  MessageSquarePlus,
  Minus,
  RotateCcw,
  Search,
  SearchX,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { ConfirmDialog, Switch } from "@/components/dashboard/account-ui";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { dateTime, shortDate } from "@/lib/admin-demo";
import { looksSensitive } from "@/lib/admin-orders";
import {
  ACTIVE_POLICY,
  addReferralNote,
  addReferrerNote,
  attributionCheck,
  type CheckState,
  checksOf,
  clearReferralNotes,
  describeReward,
  type Destination,
  discardProgramConfig,
  type Distribution,
  eventsOf,
  flagsOf,
  impactOf,
  maskCode,
  needsReview,
  nextStepOf,
  policyOf,
  type PolicyTerms,
  type ProgramConfig,
  type ProgramStatus,
  REFERRAL_BY_ID,
  REFERRAL_PROGRAM,
  REFERRAL_STATUS_META,
  REFERRALS,
  type Referral,
  type ReferralStatus,
  type Referrer,
  REFERRER_BY_ID,
  REFERRERS,
  referrerEvents,
  referrerOf,
  referrerStats,
  type RefNote,
  REWARD_STATUS_META,
  type RewardStatus,
  type RewardType,
  REWARDS,
  referralSummary,
  rewardOf,
  SAMPLE_REFERRER,
  saveProgramConfig,
  STAGE_META,
  stageOf,
  useReferralAdmin,
  waitingNote,
} from "@/lib/admin-referrals";
import { cn } from "@/lib/utils";
import { describe, Field, Segmented, SelectInput, TextArea, TextInput } from "./form";
import { menuItem, menuLabel, menuPopup, menuSeparator, popupSurface } from "./menu";
import { AdminDemoTag, linkButton } from "./ui";

/* -------------------------------------------------------------------------- */
/*  Filters (URL)                                                             */
/* -------------------------------------------------------------------------- */

type View = "referrers" | "referrals" | "settings";
type RewardFilter = "" | RewardStatus | "none";
type Sort = "newest" | "oldest" | "spend";
type RSort = "referrals" | "earned" | "name";
interface Filters {
  view: View;
  q: string;
  qual: "" | ReferralStatus;
  reward: RewardFilter;
  review: "" | "needs";
  sort: Sort;
  page: number;
  rq: string;
  rreview: "" | "needs";
  rsort: RSort;
}
const DEFAULTS: Filters = { view: "referrers", q: "", qual: "", reward: "", review: "", sort: "newest", page: 1, rq: "", rreview: "", rsort: "referrals" };
const PAGE_SIZE = 10;
const QUALS = Object.keys(REFERRAL_STATUS_META) as ReferralStatus[];
const REWARD_STATES = Object.keys(REWARD_STATUS_META) as RewardStatus[];
const SORT_LABEL: Record<Sort, string> = { newest: "Newest invites", oldest: "Oldest invites", spend: "Highest spend" };
const RSORT_LABEL: Record<RSort, string> = { referrals: "Most referrals", earned: "Most earned", name: "Name" };
const P = REFERRAL_PROGRAM;
const usd = (n: number) => `$${n.toFixed(2)}`;

function parseFilters(p: URLSearchParams): Filters {
  const pick = <T extends string>(k: string, allowed: readonly T[], d: T) => {
    const v = p.get(k) as T | null;
    return v && allowed.includes(v) ? v : d;
  };
  // Links made before the views existed carry referral filters but no view.
  const legacy = ["q", "qual", "reward", "review", "sort", "page"].some((k) => p.has(k));
  return {
    view: pick("view", ["referrers", "referrals", "settings"] as const, legacy ? "referrals" : "referrers"),
    q: (p.get("q") ?? "").slice(0, 80),
    qual: pick("qual", QUALS, "" as const),
    reward: pick("reward", [...REWARD_STATES, "none"] as RewardFilter[], ""),
    review: pick("review", ["needs"] as const, ""),
    sort: pick("sort", ["newest", "oldest", "spend"] as const, "newest"),
    page: Math.max(1, Number(p.get("page")) || 1),
    rq: (p.get("rq") ?? "").slice(0, 80),
    rreview: pick("rreview", ["needs"] as const, ""),
    rsort: pick("rsort", ["referrals", "earned", "name"] as const, "referrals"),
  };
}

function toQuery(f: Filters, open: { referral?: string | null; referrer?: string | null } = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== DEFAULTS[k as keyof Filters]) q.set(k, String(v));
  if (open.referrer) q.set("referrer", open.referrer);
  if (open.referral) q.set("referral", open.referral);
  return q.toString();
}

const QUAL_DOT: Record<ReferralStatus, string> = { invited: "bg-off", signed_up: "bg-primary/50", pending: "bg-primary", qualified: "bg-ok", rewarded: "bg-ok", ineligible: "bg-off" };

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function AdminReferrals() {
  const params = useSearchParams();
  const pathname = usePathname();
  const admin = useReferralAdmin();

  const [f, setF] = React.useState<Filters>(() => parseFilters(params));
  const refParam = params.get("referral");
  const openId = refParam && REFERRAL_BY_ID[refParam] ? refParam : null;
  const rParam = params.get("referrer");
  const openReferrerId = !openId && rParam && REFERRER_BY_ID[rParam] ? rParam : null;
  const pushed = React.useRef(false);
  const written = React.useRef(toQuery(f));
  const [revealed, setRevealed] = React.useState(false);
  const [settingsNotice, setSettingsNotice] = React.useState<string | null>(null);

  const urlKey = toQuery(parseFilters(params));
  React.useEffect(() => {
    if (urlKey !== written.current) {
      written.current = urlKey;
      setF(parseFilters(new URLSearchParams(urlKey)));
    }
  }, [urlKey]);

  React.useEffect(() => {
    if (pathname !== "/admin/referrals") return;
    written.current = toQuery(f);
    const cur = new URLSearchParams(location.search);
    const qs = toQuery(f, { referral: cur.get("referral"), referrer: cur.get("referrer") });
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (`${location.pathname}${location.search}` !== url) window.history.replaceState(null, "", url);
  }, [f, pathname]);

  const push = (open: { referral?: string; referrer?: string }) => {
    window.history.pushState(null, "", `${pathname}?${toQuery(f, open)}`);
    pushed.current = true;
  };
  const openReferral = (id: string) => push({ referral: id });
  const openReferrer = (id: string) => push({ referrer: id });
  const close = () => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      const qs = toQuery(f);
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    }
  };
  const update = (patch: Partial<Filters>) => setF((cur) => ({ ...cur, ...patch, page: patch.page ?? 1 }));
  /** From a drawer to a filtered list: close it without leaving a history entry behind. */
  const goTo = (patch: Partial<Filters>) => {
    pushed.current = false;
    const next = { ...f, ...patch, page: 1 };
    window.history.replaceState(null, "", `${pathname}?${toQuery(next)}`);
    setF(next);
  };

  const s = referralSummary();
  const review = REFERRALS.filter(needsReview);
  const attribution = attributionCheck();
  const tiles: { key: string; label: string; value: string; note: string; patch: Partial<Filters>; on: boolean; tone?: "attention" }[] = [
    { key: "total", label: "Total referrals", value: String(s.invites), note: `${s.signups} signed up`, patch: { view: "referrals", qual: "", reward: "", review: "" }, on: f.view === "referrals" && !f.qual && !f.reward && !f.review },
    { key: "qualified", label: "Qualified", value: String(s.qualified), note: "Qualified or rewarded", patch: { view: "referrals", qual: "qualified", reward: "", review: "" }, on: f.view === "referrals" && f.qual === "qualified" },
    {
      key: "pending",
      label: "Pending rewards",
      value: usd(s.pending),
      note: `${s.counts.pending} in holding period`,
      patch: { view: "referrals", reward: "pending", qual: "", review: "" },
      on: f.view === "referrals" && f.reward === "pending",
      tone: s.counts.pending ? "attention" : undefined,
    },
    { key: "earned", label: "Rewards earned", value: usd(s.earned), note: "Approved + credited · not wallet", patch: { view: "referrals", reward: "credited", qual: "", review: "" }, on: f.view === "referrals" && f.reward === "credited" },
  ];

  const noteCount = [...Object.values(admin.notes), ...Object.values(admin.referrerNotes)].reduce((n, l) => n + l.length, 0);
  const [clearAsk, setClearAsk] = React.useState(false);
  const current = openId ? REFERRAL_BY_ID[openId] : null;
  const currentReferrer = openReferrerId ? REFERRER_BY_ID[openReferrerId] : null;
  const tabs: { id: View; label: string; count?: number; badge?: string }[] = [
    { id: "referrers", label: "Referrers", count: REFERRERS.length },
    { id: "referrals", label: "All referrals", count: REFERRALS.length },
    { id: "settings", label: "Program settings", badge: admin.config ? "Draft" : undefined },
  ];

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[0.8rem] font-medium text-muted-foreground">
            Growth <AdminDemoTag>Admin demo</AdminDemoTag>
          </p>
          <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Referrals &amp; Rewards</h1>
          <p className="mt-1 max-w-xl text-[0.95rem] text-muted-foreground">Track referrals, review reward eligibility and monitor program performance.</p>
        </div>
        {noteCount ? (
          <button type="button" onClick={() => setClearAsk(true)} className={cn(linkButton, "text-muted-foreground hover:text-foreground")}>
            <Trash2 className="size-3.5" aria-hidden /> Clear demo notes ({noteCount})
          </button>
        ) : null}
      </header>

      {/* Where the data comes from — said once, plainly */}
      <p className="mt-5 flex items-start gap-2.5 rounded-xl border border-dashed bg-muted/30 px-4 py-3 text-[0.82rem] text-muted-foreground">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>
          <span className="font-semibold text-foreground">Illustrative sample.</span> All {REFERRALS.length} referrals come from the customer dashboard&apos;s demo account ({SAMPLE_REFERRER.name} ·{" "}
          <span className="font-mono text-[0.78rem]">{SAMPLE_REFERRER.accountId}</span>), which isn&apos;t one of the admin customers. Referred people are masked and aren&apos;t linked to customer, order or
          payment records. The program is in preview.
        </span>
      </p>

      {/* Compact summary — per referral; referrer totals live in the Referrers view */}
      <section aria-label="Referral summary" className="@container mt-4">
        <div role="group" aria-label="Filter by summary" className="grid grid-cols-2 gap-2.5 @3xl:grid-cols-4 @3xl:gap-3">
          {tiles.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={t.on}
              onClick={() => update(t.patch)}
              className={cn(
                "flex min-w-0 flex-col items-start rounded-2xl border bg-card px-4 py-3.5 text-start transition-colors hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none @xl:px-5",
                t.tone && "border-soon/35 bg-soon-soft/25 hover:border-soon/60 dark:bg-soon-soft/10",
                t.on && "border-primary/50 ring-1 ring-primary/30",
              )}
            >
              <span className={cn("flex items-center gap-1.5 text-[0.78rem] font-medium whitespace-nowrap", t.tone ? "text-soon" : "text-muted-foreground")}>
                {t.tone ? <span className="size-1.5 rounded-full bg-soon" aria-hidden /> : null}
                {t.label}
              </span>
              <span className={cn("mt-1 font-heading text-[1.5rem] leading-tight font-extrabold tracking-[-0.015em] tabular-nums @xl:text-[1.65rem]", t.tone && "text-soon")}>{t.value}</span>
              <span className="text-[0.78rem] leading-snug text-muted-foreground">{t.note}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Eligibility review: neutral, record-based */}
      <section aria-labelledby="ref-review-title" className="mt-5 overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
          <div>
            <h2 id="ref-review-title" className="text-[0.95rem] font-bold">
              Needs review <span className="text-muted-foreground tabular-nums">· {review.length}</span>
            </h2>
            <p className="text-xs text-muted-foreground">Rewards on hold or awaiting credit, with no linked transaction evidence yet.</p>
          </div>
          {review.length ? (
            <button type="button" onClick={() => update({ view: "referrals", review: "needs", qual: "", reward: "" })} className={linkButton}>
              Show in list <ArrowRight className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
        {review.length ? (
          <ul className="divide-y border-t">
            {review.map((r) => {
              const flags = flagsOf(r).filter((x) => x.action);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-5">
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="flex items-baseline gap-2 text-sm">
                      <span className="font-mono text-[0.8rem] font-semibold">{r.id}</span>
                      <span className="truncate text-muted-foreground">{r.invitee}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-soon">{flags.map((x) => x.label).join(" · ")}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => openReferral(r.id)}
                    aria-label={`Review ${r.id}`}
                    className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-primary px-4 text-[0.82rem] font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none"
                  >
                    Review <ChevronRight className="size-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="border-t px-5 py-3 text-sm text-muted-foreground">Nothing needs review.</p>
        )}
        <p className="flex items-start gap-2 border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground sm:px-5">
          <ShieldCheck className={cn("mt-px size-3.5 shrink-0", attribution.ok ? "text-ok" : "text-destructive")} aria-hidden />
          <span>
            Attribution check: {attribution.referrals} referrals → {attribution.accounts} distinct referred accounts, each with one referrer · {attribution.rewards} rewards, at most one per referral.{" "}
            {attribution.ok ? "No duplicates." : `${attribution.duplicateAccounts.length + attribution.duplicateRewards.length} potential duplicates.`} Based on masked emails; duplicate and self-referral checks
            need linked customer records.
          </span>
        </p>
      </section>

      {/* Views */}
      <div role="tablist" aria-label="Referral views" className="mt-6 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={f.view === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => update({ view: t.id })}
            className={cn(
              "relative inline-flex h-11 shrink-0 items-center gap-1.5 px-3 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
              f.view === t.id && "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary",
            )}
          >
            {t.label}
            {t.count !== undefined ? <span className="text-xs font-medium text-muted-foreground tabular-nums">{t.count}</span> : null}
            {t.badge ? <span className="rounded-full bg-secondary px-1.5 py-px text-[0.62rem] font-bold text-secondary-foreground">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${f.view}`} aria-labelledby={`tab-${f.view}`} className="mt-4">
        {f.view === "referrers" ? (
          <ReferrersView f={f} update={update} revealed={revealed} onReveal={() => setRevealed((v) => !v)} onOpen={openReferrer} />
        ) : f.view === "referrals" ? (
          <ReferralsView f={f} update={update} openId={openId} onOpen={openReferral} />
        ) : (
          // Rebuilt when a saved draft appears or goes away, e.g. once browser storage has been read.
          <ProgramSettings key={admin.config ? "draft" : "active"} config={admin.config} notice={settingsNotice} setNotice={setSettingsNotice} />
        )}
      </div>

      <ReferralDrawer referral={current} notes={openId ? admin.notes[openId] ?? [] : []} onClose={close} onOpenReferrer={openReferrer} />
      <ReferrerDrawer
        referrer={currentReferrer}
        notes={openReferrerId ? admin.referrerNotes[openReferrerId] ?? [] : []}
        revealed={revealed}
        onReveal={() => setRevealed((v) => !v)}
        onClose={close}
        onOpenReferral={openReferral}
        onReviewAll={() => goTo({ view: "referrals", review: "needs", qual: "", reward: "", q: "" })}
      />

      <ConfirmDialog
        open={clearAsk}
        onOpenChange={setClearAsk}
        title="Clear demo notes?"
        description="Removes every internal referral and referrer note added in this browser. Referrals don't change."
        confirmLabel="Clear notes"
        tone="danger"
        icon={Trash2}
        onConfirm={clearReferralNotes}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared bits                                                               */
/* -------------------------------------------------------------------------- */

function SearchBox({ id, value, onChange, placeholder, label }: { id: string; value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div className="relative flex-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="h-11 w-full rounded-xl border bg-background ps-9 pe-9 text-[0.95rem] transition-colors outline-none hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 lg:h-10 lg:text-sm dark:bg-muted/30 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button type="button" onClick={() => onChange("")} aria-label="Clear search" className="absolute end-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted">
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function Chips({ chips, onClear, onClearAll, showClearAll, count }: { chips: { key: string; label: string; clear: Partial<Filters> }[]; onClear: (p: Partial<Filters>) => void; onClearAll: () => void; showClearAll: boolean; count: React.ReactNode }) {
  return (
    <div className="flex min-h-7 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <p aria-live="polite" className="me-1.5 font-medium">
        {count}
      </p>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onClear(c.clear)}
          aria-label={`Remove filter: ${c.label}`}
          className="inline-flex h-7 items-center gap-1 rounded-full border bg-card ps-2.5 pe-1.5 font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
        >
          {c.label}
          <X className="size-3.5 opacity-60" aria-hidden />
        </button>
      ))}
      {showClearAll ? (
        <button type="button" onClick={onClearAll} className="ms-0.5 font-semibold text-primary hover:underline">
          Clear all
        </button>
      ) : null}
    </div>
  );
}

function CodeCell({ code, revealed, onReveal }: { code: string; revealed: boolean; onReveal: () => void }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-[0.8rem] font-semibold tracking-wide">{revealed ? code : maskCode(code)}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onReveal();
        }}
        aria-pressed={revealed}
        aria-label={revealed ? "Hide referral code" : "Reveal referral code"}
        title={revealed ? "Hide code" : "Reveal code"}
        className="relative z-10 grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
      >
        {revealed ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
      </button>
    </span>
  );
}

function SampleTag() {
  return <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-dashed px-1.5 text-[0.62rem] font-bold tracking-wide text-muted-foreground uppercase">Demo account</span>;
}

function QualText({ r }: { r: Referral }) {
  const pct = Math.min(100, Math.round((r.spend / P.qualifyingSpend) * 100));
  return (
    <span className="block min-w-0">
      <span className={cn("inline-flex items-center gap-2 text-[0.85rem] font-medium whitespace-nowrap", (r.status === "invited" || r.status === "ineligible") && "text-muted-foreground")}>
        <span className={cn("size-2 shrink-0 rounded-full", QUAL_DOT[r.status])} aria-hidden />
        {REFERRAL_STATUS_META[r.status].label}
      </span>
      <span className="block text-xs text-muted-foreground tabular-nums">
        {usd(r.spend)} of {usd(P.qualifyingSpend)}
        {r.status === "pending" ? ` · ${pct}%` : ""}
      </span>
    </span>
  );
}

function RewardText({ r }: { r: Referral }) {
  const reward = rewardOf(r);
  const stage = stageOf(r);
  if (!reward) return <span className="block text-[0.85rem] text-muted-foreground">No reward</span>;
  return (
    <span className="block min-w-0">
      <span className="block text-[0.85rem] font-semibold tabular-nums">{usd(reward.amount)}</span>
      <span className={cn("block text-xs font-medium", STAGE_META[stage].tone)}>{STAGE_META[stage].label}</span>
    </span>
  );
}

function FlagText({ r, hideEmpty }: { r: Referral; hideEmpty?: boolean }) {
  const flags = flagsOf(r);
  if (!flags.length) return hideEmpty ? null : <span className="text-muted-foreground/60">—</span>;
  const main = flags.find((x) => x.action) ?? flags[0];
  return (
    <span className={cn("mt-1.5 flex items-start gap-1.5 text-xs xl:mt-0", main.action ? "font-medium text-soon" : "text-muted-foreground")}>
      <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        {main.label}
        {flags.length > 1 ? <span className="font-normal text-muted-foreground"> · +{flags.length - 1}</span> : null}
      </span>
    </span>
  );
}

function RowAction({ label, primary, onOpen, stretch }: { label: string; primary: boolean; onOpen: () => void; stretch?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label={label}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-0.5 rounded-full px-3.5 text-[0.82rem] font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none",
        primary ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-primary hover:bg-secondary",
        stretch && "after:absolute after:inset-0 after:content-['']",
      )}
    >
      {label.split(" ")[0]} <ChevronRight className="size-4" aria-hidden />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Referrers view                                                            */
/* -------------------------------------------------------------------------- */

function ReferrersView({ f, update, revealed, onReveal, onOpen }: { f: Filters; update: (p: Partial<Filters>) => void; revealed: boolean; onReveal: () => void; onOpen: (id: string) => void }) {
  const terms = f.rq.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rows = REFERRERS.map((x) => ({ x, s: referrerStats(x) }))
    .filter(({ x, s }) => (!f.rreview || s.toReview > 0) && terms.every((t) => [x.name, x.email, x.id].join(" ").toLowerCase().includes(t)))
    .sort((a, b) => (f.rsort === "name" ? a.x.name.localeCompare(b.x.name) : f.rsort === "earned" ? b.s.earned - a.s.earned : b.s.invited - a.s.invited));
  const chips: { key: string; label: string; clear: Partial<Filters> }[] = [];
  if (f.rreview) chips.push({ key: "rreview", label: "Has referrals to review", clear: { rreview: "" } });
  if (f.rsort !== DEFAULTS.rsort) chips.push({ key: "rsort", label: `Sort: ${RSORT_LABEL[f.rsort]}`, clear: { rsort: DEFAULTS.rsort } });

  return (
    <section aria-labelledby="referrers-title" className="overflow-hidden rounded-2xl border bg-card">
      <h2 id="referrers-title" className="sr-only">
        Referrers
      </h2>
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <SearchBox id="rr-search" label="Search referrers" value={f.rq} onChange={(v) => update({ rq: v })} placeholder="Name, email or account ID" />
          <div className="grid grid-cols-2 gap-2 lg:flex">
            <div className="min-w-0 lg:w-52">
              <label htmlFor="rr-review" className="sr-only">
                Review
              </label>
              <SelectInput id="rr-review" value={f.rreview} onChange={(e) => update({ rreview: e.target.value as Filters["rreview"] })} className={cn("h-11 lg:h-10", f.rreview && "border-primary/50 bg-secondary/40 dark:bg-secondary/20")}>
                <option value="">All referrers</option>
                <option value="needs">Has referrals to review</option>
              </SelectInput>
            </div>
            <div className="min-w-0 lg:w-44">
              <label htmlFor="rr-sort" className="sr-only">
                Sort referrers
              </label>
              <SelectInput id="rr-sort" value={f.rsort} onChange={(e) => update({ rsort: e.target.value as RSort })} className="h-11 lg:h-10">
                {(Object.keys(RSORT_LABEL) as RSort[]).map((k) => (
                  <option key={k} value={k}>
                    {RSORT_LABEL[k]}
                  </option>
                ))}
              </SelectInput>
            </div>
          </div>
        </div>
        <Chips
          chips={chips}
          onClear={update}
          onClearAll={() => update({ rq: "", rreview: "", rsort: DEFAULTS.rsort })}
          showClearAll={Boolean(chips.length || f.rq)}
          count={`${rows.length} referrer${rows.length === 1 ? "" : "s"} · each referred account belongs to one referrer`}
        />
      </div>

      {rows.length ? (
        <>
          <div className="hidden xl:block">
            <table className="w-full table-fixed text-sm">
              <caption className="sr-only">Referrers</caption>
              <thead className="border-y bg-muted/40 text-[0.68rem] tracking-wider text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="py-2.5 ps-5 text-start font-bold">Referrer</th>
                  <th scope="col" className="w-36 px-3 py-2.5 text-start font-bold">Code</th>
                  <th scope="col" className="w-60 px-3 py-2.5 text-start font-bold">Referrals</th>
                  <th scope="col" className="w-56 px-3 py-2.5 text-start font-bold">Rewards</th>
                  <th scope="col" className="w-36 px-3 py-2.5 text-start font-bold">Review</th>
                  <th scope="col" className="w-24 py-2.5 pe-5 text-end font-bold">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(({ x, s }) => (
                  <tr key={x.id} onClick={() => onOpen(x.id)} className="group/row cursor-pointer transition-colors hover:bg-muted/40">
                    <td className="py-3 ps-5">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold group-hover/row:text-primary">{x.name}</span>
                        {x.sample ? <SampleTag /> : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {x.email} · <span className="font-mono">{x.id}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <CodeCell code={x.code} revealed={revealed} onReveal={onReveal} />
                    </td>
                    <td className="px-3 py-3">
                      <Funnel s={s} />
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      <span className="block font-semibold">{usd(s.earned)} earned</span>
                      <span className="block text-xs text-muted-foreground">
                        {usd(s.pending)} pending · {usd(s.credited)} credited
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {s.toReview ? <span className="text-xs font-medium text-soon">{s.toReview} to review</span> : <span className="text-muted-foreground/60">—</span>}
                    </td>
                    <td className="py-3 pe-5 text-end">
                      <RowAction label={`View ${x.name}`} primary={false} onOpen={() => onOpen(x.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y border-t xl:hidden" aria-label="Referrers">
            {rows.map(({ x, s }) => (
              <li key={x.id} className="relative px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 text-[0.95rem] font-semibold">
                      {x.name} {x.sample ? <SampleTag /> : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {x.email} · <span className="font-mono">{x.id}</span>
                    </p>
                    <div className="mt-1">
                      <CodeCell code={x.code} revealed={revealed} onReveal={onReveal} />
                    </div>
                  </div>
                  <RowAction label={`View ${x.name}`} primary={false} onOpen={() => onOpen(x.id)} stretch />
                </div>
                <div className="mt-2.5 grid grid-cols-1 gap-2 rounded-xl bg-muted/40 px-3 py-2.5 sm:grid-cols-2">
                  <Funnel s={s} />
                  <span className="block text-sm tabular-nums">
                    <span className="block font-semibold">{usd(s.earned)} earned</span>
                    <span className="block text-xs text-muted-foreground">
                      {usd(s.pending)} pending · {usd(s.credited)} credited
                    </span>
                  </span>
                </div>
                {s.toReview ? <p className="mt-2 text-xs font-medium text-soon">{s.toReview} referrals to review</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState text="No referrers match" hint="Search works on name, email and account ID." onClear={() => update({ rq: "", rreview: "" })} />
      )}
    </section>
  );
}

function Funnel({ s }: { s: ReturnType<typeof referrerStats> }) {
  const steps = [
    { label: "invited", n: s.invited },
    { label: "signed up", n: s.signedUp },
    { label: "qualified", n: s.qualified },
    { label: "rewarded", n: s.rewarded },
  ];
  return (
    <span className="block text-sm tabular-nums">
      <span className="block font-semibold">{s.invited} invited</span>
      <span className="block text-xs text-muted-foreground">{steps.slice(1).map((x) => `${x.n} ${x.label}`).join(" · ")}</span>
    </span>
  );
}

function EmptyState({ text, hint, onClear }: { text: string; hint: string; onClear: () => void }) {
  return (
    <div className="border-t px-6 py-14 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <SearchX className="size-6" aria-hidden />
      </span>
      <p className="mt-4 font-semibold">{text}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>
      <button type="button" onClick={onClear} className={cn(linkButton, "mt-3 border bg-card")}>
        Clear all
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  All referrals view                                                        */
/* -------------------------------------------------------------------------- */

function ReferralsView({ f, update, openId, onOpen }: { f: Filters; update: (p: Partial<Filters>) => void; openId: string | null; onOpen: (id: string) => void }) {
  const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = REFERRALS.filter((r) => {
    const reward = rewardOf(r);
    if (f.qual && r.status !== f.qual) return false;
    if (f.reward === "none" ? reward : f.reward && reward?.status !== f.reward) return false;
    if (f.review === "needs" && !needsReview(r)) return false;
    if (!terms.length) return true;
    const ref = referrerOf(r);
    const hay = [r.id, r.invitee, r.rewardId ?? "", ref.name, ref.email, ref.id].join(" ").toLowerCase();
    return terms.every((t) => hay.includes(t));
  }).sort((a, b) => (f.sort === "oldest" ? a.invitedAt.localeCompare(b.invitedAt) : f.sort === "spend" ? b.spend - a.spend : b.invitedAt.localeCompare(a.invitedAt)));
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const rows = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const chips: { key: string; label: string; clear: Partial<Filters> }[] = [];
  if (f.qual) chips.push({ key: "qual", label: REFERRAL_STATUS_META[f.qual].label, clear: { qual: "" } });
  if (f.reward) chips.push({ key: "reward", label: f.reward === "none" ? "No reward" : `Reward: ${REWARD_STATUS_META[f.reward].label}`, clear: { reward: "" } });
  if (f.review) chips.push({ key: "review", label: "Needs review", clear: { review: "" } });
  if (f.sort !== DEFAULTS.sort) chips.push({ key: "sort", label: `Sort: ${SORT_LABEL[f.sort]}`, clear: { sort: DEFAULTS.sort } });

  return (
    <section aria-labelledby="ref-list-title" className="overflow-hidden rounded-2xl border bg-card">
      <h2 id="ref-list-title" className="sr-only">
        Referral directory
      </h2>
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <SearchBox id="ref-search" label="Search referrals" value={f.q} onChange={(v) => update({ q: v })} placeholder="Referral ID, email or referrer" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
            <div className="min-w-0 lg:w-48">
              <label htmlFor="ref-qual" className="sr-only">
                Qualification
              </label>
              <SelectInput id="ref-qual" value={f.qual} onChange={(e) => update({ qual: e.target.value as Filters["qual"] })} className={cn("h-11 lg:h-10", f.qual && "border-primary/50 bg-secondary/40 dark:bg-secondary/20")}>
                <option value="">Any qualification</option>
                {QUALS.map((q) => (
                  <option key={q} value={q}>
                    {REFERRAL_STATUS_META[q].label}
                  </option>
                ))}
              </SelectInput>
            </div>
            <div className="min-w-0 lg:w-44">
              <label htmlFor="ref-reward" className="sr-only">
                Reward
              </label>
              <SelectInput id="ref-reward" value={f.reward} onChange={(e) => update({ reward: e.target.value as RewardFilter })} className={cn("h-11 lg:h-10", f.reward && "border-primary/50 bg-secondary/40 dark:bg-secondary/20")}>
                <option value="">Any reward</option>
                {REWARD_STATES.map((r) => (
                  <option key={r} value={r}>
                    {REWARD_STATUS_META[r].label}
                  </option>
                ))}
                <option value="none">No reward</option>
              </SelectInput>
            </div>
            <MoreFilters f={f} update={update} />
          </div>
        </div>
        <Chips
          chips={chips}
          onClear={update}
          onClearAll={() => update({ q: "", qual: "", reward: "", review: "", sort: DEFAULTS.sort })}
          showClearAll={Boolean(chips.length || f.q)}
          count={`${matches.length} referral${matches.length === 1 ? "" : "s"}${matches.length > PAGE_SIZE ? ` · page ${page} of ${pages}` : ""}`}
        />
      </div>

      {rows.length ? (
        <>
          <div className="hidden xl:block">
            <table className="w-full table-fixed text-sm">
              <caption className="sr-only">Referrals</caption>
              <thead className="border-y bg-muted/40 text-[0.68rem] tracking-wider text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="w-36 py-2.5 ps-5 text-start font-bold">Referral</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-bold">Referred · Referrer</th>
                  <th scope="col" className="w-52 px-3 py-2.5 text-start font-bold">Qualification</th>
                  <th scope="col" className="w-40 px-3 py-2.5 text-start font-bold">Reward</th>
                  <th scope="col" className="w-52 px-3 py-2.5 text-start font-bold">Review</th>
                  <th scope="col" className="w-24 py-2.5 pe-5 text-end font-bold">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => onOpen(r.id)} className={cn("group/row cursor-pointer transition-colors hover:bg-muted/40", openId === r.id && "bg-secondary/30 hover:bg-secondary/40")}>
                    <td className="py-3 ps-5">
                      <span className="block font-mono text-[0.8rem] font-semibold">{r.id}</span>
                      <span className="block text-xs text-muted-foreground">Invited {shortDate(r.invitedAt)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="block truncate font-medium group-hover/row:text-primary">{r.invitee}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        by {referrerOf(r).name} · via {r.via}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <QualText r={r} />
                    </td>
                    <td className="px-3 py-3">
                      <RewardText r={r} />
                    </td>
                    <td className="px-3 py-3">
                      <FlagText r={r} />
                    </td>
                    <td className="py-3 pe-5 text-end">
                      <RowAction label={`${needsReview(r) ? "Review" : "View"} ${r.id}`} primary={needsReview(r)} onOpen={() => onOpen(r.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y border-t xl:hidden" aria-label="Referrals">
            {rows.map((r) => (
              <li key={r.id} className={cn("relative px-4 py-3.5 transition-colors hover:bg-muted/40 sm:px-5", openId === r.id && "bg-secondary/30")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[0.92rem] font-semibold">{r.invitee}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{r.id}</span> · by {referrerOf(r).name} · {shortDate(r.invitedAt)}
                    </p>
                  </div>
                  <RowAction label={`${needsReview(r) ? "Review" : "View"} ${r.id}`} primary={needsReview(r)} onOpen={() => onOpen(r.id)} stretch />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <QualText r={r} />
                  <RewardText r={r} />
                </div>
                <FlagText r={r} hideEmpty />
              </li>
            ))}
          </ul>

          {pages > 1 ? (
            <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm sm:px-5">
              <p className="text-xs text-muted-foreground tabular-nums">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, matches.length)} of {matches.length}
              </p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => update({ page: page - 1 })} disabled={page === 1} aria-label="Previous page" className="grid size-9 place-items-center rounded-full border bg-card transition-colors hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:opacity-40">
                  <ChevronRight className="size-4 rotate-180" aria-hidden />
                </button>
                <span className="px-2 text-xs font-semibold tabular-nums" aria-current="page">
                  {page} / {pages}
                </span>
                <button type="button" onClick={() => update({ page: page + 1 })} disabled={page === pages} aria-label="Next page" className="grid size-9 place-items-center rounded-full border bg-card transition-colors hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:opacity-40">
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
            </nav>
          ) : null}
        </>
      ) : (
        <EmptyState text="No referrals match" hint="Search works on referral ID, the masked email and the referrer." onClear={() => update({ q: "", qual: "", reward: "", review: "" })} />
      )}
    </section>
  );
}

function MoreFilters({ f, update }: { f: Filters; update: (patch: Partial<Filters>) => void }) {
  const count = [f.review, f.sort !== DEFAULTS.sort ? "sort" : ""].filter(Boolean).length;
  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          "col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl border bg-background px-3.5 text-sm font-semibold whitespace-nowrap transition-colors hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-primary/15 focus-visible:outline-none data-popup-open:border-primary/50 sm:col-span-1 lg:h-10 dark:bg-muted/30",
          count && "border-primary/50 bg-secondary/40 dark:bg-secondary/20",
        )}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        More filters
        {count ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.68rem] font-bold text-primary-foreground tabular-nums">{count}</span> : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <Popover.Popup className={cn(popupSurface, "w-[min(20rem,calc(100vw-1.5rem))] space-y-3 p-4")}>
            <Popover.Title className="text-sm font-bold">More filters</Popover.Title>
            <div className="space-y-1.5">
              <label htmlFor="ref-review" className="text-xs font-semibold text-muted-foreground">
                Review
              </label>
              <SelectInput id="ref-review" value={f.review} onChange={(e) => update({ review: e.target.value as Filters["review"] })}>
                <option value="">All referrals</option>
                <option value="needs">Needs review</option>
              </SelectInput>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ref-sort" className="text-xs font-semibold text-muted-foreground">
                Sort by
              </label>
              <SelectInput id="ref-sort" value={f.sort} onChange={(e) => update({ sort: e.target.value as Sort })}>
                {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABEL[s]}
                  </option>
                ))}
              </SelectInput>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* -------------------------------------------------------------------------- */
/*  Program settings                                                          */
/* -------------------------------------------------------------------------- */

type Form = {
  rewardType: RewardType;
  fixedAmount: string;
  percentRate: string;
  percentCap: string;
  minSpend: string;
  qualifyingDays: string;
  holdDays: string;
  minOrders: string;
  countRefunded: boolean;
  maxPerReferrer: string;
  destination: Destination;
  distribution: Distribution;
  status: ProgramStatus;
};

const ACTIVE_STATUS: ProgramStatus = "paused";
const STATUS_LABEL: Record<ProgramStatus, string> = { enabled: "Enabled", paused: "Paused", disabled: "Disabled" };

function toForm(c: (PolicyTerms & { status?: ProgramStatus }) | null): Form {
  const t = c ?? ACTIVE_POLICY;
  const str = (n: number | null) => (n === null ? "" : String(n));
  return {
    rewardType: t.rewardType,
    fixedAmount: str(t.fixedAmount),
    percentRate: str(t.percentRate),
    percentCap: str(t.percentCap),
    minSpend: str(t.minSpend),
    qualifyingDays: str(t.qualifyingDays),
    holdDays: str(t.holdDays),
    minOrders: str(t.minOrders),
    countRefunded: t.countRefunded,
    maxPerReferrer: str(t.maxPerReferrer),
    destination: t.destination,
    distribution: t.distribution,
    status: c?.status ?? ACTIVE_STATUS,
  };
}

type FieldKey = "fixedAmount" | "percentRate" | "percentCap" | "minSpend" | "qualifyingDays" | "holdDays" | "minOrders" | "maxPerReferrer";
const NUM: Record<FieldKey, { min: number; max: number; decimals?: boolean; optional?: boolean }> = {
  fixedAmount: { min: 0.01, max: 1000, decimals: true },
  percentRate: { min: 0.01, max: 100, decimals: true },
  percentCap: { min: 0.01, max: 1000, decimals: true, optional: true },
  minSpend: { min: 0, max: 10000, decimals: true },
  qualifyingDays: { min: 1, max: 365 },
  holdDays: { min: 0, max: 90 },
  minOrders: { min: 1, max: 100 },
  maxPerReferrer: { min: 1, max: 1000, optional: true },
};

function errorsOf(form: Form): Partial<Record<FieldKey, string>> {
  const e: Partial<Record<FieldKey, string>> = {};
  const skip = (k: FieldKey) => (form.rewardType === "fixed" ? k === "percentRate" || k === "percentCap" : k === "fixedAmount");
  for (const k of Object.keys(NUM) as FieldKey[]) {
    if (skip(k)) continue;
    const spec = NUM[k];
    const raw = form[k].trim();
    if (!raw) {
      if (!spec.optional) e[k] = "Enter a value.";
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) e[k] = "Enter a number.";
    else if (!spec.decimals && !Number.isInteger(n)) e[k] = "Use a whole number.";
    else if (spec.decimals && Math.abs(Math.round(n * 100) - n * 100) > 1e-9) e[k] = "Use at most 2 decimals.";
    else if (n < spec.min || n > spec.max) e[k] = `Between ${spec.min} and ${spec.max}.`;
  }
  return e;
}

function termsOf(form: Form): PolicyTerms {
  const n = (s: string) => (s.trim() ? Number(s) : null);
  return {
    rewardType: form.rewardType,
    fixedAmount: n(form.fixedAmount) ?? 0,
    percentRate: form.rewardType === "percent" ? n(form.percentRate) : null,
    percentCap: form.rewardType === "percent" ? n(form.percentCap) : null,
    minSpend: n(form.minSpend) ?? 0,
    qualifyingDays: n(form.qualifyingDays) ?? 0,
    holdDays: n(form.holdDays) ?? 0,
    minOrders: n(form.minOrders) ?? 1,
    countRefunded: form.countRefunded,
    maxPerReferrer: n(form.maxPerReferrer),
    destination: form.destination,
    distribution: form.distribution,
  };
}

function ProgramSettings({ config, notice, setNotice }: { config: ProgramConfig | null; notice: string | null; setNotice: (v: string | null) => void }) {
  const [form, setForm] = React.useState<Form>(() => toForm(config));
  const [tried, setTried] = React.useState(false);
  const [discardAsk, setDiscardAsk] = React.useState(false);
  const saved = toForm(config);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const errs = errorsOf(form);
  const shown = tried ? errs : {};
  const valid = !Object.keys(errs).length;
  const terms = valid ? termsOf(form) : null;
  const set = (patch: Partial<Form>) => {
    setForm((cur) => ({ ...cur, ...patch }));
    setNotice(null);
  };

  const save = () => {
    setTried(true);
    const first = (Object.keys(NUM) as FieldKey[]).find((k) => errs[k]);
    if (first) {
      document.getElementById(`cfg-${first}`)?.focus();
      return;
    }
    saveProgramConfig({ ...termsOf(form), status: form.status });
    setNotice("Draft saved. It's not active and changes nothing live.");
  };

  const num = (k: FieldKey, label: string, help: React.ReactNode, affix?: { prefix?: string; suffix?: string }, active?: string) => (
    <Field id={`cfg-${k}`} label={label} optional={NUM[k].optional} error={shown[k]} help={<>{help}{active ? <span className="block">Active: {active}</span> : null}</>}>
      <div className="relative">
        {affix?.prefix ? <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{affix.prefix}</span> : null}
        <TextInput
          {...describe(`cfg-${k}`, shown[k], true)}
          inputMode={NUM[k].decimals ? "decimal" : "numeric"}
          value={form[k]}
          onChange={(e) => set({ [k]: e.target.value } as Partial<Form>)}
          className={cn("tabular-nums", affix?.prefix && "ps-7", affix?.suffix && "pe-16")}
        />
        {affix?.suffix ? <span className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{affix.suffix}</span> : null}
      </div>
    </Field>
  );

  const A = ACTIVE_POLICY;
  const summary = terms
    ? [
        { label: "Reward", value: describeReward(terms), active: describeReward(A) },
        { label: "Qualifies at", value: `${usd(terms.minSpend)} across ${terms.minOrders}+ completed order${terms.minOrders === 1 ? "" : "s"}`, active: `${usd(A.minSpend)} across ${A.minOrders}+ completed order` },
        { label: "Window · hold", value: `${terms.qualifyingDays} days · ${terms.holdDays}-day hold`, active: `${A.qualifyingDays} days · ${A.holdDays}-day hold` },
        { label: "Refunded/cancelled orders", value: terms.countRefunded ? "Count" : "Don't count", active: "Don't count" },
        { label: "Per referrer", value: terms.maxPerReferrer ? `Up to ${terms.maxPerReferrer} rewards` : "No limit", active: A.maxPerReferrer ? `Up to ${A.maxPerReferrer}` : "No limit" },
        { label: "Paid to", value: terms.destination === "wallet" ? "Wallet credit" : "Separate rewards balance", active: "Separate rewards balance" },
        { label: "Distribution", value: terms.distribution === "auto" ? "Automatic after hold" : "Manual approval", active: "Manual approval" },
        { label: "Program", value: STATUS_LABEL[form.status], active: "Preview (not live)" },
      ]
    : [];
  const impact = terms ? impactOf(terms) : [];
  const locked = impact.filter((x) => x.locked);
  const open = impact.filter((x) => !x.locked && x.draft !== null);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="space-y-5">
        <SettingsCard title="Reward amount" description="What a referrer earns for each qualified referral. Accounting currency is USD.">
          <Segmented<RewardType>
            name="cfg-type"
            label="Reward type"
            value={form.rewardType}
            options={[
              { value: "fixed", label: "Fixed amount" },
              { value: "percent", label: "% of qualifying spend" },
            ]}
            onChange={(v) => set({ rewardType: v })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {form.rewardType === "fixed" ? (
              num("fixedAmount", "Fixed reward", "Paid once per qualified referral.", { prefix: "$" }, usd(A.fixedAmount))
            ) : (
              <>
                {num("percentRate", "Percentage", "Of the referred customer's qualifying spend.", { suffix: "%" })}
                {num("percentCap", "Maximum reward", "Leave empty for no cap.", { prefix: "$" })}
              </>
            )}
            {num("minSpend", "Minimum qualifying spend", "Completed, eligible orders only.", { prefix: "$" }, usd(A.minSpend))}
            <div>
              <p className="mb-1.5 text-sm font-semibold">Currency</p>
              <p className="flex h-10 items-center rounded-xl border bg-muted/40 px-3.5 text-sm text-muted-foreground">USD · accounting currency</p>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard title="Qualification rules" description="When a referral counts, and how long a reward is held before review.">
          <div className="grid gap-4 sm:grid-cols-2">
            {num("qualifyingDays", "Qualification window", "Days from signup to reach the qualifying spend.", { suffix: "days" }, `${A.qualifyingDays} days`)}
            {num("holdDays", "Holding period", "Days a new reward waits in case orders are refunded.", { suffix: "days" }, `${A.holdDays} days`)}
            {num("minOrders", "Minimum completed orders", "Eligible orders the referred customer must complete.", { suffix: "orders" }, `${A.minOrders} order`)}
            {num("maxPerReferrer", "Maximum rewards per referrer", "Leave empty for no limit.", { suffix: "rewards" }, "No limit")}
          </div>
          <div className="flex items-start justify-between gap-4 rounded-xl border p-3.5">
            <div>
              <p className="text-sm font-semibold">Count refunded or cancelled orders</p>
              <p id="cfg-refunded-desc" className="mt-0.5 text-xs text-muted-foreground">
                Off by default: refunded or cancelled orders never count toward qualifying spend. Active: off.
              </p>
            </div>
            <Switch id="cfg-refunded" label="Count refunded or cancelled orders" describedBy="cfg-refunded-desc" checked={form.countRefunded} onChange={(v) => set({ countRefunded: v })} />
          </div>
        </SettingsCard>

        <SettingsCard title="Reward distribution" description="Where rewards go and who releases them. Wallet credit, automatic release and activation need a secure backend.">
          <OptionRow label="Destination" help={form.destination === "wallet" ? "Future: credits the Sociotix wallet through an immutable ledger. Not available yet." : "Rewards build up in a separate rewards balance. Active."}>
            <Segmented<Destination> name="cfg-dest" label="Destination" value={form.destination} options={[{ value: "rewards", label: "Rewards balance" }, { value: "wallet", label: "Wallet credit" }]} onChange={(v) => set({ destination: v })} />
          </OptionRow>
          <OptionRow label="Distribution" help={form.distribution === "auto" ? "Future: releases automatically after qualification and hold. Not available yet." : "Staff approve each reward after its hold. Active."}>
            <Segmented<Distribution> name="cfg-dist" label="Distribution" value={form.distribution} options={[{ value: "manual", label: "Manual approval" }, { value: "auto", label: "Automatic" }]} onChange={(v) => set({ distribution: v })} />
          </OptionRow>
          <OptionRow label="Program status" help="Proposed only. The live program stays in preview until a backend activates it.">
            <Segmented<ProgramStatus>
              name="cfg-status"
              label="Program status"
              value={form.status}
              options={(Object.keys(STATUS_LABEL) as ProgramStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
              onChange={(v) => set({ status: v })}
            />
          </OptionRow>
        </SettingsCard>

        {/* Impact preview — computed from the form, never written to any record */}
        <SettingsCard title="Impact preview" description="How the proposed rules would treat recorded referrals. Nothing is changed.">
          {terms ? (
            <>
              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                <li className="rounded-xl bg-muted/40 px-3.5 py-2.5">
                  <span className="block font-semibold">{locked.length} recorded rewards stay on policy {A.version}</span>
                  <span className="block text-xs text-muted-foreground">{usd(locked.reduce((n, x) => n + (x.current ?? 0), 0))} total, unchanged. Rules never apply retroactively.</span>
                </li>
                <li className="rounded-xl bg-muted/40 px-3.5 py-2.5">
                  <span className="block font-semibold">{open.length} referrals can still qualify</span>
                  <span className="block text-xs text-muted-foreground">Would follow these rules if activated before they qualify.</span>
                </li>
              </ul>
              <details className="group mt-3">
                <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg text-sm font-semibold text-primary hover:underline focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden /> Per referral
                </summary>
                <div className="mt-2">
                  <table className="w-full text-[0.8rem] sm:text-sm">
                    <caption className="sr-only">Impact per referral</caption>
                    <thead className="text-[0.68rem] tracking-wider text-muted-foreground uppercase">
                      <tr>
                        <th scope="col" className="pb-2 text-start font-bold">Referral</th>
                        <th scope="col" className="pb-2 text-end font-bold">Spend</th>
                        <th scope="col" className="pb-2 ps-3 text-start font-bold">Policy</th>
                        <th scope="col" className="pb-2 text-end font-bold">Recorded</th>
                        <th scope="col" className="pb-2 text-end font-bold">Under draft</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y tabular-nums">
                      {impact.map((x) => (
                        <tr key={x.r.id}>
                          <td className="py-1.5 font-mono text-[0.78rem]">{x.r.id}</td>
                          <td className="py-1.5 text-end">{usd(x.r.spend)}</td>
                          <td className="py-1.5 ps-3 text-xs text-muted-foreground">{x.locked ? `${A.version} · locked` : x.draft === null ? "Not eligible" : "Draft, if activated"}</td>
                          <td className="py-1.5 text-end">{x.current !== null ? usd(x.current) : "—"}</td>
                          <td className={cn("py-1.5 text-end", !x.locked && x.draft !== null && "font-semibold text-primary")}>{x.draft !== null ? usd(x.draft) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  &ldquo;Under draft&rdquo; for referrals without a reward uses their recorded spend or the minimum, whichever is higher. Order counts aren&apos;t recorded, so the minimum-orders rule can&apos;t be previewed.
                </p>
              </details>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Fix the highlighted fields to see the impact.</p>
          )}
        </SettingsCard>
      </div>

      {/* Summary: what's proposed vs what's active */}
      <aside aria-labelledby="cfg-summary-title" className="rounded-2xl border bg-card lg:sticky lg:top-4">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h3 id="cfg-summary-title" className="text-[0.95rem] font-bold">
            Proposed configuration
          </h3>
          <span className={cn("rounded-full px-2 py-0.5 text-[0.68rem] font-bold", config && !dirty ? "bg-secondary text-secondary-foreground" : dirty ? "bg-soon-soft text-soon" : "bg-muted text-muted-foreground")}>
            {dirty ? "Unsaved" : config ? "Draft · Not active" : "Matches active"}
          </span>
        </div>
        <dl className="divide-y px-4 text-sm">
          {summary.map((x) => (
            <div key={x.label} className="py-2">
              <dt className="text-xs text-muted-foreground">{x.label}</dt>
              <dd className={cn("font-medium", x.value !== x.active && "text-primary")}>{x.value}</dd>
              {x.value !== x.active ? <dd className="text-xs text-muted-foreground">Active: {x.active}</dd> : null}
            </div>
          ))}
        </dl>
        {notice ? (
          <p role="status" className="mx-4 mb-1 flex items-center gap-1.5 rounded-lg bg-ok-soft/60 px-3 py-2 text-xs font-medium">
            <CircleCheck className="size-3.5 shrink-0 text-ok" aria-hidden /> {notice}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 border-t p-4">
          <button type="button" onClick={save} disabled={!dirty && Boolean(config)} className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
            Save draft
          </button>
          <button type="button" onClick={() => { setForm(toForm(null)); setTried(false); setNotice(null); }} className="inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none" title="Reset the form to the active rules">
            <RotateCcw className="size-3.5" aria-hidden /> Active values
          </button>
          {config ? (
            <button type="button" onClick={() => setDiscardAsk(true)} className="inline-flex h-10 w-full items-center justify-center rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
              Discard saved draft
            </button>
          ) : null}
        </div>
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          Recorded referrals keep policy {A.version}. Activating rules, wallet credits and automatic payouts need server-side authorisation, an immutable ledger, idempotent credits and audit logs.
        </p>
      </aside>

      <ConfirmDialog
        open={discardAsk}
        onOpenChange={setDiscardAsk}
        title="Discard the saved draft?"
        description="The active rules don't change either way."
        confirmLabel="Discard draft"
        tone="danger"
        icon={Trash2}
        onConfirm={() => {
          discardProgramConfig();
          setForm(toForm(null));
          setNotice(null);
        }}
      />
    </div>
  );
}

function SettingsCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const id = `cfg-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div>
        <h3 id={id} className="text-[0.95rem] font-bold">
          {title}
        </h3>
        <p className="mt-0.5 text-[0.82rem] text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function OptionRow({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 sm:max-w-[45%]">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Drawers                                                                   */
/* -------------------------------------------------------------------------- */

function Section({ id, title, aside, children, sectionRef }: { id: string; title: string; aside?: React.ReactNode; children: React.ReactNode; sectionRef?: React.Ref<HTMLElement> }) {
  return (
    <section ref={sectionRef} aria-labelledby={id} className="scroll-mt-2 border-t px-5 py-5 sm:px-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={id} className="text-[0.95rem] font-bold">
          {title}
        </h3>
        {aside ? <span className="text-xs text-muted-foreground">{aside}</span> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const Missing = ({ children }: { children: React.ReactNode }) => <span className="font-normal text-muted-foreground italic">{children}</span>;
const menuIcon = "size-3.5";
const closeBtn = "-me-1.5 grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";
const primaryBtn =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none max-sm:flex-1";
const moreBtn =
  "ms-auto inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none data-popup-open:bg-muted";

function NoteComposer({ id, onSave, composing, setComposing }: { id: string; onSave: (text: string) => void; composing: boolean; setComposing: (v: boolean) => void }) {
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const save = () => {
    const text = note.trim();
    if (text.length < 2) return setError("Write a short note first.");
    if (looksSensitive(text)) return setError("Don't store passwords, keys, card numbers or other credentials.");
    onSave(text);
    setNote("");
    setError(null);
    setComposing(false);
  };
  return composing ? (
    <div className="mt-4">
      <label htmlFor={id} className="text-xs font-semibold">
        Internal note
      </label>
      <TextArea
        id={id}
        value={note}
        maxLength={1000}
        autoFocus
        onChange={(e) => {
          setNote(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            save();
          }
        }}
        placeholder="Staff only. Never store credentials or payment details."
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-help`}
        className="mt-1.5 min-h-20"
      />
      <p id={`${id}-help`} role={error ? "alert" : undefined} className={cn("mt-1.5 text-xs", error ? "font-medium text-destructive" : "text-muted-foreground")}>
        {error ?? "Saved in this browser only · Ctrl+Enter to add"}
      </p>
      <div className="mt-2.5 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setComposing(false);
            setNote("");
            setError(null);
          }}
          className="inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          Cancel
        </button>
        <button type="button" onClick={save} className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-sm font-semibold text-background transition-opacity hover:opacity-85 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
          Add note
        </button>
      </div>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setComposing(true)}
      className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
    >
      <MessageSquarePlus className="size-4" aria-hidden /> Add internal note
    </button>
  );
}

function NoteList({ notes }: { notes: RefNote[] }) {
  return (
    <>
      {notes.map((n) => (
        <li key={n.id} className="rounded-xl border-s-2 border-primary bg-secondary/40 py-2 ps-3 pe-3 text-sm dark:bg-secondary/20">
          <p className="flex flex-wrap items-center gap-x-2 text-xs">
            <span className="inline-flex items-center gap-1 font-bold text-primary">
              <Eye className="size-3" aria-hidden /> Internal note · staff only
            </span>
            <AdminDemoTag>Demo</AdminDemoTag>
            <span className="ms-auto text-muted-foreground tabular-nums">{dateTime(n.at)}</span>
          </p>
          <p className="mt-0.5 break-words">{n.text}</p>
        </li>
      ))}
    </>
  );
}

/* Referrer profile ----------------------------------------------------------- */

function ReferrerDrawer({
  referrer,
  notes,
  revealed,
  onReveal,
  onClose,
  onOpenReferral,
  onReviewAll,
}: {
  referrer: Referrer | null;
  notes: RefNote[];
  revealed: boolean;
  onReveal: () => void;
  onClose: () => void;
  onOpenReferral: (id: string) => void;
  onReviewAll: () => void;
}) {
  const [shown, setShown] = React.useState(referrer);
  if (referrer && referrer !== shown) setShown(referrer);
  const x = referrer ?? shown;
  return (
    <Sheet open={Boolean(referrer)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[40rem]">
        {x ? <ReferrerBody key={x.id} x={x} notes={notes} revealed={revealed} onReveal={onReveal} onClose={onClose} onOpenReferral={onOpenReferral} onReviewAll={onReviewAll} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function ReferrerBody({
  x,
  notes,
  revealed,
  onReveal,
  onClose,
  onOpenReferral,
  onReviewAll,
}: {
  x: Referrer;
  notes: RefNote[];
  revealed: boolean;
  onReveal: () => void;
  onClose: () => void;
  onOpenReferral: (id: string) => void;
  onReviewAll: () => void;
}) {
  const s = referrerStats(x);
  const toReview = x.referrals.filter(needsReview);
  const [allPeople, setAllPeople] = React.useState(false);
  const [allActivity, setAllActivity] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const [info, setInfo] = React.useState(false);
  const notesRef = React.useRef<HTMLElement>(null);
  const events = referrerEvents(x);
  const people = allPeople ? x.referrals : x.referrals.slice(0, 6);
  const stat = (label: string, value: React.ReactNode, tone?: string) => (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("font-heading text-lg leading-tight font-extrabold tabular-nums", tone)}>{value}</dd>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <SheetTitle className="flex flex-wrap items-center gap-x-2 font-heading text-lg leading-tight font-bold">
            {x.name} {x.sample ? <SampleTag /> : null}
          </SheetTitle>
          <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{x.email}</span>
            <span className="font-mono text-[0.78rem] font-semibold text-foreground">{x.id}</span>
          </SheetDescription>
        </div>
        <button type="button" onClick={onClose} aria-label="Close referrer" className={closeBtn}>
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* What an admin needs first: performance and what's waiting */}
        <section aria-labelledby="rr-perf-title" className="px-5 py-4 sm:px-6">
          <h3 id="rr-perf-title" className="sr-only">
            Performance
          </h3>
          <dl className="grid grid-cols-4 gap-3 rounded-xl bg-muted/40 px-4 py-3">
            {stat("Invited", s.invited)}
            {stat("Signed up", s.signedUp)}
            {stat("Qualified", s.qualified)}
            {stat("Rewarded", s.rewarded)}
          </dl>
          <dl className="mt-2.5 grid grid-cols-2 gap-3 rounded-xl border px-4 py-3 sm:grid-cols-4">
            {stat("Earned", usd(s.earned))}
            {stat("Pending", usd(s.pending), s.pending ? "text-soon" : undefined)}
            {stat("Credited", usd(s.credited))}
            {stat("Reversed", usd(s.reversed))}
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">Rewards go to a separate rewards balance (policy {ACTIVE_POLICY.version}). None affected a wallet.</p>
        </section>

        <Section id="rr-review-title" title="Needs review" aside={`${toReview.length}`}>
          {toReview.length ? (
            <ul className="space-y-1.5">
              {toReview.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onOpenReferral(r.id)}
                    className="flex w-full items-center gap-3 rounded-xl bg-soon-soft/40 px-3.5 py-2.5 text-start text-sm hover:bg-soon-soft/70 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none dark:bg-soon-soft/10"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-[0.78rem] font-semibold">{r.id}</span> <span className="text-muted-foreground">{r.invitee}</span>
                      <span className="block text-xs font-medium text-soon">{flagsOf(r).filter((f) => f.action).map((f) => f.label).join(" · ")}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing waiting on staff.</p>
          )}
        </Section>

        <Section id="rr-people-title" title="People referred" aside={`${x.referrals.length} · each belongs only to this referrer`}>
          <ul className="divide-y">
            {people.map((r) => {
              const stage = stageOf(r);
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => onOpenReferral(r.id)} aria-label={`Open ${r.id}`} className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-start text-sm hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium group-hover:text-primary">{r.invitee}</span>
                      <span className="block text-xs text-muted-foreground">
                        <span className="font-mono">{r.id}</span> · {r.signedUpAt ? `Signed up ${shortDate(r.signedUpAt)}` : "Not signed up"}
                      </span>
                    </span>
                    <span className="shrink-0 text-end text-xs tabular-nums">
                      <span className="block font-medium">
                        {usd(r.spend)} / {usd(P.qualifyingSpend)}
                      </span>
                      <span className={cn("block", STAGE_META[stage].tone)}>{rewardOf(r) ? `${usd(rewardOf(r)!.amount)} · ${STAGE_META[stage].label}` : STAGE_META[stage].label}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
          {x.referrals.length > 6 ? (
            <button type="button" onClick={() => setAllPeople((v) => !v)} aria-expanded={allPeople} className={cn(linkButton, "mt-1")}>
              {allPeople ? "Show fewer" : `Show all ${x.referrals.length}`}
            </button>
          ) : null}
        </Section>

        <Section id="rr-account-title" title="Account">
          <dl className="divide-y text-sm">
            <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 py-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="text-muted-foreground">Account</dt>
              <dd className="font-medium">
                <span className="font-mono text-[0.82rem]">{x.id}</span>
                <span className="block text-xs font-normal text-muted-foreground">{x.sample ? "Customer dashboard demo account · not an admin customer record" : "Customer"}</span>
              </dd>
            </div>
            <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 py-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="text-muted-foreground">Referral code</dt>
              <dd className="font-medium">
                <CodeCell code={x.code} revealed={revealed} onReveal={onReveal} />
              </dd>
            </div>
            <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 py-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="text-muted-foreground">Policy</dt>
              <dd className="font-medium">
                {ACTIVE_POLICY.version} · {describeReward(ACTIVE_POLICY)}
              </dd>
            </div>
          </dl>
        </Section>

        <Section id="rr-activity-title" title="Activity & internal notes" sectionRef={notesRef}>
          <ul className="space-y-2.5">
            <NoteList notes={[...notes].reverse()} />
            {(allActivity ? events : events.slice(0, 5)).map((e) => (
              <li key={e.id} className="text-sm">
                <p className="flex flex-wrap items-center gap-x-2 text-xs">
                  <span className="font-mono font-semibold text-muted-foreground">{e.referralId}</span>
                  <span className="ms-auto text-muted-foreground tabular-nums">{dateTime(e.at)}</span>
                </p>
                <p className="mt-0.5">{e.text}</p>
              </li>
            ))}
          </ul>
          {events.length > 5 ? (
            <button type="button" onClick={() => setAllActivity((v) => !v)} aria-expanded={allActivity} className={cn(linkButton, "mt-1")}>
              {allActivity ? "Show less" : `Show all ${events.length} recorded events`}
            </button>
          ) : null}
          <NoteComposer id="rr-note" composing={composing} setComposing={setComposing} onSave={(t) => addReferrerNote(x.id, t)} />
        </Section>
      </div>

      <div className="flex items-center gap-2 border-t bg-background/95 px-5 py-3 backdrop-blur-sm sm:px-6">
        {toReview.length ? (
          <button type="button" onClick={onReviewAll} className={primaryBtn}>
            Review {toReview.length} referral{toReview.length === 1 ? "" : "s"} <ArrowRight className="size-4" aria-hidden />
          </button>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-ok" aria-hidden /> No action needed
          </p>
        )}
        <Menu.Root>
          <Menu.Trigger aria-label="More actions" className={moreBtn}>
            <Ellipsis className="size-4" aria-hidden /> <span className="hidden sm:inline">More</span>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="top" align="end" sideOffset={8} collisionPadding={12} className="z-50">
              <Menu.Popup className={cn(menuPopup, "w-64")}>
                <Menu.Item
                  onClick={() => {
                    setComposing(true);
                    requestAnimationFrame(() => notesRef.current?.scrollIntoView({ block: "start" }));
                  }}
                  className={menuItem}
                >
                  <MessageSquarePlus className={menuIcon} aria-hidden /> Add internal note
                </Menu.Item>
                <Menu.Item onClick={() => setInfo(true)} className={menuItem}>
                  <ArrowRight className={menuIcon} aria-hidden /> Inspect customer
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      <ConfirmDialog
        open={info}
        onOpenChange={setInfo}
        title="Inspect customer — not linked"
        description={`${x.name} is the customer dashboard's demo account, not an admin customer record, so there's no profile to open.`}
        icon={Lock}
      />
    </div>
  );
}

/* Individual referral -------------------------------------------------------- */

function ReferralDrawer({ referral, notes, onClose, onOpenReferrer }: { referral: Referral | null; notes: RefNote[]; onClose: () => void; onOpenReferrer: (id: string) => void }) {
  const [shown, setShown] = React.useState(referral);
  if (referral && referral !== shown) setShown(referral);
  const r = referral ?? shown;
  return (
    <Sheet open={Boolean(referral)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[38rem]">
        {r ? <DrawerBody key={r.id} r={r} notes={notes} onClose={onClose} onOpenReferrer={onOpenReferrer} /> : null}
      </SheetContent>
    </Sheet>
  );
}

const CHECK_META: Record<CheckState, { Icon: typeof Check; className: string; sr: string }> = {
  met: { Icon: Check, className: "bg-ok-soft text-ok", sr: "Met" },
  unmet: { Icon: X, className: "bg-destructive/10 text-destructive", sr: "Not met" },
  pending: { Icon: CircleDashed, className: "bg-soon-soft text-soon", sr: "In progress" },
  unknown: { Icon: CircleHelp, className: "bg-muted text-muted-foreground", sr: "Unknown" },
  na: { Icon: Minus, className: "bg-muted text-muted-foreground", sr: "Not applicable yet" },
};

const DEMO: Record<string, string> = {
  "Review qualification": "Confirming the qualifying orders needs linked order records and a backend. Nothing changed and no one was notified.",
  "Approve reward": "Approval needs a backend with confirmed qualifying orders and an audit trail. The reward keeps its status.",
  "Credit reward": "Crediting needs a backend with an immutable ledger and idempotent credits. Nothing was credited.",
  "Reject or reverse reward": "Rejecting or reversing needs a backend with an audit trail. The reward keeps its status and the customer wasn't notified.",
  "Credit wallet": "Policy v1 pays rewards to a separate rewards balance, never the wallet. Wallet credit is a future option that needs a secure ledger. No balance changed.",
  "Inspect customer": `Neither ${SAMPLE_REFERRER.name} (the dashboard demo account) nor the masked referred person is linked to an admin customer record, so there's no profile to open.`,
  "View qualifying orders": "This sample records only a spend total. No qualifying orders or payment records are linked, so there's nothing to open.",
};

function DrawerBody({ r, notes, onClose, onOpenReferrer }: { r: Referral; notes: RefNote[]; onClose: () => void; onOpenReferrer: (id: string) => void }) {
  const reward = rewardOf(r);
  const stage = stageOf(r);
  const policy = policyOf(r);
  const checks = checksOf(r);
  const missing = checks.filter((c) => c.state === "unmet" || c.state === "pending");
  const flags = flagsOf(r);
  const next = nextStepOf(r);
  const events = eventsOf(r, notes);
  const ref = referrerOf(r);
  const [info, setInfo] = React.useState<string | null>(null);
  const [composing, setComposing] = React.useState(false);
  const notesRef = React.useRef<HTMLElement>(null);
  const duplicateRewards = REWARDS.filter((w) => w.referralId === r.id).length;

  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 py-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium break-words">{value}</dd>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <SheetTitle className="font-heading text-lg leading-tight font-bold">{r.invitee}</SheetTitle>
          <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono text-[0.78rem] font-semibold text-foreground">{r.id}</span>
            <QualDot status={r.status} />
            <AdminDemoTag>Illustrative</AdminDemoTag>
          </SheetDescription>
        </div>
        <button type="button" onClick={onClose} aria-label="Close referral" className={closeBtn}>
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 py-4 sm:px-6">
          <div className={cn("rounded-xl px-4 py-3 text-sm", next ? "bg-soon-soft/50" : "bg-muted/50")}>
            <p className={cn("font-semibold", next && "text-soon")}>{next ? "Needs review" : REFERRAL_STATUS_META[r.status].label}</p>
            <p className="text-muted-foreground">{next ? next.explain : waitingNote(r) || REFERRAL_STATUS_META[r.status].note}</p>
            {missing.length && !reward ? <p className="mt-1.5 text-xs text-muted-foreground">Still needed: {missing.map((c) => c.label.toLowerCase()).join(" · ")}.</p> : null}
            {flags.length ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {flags.map((x) => (
                  <li key={x.kind} className={cn("rounded-full px-2 py-0.5 text-[0.7rem] font-semibold", x.action ? "bg-soon-soft text-soon" : "bg-muted text-muted-foreground")}>
                    {x.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <Section id="ref-overview-title" title="Referral overview">
          <dl className="divide-y">
            {row("Referral ID", <span className="font-mono text-[0.82rem]">{r.id}</span>)}
            {row(
              "Referrer",
              <span>
                <button type="button" onClick={() => onOpenReferrer(ref.id)} className="font-semibold text-primary hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none">
                  {ref.name}
                </button>
                <span className="block text-xs font-normal text-muted-foreground">
                  Dashboard demo account · <span className="font-mono">{ref.id}</span> · not an admin customer
                </span>
              </span>,
            )}
            {row(
              "Referred",
              <span>
                {r.invitee}
                <span className="block text-xs font-normal text-muted-foreground">Masked · not linked to a customer record</span>
              </span>,
            )}
            {row("Invited", `${dateTime(r.invitedAt)} via ${r.via === "link" ? "link" : "code"}`)}
            {row("Qualification", REFERRAL_STATUS_META[r.status].label)}
            {r.reason ? row("Recorded reason", r.reason) : null}
            {row(
              "Attribution",
              <span>
                One referrer
                <span className="block text-xs font-normal text-muted-foreground">{duplicateRewards <= 1 ? "At most one reward for this qualifying event." : "More than one reward recorded — needs review."}</span>
              </span>,
            )}
          </dl>
        </Section>

        <Section id="ref-checks-title" title="Qualification checklist" aside={`${checks.filter((c) => c.state === "met").length} of ${checks.length} met`}>
          <ul className="space-y-2">
            {checks.map((c) => {
              const { Icon, className, sr } = CHECK_META[c.state];
              return (
                <li key={c.id} className="flex gap-3 rounded-xl bg-muted/30 px-3.5 py-2.5">
                  <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", className)} aria-hidden>
                    <Icon className="size-3" strokeWidth={3} />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">
                      {c.label}
                      <span className="sr-only"> — {sr}.</span>
                    </p>
                    <p className="text-muted-foreground">{c.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] text-muted-foreground">
            {(Object.keys(CHECK_META) as CheckState[]).map((k) => {
              const { Icon, className, sr } = CHECK_META[k];
              return (
                <span key={k} className="inline-flex items-center gap-1">
                  <span className={cn("grid size-3.5 place-items-center rounded-full", className)} aria-hidden>
                    <Icon className="size-2" strokeWidth={3} />
                  </span>
                  {sr}
                </span>
              );
            })}
          </p>
        </Section>

        <Section id="ref-reward-title" title="Reward details">
          <dl className="divide-y">
            {row(
              "Stage",
              <span>
                <span className={STAGE_META[stage].tone}>{STAGE_META[stage].label}</span>
                <span className="block text-xs font-normal text-muted-foreground">{STAGE_META[stage].explain}</span>
              </span>,
            )}
            {row(
              "Policy",
              <span>
                {policy.version} · {describeReward(policy)}
                <span className="block text-xs font-normal text-muted-foreground">Kept for this referral; later rules don&apos;t change it.</span>
              </span>,
            )}
            {reward ? (
              <>
                {row("Reward", <span className="font-mono text-[0.82rem]">{reward.id}</span>)}
                {row("Amount", `${usd(reward.amount)} (fixed ${usd(policy.fixedAmount)} under ${policy.version})`)}
                {row("Created", dateTime(reward.createdAt))}
                {row("Hold until", dateTime(reward.holdUntil))}
                {reward.approvedAt ? row("Approved", dateTime(reward.approvedAt)) : null}
                {reward.creditedAt ? row("Credited to rewards", dateTime(reward.creditedAt)) : null}
                {reward.reversedAt ? row("Reversed", `${dateTime(reward.reversedAt)}${reward.reason ? ` · ${reward.reason}` : ""}`) : null}
              </>
            ) : (
              row("Amount", <Missing>{stage === "not_eligible" ? "No reward — not eligible" : `${usd(policy.fixedAmount)} if it qualifies under ${policy.version}`}</Missing>)
            )}
            {row(
              "Wallet impact",
              <span>
                None
                <span className="block text-xs font-normal text-muted-foreground">Rewards go to a separate rewards balance and never change a wallet. No payment record is linked.</span>
              </span>,
            )}
          </dl>
        </Section>

        <Section id="ref-activity-title" title="Activity & internal notes" sectionRef={notesRef}>
          <ul className="space-y-2.5">
            {events.map((e) =>
              e.kind === "staff" ? (
                <NoteList key={e.id} notes={[{ id: e.id, at: e.at, text: e.text }]} />
              ) : (
                <li key={e.id} className="text-sm">
                  <p className="flex flex-wrap items-center gap-x-2 text-xs">
                    <span className="font-bold text-muted-foreground">Recorded</span>
                    <span className="ms-auto text-muted-foreground tabular-nums">{dateTime(e.at)}</span>
                  </p>
                  <p className="mt-0.5 break-words">{e.text}</p>
                </li>
              ),
            )}
          </ul>
          <NoteComposer id="ref-note" composing={composing} setComposing={setComposing} onSave={(t) => addReferralNote(r.id, t)} />
        </Section>
      </div>

      <div className="flex items-center gap-2 border-t bg-background/95 px-5 py-3 backdrop-blur-sm sm:px-6">
        {next ? (
          <button type="button" onClick={() => setInfo(next.action)} className={primaryBtn}>
            {next.action} <ArrowRight className="size-4" aria-hidden />
          </button>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-ok" aria-hidden /> No action needed
          </p>
        )}
        <Menu.Root>
          <Menu.Trigger aria-label="More actions" className={moreBtn}>
            <Ellipsis className="size-4" aria-hidden /> <span className="hidden sm:inline">More</span>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="top" align="end" sideOffset={8} collisionPadding={12} className="z-50">
              <Menu.Popup className={cn(menuPopup, "w-64")}>
                <Menu.Item
                  onClick={() => {
                    setComposing(true);
                    requestAnimationFrame(() => notesRef.current?.scrollIntoView({ block: "start" }));
                  }}
                  className={menuItem}
                >
                  <MessageSquarePlus className={menuIcon} aria-hidden /> Add internal note
                </Menu.Item>
                <Menu.Item onClick={() => onOpenReferrer(ref.id)} className={menuItem}>
                  <ArrowRight className={menuIcon} aria-hidden /> Open referrer
                </Menu.Item>
                <Menu.Item onClick={() => setInfo("Inspect customer")} className={menuItem}>
                  <ArrowRight className={menuIcon} aria-hidden /> Inspect customer
                </Menu.Item>
                <Menu.Item onClick={() => setInfo("View qualifying orders")} className={menuItem}>
                  <ArrowRight className={menuIcon} aria-hidden /> View qualifying orders
                </Menu.Item>
                <Menu.Separator className={menuSeparator} />
                <p className={menuLabel}>Needs backend · demo only</p>
                {["Review qualification", "Approve reward", "Reject or reverse reward", "Credit wallet"].map((a) => (
                  <Menu.Item key={a} onClick={() => setInfo(a)} className={cn(menuItem, "text-muted-foreground")}>
                    <Lock className={menuIcon} aria-hidden /> {a}
                  </Menu.Item>
                ))}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      <ConfirmDialog
        open={info !== null}
        onOpenChange={(v) => !v && setInfo(null)}
        title={info === "Inspect customer" || info === "View qualifying orders" ? `${info} — not linked` : `${info ?? ""} — demo only`}
        description={info ? DEMO[info] : ""}
        icon={Lock}
      />
    </div>
  );
}

function QualDot({ status }: { status: ReferralStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className={cn("size-2 shrink-0 rounded-full", QUAL_DOT[status])} aria-hidden />
      {REFERRAL_STATUS_META[status].label}
    </span>
  );
}
