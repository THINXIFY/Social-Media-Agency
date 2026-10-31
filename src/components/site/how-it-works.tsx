"use client";

import * as React from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import {
  Check,
  CreditCard,
  Landmark,
  Lock,
  MousePointerClick,
  Route,
  Search,
  ShieldCheck,
  UserPlus,
  Wallet,
} from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { Section, SectionHeading } from "@/components/site/primitives";
import { cn } from "@/lib/utils";
import { CATEGORY_META, PLATFORM_BY_ID, SERVICE_BY_ID } from "@/lib/catalog";

const EASE = [0.22, 1, 0.36, 1] as const;
const STEP_MS = 5000;

const STEPS = [
  {
    icon: UserPlus,
    title: "Create an Account",
    body: "Sign up and access your dashboard.",
    Visual: AccountVisual,
  },
  {
    icon: Wallet,
    title: "Add Funds",
    body: "Securely fund your account using supported payment methods.",
    Visual: FundsVisual,
  },
  {
    icon: MousePointerClick,
    title: "Choose & Order",
    body: "Explore services, configure your order, and confirm.",
    Visual: OrderVisual,
  },
  {
    icon: Route,
    title: "Track Progress",
    body: "Follow order updates and completion status.",
    Visual: TrackVisual,
  },
];

export function HowItWorks() {
  const [active, setActive] = React.useState(0);
  const [locked, setLocked] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const playing = inView && !locked && !paused && !reduce;
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  React.useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setActive((i) => (i + 1) % STEPS.length), STEP_MS);
    return () => window.clearTimeout(t);
  }, [playing, active]);

  const choose = (i: number) => {
    setActive(i);
    setLocked(true);
  };

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const dir = ["ArrowDown", "ArrowRight"].includes(e.key) ? 1 : ["ArrowUp", "ArrowLeft"].includes(e.key) ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + STEPS.length) % STEPS.length;
    choose(next);
    tabRefs.current[next]?.focus();
  };

  const { Visual } = STEPS[active];

  return (
    <Section id="how-it-works" className="overflow-hidden border-t bg-surface/60">
      <SectionHeading
        eyebrow="How it works"
        title={
          <>
            Four steps. <span className="text-muted-foreground">Zero guesswork.</span>
          </>
        }
        description="From sign-up to a completed order, every step is clear — and you always know what happens next."
      />

      <div
        ref={ref}
        className="grid grid-cols-1 gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        {/* Timeline */}
        <div role="tablist" aria-label="Steps" aria-orientation="vertical" className="relative flex flex-col">
          {STEPS.map((step, i) => {
            const selected = i === active;
            const done = i < active;
            return (
              <div key={step.title} className="relative flex gap-4 pb-3 last:pb-0 sm:gap-5">
                {/* Connector */}
                {i < STEPS.length - 1 ? (
                  <span className="absolute top-[3.25rem] -bottom-3 left-8 w-px bg-border sm:top-[3.75rem] sm:left-[2.375rem]" aria-hidden>
                    <motion.span
                      className="absolute inset-x-0 top-0 origin-top bg-primary"
                      initial={false}
                      animate={{ scaleY: done ? 1 : 0 }}
                      transition={{ duration: 0.5, ease: EASE }}
                      style={{ height: "100%" }}
                    />
                  </span>
                ) : null}

                <button
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`step-tab-${i}`}
                  aria-selected={selected}
                  aria-controls="step-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => choose(i)}
                  onKeyDown={(e) => onKey(e, i)}
                  className={cn(
                    "group relative flex w-full items-start gap-4 rounded-3xl border p-3 text-left transition-all duration-300 sm:gap-5 sm:p-4",
                    selected
                      ? "border-primary/30 bg-card shadow-soft"
                      : "border-transparent hover:border-border hover:bg-card/60",
                  )}
                >
                  <span className="relative shrink-0">
                    <span
                      className={cn(
                        "relative z-10 grid size-10 place-items-center rounded-2xl transition-all duration-300 sm:size-11",
                        selected
                          ? "bg-primary text-primary-foreground shadow-[0_10px_24px_-10px_rgb(112_71_235/0.9)]"
                          : done
                            ? "bg-secondary text-secondary-foreground"
                            : "border bg-card text-muted-foreground",
                      )}
                    >
                      {done ? <Check className="size-5" strokeWidth={2.5} aria-hidden /> : <step.icon className="size-5" aria-hidden />}
                    </span>
                  </span>

                  <span className="min-w-0 flex-1 pt-0.5">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "font-heading text-xs font-bold tabular-nums",
                          selected ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        0{i + 1}
                      </span>
                      <span className="text-base font-bold sm:text-lg">{step.title}</span>
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{step.body}</span>

                    {/* Autoplay progress */}
                    <span className="mt-3 block h-0.5 overflow-hidden rounded-full bg-transparent" aria-hidden>
                      {selected ? (
                        <motion.span
                          key={`${active}-${playing}`}
                          className="block h-full origin-left rounded-full bg-primary/70"
                          initial={{ scaleX: playing ? 0 : 1, opacity: playing ? 1 : 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: playing ? STEP_MS / 1000 : 0, ease: "linear" }}
                        />
                      ) : null}
                    </span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Stage */}
        <div
          id="step-panel"
          role="tabpanel"
          aria-labelledby={`step-tab-${active}`}
          className="relative isolate min-h-[23rem] overflow-hidden rounded-[2rem] border bg-card p-5 shadow-float sm:min-h-[26rem] sm:p-8"
        >
          <div className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-50 [mask-image:radial-gradient(ellipse_at_center,#000_30%,transparent_75%)]" aria-hidden />
          <div className="pointer-events-none absolute -top-24 -right-24 -z-10 size-72 rounded-full bg-primary/15 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-24 -left-16 -z-10 size-60 rounded-full bg-lime/25 blur-3xl dark:bg-lime/10" aria-hidden />

          <div className="flex items-center justify-between">
            <span className="font-heading text-sm font-bold">
              Step {active + 1} <span className="text-muted-foreground">/ {STEPS.length}</span>
            </span>
            <span className="rounded-full border border-dashed border-primary/40 px-2.5 py-1 text-[0.65rem] font-semibold tracking-wide text-secondary-foreground uppercase">
              Preview
            </span>
          </div>

          <div className="mt-6 grid place-items-center sm:mt-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="w-full max-w-md"
                aria-hidden
              >
                <Visual />
              </motion.div>
            </AnimatePresence>
            <p className="sr-only">
              Step {active + 1}: {STEPS[active].title}. {STEPS[active].body}
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step visuals — decorative mini interfaces                                 */
/* -------------------------------------------------------------------------- */

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border bg-background p-4 shadow-soft", className)}>{children}</div>;
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[0.68rem] font-semibold text-muted-foreground">{label}</p>
      <div className={cn("mt-1 flex h-9 items-center rounded-lg border bg-card px-3 text-xs", mono && "font-mono tracking-widest")}>
        {value}
      </div>
    </div>
  );
}

function AccountVisual() {
  return (
    <div className="relative">
      <Panel className="space-y-3">
        <p className="font-heading text-sm font-bold">Create your account</p>
        <Field label="Email" value={<span className="text-muted-foreground">you@company.com</span>} />
        <Field label="Password" value="••••••••••" mono />
        <div className="flex h-10 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          Create account
        </div>
      </Panel>
      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.35, duration: 0.4, ease: EASE }}
        className="absolute -right-3 -bottom-5 flex items-center gap-2 rounded-full border bg-card px-3 py-2 shadow-float sm:-right-8"
      >
        <span className="grid size-5 place-items-center rounded-full bg-ok-soft text-ok">
          <Check className="size-3" strokeWidth={3} />
        </span>
        <span className="text-xs font-semibold">Dashboard ready</span>
      </motion.div>
    </div>
  );
}

function FundsVisual() {
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl bg-graphite p-5 text-white shadow-float">
        <div className="pointer-events-none absolute -right-10 -bottom-14 size-40 rounded-full bg-primary/60 blur-3xl" />
        <p className="relative flex items-center gap-2 text-xs text-white/60">
          <Wallet className="size-4 text-lime" /> Account balance
        </p>
        <p className="relative mt-2 font-heading text-2xl font-extrabold">Your funds</p>
        <p className="relative mt-1 text-xs text-white/60">Amount chosen by you at top-up</p>
      </div>
      <Panel>
        <p className="text-[0.68rem] font-semibold text-muted-foreground">Supported methods</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            { icon: CreditCard, label: "Card" },
            { icon: Landmark, label: "Bank" },
            { icon: Wallet, label: "Wallet" },
          ].map((m, i) => (
            <div
              key={m.label}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border py-2.5 text-[0.7rem] font-semibold",
                i === 0 ? "border-primary/50 bg-secondary text-secondary-foreground" : "bg-card",
              )}
            >
              <m.icon className="size-4" />
              {m.label}
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
          <Lock className="size-3" /> Secure, encrypted checkout
        </p>
      </Panel>
    </div>
  );
}

function OrderVisual() {
  const picks = ["instagram-followers", "tiktok-video-views"].map((id) => SERVICE_BY_ID[id]);
  return (
    <Panel className="space-y-3">
      <div className="flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-xs">
        <Search className="size-3.5 text-muted-foreground" />
        <span>followers</span>
        <span className="ml-0.5 h-3.5 w-px animate-pulse bg-primary" />
      </div>
      <ul className="space-y-2">
        {picks.map((s, i) => {
          const p = PLATFORM_BY_ID[s.platformId];
          return (
            <li
              key={s.id}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border p-2.5",
                i === 0 ? "border-primary/50 bg-secondary/60" : "bg-card",
              )}
            >
              <PlatformTile platform={p} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{s.name}</span>
                <span className="block text-[0.68rem] text-muted-foreground">{CATEGORY_META[s.category].label}</span>
              </span>
              {i === 0 ? (
                <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3" strokeWidth={3} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between rounded-xl bg-graphite px-3.5 py-2.5 text-white">
        <span className="text-xs text-white/70">Review & confirm</span>
        <span className="rounded-full bg-lime px-3 py-1 text-[0.7rem] font-bold text-graphite">Confirm order</span>
      </div>
    </Panel>
  );
}

function TrackVisual() {
  const milestones = ["Order placed", "Payment confirmed", "Details reviewed", "Completed"];
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <p className="font-mono text-[0.68rem] text-muted-foreground">#SV-0000</p>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-semibold text-secondary-foreground">
          In progress
        </span>
      </div>
      <ol className="mt-3">
        {milestones.map((m, i) => {
          const done = i < 3;
          return (
            <li key={m} className="relative flex items-center gap-3 pb-3.5 last:pb-0">
              {i < milestones.length - 1 ? (
                <span className={cn("absolute top-6 bottom-0 left-[0.6rem] w-px", done ? "bg-primary" : "bg-border")} />
              ) : null}
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.12, duration: 0.3 }}
                className={cn(
                  "relative z-10 grid size-5 shrink-0 place-items-center rounded-full",
                  done ? "bg-primary text-primary-foreground" : "border bg-card",
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : null}
              </motion.span>
              <span className={cn("text-xs font-semibold", !done && "text-muted-foreground")}>{m}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 flex items-center gap-1.5 border-t border-dashed pt-3 text-[0.68rem] text-muted-foreground">
        <ShieldCheck className="size-3.5 text-primary" /> Each step updates only once it&apos;s confirmed
      </p>
    </Panel>
  );
}
