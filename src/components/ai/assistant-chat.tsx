"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, BookOpen, CircleSlash, Compass, KeyRound, LifeBuoy, Lock, LogIn, Mail, MailCheck, Package, RefreshCw, RotateCcw, Search, Sparkles, Square, Wallet } from "lucide-react";
import type { AiTool } from "@/lib/ai/registry";
import { api, ApiError } from "@/lib/live-account";
import { cn } from "@/lib/utils";
import { ToolGlyph } from "./parts";
import { CopyButton } from "./results";
import { useToolStatus } from "./use-ai-status";
import { EXAMPLE_EVENT } from "./workspace";

/*
 * SociVanta AI Assistant — the conversation surface (AI-04).
 *
 * The conversation lives in this component for the session only: nothing is
 * stored, and a page reload starts fresh. Each turn sends a bounded transcript
 * (last 10 messages) to the shared AI pipeline, which counts one run. Answers
 * are plain text rendered by React; links are internal pages chosen by the
 * server. Suggested searches and follow-ups only run when the customer
 * presses them.
 *
 * AI-05: the same surface hosts the AI Support Assistant with its own copy
 * and an escalation card. Escalation never claims a ticket was created: it
 * shows the one real contact channel the server reports, or says none is
 * connected yet.
 */

interface AssistantAnswer {
  answer: string;
  links: { href: string; label: string }[];
  followUps: string[];
  suggestSearch: { query: string; href: string } | null;
  /** Support Assistant only: a person is needed, and how to reach one (from the server). */
  escalation?: { reason: string; ticketsConnected: boolean; email: string | null; note: string } | null;
}
type Msg = { id: number; role: "user"; content: string; error?: string } | { id: number; role: "assistant"; content: string; data: AssistantAnswer };

const MAX_SENT = 10;
const MAX_CHARS = 1_000;

const QUICK = [
  { icon: Search, label: "Help me find a service", prompt: "Help me find the right service for my goal." },
  { icon: Compass, label: "What can SociVanta help me with?", prompt: "What can SociVanta help me with?" },
  { icon: Package, label: "How do orders work?", prompt: "How do orders work on SociVanta?" },
  { icon: Sparkles, label: "Explore AI content tools", prompt: "Which SociVanta AI tools can help me create content?" },
];
const POPULAR = ["Which platforms do you support?", "Are results guaranteed?", "How do I add funds?", "How do I track my order?"];

interface ChatCopy {
  title: string;
  heading: string;
  intro: string;
  quick: typeof QUICK;
  popular: string[];
  placeholder: string;
  inputLabel: string;
  liveNote: string;
  signedOut: string;
  verify: string;
  idleNote: React.ReactNode;
}

const COPY: Record<string, ChatCopy> = {
  assistant: {
    title: "SociVanta AI Assistant",
    heading: "How can I help you today?",
    intro: "Ask about SociVanta's services, how ordering works, which AI tool fits your task — or a social media question.",
    quick: QUICK,
    popular: POPULAR,
    placeholder: "Ask about services, orders or SociVanta AI…",
    inputLabel: "Message the SociVanta AI Assistant",
    liveNote: "Enter to send · Shift + Enter for a new line · The assistant can't see your orders or account, and nothing is saved.",
    signedOut: "questions a day",
    verify: "Verify your email to chat with the assistant.",
    idleNote: (
      <>
        <Link href="/#services" className="font-semibold text-primary hover:underline">
          browse services
        </Link>{" "}
        or{" "}
        <Link href="/ai-tools/service-search" className="font-semibold text-primary hover:underline">
          search the catalog
        </Link>
        .
      </>
    ),
  },
  "support-assistant": {
    title: "AI Support Assistant",
    heading: "What do you need help with?",
    intro: "Orders, payments, cancellations, refunds or your account. When only our team can help, you'll see exactly how to reach a person.",
    quick: [
      { icon: Package, label: "A problem with an order", prompt: "I have a problem with one of my orders. What should I do?" },
      { icon: CircleSlash, label: "Cancel an order", prompt: "How do I cancel an order, and do I get my money back?" },
      { icon: Wallet, label: "Payments & wallet funds", prompt: "How do payments and wallet funds work?" },
      { icon: KeyRound, label: "Account & security", prompt: "How do I keep my account secure?" },
    ],
    popular: ["When are refunds possible?", "Why does my order need my information?", "How do I add funds?", "How do I talk to a person?"],
    placeholder: "Describe what you need help with…",
    inputLabel: "Message the AI Support Assistant",
    liveNote: "Enter to send · The assistant can't see or change your orders or account, and nothing you type is sent to the team.",
    signedOut: "support questions a day",
    verify: "Verify your email to use the support assistant.",
    idleNote: (
      <>
        your orders&apos; status and activity are in{" "}
        <Link href="/dashboard/orders" className="font-semibold text-primary hover:underline">
          My orders
        </Link>
        .
      </>
    ),
  },
};

/** Plain-text answer → paragraphs and bullet lists. Never HTML. */
function Formatted({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[0.95rem] leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split("\n").filter(Boolean);
        if (lines.length && lines.every((l) => /^\s*[-•]\s+/.test(l)))
          return (
            <ul key={i} className="space-y-1.5">
              {lines.map((l, k) => (
                <li key={k} className="flex gap-2.5">
                  <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                  <span>{l.replace(/^\s*[-•]\s+/, "")}</span>
                </li>
              ))}
            </ul>
          );
        return (
          <p key={i} className="whitespace-pre-line">
            {b}
          </p>
        );
      })}
    </div>
  );
}

export function AssistantChat({ tool, examples = [] }: { tool: AiTool; examples?: { title: string; fill: Record<string, string | string[]> }[] }) {
  const copy = COPY[tool.id] ?? COPY.assistant;
  const { status, setStatus } = useToolStatus(tool.id);
  const live = status?.availability === "available";
  const account = status?.account ?? "signed_out";
  const usage = live ? status?.usage : null;
  const exhausted = Boolean(usage && usage.used >= usage.allowance);
  const canSend = live && account === "verified" && !exhausted;

  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [draft, setDraft] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [atBottom, setAtBottom] = React.useState(true);
  const inflight = React.useRef<AbortController | null>(null);
  const logRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const nextId = React.useRef(1);
  const formId = React.useId();

  React.useEffect(() => () => inflight.current?.abort(), []);

  // Example briefs elsewhere on the page fill the composer (they never send).
  React.useEffect(() => {
    const onExample = (e: Event) => {
      const { toolId, values } = (e as CustomEvent<{ toolId: string; values: Record<string, string> }>).detail;
      if (toolId !== tool.id) return;
      setDraft(String(values.message ?? ""));
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      inputRef.current?.closest("section")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), reduce ? 0 : 400);
    };
    window.addEventListener(EXAMPLE_EVENT, onExample);
    return () => window.removeEventListener(EXAMPLE_EVENT, onExample);
  }, [tool.id]);

  // Follow new content only when the reader is already at the bottom.
  const scrollToEnd = React.useCallback((force = false) => {
    const el = logRef.current;
    if (!el) return;
    if (force || atBottom) el.scrollTo({ top: el.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [atBottom]);
  React.useEffect(() => scrollToEnd(), [messages, pending, scrollToEnd]);

  const onScroll = () => {
    const el = logRef.current;
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  };

  // Autosize the composer (1–6 lines).
  React.useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [draft]);

  const ask = async (history: Msg[]) => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setPending(true);
    const sent = history
      .filter((m) => !(m.role === "user" && m.error))
      .slice(-MAX_SENT)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2_500) }));
    try {
      const res = await api<{ output: AssistantAnswer; usage: { used: number; allowance: number } }>(`/api/ai/tools/${tool.id}/run`, { method: "POST", body: JSON.stringify({ messages: sent }), signal: controller.signal });
      setMessages((m) => [...m, { id: nextId.current++, role: "assistant", content: res.output.answer, data: res.output }]);
      setStatus((s) => (s ? { ...s, usage: res.usage } : s));
    } catch (e) {
      const message = controller.signal.aborted ? "Stopped." : e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
      setMessages((m) => m.map((x, k) => (k === m.length - 1 && x.role === "user" ? { ...x, error: message } : x)));
    } finally {
      if (inflight.current === controller) inflight.current = null;
      setPending(false);
    }
  };

  const send = (text: string) => {
    const content = text.trim();
    if (!content || !canSend || pending) return;
    const next: Msg[] = [...messages, { id: nextId.current++, role: "user", content: content.slice(0, MAX_CHARS) }];
    setMessages(next);
    setDraft("");
    setAtBottom(true);
    void ask(next);
  };

  const retry = (id: number) => {
    if (!canSend || pending) return;
    const idx = messages.findIndex((m) => m.id === id);
    const next = messages.slice(0, idx + 1).map((m) => (m.id === id && m.role === "user" ? { ...m, error: undefined } : m));
    setMessages(next);
    void ask(next);
  };

  const reset = () => {
    inflight.current?.abort();
    setMessages([]);
    setDraft("");
    inputRef.current?.focus();
  };

  const remaining = usage ? Math.max(0, usage.allowance - usage.used) : null;
  const started = messages.length > 0;

  return (
    <section aria-label={`Chat with ${tool.name}`} className="mx-auto w-full max-w-4xl scroll-mt-20 overflow-hidden rounded-[1.75rem] border bg-card shadow-[0_1px_2px_rgb(32_33_39/0.05),0_24px_60px_-40px_rgb(64_38_160/0.35)] dark:shadow-[0_24px_60px_-36px_rgb(0_0_0/0.75)]">
      {/* Bar */}
      <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-6">
        <ToolGlyph tool={tool} size="sm" />
        <div className="min-w-0 flex-1">
          <h2 id={`${formId}-title`} className="truncate font-heading text-[0.98rem] font-bold">
            {started ? "Conversation" : copy.title}
          </h2>
          <p className="truncate text-xs text-muted-foreground">{live ? (remaining !== null ? `${remaining} of ${usage!.allowance} questions left today` : "Answers from SociVanta's own information") : "Preview — not answering yet"}</p>
        </div>
        {started ? (
          <button type="button" onClick={reset} aria-label="New conversation" title="New conversation" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:px-3">
            <RotateCcw className="size-3.5" aria-hidden /> <span className="hidden sm:inline">New conversation</span>
          </button>
        ) : !live ? (
          <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <Lock className="size-3" aria-hidden /> Preview
          </span>
        ) : null}
      </div>

      {/* Log or welcome */}
      <div className="relative">
        <div ref={logRef} onScroll={onScroll} role="log" aria-live="polite" aria-label="Conversation" className={cn("overflow-y-auto px-4 sm:px-8", started ? "h-[min(62vh,36rem)] py-6" : "py-8 sm:py-12")}>
          {!started ? (
            <div className="mx-auto max-w-2xl text-center">
              <p className="font-heading text-[1.7rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">{copy.heading}</p>
              <p className="mx-auto mt-2 max-w-lg text-[0.98rem] text-muted-foreground">{copy.intro}</p>
              <ul className="mt-8 grid grid-cols-1 gap-2.5 text-left sm:grid-cols-2">
                {copy.quick.map((q) => (
                  <li key={q.label}>
                    <button
                      type="button"
                      onClick={() => (canSend ? send(q.prompt) : (setDraft(q.prompt), inputRef.current?.focus()))}
                      className="group flex w-full items-center gap-3 rounded-2xl border bg-background p-3.5 text-left transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none dark:bg-white/[0.02]"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20 dark:text-[#c9bcff]" aria-hidden>
                        <q.icon className="size-4" />
                      </span>
                      <span className="text-sm font-semibold">{q.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Popular questions</p>
              <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
                {[...copy.popular, ...examples.map((e) => String(e.fill.message ?? "")).filter(Boolean)].slice(0, 6).map((p) => (
                  <button key={p} type="button" onClick={() => (canSend ? send(p) : (setDraft(p), inputRef.current?.focus()))} className="rounded-full border px-3 py-1.5 text-[0.82rem] text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/25 focus-visible:outline-none">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol className="mx-auto max-w-3xl space-y-6">
              {messages.map((m) =>
                m.role === "user" ? (
                  <li key={m.id} className="flex flex-col items-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/[0.08] px-4 py-2.5 text-[0.95rem] leading-relaxed whitespace-pre-line dark:bg-primary/20">
                      <span className="sr-only">You: </span>
                      {m.content}
                    </p>
                    {m.error ? (
                      <p role="alert" className="mt-2 flex flex-wrap items-center justify-end gap-2 text-xs text-destructive">
                        {m.error}
                        {canSend ? (
                          <button type="button" onClick={() => retry(m.id)} className="inline-flex items-center gap-1 rounded-full border border-destructive/30 px-2.5 py-1 font-semibold hover:bg-destructive/5">
                            <RefreshCw className="size-3" aria-hidden /> Retry
                          </button>
                        ) : null}
                      </p>
                    ) : null}
                  </li>
                ) : (
                  <li key={m.id} className="flex gap-3">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground" aria-hidden>
                      <Sparkles className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="sr-only">Assistant:</p>
                      <Formatted text={m.content} />
                      {m.data.escalation ? <Escalation e={m.data.escalation} /> : null}
                      {m.data.links.length || m.data.suggestSearch ? (
                        <div className="mt-3.5 flex flex-wrap gap-1.5">
                          {m.data.suggestSearch ? (
                            <Link href={m.data.suggestSearch.href} prefetch={false} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                              <Search className="size-3.5" aria-hidden /> Open Smart Service Search
                            </Link>
                          ) : null}
                          {m.data.links.map((l) => (
                            <Link key={l.href} href={l.href} prefetch={false} className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-background px-3 text-xs font-semibold hover:border-primary/40 hover:text-primary dark:bg-white/[0.03]">
                              <BookOpen className="size-3.5" aria-hidden /> {l.label}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <CopyButton text={m.content} label="Copy answer" className="size-7" />
                        {m.data.followUps.map((f) => (
                          <button key={f} type="button" disabled={!canSend || Boolean(pending)} onClick={() => send(f)} className="rounded-full border border-dashed px-2.5 py-1 text-xs text-foreground/80 transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50">
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                ),
              )}
              {pending ? <Thinking /> : null}
            </ol>
          )}
        </div>
        {started && !atBottom ? (
          <button type="button" onClick={() => (setAtBottom(true), scrollToEnd(true))} className="absolute bottom-3 left-1/2 inline-flex h-8 -translate-x-1/2 items-center gap-1 rounded-full border bg-card px-3 text-xs font-semibold shadow-sm">
            <ArrowDown className="size-3.5" aria-hidden /> Latest
          </button>
        ) : null}
      </div>

      {/* Composer */}
      <div className="border-t bg-subtle/50 p-3 sm:p-4 dark:bg-white/[0.015]">
        {live && account !== "verified" ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-4 py-4 text-center sm:flex-row sm:justify-between sm:text-left">
            <p className="flex items-center gap-2 text-sm">
              {account === "unverified" ? <MailCheck className="size-4 text-primary" aria-hidden /> : <LogIn className="size-4 text-primary" aria-hidden />}
              {account === "unverified" ? copy.verify : `Free with a SociVanta account — ${usage?.allowance ?? tool.free?.signedInPerDay ?? 0} ${copy.signedOut}.`}
            </p>
            {account === "unverified" ? (
              <Link href="/verify-email" className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
                Resend link
              </Link>
            ) : (
              <span className="flex gap-2">
                <Link href="/login" className="inline-flex h-10 items-center rounded-full border bg-card px-4 text-sm font-semibold hover:bg-muted">
                  Log in
                </Link>
                <Link href="/register" className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
                  Sign up free
                </Link>
              </span>
            )}
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-end gap-2 rounded-2xl border bg-card p-2 transition-[border-color,box-shadow] focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10"
          >
            <label htmlFor={`${formId}-input`} className="sr-only">
              {copy.inputLabel}
            </label>
            <textarea
              id={`${formId}-input`}
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={MAX_CHARS}
              disabled={!live}
              placeholder={live ? (exhausted ? "You've used today's questions — they reset at midnight UTC." : copy.placeholder) : "The assistant isn't answering yet"}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              className="max-h-[10.5rem] min-h-11 flex-1 resize-none bg-transparent px-2.5 py-2.5 text-[0.95rem] leading-relaxed outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
            />
            {pending ? (
              <button type="button" onClick={() => inflight.current?.abort()} aria-label="Stop" className="grid size-10 shrink-0 place-items-center rounded-xl border bg-card hover:bg-muted">
                <Square className="size-3.5 fill-current" aria-hidden />
              </button>
            ) : (
              <button type="submit" disabled={!canSend || !draft.trim()} aria-label="Send" className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_18px_-10px_rgb(112_71_235/0.9)] transition-colors hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none">
                <ArrowUp className="size-4" aria-hidden />
              </button>
            )}
          </form>
        )}
        <p className="mt-2 px-1 text-center text-[0.72rem] text-muted-foreground sm:text-left">
          {live
            ? copy.liveNote
            : `${tool.status} The assistant isn't answering yet. Meanwhile, `}
          {!live ? copy.idleNote : null}
        </p>
      </div>
    </section>
  );
}

/** A person is needed. States only what really exists: no ticket is created, nothing is sent. */
function Escalation({ e }: { e: NonNullable<AssistantAnswer["escalation"]> }) {
  return (
    <div role="note" aria-label="Human support" className="mt-3.5 rounded-2xl border border-primary/25 bg-secondary/40 p-3.5 dark:bg-secondary/25">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <LifeBuoy className="size-4 text-primary" aria-hidden /> This needs a person
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{e.reason}</p>
      {/* The customer opens the ticket themselves; the assistant never creates one. */}
      {e.ticketsConnected ? (
        <a href="/dashboard/support?new=1" className="mt-2.5 me-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
          <LifeBuoy className="size-3.5" aria-hidden /> Create a support ticket
        </a>
      ) : null}
      {e.email ? (
        <a href={`mailto:${e.email}`} dir="ltr" className="mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
          <Mail className="size-3.5" aria-hidden /> Email {e.email}
        </a>
      ) : null}
      <p className="mt-2.5 text-xs text-muted-foreground">{e.note}</p>
    </div>
  );
}

function Thinking() {
  const [secs, setSecs] = React.useState(0);
  React.useEffect(() => {
    const t = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <li role="status" aria-label="The assistant is answering" className="flex items-center gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground" aria-hidden>
        <Sparkles className="size-3.5 animate-pulse motion-reduce:animate-none" />
      </span>
      <span className="flex items-center gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-bounce rounded-full bg-primary/60 motion-reduce:animate-none" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">Thinking · {secs}s</span>
    </li>
  );
}
