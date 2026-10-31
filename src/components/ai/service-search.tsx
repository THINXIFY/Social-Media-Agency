"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Info, MessageCircleQuestion, Search, Sparkles, X } from "lucide-react";
import { type AiTool, CATALOG_PLATFORM_CHOICES } from "@/lib/ai/registry";
import { api, ApiError } from "@/lib/live-account";
import { cn } from "@/lib/utils";
import { AiPlatformIcon } from "./platform-icon";
import { useToolStatus } from "./use-ai-status";
import { EXAMPLE_EVENT } from "./workspace";

/*
 * Smart Service Search (AI-04).
 *
 * Two honest modes with one interface:
 *  - AI match (signed-in, verified, AI live): the shared pipeline parses the
 *    request, retrieves real catalog candidates, the model ranks them and
 *    explains why; the server verifies every service. Uses one free run.
 *  - Keyword match (always available, no AI): the same deterministic parsing
 *    against the public catalog. Free, labelled as not AI.
 * The query lives in the URL (?q=&platform=&mode=), so back/forward work.
 * An AI search never runs on its own from a URL — only when the customer
 * presses Search. Cards come from the catalog: names, prices and status are
 * SociVanta's; ordering is offered only when the server says it's possible.
 */

interface Card {
  id: string;
  name: string;
  description: string;
  platform: { id: string; name: string };
  categoryLabel: string;
  status: "available" | "preview";
  price: { amount: number; unit: string } | null;
  limits: { min: number | null; max: number | null } | null;
  fields: { id: string; label: string; required: boolean }[];
  orderable: boolean;
  why: string;
}
type AiResult = { mode: "ai"; query: string; intent: string; detected: { platforms: string[]; categories: string[] }; checkoutOpen: boolean; best: Card[]; alternatives: Card[]; guidance: string[]; clarifyingQuestion: string };
type KeywordResult = { mode: "keyword"; query: string; detected: { platforms: string[]; categories: string[] }; checkoutOpen: boolean; results: Card[] };
type State = { kind: "idle" } | { kind: "loading"; mode: "ai" | "keyword" } | { kind: "error"; message: string; mode: "ai" | "keyword" } | { kind: "done"; result: AiResult | KeywordResult } | { kind: "ready" };

const EXAMPLES = ["Promote my clothing store on Instagram", "More views for my YouTube channel", "Marketing services for my new business"];
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n < 1 ? 3 : 2, maximumFractionDigits: 3 })}`;
/*
 * The query lives in the URL. It's read with useSyncExternalStore instead of
 * useSearchParams, so the page needs no Suspense fallback: the server renders
 * the full (empty) search panel and the browser picks up the URL after
 * hydration — no layout shift. Updates use the History API and notify here.
 */
const URL_EVENT = "socivanta:search-url";
const subscribeUrl = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  window.addEventListener(URL_EVENT, cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener(URL_EVENT, cb);
  };
};
function pushUrl(search: string) {
  window.history.pushState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  window.dispatchEvent(new Event(URL_EVENT));
}

const dropKey = (k: string) => (x: Record<string, string>) => {
    const next = { ...x };
    delete next[k];
    return next;
  };
const keyOf = (q: string, platform: string, mode: string) => `${mode}|${platform}|${q.trim().toLowerCase()}`;

export function ServiceSearch({ tool }: { tool: AiTool }) {
  const search = React.useSyncExternalStore(subscribeUrl, () => window.location.search, () => "");
  const params = React.useMemo(() => new URLSearchParams(search), [search]);
  const { status, setStatus } = useToolStatus(tool.id);
  const live = status?.availability === "available";
  const account = status?.account ?? "signed_out";
  const usage = live ? status?.usage : null;
  const aiReady = live && account === "verified" && !(usage && usage.used >= usage.allowance);

  const urlQ = params.get("q") ?? "";
  const urlPlatform = params.get("platform") ?? "";
  const urlMode = params.get("mode") === "keyword" ? "keyword" : "ai";
  const [query, setQuery] = React.useState(urlQ);
  const [platform, setPlatform] = React.useState(urlPlatform);
  const [mode, setMode] = React.useState<"ai" | "keyword">(urlMode);
  // Results and errors by request key; the visible state is derived from the URL, never synced in an effect.
  const [results, setResults] = React.useState<Record<string, AiResult | KeywordResult>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [requested, setRequested] = React.useState<string | null>(null); // the AI search the customer explicitly asked for
  const inputRef = React.useRef<HTMLInputElement>(null);
  const formId = React.useId();
  const effectiveMode = aiReady && mode === "ai" ? "ai" : "keyword";

  // When the URL changes (search, back/forward, a link from the assistant), the boxes follow it.
  const urlKey = `${urlQ}|${urlPlatform}|${urlMode}`;
  const [seenUrl, setSeenUrl] = React.useState(urlKey);
  if (seenUrl !== urlKey) {
    setSeenUrl(urlKey);
    setQuery(urlQ);
    setPlatform(urlPlatform);
  }

  // Example briefs on the page fill the search box (they never search).
  React.useEffect(() => {
    const onExample = (e: Event) => {
      const { toolId, values } = (e as CustomEvent<{ toolId: string; values: Record<string, string> }>).detail;
      if (toolId !== tool.id) return;
      setQuery(String(values.query ?? ""));
      setPlatform(String(values.platform ?? ""));
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      inputRef.current?.closest("section")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), reduce ? 0 : 400);
    };
    window.addEventListener(EXAMPLE_EVENT, onExample);
    return () => window.removeEventListener(EXAMPLE_EVENT, onExample);
  }, [tool.id]);

  const activeMode: "ai" | "keyword" = aiReady && urlMode === "ai" ? "ai" : "keyword";
  const key = keyOf(urlQ, urlPlatform, activeMode);
  const hasQuery = urlQ.trim().length >= 2;
  // Keyword searches are free and run straight from the URL; an AI search runs only when asked for.
  const wantsFetch = hasQuery && !results[key] && !errors[key] && (activeMode === "keyword" || requested === key);

  React.useEffect(() => {
    if (!wantsFetch) return;
    const controller = new AbortController();
    (async () => {
      try {
        let result: AiResult | KeywordResult;
        if (activeMode === "ai") {
          const res = await api<{ output: AiResult; usage: { used: number; allowance: number } }>(`/api/ai/tools/${tool.id}/run`, { method: "POST", body: JSON.stringify({ query: urlQ, platform: urlPlatform || undefined }), signal: controller.signal });
          result = res.output;
          setStatus((st) => (st ? { ...st, usage: res.usage } : st));
        } else {
          result = await api<KeywordResult>(`/api/ai/search?${new URLSearchParams({ q: urlQ, ...(urlPlatform ? { platform: urlPlatform } : {}) })}`, { signal: controller.signal });
        }
        setResults((r) => ({ ...r, [key]: result }));
      } catch (e) {
        if (!controller.signal.aborted) setErrors((x) => ({ ...x, [key]: e instanceof ApiError ? e.message : "Something went wrong. Please try again." }));
      }
    })();
    return () => controller.abort();
  }, [wantsFetch, activeMode, key, urlQ, urlPlatform, tool.id, setStatus]);

  const state: State = !hasQuery
    ? { kind: "idle" }
    : results[key]
      ? { kind: "done", result: results[key] }
      : errors[key]
        ? { kind: "error", mode: activeMode, message: errors[key] }
        : wantsFetch
          ? { kind: "loading", mode: activeMode }
          : { kind: "ready" };

  const submit = (q = query) => {
    const text = q.trim();
    if (text.length < 2) return inputRef.current?.focus();
    const nextKey = keyOf(text, platform, effectiveMode);
    if (effectiveMode === "ai") setRequested(nextKey);
    // Searching again replaces a failed attempt.
    setErrors(dropKey(nextKey));
    const next = new URLSearchParams({ q: text, ...(platform ? { platform } : {}), ...(effectiveMode === "keyword" ? { mode: "keyword" } : {}) });
    // Native history: the query lives in the URL (back/forward work) without a server round trip.
    pushUrl(next.toString());
  };
  const retry = () => {
    if (activeMode === "ai") setRequested(key);
    setErrors(dropKey(key));
  };

  const clear = () => {
    setQuery("");
    pushUrl("");
    inputRef.current?.focus();
  };

  const result = state.kind === "done" ? state.result : null;
  const best = result ? (result.mode === "ai" ? result.best : result.results.slice(0, 4)) : [];
  const others = result ? (result.mode === "ai" ? result.alternatives : result.results.slice(4)) : [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      {/* Search panel */}
      <section aria-labelledby={`${formId}-h`} className="scroll-mt-20 rounded-[1.75rem] border bg-card p-5 shadow-[0_1px_2px_rgb(32_33_39/0.05),0_24px_60px_-40px_rgb(64_38_160/0.35)] sm:p-8 dark:shadow-[0_24px_60px_-36px_rgb(0_0_0/0.75)]">
        <h2 id={`${formId}-h`} className="font-heading text-[1.45rem] leading-tight font-extrabold tracking-tight text-balance sm:text-[1.9rem]">
          Describe what you need. We&apos;ll help you find it.
        </h2>
        <form
          role="search"
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <label htmlFor={`${formId}-q`} className="sr-only">
                Describe what you need
              </label>
              <input
                id={`${formId}-q`}
                ref={inputRef}
                type="search"
                value={query}
                maxLength={300}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. I want to promote my clothing store on Instagram"
                className="h-14 w-full rounded-2xl border bg-background pr-11 pl-12 text-[1.02rem] transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-primary/15 dark:bg-white/[0.03] [&::-webkit-search-cancel-button]:appearance-none"
              />
              {query ? (
                <button type="button" onClick={clear} aria-label="Clear search" className="absolute top-1/2 right-3 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <button type="submit" className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-[0.95rem] font-semibold text-primary-foreground shadow-[0_12px_28px_-14px_rgb(112_71_235/0.95)] hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none">
              {effectiveMode === "ai" ? <Sparkles className="size-4" aria-hidden /> : <Search className="size-4" aria-hidden />} Search
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-muted-foreground">Try:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setQuery(ex);
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border border-dashed px-2.5 py-1 text-xs text-foreground/80 transition-colors hover:border-primary/50 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/25 focus-visible:outline-none"
                >
                  {ex}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`${formId}-p`} className="text-xs font-medium text-muted-foreground">
                Platform
              </label>
              <span className="relative">
                <select id={`${formId}-p`} value={platform} onChange={(e) => setPlatform(e.target.value)} className="h-9 appearance-none rounded-full border bg-background pr-8 pl-3 text-xs font-semibold outline-none focus-visible:ring-3 focus-visible:ring-primary/25 dark:bg-white/[0.03]">
                  <option value="">Any platform</option>
                  {Object.entries(CATALOG_PLATFORM_CHOICES).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              </span>
              {aiReady ? (
                <div role="radiogroup" aria-label="Search mode" className="inline-flex rounded-full border bg-background p-0.5 dark:bg-white/[0.03]">
                  {(
                    [
                      ["ai", "AI match"],
                      ["keyword", "Keyword"],
                    ] as const
                  ).map(([m, label]) => (
                    <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn("h-8 rounded-full px-3 text-xs font-semibold transition-colors", mode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </form>

        <p className="mt-5 flex items-start gap-2 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            {effectiveMode === "ai"
              ? `AI match looks up real SociVanta services, ranks the relevant ones and explains why. Prices and availability always come from SociVanta. Each AI search uses one of today's free runs${usage ? ` (${Math.max(0, usage.allowance - usage.used)} left)` : ""}.`
              : live
                ? account === "verified"
                  ? "Keyword match finds services by platform and need words — no AI, and no runs used."
                  : `Keyword match finds services by platform and need words — no AI. AI matching is free with a verified SociVanta account.`
                : "Keyword match finds services by platform and need words — no AI. AI matching launches with SociVanta AI."}
          </span>
        </p>
      </section>

      {/* Results */}
      <section aria-label="Search results" aria-live="polite" aria-busy={state.kind === "loading" || undefined}>
        {state.kind === "loading" ? (
          <div role="status" aria-label="Searching">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="size-4 animate-pulse text-primary motion-reduce:animate-none" aria-hidden />
              {state.mode === "ai" ? "Matching your request to the catalog…" : "Searching the catalog…"}
            </p>
            <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2" aria-hidden>
              {[0, 1, 2, 3].map((n) => (
                <li key={n} className="ai-sheen h-40 rounded-2xl border bg-card" />
              ))}
            </ul>
          </div>
        ) : state.kind === "error" ? (
          <div role="alert" className="rounded-2xl border border-dashed border-destructive/30 bg-card px-5 py-8 text-center">
            <p className="font-heading font-bold">The search didn&apos;t work</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{state.message}</p>
            <button type="button" onClick={retry} className="mt-4 inline-flex h-10 items-center rounded-full border bg-card px-4 text-sm font-semibold hover:bg-muted">
              Try again
            </button>
          </div>
        ) : state.kind === "ready" ? (
          <div className="rounded-2xl border border-dashed bg-card px-5 py-8 text-center">
            <p className="font-heading font-bold">Ready to search for “{urlQ}”</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Press Search to run AI matching — it uses one of today&apos;s free runs. Nothing runs until you do.</p>
            <button type="button" onClick={() => submit(urlQ)} className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <Sparkles className="size-3.5" aria-hidden /> Search
            </button>
          </div>
        ) : result ? (
          <div className="space-y-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[0.7rem] font-semibold", result.mode === "ai" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                {result.mode === "ai" ? <Sparkles className="size-3" aria-hidden /> : <Search className="size-3" aria-hidden />}
                {result.mode === "ai" ? "AI matched" : "Keyword match · no AI"}
              </span>
              <p className="text-sm text-muted-foreground">{result.mode === "ai" ? result.intent : `Results for “${result.query}”`}</p>
              {result.detected.platforms.concat(result.detected.categories).map((d) => (
                <span key={d} className="rounded-full border px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground capitalize">
                  {d}
                </span>
              ))}
            </div>

            {result.mode === "ai" && result.clarifyingQuestion ? (
              <div className="flex items-start gap-3 rounded-2xl border bg-primary/[0.05] p-4 dark:bg-primary/10">
                <MessageCircleQuestion className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div>
                  <p className="text-sm font-semibold">{result.clarifyingQuestion}</p>
                  <button type="button" onClick={() => inputRef.current?.focus()} className="mt-1 text-xs font-semibold text-primary hover:underline">
                    Refine your search
                  </button>
                </div>
              </div>
            ) : null}

            {best.length ? (
              <Group title="Best matches" cards={best} checkoutOpen={result.checkoutOpen} />
            ) : (
              <div className="rounded-2xl border border-dashed bg-card px-5 py-10 text-center">
                <p className="font-heading text-lg font-bold">No matching services yet</p>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">Try naming the platform and what you want more of — for example “more followers on TikTok” — or browse the full catalog.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Link href="/#services" className="inline-flex h-10 items-center rounded-full border bg-card px-4 text-sm font-semibold hover:bg-muted">
                    Browse the catalog
                  </Link>
                  <Link href="/ai-tools/assistant" className="inline-flex h-10 items-center rounded-full border bg-card px-4 text-sm font-semibold hover:bg-muted">
                    Ask the assistant
                  </Link>
                </div>
              </div>
            )}
            {others.length ? <Group title="Other matches" cards={others} checkoutOpen={result.checkoutOpen} /> : null}
            {result.mode === "ai" && result.guidance.length ? (
              <div className="rounded-2xl border bg-lime/15 p-5 dark:bg-lime/[0.06]">
                <h3 className="font-heading font-bold">Helpful next steps</h3>
                <ul className="mt-2.5 space-y-1.5 text-sm">
                  {result.guidance.map((g) => (
                    <li key={g} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      {g}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            {[
              ["Say it naturally", "“More views for my YouTube channel” works better than a single keyword."],
              ["Real services only", "Every result is a real SociVanta service. Prices and availability come from the catalog."],
              ["You stay in control", "Searching never orders anything. Orderable services link to New Order, where you review first."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-2xl border bg-card/60 p-4">
                <p className="font-semibold">{t}</p>
                <p className="mt-1 text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Group({ title, cards, checkoutOpen }: { title: string; cards: Card[]; checkoutOpen: boolean }) {
  return (
    <div>
      <h3 className="font-heading text-lg font-bold">{title}</h3>
      <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        {cards.map((c) => (
          <ResultCard key={c.id} c={c} checkoutOpen={checkoutOpen} />
        ))}
      </ul>
    </div>
  );
}

function ResultCard({ c, checkoutOpen }: { c: Card; checkoutOpen: boolean }) {
  const [open, setOpen] = React.useState(false);
  const detailsId = React.useId();
  return (
    <li className="flex flex-col rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgb(32_33_39/0.04)] transition-colors hover:border-primary/30">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <AiPlatformIcon name={c.platform.name} className="size-3.5" />
        {c.platform.name} · {c.categoryLabel}
      </p>
      <h4 className="mt-1.5 font-heading text-[1.02rem] font-bold">{c.name}</h4>
      <p className={cn("mt-1.5 text-sm text-muted-foreground", !open && "line-clamp-2")}>{c.description}</p>
      <p className="mt-3 flex gap-2 rounded-xl bg-subtle px-3 py-2 text-sm dark:bg-white/[0.03]">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
        <span>{c.why}</span>
      </p>
      <div id={detailsId} hidden={!open} className="mt-3 space-y-1.5 text-sm">
        <p>
          <span className="font-semibold">An order asks for: </span>
          {c.fields.map((f) => `${f.label}${f.required ? "" : " (optional)"}`).join(", ") || "the details shown in New Order"}
        </p>
        {c.limits && (c.limits.min || c.limits.max) ? (
          <p>
            <span className="font-semibold">Quantity: </span>
            {c.limits.min ? `from ${c.limits.min.toLocaleString("en-US")}` : ""} {c.limits.max ? `up to ${c.limits.max.toLocaleString("en-US")}` : ""}
          </p>
        ) : null}
        <p className="text-muted-foreground">{c.status === "available" ? (checkoutOpen ? "Ready to order." : "Ordering isn't open yet.") : "Not available to order yet — it's still being reviewed."}</p>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-3.5 [&:not(:first-child)]:mt-4">
        <p className="text-sm">
          {c.status === "available" && c.price ? (
            <>
              <span className="font-semibold tabular-nums">{money(c.price.amount)}</span> <span className="text-muted-foreground">{c.price.unit}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Not available to order yet</span>
          )}
        </p>
        <span className="flex gap-1.5">
          <button type="button" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen((o) => !o)} className="inline-flex h-9 items-center gap-1 rounded-full border px-3 text-xs font-semibold hover:bg-muted">
            {open ? "Hide details" : "View service"}
          </button>
          {c.orderable ? (
            <Link href={`/dashboard/new-order?service=${encodeURIComponent(c.id)}`} prefetch={false} className="inline-flex h-9 items-center gap-1 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              Configure in New Order <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : null}
        </span>
      </div>
    </li>
  );
}
