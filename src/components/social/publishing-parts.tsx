"use client";

import * as React from "react";
import { CircleAlert, CircleCheck, CircleDashed, CircleHelp, CircleX, Clock, Info, Loader, Pencil, CalendarClock, Ban } from "lucide-react";
import { SOCIAL_PLATFORM, type SocialProviderId } from "@/lib/social/platforms";
import { POST_STATE_LABEL, type PostState, type PublishingData } from "@/lib/social/publishing";
import { cn } from "@/lib/utils";
import { SocialTile } from "./parts";

/* Shared pieces for Publishing, Calendar and Campaign Studio (AI-07). */

const STATE_STYLE: Record<PostState, { icon: typeof Clock; className: string; dot: string }> = {
  draft: { icon: Pencil, className: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
  planned: { icon: CalendarClock, className: "bg-secondary text-secondary-foreground", dot: "bg-primary" },
  scheduled: { icon: Clock, className: "bg-primary/10 text-primary dark:text-[#c9bcff]", dot: "bg-primary" },
  publishing: { icon: Loader, className: "bg-soon-soft text-soon", dot: "bg-soon" },
  published: { icon: CircleCheck, className: "bg-ok-soft text-ok", dot: "bg-ok" },
  partly_published: { icon: CircleAlert, className: "bg-soon-soft text-soon", dot: "bg-soon" },
  failed: { icon: CircleX, className: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
  needs_review: { icon: CircleHelp, className: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
  cancelled: { icon: Ban, className: "bg-off-soft text-off", dot: "bg-off" },
};

export const stateDot = (s: PostState) => STATE_STYLE[s].dot;

export function StateBadge({ state, className }: { state: PostState; className?: string }) {
  const s = STATE_STYLE[state];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[0.7rem] font-semibold whitespace-nowrap", s.className, className)}>
      <Icon className="size-3" aria-hidden />
      {POST_STATE_LABEL[state]}
    </span>
  );
}

export function PlatformStack({ providers, max = 4 }: { providers: SocialProviderId[]; max?: number }) {
  if (!providers.length) return <span className="text-[0.75rem] text-muted-foreground">No platforms yet</span>;
  return (
    <span className="flex items-center -space-x-1.5" aria-label={providers.map((p) => SOCIAL_PLATFORM[p].name).join(", ")}>
      {providers.slice(0, max).map((p) => (
        <SocialTile key={p} provider={p} size="xs" className="ring-2 ring-card" />
      ))}
      {providers.length > max ? <span className="grid size-6 place-items-center rounded-md bg-muted text-[0.62rem] font-bold ring-2 ring-card">+{providers.length - max}</span> : null}
    </span>
  );
}

/** One honest line about what works today. */
export function PublishingNotice({ data, className }: { data: PublishingData; className?: string }) {
  const live = Object.entries(data.publishing).filter(([, v]) => v.ok).map(([k]) => SOCIAL_PLATFORM[k as SocialProviderId].name);
  const connected = data.workspace.accounts.length;
  return (
    <p className={cn("flex items-start gap-2.5 rounded-2xl border bg-card px-4 py-3 text-[0.82rem] leading-relaxed text-muted-foreground", className)}>
      <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span>
        <span className="font-semibold text-foreground">Writing, drafts and planning work now.</span>{" "}
        {live.length
          ? `Publishing is available for ${live.join(", ")} on accounts that grant posting permission.`
          : `Publishing to platforms isn't switched on yet — each platform must approve SociVanta's posting permission first${connected ? "" : ", and no accounts are connected"}. Nothing you write here is posted.`}
      </span>
    </p>
  );
}

/** JSON request to the publishing routes with a readable error. */
export async function postsApi<T>(path: string, init: RequestInit): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
    const body = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: body as T };
    const issue = body?.error?.issues?.[0]?.message;
    return { ok: false, message: issue ?? body?.error?.message ?? "Something went wrong. Please try again." };
  } catch {
    return { ok: false, message: "We couldn't reach SociVanta. Check your connection and try again." };
  }
}

/** Warns before leaving with unsaved changes (browser navigation). */
export function useUnsavedWarning(dirty: boolean) {
  React.useEffect(() => {
    if (!dirty) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [dirty]);
}

export function EmptyIllustration({ icon: Icon = CircleDashed }: { icon?: typeof Clock }) {
  return (
    <span className="relative grid size-14 place-items-center rounded-2xl bg-primary/[0.08] text-primary ring-1 ring-primary/15 dark:bg-primary/20 dark:text-[#c9bcff]">
      <Icon className="size-6" aria-hidden />
      <span className="absolute -end-1 -top-1 size-3 rounded-full bg-lime ring-2 ring-card" aria-hidden />
    </span>
  );
}
