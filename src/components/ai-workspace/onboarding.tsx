"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  Check,
  Clapperboard,
  Clock,
  Compass,
  FolderKanban,
  type LucideIcon,
  PenLine,
  Rocket,
  ScanSearch,
  ShoppingBag,
  Sparkles,
  Store,
  Target,
} from "lucide-react";
import { socialApi } from "@/components/social/parts";
import { AI_ROUTES, type AiProfileView, destinationAvailability, GOAL_BY_ID, type GoalId, GOALS, PERSONA_BY_ID, type PersonaId, PERSONAS, recommend } from "@/lib/ai/workspace";
import type { AiAvailability } from "@/lib/ai/registry";
import { cn } from "@/lib/utils";
import { DestinationGlyph, StateChip } from "./glyph";

const PERSONA_ICON: Record<PersonaId, LucideIcon> = { creator: Clapperboard, small_business: Store, agency: Building2, ecommerce: ShoppingBag, freelancer: Briefcase, exploring: Compass };
const GOAL_ICON: Record<GoalId, LucideIcon> = { content: PenLine, save_time: Clock, campaigns: Rocket, services: ScanSearch, organize: FolderKanban, strategy: Target };

const STEPS = ["About you", "Your goals", "Your workspace"] as const;

export function Onboarding({ profile, tools }: { profile: AiProfileView | null; tools: Record<string, AiAvailability> }) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [persona, setPersona] = React.useState<PersonaId | null>(profile?.persona ?? null);
  const [goals, setGoals] = React.useState<GoalId[]>(profile?.goals ?? []);
  const [busy, setBusy] = React.useState<"finish" | "skip" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const moved = React.useRef(false);
  // After Back/Continue, focus the new step's heading as it mounts (after the exit animation), so keyboard and screen-reader users land in the right place.
  const heading = React.useCallback((el: HTMLHeadingElement | null) => {
    if (el && moved.current) el.focus();
  }, []);
  const go = (to: number) => {
    moved.current = true;
    setStep(to);
  };

  const canContinue = step === 0 ? persona !== null : step === 1 ? goals.length > 0 : true;

  const save = async (body: object, kind: "finish" | "skip") => {
    setBusy(kind);
    setError(null);
    const r = await socialApi("/api/ai/profile", { method: "PUT", body: JSON.stringify(body) });
    if (!r.ok) {
      setBusy(null);
      setError(r.message);
      return;
    }
    // Next keeps this route mounted after leaving, so start from step 1 (with the saved answers) next time.
    moved.current = false;
    setStep(0);
    setBusy(null);
    router.push(AI_ROUTES.home);
    router.refresh();
  };

  const toggleGoal = (g: GoalId) => setGoals((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));
  const ordered = GOALS.map((g) => g.id).filter((g) => goals.includes(g));

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-3xl flex-col px-4 py-5 sm:px-6 sm:py-8">
      <div className="flex items-center justify-between gap-3">
        <Link href={AI_ROUTES.home} className="inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
          <Sparkles className="size-4 text-primary" aria-hidden /> Sociotix AI
        </Link>
        <button
          type="button"
          onClick={() => save({ action: "skip" }, "skip")}
          disabled={busy !== null}
          className="inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:opacity-60"
        >
          {busy === "skip" ? "Saving…" : "Skip for now"}
        </button>
      </div>

      {/* Progress */}
      <div className="mt-6 sm:mt-8">
        <p className="text-[0.78rem] font-semibold text-muted-foreground" aria-live="polite">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
        <ol className="mt-2.5 grid grid-cols-3 gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <li key={s} className="h-1.5 overflow-hidden rounded-full bg-muted">
              <span className={cn("block h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none", i <= step ? "w-full" : "w-0")} />
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-7 flex-1 sm:mt-9">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: "easeOut" }}>
            {step === 0 ? (
              <fieldset>
                <legend className="contents">
                  <h1 ref={heading} tabIndex={-1} className="font-heading text-[1.75rem] leading-tight font-extrabold tracking-tight outline-none sm:text-[2.2rem]">
                    What describes you best?
                  </h1>
                </legend>
                <p className="mt-2 text-muted-foreground">Pick one. It only shapes which tools we show first.</p>
                <div className="mt-6 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {PERSONAS.map((p) => {
                    const Icon = PERSONA_ICON[p.id];
                    const on = persona === p.id;
                    return (
                      <label key={p.id} className={choiceClass(on)}>
                        <input type="radio" name="persona" value={p.id} checked={on} onChange={() => setPersona(p.id)} className="peer sr-only" />
                        <ChoiceBody icon={Icon} label={p.label} hint={p.hint} on={on} />
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : step === 1 ? (
              <fieldset>
                <legend className="contents">
                  <h1 ref={heading} tabIndex={-1} className="font-heading text-[1.75rem] leading-tight font-extrabold tracking-tight outline-none sm:text-[2.2rem]">
                    What do you want to achieve?
                  </h1>
                </legend>
                <p className="mt-2 text-muted-foreground">Choose as many as you like.</p>
                <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  {GOALS.map((g) => {
                    const Icon = GOAL_ICON[g.id];
                    const on = goals.includes(g.id);
                    return (
                      <label key={g.id} className={choiceClass(on)}>
                        <input type="checkbox" name="goals" value={g.id} checked={on} onChange={() => toggleGoal(g.id)} className="peer sr-only" />
                        <ChoiceBody icon={Icon} label={g.label} hint={g.hint} on={on} square />
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : (
              <Preview persona={persona!} goals={ordered} tools={tools} heading={heading} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {error ? (
        <p role="alert" className="mt-5 rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <div className="sticky bottom-0 mt-8 -mx-4 flex items-center justify-between gap-3 border-t bg-background/90 px-4 py-3.5 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        {step > 0 ? (
          <button type="button" onClick={() => go(step - 1)} disabled={busy !== null} className="inline-flex h-11 items-center gap-1.5 rounded-full border bg-card px-4.5 text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:opacity-60">
            <ArrowLeft className="size-4" aria-hidden /> Back
          </button>
        ) : (
          <span />
        )}
        {step < 2 ? (
          <button
            type="button"
            onClick={() => go(step + 1)}
            disabled={!canContinue}
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_10px_24px_-14px_rgb(112_71_235/0.9)] transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
          >
            Continue <ArrowRight className="size-4" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => save({ action: "complete", persona, goals: ordered }, "finish")}
            disabled={busy !== null}
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-graphite px-5 text-sm font-bold text-lime shadow-[0_12px_26px_-14px_rgb(32_33_39/0.9)] transition-[filter] hover:brightness-110 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none disabled:opacity-60 dark:bg-lime dark:text-graphite"
          >
            {busy === "finish" ? "Saving…" : "Finish & open my workspace"} {busy === "finish" ? null : <Check className="size-4" aria-hidden />}
          </button>
        )}
      </div>
    </div>
  );
}

const choiceClass = (on: boolean) =>
  cn(
    "group relative flex cursor-pointer items-start gap-3.5 rounded-2xl border bg-card p-4 transition-[border-color,box-shadow,background-color] hover:border-primary/35 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-primary/30",
    on && "border-primary/60 bg-primary/[0.04] shadow-[0_14px_30px_-22px_rgb(112_71_235/0.8)] dark:bg-primary/10",
  );

function ChoiceBody({ icon: Icon, label, hint, on, square }: { icon: LucideIcon; label: string; hint: string; on: boolean; square?: boolean }) {
  return (
    <>
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl transition-colors", on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")} aria-hidden>
        <Icon className="size-[1.15rem]" />
      </span>
      <span className="min-w-0 flex-1 pe-6">
        <span className="block font-semibold leading-snug">{label}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{hint}</span>
      </span>
      <span
        className={cn(
          "absolute top-4 right-4 grid size-5 place-items-center border-2 transition-colors",
          square ? "rounded-md" : "rounded-full",
          on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
        )}
        aria-hidden
      >
        {on ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
    </>
  );
}

function Preview({ persona, goals, tools, heading }: { persona: PersonaId; goals: GoalId[]; tools: Record<string, AiAvailability>; heading: React.Ref<HTMLHeadingElement> }) {
  const picks = recommend(persona, goals, 4);
  return (
    <div>
      <h1 ref={heading} tabIndex={-1} className="font-heading text-[1.75rem] leading-tight font-extrabold tracking-tight outline-none sm:text-[2.2rem]">
        Here&apos;s your workspace
      </h1>
      <p className="mt-2 text-muted-foreground">These tools will appear first on your AI home. You can change your answers any time from Settings.</p>

      <div className="mt-6 overflow-hidden rounded-[1.5rem] border bg-card shadow-soft">
        <div className="flex flex-wrap items-center gap-2 border-b bg-surface px-4 py-3.5 sm:px-5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-graphite px-2.5 py-1 text-[0.75rem] font-semibold text-lime dark:bg-white/10">{PERSONA_BY_ID[persona].label}</span>
          {goals.map((g) => (
            <span key={g} className="rounded-full border bg-card px-2.5 py-1 text-[0.75rem] font-medium">
              {GOAL_BY_ID[g].label}
            </span>
          ))}
        </div>
        <ul className="divide-y">
          {picks.map(({ destination: d, reasons }, i) => (
            <li key={d.id} className="flex items-center gap-3.5 px-4 py-3.5 animate-in fade-in slide-in-from-bottom-1 fill-mode-both motion-reduce:animate-none sm:px-5" style={{ animationDelay: `${i * 60}ms` }}>
              <DestinationGlyph icon={d.icon} group={d.group} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold">{d.name}</span>
                  <StateChip value={destinationAvailability(d, tools)} readyLabel={d.toolId ? "Ready" : "Open"} />
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{reasons.join(" · ")}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">We only save your answers to these two questions. Nothing else is asked or stored.</p>
    </div>
  );
}
