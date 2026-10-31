"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AI_CATEGORIES, AI_TOOLS, type AiCategoryId, type AiTool, aiToolHref } from "@/lib/ai/registry";
import { cn } from "@/lib/utils";
import { LiveAvailabilityBadge } from "./live-badge";
import { FAMILY, ToolGlyph } from "./parts";

/*
 * Tools directory — a marketplace you can scan in seconds: category tabs and
 * one consistent card for every tool. All 13 registered tools appear once in
 * "All tools", each with its real status and working route.
 */

type Tab = AiCategoryId | "all";

const NOTES: Record<AiCategoryId, string> = {
  content: "Launching first — words, tags, ideas and plans for your next posts.",
  growth: "Up next — priorities, staged plans and services that fit your goal.",
  assist: "On the roadmap — help finding services, understanding orders and getting answers.",
};

function ToolCard({ tool }: { tool: AiTool }) {
  return (
    <Link
      href={aiToolHref(tool)}
      className="group flex h-full flex-col rounded-[1.25rem] border bg-card p-5 transition-[border-color,box-shadow] duration-200 hover:border-primary/35 hover:shadow-[0_18px_40px_-28px_rgb(112_71_235/0.55)] focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/25 focus-visible:outline-none motion-reduce:transition-none"
    >
      <div className="flex items-start justify-between gap-3">
        <ToolGlyph tool={tool} />
        <LiveAvailabilityBadge tool={tool} />
      </div>
      <h4 className="mt-4 font-heading text-[1.05rem] leading-snug font-bold">{tool.name.replace(/^AI /, "")}</h4>
      <p className="mt-1.5 flex-1 text-[0.92rem] leading-relaxed text-muted-foreground">{tool.tagline}</p>
      <div className="mt-5 flex items-center justify-between border-t pt-3.5 text-[0.78rem] font-medium text-muted-foreground">
        <span>{FAMILY[tool.category].name}</span>
        <span className="inline-flex items-center gap-1 text-foreground/70 transition-colors group-hover:text-primary group-focus-visible:text-primary">
          View tool <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

export function AiDirectory() {
  const [tab, setTab] = React.useState<Tab>("all");
  const tabs: { id: Tab; name: string; count: number }[] = [
    { id: "all", name: "All tools", count: AI_TOOLS.length },
    ...AI_CATEGORIES.map((c) => ({ id: c.id, name: FAMILY[c.id].name, count: AI_TOOLS.filter((t) => t.category === c.id).length })),
  ];
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const groups = AI_CATEGORIES.filter((c) => tab === "all" || c.id === tab);

  const onKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === tab);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    setTab(tabs[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <div className="-mx-4 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:px-0">
        <div role="tablist" aria-label="Tool categories" onKeyDown={onKey} className="inline-flex gap-1 rounded-full border bg-card p-1 shadow-[0_1px_2px_rgb(32_33_39/0.04)]">
          {tabs.map((t, i) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                id={`ai-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls="ai-tools-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:outline-none",
                  on ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t.name}
                <span className={cn("rounded-full px-1.5 py-px text-[0.7rem] tabular-nums", on ? "bg-background/15" : "bg-muted")}>{t.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div id="ai-tools-panel" role="tabpanel" aria-labelledby={`ai-tab-${tab}`} className="mt-10 space-y-12">
        {groups.map((c) => {
          const tools = AI_TOOLS.filter((t) => t.category === c.id);
          return (
            <section key={c.id} aria-labelledby={`family-${c.id}`}>
              <div className="flex flex-col gap-1 border-b pb-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                <h3 id={`family-${c.id}`} className="font-heading text-xl font-bold tracking-tight">
                  {FAMILY[c.id].name}
                </h3>
                <p className="text-sm text-muted-foreground">{NOTES[c.id]}</p>
              </div>
              <ul className={cn("mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2", c.id === "content" ? "xl:grid-cols-4" : "lg:grid-cols-3")}>
                {tools.map((t) => (
                  <li key={t.id}>
                    <ToolCard tool={t} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
