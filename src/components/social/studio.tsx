"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Ban, Check, CircleAlert, Copy, FilePlus2, Inbox, Lock, Pause, Pencil, Play, Plus, Search, ShieldCheck, Sparkles, Trash2, Workflow, X } from "lucide-react";
import { useToolStatus } from "@/components/ai/use-ai-status";
import { ConfirmDialog } from "@/components/dashboard/account-ui";
import { Panel } from "@/components/dashboard/shared";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useDisplay } from "@/lib/i18n";
import { ACTION_META, type AutomationData, automationHref, AUTOMATION_ROUTES, type AutomationView, frequency, type InboxItemView, permissionsFor, TEMPLATES, UNAVAILABLE_TEMPLATES } from "@/lib/social/automations";
import { postHref } from "@/lib/social/publishing";
import { browserTimeZone } from "@/lib/social/time";
import { cn } from "@/lib/utils";
import { automationApi, AutomationBadge, FlowPreview, RunBadge, TEMPLATE_ICON } from "./automation-parts";
import { page, primaryButton, quietButton, SocialHeader, When } from "./parts";
import { EmptyIllustration } from "./publishing-parts";

/* Automation Studio overview (AI-08). Real workflows, runs and inbox items only. */

const templateHref = (id: string) => `${AUTOMATION_ROUTES.create}?template=${encodeURIComponent(id)}`;

/* -------------------------------------------------------------------------- */
/*  Inbox                                                                     */
/* -------------------------------------------------------------------------- */

function InboxCard({ item, onChange }: { item: InboxItemView; onChange: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Ticks show instantly; the server is updated in the background and reverts the tick if it fails.
  const [checks, setChecks] = React.useState(item.checklist);
  const toggle = async (i: number) => {
    const before = checks;
    setChecks(checks.map((c, k) => (k === i ? { ...c, done: !c.done } : c)));
    setError(null);
    const r = await automationApi(`/api/social/automations/inbox/${item.id}`, { method: "PATCH", body: JSON.stringify({ toggle: i }) });
    if (!r.ok) {
      setChecks(before);
      setError(r.message);
    } else if (before.filter((c, k) => (k === i ? !c.done : c.done)).length === before.length) onChange();
  };
  const patch = async (body: object) => {
    setBusy(true);
    const r = await automationApi(`/api/social/automations/inbox/${item.id}`, { method: "PATCH", body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) setError(r.message);
    else onChange();
  };
  const approve = async () => {
    setBusy(true);
    const r = await automationApi<{ draftId: string }>(`/api/social/automations/inbox/${item.id}/approve`, { method: "POST", body: JSON.stringify({ timezone: browserTimeZone() }) });
    setBusy(false);
    if (!r.ok) setError(r.message);
    else onChange();
  };
  return (
    <li className="animate-in fade-in slide-in-from-bottom-1 rounded-2xl border bg-card p-4 duration-300 motion-reduce:animate-none">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-bold tracking-[0.1em] text-muted-foreground uppercase">
            {item.automationName} · <When iso={item.createdAt} />
          </p>
          <p className="mt-1 font-semibold">{item.title}</p>
          {item.body ? <p className="mt-1 text-[0.85rem] leading-relaxed whitespace-pre-wrap text-muted-foreground">{item.body}</p> : null}
        </div>
        <button type="button" onClick={() => patch({ status: "dismissed" })} disabled={busy} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label={`Dismiss ${item.title}`}>
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {item.checklist.length ? (
        <ul className="mt-3 space-y-1">
          {checks.map((c, i) => (
            <li key={i}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1 text-[0.85rem] hover:bg-muted/60">
                <input type="checkbox" checked={c.done} onChange={() => toggle(i)} disabled={busy} className="size-4 accent-[#7047eb]" />
                <span className={cn(c.done && "text-muted-foreground line-through")}>{c.text}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      {item.refs.length ? (
        <ul className="mt-3 space-y-1">
          {item.refs.map((r) => (
            <li key={r.id}>
              <Link href={r.type === "post" ? postHref(r.id) : `/dashboard/social/accounts?account=${r.id}`} className="inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-primary hover:underline">
                {r.label} <ArrowRight className="size-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="mt-2 text-[0.8rem] text-destructive">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {item.kind === "suggestion" ? (
          item.draftId ? (
            <Link href={postHref(item.draftId)} className={cn(quietButton, "h-8 px-3 text-[0.78rem]")}>
              Open draft <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : (
            <button type="button" onClick={approve} disabled={busy} className={cn(primaryButton, "h-8 px-3 text-[0.78rem]")}>
              <FilePlus2 className="size-3.5" aria-hidden /> Approve as draft
            </button>
          )
        ) : null}
        {item.kind !== "suggestion" ? (
          <button type="button" onClick={() => patch({ status: "done" })} disabled={busy} className={cn(quietButton, "h-8 px-3 text-[0.78rem]")}>
            <Check className="size-3.5" aria-hidden /> Mark done
          </button>
        ) : null}
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Workflow card                                                             */
/* -------------------------------------------------------------------------- */

function WorkflowCard({ a, onActivate, onPause, onDuplicate, onDelete, busy }: { a: AutomationView; onActivate: () => void; onPause: () => void; onDuplicate: () => void; onDelete: () => void; busy: boolean }) {
  return (
    <li className="flex flex-col rounded-3xl border bg-card p-4 shadow-soft transition-[border-color] hover:border-primary/25 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link href={automationHref(a.id)} className="block truncate font-heading text-[1.02rem] font-bold hover:text-primary focus-visible:underline focus-visible:outline-none">
            {a.name}
          </Link>
          {a.description ? <p className="mt-0.5 line-clamp-1 text-[0.8rem] text-muted-foreground">{a.description}</p> : null}
        </div>
        <AutomationBadge status={a.status} />
      </div>
      <div className="mt-4">
        <FlowPreview trigger={a.trigger} action={a.action} onlyIfFound={a.onlyIfFound} compact />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-[0.75rem]">
        <div>
          <dt className="text-muted-foreground">Last run</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 font-medium">{a.lastRunAt ? <When iso={a.lastRunAt} /> : "Not yet"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Next run</dt>
          <dd className="mt-0.5 font-medium">{a.nextRunAt ? <When iso={a.nextRunAt} /> : a.status === "active" ? "—" : "Not scheduled"}</dd>
        </div>
      </dl>
      {a.attention ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-soon-soft px-3 py-2 text-[0.75rem] text-soon">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {a.attention}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
        {a.status === "active" ? (
          <button type="button" onClick={onPause} disabled={busy} className={cn(quietButton, "h-8 px-3 text-[0.78rem]")}>
            <Pause className="size-3.5" aria-hidden /> Pause
          </button>
        ) : (
          <button type="button" onClick={onActivate} disabled={busy} className={cn(primaryButton, "h-8 px-3 text-[0.78rem]")}>
            <Play className="size-3.5" aria-hidden /> Activate
          </button>
        )}
        <Link href={`${automationHref(a.id)}/edit`} className={cn(quietButton, "h-8 px-3 text-[0.78rem]")}>
          <Pencil className="size-3.5" aria-hidden /> Edit
        </Link>
        <button type="button" onClick={onDuplicate} disabled={busy} className={cn(quietButton, "h-8 px-2.5 text-[0.78rem]")} aria-label={`Duplicate ${a.name}`}>
          <Copy className="size-3.5" aria-hidden />
        </button>
        <button type="button" onClick={onDelete} disabled={busy} className={cn(quietButton, "h-8 px-2.5 text-[0.78rem] text-destructive hover:bg-destructive/[0.06]")} aria-label={`Delete ${a.name}`}>
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
    </li>
  );
}

/** Activation is always explicit: the customer sees exactly what will run and confirms. */
export function ActivateDialog({ a, onClose, onDone }: { a: AutomationView | null; onClose: () => void; onDone: () => void }) {
  const [agree, setAgree] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [wasOpen, setWasOpen] = React.useState(false);
  if (!!a !== wasOpen) {
    setWasOpen(!!a);
    setAgree(false);
    setError(null);
  }
  const go = async () => {
    if (!a) return;
    setBusy(true);
    const r = await automationApi(`/api/social/automations/${a.id}/state`, { method: "POST", body: JSON.stringify({ action: "activate", confirmed: true }) });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    onDone();
  };
  return (
    <Dialog open={!!a} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        {a ? (
          <>
            <div className="space-y-4 p-6">
              <DialogTitle className="font-heading text-lg font-bold">Activate “{a.name}”?</DialogTitle>
              <DialogDescription className="sr-only">Review what this automation will do before activating it.</DialogDescription>
              <FlowPreview trigger={a.trigger} action={a.action} onlyIfFound={a.onlyIfFound} timezone={a.timezone} />
              <p className="text-[0.8rem] text-muted-foreground">{frequency(a.trigger)}</p>
              <ul className="space-y-1 text-[0.8rem]">
                {permissionsFor(a.action).map((p) => (
                  <li key={p} className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden /> {p}
                  </li>
                ))}
              </ul>
              <label className="flex items-start gap-2.5 rounded-2xl bg-muted/50 p-3 text-[0.82rem] dark:bg-white/[0.03]">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 accent-[#7047eb]" />I authorise this automation to run as shown. I can pause it at any time.
              </label>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
            <div className="flex justify-end gap-2 border-t bg-muted/40 px-6 py-4">
              <button type="button" className={quietButton} onClick={onClose}>
                Cancel
              </button>
              <button type="button" className={primaryButton} onClick={go} disabled={!agree || busy}>
                <Play className="size-4" aria-hidden /> {busy ? "Activating…" : "Activate"}
              </button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */

const SORTS = { updated: "Recently edited", name: "Name", next: "Next run" } as const;

export function AutomationStudio({ data }: { data: AutomationData & { accounts: number } }) {
  useDisplay();
  const router = useRouter();
  const ai = useToolStatus("automation-assistant").status;
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "active" | "paused" | "draft">("all");
  const [sort, setSort] = React.useState<keyof typeof SORTS>("updated");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [activating, setActivating] = React.useState<AutomationView | null>(null);
  const [deleting, setDeleting] = React.useState<AutomationView | null>(null);

  const open = data.inbox.filter((i) => i.status === "open");
  const attention = data.automations.filter((a) => a.attention && a.status !== "draft");
  const needle = q.trim().toLowerCase();
  const list = data.automations
    .filter((a) => (filter === "all" ? true : filter === "paused" ? a.status === "paused" || a.status === "completed" : a.status === filter))
    .filter((a) => !needle || `${a.name} ${a.description}`.toLowerCase().includes(needle))
    .sort((x, y) => (sort === "name" ? x.name.localeCompare(y.name) : sort === "next" ? (x.nextRunAt ?? "9").localeCompare(y.nextRunAt ?? "9") : y.updatedAt.localeCompare(x.updatedAt)));

  const act = async (id: string, path: string, init: RequestInit) => {
    setBusy(id);
    setError(null);
    const r = await automationApi<{ automation?: AutomationView }>(path, init);
    setBusy(null);
    if (!r.ok) return setError(r.message);
    router.refresh();
  };

  const header = (
    <SocialHeader
      title="Automations"
      subtitle="Simple routines that keep your content on track — reminders, checklists and checks that run on your schedule."
      action={
        <Link href={AUTOMATION_ROUTES.create} className={primaryButton}>
          <Plus className="size-4" aria-hidden /> Create automation
        </Link>
      }
    />
  );

  const templates = (
    <section aria-labelledby="templates-title" className="mt-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="templates-title" className="font-heading text-lg font-bold">
            Start from a template
          </h2>
          <p className="text-sm text-muted-foreground">Each one is ready to use — adjust it, review it and activate it.</p>
        </div>
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {TEMPLATES.map((t) => {
          const Icon = TEMPLATE_ICON[t.icon];
          return (
            <li key={t.id}>
              <Link href={templateHref(t.id)} className="group flex h-full items-start gap-3 rounded-2xl border bg-card p-4 transition-[border-color,box-shadow,transform] duration-200 hover:border-primary/30 hover:shadow-[0_14px_30px_-24px_rgb(112_71_235/0.7)] focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none motion-safe:hover:-translate-y-0.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/[0.08] text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground dark:bg-primary/20 dark:text-[#c9bcff]">
                  <Icon className="size-[1.1rem]" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold group-hover:text-primary">{t.name}</span>
                  <span className="mt-0.5 block text-[0.78rem] leading-relaxed text-muted-foreground">{t.purpose}</span>
                  <span className="mt-1.5 block text-[0.7rem] font-semibold text-muted-foreground">{ACTION_META[t.definition.action.type].label}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <details className="group mt-3 rounded-2xl border border-dashed px-4 py-3">
        <summary className="cursor-pointer list-none text-[0.8rem] font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">Not available as automations</summary>
        <ul className="mt-2 space-y-1.5">
          {UNAVAILABLE_TEMPLATES.map((u) => (
            <li key={u.name} className="flex items-start gap-2 text-[0.8rem] text-muted-foreground">
              <Ban className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold text-foreground">{u.name}</span> — {u.reason}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );

  const assistant = (
    <Panel className="flex items-start gap-3 p-4 sm:p-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-graphite text-lime dark:bg-white/10">
        <Sparkles className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">AI Workflow Assistant {ai?.availability === "available" ? null : <span className="ms-1 rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-bold text-muted-foreground uppercase">Coming soon</span>}</p>
        <p className="mt-0.5 text-muted-foreground">{ai?.availability === "available" ? "Describe a routine and get a workflow draft to review." : "Soon you'll describe a routine in plain words and get a workflow draft to review. The step-by-step builder works today."}</p>
        <Link href={AUTOMATION_ROUTES.create} className="mt-2 inline-flex items-center gap-1 text-[0.8rem] font-semibold text-primary hover:underline">
          {ai?.availability === "available" ? "Try it" : "Open the builder"} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Panel>
  );

  if (!data.automations.length && !open.length) {
    return (
      <div className={page}>
        {header}
        <Panel className="mt-6 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="p-6 sm:p-8">
              <EmptyIllustration icon={Workflow} />
              <h2 className="mt-5 font-heading text-[1.5rem] leading-tight font-extrabold tracking-tight">Automate the routine. Keep the judgement.</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Set up reminders, checklists and checks that run on your schedule and land in your Sociotix inbox. Automations never publish, order or spend anything — every one runs only after you activate it.</p>
              <Link href={AUTOMATION_ROUTES.create} className={cn(primaryButton, "mt-6")}>
                <Plus className="size-4" aria-hidden /> Create your first automation
              </Link>
            </div>
            <ol className="space-y-3 border-t bg-subtle/60 p-6 sm:p-8 lg:border-t-0 lg:border-s dark:bg-white/[0.02]">
              {["Pick a trigger — a schedule, or a check on your drafts or accounts.", "Pick an action — a reminder, checklist, review flag or draft suggestion.", "Review exactly what it will do, then activate it."].map((s, i) => (
                <li key={s} className="flex gap-3 text-sm">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-graphite text-[0.7rem] font-bold text-lime dark:bg-white/10">{i + 1}</span>
                  <span className="pt-0.5 text-muted-foreground">{s}</span>
                </li>
              ))}
            </ol>
          </div>
        </Panel>
        <div className="mt-5">{assistant}</div>
        {templates}
      </div>
    );
  }

  return (
    <div className={page}>
      {header}
      {error ? (
        <p role="alert" className="mt-5 rounded-2xl bg-destructive/[0.07] px-4 py-3 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {open.length ? (
            <section aria-labelledby="inbox-title">
              <h2 id="inbox-title" className="flex items-center gap-2 font-heading text-lg font-bold">
                <Inbox className="size-4 text-primary" aria-hidden /> Inbox <span className="rounded-full bg-primary px-2 py-0.5 text-[0.7rem] font-bold text-primary-foreground tabular-nums">{open.length}</span>
              </h2>
              <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {open.slice(0, 8).map((i) => (
                  <InboxCard key={i.id} item={i} onChange={() => router.refresh()} />
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="list-title">
            <div className="flex flex-col gap-3">
              <h2 id="list-title" className="font-heading text-lg font-bold">
                Your automations
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1" role="group" aria-label="Filter automations">
                  {(["all", "active", "paused", "draft"] as const).map((f) => (
                    <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn("h-8 rounded-full border px-3 text-[0.78rem] font-semibold capitalize", filter === f ? "border-transparent bg-graphite text-white dark:bg-white dark:text-graphite" : "bg-card text-muted-foreground hover:text-foreground")}>
                      {f === "draft" ? "Not activated" : f}
                    </button>
                  ))}
                </div>
                <label className="relative">
                  <span className="sr-only">Search automations</span>
                  <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-8 w-36 rounded-full border bg-card ps-8 pe-3 text-[0.8rem] outline-none focus-visible:ring-3 focus-visible:ring-primary/30" />
                </label>
                <label>
                  <span className="sr-only">Sort automations</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)} className="h-8 rounded-full border bg-card px-3 text-[0.78rem] font-semibold outline-none focus-visible:ring-3 focus-visible:ring-primary/30">
                    {Object.entries(SORTS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            {list.length ? (
              <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {list.map((a) => (
                  <WorkflowCard
                    key={a.id}
                    a={a}
                    busy={busy === a.id}
                    onActivate={() => setActivating(a)}
                    onPause={() => act(a.id, `/api/social/automations/${a.id}/state`, { method: "POST", body: JSON.stringify({ action: "pause" }) })}
                    onDuplicate={() => act(a.id, `/api/social/automations/${a.id}/duplicate`, { method: "POST" })}
                    onDelete={() => setDeleting(a)}
                  />
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{data.automations.length ? "No automations match." : "No automations yet — start from a template below."}</p>
            )}
          </section>
          {templates}
        </div>

        <aside className="min-w-0 space-y-4">
          {assistant}
          {attention.length ? (
            <Panel className="border-soon/25 bg-soon-soft/50 p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-soon">
                <CircleAlert className="size-4" aria-hidden /> Needs attention
              </h2>
              <ul className="mt-2 space-y-1.5">
                {attention.map((a) => (
                  <li key={a.id}>
                    <Link href={automationHref(a.id)} className="text-[0.82rem] font-semibold hover:underline">
                      {a.name}
                    </Link>
                    <p className="text-[0.75rem] text-muted-foreground">{a.attention}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          <Panel className="p-4">
            <h2 className="font-heading text-base font-bold">Recent runs</h2>
            {data.runs.length ? (
              <ul className="mt-3 space-y-2.5">
                {data.runs.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-start gap-2.5">
                    <RunBadge status={r.status} />
                    <div className="min-w-0 text-[0.8rem]">
                      {r.automationId ? (
                        <Link href={automationHref(r.automationId)} className="block truncate font-semibold hover:underline">
                          {r.automationName}
                        </Link>
                      ) : (
                        <p className="truncate font-semibold">{r.automationName}</p>
                      )}
                      <p className="line-clamp-2 text-muted-foreground">{r.outcome ?? "Running…"}</p>
                      <p className="text-[0.7rem] text-muted-foreground">
                        <When iso={r.startedAt} />
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[0.82rem] text-muted-foreground">Runs appear here after an active automation&apos;s first trigger.</p>
            )}
          </Panel>
          <p className="flex items-start gap-2 px-1 text-[0.75rem] leading-relaxed text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Automations only create items in your inbox. They never publish, schedule posts, place orders, move money or message anyone.
          </p>
        </aside>
      </div>

      <ActivateDialog a={activating} onClose={() => setActivating(null)} onDone={() => (setActivating(null), router.refresh())} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        tone="danger"
        icon={Trash2}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description="The automation stops and is removed. Its run history and anything already in your inbox are kept."
        confirmLabel="Delete automation"
        onConfirm={() => deleting && act(deleting.id, `/api/social/automations/${deleting.id}`, { method: "DELETE" })}
      />
    </div>
  );
}
