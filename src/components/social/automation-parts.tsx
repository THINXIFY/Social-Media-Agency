"use client";

import { Bell, CalendarClock, CalendarDays, CheckCircle2, CircleDashed, CirclePause, CircleX, Clock, FileSearch, Filter, HeartPulse, ListChecks, Loader, Lightbulb, Rocket, SkipForward, Target, type LucideIcon } from "lucide-react";
import { type Action, type AutomationStatus, type AutomationTemplate, describeAction, describeTrigger, type RunStatus, type Trigger } from "@/lib/social/automations";
import { cn } from "@/lib/utils";

/* Shared pieces for the Automation Studio (AI-08). */

export const TEMPLATE_ICON: Record<AutomationTemplate["icon"], LucideIcon> = { bell: Bell, checklist: ListChecks, drafts: FileSearch, rocket: Rocket, target: Target, health: HeartPulse };

export const TRIGGER_ICON: Record<Trigger["type"], LucideIcon> = { weekly: CalendarDays, daily: Clock, once: CalendarClock, draft_due: FileSearch, account_attention: HeartPulse };
export const ACTION_ICON: Record<Action["type"], LucideIcon> = { reminder: Bell, checklist: ListChecks, flag_drafts: FileSearch, health_check: HeartPulse, draft_suggestion: Lightbulb };

const STATUS: Record<AutomationStatus, { label: string; icon: LucideIcon; className: string }> = {
  active: { label: "Active", icon: CheckCircle2, className: "bg-ok-soft text-ok" },
  paused: { label: "Paused", icon: CirclePause, className: "bg-muted text-muted-foreground" },
  draft: { label: "Not activated", icon: CircleDashed, className: "bg-soon-soft text-soon" },
  completed: { label: "Completed", icon: CheckCircle2, className: "bg-secondary text-secondary-foreground" },
};

export function AutomationBadge({ status, className }: { status: AutomationStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[0.7rem] font-semibold whitespace-nowrap transition-colors duration-300", s.className, className)}>
      <s.icon className="size-3" aria-hidden />
      {s.label}
    </span>
  );
}

const RUN: Record<RunStatus, { label: string; icon: LucideIcon; className: string }> = {
  running: { label: "Running", icon: Loader, className: "bg-soon-soft text-soon" },
  succeeded: { label: "Done", icon: CheckCircle2, className: "bg-ok-soft text-ok" },
  skipped: { label: "Skipped", icon: SkipForward, className: "bg-muted text-muted-foreground" },
  failed: { label: "Failed", icon: CircleX, className: "bg-destructive/10 text-destructive" },
};

export function RunBadge({ status }: { status: RunStatus }) {
  const s = RUN[status];
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[0.7rem] font-semibold whitespace-nowrap", s.className)}>
      <s.icon className="size-3" aria-hidden />
      {s.label}
    </span>
  );
}

/** The workflow, visually: trigger → (condition) → action, as a compact vertical flow. */
export function FlowPreview({ trigger, action, onlyIfFound, timezone, compact = false }: { trigger: Trigger; action: Action; onlyIfFound: boolean; timezone?: string; compact?: boolean }) {
  const TIcon = TRIGGER_ICON[trigger.type];
  const AIcon = ACTION_ICON[action.type];
  const conditional = (action.type === "flag_drafts" || action.type === "health_check") && onlyIfFound;
  const steps = [
    { icon: TIcon, label: "When", text: describeTrigger(trigger) + (timezone && !compact ? ` (${timezone})` : ""), tone: "bg-graphite text-lime dark:bg-white/10" },
    ...(conditional ? [{ icon: Filter, label: "Only if", text: action.type === "flag_drafts" ? "there are drafts to review" : "an account needs attention", tone: "bg-muted text-muted-foreground dark:bg-white/[0.06]" }] : []),
    { icon: AIcon, label: "Then", text: describeAction(action), tone: "bg-primary text-primary-foreground" },
  ];
  return (
    <ol className={cn("relative", compact ? "space-y-2" : "space-y-3")}>
      <span className={cn("absolute top-4 bottom-4 w-px bg-border", compact ? "start-3.5" : "start-[1.125rem]")} aria-hidden />
      {steps.map((s) => (
        <li key={s.label} className="relative flex items-start gap-3">
          <span className={cn("relative z-10 grid shrink-0 place-items-center rounded-full ring-4 ring-card", compact ? "size-7" : "size-9", s.tone)}>
            <s.icon className={compact ? "size-3.5" : "size-4"} aria-hidden />
          </span>
          <span className="min-w-0 pt-0.5">
            <span className="block text-[0.66rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">{s.label}</span>
            <span className={cn("block leading-snug", compact ? "text-[0.8rem]" : "text-[0.9rem] font-medium")}>{s.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** JSON request to the automation routes with a readable error. */
export async function automationApi<T>(path: string, init: RequestInit): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
    const body = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: body as T };
    return { ok: false, message: body?.error?.issues?.[0]?.message ?? body?.error?.message ?? "Something went wrong. Please try again." };
  } catch {
    return { ok: false, message: "We couldn't reach Sociotix. Check your connection and try again." };
  }
}
