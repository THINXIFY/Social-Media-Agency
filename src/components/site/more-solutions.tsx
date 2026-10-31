"use client";

import { ArrowUpRight, Bot, Briefcase, Package } from "lucide-react";
import { usePreview } from "@/components/providers";
import { Eyebrow, Reveal } from "@/components/site/primitives";

const SOLUTIONS = [
  {
    icon: Briefcase,
    title: "Social Media Management Agency",
    body: "Done-for-you content planning, publishing and reporting.",
  },
  {
    icon: Bot,
    title: "AI Social Media SaaS",
    body: "Drafting, scheduling and insights tools for creators and teams.",
  },
  {
    icon: Package,
    title: "Digital Products Marketplace",
    body: "Templates, guides and assets for social media work.",
  },
];

export function MoreSolutions() {
  const preview = usePreview();
  return (
    <section id="more-solutions" className="border-t py-16 sm:py-20">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="grid grid-cols-1 gap-8 lg:grid-cols-[0.8fr_2fr] lg:items-center">
          <div>
            <Eyebrow>More solutions</Eyebrow>
            <h2 className="mt-3 text-2xl font-bold">Also on the Sociotix roadmap</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Our focus is the services marketplace. These are planned additions for later.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {SOLUTIONS.map((s) => (
              <li key={s.title}>
                <button
                  type="button"
                  onClick={() =>
                    preview({
                      title: s.title,
                      description: `${s.body} This is a future Sociotix offering and isn't available yet.`,
                    })
                  }
                  className="group flex h-full w-full flex-col rounded-2xl border bg-card/60 p-4 text-left transition-colors hover:bg-card"
                >
                  <span className="flex items-center justify-between">
                    <s.icon className="size-5 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[0.68rem] font-semibold text-muted-foreground">
                      Planned
                    </span>
                  </span>
                  <span className="mt-4 text-sm font-semibold">{s.title}</span>
                  <span className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.body}</span>
                  <ArrowUpRight className="mt-3 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
