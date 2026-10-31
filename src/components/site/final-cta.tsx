"use client";

import { ArrowRight } from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { Reveal } from "@/components/site/primitives";
import { CATALOG_TOTALS, PLATFORMS } from "@/lib/catalog";

export function FinalCta() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <Reveal className="relative isolate mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-graphite px-6 py-12 text-white sm:px-12 sm:py-16 lg:px-16 lg:py-20">
        <div className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [--border:#fff]" aria-hidden />
        <div className="pointer-events-none absolute -top-40 -left-20 -z-10 h-96 w-[36rem] rounded-full bg-primary/55 blur-[110px]" aria-hidden />
        <div className="pointer-events-none absolute -right-24 -bottom-40 -z-10 h-80 w-96 rounded-full bg-lime/15 blur-[100px]" aria-hidden />

        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <h2 className="max-w-2xl text-[2rem] leading-[1.08] font-extrabold text-balance sm:text-5xl lg:text-[3.4rem]">
              Everything Your Social Presence Needs. <span className="text-lime">In One Place.</span>
            </h2>
            <p className="mt-5 max-w-lg leading-relaxed text-white/65 sm:text-lg">
              Browse every platform, compare services with clear details, and know exactly how your order works.
            </p>
          </div>

          <div className="lg:justify-self-end">
            <div className="flex -space-x-2" aria-hidden>
              {PLATFORMS.slice(0, 8).map((p) => (
                <PlatformTile key={p.id} platform={p} size="sm" className="rounded-full ring-2 ring-graphite" />
              ))}
              <span className="grid size-8 place-items-center rounded-full bg-white/10 text-[0.65rem] font-bold ring-2 ring-graphite">
                +{PLATFORMS.length - 8}
              </span>
            </div>
            <p className="mt-3 text-sm text-white/60">
              {CATALOG_TOTALS.services} services across {CATALOG_TOTALS.platforms} platforms
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <a
                href="#services"
                className="btn-shine group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-lime px-7 font-semibold text-graphite shadow-[0_12px_40px_-12px_rgb(200_255_82/0.6)] transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-lime/50 focus-visible:outline-none"
              >
                Explore Services
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </a>
              <a
                href="#how-it-works"
                className="inline-flex h-12 items-center justify-center rounded-full px-6 font-semibold text-white/85 ring-1 ring-white/20 transition-colors hover:bg-white/10 hover:text-white"
              >
                How It Works
              </a>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
