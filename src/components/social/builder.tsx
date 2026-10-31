"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Ban, Check, Lock, Play, Plus, Save, ShieldCheck, Sparkles, X } from "lucide-react";
import { useToolStatus } from "@/components/ai/use-ai-status";
import { Panel, useHydrated } from "@/components/dashboard/shared";
import { formatDateTime, useDisplay } from "@/lib/i18n";
import {
  type Action,
  ACTION_META,
  type ActionType,
  type AutomationView,
  automationHref,
  AUTOMATION_ROUTES,
  COMPATIBLE,
  definitionSchema,
  frequency,
  nextRunAt,
  permissionsFor,
  type AutomationTemplate,
  type Trigger,
  TRIGGER_META,
  type TriggerType,
  WEEKDAYS,
} from "@/lib/social/automations";
import { browserTimeZone } from "@/lib/social/time";
import { cn } from "@/lib/utils";
import { ACTION_ICON, automationApi, FlowPreview, TRIGGER_ICON } from "./automation-parts";
import { page, primaryButton, quietButton, SocialNav } from "./parts";
import { useUnsavedWarning } from "./publishing-parts";

/* Guided workflow builder (AI-08): trigger → action → configure → review & activate. No node canvas. */

const field = "w-full rounded-2xl border bg-background px-3.5 py-2.5 text-[0.9rem] outline-none focus-visible:border-primary/40 focus-visible:ring-3 focus-visible:ring-primary/20 dark:bg-white/[0.02]";
const label = "text-[0.78rem] font-semibold";
const STEPS = ["Trigger", "Action", "Configure", "Review"];

type State = {
  triggerType: TriggerType;
  days: number[];
  time: string;
  at: string;
  withinDays: number;
  actionType: ActionType;
  title: string;
  message: string;
  items: string[];
  text: string;
  name: string;
  description: string;
  onlyIfFound: boolean;
  templateId: string | null;
};

function fromDefinition(d: { trigger: Trigger; action: Action; name: string; description?: string; onlyIfFound?: boolean; templateId?: string | null }): State {
  const t = d.trigger;
  const a = d.action;
  return {
    triggerType: t.type,
    days: t.type === "weekly" ? t.days : [1],
    time: "time" in t ? t.time : "09:00",
    at: t.type === "once" ? t.at : "",
    withinDays: t.type === "draft_due" ? t.withinDays : a.type === "flag_drafts" ? a.withinDays : 3,
    actionType: a.type,
    title: "title" in a ? a.title : "",
    message: a.type === "reminder" ? a.message : "",
    items: a.type === "checklist" ? a.items : [""],
    text: a.type === "draft_suggestion" ? a.text : "",
    name: d.name,
    description: d.description ?? "",
    onlyIfFound: d.onlyIfFound ?? true,
    templateId: d.templateId ?? null,
  };
}

const BLANK: State = { triggerType: "weekly", days: [1], time: "09:00", at: "", withinDays: 3, actionType: "reminder", title: "", message: "", items: [""], text: "", name: "", description: "", onlyIfFound: true, templateId: null };

function toDefinition(s: State, tz: string) {
  const trigger =
    s.triggerType === "weekly" ? { type: "weekly", days: s.days, time: s.time } : s.triggerType === "daily" ? { type: "daily", time: s.time } : s.triggerType === "once" ? { type: "once", at: s.at } : s.triggerType === "draft_due" ? { type: "draft_due", time: s.time, withinDays: s.withinDays } : { type: "account_attention", time: s.time };
  const action =
    s.actionType === "reminder"
      ? { type: "reminder", title: s.title, message: s.message }
      : s.actionType === "checklist"
        ? { type: "checklist", title: s.title, items: s.items.filter((i) => i.trim()) }
        : s.actionType === "flag_drafts"
          ? { type: "flag_drafts", withinDays: s.withinDays }
          : s.actionType === "health_check"
            ? { type: "health_check" }
            : { type: "draft_suggestion", title: s.title, text: s.text };
  return { name: s.name, description: s.description, timezone: tz, trigger, action, onlyIfFound: s.onlyIfFound, templateId: s.templateId };
}

const NEVER = ["Publish or schedule posts", "Place orders or spend money", "Change account permissions", "Message anyone or call websites"];

export function AutomationBuilder({ existing, template }: { existing: AutomationView | null; template: AutomationTemplate | null }) {
  useDisplay();
  const router = useRouter();
  const hydrated = useHydrated();
  const tz = existing?.timezone ?? (hydrated ? browserTimeZone() : "UTC");
  const [s, setS] = React.useState<State>(() => (existing ? fromDefinition(existing) : template ? fromDefinition({ ...template.definition, templateId: template.id } as Parameters<typeof fromDefinition>[0]) : BLANK));
  const [step, setStep] = React.useState(existing || template ? 2 : 0);
  const [dirty, setDirty] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [agree, setAgree] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "draft" | "activate">(null);
  const [error, setError] = React.useState<string | null>(null);
  const [request, setRequest] = React.useState("");
  const [aiNote, setAiNote] = React.useState<string | null>(null);
  const ai = useToolStatus("automation-assistant").status;
  const aiLive = ai?.availability === "available";
  useUnsavedWarning(dirty);

  const set = (patch: Partial<State>) => {
    setS((cur) => {
      const next = { ...cur, ...patch };
      // Data triggers allow exactly one action; keep the pair valid.
      if (patch.triggerType && !COMPATIBLE[patch.triggerType].includes(next.actionType)) next.actionType = COMPATIBLE[patch.triggerType][0]!;
      return next;
    });
    setDirty(true);
    setError(null);
    setAgree(false);
  };

  const def = toDefinition(s, tz);
  const parsed = definitionSchema.safeParse(def);
  const issues = parsed.success ? [] : parsed.error.issues;
  const issueFor = (prefix: string) => issues.find((i) => i.path.join(".").startsWith(prefix))?.message;
  const stepOk = [true, true, parsed.success, parsed.success];
  const next = hydrated && parsed.success ? nextRunAt(parsed.data.trigger, tz, new Date()) : null;

  async function save(activate: boolean) {
    setBusy(activate ? "activate" : "draft");
    setError(null);
    const body = JSON.stringify({ definition: def, ...(activate ? { activate: true, confirmed: true } : {}) });
    const r = existing ? await automationApi<{ automation: AutomationView }>(`/api/social/automations/${existing.id}`, { method: "PATCH", body }) : await automationApi<{ automation: AutomationView }>("/api/social/automations", { method: "POST", body });
    setBusy(null);
    if (!r.ok) return setError(r.message);
    setDirty(false);
    router.push(automationHref(r.data.automation.id));
    router.refresh();
  }

  async function suggest() {
    setAiNote(null);
    const res = await fetch("/api/ai/tools/automation-assistant/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request, timezone: tz }) });
    const body = await res.json().catch(() => null);
    if (!res.ok) return setAiNote(body?.error?.message ?? "The assistant couldn't suggest a workflow. Try rephrasing.");
    setS(fromDefinition(body.output.suggestion));
    setDirty(true);
    setAiNote(body.output.explanation);
    setStep(3);
  }

  const TriggerChoice = (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {(Object.keys(TRIGGER_META) as TriggerType[]).map((t) => {
        const Icon = TRIGGER_ICON[t];
        const on = s.triggerType === t;
        return (
          <button key={t} type="button" aria-pressed={on} onClick={() => set({ triggerType: t })} className={cn("flex items-start gap-3 rounded-2xl border p-3.5 text-start transition-[border-color,background-color] duration-200 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none", on ? "border-primary/50 bg-primary/[0.05] dark:bg-primary/15" : "bg-card hover:border-foreground/20")}>
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl transition-colors", on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground dark:bg-white/[0.06]")}>
              <Icon className="size-4" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold">{TRIGGER_META[t].label}</span>
              <span className="mt-0.5 block text-[0.76rem] leading-relaxed text-muted-foreground">{TRIGGER_META[t].hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );

  const ActionChoice = (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {(Object.keys(ACTION_META) as ActionType[]).map((a) => {
        const Icon = ACTION_ICON[a];
        const allowed = COMPATIBLE[s.triggerType].includes(a);
        const on = s.actionType === a;
        return (
          <button key={a} type="button" aria-pressed={on} disabled={!allowed} onClick={() => set({ actionType: a })} className={cn("flex items-start gap-3 rounded-2xl border p-3.5 text-start transition-[border-color,background-color] duration-200 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50", on ? "border-primary/50 bg-primary/[0.05] dark:bg-primary/15" : "bg-card hover:border-foreground/20")}>
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl transition-colors", on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground dark:bg-white/[0.06]")}>
              <Icon className="size-4" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold">{ACTION_META[a].label}</span>
              <span className="mt-0.5 block text-[0.76rem] leading-relaxed text-muted-foreground">{allowed ? ACTION_META[a].hint : `Not available with “${TRIGGER_META[s.triggerType].label}”.`}</span>
            </span>
          </button>
        );
      })}
    </div>
  );

  const Configure = (
    <div className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="text-sm font-bold">When</legend>
        {s.triggerType === "weekly" ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
            {WEEKDAYS.map((d) => {
              const on = s.days.includes(d.id);
              return (
                <button key={d.id} type="button" aria-pressed={on} aria-label={d.long} onClick={() => set({ days: on ? s.days.filter((x) => x !== d.id) : [...s.days, d.id] })} className={cn("h-9 w-12 rounded-xl border text-[0.8rem] font-semibold transition-colors", on ? "border-transparent bg-graphite text-white dark:bg-white dark:text-graphite" : "bg-card text-muted-foreground hover:text-foreground")}>
                  {d.short}
                </button>
              );
            })}
          </div>
        ) : null}
        {s.triggerType === "once" ? (
          <label className="block">
            <span className={label}>Date and time</span>
            <input type="datetime-local" value={s.at} onChange={(e) => set({ at: e.target.value })} className={cn(field, "mt-1.5")} />
          </label>
        ) : (
          <label className="block max-w-[12rem]">
            <span className={label}>{s.triggerType === "weekly" || s.triggerType === "daily" ? "Time" : "Check every day at"}</span>
            <input type="time" value={s.time} onChange={(e) => set({ time: e.target.value })} className={cn(field, "mt-1.5")} />
          </label>
        )}
        {s.triggerType === "draft_due" || s.actionType === "flag_drafts" ? (
          <label className="block max-w-[16rem]">
            <span className={label}>Drafts planned within</span>
            <select value={s.withinDays} onChange={(e) => set({ withinDays: Number(e.target.value) })} className={cn(field, "mt-1.5")}>
              {[1, 2, 3, 5, 7, 10, 14].map((n) => (
                <option key={n} value={n}>
                  {n} day{n === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <p className="text-[0.75rem] text-muted-foreground">Time zone: {tz}. Daylight-saving changes are handled for you.</p>
        {issueFor("trigger") ? <p className="text-[0.8rem] text-destructive">{issueFor("trigger")}</p> : null}
      </fieldset>

      {s.actionType === "reminder" || s.actionType === "checklist" || s.actionType === "draft_suggestion" ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-bold">What it creates</legend>
          <label className="block">
            <span className={label}>{s.actionType === "draft_suggestion" ? "Draft title" : "Title"}</span>
            <input value={s.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} className={cn(field, "mt-1.5")} placeholder="e.g. Plan this week's content" />
          </label>
          {s.actionType === "reminder" ? (
            <label className="block">
              <span className={label}>Message <span className="font-normal text-muted-foreground">(optional)</span></span>
              <textarea value={s.message} maxLength={500} rows={3} onChange={(e) => set({ message: e.target.value })} className={cn(field, "mt-1.5 resize-y")} />
            </label>
          ) : null}
          {s.actionType === "draft_suggestion" ? (
            <label className="block">
              <span className={label}>Suggested post text</span>
              <textarea value={s.text} maxLength={2000} rows={4} onChange={(e) => set({ text: e.target.value })} className={cn(field, "mt-1.5 resize-y")} placeholder="Text you'll be able to turn into a draft with one click" />
            </label>
          ) : null}
          {s.actionType === "checklist" ? (
            <div>
              <span className={label}>Checklist items</span>
              <ul className="mt-1.5 space-y-1.5">
                {s.items.map((it, i) => (
                  <li key={i} className="flex gap-1.5">
                    <input value={it} maxLength={120} aria-label={`Item ${i + 1}`} onChange={(e) => set({ items: s.items.map((x, k) => (k === i ? e.target.value : x)) })} className={field} />
                    {s.items.length > 1 ? (
                      <button type="button" onClick={() => set({ items: s.items.filter((_, k) => k !== i) })} className="grid size-11 shrink-0 place-items-center rounded-2xl border text-muted-foreground hover:bg-muted" aria-label={`Remove item ${i + 1}`}>
                        <X className="size-4" aria-hidden />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {s.items.length < 12 ? (
                <button type="button" onClick={() => set({ items: [...s.items, ""] })} className="mt-2 inline-flex items-center gap-1 text-[0.8rem] font-semibold text-primary">
                  <Plus className="size-3.5" aria-hidden /> Add item
                </button>
              ) : null}
            </div>
          ) : null}
          {issueFor("action") ? <p className="text-[0.8rem] text-destructive">{issueFor("action")}</p> : null}
        </fieldset>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="text-sm font-bold">Name</legend>
        <input value={s.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} className={field} placeholder="e.g. Monday planning reminder" aria-label="Automation name" />
        {issueFor("name") ? <p className="text-[0.8rem] text-destructive">{issueFor("name") === "Required." ? "Give your automation a name." : issueFor("name")}</p> : null}
        <button type="button" onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced} className="text-[0.8rem] font-semibold text-muted-foreground hover:text-foreground">
          {showAdvanced ? "Hide" : "Show"} advanced options
        </button>
        {showAdvanced ? (
          <div className="animate-in fade-in space-y-3 duration-200 motion-reduce:animate-none">
            <label className="block">
              <span className={label}>Description <span className="font-normal text-muted-foreground">(optional)</span></span>
              <input value={s.description} maxLength={200} onChange={(e) => set({ description: e.target.value })} className={cn(field, "mt-1.5")} />
            </label>
            {s.actionType === "flag_drafts" || s.actionType === "health_check" ? (
              <label className="flex items-start gap-2.5 text-[0.85rem]">
                <input type="checkbox" checked={s.onlyIfFound} onChange={(e) => set({ onlyIfFound: e.target.checked })} className="mt-0.5 size-4 accent-[#7047eb]" />
                Only add something to my inbox when there&apos;s something to review
              </label>
            ) : null}
          </div>
        ) : null}
      </fieldset>
    </div>
  );

  const Review = parsed.success ? (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-subtle/60 p-4 sm:p-5 dark:bg-white/[0.02]">
        <p className="font-heading text-lg font-bold">{parsed.data.name}</p>
        {parsed.data.description ? <p className="text-sm text-muted-foreground">{parsed.data.description}</p> : null}
        <div className="mt-4">
          <FlowPreview trigger={parsed.data.trigger} action={parsed.data.action} onlyIfFound={parsed.data.onlyIfFound} timezone={tz} />
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-2xl border p-3.5">
          <dt className="text-[0.72rem] font-semibold text-muted-foreground">How often</dt>
          <dd className="mt-0.5 font-medium">{frequency(parsed.data.trigger)}</dd>
        </div>
        <div className="rounded-2xl border p-3.5">
          <dt className="text-[0.72rem] font-semibold text-muted-foreground">First run, if activated now</dt>
          <dd className="mt-0.5 font-medium">{next ? formatDateTime(next.toISOString(), { year: true }) : "Never — check the schedule"}</dd>
        </div>
      </dl>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[0.78rem] font-bold">It may</p>
          <ul className="mt-1.5 space-y-1">
            {permissionsFor(parsed.data.action).map((p) => (
              <li key={p} className="flex items-start gap-2 text-[0.8rem]">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden /> {p}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[0.78rem] font-bold">It never will</p>
          <ul className="mt-1.5 space-y-1">
            {NEVER.map((p) => (
              <li key={p} className="flex items-start gap-2 text-[0.8rem] text-muted-foreground">
                <Ban className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <label className="flex items-start gap-2.5 rounded-2xl bg-primary/[0.05] p-3.5 text-[0.85rem] dark:bg-primary/10">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 accent-[#7047eb]" />I authorise this automation to run as shown. I can pause or delete it at any time.
      </label>
    </div>
  ) : (
    <p className="rounded-2xl bg-destructive/[0.07] px-4 py-3 text-sm text-destructive">Go back and fix: {issues[0]?.message}</p>
  );

  return (
    <div className={page}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Link href={existing ? automationHref(existing.id) : AUTOMATION_ROUTES.studio} className="grid size-10 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none" aria-label="Back">
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-[1.5rem] leading-tight font-extrabold tracking-tight sm:text-[1.8rem]">{existing ? "Edit automation" : "Create automation"}</h1>
            <p className="text-[0.82rem] text-muted-foreground">{existing?.status === "active" ? "Saving without re-activating pauses it until you activate again." : "Nothing runs until you review and activate it."}</p>
          </div>
        </div>
        <SocialNav />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          {!existing ? (
            <Panel className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-graphite text-lime dark:bg-white/10">
                  <Sparkles className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    Describe it instead {aiLive ? null : <span className="ms-1 rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-bold text-muted-foreground uppercase">Coming soon</span>}
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input value={request} onChange={(e) => setRequest(e.target.value)} maxLength={400} disabled={!aiLive} className={cn(field, "disabled:opacity-60")} placeholder="e.g. Remind me every Monday to review my content calendar" aria-label="Describe your automation" />
                    <button type="button" onClick={suggest} disabled={!aiLive || request.trim().length < 10} className={cn(quietButton, "shrink-0")}>
                      {aiLive ? <Sparkles className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />} Suggest
                    </button>
                  </div>
                  <p className="mt-1.5 text-[0.75rem] text-muted-foreground">{aiLive ? "Suggestions use only Sociotix's supported triggers and actions. You review everything before activating." : "AI suggestions aren't switched on yet — the builder below works today."}</p>
                  {aiNote ? <p className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-[0.8rem]">{aiNote}</p> : null}
                </div>
              </div>
            </Panel>
          ) : null}

          <Panel className="overflow-hidden">
            <ol className="grid grid-cols-4 border-b" aria-label="Steps">
              {STEPS.map((name, i) => (
                <li key={name}>
                  <button type="button" onClick={() => (i <= step || stepOk.slice(0, i).every(Boolean)) && setStep(i)} aria-current={i === step ? "step" : undefined} className={cn("flex w-full flex-col items-start gap-1 px-3 py-3 text-start transition-colors sm:px-4", i === step ? "bg-primary/[0.04] dark:bg-primary/10" : "hover:bg-muted/50")}>
                    <span className={cn("h-1 w-full rounded-full transition-colors duration-300", i < step ? "bg-primary" : i === step ? "bg-primary/60" : "bg-border")} aria-hidden />
                    <span className={cn("text-[0.72rem] font-semibold sm:text-[0.8rem]", i === step ? "text-foreground" : "text-muted-foreground")}>
                      <span className="sr-only">Step {i + 1}: </span>
                      {name}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <div key={step} className="animate-in fade-in slide-in-from-right-2 p-4 duration-300 motion-reduce:animate-none sm:p-6">
              <h2 className="mb-4 font-heading text-lg font-bold">{["Choose a trigger", "Choose an action", "Configure", "Review & activate"][step]}</h2>
              {step === 0 ? TriggerChoice : step === 1 ? ActionChoice : step === 2 ? Configure : Review}
            </div>
            {error ? (
              <p role="alert" className="mx-4 mb-4 rounded-2xl bg-destructive/[0.07] px-4 py-3 text-sm text-destructive sm:mx-6">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-4 py-3.5 sm:px-6">
              <button type="button" className={quietButton} onClick={() => setStep((n) => Math.max(0, n - 1))} disabled={step === 0}>
                <ArrowLeft className="size-4" aria-hidden /> Back
              </button>
              {step < 3 ? (
                <button type="button" className={primaryButton} onClick={() => setStep((n) => n + 1)} disabled={step === 2 && !parsed.success}>
                  Continue <ArrowRight className="size-4" aria-hidden />
                </button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={quietButton} onClick={() => save(false)} disabled={!parsed.success || busy !== null}>
                    <Save className="size-4" aria-hidden /> {busy === "draft" ? "Saving…" : "Save without activating"}
                  </button>
                  <button type="button" className={primaryButton} onClick={() => save(true)} disabled={!parsed.success || !agree || busy !== null || !next}>
                    <Play className="size-4" aria-hidden /> {busy === "activate" ? "Activating…" : "Activate"}
                  </button>
                </div>
              )}
            </div>
          </Panel>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <Panel className="p-4 sm:p-5">
            <p className="text-[0.78rem] font-bold">Preview</p>
            <div className="mt-3">
              <FlowPreview trigger={(parsed.success ? parsed.data.trigger : (def.trigger as Trigger)) ?? { type: "daily", time: "09:00" }} action={(parsed.success ? parsed.data.action : (def.action as Action)) ?? { type: "health_check" }} onlyIfFound={s.onlyIfFound} />
            </div>
            <p className="mt-4 flex items-start gap-1.5 text-[0.72rem] leading-relaxed text-muted-foreground">
              <Check className="mt-0.5 size-3 shrink-0" aria-hidden /> Results land in your Automations inbox. Nothing leaves Sociotix.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
