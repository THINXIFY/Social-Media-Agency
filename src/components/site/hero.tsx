"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import {
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  CircleDollarSign,
  Hash,
  Link2,
  Pause,
  Play,
  Search,
  Sparkles,
  Wallet,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PlatformIcon, PlatformTile } from "@/components/brand";
import { useCatalogFilters } from "@/components/providers";
import { cn } from "@/lib/utils";
import {
  CATALOG_TOTALS,
  CATEGORY_META,
  PLATFORMS,
  PLATFORM_BY_ID,
  SERVICE_BY_ID,
  isQuantityBased,
} from "@/lib/catalog";

const EASE = [0.22, 1, 0.36, 1] as const;

const QUICK_SEARCHES = ["Instagram Followers", "TikTok Views", "YouTube Subscribers", "Facebook Likes", "Website Traffic"];

/** Services the order preview cycles through, with an example target link. */
const DEMO = [
  { id: "instagram-followers", link: "instagram.com/yourbrand" },
  { id: "youtube-video-views", link: "youtube.com/watch?v=your-video" },
  { id: "tiktok-video-likes", link: "tiktok.com/@yourbrand/video" },
  { id: "whatsapp-channel-promotion", link: "whatsapp.com/channel/your-channel" },
  { id: "x-followers", link: "x.com/yourbrand" },
  { id: "website-traffic-campaigns", link: "yourwebsite.com/launch" },
].map((d) => ({ ...d, service: SERVICE_BY_ID[d.id] }));

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } },
};
/** The heading and intro are the page's largest paint (LCP): they move in but are never hidden, so they paint with the first HTML (5I-B). */
const text: Variants = {
  hidden: { y: 14 },
  show: { y: 0, transition: { duration: 0.7, ease: EASE } },
};

export function Hero() {
  const { explore } = useCatalogFilters();

  return (
    <section id="top" className="relative isolate overflow-hidden">
      <HeroBackdrop />

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-4 pt-8 pb-16 sm:gap-14 sm:px-6 sm:pt-16 sm:pb-20 lg:grid-cols-[1fr_1.05fr] lg:gap-12 lg:px-8 lg:pt-20 lg:pb-24">
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.a
            variants={item}
            href="#platforms"
            className="group inline-flex items-center gap-2 rounded-full border bg-card/80 py-1 pr-3 pl-1 text-xs font-medium text-muted-foreground shadow-soft backdrop-blur transition-colors hover:border-primary/30 hover:text-foreground"
          >
            <span className="rounded-full bg-graphite px-2 py-0.5 text-[0.7rem] font-semibold text-lime">Catalog</span>
            {CATALOG_TOTALS.platforms} platforms · {CATALOG_TOTALS.services} listed services
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </motion.a>

          <motion.h1
            variants={text}
            className="mt-5 text-[2.6rem] leading-[1.03] font-extrabold sm:mt-6 tracking-[-0.035em] text-balance sm:text-6xl lg:text-[4.3rem]"
          >
            Smarter Social.{" "}
            <span className="relative inline-block text-primary">
              Bigger Impact.
              <svg
                viewBox="0 0 300 18"
                preserveAspectRatio="none"
                className="absolute -bottom-2 left-0 h-3 w-full text-lime sm:-bottom-3 sm:h-4"
                aria-hidden
              >
                <motion.path
                  d="M3 12 C 70 3, 150 3, 297 9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.9, delay: 0.7, ease: EASE }}
                />
              </svg>
            </span>
          </motion.h1>

          <motion.p
            variants={text}
            className="mt-6 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground sm:mt-7 sm:text-lg"
          >
            Discover social media services across all major platforms. Explore solutions, manage orders,
            and track progress—all from one powerful dashboard.
          </motion.p>

          <motion.div variants={item} className="mt-7 grid grid-cols-2 gap-3 sm:mt-9 sm:flex">
            <a
              href="#services"
              className={cn(
                buttonVariants(),
                "btn-shine group h-12 rounded-full px-4 text-[0.95rem] sm:px-6 shadow-[0_10px_30px_-10px_rgb(112_71_235/0.7)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-12px_rgb(112_71_235/0.8)]",
              )}
            >
              Explore Services
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </a>
            <a
              href="#how-it-works"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-12 rounded-full bg-card/80 px-4 text-[0.95rem] backdrop-blur hover:-translate-y-0.5 sm:px-6",
              )}
            >
              How It Works
            </a>
          </motion.div>

          <motion.div variants={item} className="mt-8 sm:mt-9">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Quick searches</p>
            <ul className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              {QUICK_SEARCHES.map((q) => (
                <li key={q} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => explore({ query: q })}
                    className="group inline-flex items-center gap-1.5 rounded-full border bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur transition-all hover:-translate-y-px hover:border-primary/40 hover:text-foreground"
                  >
                    <Search className="size-3 transition-colors group-hover:text-primary" aria-hidden />
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>

        <OrderPreview />
      </div>

      <PlatformMarquee />
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function HeroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="aurora aurora-a top-[-14rem] left-[8%] h-[30rem] w-[38rem] bg-primary/25 dark:bg-primary/30" />
      <div className="aurora aurora-b top-[2rem] right-[-6rem] h-[26rem] w-[30rem] bg-lime/30 dark:bg-lime/10" />
      <div className="aurora aurora-a top-[26rem] left-[40%] h-[22rem] w-[30rem] bg-[#4f7cff]/15 [animation-delay:-9s]" />

      <div className="mask-fade-b absolute inset-0 opacity-70 dark:opacity-45">
        <div className="bg-grid grid-pan absolute -inset-11" />
      </div>

      <div className="beam-x absolute top-[44px] left-0 h-px w-[30vw] bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
      <div className="beam-x absolute top-[352px] left-0 h-px w-[22vw] bg-gradient-to-r from-transparent via-lime to-transparent [animation-delay:-4.5s]" />
      <div className="beam-y absolute top-0 left-[calc(50%+132px)] h-[30vh] w-px bg-gradient-to-b from-transparent via-primary/60 to-transparent" />
    </div>
  );
}

function PlatformMarquee() {
  const row = [...PLATFORMS, ...PLATFORMS];
  return (
    <div className="marquee-wrap mask-fade-x relative border-y bg-card/50 py-4 backdrop-blur-sm">
      <p className="sr-only">Supported platforms: {PLATFORMS.map((p) => p.name).join(", ")}</p>
      <ul className="marquee flex w-max items-center gap-3" aria-hidden>
        {row.map((p, i) => (
          <li
            key={`${p.id}-${i}`}
            className="flex shrink-0 items-center gap-2.5 rounded-full border bg-card px-3 py-1.5 pr-4 shadow-soft"
          >
            <PlatformTile platform={p} size="xs" className="rounded-full" />
            <span className="text-sm font-semibold whitespace-nowrap">{p.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const noopSubscribe = () => () => {};

function OrderPreview() {
  const { explore } = useCatalogFilters();
  const reduce = useReducedMotion();
  const [index, setIndex] = React.useState(0);
  const [autoplay, setAutoplay] = React.useState(true);
  const [hovered, setHovered] = React.useState(false);
  const [query, setQuery] = React.useState("");

  // The reduced-motion preference is only known on the client, so autoplay
  // starts after hydration to keep server and client markup identical.
  const hydrated = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const reduced = hydrated && !!reduce;
  const playing = hydrated && autoplay && !hovered && !reduce;

  React.useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % DEMO.length), 3600);
    return () => window.clearInterval(t);
  }, [playing]);

  const current = DEMO[index];
  const service = current.service;
  const platform = PLATFORM_BY_ID[service.platformId];
  const quantity = isQuantityBased(service.category);

  return (
    <motion.div
      initial={{ opacity: 0, y: 32, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
      style={{ transformPerspective: 1200 }}
      className="relative mx-auto w-full max-w-[36rem] lg:mr-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-primary/20 via-transparent to-lime/20 blur-2xl"
        aria-hidden
      />

      <div className="rounded-[1.75rem] border bg-card/85 p-1.5 shadow-float backdrop-blur-xl">
        {/* App bar */}
        <div className="flex items-center gap-3 px-2.5 py-2 sm:px-3 sm:py-2.5">
          <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
            <rect width="32" height="32" rx="9" fill="#7047EB" />
            <circle cx="22.5" cy="22" r="3" fill="#C8FF52" />
          </svg>
          <form
            role="search"
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-background px-3 focus-within:border-primary/60 focus-within:ring-3 focus-within:ring-primary/15"
            onSubmit={(e) => {
              e.preventDefault();
              explore({ query: query.trim() });
            }}
          >
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <label htmlFor="hero-search" className="sr-only">
              Search services
            </label>
            <input
              id="hero-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${CATALOG_TOTALS.services} services…`}
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/80 sm:text-sm"
            />
            <kbd className="hidden rounded border bg-card px-1.5 text-[0.65rem] text-muted-foreground sm:block">Enter</kbd>
          </form>
          <span className="relative grid size-9 shrink-0 place-items-center rounded-xl border bg-background" aria-hidden>
            <Bell className="size-4 text-muted-foreground" />
            <span className="absolute top-2 right-2 size-1.5 rounded-full bg-primary" />
          </span>
        </div>

        <div className="flex flex-col gap-1.5 sm:flex-row">
          {/* Platform rail */}
          <div
            role="radiogroup"
            aria-label="Preview platform"
            className="flex justify-between gap-1 rounded-[1.25rem] border bg-background/70 p-1.5 sm:flex-col sm:justify-start sm:gap-1.5"
          >
            {DEMO.map((d, i) => {
              const p = PLATFORM_BY_ID[d.service.platformId];
              const active = i === index;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={p.name}
                  onClick={() => {
                    setIndex(i);
                    setAutoplay(false);
                  }}
                  className={cn(
                    "relative grid size-10 place-items-center rounded-xl transition-colors",
                    active ? "bg-card shadow-soft" : "hover:bg-card/70",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="rail-indicator"
                      className="absolute right-2 -bottom-1.5 left-2 h-0.5 rounded-full bg-primary sm:top-2 sm:right-auto sm:bottom-2 sm:-left-1.5 sm:h-auto sm:w-0.5"
                      transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    />
                  ) : null}
                  <PlatformTile
                    platform={p}
                    size="xs"
                    className={cn("transition-all duration-300", !active && "opacity-55 grayscale-[0.5]")}
                  />
                </button>
              );
            })}
          </div>

          {/* Order panel */}
          <div className="min-w-0 flex-1 rounded-[1.25rem] border bg-background/70 p-3.5 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-heading text-[0.95rem] font-bold">New order</p>
              <ol className="flex items-center gap-1 text-[0.65rem] font-semibold" aria-label="Order steps">
                {["Platform", "Service", "Details"].map((step, i) => (
                  <li key={step} className="flex items-center gap-1">
                    <span
                      className={cn(
                        "grid size-4 place-items-center rounded-full",
                        i < 2 ? "bg-primary text-primary-foreground" : "bg-lime text-graphite",
                      )}
                    >
                      {i < 2 ? <Check className="size-2.5" strokeWidth={3.5} aria-hidden /> : 3}
                    </span>
                    <span className={cn("hidden sm:inline", i < 2 ? "text-muted-foreground" : "text-foreground")}>
                      {step}
                    </span>
                    {i < 2 ? <span className="mx-0.5 h-px w-2 bg-border" aria-hidden /> : null}
                  </li>
                ))}
              </ol>
            </div>

            {/* Selected service */}
            <motion.div
              key={`field-${service.id}`}
              initial={{ boxShadow: "0 0 0 3px rgb(112 71 235 / 0.25)" }}
              animate={{ boxShadow: "0 0 0 0px rgb(112 71 235 / 0)" }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              className="mt-4 rounded-xl border bg-card p-3"
            >
              <p className="text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">Service</p>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={service.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.28, ease: EASE }}
                  className="mt-1.5 flex items-center gap-2.5"
                >
                  <PlatformTile platform={platform} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{service.name}</span>
                    <span className="block truncate text-[0.7rem] text-muted-foreground">
                      {platform.short} · {CATEGORY_META[service.category].label}
                    </span>
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </motion.div>
              </AnimatePresence>
            </motion.div>

            {/* Fields */}
            <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-[1.4fr_1fr]">
              <div className="min-w-0 rounded-xl border bg-card p-3">
                <p className="text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">Target link</p>
                <div className="mt-1.5 flex items-center gap-1.5 overflow-hidden text-xs">
                  <Link2 className="size-3.5 shrink-0 text-primary" aria-hidden />
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={current.link}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.25 }}
                      className="truncate font-mono text-[0.72rem]"
                    >
                      {current.link}
                    </motion.span>
                  </AnimatePresence>
                </div>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <p className="text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
                  {quantity ? "Quantity" : "Budget"}
                </p>
                <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium">
                  {quantity ? (
                    <Hash className="size-3.5 text-primary" aria-hidden />
                  ) : (
                    <Wallet className="size-3.5 text-primary" aria-hidden />
                  )}
                  Set by you
                </p>
              </div>
            </div>

            {/* Summary */}
            <div className="mt-2.5 rounded-xl bg-graphite p-3.5 text-white">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-white/60">
                  <CircleDollarSign className="size-3.5" aria-hidden /> Price
                </span>
                <span className="font-semibold">Set on activation</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5 text-[0.7rem] text-white/60">
                  <PlatformIcon icon={platform.icon} className="size-3.5 shrink-0 text-white/80" />
                  <span className="truncate">Checkout opens on activation</span>
                </span>
                <button
                  type="button"
                  onClick={() => explore({ platform: platform.id })}
                  className="btn-shine inline-flex shrink-0 items-center gap-1 rounded-full bg-lime px-3 py-1.5 text-xs font-bold text-graphite transition-transform hover:-translate-y-px"
                >
                  View service <ArrowRight className="size-3.5" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Autoplay progress */}
        <div className="flex items-center justify-between gap-3 px-3 pt-2.5 pb-1.5">
          <span className="text-[0.68rem] font-medium text-muted-foreground">Ordering preview · sample inputs</span>
          <div className="flex items-center gap-2">
            <div className="flex gap-1" aria-hidden>
              {DEMO.map((d, i) => (
                <span key={d.id} className="relative h-1 w-4 overflow-hidden rounded-full bg-muted">
                  {i === index ? (
                    <motion.span
                      key={`${index}-${playing}`}
                      className="absolute inset-0 origin-left rounded-full bg-primary"
                      initial={{ scaleX: playing ? 0 : 1 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: playing ? 3.6 : 0, ease: "linear" }}
                    />
                  ) : null}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAutoplay((a) => !a)}
              disabled={reduced}
              aria-label={autoplay ? "Pause preview" : "Play preview"}
              className="grid size-6 place-items-center rounded-full border bg-background text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              {autoplay && !reduced ? <Pause className="size-3" aria-hidden /> : <Play className="size-3" aria-hidden />}
            </button>
          </div>
        </div>
      </div>

      {/* Floating: example order */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: [0, -6, 0] }}
        transition={{
          opacity: { duration: 0.6, delay: 0.9 },
          y: { duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1.5 },
        }}
        className="pointer-events-none absolute -bottom-14 -left-4 hidden w-60 rounded-2xl border bg-card/95 p-3.5 shadow-float backdrop-blur sm:block lg:-left-12"
        aria-hidden
      >
        <div className="flex items-center justify-between">
          <p className="font-mono text-[0.68rem] text-muted-foreground">#SV-0000</p>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.62rem] font-semibold text-secondary-foreground">
            Example
          </span>
        </div>
        <p className="mt-1 font-heading text-sm font-bold">Details reviewed</p>
        <div className="mt-2.5 flex items-center gap-1">
          {[1, 1, 1, 0].map((done, i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full", done ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
        <p className="mt-2 text-[0.68rem] text-muted-foreground">Confirmed milestones only</p>
      </motion.div>

      {/* Floating: catalog */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: [0, 5, 0] }}
        transition={{
          opacity: { duration: 0.6, delay: 1.05 },
          y: { duration: 8, repeat: Infinity, ease: "easeInOut", delay: 2 },
        }}
        className="pointer-events-none absolute -top-7 -right-3 hidden items-center gap-2.5 rounded-2xl border bg-card/95 p-2.5 pr-3.5 shadow-float backdrop-blur md:flex lg:-right-7"
        aria-hidden
      >
        <span className="grid size-8 place-items-center rounded-xl bg-graphite text-lime">
          <Sparkles className="size-4" />
        </span>
        <span>
          <span className="block text-xs font-bold">{CATALOG_TOTALS.services} services</span>
          <span className="block text-[0.68rem] text-muted-foreground">across {CATALOG_TOTALS.platforms} platforms</span>
        </span>
      </motion.div>
    </motion.div>
  );
}
