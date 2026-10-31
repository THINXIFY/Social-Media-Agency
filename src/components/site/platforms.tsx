"use client";

import { motion } from "motion/react";
import { ArrowRight, LayoutGrid, Plus } from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { useCatalogFilters, usePreview } from "@/components/providers";
import { CATEGORY_ICONS, Section, SectionHeading } from "@/components/site/primitives";
import { CATALOG_TOTALS, CATEGORY_META, PLATFORMS, platformSummary } from "@/lib/catalog";

const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "0px 0px -40px 0px" },
  transition: { duration: 0.5, delay },
});

export function Platforms() {
  const { explore } = useCatalogFilters();
  const preview = usePreview();

  return (
    <Section id="platforms" className="border-t bg-surface/60">
      <SectionHeading
        eyebrow="Explore social platforms"
        title="Every major network, organised the same way."
        description="Pick a platform to see its service categories and every service in the catalog."
      />

      {/* Grid spans are chosen so every breakpoint ends on a full row:
          banner (full) + 15 platforms + "more" card. */}
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {/* All platforms — banner */}
        <motion.li {...reveal()} className="col-span-full">
          <button
            type="button"
            onClick={() => explore()}
            className="group relative flex w-full flex-col gap-6 overflow-hidden rounded-3xl bg-graphite p-6 text-left text-white transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-primary/50 focus-visible:outline-none sm:flex-row sm:items-center sm:p-7"
          >
            <div className="pointer-events-none absolute -top-24 left-1/3 size-72 rounded-full bg-primary/45 blur-3xl" aria-hidden />
            <div className="relative flex items-center gap-4 sm:flex-1">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-lime text-graphite">
                <LayoutGrid className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block font-heading text-xl font-bold">All Platforms</span>
                <span className="mt-0.5 block text-sm text-white/65">Browse the full catalog across every network.</span>
              </span>
            </div>

            <dl className="relative grid grid-cols-3 gap-6 sm:flex sm:gap-8">
              {[
                [CATALOG_TOTALS.services, "Services"],
                [CATALOG_TOTALS.platforms, "Platforms"],
                [CATALOG_TOTALS.categories, "Service types"],
              ].map(([value, label]) => (
                <div key={label} className="flex flex-col-reverse">
                  <dt className="text-xs text-white/55">{label}</dt>
                  <dd className="font-heading text-2xl font-extrabold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>

            <span className="relative inline-flex items-center justify-center gap-1.5 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold ring-1 ring-white/15 transition-colors group-hover:bg-lime group-hover:text-graphite group-hover:ring-lime">
              Explore all <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </button>
        </motion.li>

        {PLATFORMS.map((p, i) => {
          const s = platformSummary(p.id);
          return (
            <motion.li key={p.id} {...reveal((i % 4) * 0.05)}>
              <article className="group relative isolate flex h-full flex-col overflow-hidden rounded-3xl border bg-card p-4 transition-all duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-float sm:p-5">
                {/* Brand tint — gives each card its own character within one layout */}
                <span
                  className="pointer-events-none absolute -top-14 -right-14 -z-10 size-40 rounded-full opacity-[0.13] blur-2xl transition-opacity duration-300 group-hover:opacity-25 dark:opacity-20"
                  style={{ backgroundColor: p.color === "#0F1014" ? "#7047EB" : p.color }}
                  aria-hidden
                />

                <div className="flex items-start justify-between gap-3">
                  <PlatformTile platform={p} className="transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3" />
                  <span className="text-right">
                    <span className="block font-heading text-xl leading-none font-extrabold tabular-nums sm:text-2xl">{s.total}</span>
                    <span className="text-[0.68rem] font-medium text-muted-foreground">services</span>
                  </span>
                </div>

                <h3 className="mt-4 text-[0.95rem] font-bold sm:text-base">{p.name}</h3>
                <p className="mt-0.5 hidden text-sm text-muted-foreground sm:block">{p.tagline}</p>

                <ul className="mt-4 hidden flex-wrap gap-1.5 sm:flex" aria-label={`${p.name} categories`}>
                  {s.categories.slice(0, 4).map((c) => {
                    const Icon = CATEGORY_ICONS[c];
                    return (
                      <li
                        key={c}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground"
                      >
                        <Icon className="size-3" aria-hidden />
                        {CATEGORY_META[c].short}
                      </li>
                    );
                  })}
                  {s.categories.length > 4 ? (
                    <li className="px-1 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
                      +{s.categories.length - 4}
                    </li>
                  ) : null}
                </ul>

                <div className="mt-auto pt-4 sm:pt-5">
                  <button
                    type="button"
                    onClick={() => explore({ platform: p.id })}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary after:absolute after:inset-0 after:rounded-3xl focus-visible:outline-none focus-visible:after:ring-3 focus-visible:after:ring-primary/40"
                    aria-label={`Explore ${p.name} services`}
                  >
                    Explore
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                  </button>
                </div>
              </article>
            </motion.li>
          );
        })}

        {/* Extensibility placeholder */}
        <li className="lg:col-span-3 xl:col-span-1">
          <button
            type="button"
            onClick={() =>
              preview({
                title: "Suggest a platform",
                description:
                  "The catalog is built to add new networks and categories without a redesign. Platform requests will open with customer accounts in the next phase.",
              })
            }
            className="flex h-full min-h-36 w-full flex-col items-center justify-center gap-2.5 rounded-3xl border border-dashed p-5 text-center text-muted-foreground transition-colors hover:border-primary/50 hover:bg-card/60 hover:text-foreground lg:min-h-0 lg:flex-row lg:py-5 xl:min-h-48 xl:flex-col"
          >
            <span className="grid size-10 place-items-center rounded-xl border border-dashed">
              <Plus className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold">More platforms planned</span>
              <span className="block text-xs">New networks plug into the same structure.</span>
            </span>
          </button>
        </li>
      </ul>
    </Section>
  );
}
