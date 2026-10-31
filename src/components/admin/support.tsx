"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  CircleAlert,
  Ellipsis,
  Eye,
  History,
  Inbox,
  Lock,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  Search,
  SearchX,
  Send,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { ConfirmDialog } from "@/components/dashboard/account-ui";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ADMIN_DEPOSITS, ADMIN_ORDER_STATUS, ADMIN_TICKETS, ago, CUSTOMER_BY_ID, dateTime, orderService, shortDate, usd } from "@/lib/admin-demo";
import { factsOf, initialsOf } from "@/lib/admin-customers";
import { blockersOf, looksSensitive } from "@/lib/admin-orders";
import { type ServiceRecord, useServiceRecords } from "@/lib/admin-services";
import {
  addSupportNote,
  CATEGORY_LABEL,
  clearSupportNotes,
  customerName,
  nextActionOf,
  STATUS_META,
  type SupportNote,
  TICKET_BY_ID,
  type TicketCategory,
  type TicketStatus,
  type TicketView,
  useSupportNotes,
  viewOf,
} from "@/lib/admin-support";
import { cn } from "@/lib/utils";
import { SelectInput, TextArea } from "./form";
import { AdminDemoTag, linkButton } from "./ui";
import { popupSurface, menuPopup, menuItem as sharedMenuItem, menuSeparator, menuLabel } from "./menu";

/* -------------------------------------------------------------------------- */
/*  Filters (URL)                                                             */
/* -------------------------------------------------------------------------- */

type DateFilter = "" | "1" | "7" | "30";
type Sort = "attention" | "newest" | "oldest";
interface Filters {
  q: string;
  status: "" | TicketStatus;
  priority: "" | "high" | "normal" | "low" | "not_set";
  category: "" | TicketCategory;
  assignment: "" | "assigned" | "unassigned";
  date: DateFilter;
  sort: Sort;
  page: number;
}
const DEFAULTS: Filters = { q: "", status: "", priority: "", category: "", assignment: "", date: "", sort: "attention", page: 1 };
const PAGE_SIZE = 20;
const STATUSES = Object.keys(STATUS_META) as TicketStatus[];
const PRIORITY_LABEL = { high: "High", normal: "Normal", low: "Low", not_set: "Priority not set" } as const;
const DATE_LABEL: Record<Exclude<DateFilter, "">, string> = { "1": "Opened in 24 hours", "7": "Opened in 7 days", "30": "Opened in 30 days" };
const SORT_LABEL: Record<Sort, string> = { attention: "Needs attention first", newest: "Newest first", oldest: "Oldest first" };
const NOW = Date.parse("2026-10-28T09:30:00Z");

function parseFilters(p: URLSearchParams): Filters {
  const pick = <T extends string>(k: string, allowed: readonly T[], d: T) => {
    const v = p.get(k) as T | null;
    return v && allowed.includes(v) ? v : d;
  };
  return {
    q: (p.get("q") ?? "").slice(0, 80),
    status: pick("status", STATUSES, "" as const),
    priority: pick("priority", ["high", "normal", "low", "not_set"] as const, ""),
    category: pick("category", ["order", "payment", "general"] as const, ""),
    assignment: pick("assignment", ["assigned", "unassigned"] as const, ""),
    date: pick("date", ["1", "7", "30"] as const, ""),
    sort: pick("sort", ["attention", "newest", "oldest"] as const, "attention"),
    page: Math.max(1, Number(p.get("page")) || 1),
  };
}

function toQuery(f: Filters, ticket: string | null) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== DEFAULTS[k as keyof Filters]) q.set(k, String(v));
  if (ticket) q.set("ticket", ticket);
  return q.toString();
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function AdminSupport() {
  const params = useSearchParams();
  const pathname = usePathname();
  const notes = useSupportNotes();
  const records = useServiceRecords();
  const recordById = React.useMemo(() => Object.fromEntries(records.map((r) => [r.id, r])), [records]);

  const [f, setF] = React.useState<Filters>(() => parseFilters(params));
  const ticketParam = params.get("ticket");
  const openId = ticketParam && TICKET_BY_ID[ticketParam] ? ticketParam : null;
  const unknown = Boolean(ticketParam && !openId);
  const pushed = React.useRef(false);
  const written = React.useRef(toQuery(f, null));
  // Desktop context column; on smaller screens the same content opens in a sheet.
  const [contextOpen, setContextOpen] = React.useState(true);
  const [contextSheet, setContextSheet] = React.useState(false);

  const urlKey = toQuery(parseFilters(params), null);
  React.useEffect(() => {
    if (urlKey !== written.current) {
      written.current = urlKey;
      setF(parseFilters(new URLSearchParams(urlKey)));
    }
  }, [urlKey]);

  React.useEffect(() => {
    if (pathname !== "/admin/support") return;
    written.current = toQuery(f, null);
    // Keep an unknown ticket in the URL so the "not found" message stays until dismissed.
    const qs = toQuery(f, new URLSearchParams(location.search).get("ticket"));
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (`${location.pathname}${location.search}` !== url) window.history.replaceState(null, "", url);
  }, [f, pathname]);

  const open = (id: string) => {
    if (id === openId) return;
    window.history.pushState(null, "", `${pathname}?${toQuery(f, id)}`);
    pushed.current = true;
  };
  const close = () => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      const qs = toQuery(f, null);
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    }
  };
  const update = (patch: Partial<Filters>) => setF((cur) => ({ ...cur, ...patch, page: patch.page ?? 1 }));

  const views = ADMIN_TICKETS.map((t) => viewOf(t, notes[t.id]));
  const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = views
    .filter((v) => {
      if (f.status && v.status !== f.status) return false;
      // Priority and assignment aren't recorded on any ticket yet.
      if (f.priority && f.priority !== "not_set") return false;
      if (f.assignment === "assigned") return false;
      if (f.category && v.category !== f.category) return false;
      if (f.date && Date.parse(v.t.openedAt) < NOW - Number(f.date) * 86_400_000) return false;
      if (!terms.length) return true;
      const c = CUSTOMER_BY_ID[v.t.customerId];
      const hay = [v.t.id, v.t.subject, c?.name, c?.id, c?.email, v.t.orderId ?? ""].join(" ").toLowerCase();
      return terms.every((w) => hay.includes(w));
    })
    .sort((a, b) =>
      f.sort === "oldest"
        ? a.t.openedAt.localeCompare(b.t.openedAt)
        : f.sort === "newest"
          ? b.t.openedAt.localeCompare(a.t.openedAt)
          : Number(b.status === "awaiting_staff") - Number(a.status === "awaiting_staff") || a.t.openedAt.localeCompare(b.t.openedAt),
    );
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const rows = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const count = (s: TicketStatus) => views.filter((v) => v.status === s).length;
  const longest = Math.max(0, ...views.filter((v) => v.status === "awaiting_staff").map((v) => v.waitedHours));
  const tiles: { status: Filters["status"]; label: string; value: number; hint: string; hot?: boolean }[] = [
    { status: "", label: "All tickets", value: views.length, hint: "On record" },
    { status: "awaiting_staff", label: "Awaiting staff", value: count("awaiting_staff"), hint: longest ? `Longest wait ${longest} h` : "None waiting", hot: count("awaiting_staff") > 0 },
    { status: "awaiting_customer", label: "Awaiting customer", value: count("awaiting_customer"), hint: "Recorded as awaiting customer" },
    { status: "resolved", label: "Resolved", value: count("resolved"), hint: "Recorded as resolved" },
  ];

  const chips: { key: string; label: string; clear: Partial<Filters> }[] = [];
  if (f.status) chips.push({ key: "status", label: STATUS_META[f.status].label, clear: { status: "" } });
  if (f.priority) chips.push({ key: "priority", label: PRIORITY_LABEL[f.priority], clear: { priority: "" } });
  if (f.category) chips.push({ key: "category", label: CATEGORY_LABEL[f.category], clear: { category: "" } });
  if (f.assignment) chips.push({ key: "assignment", label: f.assignment === "assigned" ? "Assigned" : "Not assigned", clear: { assignment: "" } });
  if (f.date) chips.push({ key: "date", label: DATE_LABEL[f.date], clear: { date: "" } });
  if (f.sort !== DEFAULTS.sort) chips.push({ key: "sort", label: `Sort: ${SORT_LABEL[f.sort]}`, clear: { sort: DEFAULTS.sort } });

  const noteCount = Object.values(notes).reduce((n, l) => n + l.length, 0);
  const [clearAsk, setClearAsk] = React.useState(false);
  const current = openId ? views.find((v) => v.t.id === openId)! : null;
  const threePanel = Boolean(current && contextOpen);

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* On phones an open ticket takes over the page; Back returns to the inbox. */}
      <div className={cn(current && "max-md:hidden")}>
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[0.8rem] font-medium text-muted-foreground">
              Operations <AdminDemoTag>Admin demo</AdminDemoTag>
            </p>
            <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Support Center</h1>
            <p className="mt-1 max-w-xl text-[0.95rem] text-muted-foreground">Manage customer conversations, resolve issues and keep every request organized.</p>
          </div>
          {noteCount ? (
            <button type="button" onClick={() => setClearAsk(true)} className={cn(linkButton, "text-muted-foreground hover:text-foreground")}>
              <Trash2 className="size-3.5" aria-hidden /> Clear demo notes ({noteCount})
            </button>
          ) : null}
        </header>

        <div className="mt-6 overflow-hidden rounded-2xl border bg-card">
          <div role="group" aria-label="Filter by status" className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
            {tiles.map((t) => (
              <button
                key={t.label}
                type="button"
                aria-pressed={f.status === t.status}
                onClick={() => update({ status: t.status })}
                className={cn(
                  "flex flex-col items-start gap-1 bg-card px-4 py-3.5 text-start transition-colors hover:bg-muted/50 focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:px-5",
                  f.status === t.status && "bg-secondary/50 shadow-[inset_0_-2px_0_var(--primary)] dark:bg-secondary/25",
                )}
              >
                <span className={cn("flex items-center gap-1.5 text-[0.8rem] font-medium text-muted-foreground", t.hot && "font-semibold text-soon")}>
                  {t.hot ? <span className="size-1.5 rounded-full bg-soon" aria-hidden /> : null}
                  {t.label}
                </span>
                <span className="font-heading text-[1.6rem] leading-none font-extrabold tabular-nums">{t.value}</span>
                <span className="text-xs text-muted-foreground">{t.hint}</span>
              </button>
            ))}
          </div>
          {count("unrecorded") ? (
            <p className="border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
              {count("unrecorded")} ticket{count("unrecorded") === 1 ? " isn't" : "s aren't"} awaiting staff, but whether {count("unrecorded") === 1 ? "it's" : "they're"} awaiting the customer, resolved or closed wasn&apos;t recorded.{" "}
              <button type="button" onClick={() => update({ status: "unrecorded" })} className="font-semibold text-primary hover:underline">
                Show
              </button>
            </p>
          ) : null}
        </div>
      </div>

      {unknown ? (
        <p role="alert" className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/[0.04] px-4 py-2.5 text-sm">
          <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden /> Ticket “{ticketParam}” wasn&apos;t found. It may have been mistyped.
          <button type="button" onClick={close} className="ms-auto font-semibold text-primary hover:underline">
            Dismiss
          </button>
        </p>
      ) : null}

      {/* Workspace: inbox · conversation · context. Flexible shares with minimums, so nothing overflows. */}
      <div
        className={cn(
          "mt-6 overflow-hidden rounded-2xl border bg-card md:grid md:h-[min(52rem,calc(100dvh-8rem))] md:min-h-[34rem] md:grid-cols-[minmax(15rem,36fr)_minmax(0,64fr)]",
          threePanel ? "xl:grid-cols-[minmax(16rem,28fr)_minmax(22rem,47fr)_minmax(15rem,25fr)]" : "xl:grid-cols-[minmax(16rem,28fr)_minmax(0,72fr)]",
          current && "max-md:mt-0",
        )}
      >
        <section aria-labelledby="inbox-title" className={cn("flex min-h-0 flex-col md:border-e", current && "max-md:hidden")}>
          <h2 id="inbox-title" className="sr-only">
            Ticket inbox
          </h2>
          <div className="space-y-2 border-b p-3">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <label htmlFor="sup-search" className="sr-only">
                  Search tickets
                </label>
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  id="sup-search"
                  type="search"
                  value={f.q}
                  onChange={(e) => update({ q: e.target.value })}
                  placeholder="Search tickets"
                  title="Ticket ID, subject, customer or order"
                  autoComplete="off"
                  className="h-10 w-full rounded-xl border bg-background ps-9 pe-9 text-sm transition-colors outline-none hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 dark:bg-muted/30 [&::-webkit-search-cancel-button]:hidden"
                />
                {f.q ? (
                  <button type="button" onClick={() => update({ q: "" })} aria-label="Clear search" className="absolute end-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                    <X className="size-4" aria-hidden />
                  </button>
                ) : null}
              </div>
              <MoreFilters f={f} update={update} />
            </div>
            <div>
              <label htmlFor="sup-status" className="sr-only">
                Status
              </label>
              <SelectInput id="sup-status" value={f.status} onChange={(e) => update({ status: e.target.value as Filters["status"] })} className={cn("h-9 text-[0.85rem]", f.status && "border-primary/50 bg-secondary/40 dark:bg-secondary/20")}>
                <option value="">Any status</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </SelectInput>
            </div>
            <div className="flex min-h-6 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <p aria-live="polite" className="me-1 font-medium">
                {matches.length} ticket{matches.length === 1 ? "" : "s"}
              </p>
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => update(c.clear)}
                  aria-label={`Remove filter: ${c.label}`}
                  className="inline-flex h-7 items-center gap-1 rounded-full border bg-card ps-2.5 pe-1.5 font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                >
                  {c.label}
                  <X className="size-3.5 opacity-60" aria-hidden />
                </button>
              ))}
              {chips.length || f.q ? (
                <button type="button" onClick={() => update({ ...DEFAULTS })} className="font-semibold text-primary hover:underline">
                  Clear all
                </button>
              ) : null}
            </div>
          </div>

          {rows.length ? (
            <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Tickets">
              {rows.map((v) => (
                <InboxRow key={v.t.id} v={v} selected={v.t.id === openId} onOpen={() => open(v.t.id)} />
              ))}
            </ul>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-14 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <SearchX className="size-6" aria-hidden />
              </span>
              <p className="mt-4 font-semibold">No tickets match</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                {f.priority && f.priority !== "not_set" ? "No ticket has a priority recorded yet." : f.assignment === "assigned" ? "No ticket has an assignment recorded yet." : "Try a different search or clear the filters."}
              </p>
              <button type="button" onClick={() => update({ ...DEFAULTS })} className={cn(linkButton, "mt-3 border bg-card")}>
                Clear all
              </button>
            </div>
          )}
          {pages > 1 ? (
            <nav aria-label="Pagination" className="flex items-center justify-between border-t px-3.5 py-2.5 text-xs text-muted-foreground">
              <button type="button" disabled={page === 1} onClick={() => update({ page: page - 1 })} className="font-semibold text-primary disabled:opacity-40">
                Previous
              </button>
              <span aria-current="page">
                {page} / {pages}
              </span>
              <button type="button" disabled={page === pages} onClick={() => update({ page: page + 1 })} className="font-semibold text-primary disabled:opacity-40">
                Next
              </button>
            </nav>
          ) : null}
        </section>

        {current ? (
          <Conversation
            key={current.t.id}
            v={current}
            notes={notes[current.t.id] ?? []}
            onBack={close}
            contextOpen={contextOpen}
            onShowContext={() => setContextOpen(true)}
            onOpenSheet={() => setContextSheet(true)}
          />
        ) : (
          <div className="hidden min-h-0 flex-col items-center justify-center px-6 text-center md:flex">
            <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <Inbox className="size-6" aria-hidden />
            </span>
            <p className="mt-4 font-semibold">Select a ticket</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">The conversation, the customer and any related order or payment appear here together.</p>
          </div>
        )}

        {threePanel && current ? (
          <aside aria-label="Ticket details" className="hidden min-h-0 flex-col border-s bg-muted/20 xl:flex">
            <div className="flex h-14 shrink-0 items-center justify-between border-b ps-5 pe-2">
              <p className="text-sm font-bold">Details</p>
              <button
                type="button"
                onClick={() => setContextOpen(false)}
                aria-label="Hide details"
                title="Hide details"
                className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
              >
                <PanelRightClose className="size-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Context v={current} records={recordById} />
            </div>
          </aside>
        ) : null}
      </div>

      {current ? (
        <Sheet open={contextSheet} onOpenChange={setContextSheet}>
          <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-sm xl:hidden">
            <div className="border-b px-5 py-4 pe-14">
              <SheetTitle className="font-heading text-base font-bold">Ticket details</SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                {current.t.id} · {customerName(current.t)}
              </SheetDescription>
            </div>
            <Context v={current} records={recordById} />
          </SheetContent>
        </Sheet>
      ) : null}

      <ConfirmDialog
        open={clearAsk}
        onOpenChange={setClearAsk}
        title="Clear demo notes?"
        description="Removes every internal support note added in this browser. Tickets don't change."
        confirmLabel="Clear notes"
        tone="danger"
        icon={Trash2}
        onConfirm={clearSupportNotes}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inbox                                                                     */
/* -------------------------------------------------------------------------- */

function Avatar({ name, size = "md" }: { name: string; size?: "md" | "sm" }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full bg-secondary font-heading font-bold text-secondary-foreground", size === "sm" ? "size-8 text-[0.7rem]" : "size-9 text-[0.78rem]")} aria-hidden>
      {initialsOf(name)}
    </span>
  );
}

function StatusDot({ status, className }: { status: TicketStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap", status === "awaiting_staff" ? "text-soon" : "text-muted-foreground", className)} title={STATUS_META[status].explain}>
      <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_META[status].dot)} aria-hidden />
      {STATUS_META[status].label}
    </span>
  );
}

/** Subject first, then who, then status, then the one reference that matters. */
function InboxRow({ v, selected, onOpen }: { v: TicketView; selected: boolean; onOpen: () => void }) {
  const waiting = v.status === "awaiting_staff";
  const ref = v.order ? v.order.id : v.category === "payment" ? "Payment" : null;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? "true" : undefined}
        aria-label={`${v.t.id}: ${v.t.subject}, ${customerName(v.t)}${waiting ? ", awaiting staff" : ""}`}
        className={cn(
          "group relative w-full rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none",
          selected && "bg-secondary/60 hover:bg-secondary/70 dark:bg-secondary/25 dark:hover:bg-secondary/30",
        )}
      >
        {selected ? <span className="absolute inset-y-2.5 start-0 w-[3px] rounded-full bg-primary" aria-hidden /> : null}
        <span className="flex items-baseline gap-2">
          {waiting ? <span className="size-2 shrink-0 translate-y-[-1px] rounded-full bg-soon" aria-hidden /> : null}
          <span className={cn("line-clamp-2 min-w-0 flex-1 text-[0.9rem] leading-snug", waiting ? "font-semibold" : "font-medium text-foreground/85")}>{v.t.subject}</span>
          <span className="shrink-0 text-[0.72rem] text-muted-foreground tabular-nums">{ago(v.lastActivity)}</span>
        </span>
        <span className={cn("mt-1 flex min-w-0 items-center gap-1.5 text-[0.8rem] text-muted-foreground", waiting && "ps-4")}>
          <span className="truncate">{customerName(v.t)}</span>
          {ref ? (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0 font-mono text-[0.72rem]">{ref}</span>
            </>
          ) : null}
        </span>
        <span className={cn("mt-1 flex items-center gap-2", waiting && "ps-4")}>
          <StatusDot status={v.status} />
          <span className="font-mono text-[0.68rem] text-muted-foreground/80">{v.t.id}</span>
        </span>
      </button>
    </li>
  );
}

const popupClass = popupSurface;

function MoreFilters({ f, update }: { f: Filters; update: (patch: Partial<Filters>) => void }) {
  const count = [f.priority, f.category, f.assignment, f.date, f.sort !== DEFAULTS.sort ? "sort" : ""].filter(Boolean).length;
  const sel = (id: string, label: string, value: string, onChange: (v: string) => void, children: React.ReactNode, help?: string) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      <SelectInput id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </SelectInput>
      {help ? <p className="text-[0.7rem] text-muted-foreground">{help}</p> : null}
    </div>
  );
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`More filters${count ? `, ${count} active` : ""}`}
        title="Filters and sort"
        className={cn(
          "relative grid size-10 shrink-0 place-items-center rounded-xl border bg-background transition-colors hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-primary/15 focus-visible:outline-none data-popup-open:border-primary/50 dark:bg-muted/30",
          count && "border-primary/50 bg-secondary/40 dark:bg-secondary/20",
        )}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        {count ? <span className="absolute -end-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.68rem] font-bold text-primary-foreground tabular-nums">{count}</span> : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <Popover.Popup className={cn(popupClass, "w-[min(20rem,calc(100vw-1.5rem))] space-y-3 p-4")}>
            <Popover.Title className="text-sm font-bold">Filter tickets</Popover.Title>
            {sel(
              "sup-priority",
              "Priority",
              f.priority,
              (v) => update({ priority: v as Filters["priority"] }),
              <>
                <option value="">Any priority</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
                <option value="not_set">Not set</option>
              </>,
              "No ticket has a priority recorded yet.",
            )}
            {sel(
              "sup-category",
              "Category",
              f.category,
              (v) => update({ category: v as Filters["category"] }),
              <>
                <option value="">Any category</option>
                {(Object.keys(CATEGORY_LABEL) as TicketCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </>,
              "Derived from the linked order or the subject.",
            )}
            {sel(
              "sup-assignment",
              "Assignment",
              f.assignment,
              (v) => update({ assignment: v as Filters["assignment"] }),
              <>
                <option value="">Anyone</option>
                <option value="assigned">Assigned</option>
                <option value="unassigned">Not assigned</option>
              </>,
            )}
            {sel(
              "sup-date",
              "Opened",
              f.date,
              (v) => update({ date: v as DateFilter }),
              <>
                <option value="">Any date</option>
                {(Object.keys(DATE_LABEL) as Exclude<DateFilter, "">[]).map((d) => (
                  <option key={d} value={d}>
                    {DATE_LABEL[d]}
                  </option>
                ))}
              </>,
            )}
            <div className="relative">
              {sel(
                "sup-sort",
                "Sort",
                f.sort,
                (v) => update({ sort: v as Sort }),
                (Object.keys(SORT_LABEL) as Sort[]).map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABEL[s]}
                  </option>
                )),
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* -------------------------------------------------------------------------- */
/*  Conversation                                                              */
/* -------------------------------------------------------------------------- */

const DEMO: Record<string, string> = {
  "Assign ticket": "Assigning needs staff accounts on a secure backend. The ticket stays not assigned.",
  "Change status": "Status changes need a backend so they reach the customer and the audit log. The status hasn't changed.",
  "Set priority": "Priorities need a backend to store and enforce them. No priority was set.",
  "Close ticket": "Closing needs a backend and would notify the customer. The ticket is unchanged and no one was notified.",
  "Reply preview": "Replies need a secure backend with email delivery. Nothing was sent, and the customer wasn't notified. Your draft is still in the composer.",
};

const menuItem = sharedMenuItem;

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date(NOW);
  const diff = Math.round((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) / 86_400_000);
  return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : shortDate(iso);
}

function Conversation({
  v,
  notes,
  onBack,
  contextOpen,
  onShowContext,
  onOpenSheet,
}: {
  v: TicketView;
  notes: SupportNote[];
  onBack: () => void;
  contextOpen: boolean;
  onShowContext: () => void;
  onOpenSheet: () => void;
}) {
  const customer = CUSTOMER_BY_ID[v.t.customerId];
  const next = nextActionOf(v);
  const [info, setInfo] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<"reply" | "note">("note");
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const area = React.useRef<HTMLTextAreaElement>(null);
  const scroller = React.useRef<HTMLDivElement>(null);
  const LIMIT = 1000;

  // Messages: the opening (only its subject was recorded) and staff notes, grouped by day.
  const items = [
    { id: "opened", at: v.t.openedAt, kind: "customer" as const, text: v.t.subject },
    ...notes.map((n) => ({ id: n.id, at: n.at, kind: "note" as const, text: n.text })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const groups: { day: string; items: typeof items }[] = [];
  for (const it of items) {
    const day = dayLabel(it.at);
    if (groups.at(-1)?.day === day) groups.at(-1)!.items.push(it);
    else groups.push({ day, items: [it] });
  }

  React.useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [notes.length]);

  const submit = () => {
    const value = text.trim();
    if (value.length < 2) return setError(mode === "note" ? "Write a short note first." : "Write a reply first.");
    if (looksSensitive(value)) return setError("Don't include passwords, keys, card numbers or other credentials.");
    if (mode === "reply") {
      setError(null);
      setInfo("Reply preview");
      return;
    }
    addSupportNote(v.t.id, value);
    setText("");
    setError(null);
    setSaved(true);
  };
  const startNote = () => {
    setMode("note");
    requestAnimationFrame(() => area.current?.focus());
  };

  const iconBtn = "grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";

  return (
    <section aria-labelledby="conv-title" className="flex min-h-0 min-w-0 flex-col max-md:min-h-[calc(100dvh-9rem)]">
      {/* Header: what, who, status — and the one next step */}
      <div className="border-b px-4 py-3 sm:px-5">
        <div className="flex items-start gap-2">
          <button type="button" onClick={onBack} aria-label="Back to inbox" className={cn(iconBtn, "-ms-2 md:hidden")}>
            <ArrowLeft className="size-5 rtl:rotate-180" aria-hidden />
          </button>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id="conv-title" className="font-heading text-[1.1rem] leading-snug font-bold">
              {v.t.subject}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8rem] text-muted-foreground">
              <Link href={`/admin/customers?customer=${v.t.customerId}`} className="font-medium text-foreground hover:text-primary hover:underline">
                {customer?.name}
              </Link>
              <span className="font-mono text-xs">{v.t.id}</span>
              <StatusDot status={v.status} />
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Menu.Root>
              <Menu.Trigger aria-label="More actions" title="More actions" className={cn(iconBtn, "data-popup-open:bg-muted")}>
                <Ellipsis className="size-5" aria-hidden />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={12} className="z-50">
                  <Menu.Popup className={cn(menuPopup, "w-60")}>
                    <Menu.Item onClick={startNote} className={menuItem}>
                      <MessageSquareText className="size-3.5 text-muted-foreground" aria-hidden /> Add internal note
                    </Menu.Item>
                    <Menu.LinkItem render={<Link href={`/admin/customers?customer=${v.t.customerId}`} />} className={menuItem}>
                      <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden /> View customer profile
                    </Menu.LinkItem>
                    {v.order ? (
                      <Menu.LinkItem render={<Link href={`/admin/orders?order=${v.order.id}`} />} className={menuItem}>
                        <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden /> View related order
                      </Menu.LinkItem>
                    ) : null}
                    <Menu.Separator className={menuSeparator} />
                    <p className={menuLabel}>Needs backend · demo only</p>
                    {["Assign ticket", "Change status", "Set priority", "Close ticket"].map((a) => (
                      <Menu.Item key={a} onClick={() => setInfo(a)} className={cn(menuItem, "text-muted-foreground")}>
                        <Lock className="size-3.5" aria-hidden /> {a}
                      </Menu.Item>
                    ))}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
            {/* Restore control for the desktop context column, or the details sheet elsewhere */}
            {!contextOpen ? (
              <button type="button" onClick={onShowContext} aria-label="Show details" className="hidden h-9 items-center gap-1.5 rounded-full border px-3 text-[0.82rem] font-semibold hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none xl:inline-flex">
                <PanelRightOpen className="size-4" aria-hidden /> Details
              </button>
            ) : null}
            <button type="button" onClick={onOpenSheet} aria-label="Details" title="Ticket details" className="inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-[0.82rem] font-semibold hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none xl:hidden">
              <PanelRightOpen className="size-4" aria-hidden /> <span className="max-lg:sr-only">Details</span>
            </button>
          </div>
        </div>
        {next ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="flex min-w-0 flex-1 basis-56 items-start gap-2 text-[0.85rem]">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-soon" aria-hidden />
              <span>
                <span className="font-semibold text-soon">Needs a reply.</span> <span className="text-muted-foreground">{next.explain}</span>
              </span>
            </p>
            {next.href ? (
              <Link href={next.href} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[0.82rem] font-semibold whitespace-nowrap text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none">
                {next.label} <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            ) : null}
          </div>
        ) : (
          <p className="mt-2.5 text-[0.85rem] text-muted-foreground">{STATUS_META[v.status].explain}</p>
        )}
      </div>

      {/* Messages */}
      <div ref={scroller} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6" role="log" aria-label="Conversation" tabIndex={0}>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <History className="size-3.5" aria-hidden /> Earlier history isn&apos;t on record. Only the ticket subject and time were kept.
        </p>
        {groups.map((g) => (
          <div key={g.day} className="space-y-4">
            <p className="flex items-center gap-3 text-[0.68rem] font-semibold tracking-wider text-muted-foreground uppercase">
              <span className="h-px flex-1 bg-border" aria-hidden />
              {g.day}
              <span className="h-px flex-1 bg-border" aria-hidden />
            </p>
            {g.items.map((m) =>
              m.kind === "customer" ? (
                <article key={m.id} className="flex gap-3">
                  <Avatar name={customer?.name ?? "?"} size="sm" />
                  <div className="min-w-0 max-w-[min(36rem,88%)]">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{customer?.name}</span> · Customer · <time dateTime={m.at}>{dateTime(m.at)}</time>
                    </p>
                    <div className="mt-1.5 rounded-2xl rounded-ss-md bg-muted/60 px-4 py-3 text-[0.92rem] leading-relaxed dark:bg-muted/40">
                      <p className="font-medium">{m.text}</p>
                      <p className="mt-1.5 text-xs text-muted-foreground italic">Message body not recorded. Only the subject is on file.</p>
                    </div>
                  </div>
                </article>
              ) : (
                <article key={m.id} className="flex justify-end">
                  <div className="min-w-0 max-w-[min(36rem,88%)]">
                    <p className="flex flex-wrap items-center justify-end gap-x-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 font-semibold text-primary">
                        <Eye className="size-3" aria-hidden /> Internal note · staff only
                      </span>
                      <AdminDemoTag>Demo</AdminDemoTag>
                      <time dateTime={m.at}>{dateTime(m.at)}</time>
                    </p>
                    <div className="mt-1.5 rounded-2xl rounded-se-md border border-dashed border-primary/35 bg-secondary/30 px-4 py-3 text-[0.92rem] leading-relaxed break-words dark:bg-secondary/15">{m.text}</div>
                  </div>
                </article>
              ),
            )}
          </div>
        ))}
        <p className="text-center text-xs text-muted-foreground">No staff replies are on record for this ticket.</p>
      </div>

      {/* Composer — sticky, and unmistakable about who will see it */}
      <div className={cn("sticky bottom-0 border-t px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-sm sm:px-5", mode === "note" ? "bg-secondary/40 dark:bg-secondary/15" : "bg-card/95")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="radiogroup" aria-label="Composer mode" className="inline-flex gap-1 rounded-xl bg-muted p-1">
            {(["reply", "note"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setSaved(false);
                }}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[0.8rem] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                  mode === m && "bg-card text-foreground shadow-sm",
                  mode === m && m === "note" && "text-primary",
                )}
              >
                {m === "reply" ? <Send className="size-3.5" aria-hidden /> : <Lock className="size-3.5" aria-hidden />}
                {m === "reply" ? "Reply" : "Internal note"}
              </button>
            ))}
          </div>
          <p className={cn("text-xs font-medium", mode === "note" ? "text-primary" : "text-muted-foreground")}>{mode === "note" ? "Private · staff only" : "Draft only — not sent"}</p>
        </div>
        <label htmlFor="sup-composer" className="sr-only">
          {mode === "note" ? "Internal note" : "Reply draft (not sent)"}
        </label>
        <TextArea
          id="sup-composer"
          ref={area}
          value={text}
          maxLength={LIMIT}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
            setSaved(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={mode === "note" ? "Add a private note for the team…" : `Write a reply to ${customer?.name?.split(" ")[0] ?? "the customer"}…`}
          aria-invalid={error ? true : undefined}
          aria-describedby="sup-composer-help"
          className={cn("mt-2 min-h-[4.5rem] bg-card", mode === "note" && "border-dashed border-primary/40")}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p id="sup-composer-help" role={error ? "alert" : saved ? "status" : undefined} className={cn("min-w-0 text-xs", error ? "font-medium text-destructive" : "text-muted-foreground")}>
            {error ??
              (saved
                ? "Note saved in this browser."
                : mode === "note"
                  ? `Saved in this browser only · ${text.length}/${LIMIT} · Ctrl+Enter`
                  : `Replies need a backend, so nothing is sent · ${text.length}/${LIMIT}`)}
          </p>
          <button
            type="button"
            onClick={submit}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none",
              mode === "note" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border bg-card hover:border-primary/40 hover:text-primary",
            )}
          >
            {mode === "note" ? (
              "Add note"
            ) : (
              <>
                <Send className="size-3.5" aria-hidden /> Preview reply
              </>
            )}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={info !== null}
        onOpenChange={(o) => !o && setInfo(null)}
        title={info === "Reply preview" ? "Reply not sent — preview only" : `${info ?? ""} — demo only`}
        description={info ? DEMO[info] : ""}
        icon={info === "Reply preview" ? Send : Lock}
      />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Context                                                                   */
/* -------------------------------------------------------------------------- */

function CSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group border-b last:border-b-0" open={defaultOpen}>
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-5 text-[0.7rem] font-bold tracking-wider text-muted-foreground uppercase hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-5 pb-4">{children}</div>
    </details>
  );
}

function KV({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[0.85rem]">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd className={cn("min-w-0 text-end font-medium break-words tabular-nums", mono && "font-mono text-[0.78rem]")}>{v}</dd>
    </div>
  );
}

const ctxLink = "mt-2 inline-flex items-center gap-1 text-[0.82rem] font-semibold text-primary hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none";

function Context({ v, records }: { v: TicketView; records: Record<string, ServiceRecord> }) {
  const c = CUSTOMER_BY_ID[v.t.customerId];
  const facts = c ? factsOf(c, (o) => records[o.serviceId]) : null;
  const order = v.order;
  const svc = order ? orderService(order) : null;
  const blockers = order ? blockersOf(order, records[order.serviceId]) : [];
  const deposits = ADMIN_DEPOSITS.filter((d) => d.customerId === v.t.customerId && d.status !== "credited");
  return (
    <div>
      <CSection title="Customer">
        {c ? (
          <>
            <div className="flex items-center gap-3">
              <Avatar name={c.name} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">{c.email}</p>
              </div>
            </div>
            <dl className="mt-2.5">
              <KV k="ID" v={c.id} mono />
              <KV k="Activity" v={facts ? (facts.activity === "active" ? "Active · 7 days" : "Inactive") : "—"} />
              <KV k="Orders" v={facts?.orders.length ?? 0} />
              <KV k="Wallet" v={facts ? usd(facts.balance) : "—"} />
            </dl>
            <Link href={`/admin/customers?customer=${c.id}`} className={ctxLink}>
              View customer <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Customer record not found.</p>
        )}
      </CSection>

      <CSection title="Related order">
        {order && svc ? (
          <>
            <div className="flex items-center gap-2.5">
              <PlatformTile platform={svc.platform} size="xs" />
              <p className="min-w-0 truncate text-sm font-medium">{svc.service.name}</p>
            </div>
            <dl className="mt-2">
              <KV k="ID" v={order.id} mono />
              <KV k="Status" v={ADMIN_ORDER_STATUS[order.status].label} />
              <KV k="Amount" v={usd(order.amount)} />
              <KV k="Placed" v={shortDate(order.placedAt)} />
            </dl>
            {blockers.length ? (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-destructive">
                <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> {blockers[0].label}
              </p>
            ) : null}
            <Link href={`/admin/orders?order=${order.id}`} className={ctxLink}>
              View order <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No order linked.</p>
        )}
      </CSection>

      <CSection title="Related payment">
        <p className="text-sm text-muted-foreground">No transaction is linked to this ticket.</p>
        {deposits.length ? (
          <div className="mt-2.5">
            <p className="text-xs text-muted-foreground">Uncredited deposits for this customer (not linked):</p>
            <ul className="mt-1">
              {deposits.map((d) => (
                <li key={d.id}>
                  <Link href={`/admin/payments?txn=${d.id}`} className="flex items-baseline justify-between gap-2 py-1 text-[0.85rem] hover:text-primary">
                    <span className="font-mono text-[0.78rem] font-medium">{d.id}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {usd(d.amount)} · {d.status === "verification" ? "pending" : "failed"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Link href={`/admin/payments?q=${v.t.customerId}`} className={ctxLink}>
          View payments <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CSection>

      <CSection title="Ticket details">
        <dl>
          <KV k="Ticket" v={v.t.id} mono />
          <KV k="Category" v={<span title="Derived from the linked order or the subject">{CATEGORY_LABEL[v.category]}</span>} />
          <KV k="Opened" v={dateTime(v.t.openedAt)} />
          <KV k="Last activity" v={ago(v.lastActivity)} />
        </dl>
        <p className="mt-1.5 text-xs text-muted-foreground">Priority and assignment aren&apos;t recorded.</p>
      </CSection>
    </div>
  );
}
