"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, CircleAlert, ClipboardList, Info, Lock, LogIn, MailCheck, RefreshCw, Sparkles } from "lucide-react";
import { AI_TOOL_BY_ID, type AiTool } from "@/lib/ai/registry";
import { formatDateTime, useDisplay } from "@/lib/i18n";
import { api, ApiError } from "@/lib/live-account";
import { type CustomerOrder, ORDER_STATUS_META } from "@/lib/orders";
import { cn } from "@/lib/utils";
import { ToolGlyph } from "./parts";
import { CopyButton } from "./results";
import { useToolStatus } from "./use-ai-status";

/*
 * AI Order Explanation (AI-05) — the customer surfaces.
 *
 * - ExplainOrderAction: a quiet "Explain this order" row inside the My Orders
 *   detail sheet. It opens an inline panel; nothing runs until the customer
 *   presses Explain (one run).
 * - OrderExplainer: the tool page. Signed-in customers pick one of their own
 *   orders (read from their own order list) and optionally ask a question.
 *
 * The explanation text is the model's; status, payment, times, timeline and
 * the available actions come from the order record, returned by the server.
 */

export interface OrderExplanation {
  reference: string;
  service: { name: string; platform: string };
  status: { label: string; tone: string };
  payment: { label: string; explain: string };
  summary: string;
  meaning: string;
  nextSteps: string[];
  question: string | null;
  answer: string | null;
  timeline: { label: string; detail: string | null; at: string; actor: string }[];
  times: { placedAt: string; startedAt: string | null; completedAt: string | null; closedAt: string | null };
  actions: { canCancel: boolean; canUpdateDetails: boolean };
  teamMessage: string | null;
}

const TOOL_ID = "order-explanation";
const ordersHref = (ref: string) => `/dashboard/orders?order=${encodeURIComponent(ref)}`;

type Run = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "result"; data: OrderExplanation };

function useExplain() {
  const { status, setStatus } = useToolStatus(TOOL_ID);
  const [run, setRun] = React.useState<Run>({ kind: "idle" });
  const inflight = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => inflight.current?.abort(), []);
  const live = status?.availability === "available";
  const account = status?.account ?? "signed_out";
  const usage = live ? status?.usage : null;
  const exhausted = Boolean(usage && usage.used >= usage.allowance);

  const explain = async (reference: string, question: string) => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setRun({ kind: "loading" });
    try {
      const res = await api<{ output: OrderExplanation; usage: { used: number; allowance: number } }>(`/api/ai/tools/${TOOL_ID}/run`, {
        method: "POST",
        body: JSON.stringify({ reference, question: question.trim() }),
        signal: controller.signal,
      });
      setRun({ kind: "result", data: res.output });
      setStatus((s) => (s ? { ...s, usage: res.usage } : s));
    } catch (e) {
      if (controller.signal.aborted) return setRun({ kind: "idle" });
      setRun({ kind: "error", message: e instanceof ApiError ? e.message : "Something went wrong. Please try again." });
    } finally {
      if (inflight.current === controller) inflight.current = null;
    }
  };
  const reset = () => {
    inflight.current?.abort();
    setRun({ kind: "idle" });
  };
  return { live, account, usage, exhausted, canRun: live && account === "verified" && !exhausted, run, explain, reset };
}

/* ── Inside My Orders ───────────────────────────────────────────────────── */

export function ExplainOrderAction({ order }: { order: CustomerOrder }) {
  const [open, setOpen] = React.useState(false);
  const [question, setQuestion] = React.useState("");
  const x = useExplain();
  const panelId = React.useId();
  // A changed order (e.g. after updating details) makes an earlier explanation stale.
  const version = `${order.status}:${order.paymentStatus}:${order.events.length}`;
  const [seen, setSeen] = React.useState(version);
  if (seen !== version) {
    setSeen(version);
    x.reset();
  }

  return (
    <section aria-label="AI order explanation" className="overflow-hidden rounded-2xl border bg-gradient-to-b from-primary/[0.035] to-transparent dark:from-primary/[0.09]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-primary/[0.04] focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none focus-visible:ring-inset"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20 dark:text-[#c9bcff]" aria-hidden>
          <Sparkles className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Explain this order</span>
          <span className="block text-xs text-muted-foreground">{x.live ? "In plain words, from this order's record" : "AI explanation · coming soon"}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id={panelId} className="border-t px-4 pt-3 pb-4">
          <ExplainBody x={x} reference={order.reference} question={question} setQuestion={setQuestion} compact />
        </div>
      ) : null}
    </section>
  );
}

/* ── Shared body: ask → loading → result ─────────────────────────────────── */

function ExplainBody({ x, reference, question, setQuestion, compact = false }: { x: ReturnType<typeof useExplain>; reference: string; question: string; setQuestion: (v: string) => void; compact?: boolean }) {
  const inputId = React.useId();
  const remaining = x.usage ? Math.max(0, x.usage.allowance - x.usage.used) : null;
  const tool = AI_TOOL_BY_ID[TOOL_ID];

  if (!x.live)
    return (
      <p className="flex gap-2 text-sm text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          {tool.status} When it&apos;s switched on, it explains this order&apos;s status, payment and next steps in plain words — using only what&apos;s recorded. Until then, the status and activity shown here are the complete record.
        </span>
      </p>
    );
  if (x.account !== "verified")
    return (
      <p className="flex items-center gap-2 text-sm">
        <MailCheck className="size-4 shrink-0 text-primary" aria-hidden /> Verify your email to use AI explanations.
      </p>
    );

  if (x.run.kind === "result") return <ExplanationView data={x.run.data} compact={compact} onAgain={x.reset} />;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (x.canRun && x.run.kind !== "loading") void x.explain(reference, question);
      }}
      className="space-y-3"
    >
      <div>
        <label htmlFor={inputId} className="text-sm font-medium">
          Anything specific? <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          id={inputId}
          value={question}
          maxLength={300}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={x.run.kind === "loading"}
          placeholder="e.g. What happens next?"
          className="mt-1 h-10 w-full rounded-xl border bg-card px-3 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 disabled:opacity-70"
        />
      </div>
      {x.run.kind === "error" ? (
        <p role="alert" className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden /> {x.run.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!x.canRun || x.run.kind === "loading"} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_8px_18px_-10px_rgb(112_71_235/0.9)] hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none">
          {x.run.kind === "loading" ? <RefreshCw className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {x.run.kind === "loading" ? "Explaining…" : x.run.kind === "error" ? "Try again" : "Explain"}
        </button>
        <span className="text-xs text-muted-foreground tabular-nums" role={x.run.kind === "loading" ? "status" : undefined}>
          {x.run.kind === "loading" ? "Reading this order's record…" : x.exhausted ? "You've used today's explanations — they reset at midnight UTC." : remaining !== null ? `${remaining} of ${x.usage!.allowance} left today` : ""}
        </span>
      </div>
    </form>
  );
}

export function ExplanationView({ data, compact = false, onAgain }: { data: OrderExplanation; compact?: boolean; onAgain?: () => void }) {
  useDisplay();
  const meta = Object.values(ORDER_STATUS_META).find((m) => m.customerLabel === data.status.label);
  const copy = [data.summary, data.meaning, ...data.nextSteps.map((s) => `- ${s}`), data.answer ? `${data.question}\n${data.answer}` : ""].filter(Boolean).join("\n\n");
  return (
    <div className="space-y-4" aria-live="polite">
      <div>
        <p className="text-[0.95rem] leading-relaxed font-medium">{data.summary}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{data.meaning}</p>
      </div>

      {data.answer ? (
        <div className="rounded-xl border bg-card px-3.5 py-3">
          <p className="text-xs font-semibold text-muted-foreground">You asked: {data.question}</p>
          <p className="mt-1 text-sm leading-relaxed">{data.answer}</p>
        </div>
      ) : null}

      {data.nextSteps.length ? (
        <div>
          <h4 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">What you can do</h4>
          <ul className="mt-2 space-y-1.5">
            {data.nextSteps.map((s) => (
              <li key={s} className="flex gap-2.5 text-sm">
                <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!compact ? (
        <>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-xl border px-3.5 py-2.5">
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd className="font-semibold">{data.status.label}</dd>
              {meta ? <dd className="text-xs text-muted-foreground">{meta.customerExplain}</dd> : null}
            </div>
            <div className="rounded-xl border px-3.5 py-2.5">
              <dt className="text-xs text-muted-foreground">Payment</dt>
              <dd className="font-semibold">{data.payment.label}</dd>
              <dd className="text-xs text-muted-foreground">{data.payment.explain}</dd>
            </div>
          </dl>
          {data.teamMessage ? (
            <p className="rounded-xl bg-muted/60 px-3.5 py-2.5 text-sm">
              <span className="font-semibold">Message from the team: </span>
              {data.teamMessage}
            </p>
          ) : null}
          <div>
            <h4 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Recorded timeline</h4>
            {data.timeline.length ? (
              <ol className="mt-2 space-y-3 border-s ps-4">
                {data.timeline.map((ev, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -start-[1.3rem] top-1.5 size-2 rounded-full bg-primary" aria-hidden />
                    <p className="text-sm font-semibold">{ev.label}</p>
                    {ev.detail ? <p className="text-sm text-muted-foreground">{ev.detail}</p> : null}
                    <p className="text-xs text-muted-foreground">{formatDateTime(ev.at)}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No activity has been recorded yet.</p>
            )}
          </div>
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <CopyButton text={copy} label="Copy explanation" className="size-8" />
        {onAgain ? (
          <button type="button" onClick={onAgain} className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold hover:bg-muted">
            <RefreshCw className="size-3.5" aria-hidden /> Ask something else
          </button>
        ) : null}
        {!compact ? (
          <Link href={ordersHref(data.reference)} className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold hover:bg-muted">
            <ClipboardList className="size-3.5" aria-hidden /> Open in My orders
          </Link>
        ) : null}
        <p className="flex w-full items-start gap-1.5 pt-1 text-[0.72rem] text-muted-foreground">
          <Info className="mt-px size-3 shrink-0" aria-hidden /> AI explanation of this order&apos;s record. It can&apos;t change the order, and never estimates dates or outcomes.
        </p>
      </div>
    </div>
  );
}

/* ── Tool page ───────────────────────────────────────────────────────────── */

interface OrderOption {
  reference: string;
  service: { name: string; platform: string };
  status: CustomerOrder["status"];
  placedAt: string;
}

export function OrderExplainer({ tool }: { tool: AiTool }) {
  useDisplay();
  const x = useExplain();
  const [orders, setOrders] = React.useState<{ items: OrderOption[] } | { error: string } | null>(null);
  const [reference, setReference] = React.useState("");
  const [question, setQuestion] = React.useState("");
  const titleId = React.useId();
  const signedIn = x.account === "verified";

  React.useEffect(() => {
    if (!x.live || !signedIn) return;
    let cancelled = false;
    api<{ items: CustomerOrder[] }>("/api/account/orders?pageSize=20").then(
      (r) => {
        if (cancelled) return;
        setOrders({ items: r.items });
        // Arriving from My orders (?order=) preselects that order.
        const wanted = new URLSearchParams(window.location.search).get("order")?.toUpperCase();
        setReference((cur) => cur || (wanted && r.items.some((o) => o.reference === wanted) ? wanted : (r.items[0]?.reference ?? "")));
      },
      (e: Error) => !cancelled && setOrders({ error: e.message }),
    );
    return () => {
      cancelled = true;
    };
  }, [x.live, signedIn]);

  const list = orders && "items" in orders ? orders.items : [];
  const selected = list.find((o) => o.reference === reference);

  return (
    <section aria-labelledby={titleId} className="mx-auto w-full max-w-4xl overflow-hidden rounded-[1.75rem] border bg-card shadow-[0_1px_2px_rgb(32_33_39/0.05),0_24px_60px_-40px_rgb(64_38_160/0.35)] dark:shadow-[0_24px_60px_-36px_rgb(0_0_0/0.75)]">
      <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-6">
        <ToolGlyph tool={tool} size="sm" />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate font-heading text-[0.98rem] font-bold">
            Explain one of your orders
          </h2>
          <p className="truncate text-xs text-muted-foreground">{x.live ? "Only your own orders · only what's recorded" : "Preview — not explaining yet"}</p>
        </div>
        {!x.live ? (
          <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <Lock className="size-3" aria-hidden /> Preview
          </span>
        ) : null}
      </div>

      <div className="p-4 sm:p-7">
        {!x.live ? (
          <PreviewState tool={tool} />
        ) : !signedIn ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border bg-background px-4 py-6 text-center">
            {x.account === "unverified" ? <MailCheck className="size-6 text-primary" aria-hidden /> : <LogIn className="size-6 text-primary" aria-hidden />}
            <p className="max-w-md text-sm">{x.account === "unverified" ? "Verify your email to get AI explanations of your orders." : `Log in to explain your orders — free with a SociVanta account, ${x.usage?.allowance ?? tool.free?.signedInPerDay ?? 0} explanations a day.`}</p>
            <Link href={x.account === "unverified" ? "/verify-email" : "/login"} className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
              {x.account === "unverified" ? "Resend link" : "Log in"}
            </Link>
          </div>
        ) : orders === null ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading your orders">
            <div className="h-11 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
            <div className="h-24 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
          </div>
        ) : "error" in orders ? (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            {orders.error}
          </p>
        ) : !list.length ? (
          <div className="rounded-2xl border border-dashed px-4 py-8 text-center">
            <p className="font-heading font-bold">You don&apos;t have any orders yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Once you place an order, you can come back here for a plain-language explanation of it.</p>
            <Link href="/ai-tools/smart-order-assistant" className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold hover:bg-muted">
              Plan an order with Smart Order Assistant <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <label htmlFor={`${titleId}-order`} className="text-sm font-medium">
                Order
              </label>
              <select
                id={`${titleId}-order`}
                value={reference}
                onChange={(e) => {
                  setReference(e.target.value);
                  x.reset();
                }}
                className="mt-1 h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 dark:bg-white/[0.03]"
              >
                {list.map((o) => (
                  <option key={o.reference} value={o.reference}>
                    {o.reference} · {o.service.name}
                  </option>
                ))}
              </select>
              {selected ? (
                <div className="mt-3 rounded-xl border bg-background px-3.5 py-3 text-sm dark:bg-white/[0.02]">
                  <p className="font-semibold">{selected.service.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ORDER_STATUS_META[selected.status].customerLabel} · placed {formatDateTime(selected.placedAt)}
                  </p>
                </div>
              ) : null}
              <p className="mt-3 text-xs text-muted-foreground">Showing your 20 most recent orders.</p>
            </div>
            <div className="min-w-0">
              <ExplainBody x={x} reference={reference} question={question} setQuestion={setQuestion} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PreviewState({ tool }: { tool: AiTool }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
      <span className="hidden size-11 place-items-center rounded-2xl bg-primary/10 text-primary sm:grid dark:bg-primary/20 dark:text-[#c9bcff]" aria-hidden>
        <Sparkles className="size-5" />
      </span>
      <div>
        <p className="font-heading text-lg font-bold">Not explaining orders yet</p>
        <p className="mt-1 text-sm text-muted-foreground">{tool.status} When it&apos;s switched on, you&apos;ll choose one of your orders and see:</p>
        <ul className="mt-3 space-y-1.5 text-sm">
          {tool.output.map((o) => (
            <li key={o.title} className="flex gap-2.5">
              <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="font-semibold">{o.title}</span> — {o.description.charAt(0).toLowerCase() + o.description.slice(1)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm">
          Meanwhile, every order&apos;s status, payment and recorded activity are in{" "}
          <Link href="/dashboard/orders" className="font-semibold text-primary hover:underline">
            My orders
          </Link>
          . No sample explanation is shown — nothing has been generated.
        </p>
      </div>
    </div>
  );
}
