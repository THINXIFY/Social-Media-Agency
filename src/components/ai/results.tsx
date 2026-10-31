"use client";

import * as React from "react";
import { CalendarDays, Check, Copy, Download, List, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { AiPlatformIcon } from "./platform-icon";

/*
 * Content Studio results (AI-02). Generated text is untrusted: it's only ever
 * rendered as plain text (React escapes it) or placed in form fields — never
 * as HTML, links or actions. Everything is editable in the browser and
 * nothing is saved or posted.
 */

export interface CaptionResult {
  platforms: { platform: string; variations: { angle: string; text: string }[] }[];
  hooks: string[];
  ctas: string[];
}
export interface HashtagResult {
  groups: { group: string; tags: string[] }[];
  keywords: string[];
}
export interface IdeasResult {
  ideas: { title: string; category: string; format: string; platform: string; hook: string; outline: string[] }[];
}
export interface CalendarResult {
  days: number;
  frequency: number;
  weeks: { week: number; theme: string; startDay: number; endDay: number }[];
  posts: { day: number; week: number; platform: string; format: string; topic: string; notes: string }[];
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers without the async clipboard (or without permission).
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.append(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

export function CopyButton({ text, label, children, className }: { text: string; label: string; children?: React.ReactNode; className?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        copyText(text).then((ok) => {
          if (!ok) return;
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        })
      }
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
        children ? "h-8 border bg-card px-3 text-xs font-semibold text-foreground" : "size-8",
        className,
      )}
    >
      {done ? <Check className="size-3.5 text-primary" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {children}
      <span className="sr-only" aria-live="polite">
        {done ? "Copied" : ""}
      </span>
    </button>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold">{children}</h3>
      {action}
    </div>
  );
}

function EditableText({ value, onChange, label, rows = 4 }: { value: string; onChange: (v: string) => void; label: string; rows?: number }) {
  return (
    <textarea
      aria-label={label}
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className="field-sizing-content min-h-16 w-full resize-y rounded-lg border border-transparent bg-transparent p-2 text-[0.95rem] leading-relaxed whitespace-pre-wrap outline-none hover:border-border focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15"
    />
  );
}

function ListWithCopy({ title, items, kind }: { title: string; items: string[]; kind: string }) {
  return (
    <div>
      <SectionTitle action={<CopyButton text={items.join("\n")} label={`Copy all ${title.toLowerCase()}`}>Copy all</CopyButton>}>{title}</SectionTitle>
      <ul className="mt-2 space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 rounded-xl border bg-background px-3 py-2 text-sm leading-relaxed dark:bg-white/[0.03]">
            <span className="min-w-0 flex-1">{it}</span>
            <CopyButton text={it} label={`Copy ${kind} ${i + 1}`} className="size-7" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Captions ─────────────────────────────────────────────────────────── */

export function CaptionResults({ result }: { result: CaptionResult }) {
  const [drafts, setDrafts] = React.useState(() => result.platforms.map((p) => p.variations.map((v) => v.text)));
  const [active, setActive] = React.useState(0);
  const platform = result.platforms[active];
  return (
    <div className="space-y-6">
      {result.platforms.length > 1 ? (
        <div role="tablist" aria-label="Platform" className="flex flex-wrap gap-1.5">
          {result.platforms.map((p, i) => (
            <button key={p.platform} type="button" role="tab" aria-selected={i === active} onClick={() => setActive(i)} className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors", i === active ? "bg-foreground text-background" : "border bg-card text-muted-foreground hover:text-foreground")}>
              <AiPlatformIcon name={p.platform} className="size-3.5" />
              {p.platform}
            </button>
          ))}
        </div>
      ) : null}
      <div>
        <SectionTitle>{platform.platform} captions</SectionTitle>
        <p className="mt-1 text-xs text-muted-foreground">Three different approaches. Edit any of them, then copy the one you like.</p>
        <ol className="mt-3 space-y-3">
          {platform.variations.map((v, i) => {
            const text = drafts[active][i];
            return (
              <li key={i} className="rounded-2xl border bg-card p-2.5 shadow-[0_1px_2px_rgb(32_33_39/0.04)] transition-colors focus-within:border-primary/40">
                <div className="flex items-center justify-between gap-2 px-1.5 pt-0.5">
                  <span className="flex min-w-0 items-center gap-2 text-xs font-semibold">
                    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary text-[0.7rem] text-primary-foreground">{i + 1}</span>
                    <span className="truncate">
                      Option {i + 1} <span className="font-medium text-muted-foreground">· {v.angle}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-[0.7rem] text-muted-foreground tabular-nums">{text.length.toLocaleString("en-US")} chars</span>
                    <CopyButton text={text} label={`Copy ${platform.platform} caption ${i + 1}`} />
                  </span>
                </div>
                <EditableText label={`${platform.platform} caption option ${i + 1}`} value={text} rows={Math.min(10, Math.max(3, Math.ceil(text.length / 60) + text.split("\n").length - 1))} onChange={(nv) => setDrafts((d) => d.map((row, r) => (r === active ? row.map((t, c) => (c === i ? nv : t)) : row)))} />
              </li>
            );
          })}
        </ol>
      </div>
      <ListWithCopy title="Hook lines" items={result.hooks} kind="hook line" />
      <ListWithCopy title="Calls to action" items={result.ctas} kind="call to action" />
    </div>
  );
}

/* ── Hashtags ─────────────────────────────────────────────────────────── */

const GROUP_NOTE: Record<string, string> = { Broad: "Wide reach, general topic", Specific: "Clearly about your topic", "Niche & community": "Smaller, focused communities" };

export function HashtagResults({ result }: { result: HashtagResult }) {
  const all = result.groups.flatMap((g) => g.tags);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Suggestions only — no search volume, popularity or trend data. Select a tag to copy it.</p>
        <CopyButton text={all.join(" ")} label={`Copy all ${all.length} hashtags`}>
          Copy all {all.length}
        </CopyButton>
      </div>
      {result.groups.map((g) => (
        <div key={g.group} className="rounded-2xl border bg-card p-4">
          <SectionTitle action={<CopyButton text={g.tags.join(" ")} label={`Copy group: ${g.group} hashtags`}>Copy group</CopyButton>}>{g.group}</SectionTitle>
          {GROUP_NOTE[g.group] ? <p className="mt-0.5 text-xs text-muted-foreground">{GROUP_NOTE[g.group]}</p> : null}
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {g.tags.map((t) => (
              <li key={t}>
                <TagChip tag={t} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <ListWithCopy title="Keywords" items={result.keywords} kind="keyword" />
    </div>
  );
}

function TagChip({ tag }: { tag: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => copyText(tag).then((ok) => ok && (setDone(true), window.setTimeout(() => setDone(false), 1200)))}
      aria-label={`Copy ${tag}`}
      className={cn("inline-flex h-8 items-center gap-1 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none", done ? "border-primary bg-primary/10 text-primary" : "bg-background hover:border-primary/40 dark:bg-white/[0.03]")}
    >
      {tag}
      {done ? <Check className="size-3" aria-hidden /> : null}
      <span className="sr-only" aria-live="polite">
        {done ? "Copied" : ""}
      </span>
    </button>
  );
}

/* ── Post ideas ───────────────────────────────────────────────────────── */

const ideaText = (i: IdeasResult["ideas"][number]) => `${i.title}\n${i.category} · ${i.format} · ${i.platform}\nHook: ${i.hook}\n${i.outline.map((o) => `- ${o}`).join("\n")}`;

export function IdeasResults({ result }: { result: IdeasResult }) {
  const categories = [...new Set(result.ideas.map((i) => i.category))];
  const [filter, setFilter] = React.useState<string | null>(null);
  const shown = result.ideas.filter((i) => !filter || i.category === filter);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by category">
        {[null, ...categories].map((c) => (
          <button key={c ?? "all"} type="button" aria-pressed={filter === c} onClick={() => setFilter(c)} className={cn("h-8 rounded-full px-3 text-xs font-semibold transition-colors", filter === c ? "bg-foreground text-background" : "border bg-card text-muted-foreground hover:text-foreground")}>
            {c ?? `All ${result.ideas.length}`}
          </button>
        ))}
        <CopyButton text={shown.map(ideaText).join("\n\n")} label={`Copy ${filter ? "these" : "all"} ideas`} className="ml-auto">
          Copy {filter ? "these" : "all"}
        </CopyButton>
      </div>
      <ol className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {shown.map((idea) => (
          <li key={idea.title} className="flex flex-col rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgb(32_33_39/0.04)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold leading-snug">{idea.title}</p>
                <p className="mt-1.5 flex flex-wrap gap-1.5 text-[0.7rem] font-semibold">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{idea.category}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{idea.format}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{idea.platform}</span>
                </p>
              </div>
              <CopyButton text={ideaText(idea)} label={`Copy idea: ${idea.title}`} />
            </div>
            <p className="mt-3 rounded-xl bg-subtle px-3 py-2 text-sm dark:bg-white/[0.03]">
              <span className="font-semibold">Hook: </span>
              {idea.hook}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground marker:text-primary/60">
              {idea.outline.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── Content calendar ─────────────────────────────────────────────────── */

/** CSV cell: quoted, quotes doubled, and formula-like values neutralised for spreadsheets. */
export function csvCell(v: string | number) {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function calendarCsv(weeks: CalendarResult["weeks"], posts: CalendarResult["posts"]) {
  const theme = (w: number) => weeks.find((x) => x.week === w)?.theme ?? "";
  const rows = [["Day", "Week", "Theme", "Platform", "Format", "Topic", "Notes"], ...posts.map((p) => [p.day, p.week, theme(p.week), p.platform, p.format, p.topic, p.notes])];
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

const calendarText = (weeks: CalendarResult["weeks"], posts: CalendarResult["posts"]) =>
  weeks.map((w) => [`Week ${w.week} (days ${w.startDay}–${w.endDay}): ${w.theme}`, ...posts.filter((p) => p.week === w.week).map((p) => `Day ${p.day} · ${p.platform} · ${p.format}: ${p.topic}${p.notes ? ` — ${p.notes}` : ""}`)].join("\n")).join("\n\n");

export function CalendarResults({ result }: { result: CalendarResult }) {
  const [weeks, setWeeks] = React.useState(result.weeks);
  const [posts, setPosts] = React.useState(result.posts);
  const [view, setView] = React.useState<"list" | "calendar">("list");
  const edit = (index: number, key: "topic" | "notes", value: string) => setPosts((ps) => ps.map((p, i) => (i === index ? { ...p, [key]: value } : p)));

  const download = () => {
    // BOM so spreadsheet apps read UTF-8 (emoji, accents) correctly.
    const blob = new Blob(["﻿", calendarCsv(weeks, posts)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `socivanta-content-calendar-${result.days}-days.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const print = () => {
    document.body.classList.add("ai-printing");
    const done = () => {
      document.body.classList.remove("ai-printing");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };

  const field = "w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 outline-none hover:border-border focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15 print:border-none print:p-0";
  return (
    <div className="ai-print-area space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-xs text-muted-foreground">
          {result.days}-day plan · {posts.length} posts · Day numbers, not dates — nothing is scheduled.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <div role="group" aria-label="View" className="hidden rounded-full border bg-card p-0.5 sm:inline-flex">
            {(
              [
                ["list", "List", List],
                ["calendar", "Calendar", CalendarDays],
              ] as const
            ).map(([v, label, Icon]) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors", view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                <Icon className="size-3.5" aria-hidden /> {label}
              </button>
            ))}
          </div>
          <CopyButton text={calendarText(weeks, posts)} label="Copy the plan as text">
            Copy
          </CopyButton>
          <button type="button" onClick={download} className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-semibold hover:bg-muted">
            <Download className="size-3.5" aria-hidden /> CSV
          </button>
          <button type="button" onClick={print} className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-semibold hover:bg-muted">
            <Printer className="size-3.5" aria-hidden /> Print
          </button>
        </div>
      </div>
      <h3 className="hidden text-lg font-bold print:block">Content calendar — {result.days} days</h3>
      {view === "calendar" ? <CalendarGrid weeks={weeks} posts={posts} /> : null}
      {weeks.map((w, wi) => (
        <section key={w.week} aria-label={`Week ${w.week}`} className={cn("break-inside-avoid", view === "calendar" && "hidden print:block")}>
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Week {w.week} · Days {w.startDay}–{w.endDay}
            </span>
          </div>
          <input aria-label={`Week ${w.week} theme`} value={w.theme} onChange={(e) => setWeeks((ws) => ws.map((x, i) => (i === wi ? { ...x, theme: e.target.value } : x)))} className={cn(field, "mt-1 -ml-1.5 text-[0.95rem] font-semibold")} />
          {/* Stacked rows rather than a table: the results column is narrow, and every field stays visible. */}
          <ol className="mt-2 divide-y rounded-xl border bg-background dark:bg-white/[0.03]">
            {posts.map((p, i) =>
              p.week === w.week ? (
                <li key={i} className="flex gap-3 p-3 break-inside-avoid">
                  <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/[0.08] text-primary dark:bg-primary/20 dark:text-[#c9bcff]">
                    <span className="text-[0.55rem] leading-none font-semibold tracking-wider uppercase">Day</span>
                    <span className="text-sm leading-tight font-bold tabular-nums">{p.day}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      {p.platform} · {p.format}
                    </p>
                    <textarea rows={Math.max(1, Math.ceil(p.topic.length / 48))} aria-label={`Day ${p.day} topic`} value={p.topic} onChange={(e) => edit(i, "topic", e.target.value)} className={cn(field, "-ml-1.5 resize-none text-sm font-medium")} />
                    <textarea rows={Math.max(1, Math.ceil(p.notes.length / 56))} aria-label={`Day ${p.day} notes`} placeholder="Add a note" value={p.notes} onChange={(e) => edit(i, "notes", e.target.value)} className={cn(field, "-ml-1.5 resize-none text-xs text-muted-foreground print:placeholder:text-transparent")} />
                  </div>
                </li>
              ) : null,
            )}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** Read-only month view: one row per week, a cell per day. Editing happens in the list view. */
function CalendarGrid({ weeks, posts }: { weeks: CalendarResult["weeks"]; posts: CalendarResult["posts"] }) {
  return (
    <div className="space-y-4 print:hidden">
      <p className="text-xs text-muted-foreground">Switch to List to edit topics and notes.</p>
      {weeks.map((w) => (
        <section key={w.week} aria-label={`Week ${w.week} calendar`}>
          <p className="text-xs font-semibold text-muted-foreground">
            Week {w.week} · <span className="text-foreground">{w.theme}</span>
          </p>
          <ol className="mt-2 grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }, (_, i) => {
              const day = w.startDay + i;
              if (day > w.endDay) return <li key={i} aria-hidden className="rounded-xl border border-dashed opacity-40" />;
              const today = posts.filter((p) => p.day === day);
              return (
                <li key={i} className={cn("flex min-h-24 flex-col gap-1 rounded-xl border p-1.5", today.length ? "bg-card" : "bg-transparent")}>
                  <span className="text-[0.65rem] font-semibold text-muted-foreground tabular-nums">Day {day}</span>
                  {today.map((p, k) => (
                    <span key={k} className="flex flex-col gap-0.5 rounded-lg bg-primary/[0.07] p-1.5 dark:bg-primary/15" title={`${p.platform} · ${p.format}: ${p.topic}`}>
                      <span className="flex items-start gap-1 text-[0.62rem] font-semibold text-primary dark:text-[#c9bcff]">
                        <AiPlatformIcon name={p.platform} className="size-2.5" />
                        <span className="leading-tight">{p.format}</span>
                      </span>
                      <span className="line-clamp-3 text-[0.7rem] leading-snug">{p.topic}</span>
                    </span>
                  ))}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
