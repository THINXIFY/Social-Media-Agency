import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Clapperboard,
  Copy,
  Layers3,
  Lock,
  Megaphone,
  MessageCircleQuestion,
  MousePointerClick,
  PenLine,
  Rocket,
  ShieldCheck,
  ShoppingBag,
  Store,
  Target,
} from "lucide-react";
import { PlatformIcon } from "@/components/brand";
import { Reveal } from "@/components/site/primitives";
import { AI_TOOL_BY_ID, AI_TOOLS, PLATFORM_CHOICES } from "@/lib/ai/registry";
import { PLATFORMS } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { AiDirectory } from "./directory";
import { HeroAtmosphere } from "./hero-atmosphere";
import { AiHeroVisual } from "./hero-visual";
import { AI_ICONS, AiMark, FAMILY, ToolGlyph } from "./parts";
import { WorkspacePreview } from "./workspace-preview";

/*
 * SociVanta AI landing page. Light editorial base with deliberate dark bands
 * (workspace, free use). Copy is server-rendered and accurate: tools are
 * Coming soon, free allowances are planned, nothing is generated.
 */

const wrap = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";
const primaryCta =
  "group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[0.95rem] font-semibold text-primary-foreground shadow-[0_14px_32px_-16px_rgb(112_71_235/0.9),inset_0_1px_0_rgb(255_255_255/0.2)] transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:bg-primary/92 hover:shadow-[0_18px_36px_-16px_rgb(112_71_235/1)] active:translate-y-0 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0";
const secondaryCta =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full border bg-card px-6 text-[0.95rem] font-semibold transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px hover:border-foreground/20 hover:bg-muted/50 active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";
const eyebrow = "text-[0.74rem] font-semibold tracking-[0.16em] uppercase";
const h2 = "font-heading text-[2rem] leading-[1.06] font-extrabold tracking-[-0.03em] text-balance sm:text-[2.75rem] lg:text-[3.1rem]";

export const AI_FAQ = [
  {
    q: "What does SociVanta AI do?",
    a: "It's a family of focused tools for social media work: writing captions, finding hashtags and keywords, coming up with post ideas, planning a content calendar, and — later — deciding what to focus on next. You give a short brief; each tool organises the results for the platform you're posting on.",
  },
  {
    q: "When will the AI tools be available?",
    a: "They're being released in stages, starting with Content Studio (captions, hashtags, post ideas and content calendars), followed by Growth Intelligence. We haven't announced dates. Every tool shows Coming soon until it genuinely works — none of them generate content today.",
  },
  {
    q: "Which tools will be free?",
    a: "The Content Studio and Growth Intelligence tools are planned with free daily runs on a free SociVanta account — for example, up to 10 caption runs a day and 3 content calendars a day. Free use for the assistance tools will be announced when they launch. No paid plans are planned for the first tools.",
  },
  {
    q: "How do usage limits work?",
    a: "Each tool will have its own daily allowance per account, which resets at midnight UTC. If a request fails on our side, it doesn't count against your allowance. There's also a short limit on very rapid repeat requests to keep the service fair for everyone.",
  },
  {
    q: "Do I need to connect my social accounts?",
    a: "No. The tools never connect to, read from or post to your social accounts. You copy what you like and publish it yourself. AI tools also can't place orders or move money on your SociVanta account.",
  },
  {
    q: "How is my information handled?",
    a: "Your brief isn't stored. Personal details such as email addresses, phone numbers and card numbers are removed before anything is sent to an AI model. We keep only usage counts — never what you typed or what was generated — to apply daily limits.",
  },
];

const HERO_PLATFORMS = ["instagram", "tiktok", "youtube", "facebook", "x", "linkedin"].map((id) => PLATFORMS.find((p) => p.id === id)).filter(Boolean) as typeof PLATFORMS;

/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section id="top" className="relative isolate overflow-hidden" aria-labelledby="ai-hero-title">
      <HeroAtmosphere />

      <div className={cn(wrap, "grid grid-cols-1 items-center gap-14 pt-10 pb-20 sm:pt-16 sm:pb-24 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-12 lg:pt-20 lg:pb-28 xl:gap-20")}>
        <div className="max-w-[38rem]">
          <a href="#tools" className="group inline-flex items-center gap-2 rounded-full border bg-card/80 py-1 pr-3 pl-1 text-[0.8rem] font-medium text-muted-foreground backdrop-blur transition-colors hover:border-primary/30 hover:text-foreground">
            <AiMark>New</AiMark>
            Content Studio is in the works
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
          </a>

          <h1 id="ai-hero-title" className="mt-6 font-heading text-[2.9rem] leading-[0.98] font-extrabold tracking-[-0.045em] min-[400px]:text-[3.4rem] sm:text-[4.5rem] lg:text-[3.9rem] xl:text-[4.6rem]">
            <span className="block sm:whitespace-nowrap">Create smarter.</span>
            <span className="relative mt-1 inline-block text-primary sm:whitespace-nowrap">
              Grow further.
              <svg viewBox="0 0 320 18" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-3 w-full text-lime sm:-bottom-3 sm:h-4" aria-hidden>
                <path d="M3 12C70 4 160 3 317 8" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
              </svg>
            </span>
          </h1>

          <p className="mt-8 max-w-[33rem] text-[1.08rem] leading-relaxed text-pretty text-muted-foreground sm:text-[1.15rem]">
            Turn one rough idea into captions, hashtags, post ideas and a posting plan — written for the platform you&apos;re posting on, and ready for you to make your own.
          </p>

          <div className="mt-9 flex flex-col gap-3 min-[440px]:flex-row">
            <a href="#tools" className={primaryCta}>
              Explore AI Tools <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
            </a>
            <a href="#how-it-works" className={secondaryCta}>
              See How It Works <ArrowDown className="size-4" aria-hidden />
            </a>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3">
            <span className="text-[0.8rem] font-medium text-muted-foreground">Written for</span>
            <ul className="flex items-center gap-1.5" aria-label="Platforms">
              {HERO_PLATFORMS.map((p) => (
                <li key={p.id} title={p.name} className="grid size-8 place-items-center rounded-full border bg-card text-foreground/70">
                  <PlatformIcon icon={p.icon} className="size-3.5" title={p.name} />
                </li>
              ))}
              <li className="pl-1 text-[0.8rem] text-muted-foreground">+{PLATFORM_CHOICES.length - HERO_PLATFORMS.length} more</li>
            </ul>
          </div>
        </div>

        <AiHeroVisual />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Tools() {
  return (
    <section id="tools" className="scroll-mt-20 border-t bg-subtle/50 py-16 sm:py-24 dark:bg-white/[0.015]" aria-labelledby="tools-title">
      <div className={wrap}>
        <Reveal className="max-w-2xl">
          <p className={cn(eyebrow, "text-primary")}>The tools</p>
          <h2 id="tools-title" className={cn(h2, "mt-3")}>
            Find the right tool in seconds.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">Thirteen focused tools in three families. Each one does a single job well, and shows exactly where it stands.</p>
        </Reveal>
        <div className="mt-10">
          <AiDirectory />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Experience() {
  return (
    <section id="experience" className="dark relative isolate scroll-mt-16 overflow-hidden border-y border-white/[0.06] bg-[#0b0c10] py-16 text-foreground sm:py-24" aria-labelledby="experience-title">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(133_98_242/0.6),transparent)]" aria-hidden />
      <div className="pointer-events-none absolute top-1/3 left-1/2 -z-10 h-[30rem] w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(112_71_235/0.22),transparent)]" aria-hidden />
      <div className={wrap}>
        <Reveal className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-12">
          <div className="max-w-2xl">
            <p className={cn(eyebrow, "text-lime")}>The workspace</p>
            <h2 id="experience-title" className={cn(h2, "mt-3 text-white")}>
              Brief in. Results, neatly organised.
            </h2>
          </div>
          <p className="max-w-md text-[1.02rem] leading-relaxed text-white/60">The same calm, two-part workspace for every tool. Write, choose, review — then copy what you like.</p>
        </Reveal>
        <Reveal className="mt-10 sm:mt-12">
          <WorkspacePreview />
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function HowItWorks() {
  const steps = [
    {
      icon: PenLine,
      title: "Describe your idea",
      body: "A sentence about the post, product or moment — plus who it's for, if you like.",
      visual: (
        <div className="rounded-xl border bg-background px-3.5 py-3 dark:bg-white/[0.03]">
          <p className="text-[0.66rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Your brief</p>
          <p className="mt-1 truncate text-sm">Spring sale on handmade candles</p>
        </div>
      ),
    },
    {
      icon: MousePointerClick,
      title: "Pick a tool and platform",
      body: "Choose the right AI tool and select where you're posting. We'll tailor the experience to your platform.",
      visual: (
        <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5 dark:bg-white/[0.03]">
          {["caption-generator", "hashtag-finder", "post-ideas"].map((id, i) => (
            <ToolGlyph key={id} tool={AI_TOOL_BY_ID[id]} size="sm" className={cn(i > 0 && "opacity-30 saturate-0")} />
          ))}
          <span className="ml-auto rounded-full bg-primary/[0.08] px-2.5 py-1 text-[0.72rem] font-medium text-primary dark:bg-primary/20 dark:text-[#c9bcff]">Instagram</span>
        </div>
      ),
    },
    {
      icon: Layers3,
      title: "Edit, copy, post",
      body: "Keep the options you like, adjust them, and post them yourself. You stay in control.",
      visual: (
        <div className="space-y-1.5 rounded-xl border bg-background p-2.5 dark:bg-white/[0.03]" aria-hidden>
          {["w-full", "w-3/5"].map((w) => (
            <div key={w} className="flex items-center gap-2 rounded-lg bg-muted/70 px-2.5 py-2">
              <span className={cn("h-1.5 rounded-full bg-foreground/10", w)} />
              <Copy className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
            </div>
          ))}
        </div>
      ),
    },
  ];
  return (
    <section id="how-it-works" className="scroll-mt-20 py-16 sm:py-24" aria-labelledby="how-title">
      <div className={wrap}>
        <Reveal className="max-w-2xl">
          <p className={cn(eyebrow, "text-primary")}>How it works</p>
          <h2 id="how-title" className={cn(h2, "mt-3")}>
            Three steps. <span className="text-muted-foreground">No prompt-writing.</span>
          </h2>
        </Reveal>

        <ol className="relative mt-12 grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
          {steps.map((s, i) => (
            <li key={s.title}>
              <Reveal delay={i * 0.06} className="flex h-full flex-col rounded-[1.4rem] border bg-card p-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/[0.08] text-primary dark:bg-primary/20 dark:text-[#c9bcff]">
                    <s.icon className="size-[1.1rem]" aria-hidden />
                  </span>
                  <span className="text-[0.74rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Step {String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="mt-5 font-heading text-[1.2rem] font-bold">{s.title}</h3>
                <p className="mt-2 max-w-[25rem] text-[0.95rem] leading-relaxed text-muted-foreground">{s.body}</p>
                <div className="mt-auto pt-6">{s.visual}</div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function GrowthShowcase() {
  const advisor = AI_TOOL_BY_ID["growth-advisor"];
  const roadmap = AI_TOOL_BY_ID["growth-roadmap"];
  const recommender = AI_TOOL_BY_ID["service-recommender"];
  return (
    <section id="growth" className="scroll-mt-16 border-t bg-subtle/50 py-16 sm:py-24 dark:bg-white/[0.015]" aria-labelledby="growth-title">
      <div className={cn(wrap, "grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16")}>
        <Reveal>
          <p className={cn(eyebrow, "text-primary")}>{FAMILY.growth.name} · up next</p>
          <h2 id="growth-title" className={cn(h2, "mt-3")}>
            Know what to do next — and in what order.
          </h2>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">Share where you are and what you&apos;re aiming for. Get priorities in plain language, a staged plan with checkpoints, and services from the real catalog that actually fit.</p>
          <ul className="mt-7 divide-y rounded-2xl border bg-card">
            {[advisor, roadmap, recommender].map((t) => (
              <li key={t.id}>
                <Link href={`/ai-tools/${t.slug}`} className="group flex items-center gap-3.5 p-4 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
                  <ToolGlyph tool={t} size="sm" />
                  <span className="min-w-0">
                    <span className="block font-semibold">{t.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">{t.tagline}</span>
                  </span>
                  <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.06} className="dark relative overflow-hidden rounded-[1.75rem] border bg-[#121318] p-6 text-foreground sm:p-8">
          <div className="pointer-events-none absolute -top-20 -right-16 size-64 rounded-full bg-primary/25 blur-[80px]" aria-hidden />
          <div className="relative flex items-center justify-between">
            <p className="text-[0.7rem] font-semibold tracking-[0.12em] text-white/50 uppercase">Growth Roadmap · preview</p>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem] font-semibold text-white/70">Coming soon</span>
          </div>
          <ol className="relative mt-7">
            {["Foundations", "Momentum", "Scale what works"].map((stage, i) => (
              <li key={stage} className="relative flex gap-4 pb-5 last:pb-0">
                <span className="relative flex flex-col items-center">
                  <span className={cn("z-10 grid size-8 place-items-center rounded-full text-xs font-bold", i === 0 ? "bg-lime text-graphite" : "bg-white/10 text-white/70 ring-1 ring-white/15")}>{i + 1}</span>
                  {i < 2 ? <span className="absolute top-8 bottom-0 w-px bg-white/15" aria-hidden /> : null}
                </span>
                <div className="min-w-0 flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                  <p className="text-sm font-semibold text-white">
                    Stage {i + 1} · {stage}
                  </p>
                  <div className="mt-3 space-y-1.5" aria-hidden>
                    <span className="block h-1.5 w-10/12 rounded-full bg-white/[0.09]" />
                    <span className="block h-1.5 w-6/12 rounded-full bg-white/[0.09]" />
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <p className="relative mt-6 flex items-center gap-2 text-xs text-white/45">
            <ShoppingBag className="size-3.5" aria-hidden /> Service suggestions will only include services you can actually order — and never place an order for you.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Why() {
  const principles = [
    { icon: Target, title: "Made for social", body: "Each tool knows the platform it's writing for — length, tone and habits included." },
    { icon: MousePointerClick, title: "Simple on purpose", body: "A short brief in, organised results out. Nothing to configure." },
    { icon: Check, title: "Honest about limits", body: "Clear about what AI gets wrong, so you know what to check." },
    { icon: ShieldCheck, title: "Yours to control", body: "No account connections, no stored briefs, no actions taken for you." },
  ];
  const audiences = [
    { icon: Clapperboard, label: "Creators" },
    { icon: Store, label: "Small businesses" },
    { icon: Megaphone, label: "Marketers" },
    { icon: Building2, label: "Agencies" },
    { icon: Rocket, label: "Startups" },
  ];
  return (
    <section className="py-16 sm:py-24" aria-labelledby="why-title">
      <div className={cn(wrap, "grid grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.4fr] lg:gap-16")}>
        <Reveal>
          <p className={cn(eyebrow, "text-primary")}>Why SociVanta AI</p>
          <h2 id="why-title" className={cn(h2, "mt-3")}>
            Built for the way you actually post.
          </h2>
          <ul className="mt-7 flex flex-wrap gap-2" aria-label="Who it's for">
            {audiences.map((a) => (
              <li key={a.label} className="inline-flex items-center gap-2 rounded-full border bg-card px-3.5 py-2 text-sm font-medium">
                <a.icon className="size-4 text-primary" aria-hidden /> {a.label}
              </li>
            ))}
          </ul>
        </Reveal>
        <ul className="grid grid-cols-1 border-t sm:grid-cols-2">
          {principles.map((p, i) => (
            <li key={p.title} className={cn("border-b py-6 sm:py-7", i % 2 === 0 ? "sm:border-r sm:pr-8" : "sm:pl-8")}>
              <Reveal delay={i * 0.04}>
                <p.icon className="size-5 text-primary" aria-hidden />
                <p className="mt-3 font-heading text-lg font-bold">{p.title}</p>
                <p className="mt-1.5 text-[0.95rem] leading-relaxed text-muted-foreground">{p.body}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function FreeUse() {
  const withFree = AI_TOOLS.filter((t) => t.free && t.free.signedInPerDay > 0);
  return (
    <section id="free" className="dark relative isolate scroll-mt-16 overflow-hidden border-y border-white/[0.06] bg-[#0b0c10] py-16 text-foreground sm:py-24" aria-labelledby="free-title">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(200_255_82/0.45),transparent)]" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 -left-40 -z-10 size-[36rem] rounded-full bg-[radial-gradient(closest-side,rgb(112_71_235/0.28),transparent)]" aria-hidden />
      <div className={cn(wrap, "grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16")}>
        <Reveal>
          <p className={cn(eyebrow, "text-lime")}>Free to use</p>
          <h2 id="free-title" className="mt-3 font-heading text-[3.2rem] leading-[0.95] font-extrabold tracking-[-0.045em] text-white sm:text-[4.6rem]">
            Free.
            <br />
            <span className="text-white/40">Every day.</span>
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-white/60">Each tool comes with free daily runs on a free SociVanta account — the same one you use for services. No card. No subscription.</p>
          <div className="mt-8 flex flex-col gap-3 min-[440px]:flex-row">
            <Link href="/register" className={primaryCta}>
              Create a free account <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href="/login" className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-6 text-[0.95rem] font-semibold text-white transition-colors hover:bg-white/5">
              Sign in
            </Link>
          </div>
        </Reveal>
        <Reveal delay={0.06} className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-2">
          <ul className="divide-y divide-white/[0.07]">
            {withFree.map((t) => {
              const Icon = AI_ICONS[t.icon];
              return (
                <li key={t.id} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                  <Icon className="size-4 shrink-0 text-white/45" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium text-white">{t.name.replace(/^AI /, "")}</span>
                  <span className="font-heading text-xl font-extrabold text-lime tabular-nums">{t.free!.signedInPerDay}</span>
                  <span className="w-10 text-xs text-white/45">a day</span>
                </li>
              );
            })}
          </ul>
          <p className="flex items-start gap-2 rounded-[1.25rem] bg-white/[0.04] px-4 py-3.5 text-[0.8rem] leading-relaxed text-white/55 sm:px-5">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Planned allowances that start when each tool launches. Limits reset at midnight UTC. Nothing is generated today.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 py-16 sm:py-24" aria-labelledby="faq-title">
      <div className={cn(wrap, "grid grid-cols-1 gap-10 lg:grid-cols-[0.85fr_1.4fr] lg:gap-16")}>
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <p className={cn(eyebrow, "text-primary")}>Questions</p>
          <h2 id="faq-title" className={cn(h2, "mt-3")}>
            Everything you&apos;d want to know.
          </h2>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-muted-foreground">What&apos;s ready, what&apos;s planned, what&apos;s free — and how your information is handled.</p>
          <div className="mt-8 flex items-start gap-3.5 rounded-2xl border bg-card p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/[0.08] text-primary dark:bg-primary/20 dark:text-[#c9bcff]">
              <MessageCircleQuestion className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-semibold">Want to see where each tool stands?</p>
              <a href="#tools" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                Browse all 13 tools <ArrowRight className="size-3.5" aria-hidden />
              </a>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            The AI tools never need your accounts. To keep the accounts you manage side by side, see{" "}
            <Link href="/social-management" className="font-semibold text-primary hover:underline">
              Social Management
            </Link>
            .
          </p>
        </Reveal>
        <div className="space-y-3">
          {AI_FAQ.map((f, i) => (
            <details
              key={f.q}
              name="ai-faq"
              open={i === 0}
              className="group rounded-2xl border bg-card transition-[border-color,box-shadow] open:border-primary/30 open:shadow-[0_18px_40px_-30px_rgb(112_71_235/0.5)] hover:border-foreground/15 open:hover:border-primary/30 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center gap-4 rounded-2xl px-5 py-5 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:px-6">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-[0.75rem] font-bold text-muted-foreground tabular-nums transition-colors group-open:bg-primary group-open:text-primary-foreground" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="flex-1 font-heading text-[1.05rem] leading-snug font-bold sm:text-[1.12rem]">{f.q}</h3>
                <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 group-open:text-primary motion-reduce:transition-none" aria-hidden />
              </summary>
              <p className="px-5 pb-6 pl-[4.25rem] text-[0.98rem] leading-relaxed text-muted-foreground sm:px-6 sm:pl-[4.5rem]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function FinalCta() {
  return (
    <section className="pb-16 sm:pb-24" aria-labelledby="cta-title">
      <div className={wrap}>
        <Reveal className="relative isolate overflow-hidden rounded-[2rem] border bg-card px-6 pt-12 pb-11 text-center sm:px-12 sm:pt-16">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_50%_0%,rgb(112_71_235/0.12),transparent_70%)] dark:bg-[radial-gradient(70%_60%_at_50%_0%,rgb(112_71_235/0.26),transparent_70%)]" aria-hidden />
          <ul className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2" aria-label="All SociVanta AI tools">
            {AI_TOOLS.map((t) => (
              <li key={t.id} title={t.name}>
                <ToolGlyph tool={t} size="md" className={cn(t.category === "assist" && "opacity-70")} />
              </li>
            ))}
          </ul>
          <h2 id="cta-title" className="mx-auto mt-9 max-w-3xl font-heading text-[2.4rem] leading-[1.02] font-extrabold tracking-[-0.04em] text-balance sm:text-[3.5rem]">
            Start with one idea.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">See every tool, what it will do and when it&apos;s arriving — and use SociVanta&apos;s social media services whenever you need them.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 min-[440px]:flex-row">
            <a href="#tools" className={primaryCta}>
              Explore AI Tools <ArrowRight className="size-4" aria-hidden />
            </a>
            <Link href="/" className={secondaryCta}>
              Browse social media services
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function AiLanding() {
  return (
    <>
      <Hero />
      <Tools />
      <Experience />
      <HowItWorks />
      <GrowthShowcase />
      <Why />
      <FreeUse />
      <Faq />
      <FinalCta />
    </>
  );
}
