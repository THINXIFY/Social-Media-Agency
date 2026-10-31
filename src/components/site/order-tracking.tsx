"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  ArrowRight,
  BellRing,
  Check,
  CircleDashed,
  FileQuestion,
  History,
  Loader2,
  MessageSquare,
  PencilLine,
  type LucideIcon,
} from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { usePreview } from "@/components/providers";
import { Reveal, SampleTag, Section, SectionHeading } from "@/components/site/primitives";
import { cn } from "@/lib/utils";
import { PLATFORM_BY_ID } from "@/lib/catalog";

const EASE = [0.22, 1, 0.36, 1] as const;

type MilestoneState = "done" | "current" | "attention" | "pending";
type Tone = "progress" | "attention" | "done";

interface ExampleOrder {
  key: string;
  id: string;
  service: string;
  platformId: string;
  tone: Tone;
  states: MilestoneState[];
  now: { title: string; body: string; action?: string };
  log: { time: string; text: string }[];
}

const MILESTONES = [
  { label: "Placed", detail: "Order and configuration received" },
  { label: "Paid", detail: "Payment confirmed" },
  { label: "Verified", detail: "Links and details checked" },
  { label: "In delivery", detail: "Order is being fulfilled" },
  { label: "Completed", detail: "Final summary shared" },
];

const ORDERS: ExampleOrder[] = [
  {
    key: "progress",
    id: "SV-EX-1042",
    service: "Instagram Followers",
    platformId: "instagram",
    tone: "progress",
    states: ["done", "done", "done", "current", "pending"],
    now: {
      title: "Delivery in progress",
      body: "This step updates as soon as delivery is confirmed — you'll get a notification when it does.",
    },
    log: [
      { time: "Day 2 · 10:40", text: "Delivery started" },
      { time: "Day 1 · 16:05", text: "Profile link verified" },
      { time: "Day 1 · 09:12", text: "Payment confirmed" },
      { time: "Day 1 · 09:10", text: "Order placed" },
    ],
  },
  {
    key: "attention",
    id: "SV-EX-1043",
    service: "YouTube Video Views",
    platformId: "youtube",
    tone: "attention",
    states: ["done", "done", "attention", "pending", "pending"],
    now: {
      title: "We need a working video link",
      body: "The link provided is private or unavailable. Update it and the order continues automatically.",
      action: "Update link",
    },
    log: [
      { time: "Day 1 · 14:22", text: "Video link could not be verified" },
      { time: "Day 1 · 11:03", text: "Payment confirmed" },
      { time: "Day 1 · 11:01", text: "Order placed" },
    ],
  },
  {
    key: "done",
    id: "SV-EX-1039",
    service: "TikTok Advertising Campaigns",
    platformId: "tiktok",
    tone: "done",
    states: ["done", "done", "done", "done", "done"],
    now: {
      title: "Order completed",
      body: "Your final summary is ready in the dashboard, alongside the full activity log.",
      action: "View summary",
    },
    log: [
      { time: "Day 15 · 09:00", text: "Final summary shared" },
      { time: "Day 14 · 23:59", text: "Campaign ended on schedule" },
      { time: "Day 2 · 08:30", text: "Campaign approved by TikTok" },
      { time: "Day 1 · 12:44", text: "Order placed and paid" },
    ],
  },
];

const TONES: Record<Tone, { label: string; pill: string; dot: string; soft: string }> = {
  progress: {
    label: "In progress",
    pill: "bg-secondary text-secondary-foreground",
    dot: "bg-primary",
    soft: "from-primary/10",
  },
  attention: {
    label: "Action needed",
    pill: "bg-soon-soft text-soon",
    dot: "bg-soon",
    soft: "from-soon/12",
  },
  done: {
    label: "Completed",
    pill: "bg-ok-soft text-ok",
    dot: "bg-ok",
    soft: "from-ok/12",
  },
};

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Check, title: "Confirmed milestones", body: "Steps update only when they're verified." },
  { icon: History, title: "Complete activity log", body: "Every change, timestamped." },
  { icon: BellRing, title: "Proactive updates", body: "Notified when something needs you." },
];

export function OrderTracking() {
  const [active, setActive] = React.useState(0);
  const order = ORDERS[active];
  const tone = TONES[order.tone];
  const platform = PLATFORM_BY_ID[order.platformId];
  const preview = usePreview();
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const confirmed = order.states.filter((s) => s === "done").length;
  const currentIndex = order.states.findIndex((s) => s === "current" || s === "attention");
  const fill = currentIndex === -1 ? 1 : currentIndex / (MILESTONES.length - 1);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const dir = ["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + ORDERS.length) % ORDERS.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const openSupport = (label: string) =>
    preview({
      title: `${label} — preview`,
      description: "Order actions and support open with customer accounts in the next build phase.",
    });

  return (
    <Section id="order-tracking" className="border-t">
      <SectionHeading
        eyebrow="Order tracking"
        title={
          <>
            Know exactly where <span className="text-primary">every order</span> stands.
          </>
        }
        description="Clear milestones, a complete activity log and support built into every order — so you always know what's happening and what comes next."
      />

      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] border bg-card shadow-float">
          <div className="grid grid-cols-1 lg:grid-cols-[19rem_minmax(0,1fr)]">
            {/* Order selector */}
            <div className="flex min-w-0 flex-col border-b bg-subtle/70 p-3 lg:border-r lg:border-b-0 lg:p-4">
              <div className="flex items-center justify-between px-1 pb-2 lg:pb-3">
                <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Your orders</p>
                <SampleTag className="px-2 py-0.5 text-[0.6rem]">Examples</SampleTag>
              </div>
              <div
                role="tablist"
                aria-label="Example orders"
                className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0"
              >
                {ORDERS.map((o, i) => {
                  const p = PLATFORM_BY_ID[o.platformId];
                  const t = TONES[o.tone];
                  const selected = i === active;
                  return (
                    <button
                      key={o.key}
                      ref={(el) => {
                        tabRefs.current[i] = el;
                      }}
                      role="tab"
                      id={`order-tab-${o.key}`}
                      aria-selected={selected}
                      aria-controls="order-panel"
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setActive(i)}
                      onKeyDown={(e) => onKey(e, i)}
                      className={cn(
                        "group relative flex w-[15.5rem] shrink-0 items-center gap-3 rounded-2xl p-3 text-left transition-colors lg:w-full",
                        selected ? "text-foreground" : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
                      )}
                    >
                      {selected ? (
                        <motion.span
                          layoutId="order-selected"
                          className="absolute inset-0 rounded-2xl bg-card shadow-soft ring-1 ring-border"
                          transition={{ type: "spring", stiffness: 380, damping: 34 }}
                        />
                      ) : null}
                      <PlatformTile platform={p} size="sm" className="relative" />
                      <span className="relative min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">{o.service}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs">
                          <span className={cn("size-1.5 rounded-full", t.dot)} aria-hidden />
                          {t.label}
                          <span className="text-muted-foreground/70">·</span>
                          <span className="font-mono text-[0.68rem] text-muted-foreground">{o.id}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <ul className="mt-auto hidden space-y-4 border-t px-2 pt-6 lg:block">
                {FEATURES.map((f) => (
                  <li key={f.title} className="flex gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-card text-primary shadow-soft ring-1 ring-border">
                      <f.icon className="size-4" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{f.title}</span>
                      <span className="block text-xs leading-relaxed text-muted-foreground">{f.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tracking panel */}
            <div
              id="order-panel"
              role="tabpanel"
              aria-labelledby={`order-tab-${order.key}`}
              className="relative min-w-0 p-5 sm:p-8"
            >
              <div
                className={cn(
                  "pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b to-transparent transition-colors duration-500",
                  tone.soft,
                )}
                aria-hidden
              />

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={order.key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="relative"
                >
                  {/* Header */}
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3.5">
                      <PlatformTile platform={platform} size="md" />
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-muted-foreground">Order {order.id}</p>
                        <h3 className="truncate text-lg font-bold sm:text-xl">{order.service}</h3>
                      </div>
                    </div>
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", tone.pill)}>
                      <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden />
                      {tone.label}
                    </span>
                  </div>

                  {/* Stepper */}
                  <div className="mt-8">
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                      <p className="text-sm font-semibold">
                        {confirmed} of {MILESTONES.length} milestones confirmed
                      </p>
                      <p className="text-xs text-muted-foreground">Illustrative example · not a live order</p>
                    </div>

                    <ol className="relative mt-5 grid grid-cols-5" aria-label="Milestones">
                      <span className="absolute top-[0.9rem] right-[10%] left-[10%] h-0.5 rounded-full bg-border" aria-hidden>
                        <motion.span
                          className="absolute inset-y-0 left-0 rounded-full bg-primary"
                          initial={{ width: 0 }}
                          animate={{ width: `${fill * 100}%` }}
                          transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
                        />
                      </span>
                      {MILESTONES.map((m, i) => {
                        const state = order.states[i];
                        return (
                          <li key={m.label} className="relative flex flex-col items-center text-center">
                            <MilestoneNode state={state} delay={0.1 + i * 0.07} />
                            <span
                              className={cn(
                                "mt-2.5 text-[0.7rem] font-semibold sm:text-xs",
                                state === "pending" ? "text-muted-foreground" : "text-foreground",
                                state === "attention" && "text-soon",
                              )}
                            >
                              {m.label}
                            </span>
                            <span className="mt-0.5 hidden max-w-[8rem] text-[0.68rem] leading-snug text-muted-foreground md:block">
                              {m.detail}
                            </span>
                            <span className="sr-only">— {state}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>

                  {/* Now + log */}
                  <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] md:gap-8">
                    <div
                      className={cn(
                        "rounded-2xl p-5",
                        order.tone === "attention" ? "bg-soon-soft" : order.tone === "done" ? "bg-ok-soft" : "bg-secondary/70",
                      )}
                    >
                      <p className="text-[0.68rem] font-bold tracking-wider text-muted-foreground uppercase">Right now</p>
                      <p
                        className={cn(
                          "mt-2 font-heading text-base font-bold",
                          order.tone === "attention" && "text-soon",
                          order.tone === "done" && "text-ok",
                        )}
                      >
                        {order.now.title}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{order.now.body}</p>
                      {order.now.action ? (
                        <button
                          type="button"
                          onClick={() => openSupport(order.now.action!)}
                          className="group mt-4 inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-1.5 text-xs font-semibold shadow-soft transition-transform hover:-translate-y-px"
                        >
                          {order.now.action}
                          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </button>
                      ) : null}
                    </div>

                    <div>
                      <p className="flex items-center gap-2 text-[0.68rem] font-bold tracking-wider text-muted-foreground uppercase">
                        <History className="size-3.5" aria-hidden /> Activity log
                      </p>
                      <ol className="mt-4">
                        {order.log.map((entry, i) => (
                          <motion.li
                            key={entry.text}
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3, delay: 0.15 + i * 0.06 }}
                            className="relative flex gap-3 pb-4 last:pb-0"
                          >
                            {i < order.log.length - 1 ? (
                              <span className="absolute top-3 bottom-0 left-[0.2rem] w-px bg-border" aria-hidden />
                            ) : null}
                            <span
                              className={cn(
                                "relative mt-1.5 size-2 shrink-0 rounded-full",
                                i === 0 ? tone.dot : "bg-muted-foreground/40",
                              )}
                              aria-hidden
                            />
                            <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
                              <span className={cn("text-sm", i === 0 ? "font-semibold" : "text-muted-foreground")}>
                                {entry.text}
                              </span>
                              <span className="font-mono text-[0.68rem] text-muted-foreground">{entry.time}</span>
                            </span>
                          </motion.li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Support */}
              <div className="relative mt-8 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Questions about this order? <span className="font-semibold text-foreground">Support sees the full history.</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { icon: MessageSquare, label: "Message support" },
                    { icon: PencilLine, label: "Request a change" },
                    { icon: FileQuestion, label: "Order FAQ" },
                  ].map(({ icon: Icon, label }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => openSupport(label)}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground"
                    >
                      <Icon className="size-3.5" aria-hidden /> {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

function MilestoneNode({ state, delay }: { state: MilestoneState; delay: number }) {
  const base = "relative z-10 grid size-7 place-items-center rounded-full ring-4 ring-card";
  const content =
    state === "done" ? (
      <span className={cn(base, "bg-primary text-primary-foreground")}>
        <Check className="size-3.5" strokeWidth={3} aria-hidden />
      </span>
    ) : state === "current" ? (
      <span className={cn(base, "bg-card text-primary shadow-[0_0_0_2px_var(--color-primary)]")}>
        <Loader2 className="size-3.5 animate-spin [animation-duration:2.4s]" aria-hidden />
      </span>
    ) : state === "attention" ? (
      <span className={cn(base, "bg-soon text-white dark:text-graphite")}>
        <AlertCircle className="size-3.5" aria-hidden />
      </span>
    ) : (
      <span className={cn(base, "border bg-card text-muted-foreground/60")}>
        <CircleDashed className="size-3.5" aria-hidden />
      </span>
    );
  return (
    <motion.span
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, delay, ease: EASE }}
    >
      {content}
    </motion.span>
  );
}
