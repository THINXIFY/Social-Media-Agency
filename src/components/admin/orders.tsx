"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Copy,
  Ellipsis,
  Eye,
  Lock,
  MessageSquarePlus,
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
import {
  ADMIN_ORDER_BY_ID,
  ADMIN_ORDER_STATUS,
  ADMIN_ORDERS,
  type AdminOrder,
  type AdminOrderStatus,
  ago,
  CUSTOMER_BY_ID,
  dateTime,
  num,
  orderService,
  shortDate,
  usd,
} from "@/lib/admin-demo";
import {
  addStaffNote,
  type Blocker,
  blockersOf,
  clearStaffNotes,
  eventsOf,
  looksSensitive,
  milestonesOf,
  needsAttention,
  nextActionOf,
  PAYMENT_META,
  type PaymentState,
  paymentOf,
  reviewChecklist,
  targetOf,
  useStaffNotes,
  withinDays,
} from "@/lib/admin-orders";
import { type ServiceRecord, useServiceRecords } from "@/lib/admin-services";
import { PLATFORMS, PLATFORM_BY_ID } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { SelectInput, TextArea } from "./form";
import { AdminDemoTag, linkButton } from "./ui";
import { popupSurface, menuPopup, menuItem as sharedMenuItem, menuLabel } from "./menu";

/* -------------------------------------------------------------------------- */
/*  Filters (URL)                                                             */
/* -------------------------------------------------------------------------- */

type StatusFilter = "" | AdminOrderStatus | "attention";
type DateFilter = "" | "1" | "7" | "14";
type Sort = "newest" | "oldest" | "amount_desc" | "amount_asc";
interface Filters {
  q: string;
  status: StatusFilter;
  platform: string;
  payment: "" | PaymentState;
  date: DateFilter;
  sort: Sort;
  page: number;
}
const DEFAULTS: Filters = { q: "", status: "", platform: "", payment: "", date: "", sort: "newest", page: 1 };
const PAGE_SIZE = 12;
const STATUSES = Object.keys(ADMIN_ORDER_STATUS) as AdminOrderStatus[];
const SORT_LABEL: Record<Sort, string> = { newest: "Newest first", oldest: "Oldest first", amount_desc: "Highest amount", amount_asc: "Lowest amount" };
const DATE_LABEL: Record<Exclude<DateFilter, "">, string> = { "1": "Last 24 hours", "7": "Last 7 days", "14": "Last 14 days" };

function parseFilters(p: URLSearchParams): Filters {
  const pick = <T extends string>(k: string, allowed: readonly T[], d: T) => {
    const v = p.get(k) as T | null;
    return v && allowed.includes(v) ? v : d;
  };
  return {
    q: (p.get("q") ?? "").slice(0, 80),
    status: pick("status", ["attention", ...STATUSES] as StatusFilter[], ""),
    platform: PLATFORM_BY_ID[p.get("platform") ?? ""] ? p.get("platform")! : "",
    payment: pick("payment", ["paid", "refunded", "partly_refunded"] as const, ""),
    date: pick("date", ["1", "7", "14"] as const, ""),
    sort: pick("sort", ["newest", "oldest", "amount_desc", "amount_asc"] as const, "newest"),
    page: Math.max(1, Number(p.get("page")) || 1),
  };
}

function toQuery(f: Filters, order: string | null) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== DEFAULTS[k as keyof Filters]) q.set(k, String(v));
  if (order) q.set("order", order);
  return q.toString();
}

const statusLabel = (s: StatusFilter) => (s === "attention" ? "Needs attention" : s ? ADMIN_ORDER_STATUS[s].label : "");

/* -------------------------------------------------------------------------- */
/*  Status language                                                           */
/* -------------------------------------------------------------------------- */

const STATUS_TONE: Record<AdminOrderStatus, { dot: string; text: string }> = {
  review: { dot: "bg-soon", text: "text-soon" },
  queued: { dot: "bg-muted-foreground", text: "text-foreground" },
  in_progress: { dot: "bg-primary", text: "text-foreground" },
  completed: { dot: "bg-ok", text: "text-foreground" },
  cancelled: { dot: "bg-off", text: "text-muted-foreground" },
  refunded: { dot: "bg-off", text: "text-muted-foreground" },
};

/** Plain-English name for each blocker, as the queue and drawer show it. */
const PROBLEM: Record<Blocker["id"], string> = {
  details: "Missing details",
  review: "Review requested",
  fulfilment: "Can't be fulfilled yet",
};

/** The one issue worth surfacing in a list row — only for orders that need action. */
function issueOf(o: AdminOrder, service: ServiceRecord | undefined) {
  const blockers = blockersOf(o, service);
  const details = blockers.find((b) => b.id === "details");
  if (details) return { urgent: true, text: details.detail };
  const review = blockers.find((b) => b.id === "review");
  if (review) return { urgent: false, text: review.detail };
  if (o.status === "queued" && blockers.some((b) => b.id === "fulfilment")) return { urgent: true, text: "No verified fulfilment method" };
  return null;
}

/* Collapsed state for the action queue — a per-browser convenience. */
const QUEUE_KEY = "sv-admin-orders-queue";
const queueListeners = new Set<() => void>();
const readQueueCollapsed = () => {
  try {
    return localStorage.getItem(QUEUE_KEY) === "collapsed";
  } catch {
    return false;
  }
};
function setQueueCollapsed(v: boolean) {
  try {
    if (v) localStorage.setItem(QUEUE_KEY, "collapsed");
    else localStorage.removeItem(QUEUE_KEY);
  } catch {}
  queueListeners.forEach((l) => l());
}
function useQueueCollapsed() {
  return React.useSyncExternalStore(
    (cb) => {
      queueListeners.add(cb);
      return () => queueListeners.delete(cb);
    },
    readQueueCollapsed,
    () => false,
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function AdminOrders() {
  const params = useSearchParams();
  const pathname = usePathname();
  const records = useServiceRecords();
  const notes = useStaffNotes();
  const serviceById = React.useMemo(() => Object.fromEntries(records.map((r) => [r.id, r])), [records]);
  const svc = (o: AdminOrder) => serviceById[o.serviceId] as ServiceRecord | undefined;

  const [f, setF] = React.useState<Filters>(() => parseFilters(params));
  // The open order lives in the URL so links, Back and Forward work.
  const orderParam = params.get("order");
  const openId = orderParam && ADMIN_ORDER_BY_ID[orderParam] ? orderParam : null;
  const pushed = React.useRef(false);
  const written = React.useRef(toQuery(f, null));

  // Another page can link here with filters (a customer's orders, say). Adopt them unless we wrote them.
  const urlKey = toQuery(parseFilters(params), null);
  React.useEffect(() => {
    if (urlKey !== written.current) {
      written.current = urlKey;
      setF(parseFilters(new URLSearchParams(urlKey)));
    }
  }, [urlKey]);

  React.useEffect(() => {
    if (pathname !== "/admin/orders") return;
    written.current = toQuery(f, null);
    const qs = toQuery(f, new URLSearchParams(location.search).get("order"));
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (`${location.pathname}${location.search}` !== url) window.history.replaceState(null, "", url);
  }, [f, pathname]);

  const open = (id: string) => {
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

  const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = ADMIN_ORDERS.filter((o) => {
    if (f.status === "attention" ? !needsAttention(o, svc(o)) : f.status && o.status !== f.status) return false;
    if (f.platform && orderService(o).platform.id !== f.platform) return false;
    if (f.payment && paymentOf(o) !== f.payment) return false;
    if (f.date && !withinDays(o, Number(f.date))) return false;
    if (!terms.length) return true;
    const { service, platform } = orderService(o);
    const hay = [o.id, o.customerId, CUSTOMER_BY_ID[o.customerId].name, service.name, platform.name].join(" ").toLowerCase();
    return terms.every((t) => hay.includes(t));
  }).sort((a, b) =>
    f.sort === "oldest" ? a.placedAt.localeCompare(b.placedAt) : f.sort === "amount_desc" ? b.amount - a.amount : f.sort === "amount_asc" ? a.amount - b.amount : b.placedAt.localeCompare(a.placedAt),
  );
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const rows = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const count = (s: AdminOrderStatus) => ADMIN_ORDERS.filter((o) => o.status === s).length;
  const attention = ADMIN_ORDERS.filter((o) => needsAttention(o, svc(o))).length;
  const tiles: { id: StatusFilter; label: string; value: number; tone?: "soon" | "destructive" }[] = [
    { id: "", label: "Total orders", value: ADMIN_ORDERS.length },
    { id: "review", label: "Awaiting review", value: count("review"), tone: "soon" },
    { id: "in_progress", label: "In progress", value: count("in_progress") },
    { id: "attention", label: "Needs attention", value: attention, tone: "destructive" },
    { id: "completed", label: "Completed", value: count("completed") },
  ];

  const chips: { key: string; label: string; clear: Partial<Filters> }[] = [];
  if (f.status) chips.push({ key: "status", label: statusLabel(f.status), clear: { status: "" } });
  if (f.platform) chips.push({ key: "platform", label: PLATFORM_BY_ID[f.platform].name, clear: { platform: "" } });
  if (f.payment) chips.push({ key: "payment", label: PAYMENT_META[f.payment].label, clear: { payment: "" } });
  if (f.date) chips.push({ key: "date", label: DATE_LABEL[f.date], clear: { date: "" } });
  if (f.sort !== DEFAULTS.sort) chips.push({ key: "sort", label: `Sort: ${SORT_LABEL[f.sort]}`, clear: { sort: DEFAULTS.sort } });

  const noteCount = Object.values(notes).reduce((n, l) => n + l.length, 0);
  const [clearAsk, setClearAsk] = React.useState(false);

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[0.8rem] font-medium text-muted-foreground">
            Operations <AdminDemoTag>Admin demo</AdminDemoTag>
          </p>
          <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Orders</h1>
          <p className="mt-1 max-w-xl text-[0.95rem] text-muted-foreground">See what each order needs and act on it. Actions here are demo-only and change nothing.</p>
        </div>
        {noteCount ? (
          <button type="button" onClick={() => setClearAsk(true)} className={cn(linkButton, "text-muted-foreground hover:text-foreground")}>
            <Trash2 className="size-3.5" aria-hidden /> Clear demo notes ({noteCount})
          </button>
        ) : null}
      </header>

      {/* Summary — one compact strip; each metric filters the list */}
      <div role="group" aria-label="Filter by summary" className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-5">
        {tiles.map((t, i) => {
          const on = f.status === t.id;
          const hot = t.tone && t.value > 0;
          return (
            <button
              key={t.label}
              type="button"
              aria-pressed={on}
              onClick={() => update({ status: t.id })}
              className={cn(
                "relative flex flex-col items-start gap-1 bg-card px-4 py-3.5 text-start transition-colors hover:bg-muted/50 focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:px-5",
                i === 0 && "col-span-2 flex-row items-baseline justify-between sm:col-span-1 sm:flex-col sm:items-start sm:justify-start",
                on && "bg-secondary/50 shadow-[inset_0_-2px_0_var(--primary)] hover:bg-secondary/60 dark:bg-secondary/25",
              )}
            >
              <span className={cn("flex items-center gap-1.5 text-[0.8rem] font-medium text-muted-foreground", hot && "font-semibold", hot && (t.tone === "soon" ? "text-soon" : "text-destructive"))}>
                {hot ? <span className={cn("size-1.5 rounded-full", t.tone === "soon" ? "bg-soon" : "bg-destructive")} aria-hidden /> : null}
                {t.label}
              </span>
              <span className="font-heading text-[1.6rem] leading-none font-extrabold tabular-nums">{t.value}</span>
            </button>
          );
        })}
      </div>

      <ActionQueue svc={svc} onOpen={open} onShowAll={() => update({ status: "attention" })} />

      <section aria-labelledby="orders-list-title" className="mt-6 overflow-hidden rounded-2xl border bg-card">
        <h2 id="orders-list-title" className="sr-only">
          All orders
        </h2>
        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <label htmlFor="ord-search" className="sr-only">
                Search orders
              </label>
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                id="ord-search"
                type="search"
                value={f.q}
                onChange={(e) => update({ q: e.target.value })}
                placeholder="Search order ID, customer, service or platform"
                autoComplete="off"
                className="h-10 w-full rounded-xl border bg-background ps-9 pe-9 text-sm transition-colors outline-none hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 dark:bg-muted/30 [&::-webkit-search-cancel-button]:hidden"
              />
              {f.q ? (
                <button type="button" onClick={() => update({ q: "" })} aria-label="Clear search" className="absolute end-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
              <Filter id="ord-status" label="Status" value={f.status} onChange={(v) => update({ status: v as StatusFilter })}>
                <option value="">All statuses</option>
                <option value="attention">Needs attention</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ADMIN_ORDER_STATUS[s].label}
                  </option>
                ))}
              </Filter>
              <Filter id="ord-platform" label="Platform" value={f.platform} onChange={(v) => update({ platform: v })}>
                <option value="">All platforms</option>
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Filter>
              <MoreFilters f={f} update={update} />
            </div>
          </div>
          <div className="flex min-h-7 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <p aria-live="polite" className="me-1.5 font-medium">
              {matches.length} order{matches.length === 1 ? "" : "s"}
              {matches.length > PAGE_SIZE ? ` · page ${page} of ${pages}` : ""}
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
              <button type="button" onClick={() => update({ ...DEFAULTS })} className="ms-0.5 font-semibold text-primary hover:underline">
                Clear all
              </button>
            ) : null}
          </div>
        </div>

        {rows.length ? (
          <>
            {/* Desktop: service and customer lead; IDs, dates and quantities are secondary */}
            <div className="hidden xl:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Orders</caption>
                <thead className="border-y bg-muted/40 text-[0.68rem] tracking-wider text-muted-foreground uppercase">
                  <tr>
                    <th scope="col" className="py-2 ps-5 text-start font-bold">Order</th>
                    <th scope="col" className="w-52 px-3 py-2 text-start font-bold">Customer</th>
                    <th scope="col" className="w-32 px-3 py-2 text-end font-bold">Amount</th>
                    <th scope="col" className="w-72 px-3 py-2 ps-6 text-start font-bold">Status</th>
                    <th scope="col" className="w-28 py-2 pe-5 text-end font-bold">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((o) => {
                    const { service, platform } = orderService(o);
                    const customer = CUSTOMER_BY_ID[o.customerId];
                    const issue = issueOf(o, svc(o));
                    const payment = paymentOf(o);
                    return (
                      <tr key={o.id} onClick={() => open(o.id)} className={cn("cursor-pointer transition-colors hover:bg-muted/40", openId === o.id && "bg-secondary/30")}>
                        <td className="py-3 ps-5">
                          <div className="flex items-center gap-3">
                            <PlatformTile platform={platform} size="sm" className="size-9 rounded-xl" />
                            <span className="min-w-0">
                              <span className="line-clamp-1 font-semibold">{service.name}</span>
                              <span className="block text-xs text-muted-foreground" title={dateTime(o.placedAt)}>
                                <span className="font-mono">{o.id}</span> · {num(o.quantity)} · {shortDate(o.placedAt)}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="block truncate font-medium">{customer.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{customer.email}</span>
                        </td>
                        <td className="px-3 py-3 text-end tabular-nums">
                          <span className="block font-semibold">{usd(o.amount)}</span>
                          {payment !== "paid" ? <span className="block text-xs text-off">{PAYMENT_META[payment].label}</span> : null}
                        </td>
                        <td className="px-3 py-3 ps-6">
                          <StatusText status={o.status} />
                          {issue ? <IssueText {...issue} /> : null}
                        </td>
                        <td className="py-3 pe-5 text-end">
                          <RowAction order={o} urgent={Boolean(issue)} onOpen={() => open(o.id)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Phones & tablets: compact cards, the whole card opens the order */}
            <ul className="divide-y border-t xl:hidden" aria-label="Orders">
              {rows.map((o) => {
                const { service, platform } = orderService(o);
                const issue = issueOf(o, svc(o));
                const payment = paymentOf(o);
                return (
                  <li key={o.id} className={cn("relative px-4 py-3.5 transition-colors hover:bg-muted/40 sm:px-5", openId === o.id && "bg-secondary/30")}>
                    <div className="flex items-start gap-3">
                      <PlatformTile platform={platform} size="sm" className="size-9 rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="line-clamp-2 text-[0.92rem] leading-snug font-semibold">{service.name}</p>
                          <p className="shrink-0 text-end text-[0.92rem] font-semibold tabular-nums">
                            {usd(o.amount)}
                            {payment !== "paid" ? <span className="block text-xs font-normal text-off">{PAYMENT_META[payment].label}</span> : null}
                          </p>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {CUSTOMER_BY_ID[o.customerId].name} · {num(o.quantity)} · <span className="font-mono">{o.id}</span> · {shortDate(o.placedAt)}
                        </p>
                        {issue ? <IssueText {...issue} /> : null}
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <StatusText status={o.status} />
                          <RowAction order={o} urgent={Boolean(issue)} onOpen={() => open(o.id)} stretch />
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {pages > 1 ? (
              <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm sm:px-5">
                <p className="text-xs text-muted-foreground tabular-nums">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, matches.length)} of {matches.length}
                </p>
                <div className="flex items-center gap-1">
                  <PageButton label="Previous page" disabled={page === 1} onClick={() => update({ page: page - 1 })}>
                    <ChevronLeft className="size-4" aria-hidden />
                  </PageButton>
                  <span className="px-2 text-xs font-semibold tabular-nums" aria-current="page">
                    {page} / {pages}
                  </span>
                  <PageButton label="Next page" disabled={page === pages} onClick={() => update({ page: page + 1 })}>
                    <ChevronRight className="size-4" aria-hidden />
                  </PageButton>
                </div>
              </nav>
            ) : null}
          </>
        ) : (
          <div className="border-t px-6 py-14 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <SearchX className="size-6" aria-hidden />
            </span>
            <p className="mt-4 font-semibold">No orders match</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Try a different search, or clear the filters.</p>
            <button type="button" onClick={() => update({ ...DEFAULTS })} className={cn(linkButton, "mt-3 border bg-card")}>
              Clear all
            </button>
          </div>
        )}
      </section>

      <OrderDrawer id={openId} svc={svc} notes={openId ? notes[openId] ?? [] : []} onClose={close} />

      <ConfirmDialog
        open={clearAsk}
        onOpenChange={setClearAsk}
        title="Clear demo notes?"
        description="Removes every internal note added in this browser. Orders themselves don't change."
        confirmLabel="Clear notes"
        tone="danger"
        icon={Trash2}
        onConfirm={clearStaffNotes}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Action queue                                                              */
/* -------------------------------------------------------------------------- */

const BLOCKER_RANK = { details: 0, review: 1, fulfilment: 2 } as const;

function ActionQueue({ svc, onOpen, onShowAll }: { svc: (o: AdminOrder) => ServiceRecord | undefined; onOpen: (id: string) => void; onShowAll: () => void }) {
  const collapsed = useQueueCollapsed();
  // Each open order once, ranked by its most serious blocker, oldest first.
  const items = ADMIN_ORDERS.map((o) => ({ o, blockers: blockersOf(o, svc(o)).filter((b) => b.id !== "fulfilment" || o.status === "queued") }))
    .filter((x) => x.blockers.length)
    .sort((a, b) => BLOCKER_RANK[a.blockers[0].id] - BLOCKER_RANK[b.blockers[0].id] || a.o.placedAt.localeCompare(b.o.placedAt));
  const shown = items.slice(0, 5);
  const by = (id: Blocker["id"]) => items.filter((x) => x.blockers[0].id === id).length;
  const summary = [by("details") && `${by("details")} missing details`, by("review") && `${by("review")} to review`, by("fulfilment") && `${by("fulfilment")} can't be fulfilled`].filter(Boolean).join(" · ");

  if (!items.length) {
    return (
      <p className="mt-6 flex items-center gap-2 rounded-2xl border bg-card px-5 py-3.5 text-sm text-muted-foreground">
        <CircleCheck className="size-4 text-ok" aria-hidden /> Nothing needs action right now.
      </p>
    );
  }

  return (
    <section aria-labelledby="queue-title" className="mt-6 overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <h2 id="queue-title" className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls="queue-list"
            onClick={() => setQueueCollapsed(!collapsed)}
            className="flex w-full items-center gap-2.5 rounded-lg text-start focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <span className="grid h-6 min-w-6 place-items-center rounded-full bg-destructive px-1.5 text-xs font-bold text-white tabular-nums">{items.length}</span>
            <span className="min-w-0">
              <span className="block text-[0.95rem] font-bold">Action required</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">{summary}</span>
            </span>
            <ChevronDown className={cn("ms-auto size-4 shrink-0 text-muted-foreground transition-transform", collapsed && "-rotate-90")} aria-hidden />
          </button>
        </h2>
      </div>
      {!collapsed ? (
        <div id="queue-list">
          <ul className="divide-y border-t">
            {shown.map(({ o, blockers }) => {
              const { service, platform } = orderService(o);
              const top = blockers[0];
              const next = nextActionOf(o, svc(o));
              return (
                <li key={o.id} className="flex items-start gap-3 px-4 py-3 sm:items-center sm:px-5">
                  <PlatformTile platform={platform} size="sm" className="size-9 rounded-xl" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className="font-semibold">{service.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{o.id}</span>
                      </p>
                      <p className="mt-0.5 text-[0.82rem]">
                        <span className={cn("font-semibold", top.id === "review" ? "text-soon" : "text-destructive")}>{PROBLEM[top.id]}</span>
                        <span className="text-muted-foreground">
                          {" — "}
                          {top.detail}
                        </span>
                      </p>
                    </div>
                    <span className="hidden shrink-0 text-xs text-muted-foreground md:block">{ago(o.placedAt)}</span>
                    <button
                      type="button"
                      onClick={() => onOpen(o.id)}
                      aria-label={`${next.label}: open ${o.id}`}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-full bg-primary px-4 text-[0.82rem] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none sm:self-auto"
                    >
                      {next.label} <ArrowRight className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {items.length > shown.length ? (
            <div className="border-t px-4 py-2.5 sm:px-5">
              <button type="button" onClick={onShowAll} className={linkButton}>
                Show all {items.length} in the list <ArrowRight className="size-3.5" aria-hidden />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small pieces                                                              */
/* -------------------------------------------------------------------------- */

function StatusText({ status, className }: { status: AdminOrderStatus; className?: string }) {
  const tone = STATUS_TONE[status];
  return (
    <span className={cn("inline-flex items-center gap-2 text-[0.85rem] font-semibold whitespace-nowrap", tone.text, className)}>
      <span className={cn("size-2 shrink-0 rounded-full", tone.dot)} aria-hidden />
      {ADMIN_ORDER_STATUS[status].label}
    </span>
  );
}

function IssueText({ urgent, text }: { urgent: boolean; text: string }) {
  return (
    <span className={cn("mt-1 flex items-start gap-1 text-xs", urgent ? "font-medium text-destructive" : "text-muted-foreground")}>
      {urgent ? <CircleAlert className="mt-px size-3 shrink-0" aria-hidden /> : null}
      <span>
        <span className="sr-only">{urgent ? "Needs attention: " : "Review reason: "}</span>
        {text}
      </span>
    </span>
  );
}

function RowAction({ order, urgent, onOpen, stretch }: { order: AdminOrder; urgent: boolean; onOpen: () => void; stretch?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label={`${urgent ? "Review" : "View"} ${order.id}`}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-[0.82rem] font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none",
        urgent ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-primary hover:bg-secondary",
        stretch && "after:absolute after:inset-0 after:content-['']",
      )}
    >
      {urgent ? "Review" : "View"} <ChevronRight className="size-3.5" aria-hidden />
    </button>
  );
}

function Filter({ id, label, value, onChange, children, plain, className }: { id: string; label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; plain?: boolean; className?: string }) {
  return (
    <div className="min-w-0 lg:w-44">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <SelectInput id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn("h-10", className, value && !plain && "border-primary/50 bg-secondary/40 dark:bg-secondary/20")}>
        {children}
      </SelectInput>
    </div>
  );
}

const popupClass = popupSurface;

function MoreFilters({ f, update }: { f: Filters; update: (patch: Partial<Filters>) => void }) {
  const count = [f.payment, f.date, f.sort !== DEFAULTS.sort ? "sort" : ""].filter(Boolean).length;
  const label = "text-xs font-semibold text-muted-foreground";
  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          "col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-xl border bg-background px-3.5 text-sm font-semibold whitespace-nowrap transition-colors hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-primary/15 focus-visible:outline-none data-popup-open:border-primary/50 sm:col-span-1 dark:bg-muted/30",
          count && "border-primary/50 bg-secondary/40 dark:bg-secondary/20",
        )}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        More filters
        {count ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.68rem] font-bold text-primary-foreground tabular-nums">{count}</span> : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <Popover.Popup className={cn(popupClass, "w-[min(20rem,calc(100vw-1.5rem))] space-y-3 p-4")}>
            <Popover.Title className="text-sm font-bold">More filters</Popover.Title>
            <div className="space-y-1.5">
              <p aria-hidden className={label}>
                Payment
              </p>
              <Filter id="ord-payment" label="Payment" value={f.payment} onChange={(v) => update({ payment: v as Filters["payment"] })}>
                <option value="">Any payment</option>
                {(Object.keys(PAYMENT_META) as PaymentState[]).map((p) => (
                  <option key={p} value={p}>
                    {PAYMENT_META[p].label}
                  </option>
                ))}
              </Filter>
            </div>
            <div className="space-y-1.5">
              <p aria-hidden className={label}>
                Placed
              </p>
              <Filter id="ord-date" label="Date" value={f.date} onChange={(v) => update({ date: v as DateFilter })}>
                <option value="">Any date</option>
                {(Object.keys(DATE_LABEL) as Exclude<DateFilter, "">[]).map((d) => (
                  <option key={d} value={d}>
                    {DATE_LABEL[d]}
                  </option>
                ))}
              </Filter>
            </div>
            <div className="space-y-1.5">
              <p aria-hidden className={label}>
                Sort by
              </p>
              <div className="relative">
                <Filter id="ord-sort" label="Sort" value={f.sort} onChange={(v) => update({ sort: v as Sort })} plain>
                  {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
                    <option key={s} value={s}>
                      {SORT_LABEL[s]}
                    </option>
                  ))}
                </Filter>
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function PageButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-9 place-items-center rounded-full border bg-card transition-colors hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Order drawer                                                              */
/* -------------------------------------------------------------------------- */

function OrderDrawer({ id, svc, notes, onClose }: { id: string | null; svc: (o: AdminOrder) => ServiceRecord | undefined; notes: ReturnType<typeof useStaffNotes>[string]; onClose: () => void }) {
  const [shown, setShown] = React.useState(id);
  if (id && id !== shown) setShown(id);
  const order = ADMIN_ORDER_BY_ID[id ?? shown ?? ""];
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[38rem]">
        {order ? <DrawerBody key={order.id} order={order} service={svc(order)} notes={notes} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Section({ id, title, aside, children }: { id: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t px-5 py-6 sm:px-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={id} className="text-[0.95rem] font-bold">
          {title}
        </h3>
        {aside ? <span className="text-xs text-muted-foreground">{aside}</span> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DrawerBody({ order: o, service, notes, onClose }: { order: AdminOrder; service: ServiceRecord | undefined; notes: { id: string; at: string; text: string }[]; onClose: () => void }) {
  const { service: svc, platform } = orderService(o);
  const customer = CUSTOMER_BY_ID[o.customerId];
  const blockers = blockersOf(o, service);
  const next = nextActionOf(o, service);
  const checks = reviewChecklist(o, service).filter((c) => c.id !== "next");
  const failing = checks.filter((c) => c.ok === false);
  const passed = checks.filter((c) => c.ok !== false);
  const milestones = milestonesOf(o, blockers);
  const events = eventsOf(o, notes);
  const payment = paymentOf(o);
  const attention = needsAttention(o, service);
  const issue = blockers.find((b) => b.id === "details") ?? blockers.find((b) => b.id === "review") ?? (o.status === "queued" ? blockers.find((b) => b.id === "fulfilment") : undefined);
  const [info, setInfo] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [noteError, setNoteError] = React.useState<string | null>(null);

  const ACTIONS = ["Review order", "Request details", "Assign provider", "Update status", "Contact customer"];
  const secondary = ACTIONS.filter((a) => a !== next.label);

  const saveNote = () => {
    const text = note.trim();
    if (text.length < 2) return setNoteError("Write a short note first.");
    if (looksSensitive(text)) return setNoteError("Don't store passwords, codes, keys or card numbers in notes.");
    addStaffNote(o.id, text);
    setNote("");
    setNoteError(null);
    setComposing(false);
  };

  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2.5 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium break-words">{value}</dd>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b px-5 pt-5 pb-4 sm:px-6">
        <PlatformTile platform={platform} size="md" className="size-11 rounded-xl" />
        <div className="min-w-0 flex-1">
          <SheetTitle className="font-heading text-lg leading-tight font-bold">{svc.name}</SheetTitle>
          <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(o.id);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {}
              }}
              className="inline-flex h-6 items-center gap-1 rounded-md px-1 font-mono text-[0.78rem] font-semibold text-foreground hover:bg-muted"
              aria-label={`Copy ${o.id}`}
            >
              {o.id} {copied ? <Check className="size-3 text-ok" aria-hidden /> : <Copy className="size-3 text-muted-foreground" aria-hidden />}
            </button>
            <span aria-hidden>·</span>
            <span>Placed {ago(o.placedAt)}</span>
            <AdminDemoTag>Demo record</AdminDemoTag>
          </SheetDescription>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close order"
          className="-me-1.5 grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* 1 · Current status and the one next step */}
        <section aria-labelledby="status-title" className="px-5 py-5 sm:px-6">
          <h3 id="status-title" className="sr-only">
            Current status
          </h3>
          <div className={cn("rounded-2xl border p-4", attention ? "border-destructive/30 bg-destructive/[0.04]" : o.status === "review" ? "border-soon/35 bg-soon-soft/40" : "bg-muted/40")}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusText status={o.status} className="text-[0.95rem]" />
              {attention ? (
                <span className="inline-flex items-center gap-1 text-[0.82rem] font-semibold text-destructive">
                  <CircleAlert className="size-3.5" aria-hidden /> Needs attention
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{ADMIN_ORDER_STATUS[o.status].note}</p>
            {issue ? (
              <p className="mt-3 text-sm">
                <span className={cn("font-semibold", issue.id === "review" ? "text-soon" : "text-destructive")}>{PROBLEM[issue.id]}:</span> {issue.detail}
              </p>
            ) : null}
            <div className="mt-4 border-t border-current/10 pt-4">
              <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">What happens next</p>
              <p className="mt-1 text-[0.95rem] font-semibold">{next.explain}</p>
            </div>
          </div>
        </section>

        {/* 2 · Order details */}
        <Section id="details-title" title="Order details">
          <dl className="divide-y">
            {row("Service", `${svc.name} · ${platform.name}`)}
            {row(
              "Customer",
              <span>
                <Link href={`/admin/customers?customer=${customer.id}`} className="font-semibold text-primary hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none">
                  {customer.name}
                </Link>
                <span className="block text-xs font-normal break-all text-muted-foreground">
                  {customer.email} · {customer.id}
                </span>
              </span>,
            )}
            {row(
              "Target",
              <span>
                <span className="font-mono text-[0.78rem] break-all">{targetOf(o)}</span>
                <span className="block text-xs font-normal text-muted-foreground">Demo target, not a real account</span>
              </span>,
            )}
            {row("Quantity", num(o.quantity))}
            {row("Price", usd(o.amount))}
            {row(
              "Payment",
              <span>
                {PAYMENT_META[payment].label}
                {o.refunded ? <span className="block text-xs font-normal text-muted-foreground">{usd(o.refunded)} returned to wallet</span> : null}
              </span>,
            )}
            {row("Placed", dateTime(o.placedAt))}
          </dl>
        </Section>

        {/* 3 · Review checklist — blockers first, passed checks tucked away */}
        <Section id="review-title" title="Review checklist" aside={`${passed.length} of ${checks.length} met`}>
          {failing.length ? (
            <ul className="space-y-2">
              {failing.map((c) => (
                <li key={c.id} className="flex gap-3 rounded-xl bg-destructive/[0.05] px-3.5 py-3">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-destructive/12 text-destructive" aria-hidden>
                    <X className="size-3" strokeWidth={3} />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">
                      {c.question}
                      <span className="sr-only"> No.</span>
                    </p>
                    <p className="text-muted-foreground">{c.answer}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleCheck className="size-4 text-ok" aria-hidden /> Every requirement is met.
            </p>
          )}
          {passed.length ? (
            <details className="group mt-2">
              <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg text-sm font-semibold text-primary hover:underline focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
                {passed.length} met
              </summary>
              <ul className="mt-1 space-y-2.5 ps-1">
                {passed.map((c) => (
                  <li key={c.id} className="flex gap-3 text-sm">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ok-soft text-ok" aria-hidden>
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">
                        {c.question}
                        <span className="sr-only"> Yes.</span>
                      </p>
                      <p className="text-muted-foreground">{c.answer}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Section>

        {/* 4 · Fulfilment timeline */}
        <Section id="progress-title" title="Fulfilment timeline">
          <ol>
            {milestones.map((m, i) => (
              <li key={m.label} className="relative flex gap-3 pb-4 last:pb-0">
                {i < milestones.length - 1 ? <span className={cn("absolute start-[0.6875rem] top-6 bottom-0 w-px", m.state === "done" ? "bg-ok/50" : "bg-border")} aria-hidden /> : null}
                <span
                  className={cn(
                    "relative grid size-6 shrink-0 place-items-center rounded-full",
                    m.state === "done" && "bg-ok text-white dark:text-graphite",
                    m.state === "current" && "bg-primary text-primary-foreground",
                    m.state === "blocked" && "bg-destructive/15 text-destructive ring-1 ring-destructive/40",
                    m.state === "upcoming" && "border bg-card text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {m.state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : m.state === "blocked" ? <Lock className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />}
                </span>
                <div className="min-w-0 text-sm">
                  <p className={cn("font-semibold", m.state === "upcoming" && "text-muted-foreground")}>
                    {m.label}
                    <span className="sr-only">, {m.state}</span>
                  </p>
                  <p className={cn("text-xs", m.state === "blocked" ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {m.at ? dateTime(m.at) : m.note ?? (m.state === "current" ? "In progress" : "Not yet")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        {/* 5 · Activity & internal notes */}
        <Section id="activity-title" title="Activity & internal notes">
          <ul className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className={cn("text-sm", e.kind === "staff" && "rounded-xl border-s-2 border-primary bg-secondary/40 py-2 ps-3 pe-3 dark:bg-secondary/20")}>
                <p className="flex flex-wrap items-center gap-x-2 text-xs">
                  {e.kind === "staff" ? (
                    <span className="inline-flex items-center gap-1 font-bold text-primary">
                      <Eye className="size-3" aria-hidden /> Internal note · staff only
                    </span>
                  ) : (
                    <span className={cn("font-bold", e.kind === "customer" ? "text-foreground/75" : "text-muted-foreground")}>{e.kind === "customer" ? "Customer" : "System"}</span>
                  )}
                  {e.local ? <AdminDemoTag>Demo</AdminDemoTag> : null}
                  <span className="ms-auto text-muted-foreground tabular-nums">{e.at ? dateTime(e.at) : "Time not recorded"}</span>
                </p>
                <p className="mt-0.5 break-words">{e.text}</p>
              </li>
            ))}
          </ul>
          {composing ? (
            <div className="mt-4">
              <label htmlFor="ord-note" className="text-xs font-semibold">
                Internal note
              </label>
              <TextArea
                id="ord-note"
                value={note}
                maxLength={1000}
                autoFocus
                onChange={(e) => {
                  setNote(e.target.value);
                  setNoteError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    saveNote();
                  }
                }}
                placeholder="Visible to staff only. Never shown to the customer."
                aria-invalid={noteError ? true : undefined}
                aria-describedby="ord-note-help"
                className="mt-1.5 min-h-20"
              />
              <p id="ord-note-help" role={noteError ? "alert" : undefined} className={cn("mt-1.5 text-xs", noteError ? "font-medium text-destructive" : "text-muted-foreground")}>
                {noteError ?? "Saved in this browser only · Ctrl+Enter to add"}
              </p>
              <div className="mt-2.5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setComposing(false);
                    setNote("");
                    setNoteError(null);
                  }}
                  className="inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveNote}
                  className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-sm font-semibold text-background transition-opacity hover:opacity-85 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
                >
                  Add note
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              <MessageSquarePlus className="size-4" aria-hidden /> Add internal note
            </button>
          )}
        </Section>
      </div>

      {/* Sticky actions: the one next step first, the rest under More */}
      <div className="flex items-center gap-2 border-t bg-background/95 px-5 py-3 backdrop-blur-sm sm:px-6">
        {next.id !== "none" ? (
          <button
            type="button"
            onClick={() => setInfo(next.label)}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none"
          >
            {next.label} <ArrowRight className="size-4" aria-hidden />
          </button>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-ok" aria-hidden /> No action needed
          </p>
        )}
        <Menu.Root>
          <Menu.Trigger
            aria-label="More actions"
            className="ms-auto inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none data-popup-open:bg-muted"
          >
            <Ellipsis className="size-4" aria-hidden /> <span className="hidden sm:inline">More</span>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="top" align="end" sideOffset={8} collisionPadding={12} className="z-50">
              <Menu.Popup className={cn(menuPopup, "w-64")}>
                <p className={menuLabel}>Demo only · nothing changes</p>
                {secondary.map((a) => (
                  <Menu.Item key={a} onClick={() => setInfo(a)} className={sharedMenuItem}>
                    {a}
                  </Menu.Item>
                ))}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      <ConfirmDialog
        open={info !== null}
        onOpenChange={(v) => !v && setInfo(null)}
        title={`${info ?? ""} — demo only`}
        description={
          info === "Contact customer"
            ? "Messaging customers needs a backend with staff accounts. No email or notification was sent."
            : info === "Assign provider"
              ? "No provider connection is verified, so nothing can be assigned. Map this service to a provider in Fulfillment Providers and verify fulfilment in Services & Pricing first."
              : `${info ?? "This action"} needs a backend with staff accounts and permissions. Nothing changed, the order keeps its status and the customer wasn't notified.`
        }
        icon={info === "Contact customer" ? Send : Lock}
      />
    </div>
  );
}
