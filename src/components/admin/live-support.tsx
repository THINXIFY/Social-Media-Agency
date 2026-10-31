"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, History, Inbox, Lock, MessageSquareText, RotateCcw, Search, Send, StickyNote } from "lucide-react";
import { usd } from "@/lib/demo-account";
import { formatDateTime } from "@/lib/i18n";
import { api, ApiError } from "@/lib/live-account";
import { ORDER_STATUS_META, type OrderStatus } from "@/lib/orders";
import { CATEGORIES, CATEGORY_LABEL, PRIORITY_LABEL, STATUS_META, TICKET_PRIORITIES, TICKET_STATUSES, type TicketCategory, type TicketEventView, type TicketMessageView, type TicketPriority, type TicketStatus, type TicketSummary } from "@/lib/support";
import { cn } from "@/lib/utils";
import { SelectInput } from "./form";

/*
 * Live Admin Support (5G-A). A queue and a ticket workspace. The server
 * enforces Support: View / Manage, private notes and the audit trail.
 */

type QueueItem = TicketSummary & { customer: string; customerRef: string; assignee: string | null };
interface Queue {
  items: QueueItem[];
  counts: { needsReply: number; mine: number; unassigned: number; waiting: number; open: number };
  can: { manage: boolean };
}
interface Detail {
  reference: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  assignee: string | null;
  assignedStaffId: string | null;
  customer: { name: string; publicRef: string; accountRef: string; email: string };
  order: { reference: string; service: string; status: string; quantity: number; totalCents: number; placedAt: string } | null;
  orderHidden: boolean;
  createdAt: string;
  messages: TicketMessageView[];
  events: TicketEventView[];
  notes: { id: string; body: string; by: string; at: string }[];
}

const VIEWS = [
  ["needs_reply", "Needs reply", "needsReply"],
  ["mine", "Mine", "mine"],
  ["unassigned", "Unassigned", "unassigned"],
  ["waiting", "Waiting on customer", "waiting"],
  ["resolved", "Resolved & closed", null],
  ["all", "All", null],
] as const;
const STATUS_TONE: Record<TicketStatus, string> = {
  awaiting: "bg-primary/10 text-primary dark:text-[#c4b5ff]",
  in_progress: "bg-secondary text-secondary-foreground",
  waiting: "bg-soon-soft text-soon",
  resolved: "bg-ok-soft text-ok",
  closed: "bg-off-soft text-off",
};
const PRIORITY_TONE: Record<TicketPriority, string> = { low: "text-muted-foreground", normal: "text-muted-foreground", high: "text-soon", urgent: "text-destructive" };
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? `k_${crypto.randomUUID().replace(/-/g, "")}` : `k_${Date.now()}${Math.random().toString(36).slice(2, 12)}`);
const message = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "That didn't work.");
const btn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";
const field = "w-full rounded-xl border bg-background px-3.5 text-sm transition-colors outline-none placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 dark:bg-muted/30";

function Chip({ status }: { status: TicketStatus }) {
  return <span className={cn("inline-flex h-5.5 shrink-0 items-center rounded-full px-2 text-[0.7rem] font-semibold whitespace-nowrap", STATUS_TONE[status])}>{STATUS_META[status].staff}</span>;
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

export function LiveAdminSupport() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openRef = params.get("ticket");
  const [view, setView] = React.useState<(typeof VIEWS)[number][0]>("needs_reply");
  const [category, setCategory] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const [q, setQ] = React.useState("");
  const [query, setQuery] = React.useState("");
  React.useEffect(() => {
    const t = window.setTimeout(() => setQuery(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const qs = new URLSearchParams({ view });
  if (query) qs.set("q", query);
  if (category) qs.set("category", category);
  if (priority) qs.set("priority", priority);
  const queue = useJson<Queue>(`/api/admin/support?${qs}`);
  const d = queue.data;
  const open = (ref: string | null) => router.push(ref ? `${pathname}?ticket=${ref}` : pathname, { scroll: false });

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.8rem] font-medium text-muted-foreground">Operations</p>
          <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Support</h1>
          <p className="mt-1 max-w-2xl text-[0.95rem] text-muted-foreground">Customer tickets in one queue. Replies reach the customer; notes stay private to staff.</p>
        </div>
        {d ? (
          <p className="text-sm text-muted-foreground tabular-nums">
            <span className="font-semibold text-foreground">{d.counts.open}</span> open · <span className="font-semibold text-foreground">{d.counts.needsReply}</span> need a reply · <span className="font-semibold text-foreground">{d.counts.waiting}</span> waiting on customers
          </p>
        ) : null}
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-[26rem_minmax(0,1fr)]">
        <section aria-label="Ticket queue" className={cn("min-w-0 overflow-hidden rounded-2xl border bg-card", openRef && "hidden lg:block")}>
          <div className="space-y-2 border-b p-3">
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Queue">
              {VIEWS.map(([id, label, countKey]) => (
                <button key={id} type="button" role="radio" aria-checked={view === id} onClick={() => setView(id)} className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.8rem] font-semibold whitespace-nowrap transition-colors", view === id ? "bg-graphite text-white dark:bg-white dark:text-graphite" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  {label}
                  {countKey && d ? <span className={cn("text-[0.7rem] tabular-nums", view === id ? "opacity-80" : "")}>{d.counts[countKey]}</span> : null}
                </button>
              ))}
            </div>
            <div className="relative">
              <label htmlFor="as-search" className="sr-only">
                Search tickets
              </label>
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input id="as-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} placeholder="Ticket, subject, customer or email" className={cn(field, "h-10 ps-9")} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SelectInput aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="h-9">
                <option value="">All topics</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </SelectInput>
              <SelectInput aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} className="h-9">
                <option value="">Any priority</option>
                {TICKET_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </SelectInput>
            </div>
          </div>
          {queue.error ? (
            <div role="alert" className="p-6 text-center text-sm">
              <p className="font-semibold">The queue didn&apos;t load</p>
              <p className="mt-1 text-muted-foreground">{queue.error}</p>
              <button type="button" onClick={queue.reload} className={cn(btn, "mt-3 border")}>
                <RotateCcw className="size-3.5" aria-hidden /> Try again
              </button>
            </div>
          ) : !d ? (
            <div className="space-y-2 p-3" aria-label="Loading queue">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
              ))}
            </div>
          ) : d.items.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <Inbox className="size-6 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-semibold">{query || category || priority ? "No tickets match" : view === "needs_reply" ? "Nothing needs a reply" : "No tickets here"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{view === "needs_reply" && !query ? "New customer messages will appear here." : "Try another view or filter."}</p>
            </div>
          ) : (
            <ul className="max-h-[calc(100dvh-20rem)] divide-y overflow-y-auto" aria-label="Tickets">
              {d.items.map((t) => (
                <li key={t.reference}>
                  <button type="button" onClick={() => open(t.reference)} aria-current={openRef === t.reference ? "true" : undefined} className={cn("block w-full px-3.5 py-3 text-start transition-colors duration-200 hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none", openRef === t.reference && "bg-primary/[0.05] dark:bg-primary/10")}>
                    <span className="flex items-start justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{t.subject}</span>
                      <span className="shrink-0 text-[0.7rem] text-muted-foreground">{formatDateTime(t.updatedAt)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {t.customer} · {t.lastMessage ? `${t.lastMessage.author === "staff" ? "You: " : ""}${t.lastMessage.preview}` : ""}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Chip status={t.status} />
                      {t.priority !== "normal" ? <span className={cn("text-[0.7rem] font-semibold", PRIORITY_TONE[t.priority])}>{PRIORITY_LABEL[t.priority]}</span> : null}
                      <span className="text-[0.7rem] text-muted-foreground">{CATEGORY_LABEL[t.category]}</span>
                      <span className="text-[0.7rem] text-muted-foreground">· {t.assignee ?? "Unassigned"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Ticket" className={cn("min-w-0", !openRef && "hidden lg:block")}>
          {openRef ? (
            <TicketWorkspace key={openRef} reference={openRef} onBack={() => open(null)} onChanged={queue.reload} />
          ) : (
            <div className="flex h-full min-h-[24rem] flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 px-6 text-center">
              <MessageSquareText className="size-7 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-semibold">Select a ticket</p>
              <p className="mt-1 text-sm text-muted-foreground">Its conversation, notes and history open here.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function TicketWorkspace({ reference, onBack, onChanged }: { reference: string; onBack: () => void; onChanged: () => void }) {
  const detail = useJson<{ ticket: Detail; can: { manage: boolean } }>(`/api/admin/support/${encodeURIComponent(reference)}`);
  const staff = useJson<{ staff: { staffId: string; name: string }[] }>("/api/admin/support/assignees");
  const [fresh, setFresh] = React.useState<Detail | null>(null);
  const t = fresh ?? detail.data?.ticket ?? null;
  const can = detail.data?.can.manage ?? false;
  const [mode, setMode] = React.useState<"reply" | "note">("reply");
  const [text, setText] = React.useState("");
  const [after, setAfter] = React.useState<"waiting" | "in_progress" | "resolved">("waiting");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const key = React.useRef(newKey());

  const act = async (action: string, body: object, ok: string) => {
    setBusy(action);
    setError(null);
    setDone(null);
    try {
      const r = await api<{ ticket: Detail }>(`/api/admin/support/${encodeURIComponent(reference)}/${action}`, { method: "POST", body: JSON.stringify(body) });
      setFresh(r.ticket);
      setDone(ok);
      onChanged();
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(null);
    }
  };
  const send = async () => {
    if (!text.trim() || busy) return;
    const ok = mode === "reply" ? await act("reply", { body: text, key: key.current, status: after }, "Reply sent to the customer.") : await act("note", { body: text }, "Private note added.");
    if (ok) {
      setText("");
      key.current = newKey();
    }
  };

  if (detail.error && !t)
    return (
      <div role="alert" className="rounded-2xl border bg-card p-6 text-sm">
        <p className="font-semibold">This ticket couldn&apos;t be opened</p>
        <p className="mt-1 text-muted-foreground">{detail.error}</p>
      </div>
    );
  if (!t) return <div className="h-[32rem] animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" aria-label="Loading ticket" />;

  // Conversation and private notes in one timeline, clearly told apart.
  const timeline = [...t.messages.map((m) => ({ kind: "message" as const, at: m.at, m })), ...t.notes.map((n) => ({ kind: "note" as const, at: n.at, n }))].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="flex min-w-0 flex-col rounded-2xl border bg-card">
        <div className="border-b p-4">
          <div className="flex items-start gap-2">
            <button type="button" onClick={onBack} className="-ms-1 grid size-9 shrink-0 place-items-center rounded-full hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none lg:hidden" aria-label="Back to queue">
              <ArrowLeft className="size-4" aria-hidden />
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="font-heading text-[1.15rem] leading-snug font-extrabold tracking-tight">{t.subject}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-mono">{t.reference}</span> · {CATEGORY_LABEL[t.category]} · opened {formatDateTime(t.createdAt)}
              </p>
            </div>
            <Chip status={t.status} />
          </div>
        </div>

        <ol className="max-h-[calc(100dvh-24rem)] min-h-[16rem] flex-1 space-y-3 overflow-y-auto p-4" aria-label="Conversation and notes">
          {timeline.map((item) =>
            item.kind === "message" ? (
              <li key={item.m.id} className={cn("flex", item.m.author === "staff" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[min(38rem,90%)] rounded-2xl px-4 py-3", item.m.author === "staff" ? "rounded-br-md bg-graphite text-white dark:bg-white/10" : "rounded-bl-md border bg-background dark:bg-muted/30")}>
                  <p className={cn("text-[0.72rem] font-semibold", item.m.author === "staff" ? "text-lime" : "text-primary dark:text-[#c4b5ff]")}>{item.m.authorName}</p>
                  <p className="mt-1 text-[0.9rem] leading-relaxed break-words whitespace-pre-wrap">{item.m.body}</p>
                  <p className={cn("mt-1.5 text-[0.68rem]", item.m.author === "staff" ? "text-white/60" : "text-muted-foreground")}>{formatDateTime(item.m.at)}</p>
                </div>
              </li>
            ) : (
              <li key={item.n.id} className="flex justify-center">
                <div className="w-full max-w-[38rem] rounded-xl border border-dashed border-soon/40 bg-soon-soft/60 px-4 py-2.5">
                  <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-soon">
                    <Lock className="size-3" aria-hidden /> Private note · {item.n.by}
                  </p>
                  <p className="mt-1 text-[0.88rem] leading-relaxed break-words whitespace-pre-wrap">{item.n.body}</p>
                  <p className="mt-1 text-[0.68rem] text-muted-foreground">{formatDateTime(item.n.at)}</p>
                </div>
              </li>
            ),
          )}
        </ol>

        {can ? (
          <form
            className="border-t p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {done ? (
              <p role="status" className="mb-2 rounded-xl border border-ok/30 bg-ok-soft px-3 py-2 text-sm text-ok">
                {done}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="mb-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                {error}
              </p>
            ) : null}
            <div role="radiogroup" aria-label="Write" className="mb-2 inline-flex gap-1 rounded-xl bg-muted p-1">
              {(
                [
                  ["reply", "Reply to customer", Send],
                  ["note", "Private note", StickyNote],
                ] as const
              ).map(([id, label, Icon]) => (
                <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => setMode(id)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[0.8rem] font-semibold transition-colors", mode === id ? (id === "note" ? "bg-soon-soft text-soon shadow-sm" : "bg-card text-foreground shadow-sm") : "text-muted-foreground hover:text-foreground")}>
                  <Icon className="size-3.5" aria-hidden /> {label}
                </button>
              ))}
            </div>
            <label htmlFor="as-reply" className="sr-only">
              {mode === "reply" ? "Reply to the customer" : "Private note (staff only)"}
            </label>
            <textarea
              id="as-reply"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={mode === "reply" ? 5000 : 1000}
              placeholder={mode === "reply" ? "Write a reply the customer will see…" : "Only staff can see this note."}
              className={cn(field, "py-3 leading-relaxed", mode === "note" && "border-soon/40 bg-soon-soft/30")}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              {mode === "reply" ? (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  After sending
                  <select value={after} onChange={(e) => setAfter(e.target.value as typeof after)} className={cn(field, "h-8 w-auto py-0 text-xs")}>
                    <option value="waiting">Wait for customer</option>
                    <option value="in_progress">Keep in progress</option>
                    <option value="resolved">Mark resolved</option>
                  </select>
                </label>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-soon">
                  <Lock className="size-3" aria-hidden /> Never shown to the customer
                </span>
              )}
              <button type="submit" disabled={!text.trim() || busy !== null || t.status === "closed"} className={cn(btn, mode === "reply" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-soon text-white hover:bg-soon/90 dark:text-graphite")}>
                {mode === "reply" ? <Send className="size-3.5" aria-hidden /> : <StickyNote className="size-3.5" aria-hidden />}
                {busy === "reply" || busy === "note" ? "Saving…" : mode === "reply" ? "Send reply" : "Add note"}
              </button>
            </div>
            {t.status === "closed" ? <p className="mt-2 text-xs text-muted-foreground">Reopen the ticket (change its status) to reply.</p> : null}
          </form>
        ) : (
          <p className="border-t p-4 text-sm text-muted-foreground">You can view tickets. Replying needs the Support: Manage permission.</p>
        )}
      </div>

      <aside className="space-y-4" aria-label="Ticket details">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm font-bold">Customer</p>
          <p className="mt-2 text-sm font-semibold">{t.customer.name}</p>
          <p className="text-xs break-all text-muted-foreground">{t.customer.email}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {t.customer.publicRef} · {t.customer.accountRef}
          </p>
        </div>
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <p className="text-sm font-bold">Manage</p>
          <label className="block text-xs font-semibold text-muted-foreground">
            Status
            <select disabled={!can || busy !== null} value={t.status} onChange={(e) => act("status", { status: e.target.value }, "Status updated. The customer was notified.")} className={cn(field, "mt-1 h-9")}>
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].staff}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-muted-foreground">
            Priority
            <select disabled={!can || busy !== null} value={t.priority} onChange={(e) => act("priority", { priority: e.target.value }, "Priority updated.")} className={cn(field, "mt-1 h-9")}>
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-muted-foreground">
            Assigned to
            <select disabled={!can || busy !== null} value={t.assignedStaffId ?? ""} onChange={(e) => act("assign", { staffId: e.target.value || null }, "Assignment updated.")} className={cn(field, "mt-1 h-9")}>
              <option value="">Unassigned</option>
              {(staff.data?.staff ?? []).map((s) => (
                <option key={s.staffId} value={s.staffId}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm font-bold">Related order</p>
          {t.order ? (
            <dl className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Order</dt>
                <dd className="font-mono">{t.order.reference}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Service</dt>
                <dd className="text-end">{t.order.service}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Status</dt>
                <dd>{ORDER_STATUS_META[t.order.status as OrderStatus]?.label ?? t.order.status}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="tabular-nums">{usd(t.order.totalCents / 100)}</dd>
              </div>
              <Link href={`/admin/orders?order=${encodeURIComponent(t.order.reference)}`} className="mt-2 inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                Open in Orders <ArrowUpRight className="size-3" aria-hidden />
              </Link>
            </dl>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{t.orderHidden ? "Linked to an order you don't have permission to view." : "No order linked."}</p>
          )}
        </div>
        <details className="rounded-2xl border bg-card p-4" open>
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold [&::-webkit-details-marker]:hidden">
            <History className="size-4" aria-hidden /> History
          </summary>
          <ol className="mt-2 space-y-1.5 border-s ps-3 text-xs">
            {t.events.map((e) => (
              <li key={e.id}>
                <span className="font-medium">{e.label}</span>
                <span className="block text-muted-foreground">
                  {e.by} · {formatDateTime(e.at)}
                </span>
              </li>
            ))}
          </ol>
        </details>
      </aside>
    </div>
  );
}
