"use client";

import { motion } from "motion/react";
import {
  Check,
  FileText,
  Headset,
  LayoutDashboard,
  MousePointer2,
  Radar,
  ScanSearch,
  Search,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { CATEGORY_ICONS, Section, SectionHeading } from "@/components/site/primitives";
import { cn } from "@/lib/utils";
import { CATALOG_TOTALS, CATEGORY_META, PLATFORMS, PLATFORM_BY_ID, SERVICE_BY_ID } from "@/lib/catalog";

type Visual = "discovery" | "order" | "info" | "mobile" | "support" | "tracking" | "dashboard";

const FEATURES: { icon: LucideIcon; title: string; body: string; visual: Visual; span?: string }[] = [
  {
    icon: ScanSearch,
    title: "Extensive service discovery",
    body: `${CATALOG_TOTALS.services} catalog entries across ${CATALOG_TOTALS.platforms} platforms, searchable by network, need or service type.`,
    visual: "discovery",
    span: "sm:col-span-2 lg:row-span-2",
  },
  {
    icon: MousePointer2,
    title: "Simple order experience",
    body: "Pick, configure, review, confirm. No cluttered forms or hidden extras.",
    visual: "order",
  },
  {
    icon: FileText,
    title: "Clear service information",
    body: "What's included, how it's delivered and what you provide — before you order.",
    visual: "info",
  },
  {
    icon: Smartphone,
    title: "Built for mobile",
    body: "Every filter, order and status works just as well on a phone.",
    visual: "mobile",
  },
  {
    icon: Headset,
    title: "Organised support",
    body: "Support attaches to the exact order, so you never repeat yourself.",
    visual: "support",
  },
  {
    icon: Radar,
    title: "Transparent order tracking",
    body: "Milestones update only when they're confirmed, with a full activity log.",
    visual: "tracking",
    span: "sm:col-span-2",
  },
  {
    icon: LayoutDashboard,
    title: "User-friendly dashboard",
    body: "Balance, orders, notifications and support in one calm view.",
    visual: "dashboard",
    span: "sm:col-span-2",
  },
];

export function WhyChoose() {
  return (
    <Section id="why" className="border-t">
      <SectionHeading
        eyebrow="Why Sociotix"
        title={
          <>
            Cleaner than a typical SMM panel.
            <br className="hidden sm:block" /> <span className="text-muted-foreground">By design.</span>
          </>
        }
        description="We focus on the things that make ordering easy to understand — and leave out the noise."
      />

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-[auto_auto_auto]">
        {FEATURES.map((f, i) => (
          <motion.li
            key={f.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -40px 0px" }}
            transition={{ duration: 0.5, delay: (i % 4) * 0.06 }}
            className={cn(
              "group flex flex-col overflow-hidden rounded-3xl border bg-card p-2 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-float",
              f.span,
            )}
          >
            <div
              className={cn(
                "relative flex items-center justify-center overflow-hidden rounded-[1.25rem] bg-subtle px-4 py-5 dark:bg-background/60",
                f.visual === "discovery" ? "min-h-56 lg:flex-1" : "min-h-36",
              )}
              aria-hidden
            >
              <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,#000_20%,transparent_75%)]" />
              <div className="relative w-full transition-transform duration-500 group-hover:scale-[1.02]">
                <FeatureVisual visual={f.visual} />
              </div>
            </div>
            <div className="flex gap-3 px-3 pt-4 pb-3 sm:px-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <f.icon className="size-4" aria-hidden />
              </span>
              <div>
                <h3 className="text-base font-bold">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            </div>
          </motion.li>
        ))}
      </ul>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Product-style mini visuals (decorative)                                   */
/* -------------------------------------------------------------------------- */

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card shadow-soft", className)}>
      {children}
    </div>
  );
}

function FeatureVisual({ visual }: { visual: Visual }) {
  switch (visual) {
    case "discovery": {
      const rows = ["instagram-followers", "x-followers", "youtube-channel-subscribers"].map((id) => SERVICE_BY_ID[id]);
      return (
        <div className="mx-auto max-w-sm space-y-2.5">
          <Chip className="flex h-11 items-center gap-2 px-3.5 text-sm">
            <Search className="size-4 text-primary" />
            <span>followers</span>
            <span className="h-4 w-px animate-pulse bg-primary" />
            <span className="ml-auto rounded-md bg-muted px-1.5 text-[0.65rem] font-semibold text-muted-foreground">
              {rows.length} of {CATALOG_TOTALS.services}
            </span>
          </Chip>
          {rows.map((s, i) => {
            const p = PLATFORM_BY_ID[s.platformId];
            const Icon = CATEGORY_ICONS[s.category];
            return (
              <Chip
                key={s.id}
                className={cn("flex items-center gap-2.5 p-2.5", i === 0 && "ring-2 ring-primary/30")}
              >
                <PlatformTile platform={p} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{s.name}</span>
                  <span className="flex items-center gap-1 text-[0.65rem] text-muted-foreground">
                    <Icon className="size-3" /> {CATEGORY_META[s.category].label}
                  </span>
                </span>
              </Chip>
            );
          })}
          <div className="flex flex-wrap justify-center gap-1.5 pt-2">
            {PLATFORMS.map((p) => (
              <PlatformTile key={p.id} platform={p} size="xs" className="rounded-full" />
            ))}
          </div>
        </div>
      );
    }
    case "order":
      return (
        <div className="flex items-center justify-center gap-1.5">
          {["Pick", "Configure", "Confirm"].map((step, i) => (
            <div key={step} className="flex items-center gap-1.5">
              <Chip
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-[0.7rem] font-semibold",
                  i === 2 && "border-primary bg-primary text-primary-foreground",
                )}
              >
                {i < 2 ? <Check className="size-3 text-primary" strokeWidth={3} /> : null}
                {step}
              </Chip>
              {i < 2 ? <span className="h-px w-2 bg-border" /> : null}
            </div>
          ))}
        </div>
      );
    case "info":
      return (
        <Chip className="mx-auto max-w-[15rem] space-y-2 p-3">
          {["What's included", "How it's delivered", "What you provide"].map((line) => (
            <div key={line} className="flex items-center gap-2 text-[0.72rem] font-medium">
              <span className="grid size-4 place-items-center rounded-full bg-ok-soft text-ok">
                <Check className="size-2.5" strokeWidth={3.5} />
              </span>
              {line}
            </div>
          ))}
        </Chip>
      );
    case "mobile":
      return (
        <div className="mx-auto w-24 rounded-[1.1rem] border-2 border-foreground/15 bg-card p-1.5 shadow-soft">
          <div className="mx-auto mb-1.5 h-1 w-6 rounded-full bg-foreground/15" />
          <div className="space-y-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-1 rounded-md bg-muted p-1">
                <span className="size-3 rounded bg-primary/70" />
                <span className="h-1 flex-1 rounded-full bg-foreground/15" />
              </div>
            ))}
          </div>
          <div className="mt-1.5 h-3.5 rounded-full bg-primary" />
        </div>
      );
    case "support":
      return (
        <div className="mx-auto max-w-[15rem] space-y-1.5">
          <Chip className="ml-auto w-fit rounded-br-sm bg-primary px-2.5 py-1.5 text-[0.7rem] font-medium text-primary-foreground">
            Question about #SV-EX-1042
          </Chip>
          <Chip className="w-fit rounded-bl-sm px-2.5 py-1.5 text-[0.7rem]">
            <span className="mb-0.5 block font-mono text-[0.6rem] text-muted-foreground">Order attached</span>
            We can see the full history.
          </Chip>
        </div>
      );
    case "tracking":
      return (
        <div className="mx-auto w-full max-w-md px-2">
          <div className="relative flex items-center justify-between">
            <span className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-border" />
            <span className="absolute top-1/2 left-2 h-0.5 w-[55%] -translate-y-1/2 rounded-full bg-primary" />
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={cn(
                  "relative grid size-6 place-items-center rounded-full ring-4 ring-subtle dark:ring-background",
                  i < 3 ? "bg-primary text-primary-foreground" : "border bg-card",
                )}
              >
                {i < 3 ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
            ))}
          </div>
          <div className="mt-2.5 flex justify-between text-[0.62rem] font-semibold text-muted-foreground">
            {["Placed", "Paid", "Verified", "Delivery", "Done"].map((l) => (
              <span key={l} className="w-10 text-center first:text-left last:text-right">
                {l}
              </span>
            ))}
          </div>
        </div>
      );
    case "dashboard":
      return (
        <div className="mx-auto grid w-full max-w-md grid-cols-[1.3fr_1fr_1fr] gap-2">
          <Chip className="border-transparent bg-graphite p-3 text-white">
            <span className="block text-[0.6rem] text-white/60">Balance</span>
            <span className="mt-2 block h-2 w-12 rounded-full bg-lime" />
            <span className="mt-1.5 block h-1.5 w-8 rounded-full bg-white/20" />
          </Chip>
          {["Active", "Completed"].map((label, i) => (
            <Chip key={label} className="p-3">
              <span className="block text-[0.6rem] text-muted-foreground">{label}</span>
              <span className="mt-2 flex h-6 items-end gap-0.5">
                {[40, 70, 55, 90].map((h, j) => (
                  <span
                    key={j}
                    className={cn("w-1.5 rounded-sm", i === 0 ? "bg-primary/70" : "bg-ok/70")}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </span>
            </Chip>
          ))}
        </div>
      );
  }
}
