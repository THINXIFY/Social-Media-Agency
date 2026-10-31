"use client";

import * as React from "react";
import { CalendarDays, Copy, Film, GalleryHorizontalEnd, Lock, MessageCircleQuestion, Sparkles } from "lucide-react";
import { AI_TOOL_BY_ID } from "@/lib/ai/registry";
import { cn } from "@/lib/utils";
import { AI_ICONS } from "./parts";

/*
 * Hero preview: one Content Studio card that demonstrates the four tools.
 *
 * - Each tool's brief and result layout is server-rendered and stacked in the
 *   same grid cell; the active one crossfades in. The card's height is the
 *   tallest layer, so rotation never shifts layout, and all text is in the
 *   initial HTML.
 * - The rotation is driven by the countdown bar inside the sliding tab
 *   indicator (a CSS animation): its `animationend` moves to the next tool.
 *   Pausing that animation — on hover, keyboard focus, offscreen or a hidden
 *   tab — pauses the rotation exactly where it is. Reduced motion: no
 *   rotation, no countdown; tabs still switch manually.
 * - Result content is a short, human-written illustration of each layout,
 *   labelled as such. It is not AI output and makes no performance claims.
 */

const CYCLE_MS = 6000;

const FLOWS = [
  { id: "caption-generator", label: "Captions", brief: "Launching our autumn coffee menu — warm and playful.", platforms: ["Instagram", "TikTok"], tone: "Playful" },
  { id: "hashtag-finder", label: "Hashtags", brief: "Vegan meal prep for busy parents on a budget.", platforms: ["Instagram", "Pinterest"], tone: "Friendly" },
  { id: "post-ideas", label: "Post ideas", brief: "A bike repair shop that wants more local regulars.", platforms: ["Facebook", "Instagram"], tone: "Friendly" },
  { id: "content-calendar", label: "Calendar", brief: "A new skincare brand posting three times a week.", platforms: ["TikTok", "Instagram"], tone: "Inspirational" },
].map((f) => ({ ...f, tool: AI_TOOL_BY_ID[f.id] }));

/** A stacked layer: shares the grid cell; only the active one is visible and announced. */
const layer = (on: boolean) => cn("col-start-1 row-start-1 transition-[opacity,visibility] duration-500 ease-out motion-reduce:transition-none", on ? "visible opacity-100" : "invisible opacity-0");

/** Items inside the active layer settle in with a short stagger. */
function Item({ on, i, className, children }: { on: boolean; i: number; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none", on ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0", className)} style={{ transitionDelay: on ? `${120 + i * 70}ms` : "0ms" }}>
      {children}
    </div>
  );
}

/* ── Illustrative result layouts (human-written examples, not generated) ── */

function CaptionsPreview({ on }: { on: boolean }) {
  const options = [
    { angle: "Story-led", text: "Autumn just walked in and ordered a cinnamon oat latte. 🍂", accent: "bg-primary" },
    { angle: "Question-led", text: "Pumpkin spice or maple pecan — what's your autumn order?", accent: "bg-[#a48bff]" },
    { angle: "Benefit-led", text: "Warm drinks, quiet corners, fast wifi. Your new study spot.", accent: "bg-lime" },
  ];
  return (
    <div className="space-y-2">
      {options.map((o, i) => (
        <Item key={o.angle} on={on} i={i}>
          <div className="flex items-center gap-3 rounded-xl border bg-card py-2.5 pr-2.5 pl-3 shadow-[0_1px_2px_rgb(32_33_39/0.04)]">
            <span className={cn("h-8 w-1 shrink-0 rounded-full", o.accent)} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[0.68rem] font-semibold text-muted-foreground">
                Option {i + 1} · {o.angle}
              </p>
              <p className="truncate text-[0.82rem] leading-snug text-foreground/90">{o.text}</p>
            </div>
            <span className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground" aria-hidden>
              <Copy className="size-3.5" />
            </span>
          </div>
        </Item>
      ))}
    </div>
  );
}

function HashtagsPreview({ on }: { on: boolean }) {
  const groups = [
    { name: "Broad", tags: ["#vegan", "#mealprep", "#plantbased"] },
    { name: "Niche", tags: ["#veganparents", "#batchcooking", "#budgetmeals"] },
  ];
  return (
    <div className="space-y-3">
      {groups.map((g, i) => (
        <Item key={g.name} on={on} i={i}>
          <p className="text-[0.68rem] font-semibold tracking-wide text-muted-foreground uppercase">{g.name}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {g.tags.map((t) => (
              <span key={t} className="rounded-full border bg-card px-2.5 py-1 text-[0.78rem] font-medium text-primary shadow-[0_1px_2px_rgb(32_33_39/0.04)] dark:text-[#c9bcff]">
                {t}
              </span>
            ))}
          </div>
        </Item>
      ))}
      <Item on={on} i={2}>
        <p className="text-[0.68rem] font-semibold tracking-wide text-muted-foreground uppercase">Keywords</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {["cheap vegan lunches", "family meal prep"].map((k) => (
            <span key={k} className="rounded-lg bg-lime/35 px-2.5 py-1 text-[0.78rem] font-medium text-graphite dark:bg-lime/15 dark:text-lime">
              {k}
            </span>
          ))}
        </div>
      </Item>
    </div>
  );
}

function IdeasPreview({ on }: { on: boolean }) {
  const ideas = [
    { format: "Reel", Icon: Film, title: "Puncture fixed in 60 seconds", hook: "Most flats start the same way…" },
    { format: "Carousel", Icon: GalleryHorizontalEnd, title: "Meet the mechanic", hook: "Twenty years of fixing bikes" },
    { format: "Poll", Icon: MessageCircleQuestion, title: "Road or gravel?", hook: "Settle it in the comments" },
    { format: "Story", Icon: CalendarDays, title: "Spring tune-up week", hook: "Book a slot this weekend" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {ideas.map((d, i) => (
        <Item key={d.title} on={on} i={i}>
          <div className="h-full rounded-xl border bg-card p-2.5 shadow-[0_1px_2px_rgb(32_33_39/0.04)]">
            <p className="inline-flex items-center gap-1 rounded-md bg-primary/[0.08] px-1.5 py-0.5 text-[0.68rem] font-semibold text-primary dark:bg-primary/20 dark:text-[#c9bcff]">
              <d.Icon className="size-3" aria-hidden /> {d.format}
            </p>
            <p className="mt-1.5 text-[0.8rem] leading-snug font-semibold">{d.title}</p>
            <p className="mt-0.5 truncate text-[0.72rem] text-muted-foreground">{d.hook}</p>
          </div>
        </Item>
      ))}
    </div>
  );
}

function CalendarPreview({ on }: { on: boolean }) {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const planned = new Set([0, 2, 4]);
  const posts = [
    { day: "Mon", format: "Reel", topic: "Meet the founder", dot: "bg-primary" },
    { day: "Wed", format: "Carousel", topic: "Ingredients, explained", dot: "bg-[#a48bff]" },
    { day: "Fri", format: "Story", topic: "Your skincare questions", dot: "bg-lime" },
  ];
  return (
    <div>
      <Item on={on} i={0}>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d, i) => (
            <div key={i} className={cn("flex flex-col items-center gap-1 rounded-lg border py-1.5", i === 0 ? "border-primary/40 bg-primary text-primary-foreground shadow-[0_6px_14px_-8px_rgb(112_71_235/0.9)]" : "bg-card")}>
              <span className={cn("text-[0.64rem] font-semibold", i === 0 ? "text-primary-foreground/80" : "text-muted-foreground")}>{d}</span>
              <span className="text-[0.8rem] leading-none font-bold tabular-nums">{i + 1}</span>
              <span className={cn("size-1 rounded-full", planned.has(i) ? (i === 0 ? "bg-lime" : "bg-primary") : "bg-transparent")} aria-hidden />
            </div>
          ))}
        </div>
      </Item>
      <div className="mt-2 space-y-1.5">
        {posts.map((p, i) => (
          <Item key={p.day} on={on} i={i + 1}>
            <div className="flex items-center gap-2.5 rounded-lg border bg-card px-2.5 py-1.5 shadow-[0_1px_2px_rgb(32_33_39/0.04)]">
              <span className={cn("size-1.5 shrink-0 rounded-full", p.dot)} aria-hidden />
              <span className="w-8 shrink-0 text-[0.72rem] font-semibold text-muted-foreground">{p.day}</span>
              <span className="shrink-0 text-[0.72rem] font-medium text-primary dark:text-[#c9bcff]">{p.format}</span>
              <span className="truncate text-[0.8rem]">{p.topic}</span>
            </div>
          </Item>
        ))}
      </div>
    </div>
  );
}

const PREVIEWS: Record<string, (p: { on: boolean }) => React.ReactNode> = {
  "caption-generator": CaptionsPreview,
  "hashtag-finder": HashtagsPreview,
  "post-ideas": IdeasPreview,
  "content-calendar": CalendarPreview,
};

export function AiHeroVisual() {
  const [index, setIndex] = React.useState(0);
  const [round, setRound] = React.useState(0); // restarts the countdown after a manual choice
  const [hold, setHold] = React.useState({ hover: false, focus: false, offscreen: false, hidden: false });
  const [auto, setAuto] = React.useState(false); // false until we know motion is allowed (stable hydration)
  const figureRef = React.useRef<HTMLElement>(null);
  const glowRef = React.useRef<HTMLDivElement>(null);
  const tabs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const paused = !auto || hold.hover || hold.focus || hold.offscreen || hold.hidden;

  // Motion preference, page visibility and offscreen state — all cleaned up.
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setAuto(!mq.matches);
    onMotion();
    mq.addEventListener("change", onMotion);
    const onVisibility = () => setHold((h) => ({ ...h, hidden: document.visibilityState !== "visible" }));
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    const io = new IntersectionObserver(([e]) => setHold((h) => ({ ...h, offscreen: !e.isIntersecting })), { threshold: 0.2 });
    if (figureRef.current) io.observe(figureRef.current);
    return () => {
      mq.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
      io.disconnect();
    };
  }, []);

  const select = (i: number) => {
    setIndex(i);
    setRound((r) => r + 1);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (index + (e.key === "ArrowRight" ? 1 : FLOWS.length - 1)) % FLOWS.length;
    select(next);
    tabs.current[next]?.focus();
  };

  // Minimal depth on desktop pointers: the glow follows the cursor a little, via a CSS variable (no re-renders).
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !auto || !glowRef.current || !figureRef.current) return;
    const r = figureRef.current.getBoundingClientRect();
    glowRef.current.style.setProperty("--gx", `${((e.clientX - r.left) / r.width - 0.5) * 24}px`);
    glowRef.current.style.setProperty("--gy", `${((e.clientY - r.top) / r.height - 0.5) * 18}px`);
  };

  return (
    <figure
      ref={figureRef}
      data-cycle={paused ? "paused" : "running"}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHold((h) => ({ ...h, hover: true }))}
      onPointerLeave={() => setHold((h) => ({ ...h, hover: false }))}
      onPointerMove={onPointerMove}
      onFocus={() => setHold((h) => ({ ...h, focus: true }))}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold((h) => ({ ...h, focus: false }));
      }}
      className="ai-rise relative mx-auto w-full max-w-[30rem] lg:mr-0"
      aria-label="Preview of Sociotix AI's Content Studio tools: example briefs and illustrative result layouts. Nothing is generated."
    >
      <div
        ref={glowRef}
        className="pointer-events-none absolute inset-x-8 -top-6 -bottom-8 -z-10 rounded-[3rem] bg-[radial-gradient(60%_55%_at_60%_35%,rgb(112_71_235/0.22),transparent_75%)] blur-2xl transition-transform duration-700 ease-out [transform:translate3d(var(--gx,0),var(--gy,0),0)] motion-reduce:transition-none dark:bg-[radial-gradient(60%_55%_at_60%_35%,rgb(112_71_235/0.35),transparent_75%)]"
        aria-hidden
      />

      <div className="overflow-hidden rounded-[1.6rem] border bg-card shadow-[0_1px_1px_rgb(32_33_39/0.04),0_2px_6px_-2px_rgb(32_33_39/0.06),0_36px_72px_-40px_rgb(64_38_160/0.5)] ring-1 ring-white/60 ring-inset dark:shadow-[0_36px_72px_-36px_rgb(0_0_0/0.85)] dark:ring-white/[0.04]">
        {/* App header */}
        <div className="flex items-center gap-3 border-b bg-subtle/50 px-4 py-3 sm:px-5 dark:bg-white/[0.02]">
          <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-[0.7rem] bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_6px_14px_-8px_rgb(112_71_235/0.9)]" aria-hidden>
            {FLOWS.map((f, i) => {
              const Icon = AI_ICONS[f.tool.icon];
              return <Icon key={f.id} className={cn("absolute size-[1.05rem] transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none", i === index ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0")} />;
            })}
          </span>
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)]">
            {FLOWS.map((f, i) => (
              <div key={f.id} className={layer(i === index)} aria-hidden={i !== index}>
                <p className="truncate font-heading text-[0.98rem] leading-tight font-bold">{f.tool.name.replace(/^AI /, "")}</p>
                <p className="truncate text-[0.72rem] text-muted-foreground">Content Studio</p>
              </div>
            ))}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-[0.68rem] font-semibold text-muted-foreground">
            <Lock className="size-3" aria-hidden /> <span className="max-[359px]:sr-only">Preview</span>
          </span>
        </div>

        {/* Example brief: compact input-like card */}
        <div className="px-4 pt-4 sm:px-5">
          <div className="rounded-xl border bg-subtle/60 px-3.5 py-3 dark:bg-white/[0.025]">
            <p className="text-[0.66rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Example brief</p>
            <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)]">
              {FLOWS.map((f, i) => (
                <div key={f.id} className={layer(i === index)} aria-hidden={i !== index}>
                  <p className="text-[0.92rem] leading-snug text-foreground">{f.brief}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {f.platforms.map((p) => (
                      <span key={p} className="rounded-full bg-primary/[0.08] px-2 py-0.5 text-[0.7rem] font-medium text-primary dark:bg-primary/20 dark:text-[#c9bcff]">
                        {p}
                      </span>
                    ))}
                    <span className="rounded-full bg-card px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground ring-1 ring-border">{f.tone} tone</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Results: illustrative layout per tool */}
        <div className="px-4 pt-4 pb-4 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-[0.72rem] font-semibold">
              <Sparkles className="size-3.5 text-primary" aria-hidden /> Results
            </p>
            <span className="text-[0.66rem] font-medium text-muted-foreground">Illustrative example</span>
          </div>
          <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)]">
            {FLOWS.map((f, i) => {
              const Preview = PREVIEWS[f.id];
              return (
                <div key={f.id} className={layer(i === index)} aria-hidden={i !== index}>
                  <Preview on={i === index} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Tool switcher with one sliding indicator that carries the countdown */}
        <div className="border-t bg-subtle/60 px-2 pt-2 pb-3 dark:bg-white/[0.02]">
          <div role="tablist" aria-label="Preview a Content Studio tool" className="relative grid grid-cols-4 gap-1" onKeyDown={onKey}>
            <span
              className="pointer-events-none absolute inset-y-0 left-0 w-[calc((100%-0.75rem)/4)] overflow-hidden rounded-xl bg-card shadow-[0_1px_2px_rgb(32_33_39/0.08),0_8px_20px_-12px_rgb(112_71_235/0.6)] ring-1 ring-border transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] [transform:translateX(calc(var(--i)*(100%+0.25rem)))] motion-reduce:transition-none dark:shadow-[0_8px_20px_-12px_rgb(112_71_235/0.85)]"
              style={{ "--i": index } as React.CSSProperties}
              aria-hidden
            >
              {auto ? (
                <span
                  key={`${index}-${round}`}
                  className="ai-cycle absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-primary/70"
                  style={{ "--ai-cycle": `${CYCLE_MS}ms` } as React.CSSProperties}
                  onAnimationEnd={() => setIndex((x) => (x + 1) % FLOWS.length)}
                />
              ) : null}
            </span>
            {FLOWS.map((f, i) => {
              const TabIcon = AI_ICONS[f.tool.icon];
              const on = i === index;
              return (
                <button
                  key={f.id}
                  ref={(el) => {
                    tabs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-label={`${f.label}: ${f.tool.name}`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => select(i)}
                  className={cn(
                    "relative z-10 flex h-10 items-center justify-center gap-1.5 rounded-xl text-[0.78rem] font-semibold transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:outline-none motion-reduce:transition-none",
                    on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <TabIcon className={cn("size-4 shrink-0 transition-colors duration-300", on && "text-primary")} aria-hidden />
                  <span className="hidden min-[400px]:inline">{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </figure>
  );
}
