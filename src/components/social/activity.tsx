"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, CalendarX2, CircleCheck, CircleHelp, CircleX, History, KeyRound, Link2, Link2Off, RefreshCw, Send, type LucideIcon } from "lucide-react";
import { Panel } from "@/components/dashboard/shared";
import { formatDate, useDisplay } from "@/lib/i18n";
import { accountHref, SOCIAL_PLATFORM, SOCIAL_ROUTES, type SocialEventType, type SocialEventView, type SocialProviderId, type SocialWorkspace } from "@/lib/social/platforms";
import { cn } from "@/lib/utils";
import { page, quietButton, SocialHeader, SocialTile, When } from "./parts";

const KIND: Record<SocialEventType, { icon: LucideIcon; tone: "ok" | "warn" | "neutral" }> = {
  connect_started: { icon: Link2, tone: "neutral" },
  connected: { icon: Link2, tone: "ok" },
  reconnected: { icon: Link2, tone: "ok" },
  connect_failed: { icon: CircleX, tone: "warn" },
  sync_succeeded: { icon: CircleCheck, tone: "ok" },
  sync_failed: { icon: RefreshCw, tone: "warn" },
  access_renewed: { icon: KeyRound, tone: "neutral" },
  access_expired: { icon: KeyRound, tone: "warn" },
  disconnected: { icon: Link2Off, tone: "neutral" },
  post_scheduled: { icon: CalendarClock, tone: "neutral" },
  post_cancelled: { icon: CalendarX2, tone: "neutral" },
  post_published: { icon: Send, tone: "ok" },
  post_failed: { icon: CircleX, tone: "warn" },
  post_unconfirmed: { icon: CircleHelp, tone: "warn" },
};

/** Real connection and refresh events, newest first. Messages are written for people and never contain credentials. */
export function ActivityList({ events, compact = false }: { events: SocialEventView[]; compact?: boolean }) {
  if (!events.length) return <p className={cn("text-sm text-muted-foreground", compact ? "mt-3" : "")}>Nothing has happened yet. Connections, refreshes and disconnections will appear here.</p>;
  return (
    <ol className={cn("space-y-1", compact ? "mt-3" : "")}>
      {events.map((e) => {
        const k = KIND[e.type];
        const Icon = k.icon;
        const body = (
          <>
            <span className="relative shrink-0">
              <SocialTile provider={e.provider} size="sm" />
              <span className={cn("absolute -end-1 -bottom-1 grid size-4 place-items-center rounded-full ring-2 ring-card", k.tone === "ok" ? "bg-ok text-white dark:text-graphite" : k.tone === "warn" ? "bg-soon text-white dark:text-graphite" : "bg-muted-foreground text-card")} aria-hidden>
                <Icon className="size-2.5" />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block text-sm leading-snug", compact && "line-clamp-2")}>{e.message}</span>
              <span className="mt-0.5 block text-[0.75rem] text-muted-foreground">
                {SOCIAL_PLATFORM[e.provider].name} · <When iso={e.at} />
              </span>
            </span>
          </>
        );
        return (
          <li key={e.id}>
            {e.accountId ? (
              <Link href={accountHref(e.accountId)} className="flex items-start gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
                {body}
              </Link>
            ) : (
              <div className="flex items-start gap-3 px-2 py-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function SocialActivity({ data }: { data: SocialWorkspace }) {
  useDisplay();
  const [filter, setFilter] = React.useState<SocialProviderId | "all">("all");
  const providers = [...new Set(data.events.map((e) => e.provider))];
  const events = filter === "all" ? data.events : data.events.filter((e) => e.provider === filter);
  const groups = new Map<string, SocialEventView[]>();
  for (const e of events) {
    const day = formatDate(e.at, { year: true });
    groups.set(day, [...(groups.get(day) ?? []), e]);
  }

  return (
    <div className={page}>
      <SocialHeader title="Activity" subtitle="Every connection, refresh and disconnection on your social accounts, as it happened." />

      {providers.length > 1 ? (
        <div className="mt-6 flex flex-wrap gap-1.5" role="group" aria-label="Filter by platform">
          {(["all", ...providers] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={filter === p}
              onClick={() => setFilter(p)}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.8rem] font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none", filter === p ? "border-transparent bg-graphite text-white dark:bg-white dark:text-graphite" : "bg-card hover:bg-muted")}
            >
              {p === "all" ? "All platforms" : SOCIAL_PLATFORM[p].name}
            </button>
          ))}
        </div>
      ) : null}

      {events.length ? (
        <div className="mt-5 space-y-5">
          {[...groups].map(([day, list]) => (
            <Panel key={day} className="p-3 sm:p-4">
              <h2 className="px-2 pt-1 pb-1 text-[0.72rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">{day}</h2>
              <ActivityList events={list} />
            </Panel>
          ))}
        </div>
      ) : (
        <Panel className="mt-6 flex flex-col items-center px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
            <History className="size-5" aria-hidden />
          </span>
          <h2 className="mt-4 font-heading text-lg font-bold">No activity yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">When you connect, refresh or disconnect an account, it&apos;s recorded here — including anything that didn&apos;t work.</p>
          <Link href={SOCIAL_ROUTES.accounts} className={cn(quietButton, "mt-5")}>
            <Link2 className="size-4" aria-hidden /> Go to accounts
          </Link>
        </Panel>
      )}
    </div>
  );
}
