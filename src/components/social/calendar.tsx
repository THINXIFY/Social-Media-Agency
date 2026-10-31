"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, PenLine } from "lucide-react";
import { Panel, useHydrated } from "@/components/dashboard/shared";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SOCIAL_PLATFORM, type SocialProviderId } from "@/lib/social/platforms";
import { postHref, PUBLISHING_ROUTES, type PostView, type PublishingData } from "@/lib/social/publishing";
import { browserTimeZone, dayKey, utcToZonedInput } from "@/lib/social/time";
import { cn } from "@/lib/utils";
import { page, primaryButton, quietButton, SocialHeader, SocialTile } from "./parts";
import { EmptyIllustration, PlatformStack, postsApi, StateBadge, stateDot } from "./publishing-parts";

/* Content calendar (AI-07): planned and scheduled posts by day, in the customer's own time zone. */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
/** Monday-based weekday (0 = Monday) of a plain calendar date. */
const weekday = (y: number, m: number, d: number) => (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7;
const addDays = (key: string, n: number) => {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return keyOf(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
};
const monthLabel = (y: number, m: number) => new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(Date.UTC(y, m, 1));
const dayLabel = (key: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(Date.parse(`${key}T00:00:00Z`));
const timeIn = (iso: string, tz: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(Date.parse(iso));

type Item = { post: PostView; when: string; day: string };
const headline = (p: PostView) => p.title?.trim() || p.text.trim().split("\n")[0]?.slice(0, 60) || "Untitled post";

function Chip({ item, tz, onOpen }: { item: Item; tz: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group flex w-full min-w-0 items-center gap-1.5 rounded-lg border bg-card px-1.5 py-1 text-start text-[0.7rem] transition-[border-color,background-color] hover:border-primary/40 hover:bg-primary/[0.04] focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none dark:bg-white/[0.03]">
      <span className={cn("size-1.5 shrink-0 rounded-full", stateDot(item.post.state))} aria-hidden />
      <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">{timeIn(item.when, tz)}</span>
      <span className="min-w-0 truncate font-medium group-hover:text-primary">{headline(item.post)}</span>
    </button>
  );
}

export function PublishingCalendar({ data }: { data: PublishingData }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const tz = hydrated ? browserTimeZone() : "UTC";
  const today = hydrated ? dayKey(new Date().toISOString(), tz) : null;
  const [view, setView] = React.useState<"month" | "week">("month");
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<SocialProviderId | "all">("all");
  const [open, setOpen] = React.useState<PostView | null>(null);
  const [date, setDate] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const anchor = cursor ?? today ?? "2026-01-01";
  const [ay, am] = anchor.split("-").map(Number) as [number, number];
  const items: Item[] = data.posts
    .map((p) => ({ post: p, when: p.scheduledAt ?? p.plannedAt }))
    .filter((x): x is { post: PostView; when: string } => !!x.when)
    .filter((x) => filter === "all" || x.post.providers.includes(filter))
    .map((x) => ({ ...x, day: dayKey(x.when, tz) }))
    .sort((a, b) => a.when.localeCompare(b.when));
  const byDay = new Map<string, Item[]>();
  for (const it of items) byDay.set(it.day, [...(byDay.get(it.day) ?? []), it]);

  // Visible days: a 6-week month grid or the 7 days of the anchor's week.
  const firstOfMonth = keyOf(ay, am - 1, 1);
  const gridStart = addDays(firstOfMonth, -weekday(ay, am - 1, 1));
  const weekStart = addDays(anchor, -weekday(ay, am - 1, Number(anchor.slice(8, 10))));
  const days = view === "month" ? Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)) : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const inMonth = (k: string) => k.slice(0, 7) === firstOfMonth.slice(0, 7);
  const visibleItems = days.flatMap((d) => byDay.get(d) ?? []);
  const providersUsed = [...new Set(data.posts.flatMap((p) => p.providers))];

  const move = (dir: -1 | 1) => {
    if (view === "week") return setCursor(addDays(anchor, dir * 7));
    const t = new Date(Date.UTC(ay, am - 1 + dir, 1));
    setCursor(keyOf(t.getUTCFullYear(), t.getUTCMonth(), 1));
  };
  const title = view === "month" ? monthLabel(ay, am - 1) : `${dayLabel(days[0]!, { month: "short", day: "numeric" })} – ${dayLabel(days[6]!, { month: "short", day: "numeric", year: "numeric" })}`;

  function openPost(p: PostView) {
    setOpen(p);
    setError(null);
    setDate(p.plannedAt ? utcToZonedInput(p.plannedAt, tz) : "");
  }
  async function savePlanned() {
    if (!open) return;
    setBusy(true);
    const r = await postsApi(`/api/social/posts/${open.id}`, { method: "PATCH", body: JSON.stringify({ title: open.title, text: open.text, variants: open.variants, providers: open.providers, plannedLocal: date || null, timezone: tz }) });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setOpen(null);
    router.refresh();
  }

  return (
    <div className={page}>
      <SocialHeader
        title="Calendar"
        subtitle="See every planned and scheduled post across your month."
        action={
          <Link href={PUBLISHING_ROUTES.compose} className={primaryButton}>
            <PenLine className="size-4" aria-hidden /> New post
          </Link>
        }
      />

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full border bg-card p-1">
            <button type="button" onClick={() => move(-1)} className="grid size-8 place-items-center rounded-full hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none" aria-label={view === "month" ? "Previous month" : "Previous week"}>
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button type="button" onClick={() => setCursor(null)} className="h-8 rounded-full px-3 text-[0.78rem] font-semibold hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
              Today
            </button>
            <button type="button" onClick={() => move(1)} className="grid size-8 place-items-center rounded-full hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none" aria-label={view === "month" ? "Next month" : "Next week"}>
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <h2 className="font-heading text-lg font-bold" aria-live="polite">
            {hydrated ? title : " "}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {providersUsed.length > 1 ? (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by platform">
              {(["all", ...providersUsed] as const).map((p) => (
                <button key={p} type="button" aria-pressed={filter === p} onClick={() => setFilter(p)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[0.75rem] font-semibold", filter === p ? "border-transparent bg-graphite text-white dark:bg-white dark:text-graphite" : "bg-card text-muted-foreground hover:text-foreground")}>
                  {p === "all" ? "All" : <SocialTile provider={p} size="xs" className="size-4 rounded [&_svg]:size-2.5" />}
                  {p === "all" ? null : SOCIAL_PLATFORM[p].name}
                </button>
              ))}
            </div>
          ) : null}
          <div className="hidden rounded-full border bg-card p-1 md:flex" role="group" aria-label="Calendar view">
            {(["month", "week"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("h-8 rounded-full px-3 text-[0.78rem] font-semibold capitalize", view === v ? "bg-graphite text-white dark:bg-white dark:text-graphite" : "text-muted-foreground hover:text-foreground")}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[0.75rem] text-muted-foreground">Times shown in {hydrated ? tz : "your time zone"}.</p>

      {!hydrated ? (
        <div className="mt-4 h-[36rem] animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" aria-busy="true" />
      ) : (
        <>
          {/* Desktop/tablet grid */}
          <Panel className="mt-4 hidden overflow-hidden md:block">
            <div className="grid grid-cols-7 border-b bg-subtle/60 dark:bg-white/[0.02]">
              {WEEKDAYS.map((d) => (
                <p key={d} className="px-2.5 py-2 text-[0.7rem] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                  {d}
                </p>
              ))}
            </div>
            <div className={cn("grid grid-cols-7", view === "month" ? "auto-rows-[minmax(6.5rem,1fr)]" : "auto-rows-[minmax(22rem,1fr)]")}>
              {days.map((d) => {
                const list = byDay.get(d) ?? [];
                const isToday = d === today;
                const max = view === "month" ? 3 : 12;
                return (
                  <div key={d} className={cn("min-w-0 border-e border-b p-1.5 [&:nth-child(7n)]:border-e-0", view === "month" && !inMonth(d) && "bg-subtle/40 dark:bg-white/[0.01]")}>
                    <p className={cn("mb-1 inline-grid size-6 place-items-center rounded-full text-[0.72rem] font-semibold tabular-nums", isToday ? "bg-primary text-primary-foreground" : view === "month" && !inMonth(d) ? "text-muted-foreground" : "text-foreground")}>
                      <span className="sr-only">{dayLabel(d, { weekday: "long", month: "long", day: "numeric" })}</span>
                      <span aria-hidden>{Number(d.slice(8, 10))}</span>
                    </p>
                    <ul className="space-y-1">
                      {list.slice(0, max).map((it) => (
                        <li key={it.post.id}>
                          <Chip item={it} tz={tz} onOpen={() => openPost(it.post)} />
                        </li>
                      ))}
                      {list.length > max ? <li className="px-1.5 text-[0.68rem] font-semibold text-muted-foreground">+{list.length - max} more</li> : null}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* Mobile agenda */}
          <div className="mt-4 md:hidden">
            {visibleItems.length ? (
              <ol className="space-y-4">
                {[...new Set(visibleItems.map((i) => i.day))].map((d) => (
                  <li key={d}>
                    <p className="mb-1.5 text-[0.72rem] font-bold tracking-[0.1em] text-muted-foreground uppercase">{d === today ? "Today" : dayLabel(d, { weekday: "short", month: "short", day: "numeric" })}</p>
                    <ul className="space-y-1.5">
                      {(byDay.get(d) ?? []).map((it) => (
                        <li key={it.post.id}>
                          <button type="button" onClick={() => openPost(it.post)} className="flex w-full items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 text-start">
                            <span className="w-14 shrink-0 text-[0.75rem] font-semibold tabular-nums text-muted-foreground">{timeIn(it.when, tz)}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[0.85rem] font-semibold">{headline(it.post)}</span>
                              <span className="mt-1 flex items-center gap-2">
                                <PlatformStack providers={it.post.providers} max={3} />
                              </span>
                            </span>
                            <StateBadge state={it.post.state} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>

          {!items.length ? (
            <Panel className="mt-4 flex flex-col items-center px-6 py-10 text-center">
              <EmptyIllustration icon={CalendarDays} />
              <h2 className="mt-4 font-heading text-lg font-bold">Nothing planned yet</h2>
              <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">Give a draft a planned date and it appears here. Planning never posts anything — it just keeps your month organised.</p>
              <Link href={PUBLISHING_ROUTES.compose} className={cn(quietButton, "mt-5")}>
                <PenLine className="size-4" aria-hidden /> Plan a post
              </Link>
            </Panel>
          ) : !visibleItems.length ? (
            <p className="mt-4 rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground md:hidden">Nothing planned in this {view}.</p>
          ) : null}
        </>
      )}

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="gap-0 p-0 sm:max-w-md">
          {open ? (
            <>
              <div className="space-y-4 p-6">
                <div className="flex items-start gap-3 pe-6">
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="font-heading text-lg leading-snug font-bold">{headline(open)}</DialogTitle>
                    <DialogDescription className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <PlatformStack providers={open.providers} />
                    </DialogDescription>
                  </div>
                  <StateBadge state={open.state} />
                </div>
                <p className="line-clamp-4 rounded-2xl bg-muted/50 px-3.5 py-3 text-[0.85rem] whitespace-pre-wrap dark:bg-white/[0.03]">{open.text || "No text yet."}</p>
                {open.status === "draft" || open.status === "cancelled" ? (
                  <label className="block">
                    <span className="text-[0.78rem] font-semibold">Planned date</span>
                    <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5 w-full rounded-2xl border bg-background px-3.5 py-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-primary/20" />
                    <span className="mt-1 block text-[0.72rem] text-muted-foreground">Time zone: {tz}. Changing the plan never posts anything.</span>
                  </label>
                ) : (
                  <ul className="space-y-1.5 text-[0.8rem]">
                    {open.targets.map((t) => (
                      <li key={t.id} className="flex items-center gap-2">
                        <SocialTile provider={t.provider} size="xs" /> {t.accountName}
                        <span className="ms-auto text-muted-foreground">{t.status.replace("_", " ")}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {error ? (
                  <p role="alert" className="rounded-xl bg-destructive/[0.07] px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t bg-muted/40 px-6 py-4">
                <Link href={postHref(open.id)} className={quietButton}>
                  <PenLine className="size-4" aria-hidden /> Open post
                </Link>
                {open.status === "draft" || open.status === "cancelled" ? (
                  <button type="button" className={primaryButton} onClick={savePlanned} disabled={busy}>
                    {busy ? "Saving…" : "Save date"}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
