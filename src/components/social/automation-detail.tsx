"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, Copy, History, Pause, Pencil, Play, RotateCcw, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/dashboard/account-ui";
import { Panel } from "@/components/dashboard/shared";
import { formatDateTime, useDisplay } from "@/lib/i18n";
import { type AutomationData, automationHref, AUTOMATION_ROUTES, type AutomationView, frequency, permissionsFor, type RunStatus } from "@/lib/social/automations";
import { cn } from "@/lib/utils";
import { automationApi, AutomationBadge, FlowPreview, RunBadge } from "./automation-parts";
import { page, primaryButton, quietButton, SocialNav, When } from "./parts";
import { EmptyIllustration } from "./publishing-parts";
import { ActivateDialog } from "./studio";

/* One workflow (AI-08): what it does, its schedule, controls and its real execution history. */

export function AutomationDetail({ data, a }: { data: AutomationData; a: AutomationView }) {
  useDisplay();
  const router = useRouter();
  const [filter, setFilter] = React.useState<RunStatus | "all">("all");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [activating, setActivating] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const runs = data.runs.filter((r) => r.automationId === a.id && (filter === "all" || r.status === filter));
  const all = data.runs.filter((r) => r.automationId === a.id);

  const call = async (path: string, init: RequestInit, done?: string, go?: string) => {
    setBusy(true);
    setMessage(null);
    const r = await automationApi<{ automation?: AutomationView }>(path, init);
    setBusy(false);
    if (!r.ok) return setMessage({ ok: false, text: r.message });
    if (done) setMessage({ ok: true, text: done });
    if (go) router.push(go);
    router.refresh();
  };

  return (
    <div className={page}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <Link href={AUTOMATION_ROUTES.studio} className="mt-1 grid size-10 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none" aria-label="Back to Automations">
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-[1.5rem] leading-tight font-extrabold tracking-tight sm:text-[1.8rem]">{a.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.82rem] text-muted-foreground">
                <AutomationBadge status={a.status} />
                {a.description ? <span>{a.description}</span> : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {a.status === "active" ? (
              <button type="button" className={quietButton} onClick={() => call(`/api/social/automations/${a.id}/state`, { method: "POST", body: JSON.stringify({ action: "pause" }) }, "Paused. Nothing will run until you activate it again.")} disabled={busy}>
                <Pause className="size-4" aria-hidden /> Pause
              </button>
            ) : (
              <button type="button" className={primaryButton} onClick={() => setActivating(true)} disabled={busy}>
                <Play className="size-4" aria-hidden /> Activate
              </button>
            )}
            <Link href={`${automationHref(a.id)}/edit`} className={quietButton}>
              <Pencil className="size-4" aria-hidden /> Edit
            </Link>
            <button type="button" className={quietButton} onClick={() => call(`/api/social/automations/${a.id}/duplicate`, { method: "POST" }, undefined, AUTOMATION_ROUTES.studio)} disabled={busy} aria-label="Duplicate">
              <Copy className="size-4" aria-hidden />
            </button>
            <button type="button" className={cn(quietButton, "text-destructive hover:bg-destructive/[0.06]")} onClick={() => setDeleting(true)} disabled={busy} aria-label="Delete">
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        <SocialNav />
      </div>

      {message ? (
        <p role="status" className={cn("mt-5 rounded-2xl px-4 py-3 text-sm font-medium", message.ok ? "bg-ok-soft text-ok" : "bg-destructive/[0.07] text-destructive")}>
          {message.text}
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="min-w-0 space-y-4">
          <Panel className="p-5">
            <h2 className="font-heading text-base font-bold">What it does</h2>
            <div className="mt-4">
              <FlowPreview trigger={a.trigger} action={a.action} onlyIfFound={a.onlyIfFound} timezone={a.timezone} />
            </div>
          </Panel>
          <Panel className="p-5">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-[0.72rem] font-semibold text-muted-foreground">Next run</dt>
                <dd className="mt-0.5 font-medium">{a.nextRunAt ? formatDateTime(a.nextRunAt, { year: true }) : a.status === "completed" ? "Finished" : "Not scheduled"}</dd>
              </div>
              <div>
                <dt className="text-[0.72rem] font-semibold text-muted-foreground">Last run</dt>
                <dd className="mt-0.5 font-medium">{a.lastRunAt ? <When iso={a.lastRunAt} /> : "Not yet"}</dd>
              </div>
              <div>
                <dt className="text-[0.72rem] font-semibold text-muted-foreground">How often</dt>
                <dd className="mt-0.5 font-medium">{frequency(a.trigger)}</dd>
              </div>
              <div>
                <dt className="text-[0.72rem] font-semibold text-muted-foreground">Time zone</dt>
                <dd className="mt-0.5 font-medium">{a.timezone}</dd>
              </div>
            </dl>
            <ul className="mt-4 space-y-1 border-t pt-3 text-[0.78rem] text-muted-foreground">
              {permissionsFor(a.action).map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          </Panel>
        </div>

        <Panel className="min-w-0 self-start p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-heading text-base font-bold">
              <History className="size-4 text-primary" aria-hidden /> Run history
            </h2>
            {all.length ? (
              <div className="flex flex-wrap gap-1" role="group" aria-label="Filter runs">
                {(["all", "succeeded", "skipped", "failed"] as const).map((f) => (
                  <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn("h-7 rounded-full px-2.5 text-[0.72rem] font-semibold capitalize", filter === f ? "bg-graphite text-white dark:bg-white dark:text-graphite" : "text-muted-foreground hover:bg-muted")}>
                    {f === "succeeded" ? "Done" : f}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {runs.length ? (
            <ul className="mt-3 divide-y">
              {runs.map((r) => (
                <li key={r.id}>
                  <details className="group py-2.5">
                    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                      <RunBadge status={r.status} />
                      <span className="min-w-0 flex-1 truncate text-[0.85rem]">{r.outcome ?? "Running…"}</span>
                      <span className="shrink-0 text-[0.72rem] text-muted-foreground">
                        <When iso={r.startedAt} />
                      </span>
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                    </summary>
                    <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-xl bg-muted/50 p-3 text-[0.78rem] sm:grid-cols-2 dark:bg-white/[0.03]">
                      <div>
                        <dt className="text-muted-foreground">Trigger</dt>
                        <dd>{r.trigger}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Planned for</dt>
                        <dd>{formatDateTime(r.scheduledFor, { year: true })}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Finished</dt>
                        <dd>{r.finishedAt ? formatDateTime(r.finishedAt, { year: true }) : "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Outcome</dt>
                        <dd>{r.outcome ?? "Still running"}</dd>
                      </div>
                    </dl>
                    {r.canRetry ? (
                      <button type="button" className={cn(quietButton, "mt-2 h-8 px-3 text-[0.78rem]")} onClick={() => call(`/api/social/automations/runs/${r.id}/retry`, { method: "POST" }, "Retried. Check the newest run for the result.")} disabled={busy}>
                        <RotateCcw className="size-3.5" aria-hidden /> Retry safely
                      </button>
                    ) : null}
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center py-10 text-center">
              <EmptyIllustration icon={History} />
              <p className="mt-4 text-sm font-semibold">{all.length ? "No runs match this filter" : "No runs yet"}</p>
              <p className="mt-1 max-w-xs text-[0.8rem] text-muted-foreground">{all.length ? "Try another filter." : a.status === "active" ? `The first run is ${a.nextRunAt ? formatDateTime(a.nextRunAt) : "coming up"}.` : "Activate this automation to start its schedule."}</p>
            </div>
          )}
        </Panel>
      </div>

      <ActivateDialog a={activating ? a : null} onClose={() => setActivating(false)} onDone={() => (setActivating(false), router.refresh())} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        tone="danger"
        icon={Trash2}
        title={`Delete “${a.name}”?`}
        description="The automation stops and is removed. Its run history and anything already in your inbox are kept."
        confirmLabel="Delete automation"
        onConfirm={() => call(`/api/social/automations/${a.id}`, { method: "DELETE" }, undefined, AUTOMATION_ROUTES.studio)}
      />
    </div>
  );
}
