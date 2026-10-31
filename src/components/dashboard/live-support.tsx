"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, CircleHelp, CreditCard, History, Inbox, LifeBuoy, type LucideIcon, MessageSquarePlus, Package, Paperclip, RotateCcw, Search, Send, Undo2, UserRound, Wrench } from "lucide-react";
import { ConfirmDialog } from "@/components/dashboard/account-ui";
import { api, ApiError } from "@/lib/live-account";
import { formatDateTime } from "@/lib/i18n";
import { CATEGORIES, CATEGORY_LABEL, STATUS_META, type TicketCategory, type TicketEventView, type TicketMessageView, type TicketStatus, type TicketSummary } from "@/lib/support";
import { cn } from "@/lib/utils";

/*
 * Live customer Support (5G-A). The customer's own tickets only; the server
 * enforces ownership, validation, rate limits and duplicate protection.
 */

interface ListResponse {
  items: TicketSummary[];
  counts: { open: number; waiting: number; total: number };
  orders: { reference: string; label: string }[];
}
interface Detail {
  reference: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  orderRef: string | null;
  createdAt: string;
  messages: TicketMessageView[];
  events: TicketEventView[];
  actions: { canReply: boolean; canClose: boolean; canReopen: boolean };
}

const CAT_ICON: Record<TicketCategory, LucideIcon> = { order: Package, payment: CreditCard, refund: Undo2, service: CircleHelp, account: UserRound, technical: Wrench, other: CircleHelp };
const STATUS_TONE: Record<TicketStatus, string> = {
  awaiting: "bg-primary/10 text-primary dark:text-[#c4b5ff]",
  in_progress: "bg-secondary text-secondary-foreground",
  waiting: "bg-soon-soft text-soon",
  resolved: "bg-ok-soft text-ok",
  closed: "bg-off-soft text-off",
};
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? `k_${crypto.randomUUID().replace(/-/g, "")}` : `k_${Date.now()}${Math.random().toString(36).slice(2, 12)}`);
const message = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "That didn't work. Please try again.");
const btn = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";
const primaryBtn = cn(btn, "bg-primary text-primary-foreground shadow-[0_10px_24px_-14px_rgb(112_71_235/0.9)] hover:bg-primary/90");
const quietBtn = cn(btn, "border bg-card hover:bg-muted");
const field = "w-full rounded-xl border bg-background px-3.5 text-sm transition-colors outline-none placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 aria-invalid:border-destructive/60 dark:bg-muted/30";

export function StatusChip({ status, className }: { status: TicketStatus; className?: string }) {
  return <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[0.72rem] font-semibold whitespace-nowrap", STATUS_TONE[status], className)}>{STATUS_META[status].customer}</span>;
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

export function LiveSupport() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openRef = params.get("ticket");
  const creating = params.get("new") === "1" || Boolean(params.get("order"));
  const [status, setStatus] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [query, setQuery] = React.useState("");
  React.useEffect(() => {
    const t = window.setTimeout(() => setQuery(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const qs = new URLSearchParams({ status });
  if (query) qs.set("q", query);
  const list = useJson<ListResponse>(`/api/account/support?${qs}`);
  const go = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(patch)) if (v) u.set(k, v);
    const s = u.toString();
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };
  const detailOpen = Boolean(openRef) || creating;
  const d = list.data;

  return (
    <div className="mx-auto max-w-[90rem] px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Support</h1>
          <p className="mt-1 max-w-2xl text-[0.95rem] text-muted-foreground">Ask our team anything about your account or orders. Replies appear here.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/help" className={quietBtn}>
            <BookOpen className="size-4" aria-hidden /> Help Center
          </Link>
          <button type="button" onClick={() => go({ new: "1" })} className={primaryBtn}>
            <MessageSquarePlus className="size-4" aria-hidden /> New ticket
          </button>
        </div>
      </header>

      <div className="mt-6 grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* List (hidden on small screens while a ticket or the form is open) */}
        <section aria-label="My tickets" className={cn("min-w-0 rounded-[1.25rem] border bg-card", detailOpen && "hidden lg:block")}>
          <div className="space-y-2 border-b p-3">
            <div className="relative">
              <label htmlFor="sup-search" className="sr-only">
                Search my tickets
              </label>
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input id="sup-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} placeholder="Search by subject or reference" className={cn(field, "h-10 ps-9")} />
            </div>
            <div role="radiogroup" aria-label="Show" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
              {(
                [
                  ["all", "All"],
                  ["open", "Open"],
                  ["resolved", "Resolved"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={status === id} onClick={() => setStatus(id)} className={cn("h-8 rounded-lg text-[0.82rem] font-semibold transition-colors", status === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {label}
                  {id === "open" && d?.counts.open ? <span className="ms-1 text-[0.7rem] text-muted-foreground tabular-nums">{d.counts.open}</span> : null}
                </button>
              ))}
            </div>
          </div>
          {list.error ? (
            <div role="alert" className="p-6 text-center text-sm">
              <p className="font-semibold">Your tickets didn&apos;t load</p>
              <p className="mt-1 text-muted-foreground">{list.error}</p>
              <button type="button" onClick={list.reload} className={cn(quietBtn, "mt-3 h-9")}>
                <RotateCcw className="size-3.5" aria-hidden /> Try again
              </button>
            </div>
          ) : !d ? (
            <div className="space-y-2 p-3" aria-label="Loading tickets">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
              ))}
            </div>
          ) : d.items.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <span className="grid size-11 place-items-center rounded-2xl bg-secondary text-primary" aria-hidden>
                <Inbox className="size-5" />
              </span>
              <p className="mt-3 font-semibold">{query || status !== "all" ? "No tickets match" : "No tickets yet"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{query || status !== "all" ? "Try another search or filter." : "When you contact us, your conversations will be here."}</p>
              {!query && status === "all" ? (
                <button type="button" onClick={() => go({ new: "1" })} className={cn(primaryBtn, "mt-4 h-9")}>
                  New ticket
                </button>
              ) : null}
            </div>
          ) : (
            <ul className="divide-y" aria-label="Tickets">
              {d.items.map((t) => {
                const Icon = CAT_ICON[t.category];
                const unseenReply = t.status === "waiting" || (t.lastMessage?.author === "staff" && t.status !== "closed");
                return (
                  <li key={t.reference}>
                    <button type="button" onClick={() => go({ ticket: t.reference })} aria-current={openRef === t.reference ? "true" : undefined} className={cn("flex w-full gap-3 px-3.5 py-3 text-start transition-colors duration-200 hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none", openRef === t.reference && "bg-primary/[0.05] dark:bg-primary/10")}>
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className={cn("truncate text-sm", unseenReply ? "font-bold" : "font-semibold")}>{t.subject}</span>
                          <span className="shrink-0 text-[0.7rem] text-muted-foreground">{formatDateTime(t.updatedAt)}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {t.lastMessage ? `${t.lastMessage.author === "staff" ? "Sociotix: " : "You: "}${t.lastMessage.preview}` : t.reference}
                        </span>
                        <span className="mt-1.5 flex items-center gap-2">
                          <StatusChip status={t.status} className="h-5 px-2 text-[0.68rem]" />
                          <span className="font-mono text-[0.68rem] text-muted-foreground">{t.reference}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Detail */}
        <section aria-label={creating ? "New ticket" : "Ticket"} className={cn("min-w-0", !detailOpen && "hidden lg:block")}>
          {creating ? (
            <NewTicket key={params.get("order") ?? "new"} orders={d?.orders ?? []} initialOrder={params.get("order")} onCancel={() => go({})} onCreated={(ref) => (list.reload(), go({ ticket: ref }))} />
          ) : openRef ? (
            <TicketView key={openRef} reference={openRef} onBack={() => go({})} onChanged={list.reload} />
          ) : (
            <div className="flex h-full min-h-[22rem] flex-col items-center justify-center rounded-[1.25rem] border border-dashed bg-card/50 px-6 text-center">
              <LifeBuoy className="size-7 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-semibold">Select a ticket, or start a new one</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Many questions are answered in the Help Center, too.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => go({ new: "1" })} className={cn(primaryBtn, "h-9")}>
                  New ticket
                </button>
                <Link href="/help" className={cn(quietBtn, "h-9")}>
                  Browse help articles
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function NewTicket({ orders, initialOrder, onCancel, onCreated }: { orders: { reference: string; label: string }[]; initialOrder: string | null; onCancel: () => void; onCreated: (ref: string) => void }) {
  const [category, setCategory] = React.useState<TicketCategory>(initialOrder ? "order" : "order");
  const [subject, setSubject] = React.useState("");
  const [text, setText] = React.useState("");
  const [orderRef, setOrderRef] = React.useState(initialOrder ?? "");
  const [touched, setTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // One key per form: a double click or a retried request opens the ticket once.
  const key = React.useRef(newKey());
  const subjectErr = touched && subject.trim().length < 4 ? "Add a short subject (at least 4 characters)." : null;
  const textErr = touched && text.trim().length < 10 ? "Tell us a little more (at least 10 characters)." : null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (subject.trim().length < 4 || text.trim().length < 10 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ reference: string }>("/api/account/support", { method: "POST", body: JSON.stringify({ subject, category, message: text, orderRef: orderRef || "", key: key.current }) });
      onCreated(r.reference);
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate className="rounded-[1.25rem] border bg-card p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="grid size-9 place-items-center rounded-full hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none lg:hidden" aria-label="Back to my tickets">
          <ArrowLeft className="size-4" aria-hidden />
        </button>
        <div>
          <h2 className="font-heading text-[1.3rem] font-extrabold tracking-tight">New ticket</h2>
          <p className="text-sm text-muted-foreground">Tell us what you need. It takes about a minute.</p>
        </div>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold">What&apos;s it about?</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {CATEGORIES.map((c) => {
            const Icon = CAT_ICON[c.id];
            const on = category === c.id;
            return (
              <label key={c.id} className={cn("flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-[border-color,background-color] duration-200 hover:border-primary/35 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-primary/30", on && "border-primary/60 bg-primary/[0.05] dark:bg-primary/10")}>
                <input type="radio" name="category" value={c.id} checked={on} onChange={() => setCategory(c.id)} className="sr-only" />
                <Icon className={cn("mt-0.5 size-4 shrink-0", on ? "text-primary dark:text-[#c4b5ff]" : "text-muted-foreground")} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{c.label}</span>
                  <span className="block text-xs text-muted-foreground">{c.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
        <div>
          <label htmlFor="tk-subject" className="mb-1.5 block text-sm font-semibold">
            Subject
          </label>
          <input id="tk-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} placeholder="e.g. My order hasn't started yet" aria-invalid={subjectErr ? true : undefined} aria-describedby={subjectErr ? "tk-subject-err" : undefined} className={cn(field, "h-11")} />
          {subjectErr ? (
            <p id="tk-subject-err" className="mt-1 text-xs text-destructive">
              {subjectErr}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="tk-order" className="mb-1.5 flex items-baseline justify-between text-sm font-semibold">
            Related order <span className="text-xs font-normal text-muted-foreground">Optional</span>
          </label>
          <select id="tk-order" value={orderRef} onChange={(e) => setOrderRef(e.target.value)} className={cn(field, "h-11")}>
            <option value="">{orders.length ? "No order" : "You have no orders yet"}</option>
            {orders.map((o) => (
              <option key={o.reference} value={o.reference}>
                {o.label}
              </option>
            ))}
            {initialOrder && !orders.some((o) => o.reference === initialOrder) ? <option value={initialOrder}>{initialOrder}</option> : null}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="tk-message" className="mb-1.5 flex items-baseline justify-between text-sm font-semibold">
          Message <span className="text-xs font-normal text-muted-foreground tabular-nums">{text.length}/5000</span>
        </label>
        <textarea id="tk-message" value={text} onChange={(e) => setText(e.target.value)} rows={6} maxLength={5000} placeholder="What happened, and what would you like us to do? Include any links that help." aria-invalid={textErr ? true : undefined} aria-describedby="tk-message-help" className={cn(field, "py-3 leading-relaxed")} />
        <p id="tk-message-help" className={cn("mt-1 text-xs", textErr ? "text-destructive" : "text-muted-foreground")}>
          {textErr ?? "Never include passwords, sign-in codes or card numbers. Our team will never ask for them."}
        </p>
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
        <Paperclip className="mt-0.5 size-3.5 shrink-0" aria-hidden /> File attachments aren&apos;t available yet. Describe the problem or paste a link instead.
      </p>
      {error ? (
        <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className={quietBtn}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={primaryBtn}>
          <Send className="size-4" aria-hidden /> {busy ? "Sending…" : "Send to support"}
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function TicketView({ reference, onBack, onChanged }: { reference: string; onBack: () => void; onChanged: () => void }) {
  const detail = useJson<{ ticket: Detail }>(`/api/account/support/${encodeURIComponent(reference)}`);
  const [fresh, setFresh] = React.useState<Detail | null>(null);
  const t = fresh ?? detail.data?.ticket ?? null;
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmClose, setConfirmClose] = React.useState(false);
  const key = React.useRef(newKey());
  const end = React.useRef<HTMLDivElement>(null);
  const count = t?.messages.length ?? 0;
  React.useEffect(() => {
    if (count) end.current?.scrollIntoView({ block: "nearest" });
  }, [count]);

  const act = async (action: "reply" | "close" | "reopen", body?: object) => {
    setBusy(action);
    setError(null);
    try {
      const r = await api<{ ticket: Detail }>(`/api/account/support/${encodeURIComponent(reference)}/${action}`, { method: "POST", body: JSON.stringify(body ?? {}) });
      setFresh(r.ticket);
      onChanged();
      if (action === "reply") {
        setText("");
        key.current = newKey();
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  if (detail.error && !t)
    return (
      <div role="alert" className="rounded-[1.25rem] border bg-card p-6 text-sm">
        <p className="font-semibold">This ticket couldn&apos;t be opened</p>
        <p className="mt-1 text-muted-foreground">{detail.error}</p>
        <button type="button" onClick={onBack} className={cn(quietBtn, "mt-3 h-9")}>
          Back to my tickets
        </button>
      </div>
    );
  if (!t) return <div className="h-[28rem] animate-pulse rounded-[1.25rem] bg-muted motion-reduce:animate-none" aria-label="Loading ticket" />;

  return (
    <div className="flex flex-col rounded-[1.25rem] border bg-card">
      <div className="border-b p-4 sm:p-5">
        <div className="flex items-start gap-2">
          <button type="button" onClick={onBack} className="-ms-1 grid size-9 shrink-0 place-items-center rounded-full hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none lg:hidden" aria-label="Back to my tickets">
            <ArrowLeft className="size-4" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-[1.2rem] leading-snug font-extrabold tracking-tight sm:text-[1.35rem]">{t.subject}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{t.reference}</span>
              <span aria-hidden>·</span>
              <span>{CATEGORY_LABEL[t.category]}</span>
              {t.orderRef ? (
                <>
                  <span aria-hidden>·</span>
                  <Link href={`/dashboard/orders?order=${encodeURIComponent(t.orderRef)}`} className="font-semibold text-primary hover:underline dark:text-[#c4b5ff]">
                    Order {t.orderRef}
                  </Link>
                </>
              ) : null}
            </p>
          </div>
          <StatusChip status={t.status} />
        </div>
        <p className={cn("mt-3 rounded-xl px-3 py-2 text-sm", t.status === "waiting" ? "bg-soon-soft text-soon" : "bg-muted/60 text-muted-foreground")}>{STATUS_META[t.status].customerExplain}</p>
      </div>

      <ol className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5" aria-label="Conversation">
        {t.messages.map((m) => {
          const mine = m.author === "customer";
          return (
            <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[min(36rem,88%)] rounded-2xl px-4 py-3", mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border bg-background dark:bg-muted/30")}>
                <p className={cn("text-[0.72rem] font-semibold", mine ? "text-primary-foreground/80" : "text-primary dark:text-[#c4b5ff]")}>{m.authorName}</p>
                <p className="mt-1 text-[0.92rem] leading-relaxed break-words whitespace-pre-wrap">{m.body}</p>
                <p className={cn("mt-1.5 text-[0.68rem]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  <time dateTime={m.at}>{formatDateTime(m.at)}</time>
                </p>
              </div>
            </li>
          );
        })}
        <div ref={end} />
      </ol>

      <details className="group border-t px-4 py-3 sm:px-5">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <History className="size-3.5" aria-hidden /> Activity ({t.events.length})
        </summary>
        <ol className="mt-2 space-y-1.5 border-s ps-3 text-xs">
          {t.events.map((e) => (
            <li key={e.id}>
              <span className="font-medium">{e.label}</span> <span className="text-muted-foreground">· {formatDateTime(e.at)}</span>
            </li>
          ))}
        </ol>
      </details>

      <div className="border-t p-4 sm:p-5">
        {error ? (
          <p role="alert" className="mb-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm">
            {error}
          </p>
        ) : null}
        {t.actions.canReply ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim() && !busy) void act("reply", { body: text, key: key.current });
            }}
          >
            <label htmlFor="tk-reply" className="sr-only">
              Your reply
            </label>
            <textarea
              id="tk-reply"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim() && !busy) {
                  e.preventDefault();
                  void act("reply", { body: text, key: key.current });
                }
              }}
              rows={3}
              maxLength={5000}
              placeholder={t.status === "resolved" ? "Still need help? Reply to reopen this ticket." : "Write a reply…"}
              className={cn(field, "py-3 leading-relaxed")}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              {t.actions.canClose ? (
                <button type="button" onClick={() => setConfirmClose(true)} disabled={busy !== null} className="text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50">
                  {t.status === "resolved" ? "Close ticket" : "I don't need help anymore"}
                </button>
              ) : (
                <span />
              )}
              <button type="submit" disabled={!text.trim() || busy !== null} className={primaryBtn}>
                <Send className="size-4" aria-hidden /> {busy === "reply" ? "Sending…" : "Send reply"}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/60 px-3.5 py-3 text-sm">
            <p className="text-muted-foreground">This ticket is closed.{t.actions.canReopen ? " Reopen it if you still need help." : " Open a new ticket if you need more help."}</p>
            {t.actions.canReopen ? (
              <button type="button" onClick={() => act("reopen")} disabled={busy !== null} className={cn(quietBtn, "h-9")}>
                <RotateCcw className="size-3.5" aria-hidden /> {busy === "reopen" ? "Reopening…" : "Reopen"}
              </button>
            ) : null}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Close this ticket?"
        description="We'll stop working on it. You can reopen it for 14 days if you need more help."
        confirmLabel="Close ticket"
        onConfirm={() => {
          setConfirmClose(false);
          void act("close");
        }}
      />
    </div>
  );
}
