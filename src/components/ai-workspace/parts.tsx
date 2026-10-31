"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { AI_ROUTES } from "@/lib/ai/workspace";
import { cn } from "@/lib/utils";

/* The AI workspace's own header and compact navigation (AI-09), so the main sidebar stays short. */

export const aiPage = "mx-auto max-w-[90rem] px-3 py-4 sm:px-6 sm:py-7 lg:px-8";
export const sectionTitle = "font-heading text-[1.2rem] leading-tight font-extrabold tracking-tight sm:text-[1.35rem]";

const TABS = [
  { href: AI_ROUTES.home, label: "Home" },
  { href: AI_ROUTES.usage, label: "Usage" },
  { href: AI_ROUTES.plans, label: "Plans" },
  { href: "/dashboard/social", label: "Social workspace" },
] as const;

export function AiNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="SociVanta AI" className={cn("-mx-1 overflow-x-auto px-1", className)}>
      <ul className="inline-flex gap-1 rounded-full border bg-card p-1 shadow-soft">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none",
                  active ? "bg-graphite text-white dark:bg-white dark:text-graphite" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AiHeader({ kicker, title, subtitle, aside }: { kicker?: string; title: string; subtitle: string; aside?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-3xl">
          <p className="inline-flex items-center gap-1.5 text-[0.7rem] font-bold tracking-[0.16em] text-primary uppercase dark:text-[#b9a6ff]">
            <Sparkles className="size-3.5" aria-hidden /> SociVanta AI{kicker ? <span className="text-muted-foreground"> · {kicker}</span> : null}
          </p>
          <h1 className="mt-2 font-heading text-[1.85rem] leading-[1.1] font-extrabold tracking-tight text-balance sm:text-[2.4rem]">{title}</h1>
          <p className="mt-2 max-w-2xl text-[0.98rem] text-pretty text-muted-foreground">{subtitle}</p>
        </div>
        {aside}
      </div>
      <AiNav />
    </header>
  );
}
