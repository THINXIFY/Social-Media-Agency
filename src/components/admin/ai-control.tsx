"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, CircleAlert, CircleCheck, CircleDashed, CirclePause, ExternalLink, Eye, EyeOff, KeyRound, Lock, OctagonPause, Play, Plus, RotateCcw, Search, ShieldCheck, X } from "lucide-react";
import { ConfirmDialog } from "@/components/dashboard/account-ui";
import { type Capabilities, CAPABILITY_LABEL, PROVIDER_STATE_LABEL, type ProviderDisplayState, type ProviderInfo } from "@/lib/ai/provider-catalog";
import { formatDateTime } from "@/lib/i18n";
import { api, ApiError } from "@/lib/live-account";
import { cn } from "@/lib/utils";
import { Field, inputClass, SelectInput, TextInput } from "./form";
import { useReauth } from "./reauth";
import { Card, CardHeader } from "./ui";

/*
 * Admin AI Control Center. Every rule is enforced on the server: roles
 * (Settings, Security settings), fresh re-authentication for keys, budgets
 * and activation, encrypted write-only keys, compatibility checks and the
 * launch switch (AI_GENERATION_ENABLED), which this page can't turn on.
 */

type Cred = { id: string; providerId: string; version: number; label: string; hint: string; status: string; verifiedAt: string | null; lastTestAt: string | null; lastTestCode: string | null; lastTestMessage: string | null; lastTestBillable: boolean | null; activatedAt: string | null; createdAt: string; createdBy: string | null };
type Model = { providerId: string; providerName: string; modelId: string; displayName: string; source: string; status: string; capabilities: Capabilities; contextTokens: number | null; maxOutputTokens: number | null; price: { input: number; output: number; source: string | null; checkedAt: string | null } | null; verifiedAt: string | null };
type Assignment = { toolId: string; toolName: string; guard: { maxCostMicros: number; maxOutputTokens: number }; assignment: { providerId: string; modelId: string; status: string; testedAt: string | null; testPassed: boolean | null; testNote: string | null; activatedAt: string | null } | null };
type Controls = { emergencyDisabled: boolean; dailyBudgetMicros: number | null; monthlyBudgetMicros: number | null; maxRequestMicros: number | null; perProvider: Record<string, number>; perModel: Record<string, number>; perTool: Record<string, number>; disabledProviders: string[]; version: number };
interface Center {
  summary: {
    generation: { enabled: boolean; live: boolean; reason: string | null };
    emergencyDisabled: boolean;
    envProvider: string;
    providers: { id: string; name: string; product: string; state: ProviderDisplayState }[];
    keys: { total: number; active: number };
    assignments: { active: number; draft: number };
    budget: { today: { spent: number; limit: number; envLimit: number }; month: { spent: number; limit: number | null } };
  };
  providers: ProviderInfo[];
  credentials: Cred[];
  models: Model[];
  assignments: Assignment[];
  controls: Controls;
  can: { manage: boolean; sensitive: boolean };
}

const TABS = [
  ["overview", "Overview"],
  ["providers", "Providers & Keys"],
  ["models", "Models"],
  ["assignments", "Tool Assignments"],
  ["usage", "Usage & Costs"],
  ["budgets", "Budgets & Settings"],
  ["audit", "Audit History"],
] as const;
type Tab = (typeof TABS)[number][0];

const usd = (micros: number) => `$${(micros / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: micros > 0 && micros < 10_000 ? 4 : 2 })}`;
const message = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "That didn't work. Nothing was changed.");
const btn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";
const primaryBtn = cn(btn, "bg-primary text-primary-foreground hover:bg-primary/90");
const quietBtn = cn(btn, "border bg-card hover:bg-muted");
const dangerBtn = cn(btn, "border border-destructive/30 text-destructive hover:bg-destructive/5");

const STATE_TONE: Record<ProviderDisplayState, string> = {
  verified: "bg-ok-soft text-ok",
  supported: "bg-primary/10 text-primary dark:text-[#c4b5ff]",
  configuration_available: "bg-soon-soft text-soon",
  adapter_pending: "bg-muted text-muted-foreground",
  disabled: "bg-off-soft text-off",
};
const KEY_TONE: Record<string, string> = { active: "bg-ok-soft text-ok", verified: "bg-primary/10 text-primary dark:text-[#c4b5ff]", saved: "bg-muted text-muted-foreground", failed: "bg-destructive/10 text-destructive", retired: "bg-off-soft text-off", disabled: "bg-off-soft text-off" };
const KEY_LABEL: Record<string, string> = { active: "Active", verified: "Verified, not active", saved: "Saved, not tested", failed: "Test failed", retired: "Retired", disabled: "Disabled" };

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[0.72rem] font-semibold whitespace-nowrap", className)}>{children}</span>;
}
function Alert({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "ok" }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl border px-3.5 py-2.5 text-sm", tone === "error" ? "border-destructive/30 bg-destructive/5" : "border-ok/30 bg-ok-soft text-ok")}>
      {children}
    </p>
  );
}

function useJson<T>(url: string | null) {
  const [n, setN] = React.useState(0);
  const key = url ? `${url}#${n}` : null;
  const [state, setState] = React.useState<{ key?: string; data?: T; error?: string }>({});
  React.useEffect(() => {
    if (!url || !key) return;
    let cancelled = false;
    api<T>(url).then(
      (data) => !cancelled && setState({ key, data }),
      (e: Error) => !cancelled && setState({ key, error: e.message }),
    );
    return () => {
      cancelled = true;
    };
  }, [url, key]);
  return { data: state.data, error: state.key === key ? state.error : undefined, loading: Boolean(key) && state.key !== key, reload: () => setN((x) => x + 1) };
}

/** Runs an action (with the re-auth prompt when needed) and reports the outcome. */
function useAction(onDone: () => void) {
  const { guard, dialog } = useReauth();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const run = async <T,>(key: string, fn: () => Promise<T>, ok: string | ((r: T) => string)) => {
    setBusy(key);
    setError(null);
    setDone(null);
    try {
      let result: T | undefined;
      await guard(async () => {
        result = await fn();
      });
      setDone(typeof ok === "function" ? ok(result as T) : ok);
      onDone();
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { run, busy, error, done, dialog, clear: () => (setError(null), setDone(null)) };
}

export function AiControlCenter({ diagnostics }: { diagnostics: React.ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = (TABS.find(([id]) => id === params.get("tab"))?.[0] ?? "overview") as Tab;
  const center = useJson<Center>("/api/admin/ai-control");
  const d = center.data;
  const act = useAction(center.reload);
  const [confirmResume, setConfirmResume] = React.useState(false);
  const tabs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const go = (t: Tab) => router.replace(t === "overview" ? pathname : `${pathname}?tab=${t}`, { scroll: false });
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    go(TABS[next][0]);
    tabs.current[next]?.focus();
  };

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.8rem] font-medium text-muted-foreground">Administration</p>
          <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">AI Management</h1>
          <p className="mt-1 max-w-2xl text-[0.95rem] text-muted-foreground">Manage AI providers, API keys, models, which model each tool uses, and spending limits. Customer generation stays off until it&apos;s separately approved.</p>
        </div>
        {d ? (
          <div className="flex flex-wrap items-center gap-2">
            <Chip className={d.summary.generation.live ? "bg-ok-soft text-ok" : "bg-muted text-muted-foreground"}>
              {d.summary.generation.live ? <CircleCheck className="size-3.5" aria-hidden /> : <CirclePause className="size-3.5" aria-hidden />}
              {d.summary.generation.live ? "Generation live" : "Generation off"}
            </Chip>
            {d.summary.emergencyDisabled ? (
              <button type="button" disabled={!d.can.sensitive || act.busy !== null} onClick={() => setConfirmResume(true)} className={cn(primaryBtn, "h-8")}>
                <Play className="size-3.5" aria-hidden /> Resume AI
              </button>
            ) : d.can.manage ? (
              <button type="button" disabled={act.busy !== null} onClick={() => act.run("pause", () => api("/api/admin/ai-control/controls", { method: "POST", body: JSON.stringify({ paused: true }) }), "AI paused. Every AI request is refused until it's resumed.")} className={cn(dangerBtn, "h-8")}>
                <OctagonPause className="size-3.5" aria-hidden /> Emergency pause
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {d?.summary.emergencyDisabled ? (
        <div role="note" className="mt-5 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3.5 text-sm">
          <OctagonPause className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p>
            <span className="font-semibold">AI is paused.</span> Every AI request is refused, whatever provider or key it would use. Resuming needs the Security settings permission and a fresh confirmation.
          </p>
        </div>
      ) : null}
      {act.done ? <div className="mt-4"><Alert tone="ok">{act.done}</Alert></div> : null}
      {act.error ? <div className="mt-4"><Alert>{act.error}</Alert></div> : null}

      <div role="tablist" aria-label="AI Management sections" className="-mx-1 mt-6 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map(([id, label], i) => (
          <button
            key={id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`ai-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`ai-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => go(id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn("inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none", tab === id ? "bg-graphite text-white dark:bg-white dark:text-graphite" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`ai-panel-${tab}`} aria-labelledby={`ai-tab-${tab}`} className="mt-5">
        {center.error ? (
          <Card className="flex flex-col items-center px-6 py-12 text-center">
            <p className="font-semibold">AI Management didn&apos;t load</p>
            <p className="mt-1 text-sm text-muted-foreground">{center.error}</p>
            <button type="button" onClick={center.reload} className={cn(quietBtn, "mt-4")}>
              <RotateCcw className="size-3.5" aria-hidden /> Try again
            </button>
          </Card>
        ) : !d ? (
          <div className="space-y-3" aria-label="Loading AI Management">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
            ))}
          </div>
        ) : tab === "overview" ? (
          <Overview d={d} diagnostics={diagnostics} />
        ) : tab === "providers" ? (
          <ProvidersTab d={d} reload={center.reload} />
        ) : tab === "models" ? (
          <ModelsTab d={d} reload={center.reload} />
        ) : tab === "assignments" ? (
          <AssignmentsTab d={d} reload={center.reload} />
        ) : tab === "usage" ? (
          <UsageTab d={d} />
        ) : tab === "budgets" ? (
          <BudgetsTab d={d} reload={center.reload} />
        ) : (
          <AuditTab />
        )}
      </div>
      <ConfirmDialog
        open={confirmResume}
        onOpenChange={setConfirmResume}
        title="Resume AI?"
        description="AI requests will be accepted again, subject to every other control. Customer generation still needs the launch switch."
        confirmLabel="Resume AI"
        onConfirm={() => {
          setConfirmResume(false);
          void act.run("resume", () => api("/api/admin/ai-control/controls", { method: "POST", body: JSON.stringify({ paused: false }) }), "AI resumed.");
        }}
      />
      {act.dialog}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Bar({ value, limit }: { value: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((value / limit) * 100)) : 0;
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={limit ?? 0} aria-valuenow={value} aria-label="Spend against limit">
      <span className={cn("block h-full rounded-full", pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-soon" : "bg-primary")} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Overview({ d, diagnostics }: { d: Center; diagnostics: React.ReactNode }) {
  const s = d.summary;
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <CardHeader id="ov-status" title="Where things stand" description="Real states only. Nothing on this page can switch customer generation on." />
        <dl className="mt-4 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Customer generation</dt>
            <dd className="mt-1 font-semibold">{s.generation.live ? "Live" : "Off"}</dd>
            {s.generation.reason ? <dd className="mt-0.5 text-xs text-muted-foreground">{s.generation.reason}</dd> : null}
          </div>
          <div>
            <dt className="text-muted-foreground">Active keys</dt>
            <dd className="mt-1 font-semibold tabular-nums">
              {s.keys.active} of {s.keys.total} saved
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tool assignments</dt>
            <dd className="mt-1 font-semibold tabular-nums">
              {s.assignments.active} active · {s.assignments.draft} draft
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Spend today</dt>
            <dd className="mt-1 font-semibold tabular-nums">
              {usd(s.budget.today.spent)} of {usd(s.budget.today.limit)}
            </dd>
            <dd>
              <Bar value={s.budget.today.spent} limit={s.budget.today.limit || null} />
            </dd>
          </div>
        </dl>
      </Card>
      <Card className="p-5">
        <CardHeader id="ov-providers" title="Providers" description="Supported means an adapter exists. Verified means an active key passed a test here." />
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {s.providers.map((p) => (
            <li key={p.id} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{p.product}</span>
              </span>
              <Chip className={STATE_TONE[p.state]}>{PROVIDER_STATE_LABEL[p.state]}</Chip>
            </li>
          ))}
        </ul>
      </Card>
      {diagnostics}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Providers & keys                                                          */
/* -------------------------------------------------------------------------- */

/** Extra search words per provider: model families and common names. UI-only; never used for routing. */
const ALIASES: Record<string, string[]> = {
  anthropic: ["claude"],
  openai: ["gpt", "chatgpt"],
  gemini: ["google", "gemini"],
  xai: ["grok", "x.ai"],
  deepseek: ["deepseek"],
  mistral: ["le chat", "codestral"],
  cohere: ["command"],
  groq: ["groqcloud", "lpu"],
  openrouter: ["router"],
  together: ["together"],
  fireworks: ["fireworks"],
  moonshot: ["kimi"],
  "azure-openai": ["azure", "microsoft", "foundry"],
  bedrock: ["aws", "amazon"],
  vertex: ["google cloud", "gcp"],
  "custom-openai": ["custom", "self-hosted", "compatible"],
};

type ProviderFilter = "all" | "supported" | "pending";
const ADAPTER_LABEL: Record<ProviderInfo["generation"], string> = { native: "Native adapter", openai_compatible: "OpenAI-compatible", pending: "Adapter pending" };

/** The key state only: never confused with adapter support or generation being on. */
function keySummary(keys: Cred[]): { label: string; tone: string; hint: string | null } {
  const active = keys.find((k) => k.status === "active");
  if (active) return { label: "Active key", tone: "bg-ok-soft text-ok", hint: active.hint };
  if (keys.some((k) => k.status === "verified")) return { label: "Verified, not active", tone: "bg-primary/10 text-primary dark:text-[#c4b5ff]", hint: null };
  if (keys.some((k) => k.status === "failed")) return { label: "Test failed", tone: "bg-destructive/10 text-destructive", hint: null };
  if (keys.some((k) => k.status === "saved")) return { label: "Not tested", tone: "bg-soon-soft text-soon", hint: null };
  return { label: "No key", tone: "bg-muted text-muted-foreground", hint: null };
}

function ProvidersTab({ d, reload }: { d: Center; reload: () => void }) {
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<ProviderFilter>("all");
  const [open, setOpen] = React.useState<string | null>(null);
  const search = React.useRef<HTMLInputElement>(null);
  const term = q.trim().toLowerCase();
  const matches = (p: ProviderInfo) => !term || [p.name, p.product, p.id, ...(ALIASES[p.id] ?? [])].some((s) => s.toLowerCase().includes(term));
  const byFilter = (p: ProviderInfo) => filter === "all" || (filter === "supported" ? p.generation !== "pending" : p.generation === "pending");
  const searched = d.providers.filter(matches);
  const shown = searched.filter(byFilter);
  const counts = { all: searched.length, supported: searched.filter((p) => p.generation !== "pending").length, pending: searched.filter((p) => p.generation === "pending").length };

  return (
    <div className="space-y-4">
      {!d.can.sensitive ? <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">You can see providers, but managing keys needs the Security settings permission.</p> : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <label htmlFor="pv-search" className="sr-only">
            Search AI providers
          </label>
          <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            ref={search}
            id="pv-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && q && (e.preventDefault(), setQ(""))}
            placeholder="Search AI providers..."
            autoComplete="off"
            className={cn(inputClass, "h-11 rounded-2xl bg-card ps-10 pe-10 shadow-[0_1px_2px_rgb(15_16_20/0.04)] [&::-webkit-search-cancel-button]:hidden")}
          />
          {q ? (
            <button type="button" onClick={() => (setQ(""), search.current?.focus())} aria-label="Clear search" className="absolute end-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <div role="radiogroup" aria-label="Filter providers" className="grid w-full shrink-0 grid-cols-3 gap-1 rounded-xl bg-muted p-1 sm:inline-flex sm:w-auto sm:self-start lg:self-auto">
          {(
            [
              ["all", "All"],
              ["supported", "Supported"],
              ["pending", "Adapter pending"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={filter === id} aria-label={`${label} (${counts[id]})`} onClick={() => setFilter(id)} className={cn("inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-[0.82rem] font-semibold whitespace-nowrap transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none sm:px-3", filter === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {id === "pending" ? (
                <>
                  <span className="sm:hidden">Pending</span>
                  <span className="hidden sm:inline">{label}</span>
                </>
              ) : (
                label
              )}
              <span className="rounded-md bg-muted px-1.5 text-[0.7rem] tabular-nums text-muted-foreground">{counts[id]}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {shown.length === d.providers.length ? `${shown.length} providers` : `Showing ${shown.length} of ${d.providers.length} providers`}
        <span className="hidden sm:inline"> · &ldquo;Supported&rdquo; means Sociotix has an adapter; it doesn&apos;t mean a key is verified or that generation is on.</span>
      </p>

      {shown.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-12 text-center">
          <span className="grid size-11 place-items-center rounded-2xl bg-secondary text-primary" aria-hidden>
            <Search className="size-5" />
          </span>
          <p className="mt-3 font-semibold">No providers match &ldquo;{q.trim() || "this filter"}&rdquo;</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Try a company or model family, such as OpenAI, Claude, Gemini or Grok.</p>
          <button type="button" onClick={() => (setQ(""), setFilter("all"))} className={cn(quietBtn, "mt-4")}>
            Clear search and filters
          </button>
        </Card>
      ) : (
        (["major", "enterprise"] as const).map((g) => {
          const rows = shown.filter((p) => p.group === g);
          if (!rows.length) return null;
          return (
            <section key={g} aria-labelledby={`pv-${g}`}>
              <h2 id={`pv-${g}`} className="mb-2 px-1 text-[0.72rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                {g === "major" ? "AI providers" : "Enterprise & custom"}
              </h2>
              <Card className="overflow-hidden">
                <ul className="divide-y">
                  {rows.map((p) => (
                    <ProviderRow key={p.id} p={p} d={d} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} reload={reload} />
                  ))}
                </ul>
              </Card>
            </section>
          );
        })
      )}
    </div>
  );
}

function Monogram({ p }: { p: ProviderInfo }) {
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl text-[0.8rem] font-bold", p.generation === "native" ? "bg-primary/10 text-primary dark:text-[#c4b5ff]" : p.generation === "openai_compatible" ? "bg-graphite text-lime dark:bg-white/10" : "bg-muted text-muted-foreground")} aria-hidden>
      {p.name.slice(0, 2)}
    </span>
  );
}

function ProviderRow({ p, d, open, onToggle, reload }: { p: ProviderInfo; d: Center; open: boolean; onToggle: () => void; reload: () => void }) {
  const keys = d.credentials.filter((c) => c.providerId === p.id);
  const ks = keySummary(keys);
  const disabled = d.controls.disabledProviders.includes(p.id);
  const managed = p.group === "major";
  const panelId = `pv-panel-${p.id}`;
  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId} className={cn("group flex w-full items-center gap-3 px-4 py-3 text-start transition-colors duration-200 hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none sm:px-5", open && "bg-muted/30")}>
        <Monogram p={p} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.95rem] font-semibold">{p.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{p.product}</span>
        </span>
        <span className="hidden flex-wrap items-center justify-end gap-1.5 sm:flex">
          {disabled ? <Chip className="bg-off-soft text-off">Disabled</Chip> : null}
          <Chip className={p.generation === "pending" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary dark:text-[#c4b5ff]"}>{ADAPTER_LABEL[p.generation]}</Chip>
          {managed ? (
            <Chip className={ks.tone}>
              {ks.hint ? <KeyRound className="size-3" aria-hidden /> : null}
              {ks.label}
              {ks.hint ? <span className="font-mono font-medium">{ks.hint}</span> : null}
            </Chip>
          ) : null}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
      </button>
      {/* Mobile: the same states, on their own line. */}
      <div className="flex flex-wrap gap-1.5 px-4 pb-3 sm:hidden">
        {disabled ? <Chip className="bg-off-soft text-off">Disabled</Chip> : null}
        <Chip className={p.generation === "pending" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary dark:text-[#c4b5ff]"}>{ADAPTER_LABEL[p.generation]}</Chip>
        {managed ? <Chip className={ks.tone}>{ks.label}</Chip> : null}
      </div>
      {/* Kept mounted while collapsed, so anything typed isn't lost; inert keeps it out of the tab order. */}
      <div id={panelId} role="region" aria-label={`${p.name} settings`} inert={!open} className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="min-h-0 overflow-hidden">
          <ProviderPanel p={p} keys={keys} d={d} reload={reload} managed={managed} disabled={disabled} onCollapse={onToggle} />
        </div>
      </div>
    </li>
  );
}

/** Where this provider is in Save → Test → Activate, and the one thing to do next, from the real key states. */
function setupState(p: ProviderInfo, keys: Cred[]) {
  const usable = keys.filter((k) => !["retired", "disabled"].includes(k.status));
  const active = usable.find((k) => k.status === "active");
  const verifiedSpare = usable.find((k) => k.status === "verified");
  const saved = usable.some((k) => k.status === "saved");
  const failed = usable.some((k) => k.status === "failed");
  const done = [usable.length > 0, Boolean(active || verifiedSpare), Boolean(active)];
  let hint: string;
  if (active && verifiedSpare) hint = `${p.name} is set up with key ${active.hint}. A verified replacement is waiting: activate it when you want to switch.`;
  else if (active) hint = `${p.name} is set up: new requests would use key ${active.hint}. Turning customer generation on is a separate, approved step.`;
  else if (verifiedSpare) hint = "Your key passed its test. Activate it when you're ready to use it.";
  else if (saved) hint = p.validation ? "Test the key you saved. The free test only lists models and costs nothing." : "This provider has no free check. Run a billable test (one tiny request) to verify the key.";
  else if (failed) hint = "The last test failed. Check the key in your provider's console, then save a corrected one.";
  else hint = `Start by pasting an API key from your ${p.name} account. It's encrypted as soon as you save it.`;
  return { done, current: done.indexOf(false), hint, empty: usable.length === 0 };
}

function SetupGuide({ p, keys, onStart }: { p: ProviderInfo; keys: Cred[]; onStart?: () => void }) {
  const st = setupState(p, keys);
  const steps = ["Save a key", "Test it", "Activate"];
  return (
    <div className="mb-4 rounded-2xl border bg-card p-4">
      <ol className="flex items-center gap-2" aria-label="Setup progress">
        {steps.map((label, i) => {
          const done = st.done[i];
          const now = st.current === i;
          return (
            <li key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-2 sm:text-start" aria-current={now ? "step" : undefined}>
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors duration-200", done ? "bg-ok text-white dark:text-graphite" : now ? "bg-primary text-primary-foreground ring-4 ring-primary/15" : "bg-muted text-muted-foreground")}>
                {done ? <CircleCheck className="size-4" aria-hidden /> : i + 1}
              </span>
              <span className={cn("text-[0.78rem] leading-tight font-semibold sm:truncate sm:text-[0.82rem]", done || now ? "text-foreground" : "text-muted-foreground")}>
                {label}
                <span className="sr-only">{done ? " (done)" : now ? " (next)" : ""}</span>
              </span>
              {i < steps.length - 1 ? <span className={cn("hidden h-px flex-1 sm:block", done ? "bg-ok/50" : "bg-border")} aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{st.hint}</p>
        {st.empty && onStart ? (
          <button type="button" onClick={onStart} className={cn(primaryBtn, "h-8 px-3")}>
            <Plus className="size-3.5" aria-hidden /> Add a key
          </button>
        ) : null}
      </div>
    </div>
  );
}

const keyProblem = (v: string) => (!v ? null : /\s/.test(v.trim()) ? "Remove spaces or line breaks from the key." : v.trim().length < 16 ? "That looks too short for an API key (at least 16 characters)." : null);

function ProviderPanel({ p, keys, d, reload, managed, disabled, onCollapse }: { p: ProviderInfo; keys: Cred[]; d: Center; reload: () => void; managed: boolean; disabled: boolean; onCollapse: () => void }) {
  const act = useAction(reload);
  const [key, setKey] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [reveal, setReveal] = React.useState(false);
  const [billableFor, setBillableFor] = React.useState<string | null>(null);
  const [billModel, setBillModel] = React.useState("");
  const [billOk, setBillOk] = React.useState(false);
  const [confirm, setConfirm] = React.useState<{ kind: "activate" | "disable"; k: Cred } | null>(null);
  const keyInput = React.useRef<HTMLInputElement>(null);
  const models = d.models.filter((m) => m.providerId === p.id);
  const active = keys.find((k) => k.status === "active");
  const lastVerified = keys.map((k) => k.verifiedAt).filter(Boolean).sort().at(-1) ?? null;
  const ks = keySummary(keys);
  const problem = keyProblem(key);
  const canSave = d.can.sensitive && key.trim().length >= 16 && !problem && act.busy === null;
  const base = "/api/admin/ai-control/keys";
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    void act.run("save", () => api(base, { method: "POST", body: JSON.stringify({ providerId: p.id, key: key.trim(), label }) }), "Key saved and encrypted as a new version. Test it, then activate it when you're ready.").then((ok) => {
      // Only a successful save clears the form; on an error the typed key stays so nothing is lost.
      if (ok) {
        setKey("");
        setLabel("");
        setReveal(false);
      }
    });
  };

  return (
    <div className="border-t bg-muted/20 px-4 py-4 sm:px-5 sm:py-5">
      {managed ? <SetupGuide p={p} keys={keys} onStart={d.can.sensitive ? () => keyInput.current?.focus() : undefined} /> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* A. Overview */}
        <section aria-label={`${p.name} overview`} className="rounded-2xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-heading font-bold">About this provider</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.note}</p>
            </div>
            <button type="button" onClick={onCollapse} className={cn(quietBtn, "h-8 shrink-0 px-3")}>
              Collapse
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Adapter</dt>
            <dd>
              <Chip className={p.generation === "pending" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary dark:text-[#c4b5ff]"}>{ADAPTER_LABEL[p.generation]}</Chip>
            </dd>
            <dt className="text-muted-foreground">Authentication</dt>
            <dd className="break-words">{p.auth}</dd>
            <dt className="text-muted-foreground">Key check</dt>
            <dd>{p.validation ? "Free (lists models)" : "No free check; a test needs a confirmed, billable request"}</dd>
          </dl>
          <a href={p.docs} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline dark:text-[#c4b5ff]">
            Official API documentation <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </section>

        {/* B. Credential status */}
        {managed ? (
          <section aria-label="Credential status" className="rounded-2xl border bg-card p-4">
            <h3 className="font-heading font-bold">Credential status</h3>
            <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">State</dt>
              <dd>
                <Chip className={ks.tone}>{ks.label}</Chip>
                {disabled ? <Chip className="ms-1.5 bg-off-soft text-off">Provider disabled</Chip> : null}
              </dd>
              <dt className="text-muted-foreground">Active key</dt>
              <dd>{active ? <span className="font-mono">{active.hint} · v{active.version}</span> : <span className="text-muted-foreground">None. Requests to {p.name} fail closed.</span>}</dd>
              <dt className="text-muted-foreground">Saved keys</dt>
              <dd className="tabular-nums">{keys.length}</dd>
              <dt className="text-muted-foreground">Last verified</dt>
              <dd>{lastVerified ? formatDateTime(lastVerified) : <span className="text-muted-foreground">Never</span>}</dd>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">A verified key doesn&apos;t switch customer generation on. That stays a separate, approved step.</p>
          </section>
        ) : (
          <section aria-label="Availability" className="rounded-2xl border border-dashed bg-card p-4 text-sm">
            <h3 className="font-heading font-bold">Not configurable yet</h3>
            <p className="mt-1 text-muted-foreground">This is a capability definition. Keys can&apos;t be added until an adapter for {p.product} is built and reviewed.</p>
          </section>
        )}
      </div>

      {managed ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          {/* C. Add / replace */}
          <section aria-label="Add or replace an API key" className="rounded-2xl border bg-card p-4">
            <h3 className="font-heading font-bold">{keys.length ? "Add a replacement key" : "Add an API key"}</h3>
            <p className="mt-1 text-xs text-muted-foreground">Save a new encrypted key version. Your active key remains unchanged until you verify and activate the replacement.</p>
            {d.can.sensitive ? (
              <form onSubmit={save} className="mt-3 space-y-3" noValidate>
                <div>
                  <label htmlFor={`k-${p.id}`} className="mb-1.5 block text-sm font-semibold">
                    API key
                  </label>
                  <div className="relative">
                    <input
                      ref={keyInput}
                      id={`k-${p.id}`}
                      type={reveal ? "text" : "password"}
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={500}
                      aria-invalid={problem ? true : undefined}
                      aria-describedby={problem ? `k-${p.id}-err` : undefined}
                      placeholder={`Paste your ${p.name} API key`}
                      className={cn(inputClass, "h-11 pe-11 font-mono text-[0.85rem]")}
                    />
                    <button type="button" onClick={() => setReveal((v) => !v)} disabled={!key} aria-pressed={reveal} aria-label={reveal ? "Hide the key you typed" : "Show the key you typed"} className="absolute end-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:opacity-40">
                      {reveal ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                    </button>
                  </div>
                  {problem ? (
                    <p id={`k-${p.id}-err`} className="mt-1.5 text-xs text-destructive">
                      {problem}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor={`kl-${p.id}`} className="mb-1.5 flex items-baseline justify-between text-sm font-semibold">
                    Label <span className="text-xs font-normal text-muted-foreground">Optional</span>
                  </label>
                  <input id={`kl-${p.id}`} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="e.g. Production, Rotation Nov 2026" className={cn(inputClass, "h-11")} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="size-3.5" aria-hidden /> Encrypted on the server. Never shown again.
                  </p>
                  <button type="submit" disabled={!canSave} className={cn(primaryBtn, "h-10 px-5")}>
                    {act.busy === "save" ? "Saving…" : "Save key"}
                  </button>
                </div>
              </form>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground">Adding keys needs the Security settings permission.</p>
            )}
          </section>

          {/* D. Saved credentials */}
          <section aria-label="Saved credentials" className="rounded-2xl border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-heading font-bold">Saved credentials</h3>
              <span className="text-xs text-muted-foreground tabular-nums">{keys.length} saved</span>
            </div>
            {act.done ? <div className="mt-3"><Alert tone="ok">{act.done}</Alert></div> : null}
            {act.error ? <div className="mt-3"><Alert>{act.error}</Alert></div> : null}
            {keys.length ? (
              <ul className="mt-3 space-y-2">
                {keys.map((k) => {
                  const usable = !["retired", "disabled"].includes(k.status);
                  return (
                    <li key={k.id} className={cn("rounded-xl border p-3 text-sm transition-colors", k.status === "active" && "border-ok/40 bg-ok-soft/40", !usable && "opacity-70")}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex min-w-0 items-center gap-2">
                          <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="font-mono font-semibold">{k.hint}</span>
                          <span className="text-muted-foreground">v{k.version}</span>
                          {k.label ? <span className="truncate text-muted-foreground">· {k.label}</span> : null}
                        </p>
                        <Chip className={KEY_TONE[k.status] ?? "bg-muted"}>{KEY_LABEL[k.status] ?? k.status}</Chip>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {k.lastTestAt ? `Tested ${formatDateTime(k.lastTestAt)} (${k.lastTestBillable ? "billable" : "free"})` : "Never tested"}
                        {k.lastTestMessage ? <span className={k.lastTestCode === "ok" ? " text-ok" : " text-destructive"}> · {k.lastTestMessage}</span> : null}
                      </p>
                      {d.can.sensitive && usable ? (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          <button type="button" disabled={act.busy !== null || !p.validation} onClick={() => act.run(`t-${k.id}`, () => api<{ result: { message: string; discovered: number } }>(`${base}/${k.id}/test`, { method: "POST", body: "{}" }), (r) => `${r.result.message}${r.result.discovered ? ` ${r.result.discovered} models listed.` : ""}`)} className={cn(quietBtn, "h-8 px-3")} title={p.validation ? "Free check: lists the provider's models" : "No free check for this provider"}>
                            <ShieldCheck className="size-3.5" aria-hidden /> {act.busy === `t-${k.id}` ? "Testing…" : "Test"}
                          </button>
                          {p.generation !== "pending" ? (
                            <button type="button" onClick={() => (setBillableFor(billableFor === k.id ? null : k.id), setBillOk(false))} aria-expanded={billableFor === k.id} className={cn(quietBtn, "h-8 px-3")}>
                              Billable test
                            </button>
                          ) : null}
                          {k.status === "verified" ? (
                            <button type="button" disabled={act.busy !== null} onClick={() => setConfirm({ kind: "activate", k })} className={cn(primaryBtn, "h-8 px-3")}>
                              Activate
                            </button>
                          ) : null}
                          {k.status === "active" ? (
                            <button type="button" onClick={() => keyInput.current?.focus()} className={cn(quietBtn, "h-8 px-3")}>
                              Replace
                            </button>
                          ) : null}
                          <button type="button" disabled={act.busy !== null} onClick={() => setConfirm({ kind: "disable", k })} className={cn(dangerBtn, "h-8 px-3")}>
                            Disable
                          </button>
                        </div>
                      ) : null}
                      {billableFor === k.id ? (
                        <form
                          className="mt-3 space-y-2.5 border-t pt-3"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void act.run(`b-${k.id}`, () => api<{ result: { message: string } }>(`${base}/${k.id}/test`, { method: "POST", body: JSON.stringify({ billable: true, modelId: billModel }) }), (r) => `${r.result.message} (billable test)`).then((ok) => ok && setBillableFor(null));
                          }}
                        >
                          <Field id={`bm-${k.id}`} label="Model to call" help="One tiny request (at most 16 output tokens). The provider bills it.">
                            <SelectInput id={`bm-${k.id}`} value={billModel} onChange={(e) => setBillModel(e.target.value)} className="h-10">
                              <option value="">{models.length ? "Choose a model" : "No models yet: run a free test first"}</option>
                              {models.map((m) => (
                                <option key={m.modelId} value={m.modelId}>
                                  {m.modelId}
                                </option>
                              ))}
                            </SelectInput>
                          </Field>
                          <label className="flex items-start gap-2 text-sm">
                            <input type="checkbox" checked={billOk} onChange={(e) => setBillOk(e.target.checked)} className="mt-0.5 accent-[#7047EB]" />I understand this sends one real, billable request to {p.name}.
                          </label>
                          <button type="submit" disabled={!billOk || !billModel || act.busy !== null} className={cn(primaryBtn, "h-8 px-3")}>
                            Run billable test
                          </button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                <KeyRound className="mx-auto size-5" aria-hidden />
                <p className="mt-2">No keys saved for {p.name} yet.</p>
              </div>
            )}
          </section>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === "activate" ? `Switch ${p.name} to key ${confirm.k.hint}?` : `Disable key ${confirm?.k.hint ?? ""}?`}
        description={
          confirm?.kind === "activate"
            ? "New AI requests will use this key immediately. Requests already running finish on the previous key, which is then retired."
            : confirm?.k.status === "active"
              ? `This is the active key. ${p.name} will have no active key and its requests will fail closed until you activate another.`
              : "The key can't be used or tested again. You can save a new one at any time."
        }
        confirmLabel={confirm?.kind === "activate" ? "Activate key" : "Disable key"}
        tone={confirm?.kind === "disable" ? "danger" : "default"}
        onConfirm={() => {
          const c = confirm!;
          setConfirm(null);
          if (c.kind === "activate") void act.run(`a-${c.k.id}`, () => api(`${base}/${c.k.id}/activate`, { method: "POST", body: JSON.stringify({ confirm: true }) }), "Key activated. The previous key was retired.");
          else void act.run(`d-${c.k.id}`, () => api(`${base}/${c.k.id}/disable`, { method: "POST", body: "{}" }), c.k.status === "active" ? "Key disabled. This provider now has no active key and fails closed." : "Key disabled.");
        }}
      />
      {act.dialog}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Models                                                                    */
/* -------------------------------------------------------------------------- */

const CAPS = Object.keys(CAPABILITY_LABEL) as (keyof typeof CAPABILITY_LABEL)[];

function CapChip({ value, label }: { value: boolean | null | undefined; label: string }) {
  const Icon = value === true ? CircleCheck : value === false ? CircleAlert : CircleDashed;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", value === true ? "text-ok" : value === false ? "text-destructive" : "text-muted-foreground")} title={`${label}: ${value === true ? "supported" : value === false ? "not supported" : "not verified"}`}>
      <Icon className="size-3.5" aria-hidden />
      <span>{label}</span>
    </span>
  );
}

function ModelsTab({ d, reload }: { d: Center; reload: () => void }) {
  const [q, setQ] = React.useState("");
  const [provider, setProvider] = React.useState("");
  const [editing, setEditing] = React.useState<Partial<Model> | null>(null);
  const rows = d.models.filter((m) => (!provider || m.providerId === provider) && (!q.trim() || `${m.modelId} ${m.displayName}`.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="relative flex-1">
          <label htmlFor="md-search" className="sr-only">
            Search models
          </label>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input id="md-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search model ids" className={cn(inputClass, "h-10 ps-9")} />
        </div>
        <SelectInput aria-label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)} className="h-10 sm:w-48">
          <option value="">All providers</option>
          {d.providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectInput>
        {d.can.manage ? (
          <button type="button" onClick={() => setEditing({ providerId: "openai", capabilities: {} })} className={cn(primaryBtn, "h-10")}>
            <Plus className="size-4" aria-hidden /> Add model
          </button>
        ) : null}
      </div>
      <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">Models come from Sociotix&apos;s own catalog, from a provider&apos;s model list during a key test, or from manual entry. Capabilities are never guessed from a name: anything not checked shows as not verified.</p>
      {editing ? <ModelForm initial={editing} d={d} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), reload())} /> : null}
      {rows.length ? (
        <ul className="divide-y border-t">
          {rows.map((m) => (
            <li key={`${m.providerId}/${m.modelId}`} className="grid gap-2 px-5 py-3.5 text-sm lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_9rem_8rem_auto] lg:items-center">
              <div className="min-w-0">
                <p className="truncate font-mono text-[0.82rem] font-semibold">{m.modelId}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.providerName} · {m.source === "catalog" ? "Sociotix catalog" : m.source === "discovered" ? "Listed by the provider" : "Added manually"}
                </p>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {CAPS.map((c) => (
                  <CapChip key={c} value={m.capabilities[c]} label={CAPABILITY_LABEL[c]} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{m.contextTokens ? `${m.contextTokens.toLocaleString("en-US")} in` : "Context —"}{m.maxOutputTokens ? ` · ${m.maxOutputTokens.toLocaleString("en-US")} out` : ""}</p>
              <p className="text-xs" title={m.price?.source ?? undefined}>
                {m.price ? `$${m.price.input} / $${m.price.output} per MTok` : <span className="text-muted-foreground">No sourced price</span>}
              </p>
              <div className="flex items-center gap-2 lg:justify-end">
                <Chip className={m.status === "available" ? "bg-ok-soft text-ok" : m.status === "unverified" ? "bg-soon-soft text-soon" : "bg-off-soft text-off"}>{m.status === "available" ? "Verified" : m.status === "unverified" ? "Not verified" : m.status[0].toUpperCase() + m.status.slice(1)}</Chip>
                {d.can.manage ? (
                  <button type="button" onClick={() => setEditing(m)} className={cn(quietBtn, "h-8")}>
                    Edit
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t px-6 py-10 text-center text-sm text-muted-foreground">No models match. Test a provider key to list its models, or add one manually.</p>
      )}
    </Card>
  );
}

function ModelForm({ initial, d, onClose, onSaved }: { initial: Partial<Model>; d: Center; onClose: () => void; onSaved: () => void }) {
  const act = useAction(onSaved);
  const tri = (v: boolean | null | undefined) => (v === true ? "yes" : v === false ? "no" : "unknown");
  const [f, setF] = React.useState({
    providerId: initial.providerId ?? "openai",
    modelId: initial.modelId ?? "",
    displayName: initial.displayName && initial.displayName !== initial.modelId ? initial.displayName : "",
    status: initial.status ?? "unverified",
    caps: Object.fromEntries(CAPS.map((c) => [c, tri(initial.capabilities?.[c])])) as Record<string, string>,
    contextTokens: initial.contextTokens ? String(initial.contextTokens) : "",
    maxOutputTokens: initial.maxOutputTokens ? String(initial.maxOutputTokens) : "",
    priceIn: initial.price ? String(initial.price.input) : "",
    priceOut: initial.price ? String(initial.price.output) : "",
    priceSource: initial.price?.source ?? "",
  });
  const existing = Boolean(initial.modelId);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      providerId: f.providerId,
      modelId: f.modelId.trim(),
      displayName: f.displayName,
      status: f.status,
      capabilities: Object.fromEntries(CAPS.map((c) => [c, f.caps[c] === "yes" ? true : f.caps[c] === "no" ? false : null])),
      contextTokens: f.contextTokens ? Number(f.contextTokens) : null,
      maxOutputTokens: f.maxOutputTokens ? Number(f.maxOutputTokens) : null,
      price: f.priceIn !== "" && f.priceOut !== "" ? { input: Number(f.priceIn), output: Number(f.priceOut), source: f.priceSource } : null,
    };
    void act.run("save", () => api("/api/admin/ai-control/models", { method: "POST", body: JSON.stringify(body) }), "Model saved.");
  };
  return (
    <form onSubmit={submit} className="grid gap-3 border-t bg-muted/20 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field id="mf-provider" label="Provider">
        <SelectInput id="mf-provider" value={f.providerId} disabled={existing} onChange={(e) => setF({ ...f, providerId: e.target.value })} className="h-10">
          {d.providers.filter((p) => p.id !== "custom-openai").map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field id="mf-id" label="Official model id" help="Exactly as the provider's docs list it.">
        <TextInput id="mf-id" value={f.modelId} disabled={existing} onChange={(e) => setF({ ...f, modelId: e.target.value })} required maxLength={120} autoComplete="off" />
      </Field>
      <Field id="mf-name" label="Display name" optional>
        <TextInput id="mf-name" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} maxLength={120} />
      </Field>
      <Field id="mf-status" label="Status">
        <SelectInput id="mf-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="h-10">
          <option value="unverified">Not verified</option>
          <option value="available">Verified (checked against the docs)</option>
          <option value="deprecated">Deprecated</option>
          <option value="unavailable">Unavailable</option>
        </SelectInput>
      </Field>
      {CAPS.map((c) => (
        <Field key={c} id={`mf-${c}`} label={CAPABILITY_LABEL[c]}>
          <SelectInput id={`mf-${c}`} value={f.caps[c]} onChange={(e) => setF({ ...f, caps: { ...f.caps, [c]: e.target.value } })} className="h-10">
            <option value="unknown">Not verified</option>
            <option value="yes">Supported (documented)</option>
            <option value="no">Not supported</option>
          </SelectInput>
        </Field>
      ))}
      <Field id="mf-ctx" label="Context tokens" optional>
        <TextInput id="mf-ctx" inputMode="numeric" value={f.contextTokens} onChange={(e) => setF({ ...f, contextTokens: e.target.value.replace(/\D/g, "") })} />
      </Field>
      <Field id="mf-out" label="Max output tokens" optional>
        <TextInput id="mf-out" inputMode="numeric" value={f.maxOutputTokens} onChange={(e) => setF({ ...f, maxOutputTokens: e.target.value.replace(/\D/g, "") })} />
      </Field>
      <Field id="mf-pin" label="Input $ / million tokens" optional>
        <TextInput id="mf-pin" inputMode="decimal" value={f.priceIn} onChange={(e) => setF({ ...f, priceIn: e.target.value })} />
      </Field>
      <Field id="mf-pout" label="Output $ / million tokens" optional>
        <TextInput id="mf-pout" inputMode="decimal" value={f.priceOut} onChange={(e) => setF({ ...f, priceOut: e.target.value })} />
      </Field>
      <div className="sm:col-span-2 lg:col-span-4">
        <Field id="mf-psrc" label="Price source" help="Required with a price: where it comes from and when you checked.">
          <TextInput id="mf-psrc" value={f.priceSource} onChange={(e) => setF({ ...f, priceSource: e.target.value })} maxLength={300} placeholder="e.g. Provider pricing page, checked 2026-10-30" />
        </Field>
      </div>
      {act.error ? <div className="sm:col-span-2 lg:col-span-4"><Alert>{act.error}</Alert></div> : null}
      <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-4">
        <button type="button" onClick={onClose} className={quietBtn}>
          Cancel
        </button>
        <button type="submit" disabled={act.busy !== null} className={primaryBtn}>
          {act.busy ? "Saving…" : "Save model"}
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tool assignments                                                          */
/* -------------------------------------------------------------------------- */

function AssignmentsTab({ d, reload }: { d: Center; reload: () => void }) {
  const [q, setQ] = React.useState("");
  const rows = d.assignments.filter((a) => !q.trim() || a.toolName.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Card className="overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="relative">
          <label htmlFor="as-search" className="sr-only">
            Search tools
          </label>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input id="as-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tools" className={cn(inputClass, "h-10 ps-9")} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Pick a verified model, save it as a draft, run the compatibility and cost check, then activate. Activating doesn&apos;t switch customer generation on, and a tool never falls back to another model.</p>
      </div>
      <ul className="divide-y border-t">
        {rows.map((a) => (
          <AssignmentRow key={a.toolId} a={a} d={d} reload={reload} />
        ))}
      </ul>
    </Card>
  );
}

function AssignmentRow({ a, d, reload }: { a: Assignment; d: Center; reload: () => void }) {
  const act = useAction(reload);
  const [provider, setProvider] = React.useState(a.assignment?.providerId ?? "");
  const [model, setModel] = React.useState(a.assignment?.modelId ?? "");
  const genProviders = d.providers.filter((p) => p.generation !== "pending");
  const models = d.models.filter((m) => m.providerId === provider);
  const changed = provider !== (a.assignment?.providerId ?? "") || model !== (a.assignment?.modelId ?? "");
  const st = a.assignment?.status;
  const path = `/api/admin/ai-control/assignments/${a.toolId}`;
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{a.toolName}</p>
          <p className="text-xs text-muted-foreground">
            Cost ceiling {usd(a.guard.maxCostMicros)} per call · up to {a.guard.maxOutputTokens.toLocaleString("en-US")} output tokens · needs structured JSON output
          </p>
        </div>
        <Chip className={st === "active" ? "bg-ok-soft text-ok" : st === "draft" ? "bg-soon-soft text-soon" : st === "disabled" ? "bg-off-soft text-off" : "bg-muted text-muted-foreground"}>{st === "active" ? "Active" : st === "draft" ? "Draft" : st === "disabled" ? "Disabled" : "Not assigned"}</Chip>
      </div>
      {a.assignment?.testNote ? <p className={cn("mt-1.5 text-xs", a.assignment.testPassed ? "text-ok" : "text-destructive")}>{a.assignment.testNote}</p> : null}
      {act.done ? <div className="mt-2"><Alert tone="ok">{act.done}</Alert></div> : null}
      {act.error ? <div className="mt-2"><Alert>{act.error}</Alert></div> : null}
      {d.can.manage ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-center">
          <SelectInput aria-label={`Provider for ${a.toolName}`} value={provider} onChange={(e) => (setProvider(e.target.value), setModel(""))} className="h-10">
            <option value="">Provider</option>
            {genProviders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectInput>
          <SelectInput aria-label={`Model for ${a.toolName}`} value={model} onChange={(e) => setModel(e.target.value)} className="h-10" disabled={!provider}>
            <option value="">{models.length ? "Model" : "No models for this provider yet"}</option>
            {models.map((m) => (
              <option key={m.modelId} value={m.modelId}>
                {`${m.modelId}${m.status === "available" ? "" : " (not verified)"}`}
              </option>
            ))}
          </SelectInput>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!provider || !model || !changed || act.busy !== null} onClick={() => act.run("draft", () => api(`${path}/draft`, { method: "POST", body: JSON.stringify({ providerId: provider, modelId: model }) }), "Draft saved. Run the check next.")} className={cn(quietBtn, "h-9")}>
              Save draft
            </button>
            <button type="button" disabled={!a.assignment || changed || act.busy !== null} onClick={() => act.run("check", () => api<{ result: { passed: boolean } }>(`${path}/check`, { method: "POST", body: "{}" }), (r) => (r.result.passed ? "Compatible. You can activate it." : "Not compatible yet. See the reasons above."))} className={cn(quietBtn, "h-9")}>
              Check
            </button>
            {d.can.sensitive && st !== "active" ? (
              <button type="button" disabled={!a.assignment?.testPassed || changed || act.busy !== null} onClick={() => act.run("activate", () => api(`${path}/activate`, { method: "POST", body: "{}" }), "Assignment activated.")} className={cn(primaryBtn, "h-9")}>
                Activate
              </button>
            ) : null}
            {st === "active" || st === "draft" ? (
              <button type="button" disabled={act.busy !== null} onClick={() => act.run("disable", () => api(`${path}/disable`, { method: "POST", body: "{}" }), "Assignment disabled.")} className={cn(dangerBtn, "h-9")}>
                Disable
              </button>
            ) : null}
          </div>
        </div>
      ) : a.assignment ? (
        <p className="mt-2 text-sm">
          {a.assignment.providerId} · <span className="font-mono">{a.assignment.modelId}</span>
        </p>
      ) : null}
      {act.dialog}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Usage & costs                                                             */
/* -------------------------------------------------------------------------- */

type Row = { requests: number; succeeded: number; errors: number; blocked: number; inputTokens: number | null; outputTokens: number | null; costMicros: number; lastSuccess: string | null };
interface Usage {
  total: Row;
  byProvider: (Row & { id: string; name: string })[];
  byModel: (Row & { provider: string; model: string })[];
  byTool: (Row & { id: string; name: string })[];
  recentErrors: { tool: string; provider: string | null; status: string; code: string | null; at: string }[];
  budget: { today: { spent: number; limit: number }; month: { spent: number; limit: number | null } };
}

function UsageTab({ d }: { d: Center }) {
  const [days, setDays] = React.useState("7");
  const [provider, setProvider] = React.useState("");
  const [tool, setTool] = React.useState("");
  const qs = new URLSearchParams({ days });
  if (provider) qs.set("provider", provider);
  if (tool) qs.set("tool", tool);
  const u = useJson<Usage>(`/api/admin/ai-control/usage?${qs}`);
  const table = (title: string, rows: (Row & { label: string; sub?: string })[]) => (
    <Card className="p-5">
      <CardHeader id={`u-${title}`} title={title} />
      {rows.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                {["", "Requests", "Succeeded", "Errors", "Blocked", "Tokens in / out", "Est. cost", "Last success"].map((h, i) => (
                  <th key={h || "name"} scope="col" className={cn("py-2 pr-3 font-semibold", i > 0 && "text-right")}>
                    {h || <span className="sr-only">Name</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.label + (r.sub ?? "")}>
                  <td className="py-2 pr-3">
                    <span className="font-medium">{r.label}</span>
                    {r.sub ? <span className="block text-xs text-muted-foreground">{r.sub}</span> : null}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.requests}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.succeeded}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.errors}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.blocked}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.inputTokens === null ? "—" : `${r.inputTokens.toLocaleString("en-US")} / ${(r.outputTokens ?? 0).toLocaleString("en-US")}`}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{usd(r.costMicros)}</td>
                  <td className="py-2 text-right text-xs text-muted-foreground">{r.lastSuccess ? formatDateTime(r.lastSuccess) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No AI requests in this period.</p>
      )}
    </Card>
  );
  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:p-5">
        <SelectInput aria-label="Period" value={days} onChange={(e) => setDays(e.target.value)} className="h-10 sm:w-40">
          <option value="1">Last 24 hours</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </SelectInput>
        <SelectInput aria-label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)} className="h-10 sm:w-48">
          <option value="">All providers</option>
          {d.providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput aria-label="Tool" value={tool} onChange={(e) => setTool(e.target.value)} className="h-10 sm:w-56">
          <option value="">All tools</option>
          {d.assignments.map((a) => (
            <option key={a.toolId} value={a.toolId}>
              {a.toolName}
            </option>
          ))}
        </SelectInput>
        <p className="text-xs text-muted-foreground sm:ms-auto sm:max-w-xs">Costs are Sociotix&apos;s estimates from recorded tokens and configured prices, not provider bills.</p>
      </Card>
      {u.error ? <Alert>{u.error}</Alert> : !u.data ? <div className="h-40 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" /> : (
        <>
          <Card className="p-5">
            <CardHeader id="u-budget" title="Budget consumption" description="Includes requests still in progress, held at their cost ceiling." />
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm">
                  Today: <span className="font-semibold tabular-nums">{usd(u.data.budget.today.spent)}</span> of {usd(u.data.budget.today.limit)}
                </p>
                <Bar value={u.data.budget.today.spent} limit={u.data.budget.today.limit || null} />
              </div>
              <div>
                <p className="text-sm">
                  This month: <span className="font-semibold tabular-nums">{usd(u.data.budget.month.spent)}</span>
                  {u.data.budget.month.limit !== null ? ` of ${usd(u.data.budget.month.limit)}` : " (no monthly limit set)"}
                </p>
                {u.data.budget.month.limit !== null ? <Bar value={u.data.budget.month.spent} limit={u.data.budget.month.limit || null} /> : null}
              </div>
            </div>
          </Card>
          {table("By provider", u.data.byProvider.map((r) => ({ ...r, label: r.name })))}
          {table("By model", u.data.byModel.map((r) => ({ ...r, label: r.model, sub: r.provider })))}
          {table("By tool", u.data.byTool.map((r) => ({ ...r, label: r.name })))}
          <Card className="p-5">
            <CardHeader id="u-errors" title="Recent provider errors" />
            {u.data.recentErrors.length ? (
              <ul className="mt-3 divide-y text-sm">
                {u.data.recentErrors.map((e, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      {e.tool} · {e.provider ?? "—"} · {e.status.replace(/_/g, " ")}
                      {e.code ? ` (${e.code})` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(e.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No provider errors in this period.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Budgets & settings                                                        */
/* -------------------------------------------------------------------------- */

const toUsd = (m: number | null) => (m === null ? "" : String(m / 1_000_000));
const toMicros = (s: string) => (s.trim() === "" ? null : Math.round(Number(s) * 1_000_000));

function LimitEditor({ title, help, entries, options, onChange, disabled }: { title: string; help: string; entries: [string, string][]; options: { value: string; label: string }[]; onChange: (e: [string, string][]) => void; disabled: boolean }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{title}</legend>
      <p className="text-xs text-muted-foreground">{help}</p>
      {entries.map(([k, v], i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_8rem_auto] items-center gap-2">
          <SelectInput aria-label={`${title}: item`} value={k} disabled={disabled} onChange={(e) => onChange(entries.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} className="h-10">
            <option value="">Choose…</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectInput>
          <TextInput aria-label={`${title}: daily limit in dollars`} inputMode="decimal" value={v} disabled={disabled} onChange={(e) => onChange(entries.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} placeholder="$ / day" />
          <button type="button" disabled={disabled} onClick={() => onChange(entries.filter((_, j) => j !== i))} className={cn(quietBtn, "h-10")} aria-label="Remove limit">
            Remove
          </button>
        </div>
      ))}
      <button type="button" disabled={disabled} onClick={() => onChange([...entries, ["", ""]])} className={cn(quietBtn, "h-8")}>
        <Plus className="size-3.5" aria-hidden /> Add limit
      </button>
    </fieldset>
  );
}

function BudgetsTab({ d, reload }: { d: Center; reload: () => void }) {
  const c = d.controls;
  const act = useAction(reload);
  const toEntries = (r: Record<string, number>) => Object.entries(r).map(([k, v]) => [k, toUsd(v)] as [string, string]);
  const [daily, setDaily] = React.useState(toUsd(c.dailyBudgetMicros));
  const [monthly, setMonthly] = React.useState(toUsd(c.monthlyBudgetMicros));
  const [maxReq, setMaxReq] = React.useState(toUsd(c.maxRequestMicros));
  const [perProvider, setPerProvider] = React.useState(toEntries(c.perProvider));
  const [perModel, setPerModel] = React.useState(toEntries(c.perModel));
  const [perTool, setPerTool] = React.useState(toEntries(c.perTool));
  const [disabled, setDisabled] = React.useState<string[]>(c.disabledProviders);
  const locked = !d.can.sensitive;
  const fromEntries = (e: [string, string][]) => Object.fromEntries(e.filter(([k, v]) => k && v.trim() !== "").map(([k, v]) => [k, toMicros(v)!]));
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const controls = { emergencyDisabled: c.emergencyDisabled, dailyBudgetMicros: toMicros(daily), monthlyBudgetMicros: toMicros(monthly), maxRequestMicros: toMicros(maxReq), perProvider: fromEntries(perProvider), perModel: fromEntries(perModel), perTool: fromEntries(perTool), disabledProviders: disabled };
    void act.run("save", () => api("/api/admin/ai-control/controls", { method: "PUT", body: JSON.stringify({ controls, version: c.version }) }), "Limits saved.");
  };
  return (
    <form onSubmit={save} className="space-y-4">
      {locked ? <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">Changing limits needs the Security settings permission.</p> : null}
      {act.done ? <Alert tone="ok">{act.done}</Alert> : null}
      {act.error ? <Alert>{act.error}</Alert> : null}
      <Card className="p-5">
        <CardHeader id="b-global" title="Spending limits" description="These only add limits. The server's own daily budget and every customer's free allowance still apply; the lower limit always wins." />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field id="b-daily" label="Daily limit ($)" optional help={`Server budget: ${usd(d.summary.budget.today.envLimit)} a day.`}>
            <TextInput id="b-daily" inputMode="decimal" value={daily} disabled={locked} onChange={(e) => setDaily(e.target.value)} />
          </Field>
          <Field id="b-monthly" label="Monthly limit ($)" optional>
            <TextInput id="b-monthly" inputMode="decimal" value={monthly} disabled={locked} onChange={(e) => setMonthly(e.target.value)} />
          </Field>
          <Field id="b-max" label="Max cost per request ($)" optional help="Requests whose ceiling is higher are refused before anything is sent.">
            <TextInput id="b-max" inputMode="decimal" value={maxReq} disabled={locked} onChange={(e) => setMaxReq(e.target.value)} />
          </Field>
        </div>
      </Card>
      <Card className="grid gap-6 p-5 lg:grid-cols-3">
        <LimitEditor title="Per provider" help="Daily limit for one provider." entries={perProvider} onChange={setPerProvider} disabled={locked} options={d.providers.map((p) => ({ value: p.id, label: p.name }))} />
        <LimitEditor title="Per model" help="Daily limit for one model." entries={perModel} onChange={setPerModel} disabled={locked} options={d.models.map((m) => ({ value: `${m.providerId}/${m.modelId}`, label: `${m.providerName} · ${m.modelId}` }))} />
        <LimitEditor title="Per tool" help="Daily limit for one Sociotix tool." entries={perTool} onChange={setPerTool} disabled={locked} options={d.assignments.map((a) => ({ value: a.toolId, label: a.toolName }))} />
      </Card>
      <Card className="p-5">
        <CardHeader id="b-disabled" title="Disabled providers" description="A disabled provider is refused for every request, even with an active key. There's no automatic fallback to another provider." />
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {d.providers.filter((p) => p.group === "major").map((p) => (
            <label key={p.id} className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm">
              <input type="checkbox" disabled={locked} checked={disabled.includes(p.id)} onChange={(e) => setDisabled(e.target.checked ? [...disabled, p.id] : disabled.filter((x) => x !== p.id))} className="accent-[#7047EB]" />
              {p.name}
            </label>
          ))}
        </div>
      </Card>
      {!locked ? (
        <div className="flex justify-end">
          <button type="submit" disabled={act.busy !== null} className={primaryBtn}>
            {act.busy ? "Saving…" : "Save limits"}
          </button>
        </div>
      ) : null}
      {act.dialog}
    </form>
  );
}

/* -------------------------------------------------------------------------- */

const ACTION_LABEL: Record<string, string> = {
  key_saved: "Key saved",
  key_tested: "Key tested",
  key_activated: "Key activated",
  key_disabled: "Key disabled",
  model_saved: "Model saved",
  assignment_drafted: "Assignment drafted",
  assignment_checked: "Assignment checked",
  assignment_activated: "Assignment activated",
  assignment_disabled: "Assignment disabled",
  controls_saved: "Limits saved",
  emergency_paused: "AI paused",
  emergency_resumed: "AI resumed",
};

function AuditTab() {
  const a = useJson<{ entries: { id: string; action: string; target: string | null; detail: Record<string, unknown> | null; by: string; at: string }[] }>("/api/admin/ai-control/audit");
  return (
    <Card className="p-5">
      <CardHeader id="au" title="Audit history" description="Every change in AI Management. Keys never appear here, only their masked hint and version." />
      {a.error ? <div className="mt-3"><Alert>{a.error}</Alert></div> : !a.data ? <div className="mt-3 h-32 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" /> : a.data.entries.length ? (
        <ol className="mt-4 space-y-3 border-s ps-4 text-sm">
          {a.data.entries.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -start-[1.3rem] top-1.5 size-2 rounded-full bg-primary ring-4 ring-card" aria-hidden />
              <p>
                <span className="font-semibold">{ACTION_LABEL[e.action] ?? e.action}</span>
                {e.target ? <span className="text-muted-foreground"> · {e.target}</span> : null}
                {e.detail && typeof e.detail.version === "number" ? <span className="text-muted-foreground"> · v{String(e.detail.version)}</span> : null}
                {e.detail && typeof e.detail.code === "string" ? <span className="text-muted-foreground"> · {String(e.detail.code)}</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {e.by} · {formatDateTime(e.at)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Nothing has been changed yet.</p>
      )}
    </Card>
  );
}
