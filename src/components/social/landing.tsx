import Link from "next/link";
import {
  ArrowRight,
  Ban,
  ChevronDown,
  Clock,
  HeartPulse,
  KeyRound,
  LayoutGrid,
  Link2Off,
  Lock,
  LockKeyhole,
  MousePointerClick,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { Reveal } from "@/components/site/primitives";
import { PLATFORMS } from "@/lib/catalog";
import { CAPABILITY_LABEL, SOCIAL_PLATFORMS, SOCIAL_ROUTES, type SocialPlatform, type SocialProviderId } from "@/lib/social/platforms";
import { cn } from "@/lib/utils";
import { SocialHeroPreview } from "./hero-preview";
import { StaggerItem } from "./stagger";

/*
 * Social Management landing page (AI-06). Server-rendered and truthful:
 * availability comes from the server's real configuration at build time,
 * previews are labelled, use placeholder names, show no figures and never a
 * connected state, and nothing about scheduling or publishing is presented as
 * available.
 */

const wrap = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";
const primaryCta =
  "group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-7 text-[0.95rem] font-semibold text-primary-foreground shadow-[0_14px_32px_-16px_rgb(112_71_235/0.9),inset_0_1px_0_rgb(255_255_255/0.2)] transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:bg-primary/92 hover:shadow-[0_18px_36px_-16px_rgb(112_71_235/1)] active:translate-y-0 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0";
const secondaryCta =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full border bg-card px-7 text-[0.95rem] font-semibold transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px hover:border-foreground/20 hover:bg-muted/50 active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";
const textLink = "group inline-flex items-center gap-1.5 rounded-md font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";
const eyebrow = "text-[0.74rem] font-semibold tracking-[0.16em] uppercase";
const h2 = "font-heading text-[2rem] leading-[1.05] font-extrabold tracking-[-0.035em] text-balance sm:text-[2.75rem] lg:text-[3.1rem]";
const arrow = "size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none";

const CATALOG = new Map(PLATFORMS.map((p) => [p.id, p]));
const Tile = ({ id, size = "md", className }: { id: SocialProviderId; size?: "xs" | "sm" | "md" | "lg"; className?: string }) => {
  const p = CATALOG.get(id);
  return p ? <PlatformTile platform={p} size={size} className={className} /> : null;
};
const shares = (p: SocialPlatform) => p.capabilities.map((c) => (c === "audience" ? p.nouns.audience : c === "content-count" ? p.nouns.content : c === "profile" ? "Profile" : CAPABILITY_LABEL[c]));

export type LandingAvailability = Record<SocialProviderId, boolean>;

export const SOCIAL_TITLE = "Social Media Management Platform | SociVanta AI";
export const SOCIAL_DESCRIPTION =
  "Manage multiple social media accounts in one unified workspace. Connect Instagram, Facebook, TikTok, YouTube, X and LinkedIn securely, platform by platform.";

const listOf = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/** FAQ text shared by the page and its FAQPage structured data (word for word). */
export function socialFaq(ready: LandingAvailability) {
  const live = SOCIAL_PLATFORMS.filter((p) => ready[p.id]).map((p) => p.name);
  return [
    {
      q: "What is SociVanta Social Management?",
      a: "It's a unified, read-only social media workspace inside SociVanta AI for the accounts you manage. You connect Instagram, Facebook Pages, TikTok, YouTube, X or LinkedIn and see them side by side: how each connection is doing, and the figures each platform shares, such as follower counts.",
    },
    {
      q: "Can I connect my accounts today?",
      a: live.length
        ? `Yes, for ${listOf(live)}. The other platforms switch on after each one reviews and approves SociVanta, and each shows exactly where it stands in your workspace.`
        : "Not yet. Each platform has to review and approve SociVanta before accounts can be linked, so connections switch on platform by platform. The workspace is already open to signed-in customers and shows exactly where each platform stands.",
    },
    {
      q: "Does SociVanta need my social media password?",
      a: "No. You sign in on the platform's own page through its official authorization (OAuth). SociVanta receives a limited, read-only permission — never your password — and stores it encrypted on the server.",
    },
    {
      q: "What can SociVanta see and do with a connected account?",
      a: "Only your profile name and handle, plus the figures the platform chooses to share, like followers, number of posts or total views. It can't post, schedule, message, edit your profile or run ads. Figures are shown exactly as the platform reported them at your last refresh.",
    },
    {
      q: "Can I schedule or publish posts?",
      a: "Not yet. You can already write drafts, preview them for each platform and plan them on a content calendar in your workspace. Publishing to a platform stays off until that platform approves SociVanta's posting permission and you grant it yourself — today's connections are read-only.",
    },
    {
      q: "Can I automate routine social media tasks?",
      a: "Yes, for planning routines. Automation Studio in your workspace can create reminders, checklists, draft review flags and account health checks on a schedule you choose, and prepare draft suggestions you approve. Automations never publish, schedule posts, place orders or spend money, and each one runs only after you activate it. AI-assisted workflow drafts are coming soon.",
    },
    {
      q: "How do I disconnect an account?",
      a: "Open the account and choose Disconnect. SociVanta deletes its stored access straight away and asks the platform to revoke it where the platform allows. If a platform doesn't support that, or doesn't confirm, we tell you so and show you where to remove access yourself.",
    },
    {
      q: "Does connecting an account affect my SociVanta orders?",
      a: "No. Social Management uses the same SociVanta account as our social media services, but connecting or disconnecting an account never changes your orders, wallet or payments.",
    },
  ];
}

/* -------------------------------------------------------------------------- */
/*  Hero                                                                      */
/* -------------------------------------------------------------------------- */

function HeroPreview({ ready }: { ready: LandingAvailability }) {
  return (
    <div className="relative mx-auto mt-14 w-full max-w-6xl sm:mt-16">
      <div className="pointer-events-none absolute -inset-x-10 -top-10 -bottom-6 -z-10 rounded-[3rem] bg-[radial-gradient(55%_60%_at_50%_0%,rgb(112_71_235/0.14),transparent_70%)] dark:bg-[radial-gradient(55%_60%_at_50%_0%,rgb(112_71_235/0.28),transparent_70%)]" aria-hidden />
      <SocialHeroPreview ready={ready} />
    </div>
  );
}

function Hero({ ready }: { ready: LandingAvailability }) {
  const anyReady = Object.values(ready).some(Boolean);
  return (
    <section id="top" className="relative isolate overflow-hidden" aria-labelledby="social-hero-title">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[40rem] bg-[linear-gradient(to_right,rgb(32_33_39/0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgb(32_33_39/0.045)_1px,transparent_1px)] [mask-image:radial-gradient(55%_65%_at_50%_0%,black,transparent)] bg-[size:48px_48px] dark:bg-[linear-gradient(to_right,rgb(255_255_255/0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.045)_1px,transparent_1px)]" aria-hidden />

      <div className={cn(wrap, "pt-10 pb-16 sm:pt-16 sm:pb-24 lg:pt-20")}>
        <div className="mx-auto max-w-5xl text-center">
          <a href="#platforms" className="group inline-flex max-w-full items-center gap-2 rounded-full border bg-card/80 py-1 pr-3 pl-1 text-[0.8rem] font-medium text-muted-foreground shadow-soft backdrop-blur transition-colors hover:border-primary/30 hover:text-foreground">
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-graphite px-2 py-0.5 text-[0.68rem] font-bold text-lime dark:bg-white/10">
              <Sparkles className="size-3" aria-hidden /> Social Management
            </span>
            <span className="truncate">{anyReady ? "Connections are opening platform by platform" : "Connections open platform by platform"}</span>
            <ArrowRight className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
          </a>

          <h1 id="social-hero-title" className="mt-7 font-heading text-[2.35rem] leading-[1.04] font-extrabold tracking-[-0.045em] min-[400px]:text-[2.6rem] sm:text-[3.4rem] md:text-[3.9rem] lg:text-[4.1rem] xl:text-[4.6rem]">
            <span className="block text-balance text-foreground">All Your Social Accounts.</span>
            <span className="mt-1 block text-balance text-primary">
              One Smarter{" "}
              <span className="relative inline-block whitespace-nowrap">
                Workspace.
                <svg viewBox="0 0 300 16" preserveAspectRatio="none" className="absolute -bottom-[0.12em] left-[2%] -z-10 h-[0.2em] w-[94%] text-lime" aria-hidden>
                  <path d="M3 11C80 4 190 3 297 7" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
                </svg>
              </span>
            </span>
          </h1>

          <p className="mx-auto mt-7 max-w-[40rem] text-[1.05rem] leading-relaxed text-pretty text-muted-foreground sm:text-[1.15rem]">
            Bring your social accounts together in one organized workspace. View connection status, manage account access, and explore available insights—all without sharing your passwords.
          </p>

          <div className="mt-9 flex flex-col items-stretch justify-center gap-3 min-[440px]:flex-row min-[440px]:items-center">
            <Link href={SOCIAL_ROUTES.overview} className={primaryCta}>
              Open Social Workspace <ArrowRight className={arrow} aria-hidden />
            </Link>
            <a href="#how-it-works" className={secondaryCta}>
              See How It Works
            </a>
          </div>
          <p className="mt-5 text-sm">
            <a href="#platforms" className={textLink}>
              Explore Supported Platforms <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
            </a>
          </p>

          <ul className="mt-9 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[0.82rem] font-medium text-muted-foreground" aria-label="Built in">
            {[
              { icon: Lock, label: "Read-only access" },
              { icon: UserRoundCheck, label: "Official platform sign-in" },
              { icon: Link2Off, label: "Disconnect any time" },
            ].map((t) => (
              <li key={t.label} className="inline-flex items-center gap-1.5">
                <t.icon className="size-4 text-primary" aria-hidden /> {t.label}
              </li>
            ))}
          </ul>
        </div>

        <HeroPreview ready={ready} />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Platforms                                                                 */
/* -------------------------------------------------------------------------- */

function Platforms({ ready }: { ready: LandingAvailability }) {
  const readyCount = SOCIAL_PLATFORMS.filter((p) => ready[p.id]).length;
  const waiting = SOCIAL_PLATFORMS.length - readyCount;
  return (
    <section id="platforms" className="scroll-mt-20 border-t bg-subtle/50 py-16 sm:py-24 dark:bg-white/[0.015]" aria-labelledby="platforms-title">
      <div className={cn(wrap, "grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.38fr)_minmax(0,0.62fr)] lg:gap-12 xl:gap-16")}>
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <p className={cn(eyebrow, "flex items-center gap-2.5 text-primary")}>
            <span className="h-px w-6 bg-primary/60" aria-hidden />
            Platforms
          </p>
          <h2 id="platforms-title" className="mt-4 font-heading text-[2rem] leading-[1.06] font-extrabold tracking-[-0.038em] sm:text-[2.4rem] lg:text-[2.15rem] xl:text-[2.5rem]">
            <span className="block">Your Social Platforms.</span>
            <span className="block text-primary">One Organized Place.</span>
          </h2>
          <p className="mt-5 max-w-[26rem] text-[1rem] leading-[1.7] text-muted-foreground">Explore the platforms SociVanta is preparing to support. See what account information each integration can provide and check its current availability.</p>

          <dl className="mt-7 inline-flex items-stretch rounded-2xl bg-card text-[0.8rem] ring-1 ring-border/80">
            <div className="flex items-center gap-2 px-3.5 py-2.5">
              <dt className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-1.5 rounded-full bg-ok" aria-hidden /> Ready to connect
              </dt>
              <dd className="font-heading text-[0.95rem] font-extrabold tabular-nums">{readyCount}</dd>
            </div>
            <div className="flex items-center gap-2 border-s border-border/80 px-3.5 py-2.5">
              <dt className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-1.5 rounded-full bg-soon" aria-hidden /> Awaiting approval
              </dt>
              <dd className="font-heading text-[0.95rem] font-extrabold tabular-nums">{waiting}</dd>
            </div>
          </dl>
          <p className="mt-2.5 max-w-[24rem] text-[0.78rem] leading-relaxed text-muted-foreground">Each platform approves SociVanta before accounts can be linked — nothing for you to set up.</p>

          <div className="mt-7 max-w-[26rem] border-t border-border/80 pt-6">
            <Link href={SOCIAL_ROUTES.overview} className={cn(textLink, "text-[0.9rem]")}>
              Explore Your Social Workspace
              <ArrowRight className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-1 group-focus-visible:translate-x-1 motion-reduce:transition-none" aria-hidden />
            </Link>
          </div>
        </Reveal>

        <ul className="self-start divide-y divide-border/60 overflow-hidden rounded-[1.5rem] bg-card shadow-[0_1px_2px_rgb(32_33_39/0.04),0_24px_48px_-40px_rgb(32_33_39/0.35)] ring-1 ring-border/80 dark:shadow-none">
          {SOCIAL_PLATFORMS.map((p, i) => (
            <StaggerItem
              key={p.id}
              index={i}
              className="group/row grid grid-cols-[auto_minmax(0,1fr)_auto] motion-reduce:!transform-none motion-reduce:!opacity-100 items-center gap-x-3.5 gap-y-2.5 px-4 py-3.5 transition-colors duration-200 ease-out hover:bg-primary/[0.035] sm:px-5 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:gap-x-4 md:py-4 dark:hover:bg-primary/[0.07]"
            >
              <Tile id={p.id} size="sm" className="size-10 rounded-xl transition-transform duration-200 ease-out group-hover/row:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover/row:scale-100 [&_svg]:size-[1.15rem]" />
              <div className="min-w-0">
                <h3 className="font-heading text-[0.98rem] leading-tight font-bold transition-colors duration-200 group-hover/row:text-primary">{p.name}</h3>
                <p className="mt-0.5 text-[0.78rem] text-muted-foreground md:truncate">{p.accountKind}</p>
              </div>
              <ul className="col-span-3 col-start-1 flex flex-wrap gap-1 md:col-span-1 md:col-start-3 md:row-start-1 md:justify-end" aria-label={`What ${p.name} shares`}>
                {shares(p).map((s) => (
                  <li key={s} className="rounded-md bg-muted/60 px-2 py-0.5 text-[0.68rem] font-medium text-foreground/65 ring-1 ring-border/50 ring-inset dark:bg-white/[0.04] dark:text-foreground/70">
                    {s}
                  </li>
                ))}
              </ul>
              <span className={cn("col-start-3 row-start-1 inline-flex items-center gap-1.5 justify-self-end rounded-full px-2.5 py-1 text-[0.66rem] leading-none font-semibold whitespace-nowrap ring-1 ring-inset md:col-start-4", ready[p.id] ? "bg-ok-soft text-ok ring-ok/15" : "bg-soon-soft/60 text-soon ring-soon/15")}>
                <span className={cn("size-1.5 rounded-full", ready[p.id] ? "bg-ok" : "bg-soon")} aria-hidden />
                {ready[p.id] ? "Ready to connect" : "Awaiting approval"}
              </span>
            </StaggerItem>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  One workspace (dark band)                                                 */
/* -------------------------------------------------------------------------- */

function Workspace() {
  const features = [
    { icon: LayoutGrid, title: "Every account, side by side", body: "Instagram next to YouTube next to your Facebook Pages — one social media dashboard instead of six tabs." },
    { icon: HeartPulse, title: "Connection health at a glance", body: "See which connections are up to date and which need a quick reconnect, with the exact fix spelled out." },
    { icon: RefreshCw, title: "Insights the platforms share", body: "Follower, post and view counts — only where a platform shares them, exactly as reported, with the time of your last refresh." },
    { icon: Clock, title: "A clear, honest history", body: "Every connection, refresh and disconnection is recorded in plain language, including anything that didn't work." },
  ];
  return (
    <section id="workspace" className="dark relative isolate scroll-mt-16 overflow-hidden bg-[#0b0c10] py-16 text-foreground sm:py-24" aria-labelledby="workspace-title">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(133_98_242/0.6),transparent)]" aria-hidden />
      <div className="pointer-events-none absolute top-1/4 -right-40 -z-10 h-[30rem] w-[40rem] rounded-full bg-[radial-gradient(closest-side,rgb(112_71_235/0.22),transparent)]" aria-hidden />
      <div className={cn(wrap, "grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-16")}>
        <div>
          <Reveal className="max-w-xl">
            <p className={cn(eyebrow, "text-lime")}>Unified workspace</p>
            <h2 id="workspace-title" className={cn(h2, "mt-3 text-white")}>
              A social media dashboard that tells the truth.
            </h2>
            <p className="mt-4 text-[1.05rem] leading-relaxed text-white/60">No invented engagement scores and no padded charts. Just your accounts, their status, and the figures the platforms actually share.</p>
          </Reveal>
          <Reveal className="mt-10">
            <ul className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
              {features.map((f) => (
                <li key={f.title} className="border-t border-white/10 pt-5">
                  <f.icon className="size-5 text-lime" aria-hidden />
                  <h3 className="mt-3 font-heading text-[1.05rem] font-bold text-white">{f.title}</h3>
                  <p className="mt-1.5 text-[0.9rem] leading-relaxed text-white/55">{f.body}</p>
                </li>
              ))}
            </ul>
            <p className="mt-9 inline-flex items-start gap-2 rounded-2xl bg-white/[0.04] px-4 py-3 text-[0.82rem] leading-relaxed text-white/55 ring-1 ring-white/[0.06]">
              <Clock className="mt-0.5 size-4 shrink-0 text-white/40" aria-hidden />
              Drafts, previews and a content calendar are ready now. Publishing to platforms switches on per platform, only after approval and your permission.
            </p>
          </Reveal>
        </div>

        <Reveal>
          <figure className="relative mx-auto w-full max-w-md">
            <div className="overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-[#14151b] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.8)]">
              <div className="relative overflow-hidden bg-graphite px-5 pt-5 pb-5">
                <div className="pointer-events-none absolute -top-20 -right-10 size-48 rounded-full bg-primary/30 blur-3xl" aria-hidden />
                <div className="relative flex items-center gap-3">
                  <Tile id="youtube" size="lg" />
                  <div className="min-w-0">
                    <p className="font-heading text-lg font-bold text-white">Your channel</p>
                    <p className="text-sm text-white/55">YouTube · account details</p>
                  </div>
                  <span className="ms-auto rounded-full border border-dashed border-white/20 px-2 py-0.5 text-[0.62rem] font-bold tracking-[0.1em] text-white/50 uppercase">Preview</span>
                </div>
              </div>
              <div className="space-y-5 p-5">
                <div>
                  <p className="text-[0.78rem] font-bold text-white">Permissions</p>
                  <p className="mt-2 flex items-center gap-2 text-[0.82rem] text-white/70">
                    <ShieldCheck className="size-4 text-[#7ee2a4]" aria-hidden /> View your YouTube account <span className="text-white/40">· read-only</span>
                  </p>
                </div>
                <div>
                  <p className="text-[0.78rem] font-bold text-white">Account insights</p>
                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    {["Subscribers", "Videos", "Views"].map((m) => (
                      <div key={m} className="rounded-xl bg-white/[0.04] px-2.5 py-2">
                        <p className="text-[0.62rem] font-semibold text-white/50">{m}</p>
                        <span className="sv-shimmer mt-1.5 block h-2 w-3/4 rounded-full bg-white/10" aria-hidden />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2" aria-hidden>
                  <span className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary/90 text-[0.8rem] font-semibold text-primary-foreground">
                    <RefreshCw className="size-3.5" /> Refresh now
                  </span>
                  <span className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-white/10 px-3 text-[0.8rem] font-semibold text-[#f39a9a]">
                    <Link2Off className="size-3.5" /> Disconnect
                  </span>
                </div>
              </div>
            </div>
            <figcaption className="mt-3 text-center text-[0.75rem] text-white/45">How account details will look. Previews never show figures.</figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  How connections work                                                      */
/* -------------------------------------------------------------------------- */

function HowItWorks() {
  const steps = [
    { icon: MousePointerClick, title: "Connect", body: "Choose a platform in your workspace and see exactly what SociVanta will be able to read — before anything happens." },
    { icon: KeyRound, title: "Authorize", body: "Sign in on the platform's own page and approve read-only access. SociVanta never sees or stores your password." },
    { icon: LayoutGrid, title: "Manage", body: "Your account appears in the workspace. Refresh it when you like, reconnect when access ends, or disconnect any time." },
  ];
  return (
    <section id="how-it-works" className="scroll-mt-20 py-16 sm:py-24" aria-labelledby="how-title">
      <div className={wrap}>
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className={cn(eyebrow, "text-primary")}>How it works</p>
          <h2 id="how-title" className={cn(h2, "mt-3")}>
            Connect social media accounts in three steps.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">The same simple flow for every platform. Nothing to install and no passwords to share.</p>
        </Reveal>
        <Reveal className="mt-12">
          <ol className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
            {steps.map((s, i) => (
              <li key={s.title} className="relative rounded-[1.5rem] bg-card p-6 ring-1 ring-border sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-xl bg-primary/[0.08] text-primary dark:bg-primary/20 dark:text-[#c9bcff]">
                    <s.icon className="size-5" aria-hidden />
                  </span>
                  <span className="font-heading text-[2.2rem] leading-none font-extrabold text-foreground/[0.08] tabular-nums" aria-hidden>
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mt-5 font-heading text-xl font-bold">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </h3>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Security & privacy                                                        */
/* -------------------------------------------------------------------------- */

function Security() {
  const points = [
    { icon: UserRoundCheck, title: "Official sign-in only", body: "Accounts connect through each platform's own authorization (OAuth 2.0), using single-use, short-lived links protected against forgery." },
    { icon: Ban, title: "The fewest permissions possible", body: "Read-only access to profile details and shared figures. Permission to post, message, edit or advertise is never requested." },
    { icon: LockKeyhole, title: "Encrypted, server-side access", body: "Access tokens are encrypted at rest on SociVanta's servers and never sent to your browser, logs or anyone else." },
    { icon: Link2Off, title: "Disconnect means disconnect", body: "Stored access is deleted immediately. Where a platform allows it we revoke access there too — and if it doesn't confirm, we tell you." },
  ];
  return (
    <section id="security" className="scroll-mt-20 border-t bg-subtle/50 py-16 sm:py-24 dark:bg-white/[0.015]" aria-labelledby="security-title">
      <div className={cn(wrap, "grid grid-cols-1 gap-10 lg:grid-cols-[0.85fr_1.3fr] lg:gap-16")}>
        <Reveal>
          <p className={cn(eyebrow, "text-primary")}>Security &amp; privacy</p>
          <h2 id="security-title" className={cn(h2, "mt-3")}>
            Your accounts stay yours.
          </h2>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-muted-foreground">SociVanta reads only what you approve, keeps it encrypted, and lets you take it back in one click.</p>
          <div className="mt-8 flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ok-soft text-ok">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Separate from your orders and wallet.</span> Connecting an account can&apos;t place orders or move money.
            </p>
          </div>
        </Reveal>
        <Reveal>
          <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-[1.75rem] bg-border ring-1 ring-border sm:grid-cols-2">
            {points.map((p) => (
              <li key={p.title} className="bg-card p-6 sm:p-7">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/[0.08] text-primary dark:bg-primary/20 dark:text-[#c9bcff]">
                  <p.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-heading text-[1.05rem] font-bold">{p.title}</h3>
                <p className="mt-1.5 text-[0.92rem] leading-relaxed text-muted-foreground">{p.body}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  FAQ + final CTA                                                           */
/* -------------------------------------------------------------------------- */

function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <section id="faq" className="scroll-mt-20 py-16 sm:py-24" aria-labelledby="faq-title">
      <div className={cn(wrap, "grid grid-cols-1 gap-10 lg:grid-cols-[0.85fr_1.4fr] lg:gap-16")}>
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <p className={cn(eyebrow, "text-primary")}>Questions</p>
          <h2 id="faq-title" className={cn(h2, "mt-3")}>
            Social media management, answered.
          </h2>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-muted-foreground">What connects, what it can see, and how you stay in control.</p>
          <p className="mt-8 text-sm text-muted-foreground">
            Looking for help writing posts?{" "}
            <Link href="/ai-tools" className="font-semibold text-primary hover:underline">
              Explore SociVanta AI tools
            </Link>
            .
          </p>
        </Reveal>
        <div className="space-y-3">
          {items.map((f, i) => (
            <details
              key={f.q}
              name="social-faq"
              open={i === 0}
              className="group rounded-2xl bg-card ring-1 ring-border transition-[box-shadow] open:shadow-[0_18px_40px_-30px_rgb(112_71_235/0.5)] open:ring-primary/30 hover:ring-foreground/15 open:hover:ring-primary/30 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center gap-4 rounded-2xl px-5 py-5 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:px-6">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-[0.75rem] font-bold text-muted-foreground tabular-nums transition-colors group-open:bg-primary group-open:text-primary-foreground" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="flex-1 font-heading text-[1.02rem] leading-snug font-bold sm:text-[1.1rem]">{f.q}</h3>
                <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 group-open:text-primary motion-reduce:transition-none" aria-hidden />
              </summary>
              <p className="px-5 pb-6 text-[0.98rem] leading-relaxed text-muted-foreground sm:px-6 sm:pl-[4.5rem]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="pb-16 sm:pb-24" aria-labelledby="cta-title">
      <div className={wrap}>
        <Reveal className="relative isolate overflow-hidden rounded-[2rem] bg-graphite px-6 pt-12 pb-11 text-center text-white sm:px-12 sm:pt-16 dark:border dark:border-white/[0.06] dark:bg-[#121318]">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_50%_0%,rgb(112_71_235/0.35),transparent_70%)]" aria-hidden />
          <ul className="mx-auto flex flex-wrap justify-center gap-2" aria-label="Platforms SociVanta is preparing to support">
            {SOCIAL_PLATFORMS.map((p) => (
              <li key={p.id} title={p.name}>
                <Tile id={p.id} size="md" className="ring-white/10" />
              </li>
            ))}
          </ul>
          <h2 id="cta-title" className="mx-auto mt-9 max-w-3xl font-heading text-[2.3rem] leading-[1.02] font-extrabold tracking-[-0.04em] text-balance sm:text-[3.4rem]">
            Every account. One calm view.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-white/60">Your social workspace is already open with your SociVanta account. Each platform switches on as soon as it approves SociVanta.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
            <Link href={SOCIAL_ROUTES.overview} className={cn(primaryCta, "w-full bg-lime text-graphite shadow-none hover:bg-lime/90 focus-visible:ring-lime/40 sm:w-auto")}>
              Open Social Workspace <ArrowRight className={arrow} aria-hidden />
            </Link>
            <p className="text-sm text-white/60">
              New to SociVanta?{" "}
              <Link href="/register" className="font-semibold text-white underline-offset-4 hover:underline">
                Create a free account
              </Link>
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function SocialLanding({ ready }: { ready: LandingAvailability }) {
  return (
    <>
      <Hero ready={ready} />
      <Platforms ready={ready} />
      <Workspace />
      <HowItWorks />
      <Security />
      <Faq items={socialFaq(ready)} />
      <FinalCta />
    </>
  );
}
