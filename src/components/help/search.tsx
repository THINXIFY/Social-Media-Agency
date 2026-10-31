"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Search, X } from "lucide-react";
import { HELP_ARTICLES, HELP_CATEGORIES, helpHref } from "@/lib/help/articles";
import { cn } from "@/lib/utils";

const CATEGORY_NAME = Object.fromEntries(HELP_CATEGORIES.map((c) => [c.id, c.name]));

/** Ranks articles by where the words match: title first, then keywords, then the answer. */
export function searchHelp(query: string) {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  return HELP_ARTICLES.map((a) => {
    const title = a.title.toLowerCase();
    const keys = a.keywords.join(" ").toLowerCase();
    const text = `${a.answer} ${(a.steps ?? []).join(" ")} ${(a.body ?? []).join(" ")}`.toLowerCase();
    let score = 0;
    for (const w of words) score += (title.includes(w) ? 5 : 0) + (keys.includes(w) ? 3 : 0) + (text.includes(w) ? 1 : 0);
    return { a, score };
  })
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 6)
    .map((r) => r.a);
}

/** Instant article search. Every article is also linked below it, so the page works without JavaScript. */
export function HelpSearch({ autoFocus = false, compact = false }: { autoFocus?: boolean; compact?: boolean }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const input = React.useRef<HTMLInputElement>(null);
  const results = React.useMemo(() => searchHelp(q), [q]);
  const show = q.trim().length > 1;
  const listId = compact ? "help-results-compact" : "help-results";

  return (
    <div className="relative w-full">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const pick = results[active] ?? results[0];
          if (pick) router.push(helpHref(pick.slug));
        }}
      >
        <label htmlFor={`${listId}-input`} className="sr-only">
          Search help articles
        </label>
        <Search className={cn("pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground", compact ? "size-4" : "size-5")} aria-hidden />
        <input
          ref={input}
          id={`${listId}-input`}
          type="search"
          role="combobox"
          aria-expanded={show}
          aria-controls={listId}
          aria-activedescendant={show && results[active] ? `${listId}-${results[active].slug}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => (setQ(e.target.value), setActive(0))}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Escape" && q) {
              e.preventDefault();
              setQ("");
            }
          }}
          placeholder="Search for answers, e.g. “cancel an order”"
          className={cn(
            "w-full rounded-2xl border bg-card ps-12 pe-12 shadow-[0_12px_32px_-22px_rgb(32_33_39/0.45)] transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground/80 hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-4 focus-visible:ring-primary/15 [&::-webkit-search-cancel-button]:hidden",
            compact ? "h-11 text-sm" : "h-14 text-base",
          )}
        />
        {q ? (
          <button type="button" onClick={() => (setQ(""), input.current?.focus())} aria-label="Clear search" className="absolute end-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </form>
      {show ? (
        <div id={listId} role="listbox" aria-label="Matching articles" className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border bg-popover text-start shadow-float">
          {results.length ? (
            <ul className="p-1.5">
              {results.map((a, i) => (
                <li key={a.slug} id={`${listId}-${a.slug}`} role="option" aria-selected={i === active}>
                  <Link href={helpHref(a.slug)} onMouseEnter={() => setActive(i)} className={cn("flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors", i === active ? "bg-muted" : "hover:bg-muted/60")}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{a.title}</span>
                      <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{a.answer}</span>
                    </span>
                    <span className="mt-0.5 shrink-0 text-[0.7rem] font-medium text-muted-foreground">{CATEGORY_NAME[a.category]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-5 text-sm">
              <p className="font-semibold">No articles match “{q.trim()}”</p>
              <p className="mt-1 text-muted-foreground">Try other words, or ask our team directly.</p>
              <Link href="/dashboard/support?new=1" className="mt-3 inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                Open a support ticket <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
