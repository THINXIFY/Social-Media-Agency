"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpDown,
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock3,
  Copy,
  Check,
  FlaskConical,
  Inbox,
  Mail,
  MessagesSquare,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { formatDate } from "@/lib/demo-account";
import {
  type DemoTicket,
  isOpenTicket,
  lastActivity,
  SUPPORT_EMAIL,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_IDS,
  TICKET_STATUS_LABELS,
  type TicketCategory,
  type TicketStatus,
} from "@/lib/demo-support";
import { useDisplay } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { resetSupportDemo, useTickets } from "./demo-store";
import { NewTicketSheet, type TicketPreset } from "./new-ticket";
import { DemoTag, enter, Pagination, Panel, ROUTES } from "./shared";
import { CategoryIcon, PriorityBadge, TicketStatusBadge } from "./support-ui";
import { TicketThreadSheet } from "./ticket-thread";

/* -------------------------------------------------------------------------- */
/*  Filters                                                                   */
/* -------------------------------------------------------------------------- */

/** `open` covers every ticket that isn't resolved or closed. */
type StatusFilter = "all" | "open" | TicketStatus;
type SortOrder = "recent" | "oldest";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "awaiting", label: TICKET_STATUS_LABELS.awaiting },
  { id: "waiting", label: TICKET_STATUS_LABELS.waiting },
  { id: "resolved", label: TICKET_STATUS_LABELS.resolved },
  { id: "closed", label: TICKET_STATUS_LABELS.closed },
];

const parseStatus = (v: string | null): StatusFilter => (STATUS_FILTERS.some((f) => f.id === v) ? (v as StatusFilter) : "all");

const matchesStatus = (t: DemoTicket, f: StatusFilter) => f === "all" || (f === "open" ? isOpenTicket(t.status) : t.status === f);

function matchesSearch(t: DemoTicket, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [t.id, t.subject, t.orderId ?? "", t.txId ?? ""].some((s) => s.toLowerCase().includes(q));
}

const PAGE_SIZE = 10;

const selectClass =
  "h-11 w-full appearance-none rounded-xl border bg-card pe-9 ps-3.5 text-sm font-medium shadow-xs transition-colors outline-none hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15";

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function SupportCenter() {
  // Re-render when language, currency, time zone or date format change.
  useDisplay();
  const params = useSearchParams();
  const { tickets, summary, changes } = useTickets();
  const [status, setStatus] = React.useState<StatusFilter>(() => parseStatus(params.get("status")));
  const [category, setCategory] = React.useState<"all" | TicketCategory>("all");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortOrder>("recent");
  const [page, setPage] = React.useState(1);
  const [openId, setOpenId] = React.useState<string | null>(() => params.get("ticket"));
  const [form, setForm] = React.useState<TicketPreset | null>(() =>
    params.get("new") ? { orderId: params.get("order") ?? undefined, txId: params.get("tx") ?? undefined } : null,
  );
  const [resetDone, setResetDone] = React.useState(false);
  const lastTrigger = React.useRef<HTMLElement | null>(null);

  // Links can arrive while this page is mounted (e.g. "Contact Support" from an order), so follow param changes.
  const key = params.toString();
  const [seen, setSeen] = React.useState(key);
  if (seen !== key) {
    setSeen(key);
    if (params.get("ticket")) setOpenId(params.get("ticket"));
    if (params.get("new")) setForm({ orderId: params.get("order") ?? undefined, txId: params.get("tx") ?? undefined });
    if (params.has("status")) setStatus(parseStatus(params.get("status")));
  }

  // Keep the URL shareable. One-off ?new / ?order / ?tx links are dropped once the form has opened.
  React.useEffect(() => {
    const qs = new URLSearchParams();
    if (status !== "all") qs.set("status", status);
    if (openId) qs.set("ticket", openId);
    const next = `${ROUTES.support}${qs.size ? `?${qs}` : ""}`;
    // Only while this page is showing: closing a drawer on the way to another page mustn't pull the URL back.
    if (window.location.pathname !== ROUTES.support) return;
    if (window.location.search !== (qs.size ? `?${qs}` : "")) window.history.replaceState(null, "", next);
  }, [status, openId]);

  const scoped = tickets.filter((t) => (category === "all" || t.category === category) && matchesSearch(t, query));
  const statusCount = (f: StatusFilter) => scoped.filter((t) => matchesStatus(t, f)).length;
  const visible = scoped
    .filter((t) => matchesStatus(t, status))
    .sort((a, b) => (sort === "recent" ? lastActivity(b).localeCompare(lastActivity(a)) : lastActivity(a).localeCompare(lastActivity(b))));
  const filtered = status !== "all" || category !== "all" || query.trim() !== "" || sort !== "recent";

  // New search, filters or sort start again from page 1.
  const filterKey = [status, category, query.trim(), sort].join("|");
  const [pagedFor, setPagedFor] = React.useState(filterKey);
  if (pagedFor !== filterKey) {
    setPagedFor(filterKey);
    setPage(1);
  }
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const openTicket = tickets.find((t) => t.id === openId) ?? null;
  const missingId = openId && !openTicket ? openId : null;

  const remember = () => {
    lastTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };
  const restoreFocus = () => requestAnimationFrame(() => lastTrigger.current?.focus({ preventScroll: true }));

  const clearFilters = () => {
    setStatus("all");
    setCategory("all");
    setQuery("");
    setSort("recent");
  };

  const tiles = [
    { id: "open" as const, label: "Open Tickets", value: summary.open, hint: summary.open ? `${summary.awaiting} with us · ${summary.waiting} with you` : "Nothing open", Icon: Inbox, tone: "bg-muted text-foreground/80" },
    { id: "awaiting" as const, label: "Awaiting Reply", value: summary.awaiting, hint: "With our support team", Icon: Clock3, tone: "bg-secondary text-secondary-foreground" },
    { id: "waiting" as const, label: "Action Required", value: summary.waiting, hint: summary.waiting ? "Support needs your reply" : "Nothing needed from you", Icon: ShieldAlert, tone: "bg-soon-soft text-soon" },
    { id: "resolved" as const, label: "Resolved Tickets", value: summary.resolved, hint: summary.closed ? `${summary.closed} closed` : "All time", Icon: CircleCheck, tone: "bg-ok-soft text-ok" },
  ];

  const e = [0, 1, 2, 3].map(enter);

  return (
    <div className="mx-auto max-w-[90rem] px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <header className={cn("flex flex-wrap items-end justify-between gap-4", e[0].className)} style={e[0].style}>
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Support Center</h1>
          <p className="mt-1 max-w-xl text-[0.95rem] text-muted-foreground">
            Get help with your orders, payments, or account—all in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            remember();
            setForm({});
          }}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_10px_28px_-12px_rgb(112_71_235/0.8)] transition-all hover:-translate-y-px hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none"
        >
          <Plus className="size-4" strokeWidth={2.6} aria-hidden /> New Ticket
        </button>
      </header>

      {/* Overview */}
      <div className={cn("mt-5 grid grid-cols-2 gap-2.5 sm:mt-6 sm:gap-3 lg:grid-cols-4", e[1].className)} style={e[1].style} role="group" aria-label="Support overview">
        {tiles.map((t) => {
          const on = status === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => setStatus(on ? "all" : t.id)}
              className={cn(
                "flex items-center gap-3 rounded-2xl border bg-card p-3 text-start shadow-soft transition-all hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:p-4",
                t.id === "waiting" && summary.waiting > 0 && "border-soon/30 bg-soon-soft/30",
                on && "border-foreground/70 ring-1 ring-foreground/70 hover:border-foreground/70",
              )}
            >
              <span className={cn("hidden size-10 shrink-0 place-items-center rounded-xl sm:grid", t.tone)}>
                <t.Icon className="size-[1.1rem]" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-heading text-2xl leading-none font-extrabold tabular-nums">{t.value}</span>
                <span className="mt-1 block truncate text-[0.8rem] font-semibold">{t.label}</span>
                <span className="block text-[0.7rem] leading-snug text-muted-foreground">{t.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
        <div className="min-w-0 space-y-4">
          {/* Demo changes */}
          <div role="status" className="empty:hidden">
            {changes ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-dashed border-primary/40 bg-card px-4 py-3 text-sm">
                <FlaskConical className="size-4 shrink-0 text-primary" aria-hidden />
                <p className="min-w-0 flex-1">
                  <span className="font-semibold">{changes === 1 ? "1 ticket change" : `${changes} ticket changes`} saved in this browser.</span>{" "}
                  <span className="text-muted-foreground">Saved in demo mode — no support request was sent.</span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    resetSupportDemo();
                    setResetDone(true);
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-xs font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
                >
                  <RotateCcw className="size-3.5" aria-hidden /> Reset ticket changes
                </button>
              </div>
            ) : resetDone ? (
              <p className="flex items-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
                <RotateCcw className="size-4 shrink-0" aria-hidden /> Ticket changes reset. Showing the original demo tickets.
              </p>
            ) : null}
          </div>

          {missingId ? (
            <p role="alert" className="flex items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm">
              <MessagesSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                We couldn&apos;t find ticket <span className="font-semibold">{missingId}</span>. It may have been reset, or belong to another account.
              </span>
              <button type="button" onClick={() => setOpenId(null)} className="text-sm font-semibold text-primary hover:underline">
                Dismiss
              </button>
            </p>
          ) : null}

          {/* Tickets */}
          <Panel className={cn("overflow-hidden", e[2].className)} style={e[2].style} aria-labelledby="tickets-title">
            <h2 id="tickets-title" className="sr-only">
              Your tickets
            </h2>
            <div className="space-y-3 p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-[minmax(0,1fr)_11rem_10rem]">
                <div className="relative">
                  <label htmlFor="ticket-search" className="sr-only">
                    Search tickets
                  </label>
                  <Search className="pointer-events-none absolute top-1/2 start-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <input
                    id="ticket-search"
                    type="search"
                    value={query}
                    onChange={(ev) => setQuery(ev.target.value)}
                    placeholder="Search by ticket ID, subject or order"
                    autoComplete="off"
                    className="h-11 w-full rounded-xl border bg-card pe-10 ps-10 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="absolute top-1/2 end-2.5 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Clear search"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2.5 md:contents">
                  <div className="relative">
                    <label htmlFor="ticket-category" className="sr-only">
                      Category
                    </label>
                    <select id="ticket-category" value={category} onChange={(ev) => setCategory(ev.target.value as "all" | TicketCategory)} className={selectClass}>
                      <option value="all">All categories</option>
                      {TICKET_CATEGORY_IDS.map((c) => (
                        <option key={c} value={c}>
                          {TICKET_CATEGORIES[c].label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute top-1/2 end-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  </div>
                  <div className="relative">
                    <label htmlFor="ticket-sort" className="sr-only">
                      Sort by activity
                    </label>
                    <select id="ticket-sort" value={sort} onChange={(ev) => setSort(ev.target.value as SortOrder)} className={selectClass}>
                      <option value="recent">Recent activity</option>
                      <option value="oldest">Oldest activity</option>
                    </select>
                    <ArrowUpDown className="pointer-events-none absolute top-1/2 end-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  </div>
                </div>
              </div>

              <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:-mx-5 sm:px-5">
                <div className="inline-flex gap-1 rounded-full bg-muted p-1" role="group" aria-label="Filter by status">
                  {STATUS_FILTERS.map((f) => {
                    const on = status === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setStatus(f.id)}
                        className={cn(
                          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.8rem] font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                          on && "bg-card text-foreground shadow-sm",
                        )}
                      >
                        {f.label}
                        <span className={cn("text-[0.7rem] tabular-nums", f.id === "waiting" && statusCount("waiting") > 0 && "text-soon opacity-100")}>
                          {statusCount(f.id)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <p aria-live="polite">
                  {visible.length} ticket{visible.length === 1 ? "" : "s"}
                  {pageCount > 1 ? ` · page ${current} of ${pageCount}` : ""}
                  {summary.unread ? ` · ${summary.unread} with a new reply` : ""}
                </p>
                {filtered ? (
                  <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                    <X className="size-3.5" aria-hidden /> Clear filters
                  </button>
                ) : (
                  <DemoTag className="text-muted-foreground" />
                )}
              </div>
            </div>

            {pageRows.length ? (
              <>
                <ul className="divide-y border-t">
                  {pageRows.map((t) => (
                    <li key={t.id}>
                      <TicketRow
                        ticket={t}
                        onOpen={() => {
                          remember();
                          setOpenId(t.id);
                        }}
                      />
                    </li>
                  ))}
                </ul>
                {pageCount > 1 ? (
                  <Pagination page={current} pageCount={pageCount} total={visible.length} pageSize={PAGE_SIZE} label="Ticket pages" onPage={setPage} />
                ) : null}
              </>
            ) : (
              <EmptyState status={status} filtered={filtered} onClear={clearFilters} onNew={() => setForm({})} />
            )}
          </Panel>
        </div>

        <aside className={cn("space-y-4", e[3].className)} style={e[3].style} aria-label="Help and contact">
          <ContactCard />
          <Panel className="p-5">
            <h2 className="text-sm font-bold">For a faster answer</h2>
            <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
              {["Link the order or transaction it's about.", "Say what you expected and what happened instead.", "Never share passwords, sign-in codes or card details."].map((tip) => (
                <li key={tip} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {tip}
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>

      <TicketThreadSheet
        ticket={openTicket}
        onClose={() => {
          setOpenId(null);
          restoreFocus();
        }}
      />
      <NewTicketSheet
        open={form !== null}
        preset={form ?? {}}
        onClose={() => {
          setForm(null);
          restoreFocus();
        }}
        onView={(id) => {
          setForm(null);
          setStatus("all");
          setOpenId(id);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Rows & states                                                             */
/* -------------------------------------------------------------------------- */

function TicketRow({ ticket: t, onOpen }: { ticket: DemoTicket; onOpen: () => void }) {
  const ref = t.orderId ?? t.txId;
  const last = lastActivity(t);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${t.id}: ${t.subject}. ${TICKET_STATUS_LABELS[t.status]}${t.unread ? ", new reply" : ""}${t.priority === "urgent" ? ", urgent" : ""}`}
      className={cn(
        "group relative flex w-full items-start gap-3 px-4 py-4 text-start transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none sm:items-center sm:px-5",
        t.status === "waiting" && "bg-soon-soft/20",
      )}
    >
      {t.status === "waiting" ? <span className="absolute inset-y-3 start-0 w-[3px] rounded-e-full bg-soon" aria-hidden /> : null}
      <span className="relative">
        <CategoryIcon category={t.category} />
        {t.unread ? <span className="absolute -top-0.5 -end-0.5 size-3 rounded-full bg-primary ring-2 ring-card" aria-hidden /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn("line-clamp-2 text-[0.95rem] sm:line-clamp-1", t.unread ? "font-bold" : "font-semibold")}>{t.subject}</span>
          <PriorityBadge priority={t.priority} />
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          <span className="font-mono text-[0.7rem]">{t.id}</span>
          <span aria-hidden>·</span>
          <span>{TICKET_CATEGORIES[t.category].label}</span>
          {ref ? (
            <>
              <span aria-hidden>·</span>
              <span className="rounded-md bg-muted px-1.5 font-mono text-[0.68rem] text-foreground/70">{ref}</span>
            </>
          ) : null}
          {t.unread ? <span className="font-semibold text-primary">· New reply</span> : null}
        </span>
        <span className="mt-2 flex items-center justify-between gap-2 sm:hidden">
          <TicketStatusBadge status={t.status} />
          <span className="text-xs text-muted-foreground">{formatDate(last)}</span>
        </span>
      </span>
      <span className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
        <TicketStatusBadge status={t.status} />
        <span className="text-xs text-muted-foreground">Updated {formatDate(last)}</span>
      </span>
      <ChevronRight className="mt-1 hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary sm:mt-0 sm:block" aria-hidden />
    </button>
  );
}

function EmptyState({ status, filtered, onClear, onNew }: { status: StatusFilter; filtered: boolean; onClear: () => void; onNew: () => void }) {
  const nothingWaiting = status === "waiting";
  return (
    <div className="border-t px-6 py-14 text-center">
      <span className={cn("mx-auto grid size-12 place-items-center rounded-2xl", nothingWaiting ? "bg-ok-soft text-ok" : "bg-muted text-muted-foreground")}>
        {nothingWaiting ? <CircleCheck className="size-5" aria-hidden /> : <MessagesSquare className="size-5" aria-hidden />}
      </span>
      <p className="mt-3 font-semibold">{nothingWaiting ? "Nothing needs your reply" : filtered ? "No tickets match" : "No tickets yet"}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {nothingWaiting ? "Support isn't waiting on you for anything right now." : filtered ? "Try another search or clear the filters." : "Create a ticket whenever you need a hand."}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        {filtered ? (
          <button type="button" onClick={onClear} className="inline-flex h-10 items-center rounded-full border px-4 text-sm font-semibold hover:bg-muted">
            Clear filters
          </button>
        ) : null}
        <button
          type="button"
          onClick={onNew}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" aria-hidden /> New Ticket
        </button>
      </div>
    </div>
  );
}

function ContactCard() {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section
      aria-labelledby="contact-title"
      className="relative isolate overflow-hidden rounded-3xl bg-graphite p-5 text-white shadow-float dark:bg-[#17181e] dark:ring-1 dark:ring-white/10"
    >
      <div className="pointer-events-none absolute -top-20 -end-16 -z-10 size-48 rounded-full bg-primary/35 blur-3xl" aria-hidden />
      <span className="grid size-10 place-items-center rounded-xl bg-white/10">
        <Mail className="size-[1.1rem] text-lime" aria-hidden />
      </span>
      <h2 id="contact-title" className="mt-4 font-heading text-lg font-bold">
        Need another way to reach us?
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-white/70">Contact our support team for questions about orders, payments, and your account.</p>
      <div className="mt-4 flex items-center gap-2">
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-lime px-4 text-sm font-semibold text-graphite transition-colors hover:bg-lime/90 focus-visible:ring-3 focus-visible:ring-lime/50 focus-visible:outline-none"
        >
          <Mail className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{SUPPORT_EMAIL}</span>
        </a>
        <button
          type="button"
          onClick={copy}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-white/30 focus-visible:outline-none"
          aria-label={copied ? "Email address copied" : "Copy email address"}
        >
          {copied ? <Check className="size-4 text-lime" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        </button>
      </div>
      <Link
        href="/#faq"
        className="mt-3 inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-white/80 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
      >
        <BookOpen className="size-4" aria-hidden /> Read the FAQ
        <ChevronRight className="size-3.5" aria-hidden />
      </Link>
    </section>
  );
}
