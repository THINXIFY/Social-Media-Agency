"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleAlert, CircleCheck, CircleDashed, CirclePause, RefreshCw, type LucideIcon } from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { useHydrated } from "@/components/dashboard/shared";
import { PLATFORMS } from "@/lib/catalog";
import { formatDateTime, formatNumber, formatRelative, useDisplay } from "@/lib/i18n";
import { type SocialHealth, type SocialProviderId, SOCIAL_PLATFORM, SOCIAL_ROUTES } from "@/lib/social/platforms";
import { cn } from "@/lib/utils";

/* Shared building blocks for the Social workspace (AI-06). */

export const page = "mx-auto max-w-[90rem] px-3 py-4 sm:px-6 sm:py-7 lg:px-8";
export const primaryButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_10px_24px_-14px_rgb(112_71_235/0.9)] transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";
export const quietButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";
export const eyebrow = "text-[0.7rem] font-bold tracking-[0.16em] uppercase";

const CATALOG = new Map(PLATFORMS.map((p) => [p.id, p]));

export function SocialTile({ provider, size = "md", className }: { provider: SocialProviderId; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const p = CATALOG.get(provider);
  if (!p) return null;
  return <PlatformTile platform={p} size={size} className={className} />;
}

const HEALTH: Record<SocialHealth, { label: string; icon: LucideIcon; className: string }> = {
  healthy: { label: "Up to date", icon: CircleCheck, className: "bg-ok-soft text-ok" },
  not_synced: { label: "Not refreshed yet", icon: CircleDashed, className: "bg-muted text-muted-foreground" },
  sync_issue: { label: "Refresh failed", icon: RefreshCw, className: "bg-soon-soft text-soon" },
  action_needed: { label: "Reconnect needed", icon: CircleAlert, className: "bg-destructive/10 text-destructive" },
  disconnected: { label: "Disconnected", icon: CirclePause, className: "bg-off-soft text-off" },
};

export function HealthPill({ health, className }: { health: SocialHealth; className?: string }) {
  const h = HEALTH[health];
  const Icon = h.icon;
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[0.72rem] font-semibold whitespace-nowrap", h.className, className)}>
      <Icon className="size-3.5" aria-hidden />
      {h.label}
    </span>
  );
}

/** "3 minutes ago", with the exact time on hover and for assistive tech. */
const isFuture = (iso: string) => Date.parse(iso) > Date.now() + 60_000;

export function When({ iso, prefix }: { iso: string; prefix?: string }) {
  useDisplay();
  // Relative time depends on the clock, so the server and hydration render the exact time; the relative form follows.
  const hydrated = useHydrated();
  const exact = formatDateTime(iso, { year: true });
  return (
    <time dateTime={iso} title={exact}>
      {prefix ? `${prefix} ` : ""}
      {/* Relative wording is for the past; future times (like a next run) show the exact time. */}
      {hydrated && !isFuture(iso) ? formatRelative(iso) : exact}
    </time>
  );
}

export const metricValue = (n: number) => formatNumber(n);

export const platformName = (id: SocialProviderId) => SOCIAL_PLATFORM[id].name;

const TABS = [
  { href: SOCIAL_ROUTES.overview, label: "Overview" },
  { href: "/dashboard/social/publishing", label: "Publishing" },
  { href: "/dashboard/social/calendar", label: "Calendar" },
  { href: "/dashboard/social/campaigns", label: "Campaigns" },
  { href: "/dashboard/social/automations", label: "Automations" },
  { href: SOCIAL_ROUTES.accounts, label: "Accounts" },
  { href: SOCIAL_ROUTES.activity, label: "Activity" },
] as const;

/** The Social area's own compact navigation, so the main dashboard sidebar stays as it is. */
export function SocialNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Social workspace" className={cn("-mx-1 overflow-x-auto px-1", className)}>
      <ul className="inline-flex gap-1 rounded-full border bg-card p-1 shadow-soft">
        {TABS.map((t) => {
          const active = pathname === t.href || (t.href !== SOCIAL_ROUTES.overview && pathname.startsWith(`${t.href}/`));
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

export function SocialHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className={cn(eyebrow, "text-primary")}>Sociotix AI · Social</p>
          <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">{title}</h1>
          <p className="mt-1 max-w-2xl text-[0.95rem] text-muted-foreground">{subtitle}</p>
        </div>
        {action}
      </div>
      <SocialNav />
    </header>
  );
}

/** A small API helper for the Social routes: JSON in, JSON or a readable error message out. */
export async function socialApi<T>(path: string, init: RequestInit): Promise<{ ok: true; data: T } | { ok: false; message: string; code?: string }> {
  try {
    const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
    const body = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: body as T };
    return { ok: false, message: body?.error?.message ?? "Something went wrong. Please try again.", code: body?.error?.code };
  } catch {
    return { ok: false, message: "We couldn't reach Sociotix. Check your connection and try again." };
  }
}
