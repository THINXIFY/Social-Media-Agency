"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronDown,
  Clapperboard,
  Clock3,
  Compass,
  Eye,
  Globe,
  Lightbulb,
  type LucideIcon,
  MessagesSquare,
  MousePointerClick,
  Pencil,
  RotateCcw,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { CATEGORY_ICONS } from "@/components/site/primitives";
import { CATEGORY_META, PLATFORM_BY_ID, requirementsOf, type ServiceCategory } from "@/lib/catalog";
import {
  APPROACH_META,
  APPROACH_OF,
  type Choices,
  CONTENT_TYPES,
  EMPTY_CHOICES,
  GOAL_BY_ID,
  type GoalId,
  GOALS,
  type Match,
  OBJECTIVES,
  platformsFor,
  questionsFor,
  recommend,
} from "@/lib/service-finder";
import { money } from "@/lib/demo-account";
import { formatPrice, useDisplay } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { FavoriteButton } from "./favorite-button";
import { FINDER_ROUTE, Panel, ROUTES } from "./shared";

/* -------------------------------------------------------------------------- */
/*  State & URL                                                               */
/* -------------------------------------------------------------------------- */

const STEPS = ["Goal", "Platform", "Refine", "Results"] as const;
type Step = 0 | 1 | 2 | 3;

/** Lets New Order link back to the finder with the same answers. */
export const FINDER_QUERY_KEY = "sv-finder-query";

const GOAL_ICONS: Record<GoalId, LucideIcon> = {
  audience: Users,
  post: Clapperboard,
  visibility: Eye,
  traffic: MousePointerClick,
  business: Store,
  community: MessagesSquare,
  presence: BadgeCheck,
  explore: Compass,
};

/** Drops refinements that the current goal and platform no longer ask about. */
function sanitize(c: Choices): Choices {
  const q = questionsFor(c);
  return {
    ...c,
    type: q.types.some((t) => t.id === c.type) ? c.type : null,
    category: q.categories.some((x) => x.id === c.category) ? c.category : null,
    objective: q.objectives.some((o) => o.id === c.objective) ? c.objective : null,
  };
}

function parse(params: URLSearchParams): { choices: Choices; step: Step } {
  const goal = params.get("goal");
  const platform = params.get("platform");
  const choices = sanitize({
    goal: goal && goal in GOAL_BY_ID ? (goal as GoalId) : null,
    platform: platform === "any" || (platform && PLATFORM_BY_ID[platform]) ? platform : null,
    type: params.get("type"),
    category: (params.get("category") as ServiceCategory | null) ?? null,
    objective: params.get("objective"),
  });
  const wanted = Number(params.get("step"));
  const max: Step = !choices.goal ? 0 : !choices.platform ? 1 : 3;
  const step = (Number.isInteger(wanted) && wanted >= 0 ? Math.min(wanted, max) : max === 3 ? 2 : max) as Step;
  return { choices, step };
}

function toQuery(c: Choices, step: Step) {
  const q = new URLSearchParams();
  if (c.goal) q.set("goal", c.goal);
  if (c.platform) q.set("platform", c.platform);
  if (c.type) q.set("type", c.type);
  if (c.category) q.set("category", c.category);
  if (c.objective) q.set("objective", c.objective);
  if (c.goal) q.set("step", String(step));
  return q.toString();
}

const platformLabel = (id: string | null) => (id === "any" ? "Any platform" : id ? PLATFORM_BY_ID[id]?.name : null);

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function ServiceFinder() {
  // Re-render when language, currency, time zone or date format change.
  useDisplay();
  const params = useSearchParams();
  const pathname = usePathname();
  const [initial] = React.useState(() => parse(params));
  const [choices, setChoices] = React.useState<Choices>(initial.choices);
  const [step, setStep] = React.useState<Step>(initial.step);
  // Set when the step changes; the next step's heading takes focus once it mounts.
  const focusPending = React.useRef(false);

  // Keep answers in the URL so Back from New Order returns to the same results.
  React.useEffect(() => {
    if (pathname !== FINDER_ROUTE) return;
    const qs = toQuery(choices, step);
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    try {
      sessionStorage.setItem(FINDER_QUERY_KEY, qs);
    } catch {}
  }, [choices, step, pathname]);

  /** True once after a step change, so only the new heading takes focus. */
  const claimFocus = React.useCallback(() => {
    const pending = focusPending.current;
    focusPending.current = false;
    return pending;
  }, []);

  const go = (s: Step) => {
    focusPending.current = true;
    setStep(s);
  };
  const update = (patch: Partial<Choices>) => setChoices((c) => sanitize({ ...c, ...patch }));
  const reachable = (s: Step) => s === 0 || (s === 1 && !!choices.goal) || (s >= 2 && !!choices.goal && !!choices.platform);
  const startOver = () => {
    setChoices(EMPTY_CHOICES);
    go(0);
  };

  const ctx: Ctx = { choices, step, update, go, reachable, claimFocus, startOver };

  return (
    <div className="mx-auto max-w-[90rem] px-3 pt-4 pb-10 sm:px-6 sm:pt-7 lg:px-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <Link
            href={ROUTES["new-order"]}
            className="inline-flex items-center gap-1.5 rounded-full text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <ArrowLeft className="size-4" aria-hidden /> New Order
          </Link>
          <h1 className="mt-2 flex items-center gap-2.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">
            Find the Right Service
          </h1>
          <p className="mt-1 text-[0.95rem] text-muted-foreground">
            Answer a few quick questions. We match services from our catalog using clear, fixed rules and show why each one fits.
          </p>
        </div>
        <Progress ctx={ctx} />
      </header>

      <div className="mt-5 grid grid-cols-1 items-start gap-5 sm:mt-7 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-6">
        <section aria-labelledby="finder-step-title" className="min-w-0">
          {step > 0 ? <ChoiceStrip ctx={ctx} /> : null}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {step === 0 ? <GoalStep ctx={ctx} /> : null}
              {step === 1 ? <PlatformStep ctx={ctx} /> : null}
              {step === 2 ? <RefineStep ctx={ctx} /> : null}
              {step === 3 ? <ResultsStep ctx={ctx} /> : null}
            </motion.div>
          </AnimatePresence>
        </section>

        <aside className="sticky top-24 hidden xl:block" aria-label="Your answers">
          <Summary ctx={ctx} />
        </aside>
      </div>
    </div>
  );
}

interface Ctx {
  choices: Choices;
  step: Step;
  update: (patch: Partial<Choices>) => void;
  go: (s: Step) => void;
  reachable: (s: Step) => boolean;
  claimFocus: () => boolean;
  startOver: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Progress & answers                                                        */
/* -------------------------------------------------------------------------- */

function Progress({ ctx }: { ctx: Ctx }) {
  return (
    <nav aria-label="Finder progress" className="w-full lg:w-auto">
      <ol className="grid grid-cols-4 gap-1.5 sm:flex sm:items-center sm:gap-0">
        {STEPS.map((label, i) => {
          const s = i as Step;
          const current = ctx.step === s;
          const done = ctx.step > s;
          const canGo = !current && ctx.reachable(s);
          return (
            <li key={label} className={cn("sm:flex sm:items-center", i < STEPS.length - 1 && "sm:flex-1 lg:flex-none")}>
              <button
                type="button"
                onClick={() => canGo && ctx.go(s)}
                disabled={!canGo}
                aria-current={current ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${label}${current ? ", current step" : done ? ", completed" : ""}`}
                className={cn(
                  "flex w-full flex-col gap-1.5 rounded-full text-start focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:cursor-default sm:w-auto sm:flex-row sm:items-center sm:gap-2 sm:p-1 sm:pe-3",
                  canGo && "sm:hover:bg-muted",
                )}
              >
                {/* Phones: a segmented bar */}
                <span className={cn("block h-1.5 w-full rounded-full sm:hidden", i <= ctx.step ? "bg-primary" : "bg-border")} aria-hidden />
                <span
                  className={cn(
                    "hidden size-8 shrink-0 place-items-center rounded-full text-[0.8rem] font-bold tabular-nums transition-all sm:grid",
                    current && "bg-primary text-primary-foreground ring-4 ring-primary/15",
                    done && "bg-primary/12 text-primary ring-1 ring-primary/30 ring-inset dark:bg-primary/20",
                    !current && !done && "border bg-card text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className={cn(
                    "text-[0.72rem] leading-tight font-semibold sm:text-sm",
                    current ? "text-foreground" : done ? "text-foreground/80" : "text-muted-foreground",
                    !current && "max-sm:sr-only sm:max-md:hidden",
                  )}
                >
                  {label}
                </span>
              </button>
              {i < STEPS.length - 1 ? (
                <span
                  className={cn("mx-1.5 hidden h-0.5 min-w-4 flex-1 rounded-full sm:block lg:w-8 lg:flex-none", done ? "bg-primary/60" : "bg-border")}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function answerRows(c: Choices) {
  const goal = c.goal ? GOAL_BY_ID[c.goal] : null;
  const refine = [
    CONTENT_TYPES.find((t) => t.id === c.type)?.label,
    c.category ? CATEGORY_META[c.category].label : null,
    OBJECTIVES.find((o) => o.id === c.objective)?.label,
  ].filter(Boolean) as string[];
  return [
    { step: 0 as Step, label: "Goal", value: goal?.label ?? null },
    { step: 1 as Step, label: "Platform", value: platformLabel(c.platform) ?? null },
    { step: 2 as Step, label: "Refinements", value: refine.length ? refine.join(" · ") : c.platform ? "No preferences" : null },
  ];
}

/** Desktop: answers beside the steps, each editable. */
function Summary({ ctx }: { ctx: Ctx }) {
  const rows = answerRows(ctx.choices);
  return (
    <Panel className="p-5">
      <h2 className="font-heading text-base font-bold">Your answers</h2>
      <dl className="mt-3 divide-y">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">{r.label}</dt>
              <dd className={cn("mt-0.5 text-sm font-semibold", !r.value && "font-normal text-muted-foreground")}>{r.value ?? "Not chosen yet"}</dd>
            </div>
            {r.value && ctx.step !== r.step && ctx.reachable(r.step) ? (
              <button
                type="button"
                onClick={() => ctx.go(r.step)}
                aria-label={`Change ${r.label.toLowerCase()}`}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
              >
                <Pencil className="size-3" aria-hidden /> Edit
              </button>
            ) : null}
          </div>
        ))}
      </dl>
      {ctx.choices.goal ? (
        <button
          type="button"
          onClick={ctx.startOver}
          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          <RotateCcw className="size-3.5" aria-hidden /> Start over
        </button>
      ) : null}
      <p className="mt-4 flex gap-2 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
        Matches use fixed rules on our catalog. They don&apos;t predict results, and reach or timing is never guaranteed.
      </p>
    </Panel>
  );
}

/** Phones and tablets: answers as tappable chips above the step. */
function ChoiceStrip({ ctx }: { ctx: Ctx }) {
  const rows = answerRows(ctx.choices).filter((r) => r.value && r.step < ctx.step);
  if (!rows.length) return null;
  return (
    <div className="-mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0 xl:hidden" aria-label="Your answers" role="group">
      {rows.map((r) => (
        <button
          key={r.label}
          type="button"
          onClick={() => ctx.go(r.step)}
          aria-label={`${r.label}: ${r.value}. Change`}
          className="inline-flex h-8 max-w-[16rem] shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          <span className="text-muted-foreground">{r.label}</span>
          <span className="truncate">{r.value}</span>
          <Pencil className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared bits                                                               */
/* -------------------------------------------------------------------------- */

function StepHeading({ ctx, title, description }: { ctx: Ctx; title: string; description: React.ReactNode }) {
  const ref = React.useRef<HTMLHeadingElement>(null);
  const { claimFocus } = ctx;

  // Land keyboard and screen-reader users on the new step.
  React.useEffect(() => {
    if (!claimFocus()) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    ref.current?.focus({ preventScroll: true });
  }, [claimFocus]);

  return (
    <div>
      <h2 id="finder-step-title" ref={ref} tabIndex={-1} className="text-xl font-bold outline-none sm:text-[1.4rem]">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

const primaryBtn =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_10px_28px_-12px_rgb(112_71_235/0.8)] transition-all hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none";
const secondaryBtn =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";

function StepActions({ ctx, next, nextLabel, disabled, hint }: { ctx: Ctx; next?: () => void; nextLabel?: string; disabled?: boolean; hint?: string }) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between sm:pt-5">
      {ctx.step > 0 ? (
        <button type="button" onClick={() => ctx.go((ctx.step - 1) as Step)} className={secondaryBtn}>
          <ArrowLeft className="size-4" aria-hidden /> Back
        </button>
      ) : (
        <span className="hidden sm:block" />
      )}
      {next ? (
        <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
          <button type="button" onClick={next} disabled={disabled} className={primaryBtn}>
            {nextLabel ?? "Continue"} <ArrowRight className="size-4" aria-hidden />
          </button>
          {hint ? <p className="text-center text-xs text-muted-foreground sm:text-end">{hint}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

const choiceCard =
  "group relative flex h-full w-full rounded-2xl border bg-card text-start transition-[border-color,box-shadow,transform,background-color] duration-200 hover:-translate-y-px hover:border-primary/40 hover:shadow-soft focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0";
const choiceOn = "border-primary bg-secondary/50 ring-1 ring-primary hover:border-primary dark:bg-secondary/30";

function SelectedMark({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
        on ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent group-hover:border-primary/50",
      )}
      aria-hidden
    >
      <Check className="size-3" strokeWidth={3.5} />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 1 · Goal                                                             */
/* -------------------------------------------------------------------------- */

function GoalStep({ ctx }: { ctx: Ctx }) {
  return (
    <Panel className="@container p-4 sm:p-6">
      <StepHeading ctx={ctx} title="What would you like to achieve?" description="Pick the goal that fits best. You can change it at any time." />
      <ul className="mt-5 grid grid-cols-1 gap-2.5 @md:grid-cols-2 @4xl:grid-cols-4 @4xl:gap-3">
        {GOALS.map((g) => {
          const Icon = GOAL_ICONS[g.id];
          const on = ctx.choices.goal === g.id;
          return (
            <li key={g.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => {
                  ctx.update({ goal: g.id });
                  ctx.go(1);
                }}
                className={cn(choiceCard, "items-start gap-3 p-3.5 @4xl:flex-col @4xl:p-4", on && choiceOn, g.id === "explore" && !on && "border-dashed")}
              >
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-xl transition-colors",
                    on ? "bg-primary text-primary-foreground" : "bg-secondary text-primary group-hover:bg-primary/15",
                  )}
                  aria-hidden
                >
                  <Icon className="size-[1.15rem]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.95rem] leading-snug font-semibold">{g.label}</span>
                  <span className="mt-0.5 block text-[0.8rem] leading-snug text-muted-foreground">{g.hint}</span>
                </span>
                <span className="@4xl:absolute @4xl:top-4 @4xl:end-4">
                  <SelectedMark on={on} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <StepActions ctx={ctx} next={() => ctx.go(1)} disabled={!ctx.choices.goal} hint={ctx.choices.goal ? undefined : "Choose a goal to continue."} />
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 2 · Platform                                                         */
/* -------------------------------------------------------------------------- */

function PlatformStep({ ctx }: { ctx: Ctx }) {
  const goal = GOAL_BY_ID[ctx.choices.goal!];
  const { relevant, other } = React.useMemo(() => platformsFor(goal), [goal]);
  const [showOther, setShowOther] = React.useState(() => other.some((o) => o.platform.id === ctx.choices.platform));
  const choose = (id: string) => {
    ctx.update({ platform: id });
    ctx.go(2);
  };
  const anyCount = relevant.reduce((n, r) => n + r.matches, 0);

  const card = (id: string, label: string, detail: string, tile: React.ReactNode, muted = false) => {
    const on = ctx.choices.platform === id;
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => choose(id)}
        className={cn(choiceCard, "min-h-[4.25rem] items-center gap-3 p-2.5 pe-3 sm:p-3", on && choiceOn)}
      >
        {tile}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[0.9rem] leading-tight font-semibold">{label}</span>
          <span className={cn("mt-0.5 block text-xs", muted ? "text-muted-foreground/80" : "text-muted-foreground")}>{detail}</span>
        </span>
        <SelectedMark on={on} />
      </button>
    );
  };

  return (
    <Panel className="@container p-4 sm:p-6">
      <StepHeading
        ctx={ctx}
        title="Where would you like to grow?"
        description={
          <>
            Platforms with services for <span className="font-medium text-foreground">{goal.label.toLowerCase()}</span> come first.
          </>
        }
      />
      <ul className="mt-5 grid grid-cols-1 gap-2 @md:grid-cols-2 @3xl:grid-cols-3 @3xl:gap-2.5">
        <li>
          {card(
            "any",
            "Any platform",
            `${anyCount} matching service${anyCount === 1 ? "" : "s"}`,
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground text-background" aria-hidden>
              <Globe className="size-5" />
            </span>,
          )}
        </li>
        {relevant.map(({ platform, matches }) => (
          <li key={platform.id}>
            {card(
              platform.id,
              platform.name,
              `${matches} matching service${matches === 1 ? "" : "s"}`,
              <PlatformTile platform={platform} size="md" className="size-10 rounded-xl" />,
            )}
          </li>
        ))}
      </ul>

      {other.length ? (
        <div className="mt-5 border-t pt-4">
          <button
            type="button"
            aria-expanded={showOther}
            aria-controls="finder-other-platforms"
            onClick={() => setShowOther((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            Other platforms ({other.length})
            <ChevronDown className={cn("size-4 transition-transform", showOther && "rotate-180")} aria-hidden />
          </button>
          {showOther ? (
            <>
              <p className="mt-1 px-3 text-xs text-muted-foreground">No recommended services for this goal yet. You can still look.</p>
              <ul id="finder-other-platforms" className="mt-3 grid grid-cols-1 gap-2 @md:grid-cols-2 @3xl:grid-cols-3">
                {other.map(({ platform }) => (
                  <li key={platform.id}>
                    {card(platform.id, platform.name, "No direct match", <PlatformTile platform={platform} size="md" className="size-10 rounded-xl opacity-80" />, true)}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      <StepActions ctx={ctx} next={() => ctx.go(2)} disabled={!ctx.choices.platform} hint={ctx.choices.platform ? undefined : "Choose a platform, or Any platform."} />
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 3 · Refine                                                           */
/* -------------------------------------------------------------------------- */

const chip =
  "inline-flex min-h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 py-1.5 text-start text-sm font-medium transition-colors hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";
const chipOn = "border-primary bg-primary text-primary-foreground hover:border-primary";

function Question({
  id,
  title,
  help,
  children,
}: {
  id: string;
  title: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    // The divider sits on a wrapper: a fieldset would draw it through the legend.
    <div className="border-t pt-5 first:border-t-0 first:pt-0">
      <fieldset aria-describedby={help ? `${id}-help` : undefined}>
        <legend className="text-[0.95rem] font-semibold">{title}</legend>
        {help ? (
          <p id={`${id}-help`} className="mt-0.5 text-xs text-muted-foreground">
            {help}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">{children}</div>
      </fieldset>
    </div>
  );
}

function RefineStep({ ctx }: { ctx: Ctx }) {
  const q = questionsFor(ctx.choices);
  const { choices } = ctx;
  const nothing = !q.types.length && !q.categories.length && !q.objectives.length;
  const option = (on: boolean, label: React.ReactNode, onClick: () => void, key: string) => (
    <button key={key} type="button" aria-pressed={on} onClick={onClick} className={cn(chip, on && chipOn)}>
      {on ? <Check className="size-3.5 shrink-0" strokeWidth={3} aria-hidden /> : null}
      {label}
    </button>
  );

  return (
    <Panel className="p-4 sm:p-6">
      <StepHeading
        ctx={ctx}
        title="Refine your needs"
        description={nothing ? "Nothing else to ask. Your goal and platform are enough." : "Optional. We only ask what changes your matches."}
      />

      {nothing ? null : (
        <div className="mt-6 space-y-5">
          {q.types.length ? (
            <Question id="q-type" title="What are you promoting?" help="Services built for it rank higher.">
              {option(!choices.type, "Not sure", () => ctx.update({ type: null }), "none")}
              {q.types.map((t) => option(choices.type === t.id, t.label, () => ctx.update({ type: t.id }), t.id))}
            </Question>
          ) : null}

          {q.objectives.length ? (
            <Question id="q-objective" title="What's your main marketing objective?" help="Matched against the campaign goals each order form offers.">
              {option(!choices.objective, "No preference", () => ctx.update({ objective: null }), "none")}
              {q.objectives.map((o) => option(choices.objective === o.id, o.label, () => ctx.update({ objective: o.id }), o.id))}
            </Question>
          ) : null}

          {q.categories.length ? (
            <Question id="q-category" title="Preferred type of service" help="Only services of this type are shown.">
              {option(!choices.category, "No preference", () => ctx.update({ category: null }), "none")}
              {q.categories.map(({ id }) => {
                const Icon = CATEGORY_ICONS[id];
                const review = APPROACH_OF[id] === "review";
                return option(
                  choices.category === id,
                  <>
                    <Icon className="size-3.5 shrink-0" aria-hidden />
                    {CATEGORY_META[id].label}
                    {review ? (
                      <span className={cn("ms-0.5 text-[0.68rem] font-semibold", choices.category === id ? "opacity-80" : "text-soon")}>· Needs review</span>
                    ) : null}
                  </>,
                  () => ctx.update({ category: id }),
                  id,
                );
              })}
            </Question>
          ) : null}
        </div>
      )}

      {/* Budget only helps once services have configured prices, so it isn't asked yet. */}
      {!q.priced ? (
        <p className="mt-6 flex items-start gap-2 rounded-2xl bg-muted/50 p-3.5 text-xs leading-relaxed text-muted-foreground">
          <Clock3 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          We don&apos;t ask for a budget yet: pricing for these services is still pending, so it wouldn&apos;t change your matches.
        </p>
      ) : null}

      <StepActions ctx={ctx} next={() => ctx.go(3)} nextLabel="See recommendations" />
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 4 · Results                                                          */
/* -------------------------------------------------------------------------- */

const configureHref = (serviceId: string) => `${ROUTES["new-order"]}?service=${encodeURIComponent(serviceId)}&from=finder`;
const exploreHref = (platform: string | null) =>
  platform && platform !== "any" ? `${ROUTES["new-order"]}?platform=${encodeURIComponent(platform)}` : ROUTES["new-order"];

function PricingStatus({ match }: { match: Match }) {
  const price = match.service.price;
  if (price) {
    return (
      <span className="text-xs font-semibold">
        {price.currency === "USD" ? money(price.amount) : formatPrice(price.amount, price.currency)} {price.unit}
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-[0.7rem] font-semibold whitespace-nowrap text-muted-foreground">
      <Clock3 className="size-3" strokeWidth={2.5} aria-hidden /> Pricing pending
    </span>
  );
}

function ApproachBadge({ match }: { match: Match }) {
  const review = match.approach === "review";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[0.7rem] font-semibold whitespace-nowrap",
        review ? "bg-soon-soft text-soon" : "bg-ok-soft text-ok",
      )}
    >
      {review ? <ShieldAlert className="size-3" aria-hidden /> : <ShieldCheck className="size-3" aria-hidden />}
      {APPROACH_META[match.approach].label}
    </span>
  );
}

function RecommendationCard({ match, rank }: { match: Match; rank: number }) {
  const { service, platform } = match;
  const reasons = match.reasons.slice(0, 3);
  return (
    <article
      aria-labelledby={`rec-${service.id}`}
      className={cn("rounded-2xl border bg-card p-4 sm:p-5", rank === 1 && "border-primary/40 ring-1 ring-primary/15")}
    >
      <div className="flex items-start gap-3">
        <PlatformTile platform={platform} size="md" className="size-11 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] font-bold tracking-wider text-muted-foreground uppercase">
            <span className={cn(rank === 1 && "text-primary")}>{rank === 1 ? "Top match" : `Match ${rank}`}</span>
          </p>
          <h3 id={`rec-${service.id}`} className="mt-0.5 text-base leading-snug font-bold text-balance">
            {service.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {platform.name} · {CATEGORY_META[service.category].label}
          </p>
        </div>
        <FavoriteButton service={service} className="-mt-1 -me-1" />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{service.description}</p>

      <div className="mt-3 rounded-xl bg-secondary/45 p-3 dark:bg-secondary/25">
        <p className="flex items-start gap-2 text-sm font-semibold">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          {match.summary}
        </p>
        <ul className="mt-1.5 space-y-1 ps-6 text-[0.8rem] leading-relaxed text-muted-foreground">
          {reasons.map((r) => (
            <li key={r} className="list-disc marker:text-primary/50">
              {r}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <ApproachBadge match={match} />
          <PricingStatus match={match} />
          <span className="sr-only">You&apos;ll provide:</span>
          {requirementsOf(service).map((r) => (
            <span key={r} className="rounded-md bg-muted px-1.5 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
              {r}
            </span>
          ))}
        </div>
        <Link href={configureHref(service.id)} className={cn(primaryBtn, "h-10 shrink-0")} aria-label={`Configure Order: ${service.name}`}>
          Configure Order <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}

function CompactMatch({ match, action }: { match: Match; action: string }) {
  const { service, platform } = match;
  return (
    <li className="flex items-center gap-2 rounded-2xl border bg-card p-2.5 ps-3">
      <PlatformTile platform={platform} size="sm" className="size-9" />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug font-semibold">{service.name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          {platform.short} · {CATEGORY_META[service.category].short}
          {match.approach === "review" ? <span className="font-semibold text-soon">· Needs policy review</span> : null}
        </p>
      </div>
      <FavoriteButton service={service} />
      <Link
        href={configureHref(service.id)}
        aria-label={`${action}: ${service.name}`}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold text-primary transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
      >
        {action}
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </li>
  );
}

function ResultsStep({ ctx }: { ctx: Ctx }) {
  const { choices } = ctx;
  const goal = GOAL_BY_ID[choices.goal!];
  const result = React.useMemo(() => recommend(choices), [choices]);
  const where = choices.platform === "any" ? "any platform" : platformLabel(choices.platform);
  const narrowed = choices.platform !== "any" || Boolean(choices.category);

  const broaden = (
    <div className="flex flex-wrap gap-2">
      {choices.category ? (
        <button type="button" onClick={() => ctx.update({ category: null })} className={cn(secondaryBtn, "h-9 text-xs")}>
          Any type of service
        </button>
      ) : null}
      {choices.platform !== "any" ? (
        <button type="button" onClick={() => ctx.update({ platform: "any" })} className={cn(secondaryBtn, "h-9 text-xs")}>
          Try any platform
        </button>
      ) : null}
      <button type="button" onClick={() => ctx.go(0)} className={cn(secondaryBtn, "h-9 text-xs")}>
        Change goal
      </button>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5">
      <Panel className="p-4 sm:p-6">
        <StepHeading
          ctx={ctx}
          title="Services matched to your goals."
          description={
            result.total ? (
              <>
                {result.total} service{result.total === 1 ? "" : "s"} fit {goal.phrase} on {where}. Ranked by your answers.
              </>
            ) : (
              <>No recommended services fit {goal.phrase} on {where} yet.</>
            )
          }
        />

        {result.total === 0 ? (
          <div className="mt-5 rounded-3xl border border-dashed px-5 py-10 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <SearchX className="size-5" aria-hidden />
            </span>
            <p className="mt-3 font-semibold">No recommended matches</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {choices.category
                ? `There are no ${CATEGORY_META[choices.category].label.toLowerCase()} services for ${goal.phrase} on ${where} that we can recommend.`
                : `${where} doesn't have ad, business-platform, SEO or disclosed promotion services for ${goal.phrase} in our catalog.`}{" "}
              Broaden your answers to see more.
            </p>
            <div className="mt-4 flex justify-center">{broaden}</div>
          </div>
        ) : (
          <>
            {result.total < 3 && narrowed ? (
              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-soon/25 bg-soon-soft/40 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm">
                  <span className="font-semibold">Only {result.total} match{result.total === 1 ? "" : "es"}.</span>{" "}
                  <span className="text-muted-foreground">Broaden your answers to compare more options.</span>
                </p>
                {broaden}
              </div>
            ) : null}
            <ol className="mt-5 space-y-3" aria-label="Recommended services">
              {result.top.map((m, i) => (
                <li key={m.service.id}>
                  <RecommendationCard match={m} rank={i + 1} />
                </li>
              ))}
            </ol>
          </>
        )}

        <StepActions ctx={ctx} />
      </Panel>

      {result.alternatives.length ? (
        <Panel className="p-4 sm:p-5" aria-labelledby="alt-title">
          <h3 id="alt-title" className="text-sm font-bold">
            Alternatives
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Also a good fit, ranked lower by the same rules.</p>
          <ul className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
            {result.alternatives.map((m) => (
              <CompactMatch key={m.service.id} match={m} action="Configure" />
            ))}
          </ul>
        </Panel>
      ) : null}

      {result.review.length ? (
        <Panel className="overflow-hidden">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-start gap-3 p-4 marker:hidden focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:p-5 [&::-webkit-details-marker]:hidden">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-soon-soft text-soon" aria-hidden>
                <ShieldAlert className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">
                  {result.review.length} more matching service{result.review.length === 1 ? " needs" : "s need"} policy review
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{APPROACH_META.review.note}</span>
              </span>
              <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <ul className="grid grid-cols-1 gap-2 border-t p-4 sm:p-5 lg:grid-cols-2">
              {result.review.map((m) => (
                <CompactMatch key={m.service.id} match={m} action="Details" />
              ))}
            </ul>
          </details>
        </Panel>
      ) : null}

      <div className="flex flex-col gap-3 rounded-3xl border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <p className="text-sm text-muted-foreground">
          Want to compare everything yourself?{" "}
          <span className="text-foreground">Browse every {choices.platform !== "any" ? `${platformLabel(choices.platform)} ` : ""}service in New Order.</span>
        </p>
        <Link href={exploreHref(choices.platform)} className={cn(secondaryBtn, "h-10 shrink-0")}>
          Explore all matching services <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground xl:hidden">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
        Matches use fixed rules on our catalog. They don&apos;t predict results, and reach or timing is never guaranteed.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Entry point                                                               */
/* -------------------------------------------------------------------------- */

/** A subtle link into the finder, for Overview and New Order. */
export function FinderPrompt({ className }: { className?: string }) {
  return (
    // One link: the whole card opens the finder, and the pill is its visual call to action.
    <Link
      href={FINDER_ROUTE}
      className={cn(
        "group relative isolate flex flex-col gap-3 overflow-hidden rounded-2xl border border-primary/20 bg-linear-to-br from-secondary/80 via-secondary/40 to-card p-3.5 transition-[border-color,box-shadow,translate] duration-200 hover:-translate-y-px hover:border-primary/40 hover:shadow-soft focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:flex-row sm:items-center sm:gap-4 sm:p-4 dark:border-primary/25 dark:from-primary/[0.16] dark:via-primary/[0.07] dark:to-card",
        className,
      )}
    >
      {/* Lime accent light, a little brighter on hover */}
      <span
        className="pointer-events-none absolute -end-10 -top-12 -z-10 size-32 rounded-full bg-lime/35 opacity-70 blur-2xl transition-opacity duration-300 group-hover:opacity-100 dark:bg-lime/10"
        aria-hidden
      />

      <span className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
        <span
          className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_20px_-10px_rgb(112_71_235/0.9)]"
          aria-hidden
        >
          <Compass className="size-5 transition-transform duration-300 group-hover:-rotate-[25deg] motion-reduce:transition-none" />
          <span className="absolute -end-1 -top-1 size-3 rounded-full bg-lime ring-2 ring-card" />
        </span>
        <span className="min-w-0">
          <span className="block font-heading text-[0.95rem] leading-snug font-bold">Not sure which service to choose?</span>
          <span className="mt-0.5 block text-[0.8rem] leading-snug text-muted-foreground">
            Tell us your goal and discover services that match your needs in a few quick steps.
          </span>
        </span>
      </span>

      <span className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_8px_20px_-12px_rgb(112_71_235/0.9)] transition-colors group-hover:bg-primary/90">
        Find My Service
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
      </span>
    </Link>
  );
}
