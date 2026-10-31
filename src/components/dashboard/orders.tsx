"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  FlaskConical,
  PackageSearch,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { PLATFORM_BY_ID, PLATFORMS } from "@/lib/catalog";
import {
  count,
  deliveryProgress,
  type DemoOrder,
  formatDate,
  money,
  ORDER_STATUS_META,
  ORDERS,
  orderService,
  type OrderStatus,
} from "@/lib/demo-account";
import { useDisplay } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type LocalOrder, resetDemoData, useDemoOrders } from "./demo-store";
import { OrderDetails } from "./order-details";
import { FxNote } from "./region";
import { DemoTag, enter, newOrderHref, OrderStatusBadge, Panel, ROUTES } from "./shared";

/* -------------------------------------------------------------------------- */
/*  Filters                                                                   */
/* -------------------------------------------------------------------------- */

/** `active` groups pending and in-progress orders, matching the Overview. */
type StatusFilter = "all" | "active" | OrderStatus;
type SortOrder = "newest" | "oldest";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "processing", label: "In Progress" },
  { id: "attention", label: "Needs Attention" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

const VALID_STATUS = new Set<string>(["all", "active", "pending", "processing", "attention", "completed", "cancelled"]);
const parseStatus = (v: string | null): StatusFilter => (v && VALID_STATUS.has(v) ? (v as StatusFilter) : "all");
const parsePlatform = (v: string | null) => (v && PLATFORM_BY_ID[v] ? v : "all");

const matchesStatus = (o: DemoOrder, f: StatusFilter) =>
  f === "all" || (f === "active" ? o.status === "pending" || o.status === "processing" : o.status === f);

function matchesSearch(o: DemoOrder, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const { service, platform } = orderService(o);
  return [o.id, service.name, platform.name, platform.short].some((t) => t.toLowerCase().includes(q));
}

/** Platforms that appear in the customer's orders, in catalog order. */
const ORDER_PLATFORMS = PLATFORMS.filter((p) => ORDERS.some((o) => orderService(o).platform.id === p.id));

const selectClass =
  "h-11 w-full appearance-none rounded-xl border bg-card pe-9 ps-3.5 text-sm font-medium shadow-xs transition-colors outline-none hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15";

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function MyOrders() {
  // Re-render when language, currency, time zone or date format change.
  useDisplay();
  const params = useSearchParams();
  const { orders, summary, changes } = useDemoOrders();
  const [status, setStatus] = React.useState<StatusFilter>(() => parseStatus(params.get("status")));
  const [platform, setPlatform] = React.useState(() => parsePlatform(params.get("platform")));
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortOrder>("newest");
  const [openId, setOpenId] = React.useState<string | null>(() => params.get("order"));
  const [actionFor, setActionFor] = React.useState<string | null>(null);
  const [resetDone, setResetDone] = React.useState(false);
  const lastTrigger = React.useRef<HTMLElement | null>(null);

  // Links can arrive while this page is still mounted (e.g. from the Overview), so follow param changes.
  const orderParam = params.get("order");
  const statusParam = params.get("status");
  const [seen, setSeen] = React.useState({ order: orderParam, status: statusParam });
  if (seen.order !== orderParam || seen.status !== statusParam) {
    setSeen({ order: orderParam, status: statusParam });
    if (orderParam && orderParam !== seen.order) setOpenId(orderParam);
    if (statusParam !== seen.status) setStatus(parseStatus(statusParam));
  }

  // Leaving the page (e.g. Contact Support) closes the drawer, so it isn't still open on return.
  const pathname = usePathname();
  if (pathname !== ROUTES.orders && openId) setOpenId(null);

  // Keep the URL shareable: status, platform and the open order.
  React.useEffect(() => {
    const qs = new URLSearchParams();
    if (status !== "all") qs.set("status", status);
    if (platform !== "all") qs.set("platform", platform);
    if (openId) qs.set("order", openId);
    const next = `${ROUTES.orders}${qs.size ? `?${qs}` : ""}`;
    // Only while this page is showing: closing a drawer on the way to another page mustn't pull the URL back.
    if (window.location.pathname !== ROUTES.orders) return;
    if (window.location.search !== (qs.size ? `?${qs}` : "")) window.history.replaceState(null, "", next);
  }, [status, platform, openId]);

  const scoped = orders.filter((o) => (platform === "all" || orderService(o).platform.id === platform) && matchesSearch(o, query));
  const statusCount = (f: StatusFilter) => scoped.filter((o) => matchesStatus(o, f)).length;
  const visible = scoped
    .filter((o) => matchesStatus(o, status))
    .sort((a, b) => (sort === "newest" ? b.placedAt.localeCompare(a.placedAt) : a.placedAt.localeCompare(b.placedAt)));
  const needsAction = orders.filter((o) => o.status === "attention");
  const filtered = status !== "all" || platform !== "all" || query.trim() !== "" || sort !== "newest";
  const openOrder = orders.find((o) => o.id === openId) ?? null;
  const missingId = openId && !openOrder ? openId : null;

  const clearFilters = () => {
    setStatus("all");
    setPlatform("all");
    setQuery("");
    setSort("newest");
  };

  const open = (id: string, withAction = false) => {
    lastTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActionFor(withAction ? id : null);
    setOpenId(id);
  };

  const close = () => {
    setOpenId(null);
    setActionFor(null);
    // Return focus to whatever opened the drawer.
    requestAnimationFrame(() => lastTrigger.current?.focus({ preventScroll: true }));
  };

  const reset = () => {
    resetDemoData();
    setResetDone(true);
  };

  const tiles = [
    { id: "all" as const, label: "All Orders", value: summary.total, hint: summary.cancelled ? `${summary.cancelled} cancelled` : "All time", Icon: PackageSearch, tone: "bg-muted text-foreground/80" },
    { id: "active" as const, label: "In Progress", value: summary.active, hint: `${summary.pending} pending · ${summary.processing} delivering`, Icon: RefreshCw, tone: "bg-secondary text-secondary-foreground" },
    { id: "attention" as const, label: "Needs Attention", value: summary.attention, hint: summary.attention ? "Waiting on you" : "All clear", Icon: TriangleAlert, tone: "bg-soon-soft text-soon" },
    { id: "completed" as const, label: "Completed", value: summary.completed, hint: "Delivered", Icon: CircleCheck, tone: "bg-ok-soft text-ok" },
  ];

  const e = [0, 1, 2, 3].map(enter);

  return (
    <div className="mx-auto max-w-[90rem] px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      {/* Header */}
      <header className={cn("flex flex-wrap items-end justify-between gap-4", e[0].className)} style={e[0].style}>
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">My Orders</h1>
          <p className="mt-1 max-w-xl text-[0.95rem] text-muted-foreground">
            Track your orders, manage requests, and stay updated—all in one place.
          </p>
        </div>
        <Link
          href={newOrderHref()}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_10px_28px_-12px_rgb(112_71_235/0.8)] transition-all hover:-translate-y-px hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none"
        >
          <Plus className="size-4" strokeWidth={2.6} aria-hidden /> New Order
        </Link>
      </header>

      {/* Summary */}
      <div
        className={cn("mt-5 grid grid-cols-2 gap-2.5 sm:mt-6 sm:gap-3 lg:grid-cols-4", e[1].className)}
        style={e[1].style}
        role="group"
        aria-label="Order summary"
      >
        {tiles.map((t) => {
          const on = status === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => setStatus(on && t.id !== "all" ? "all" : t.id)}
              className={cn(
                "flex items-center gap-3 rounded-2xl border bg-card p-3 text-start shadow-soft transition-all hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:p-4",
                t.id === "attention" && summary.attention > 0 && "border-soon/30 bg-soon-soft/30",
                on && "border-foreground/70 ring-1 ring-foreground/70 hover:border-foreground/70",
              )}
            >
              <span className={cn("hidden size-10 shrink-0 place-items-center rounded-xl sm:grid", t.tone)}>
                <t.Icon className="size-[1.1rem]" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-heading text-2xl leading-none font-extrabold tabular-nums">{t.value}</span>
                <span className="mt-1 block truncate text-[0.8rem] font-semibold">{t.label}</span>
                <span className="block truncate text-[0.7rem] text-muted-foreground">{t.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Action needed */}
      {needsAction.length && (status === "all" || status === "attention") ? (
        <section
          aria-labelledby="action-title"
          className={cn("mt-5 rounded-3xl border border-soon/30 bg-soon-soft/40 p-4 sm:p-5", e[2].className)}
          style={e[2].style}
        >
          <h2 id="action-title" className="flex items-center gap-2 text-sm font-bold">
            <TriangleAlert className="size-4 text-soon" aria-hidden />
            {needsAction.length === 1 ? "1 order needs your action" : `${needsAction.length} orders need your action`}
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {needsAction.map((o) => {
              const { service, platform: p } = orderService(o);
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3 sm:flex-nowrap sm:p-3.5">
                  <PlatformTile platform={p} size="sm" className="size-9 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{o.attention?.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {service.name} · {o.id}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => open(o.id, true)}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-foreground px-4 text-xs font-semibold text-background transition-opacity hover:opacity-85 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none max-sm:basis-full sm:h-9 sm:px-3.5"
                  >
                    {o.attention?.action}
                    <ArrowRight className="size-3.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Simulated changes, kept in this browser until reset */}
      <div role="status">
        {changes ? (
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-dashed border-primary/40 bg-card px-4 py-3 text-sm">
            <FlaskConical className="size-4 shrink-0 text-primary" aria-hidden />
            <p className="min-w-0 flex-1">
              <span className="font-semibold">
                {changes === 1 ? "1 demo change" : `${changes} demo changes`} saved in this browser.
              </span>{" "}
              <span className="text-muted-foreground">Nothing was sent and no real order changed.</span>
            </p>
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-xs font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              <RotateCcw className="size-3.5" aria-hidden /> Reset Demo Data
            </button>
          </div>
        ) : resetDone ? (
          <p className="mt-5 flex items-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
            <RotateCcw className="size-4 shrink-0" aria-hidden />
            Demo data reset. Orders are back to the original sample data.
          </p>
        ) : null}
      </div>

      {missingId ? (
        <p role="alert" className="mt-5 flex items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm">
          <PackageSearch className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          We couldn&apos;t find order <span className="font-semibold">{missingId}</span>. It may belong to another account.
          <button type="button" onClick={() => setOpenId(null)} className="ms-auto text-sm font-semibold text-primary hover:underline">
            Dismiss
          </button>
        </p>
      ) : null}

      {/* List */}
      <Panel className={cn("mt-5 overflow-hidden", e[3].className)} style={e[3].style} aria-labelledby="orders-list-title">
        <h2 id="orders-list-title" className="sr-only">
          Orders
        </h2>
        <div className="space-y-3 p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-[minmax(0,1fr)_12rem_10rem]">
            <div className="relative">
              <label htmlFor="orders-search" className="sr-only">
                Search orders
              </label>
              <Search className="pointer-events-none absolute top-1/2 start-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                id="orders-search"
                type="search"
                value={query}
                onChange={(ev) => setQuery(ev.target.value)}
                placeholder="Search by order ID, service or platform"
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
                <label htmlFor="orders-platform" className="sr-only">
                  Platform
                </label>
                <select id="orders-platform" value={platform} onChange={(ev) => setPlatform(ev.target.value)} className={selectClass}>
                  <option value="all">All platforms</option>
                  {ORDER_PLATFORMS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 end-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              </div>
              <div className="relative">
                <label htmlFor="orders-sort" className="sr-only">
                  Sort by date
                </label>
                <select id="orders-sort" value={sort} onChange={(ev) => setSort(ev.target.value as SortOrder)} className={selectClass}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
                <ArrowUpDown className="pointer-events-none absolute top-1/2 end-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              </div>
            </div>
          </div>

          <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:-mx-5 sm:px-5">
            <div className="inline-flex gap-1 rounded-full bg-muted p-1" role="group" aria-label="Filter by status">
              {STATUS_FILTERS.map((f) => {
                const on = status === f.id || (status === "active" && (f.id === "pending" || f.id === "processing"));
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
                    <span className={cn("text-[0.7rem] tabular-nums", f.id === "attention" && statusCount("attention") > 0 && "text-soon opacity-100")}>
                      {statusCount(f.id)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <p aria-live="polite">
              {visible.length} order{visible.length === 1 ? "" : "s"}
              {status === "active" ? " · pending or in progress" : ""}
            </p>
            {filtered ? (
              <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                <X className="size-3.5" aria-hidden /> Clear filters
              </button>
            ) : (
              <DemoTag className="text-muted-foreground" />
            )}
          </div>
          <FxNote />
        </div>

        {visible.length ? (
          <>
            <div
              className={cn(
                "hidden gap-4 border-y bg-muted/40 px-5 py-2.5 text-[0.68rem] font-bold tracking-wider text-muted-foreground uppercase md:grid",
                ROW_COLS,
              )}
              aria-hidden
            >
              <span>Order</span>
              <span className="text-end">Quantity</span>
              <span className="text-end">Price</span>
              <span>Status</span>
              <span />
            </div>
            <ul className="divide-y border-t md:border-t-0">
              {visible.map((o) => (
                <li key={o.id}>
                  <OrderRow order={o} onOpen={() => open(o.id)} />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState status={status} filtered={filtered} onClear={clearFilters} />
        )}
      </Panel>

      <OrderDetails
        order={openOrder}
        startWithAction={actionFor === openId}
        onClose={close}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Rows                                                                      */
/* -------------------------------------------------------------------------- */

const ROW_COLS = "md:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_11.5rem_1.75rem]";

function StatusDetail({ order }: { order: LocalOrder }) {
  const progress = order.status === "processing" ? deliveryProgress(order) : null;
  if (progress) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-1.5 w-full max-w-28 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${progress.pct}%` }} />
        </span>
        <span className="text-[0.7rem] font-semibold text-muted-foreground tabular-nums">{progress.pct}%</span>
      </span>
    );
  }
  const text =
    order.status === "attention"
      ? "Action needed"
      : order.status === "completed" && order.completedAt
        ? `Completed ${formatDate(order.completedAt)}`
        : order.status === "pending"
          ? order.demoUpdated
            ? "Re-check requested (demo)"
            : "Awaiting target check"
          : null;
  if (!text) return null;
  return (
    <span className={cn("block truncate text-[0.72rem]", order.status === "attention" ? "font-semibold text-soon" : "text-muted-foreground")}>
      {text}
    </span>
  );
}

function OrderRow({ order, onOpen }: { order: LocalOrder; onOpen: () => void }) {
  const { service, platform } = orderService(order);
  const flagged = order.status === "attention";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Order ${order.id}: ${service.name}, ${ORDER_STATUS_META[order.status].label}${flagged ? `. Action needed: ${order.attention?.title}` : ""}`}
      className={cn(
        "group relative flex w-full items-start gap-3 px-4 py-4 text-start transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none sm:px-5 md:grid md:items-center md:gap-4",
        ROW_COLS,
        flagged && "bg-soon-soft/25",
        order.status === "cancelled" && "[&_.order-name]:text-muted-foreground",
      )}
    >
      {flagged ? <span className="absolute inset-y-3 start-0 w-[3px] rounded-e-full bg-soon" aria-hidden /> : null}

      <span className="flex min-w-0 flex-1 items-start gap-3 md:items-center">
        <PlatformTile platform={platform} size="md" className="size-10 rounded-xl" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="order-name text-[0.95rem] leading-snug font-semibold max-md:line-clamp-2 md:truncate">{service.name}</span>
            <span className="shrink-0 text-sm font-semibold tabular-nums md:hidden">{money(order.price)}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {order.id} · {formatDate(order.placedAt)}
            <span className="md:hidden"> · {count(order.quantity)}</span>
          </span>
          {flagged ? (
            <span className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-soon">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
              <span className="line-clamp-2">Action needed: {order.attention?.title}</span>
            </span>
          ) : null}
          <span className="mt-2 flex items-center gap-3 md:hidden">
            <OrderStatusBadge status={order.status} />
            {flagged ? null : <StatusDetail order={order} />}
          </span>
        </span>
      </span>

      <span className="hidden text-end text-sm tabular-nums md:block">{count(order.quantity)}</span>
      <span className="hidden text-end text-sm font-semibold tabular-nums md:block">{money(order.price)}</span>
      <span className="hidden min-w-0 space-y-1.5 md:block">
        <OrderStatusBadge status={order.status} />
        {flagged ? null : <StatusDetail order={order} />}
      </span>
      <span
        className="hidden size-7 place-items-center rounded-full text-muted-foreground transition-colors group-hover:bg-card group-hover:text-primary group-hover:shadow-sm md:grid"
        aria-hidden
      >
        <ChevronRight className="size-4" />
      </span>
    </button>
  );
}

function EmptyState({ status, filtered, onClear }: { status: StatusFilter; filtered: boolean; onClear: () => void }) {
  const allClear = status === "attention";
  return (
    <div className="border-t px-6 py-14 text-center">
      <span
        className={cn(
          "mx-auto grid size-12 place-items-center rounded-2xl",
          allClear ? "bg-ok-soft text-ok" : "bg-muted text-muted-foreground",
        )}
      >
        {allClear ? <CircleCheck className="size-6" aria-hidden /> : <PackageSearch className="size-6" aria-hidden />}
      </span>
      <p className="mt-4 font-semibold">
        {allClear ? "Nothing needs your attention" : filtered ? "No orders match your filters" : "No orders yet"}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {allClear
          ? "Every order is moving along. We'll let you know if anything needs a quick fix."
          : filtered
            ? "Try a different search, status or platform."
            : "When you place an order, you'll be able to track it here."}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {filtered ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-10 items-center rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:border-foreground/25"
          >
            Clear filters
          </button>
        ) : null}
        <Link
          href={newOrderHref()}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" aria-hidden /> New Order
        </Link>
      </div>
    </div>
  );
}
