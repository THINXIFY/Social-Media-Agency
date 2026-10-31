"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, ChevronDown, Clock3, Info, Lock, LogIn, MailCheck, Minus, Plus, RefreshCw, ShieldCheck, Sparkles, Wand2, X } from "lucide-react";
import type { AiField, AiTool } from "@/lib/ai/registry";
import { api, ApiError } from "@/lib/live-account";
import { cn } from "@/lib/utils";
import { ToolGlyph } from "./parts";
import { AiPlatformIcon } from "./platform-icon";
import { type AdvisorResult, AdvisorResults, type RecommenderResult, RecommenderResults, type RoadmapResult, RoadmapResults } from "./growth-results";
import { type CalendarResult, CalendarResults, type CaptionResult, CaptionResults, type HashtagResult, HashtagResults, type IdeasResult, IdeasResults } from "./results";
import { type OrderAssistantResult, OrderAssistantResults } from "./order-assistant-results";
import { useToolStatus } from "./use-ai-status";

/*
 * The AI tool workspace: one connected surface with the brief on the left and
 * results on the right. It asks the server whether the tool can run. Until it
 * can, it's an honest preview — the form is visible but locked and the
 * results area shows only the shape of what will appear, never sample output.
 * When live it needs a signed-in, verified account and shows real results.
 *
 * "Try this example" buttons anywhere on the page fill the form through the
 * `socivanta:ai-example` event. Filling never generates or uses a run.
 */

type Values = Record<string, string | string[]>;
type Run = { kind: "idle" } | { kind: "loading"; started: number } | { kind: "error"; message: string } | { kind: "result"; output: unknown; key: number };
export type WorkspaceExample = { title: string; fill: Values };

export const EXAMPLE_EVENT = "socivanta:ai-example";

const control =
  "w-full rounded-xl border bg-background px-3.5 text-[0.95rem] transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-75 aria-invalid:border-destructive/60 dark:bg-white/[0.03]";
const chip =
  "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[0.85rem] font-medium transition-colors select-none has-focus-visible:ring-4 has-focus-visible:ring-primary/20 has-disabled:cursor-not-allowed has-disabled:opacity-60";
const chipOn = "border-primary bg-primary text-primary-foreground shadow-[0_6px_16px_-10px_rgb(112_71_235/0.9)]";
const chipOff = "bg-background text-foreground/80 hover:border-foreground/25 hover:text-foreground dark:bg-white/[0.03]";

/** Mirrors the server's input rules so mistakes are caught before a run is spent. */
function validate(fields: AiField[], values: Values) {
  const errs: Record<string, string> = {};
  for (const f of fields) {
    const v = values[f.id];
    if (f.kind === "platforms") {
      const picked = Array.isArray(v) ? v : [];
      if (f.required && picked.length === 0) errs[f.id] = "Pick at least one platform.";
      else if (f.maxSelect && picked.length > f.maxSelect) errs[f.id] = `Pick up to ${f.maxSelect}.`;
      continue;
    }
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) {
      if (f.required) errs[f.id] = f.kind === "select" ? "Choose an option." : "This is required.";
      continue;
    }
    if ((f.kind === "textarea" || f.kind === "text") && s.length < 3) errs[f.id] = "Add a little more detail.";
    if (f.kind === "number") {
      const n = Number(s);
      if (!Number.isInteger(n) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) errs[f.id] = `Enter a whole number from ${f.min ?? 0} to ${f.max ?? 100}.`;
    }
  }
  return errs;
}

const NOUN: Record<string, string> = { "caption-generator": "captions", "hashtag-finder": "hashtags", "post-ideas": "post ideas", "content-calendar": "content plan", "growth-advisor": "strategy", "growth-roadmap": "roadmap", "service-recommender": "recommendations", "order-assistant": "order plan" };

function Results({ tool, output }: { tool: AiTool; output: unknown }) {
  switch (tool.id) {
    case "caption-generator":
      return <CaptionResults result={output as CaptionResult} />;
    case "hashtag-finder":
      return <HashtagResults result={output as HashtagResult} />;
    case "post-ideas":
      return <IdeasResults result={output as IdeasResult} />;
    case "content-calendar":
      return <CalendarResults result={output as CalendarResult} />;
    case "growth-advisor":
      return <AdvisorResults result={output as AdvisorResult} />;
    case "growth-roadmap":
      return <RoadmapResults result={output as RoadmapResult} />;
    case "service-recommender":
      return <RecommenderResults result={output as RecommenderResult} />;
    case "order-assistant":
      return <OrderAssistantResults result={output as OrderAssistantResult} />;
    default:
      return null;
  }
}

export function AiWorkspace({ tool, examples = [] }: { tool: AiTool; examples?: WorkspaceExample[] }) {
  const { status, setStatus } = useToolStatus(tool.id);
  const live = status?.availability === "available";
  const locked = !live;
  const account = status?.account ?? "signed_out";
  const usage = live ? status?.usage : null;
  const exhausted = Boolean(usage && usage.used >= usage.allowance);

  const [values, setValues] = React.useState<Values>({});
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [run, setRun] = React.useState<Run>({ kind: "idle" });
  const [last, setLast] = React.useState<Values | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const inflight = React.useRef<AbortController | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const formId = React.useId();
  const canRun = live && account === "verified" && !exhausted;
  const formLocked = locked || run.kind === "loading";

  const primary = tool.fields.find((f) => f.kind === "textarea");
  const rest = tool.fields.filter((f) => f !== primary && !f.advanced);
  const advanced = tool.fields.filter((f) => f.advanced);

  React.useEffect(() => () => inflight.current?.abort(), []);

  const applyExample = React.useCallback(
    (fill: Values, title: string) => {
      setValues(fill);
      setFieldErrors({});
      if (advanced.some((f) => typeof fill[f.id] === "string" && fill[f.id])) setMoreOpen(true);
      setNotice(`“${title}” example added. ${locked ? "This is a preview — generating opens when the tool launches." : "Review it, then generate."}`);
    },
    [advanced, locked],
  );

  // Examples elsewhere on the page fill the form and bring it into view.
  React.useEffect(() => {
    const onExample = (e: Event) => {
      const { toolId, title, values: fill } = (e as CustomEvent<{ toolId: string; title: string; values: Values }>).detail;
      if (toolId !== tool.id) return;
      applyExample(fill, title);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      rootRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      window.setTimeout(() => document.getElementById(`${formId}-${(primary ?? tool.fields[0])?.id}`)?.focus({ preventScroll: true }), reduce ? 0 : 400);
    };
    window.addEventListener(EXAMPLE_EVENT, onExample);
    return () => window.removeEventListener(EXAMPLE_EVENT, onExample);
  }, [tool.id, tool.fields, applyExample, formId, primary]);

  const generate = async (input: Values) => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setLast(input);
    setNotice(null);
    setRun({ kind: "loading", started: Date.now() });
    try {
      const res = await api<{ output: unknown; usage: { used: number; allowance: number } }>(`/api/ai/tools/${tool.id}/run`, { method: "POST", body: JSON.stringify(input), signal: controller.signal });
      setRun({ kind: "result", output: res.output, key: Date.now() });
      setStatus((s) => (s ? { ...s, usage: res.usage } : s));
    } catch (e) {
      if (controller.signal.aborted) return setRun({ kind: "idle" });
      setRun({ kind: "error", message: e instanceof ApiError ? e.message : "Something went wrong. Please try again." });
    } finally {
      if (inflight.current === controller) inflight.current = null;
    }
  };

  const submit = () => {
    if (!canRun) return;
    const errs = validate(tool.fields, values);
    setFieldErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) {
      if (advanced.some((f) => f.id === first)) setMoreOpen(true);
      window.setTimeout(() => document.getElementById(`${formId}-${first}`)?.focus(), 0);
      return;
    }
    void generate(values);
  };

  const setValue = (id: string, v: string | string[]) => {
    setValues((prev) => ({ ...prev, [id]: v }));
    if (fieldErrors[id])
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
  };

  const noun = NOUN[tool.id] ?? "results";
  const remaining = usage ? Math.max(0, usage.allowance - usage.used) : null;
  const field = (f: AiField) => <Field key={f.id} field={f} id={`${formId}-${f.id}`} value={values[f.id]} error={fieldErrors[f.id]} primary={f === primary} onChange={(v) => setValue(f.id, v)} />;

  return (
    <div ref={rootRef} id="workspace" className="scroll-mt-20 overflow-hidden rounded-[1.75rem] border bg-card shadow-[0_1px_2px_rgb(32_33_39/0.05),0_24px_60px_-40px_rgb(64_38_160/0.35)] dark:shadow-[0_24px_60px_-36px_rgb(0_0_0/0.75)] print:border-none print:shadow-none">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
        {/* ── Brief ─────────────────────────────────────────────────────── */}
        <section aria-labelledby={`${formId}-in`} className="border-b p-5 sm:p-7 lg:border-r lg:border-b-0 print:hidden">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={`${formId}-in`} className="font-heading text-lg font-bold tracking-tight">
                Your brief
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">A sentence or two is enough.</p>
            </div>
            {locked ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <Lock className="size-3" aria-hidden /> Preview
              </span>
            ) : remaining !== null ? (
              <span className="shrink-0 rounded-full bg-primary/[0.08] px-2.5 py-1 text-xs font-semibold text-primary tabular-nums dark:bg-primary/20 dark:text-[#c9bcff]">
                {remaining} of {usage!.allowance} left today
              </span>
            ) : null}
          </div>

          {locked ? (
            <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-primary/[0.06] px-3.5 py-3 text-[0.85rem] leading-relaxed text-foreground/80 ring-1 ring-primary/10 ring-inset dark:bg-primary/10">
              <Clock3 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="font-semibold text-foreground">In development.</span> Explore what it will ask for — generating opens when it launches.
              </span>
            </p>
          ) : account !== "verified" ? (
            <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-primary/[0.06] px-3.5 py-3 text-[0.85rem] leading-relaxed text-foreground/80 ring-1 ring-primary/10 ring-inset dark:bg-primary/10">
              {account === "unverified" ? <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> : <LogIn className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />}
              <span>
                {account === "unverified" ? (
                  <>
                    <span className="font-semibold text-foreground">Verify your email to generate.</span> Check your inbox for the link, or{" "}
                    <Link href="/verify-email" className="font-semibold text-primary hover:underline">
                      resend it
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-foreground">Free with a SociVanta account.</span> {tool.free ? `${tool.free.signedInPerDay} runs a day, no card needed.` : null}
                  </>
                )}
              </span>
            </p>
          ) : exhausted ? (
            <p role="status" className="mt-5 flex items-start gap-2.5 rounded-xl bg-muted px-3.5 py-3 text-[0.85rem] leading-relaxed">
              <Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>You&apos;ve used today&apos;s free runs. They reset at midnight UTC.</span>
            </p>
          ) : null}

          {tool.fields.length === 0 ? (
            <p className="mt-5 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">This tool works conversationally. Its interface will be shown here when it launches.</p>
          ) : (
            <form
              noValidate
              className="mt-5"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              {primary ? <fieldset disabled={formLocked}>{field(primary)}</fieldset> : null}
              {/* Outside the locked fieldset: examples stay usable in the preview to show what a good brief looks like. */}
              {primary && examples.length ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Wand2 className="size-3.5" aria-hidden /> Try an example:
                  </span>
                  {examples.map((ex) => (
                    <button key={ex.title} type="button" disabled={run.kind === "loading"} onClick={() => applyExample(ex.fill, ex.title)} className="rounded-full border border-dashed px-2.5 py-1 text-xs font-medium text-foreground/80 transition-colors hover:border-primary/50 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/25 focus-visible:outline-none disabled:opacity-50">
                      {ex.title}
                    </button>
                  ))}
                </div>
              ) : null}
              <fieldset disabled={formLocked} className={cn("space-y-5", primary && "mt-5")}>
                {rest.map(field)}
                {advanced.length ? (
                  <div className="rounded-xl border">
                    <button type="button" aria-expanded={moreOpen} aria-controls={`${formId}-more`} onClick={() => setMoreOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-semibold focus-visible:ring-3 focus-visible:ring-primary/25 focus-visible:outline-none">
                      <span>
                        More options <span className="font-normal text-muted-foreground">· {advanced.map((f) => f.label.replace(/\?$/, "").toLowerCase()).join(", ")}</span>
                      </span>
                      <ChevronDown className={cn("size-4 text-muted-foreground transition-transform motion-reduce:transition-none", moreOpen && "rotate-180")} aria-hidden />
                    </button>
                    <div id={`${formId}-more`} hidden={!moreOpen} className="space-y-5 border-t px-3.5 pt-4 pb-4">
                      {advanced.map(field)}
                    </div>
                  </div>
                ) : null}
              </fieldset>

              {notice ? (
                <p role="status" className="mt-4 flex items-start gap-2 rounded-xl bg-lime/30 px-3.5 py-2.5 text-[0.82rem] text-graphite dark:bg-lime/10 dark:text-foreground">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {notice}
                </p>
              ) : null}

              <div className="mt-6">
                {live && account === "signed_out" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Link href="/login" className="inline-flex h-12 items-center justify-center rounded-full border bg-card text-sm font-semibold hover:bg-muted">
                      Log in
                    </Link>
                    <Link href="/register" className="inline-flex h-12 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                      Sign up free
                    </Link>
                  </div>
                ) : run.kind === "loading" ? (
                  <button type="button" onClick={() => inflight.current?.abort()} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border bg-card text-sm font-semibold hover:bg-muted">
                    <X className="size-4" aria-hidden /> Cancel
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!canRun}
                    aria-describedby={`${formId}-cost`}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[0.95rem] font-semibold text-primary-foreground shadow-[0_12px_28px_-14px_rgb(112_71_235/0.95)] transition-[background-color,transform] hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
                  >
                    {locked ? <Clock3 className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
                    {locked ? "Coming soon" : run.kind === "result" ? "Generate again" : "Generate"}
                  </button>
                )}
                <p id={`${formId}-cost`} className="mt-2.5 text-center text-xs text-muted-foreground">
                  {locked ? `${tool.status} Nothing is generated yet.` : "Each run uses one of today's free runs. Failed runs don't count."}
                </p>
              </div>
            </form>
          )}
        </section>

        {/* ── Results ───────────────────────────────────────────────────── */}
        <section aria-labelledby={`${formId}-out`} aria-busy={run.kind === "loading" || undefined} className="flex min-w-0 flex-col bg-subtle/50 p-5 sm:p-7 dark:bg-white/[0.015] print:bg-transparent print:p-0">
          <div className="flex items-center justify-between gap-3 print:hidden">
            <h2 id={`${formId}-out`} className="font-heading text-lg font-bold tracking-tight">
              Results
            </h2>
            <button
              type="button"
              disabled={run.kind !== "result" || !canRun || !last}
              onClick={() => last && void generate(last)}
              aria-label="Regenerate with the same brief"
              title="Regenerate with the same brief (uses one run)"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-semibold text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
            >
              <RefreshCw className="size-3.5" aria-hidden /> <span className="hidden sm:inline">Regenerate</span>
            </button>
          </div>

          <div aria-live="polite" className="mt-5 flex flex-1 flex-col">
            {run.kind === "loading" ? (
              <Loading tool={tool} started={run.started} long={(tool.id === "content-calendar" && last?.days === "30") || (tool.id === "growth-roadmap" && last?.duration === "90")} />
            ) : run.kind === "error" ? (
              <div role="alert" className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-destructive/30 bg-card px-6 py-10 text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
                  <AlertCircle className="size-5" aria-hidden />
                </span>
                <p className="mt-3 font-heading font-bold">That didn&apos;t work</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">{run.message}</p>
                {canRun && last ? (
                  <button type="button" onClick={() => last && void generate(last)} className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-semibold hover:bg-muted">
                    <RefreshCw className="size-3.5" aria-hidden /> Try again
                  </button>
                ) : null}
              </div>
            ) : run.kind === "result" ? (
              <div>
                <p className="mb-5 flex items-start gap-2 rounded-xl border bg-card px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground print:hidden">
                  <Info className="mt-px size-3.5 shrink-0" aria-hidden /> AI-written suggestions. Read and edit before posting — nothing is saved or published for you.
                </p>
                <Results key={run.key} tool={tool} output={run.output} />
              </div>
            ) : (
              <EmptyState tool={tool} locked={locked} noun={noun} />
            )}
          </div>
        </section>
      </div>

      {/* ── Status bar: privacy and usage, said once ────────────────────── */}
      <div className="flex flex-col gap-1.5 border-t bg-card px-5 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-7 print:hidden">
        <p className="flex items-start gap-2">
          <ShieldCheck className="mt-px size-3.5 shrink-0 text-primary" aria-hidden />
          <span>
            Your brief isn&apos;t stored. Personal details are removed before anything reaches the AI model.{" "}
            {tool.output.length ? (
              <a href="#how-results" className="font-medium text-foreground/80 underline-offset-2 hover:text-primary hover:underline">
                How results are made
              </a>
            ) : null}
          </span>
        </p>
        {/* Usage appears here once the tool is live; while it isn't, the header already shows the planned allowance. */}
        {live && tool.free ? (
          <p className="shrink-0 tabular-nums">{usage ? `${usage.used} of ${usage.allowance} free runs used today · resets at midnight UTC` : `${tool.free.signedInPerDay} free runs a day with a SociVanta account`}</p>
        ) : null}
      </div>
    </div>
  );
}

/* ── Results states ─────────────────────────────────────────────────────── */

/** The shape of the results, drawn as quiet placeholders — never sample text. */
function ResultsShape({ tool, muted }: { tool: AiTool; muted: boolean }) {
  const bar = cn("block rounded-full", muted ? "bg-foreground/[0.07]" : "ai-sheen bg-foreground/[0.08]");
  const tile = "rounded-xl border bg-card";
  switch (tool.id) {
    case "caption-generator":
      return (
        <div className="space-y-2.5" aria-hidden>
          {[1, 2, 3].map((n) => (
            <div key={n} className={cn(tile, "flex gap-3 p-3.5")}>
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{n}</span>
              <span className="flex flex-1 flex-col gap-2 pt-1">
                <span className={cn(bar, "h-2 w-11/12")} />
                <span className={cn(bar, "h-2 w-8/12")} />
              </span>
            </div>
          ))}
        </div>
      );
    case "hashtag-finder":
      return (
        <div className="space-y-3.5" aria-hidden>
          {["Broad", "Specific", "Niche & community"].map((g, i) => (
            <div key={g}>
              <p className="text-xs font-semibold text-muted-foreground">{g}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Array.from({ length: 5 - i }, (_, k) => (
                  <span key={k} className={cn("h-7 rounded-full border bg-card", k % 2 ? "w-16" : "w-20")} />
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    case "post-ideas":
      return (
        <div className="grid grid-cols-2 gap-2.5" aria-hidden>
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className={cn(tile, "space-y-2 p-3.5")}>
              <span className="block h-4 w-14 rounded-full bg-primary/10" />
              <span className={cn(bar, "h-2 w-11/12")} />
              <span className={cn(bar, "h-2 w-7/12")} />
            </div>
          ))}
        </div>
      );
    case "content-calendar":
      return (
        <div className="grid grid-cols-7 gap-1.5" aria-hidden>
          {Array.from({ length: 7 }, (_, d) => (
            <div key={d} className={cn(tile, "flex h-16 flex-col items-center gap-1.5 p-1.5 sm:h-20")}>
              <span className="text-[0.62rem] font-semibold text-muted-foreground">{d + 1}</span>
              {d % 2 === 0 ? <span className="h-1.5 w-full rounded-full bg-primary/25" /> : null}
            </div>
          ))}
        </div>
      );
    case "growth-advisor":
      return (
        <div className="space-y-2.5" aria-hidden>
          {["High", "High", "Medium"].map((p, n) => (
            <div key={n} className={cn(tile, "flex items-center gap-3 p-3.5")}>
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-foreground/80 text-[0.65rem] font-bold text-background">{n + 1}</span>
              <span className="flex flex-1 flex-col gap-2">
                <span className={cn(bar, "h-2 w-10/12")} />
                <span className={cn(bar, "h-2 w-6/12")} />
              </span>
              <span className={cn("h-5 w-16 shrink-0 rounded-full", p === "High" ? "bg-primary/25" : "bg-primary/10")} />
            </div>
          ))}
        </div>
      );
    case "growth-roadmap":
      return (
        <div className="relative space-y-2.5 pl-8 before:absolute before:top-2 before:bottom-2 before:left-3 before:w-px before:bg-border" aria-hidden>
          {["Week 1", "Week 2", "Week 3"].map((w, n) => (
            <div key={w} className={cn(tile, "relative p-3.5")}>
              <span className="absolute top-4 -left-[1.55rem] size-3 rounded-full bg-primary ring-4 ring-background" />
              <p className="text-xs font-semibold text-primary">{w}</p>
              <span className={cn(bar, "mt-2 h-2", n === 1 ? "w-8/12" : "w-10/12")} />
            </div>
          ))}
        </div>
      );
    case "service-recommender":
    case "order-assistant":
      return (
        <div className="space-y-2.5" aria-hidden>
          {[0, 1].map((n) => (
            <div key={n} className={cn(tile, "p-3.5")}>
              <div className="flex items-center justify-between gap-3">
                <span className={cn(bar, "h-2.5 w-5/12")} />
                <span className="h-5 w-16 rounded-full bg-primary/15" />
              </div>
              <span className={cn(bar, "mt-3 h-2 w-11/12")} />
              <div className="mt-3 flex items-center justify-between border-t pt-3">
                <span className={cn(bar, "h-2 w-3/12")} />
                <span className="h-7 w-28 rounded-full bg-primary/20" />
              </div>
            </div>
          ))}
        </div>
      );
    default:
      return (
        <div className="space-y-2.5" aria-hidden>
          {(tool.output.length ? tool.output.map((o) => o.title) : ["", ""]).map((t, i) => (
            <div key={i} className={cn(tile, "p-3.5")}>
              {t ? <p className="text-sm font-semibold text-muted-foreground">{t}</p> : null}
              <span className={cn(bar, "mt-2.5 h-2 w-9/12")} />
            </div>
          ))}
        </div>
      );
  }
}

function EmptyState({ tool, locked, noun }: { tool: AiTool; locked: boolean; noun: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="rounded-2xl border border-dashed bg-background/60 p-4 sm:p-5 dark:bg-white/[0.015]">
        <ResultsShape tool={tool} muted={locked} />
      </div>
      <div className="mt-5 flex items-start gap-3">
        <ToolGlyph tool={tool} size="sm" />
        <div className="min-w-0">
          <p className="font-heading font-bold">{tool.output.length ? `Your ${noun} will appear here` : "Coming in a later phase"}</p>
          {tool.output.length ? (
            <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
              {tool.output.map((o) => (
                <li key={o.title}>
                  <span className="font-medium text-foreground/80">{o.title}</span> — {o.description.charAt(0).toLowerCase() + o.description.slice(1).replace(/\.$/, "")}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2.5 text-xs text-muted-foreground">{locked ? "This is how results will be organised. No sample output is shown — nothing has been generated." : "Fill in your brief and generate. You can edit and copy everything."}</p>
        </div>
      </div>
    </div>
  );
}

function Loading({ tool, started, long }: { tool: AiTool; started: number; long: boolean }) {
  const [now, setNow] = React.useState(started);
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.floor((now - started) / 1000));
  return (
    <div role="status" aria-label="Generating" className="flex flex-1 flex-col">
      <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="size-4 animate-pulse motion-reduce:animate-none" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Working on your brief</p>
          <p className="text-xs text-muted-foreground">{long ? "Planning this in stages — it can take up to a minute." : "This usually takes a few seconds."}</p>
        </div>
        {/* Elapsed time, not a fabricated percentage. */}
        <span className="text-xs text-muted-foreground tabular-nums" aria-hidden>
          {secs}s
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="ai-progress h-full w-1/3 rounded-full bg-primary/70" />
      </div>
      <div className="mt-5">
        <ResultsShape tool={tool} muted={false} />
      </div>
    </div>
  );
}

/* ── Fields ─────────────────────────────────────────────────────────────── */

function Field({ field: f, id, value, error, primary = false, onChange }: { field: AiField; id: string; value: string | string[] | undefined; error?: string; primary?: boolean; onChange: (v: string | string[]) => void }) {
  const helpId = f.help ? `${id}-help` : undefined;
  const errId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errId].filter(Boolean).join(" ") || undefined;
  const label = (
    <>
      {f.label} {f.required ? null : <span className="font-normal text-muted-foreground">(optional)</span>}
    </>
  );
  const help = f.help ? (
    <p id={helpId} className="mt-2 text-xs leading-relaxed text-muted-foreground">
      {f.help}
    </p>
  ) : null;
  const err = error ? (
    <p id={errId} className="mt-1.5 flex items-center gap-1 text-xs font-medium text-destructive">
      <AlertCircle className="size-3.5" aria-hidden /> {error}
    </p>
  ) : null;

  // Platforms: icon chips (checkboxes).
  if (f.kind === "platforms") {
    const picked = Array.isArray(value) ? value : [];
    const full = Boolean(f.maxSelect && picked.length >= f.maxSelect);
    return (
      <fieldset id={id} tabIndex={-1} aria-describedby={describedBy} aria-invalid={error ? true : undefined} className="outline-none">
        <legend className="flex w-full items-baseline justify-between gap-2 text-sm font-semibold">
          <span>{label}</span>
          {f.maxSelect ? (
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              {picked.length}/{f.maxSelect} selected
            </span>
          ) : null}
        </legend>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {f.options!.map((o) => {
            const on = picked.includes(o);
            return (
              <label key={o} className={cn(chip, on ? chipOn : chipOff)}>
                <input type="checkbox" className="sr-only" checked={on} disabled={!on && full ? true : undefined} onChange={(e) => onChange(e.target.checked ? [...picked, o] : picked.filter((x) => x !== o))} />
                <AiPlatformIcon name={o} className="size-3.5" />
                {o}
              </label>
            );
          })}
        </div>
        {help}
        {err}
      </fieldset>
    );
  }

  const str = typeof value === "string" ? value : "";

  // Short choice lists: chips (radios). Optional ones clear when chosen again.
  if (f.kind === "select") {
    return (
      <fieldset id={id} tabIndex={-1} aria-describedby={describedBy} aria-invalid={error ? true : undefined} className="outline-none">
        <legend className="text-sm font-semibold">{label}</legend>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {f.options!.map((o) => {
            const on = str === o;
            return (
              <label key={o} className={cn(chip, on ? chipOn : chipOff)}>
                <input
                  type="radio"
                  name={id}
                  value={o}
                  className="sr-only"
                  checked={on}
                  onChange={() => onChange(o)}
                  onClick={() => {
                    if (on && !f.required) onChange("");
                  }}
                />
                <AiPlatformIcon name={f.optionLabels?.[o] ?? o} className="size-3.5" />
                {f.optionLabels?.[o] ?? o}
              </label>
            );
          })}
        </div>
        {help}
        {err}
      </fieldset>
    );
  }

  const common = { id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, required: f.required };

  // Numbers: a stepper around a real number input.
  if (f.kind === "number") {
    const current = Number(str || f.placeholder || f.min || 0);
    const step = (d: number) => onChange(String(Math.min(f.max ?? 99, Math.max(f.min ?? 0, (Number.isFinite(current) ? current : 0) + d))));
    return (
      <div>
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-full border bg-background p-1 has-focus-visible:ring-4 has-focus-visible:ring-primary/15 dark:bg-white/[0.03]">
            <button type="button" onClick={() => step(-1)} aria-label={`Decrease ${f.label.toLowerCase()}`} className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
              <Minus className="size-4" aria-hidden />
            </button>
            <input {...common} type="number" inputMode="numeric" min={f.min} max={f.max} placeholder={f.placeholder} value={str} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 bg-transparent text-center text-[0.95rem] font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
            <button type="button" onClick={() => step(1)} aria-label={`Increase ${f.label.toLowerCase()}`} className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
          {f.min !== undefined && f.max !== undefined ? <span className="text-xs text-muted-foreground">{`${f.min}–${f.max} a week`}</span> : null}
        </div>
        {help}
        {err}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {f.kind === "textarea" ? (
        <textarea {...common} rows={primary ? 5 : 3} maxLength={f.maxLength} placeholder={f.placeholder} value={str} onChange={(e) => onChange(e.target.value)} className={cn(control, "mt-2 resize-y py-3 leading-relaxed", primary && "min-h-[8.5rem] text-base")} />
      ) : (
        <input {...common} type="text" maxLength={f.maxLength} placeholder={f.placeholder} value={str} onChange={(e) => onChange(e.target.value)} className={cn(control, "mt-2 h-12")} />
      )}
      {help || err || (f.kind === "textarea" && f.maxLength) ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {help}
            {err}
          </div>
          {f.kind === "textarea" && f.maxLength ? <p className={cn("mt-2 shrink-0 text-[0.7rem] tabular-nums", str.length > f.maxLength * 0.9 ? "text-destructive" : "text-muted-foreground")}>{`${str.length}/${f.maxLength}`}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
