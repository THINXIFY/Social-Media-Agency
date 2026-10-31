"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  CircleCheck,
  CircleOff,
  CreditCard,
  FlaskConical,
  LifeBuoy,
  Lock,
  Package,
  Search,
  SearchX,
  Settings2,
  Table2,
  Undo2,
  X,
} from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  ACTIVITY,
  ADMIN_NOW,
  ADMIN_ORDER_BY_ID,
  ADMIN_ORDER_STATUS,
  ADMIN_ORDERS,
  ADMIN_SUMMARY,
  ADMIN_USER,
  type AdminEvent,
  type AdminOrder,
  type AdminOrderStatus,
  ago,
  ATTENTION,
  CUSTOMER_BY_ID,
  dateTime,
  num,
  orderService,
  REVENUE_DAYS,
  type Severity,
  shortDate,
  SYSTEMS,
  type SystemState,
  usd,
  usdRound,
} from "@/lib/admin-demo";
import { useViewer } from "@/components/auth/viewer";
import { cn } from "@/lib/utils";
import { SelectInput } from "./form";
import { AdminDemoTag, Card, CardHeader, linkButton, OrderStatus, SEVERITY } from "./ui";

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

const greetingFor = (h: number) => (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
const noop = () => () => {};

export function AdminOverview() {
  // The signed-in staff member (display only); falls back to the demo identity outside the guarded shell.
  const viewer = useViewer();
  const firstName = viewer?.name.split(" ")[0] || ADMIN_USER.firstName;
  const params = useSearchParams();
  const pathname = usePathname();
  const [openId, setOpenId] = React.useState<string | null>(() => params.get("order"));
  const greeting = React.useSyncExternalStore(noop, () => greetingFor(new Date().getHours()), () => "Good morning");

  // Search results link to ?order=; keep the open order in the URL so it can be shared and reloaded.
  const orderParam = params.get("order");
  const [seenParam, setSeenParam] = React.useState(orderParam);
  if (orderParam !== seenParam) {
    setSeenParam(orderParam);
    if (orderParam) setOpenId(orderParam);
  }
  React.useEffect(() => {
    if (pathname !== "/admin") return;
    const url = openId ? `/admin?order=${encodeURIComponent(openId)}` : "/admin";
    if (`${location.pathname}${location.search}` !== url) window.history.replaceState(null, "", url);
  }, [openId, pathname]);

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[0.8rem] font-medium text-muted-foreground">
            {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(ADMIN_NOW))}
            <AdminDemoTag>Demo data</AdminDemoTag>
          </p>
          <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-[0.95rem] text-muted-foreground">Here&apos;s what&apos;s happening across your platform today.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Link
            href="/admin/orders"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_8px_20px_-12px_rgb(112_71_235/0.9)] transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none"
          >
            <Package className="size-4" aria-hidden /> Manage Orders
          </Link>
          <Link
            href="/admin/services"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <Settings2 className="size-4" aria-hidden /> Manage Services
          </Link>
        </div>
      </header>

      <Scorecard />

      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22.5rem]">
        <div className="grid min-w-0 gap-6">
          <Attention />
          <RecentOrders onOpen={setOpenId} />
          <Revenue />
        </div>
        <div className="grid gap-6">
          <SystemOverview />
          <ActivityFeed onOpen={setOpenId} />
        </div>
      </div>

      <OrderDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Business summary                                                          */
/* -------------------------------------------------------------------------- */

const count = (s: AdminOrderStatus) => ADMIN_ORDERS.filter((o) => o.status === s).length;
const hoursSince = (t: string) => Math.max(1, Math.round((Date.parse(ADMIN_NOW) - Date.parse(t)) / 3_600_000));

function Scorecard() {
  const s = ADMIN_SUMMARY;
  const oldestReview = ADMIN_ORDERS.filter((o) => o.status === "review").at(-1);
  const completion = Math.round((s.completed / s.totalOrders) * 100);
  const queued = count("queued");

  return (
    <section aria-labelledby="summary-title" className="@container mt-6">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 id="summary-title" className="text-[0.95rem] font-bold">
          Business summary
        </h2>
        <p className="text-xs text-muted-foreground">Illustrative figures from demo records · not real revenue</p>
      </div>
      {/*
        Compact by design: label, value, one supporting line. Sized by the section's own width,
        so the sidebar state never breaks it — phones: Revenue and review full-width, the rest 2 × 2 ·
        ~36rem: 2 columns · ~56rem: 3 × 2.
      */}
      <dl className="grid grid-cols-2 gap-2.5 @xl:auto-rows-fr @xl:gap-3 @4xl:grid-cols-3">
        {/* Revenue leads: it's the one figure every other number feeds into. Order payments minus refunds. */}
        <Kpi
          href="/admin/payments"
          linkLabel="view payments"
          label="Revenue"
          value={usd(s.revenue)}
          tone="featured"
          wide
          badge={<span className="rounded-full bg-lime px-1.5 py-px text-[0.58rem] font-extrabold tracking-wide text-graphite uppercase">Demo</span>}
          note={
            <span className="tabular-nums">
              {usd(s.orderPayments)} payments − {usd(s.refunds)} refunds
            </span>
          }
        />
        {/* Operational priority: orders waiting on staff. */}
        <Kpi
          href="/admin/orders?status=review"
          linkLabel="view orders"
          label="Awaiting review"
          value={num(s.review)}
          tone={s.review ? "attention" : undefined}
          wide
          note={oldestReview ? `Oldest waiting ${hoursSince(oldestReview.placedAt)} h` : "Queue is clear"}
        />
        <Kpi
          href="/admin/orders"
          linkLabel="view orders"
          label="Active orders"
          value={num(s.active)}
          note={
            <>
              {queued ? `${queued} queued · ` : ""}
              {count("in_progress")} in progress
            </>
          }
        />
        <Kpi href="/admin/orders?status=completed" linkLabel="view orders" label="Completed" value={num(s.completed)} note={`${completion}% of all orders`} />
        <Kpi href="/admin/orders" linkLabel="view orders" label="Total orders" value={num(s.totalOrders)} note="Last 21 days" />
        <Kpi href="/admin/customers" linkLabel="view customers" label="Customers" value={num(s.customers)} note={`${(s.totalOrders / s.customers).toFixed(1)} orders per customer`} />
      </dl>
    </section>
  );
}

/** A compact metric: label, value, one line of context. The whole card links to its records. */
function Kpi({
  href,
  linkLabel,
  label,
  value,
  note,
  badge,
  tone,
  wide,
}: {
  href: string;
  linkLabel: string;
  label: string;
  value: string;
  note: React.ReactNode;
  badge?: React.ReactNode;
  tone?: "featured" | "attention";
  /** Full width on phones, where the rest sit two to a row. */
  wide?: boolean;
}) {
  const featured = tone === "featured";
  const attention = tone === "attention";
  return (
    <div
      className={cn(
        "group/kpi relative flex min-w-0 flex-col rounded-2xl border bg-card px-4 py-3.5 transition-colors hover:border-foreground/20 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-primary/30 @xl:px-5 @xl:py-4",
        wide && "col-span-2 @xl:col-span-1",
        featured && "border-transparent bg-graphite bg-[linear-gradient(135deg,transparent_55%,rgb(112_71_235/0.16))] text-white hover:border-white/15 dark:border-white/10 dark:bg-[#1b1c23]",
        attention && "border-soon/35 bg-soon-soft/25 hover:border-soon/60 dark:bg-soon-soft/10",
      )}
    >
      <dt className={cn("flex items-center gap-1.5 pe-5 text-[0.78rem] font-medium whitespace-nowrap", featured ? "text-white/65" : attention ? "text-soon" : "text-muted-foreground")}>
        {attention ? <span className="size-1.5 shrink-0 rounded-full bg-soon" aria-hidden /> : null}
        <Link href={href} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none">
          {label}
          <span className="sr-only">, {linkLabel}</span>
        </Link>
        {badge}
      </dt>
      <ArrowUpRight className={cn("absolute end-3.5 top-3.5 size-3.5 opacity-0 transition-opacity group-hover/kpi:opacity-60 motion-reduce:transition-none", featured ? "text-white" : "text-muted-foreground")} aria-hidden />
      <dd className={cn("mt-1 font-heading text-[1.5rem] leading-tight font-extrabold tracking-[-0.015em] tabular-nums @xl:text-[1.7rem]", attention && "text-soon")}>{value}</dd>
      <dd className={cn("mt-auto pt-0.5 text-[0.78rem] leading-snug", featured ? "text-white/60" : "text-muted-foreground")}>{note}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Requires attention                                                        */
/* -------------------------------------------------------------------------- */

const ROW_TONE: Record<Severity, string> = {
  critical: "bg-destructive/[0.05] dark:bg-destructive/[0.08]",
  high: "",
  medium: "",
};

function Attention() {
  const order: Severity[] = ["critical", "high", "medium"];
  const items = ATTENTION.filter((a) => a.count > 0).sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  const tally = order.map((sev) => ({ sev, n: items.filter((i) => i.severity === sev).length })).filter((t) => t.n);

  return (
    <Card aria-labelledby="attention-title" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
        <div>
          <h2 id="attention-title" className="text-[0.95rem] font-bold">
            Requires attention
          </h2>
          <p className="mt-0.5 text-[0.8rem] text-muted-foreground">Highest severity first. Actions open previews — nothing can be approved yet.</p>
        </div>
        <ul className="flex flex-wrap gap-1.5" aria-label="By severity">
          {tally.map(({ sev, n }) => {
            const { label, className, Icon } = SEVERITY[sev];
            return (
              <li key={sev} className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold", className)}>
                <Icon className="size-3.5" aria-hidden />
                {n} {label.toLowerCase()}
              </li>
            );
          })}
        </ul>
      </div>
      {items.length ? (
        <ul className="divide-y">
          {items.map((a) => {
            const { Icon, className, dot, label } = SEVERITY[a.severity];
            const critical = a.severity === "critical";
            return (
              <li key={a.id} className={cn("relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-3 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center sm:px-5", ROW_TONE[a.severity])}>
                <span className={cn("absolute inset-y-3 start-0 w-1 rounded-e-full", dot)} aria-hidden />
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", className)}>
                  <Icon className="size-[1.15rem]" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-[0.95rem] font-semibold">{a.title}</span>
                    <span className={cn("text-[0.7rem] font-bold tracking-wide uppercase", className.split(" ").find((c) => c.startsWith("text-")))}>
                      {label}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{a.detail}</p>
                </div>
                <p className="col-start-2 flex items-baseline gap-1.5 sm:col-start-auto sm:block sm:min-w-16 sm:text-end">
                  <span className="font-heading text-2xl leading-none font-extrabold tabular-nums">{a.count}</span>
                  <span className="text-xs text-muted-foreground sm:block">affected</span>
                </p>
                <Link
                  href={a.href}
                  className={cn(
                    "col-span-2 inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:outline-none sm:col-span-1",
                    critical
                      ? "bg-foreground text-background hover:bg-foreground/85 focus-visible:ring-foreground/30"
                      : "border bg-card hover:border-primary/40 hover:text-primary focus-visible:ring-primary/30",
                  )}
                >
                  {a.action} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-ok" aria-hidden /> Nothing needs attention right now.
        </p>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Recent orders                                                             */
/* -------------------------------------------------------------------------- */

type Sort = "newest" | "oldest" | "amount";
const ROWS = 8;
// Date sits under the order ID and the customer under the service, so names never get cut short.
const COLS = "md:grid-cols-[6.75rem_minmax(0,1fr)_6rem_9rem_6.5rem]";

function RecentOrders({ onOpen }: { onOpen: (id: string) => void }) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<AdminOrderStatus | "all">("all");
  const [sort, setSort] = React.useState<Sort>("newest");
  const q = query.trim().toLowerCase();

  const matches = ADMIN_ORDERS.filter((o) => {
    if (status !== "all" && o.status !== status) return false;
    if (!q) return true;
    const { service, platform } = orderService(o);
    return [o.id, CUSTOMER_BY_ID[o.customerId].name, service.name, platform.name].some((v) => v.toLowerCase().includes(q));
  }).sort((a, b) =>
    sort === "amount" ? b.amount - a.amount : sort === "oldest" ? a.placedAt.localeCompare(b.placedAt) : b.placedAt.localeCompare(a.placedAt),
  );
  const rows = matches.slice(0, ROWS);
  const filtered = Boolean(q) || status !== "all";

  const control =
    "h-10 w-full rounded-xl border bg-background text-sm transition-colors outline-none hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 dark:bg-muted/40";

  return (
    <Card aria-labelledby="orders-title" className="overflow-hidden">
      <div className="space-y-3.5 p-4 sm:p-5">
        <CardHeader
          id="orders-title"
          title="Recent orders"
          description="All customers, newest first."
          action={
            <Link href="/admin/orders" className={linkButton}>
              All orders <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          }
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_10rem]">
          <div className="relative">
            <label htmlFor="admin-orders-search" className="sr-only">
              Search orders
            </label>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              id="admin-orders-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Order ID, customer or service"
              autoComplete="off"
              className={cn(control, "ps-9 pe-9 [&::-webkit-search-cancel-button]:hidden")}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute end-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
          <div>
            <label htmlFor="admin-orders-status" className="sr-only">
              Filter by status
            </label>
            <SelectInput id="admin-orders-status" value={status} onChange={(e) => setStatus(e.target.value as AdminOrderStatus | "all")} className={cn(control, "px-3")}>
              <option value="all">All statuses</option>
              {(Object.keys(ADMIN_ORDER_STATUS) as AdminOrderStatus[]).map((s) => (
                <option key={s} value={s}>
                  {ADMIN_ORDER_STATUS[s].label}
                </option>
              ))}
            </SelectInput>
          </div>
          <div>
            <label htmlFor="admin-orders-sort" className="sr-only">
              Sort
            </label>
            <SelectInput id="admin-orders-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={cn(control, "ps-3")}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="amount">Highest amount</option>
            </SelectInput>
          </div>
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {matches.length ? `Showing ${rows.length} of ${matches.length} order${matches.length === 1 ? "" : "s"}` : "No matching orders"}
        </p>
      </div>

      {rows.length ? (
        <>
          <div className={cn("hidden gap-4 border-y bg-muted/40 px-5 py-2.5 text-[0.7rem] font-bold tracking-wider text-muted-foreground uppercase md:grid", COLS)} aria-hidden>
            <span>Order</span>
            <span>Service · Customer</span>
            <span className="text-end">Amount</span>
            <span>Status</span>
            <span />
          </div>
          <ul className="divide-y border-t md:border-t-0" aria-label="Recent orders">
            {rows.map((o) => {
              const { service, platform } = orderService(o);
              const customer = CUSTOMER_BY_ID[o.customerId];
              return (
                <li
                  key={o.id}
                  className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 px-4 py-3.5 transition-colors hover:bg-muted/40 sm:px-5 md:gap-4", COLS)}
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-[0.82rem] font-semibold">{o.id}</span>
                    <span className="block text-xs text-muted-foreground">{shortDate(o.placedAt)}</span>
                  </span>
                  <span className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
                    <PlatformTile platform={platform} size="sm" className="size-9 rounded-xl" />
                    <span className="min-w-0">
                      <span className="line-clamp-2 block text-sm leading-snug font-semibold">{service.name}</span>
                      <span className="block truncate text-[0.8rem] text-muted-foreground" title={customer.email}>
                        {customer.name}
                      </span>
                    </span>
                  </span>
                  <span className="row-start-1 text-end text-[0.95rem] font-semibold tabular-nums max-md:col-start-2 md:row-auto">{usd(o.amount)}</span>
                  <span>
                    <OrderStatus status={o.status} />
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpen(o.id)}
                    aria-label={`View details for ${o.id}`}
                    className="group inline-flex h-8 items-center justify-center gap-0.5 justify-self-end rounded-full ps-3 pe-2 text-[0.8rem] font-semibold text-primary transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
                  >
                    Details
                    <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="border-t px-6 py-10 text-center">
          <SearchX className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-semibold">No orders match</p>
          <p className="mt-1 text-xs text-muted-foreground">Try another search or status.</p>
          {filtered ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
              className={cn(linkButton, "mt-2")}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Revenue snapshot                                                          */
/* -------------------------------------------------------------------------- */

function Revenue() {
  const s = ADMIN_SUMMARY;
  const [table, setTable] = React.useState(false);
  const [hover, setHover] = React.useState<number | null>(null);
  const max = Math.max(...REVENUE_DAYS.map((d) => d.net), 1);
  const peak = REVENUE_DAYS.findIndex((d) => d.net === max);
  // A round axis top so gridlines land on readable values.
  const step = max > 200 ? 100 : max > 80 ? 50 : 20;
  const top = Math.ceil(max / step) * step;
  const total14 = REVENUE_DAYS.reduce((n, d) => n + d.net, 0);
  const range = `${shortDate(REVENUE_DAYS[0].date)} – ${shortDate(REVENUE_DAYS[13].date)}`;

  return (
    <Card aria-labelledby="revenue-title" className="overflow-hidden">
      <div className="p-4 sm:p-5">
        <CardHeader
          id="revenue-title"
          title="Revenue snapshot"
          description={`Net revenue per day · ${range}`}
          action={
            <button type="button" onClick={() => setTable((v) => !v)} aria-pressed={table} className={cn(linkButton, "border bg-card")}>
              {table ? <BarChart3 className="size-3.5" aria-hidden /> : <Table2 className="size-3.5" aria-hidden />}
              {table ? "Chart" : "Table"}
            </button>
          }
        />

        {/* How revenue is built, and what isn't revenue. */}
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <dl className="flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl bg-muted/50 px-4 py-3 dark:bg-muted/30">
            <div>
              <dt className="text-xs text-muted-foreground">Order payments</dt>
              <dd className="text-[0.95rem] font-semibold tabular-nums">{usd(s.orderPayments)}</dd>
            </div>
            <span className="pb-0.5 text-muted-foreground" aria-hidden>
              −
            </span>
            <div>
              <dt className="text-xs text-muted-foreground">Refunds</dt>
              <dd className="text-[0.95rem] font-semibold tabular-nums">{usd(s.refunds)}</dd>
            </div>
            <span className="pb-0.5 text-muted-foreground" aria-hidden>
              =
            </span>
            <div>
              <dt className="text-xs font-semibold text-foreground">Revenue</dt>
              <dd className="font-heading text-xl leading-tight font-extrabold tabular-nums">{usd(s.revenue)}</dd>
            </div>
          </dl>
          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-dashed px-4 py-3">
            <div>
              <dt className="text-xs text-muted-foreground">Deposits credited</dt>
              <dd className="text-[0.95rem] font-semibold tabular-nums">{usd(s.deposits)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Wallet liabilities</dt>
              <dd className="text-[0.95rem] font-semibold tabular-nums">{usd(s.liabilities)}</dd>
            </div>
            <dd className="col-span-2 -mt-1 text-[0.72rem] leading-snug text-muted-foreground">Customer money held in wallets — not revenue.</dd>
          </dl>
        </div>
      </div>

      <div className="border-t px-4 pt-4 pb-4 sm:px-5">
        {table ? (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <caption className="sr-only">Net revenue per day, {range}</caption>
              <thead className="bg-muted/40 text-[0.68rem] tracking-wider text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-bold">Date</th>
                  <th scope="col" className="px-3 py-2 text-end font-bold">Orders</th>
                  <th scope="col" className="px-3 py-2 text-end font-bold">Payments</th>
                  <th scope="col" className="px-3 py-2 text-end font-bold">Refunds</th>
                  <th scope="col" className="px-3 py-2 text-end font-bold">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y tabular-nums">
                {[...REVENUE_DAYS].reverse().map((d) => (
                  <tr key={d.date}>
                    <th scope="row" className="px-3 py-1.5 text-start font-medium">{shortDate(d.date)}</th>
                    <td className="px-3 py-1.5 text-end">{d.orders}</td>
                    <td className="px-3 py-1.5 text-end">{usd(d.payments)}</td>
                    <td className="px-3 py-1.5 text-end">{d.refunds ? `−${usd(d.refunds)}` : "—"}</td>
                    <td className="px-3 py-1.5 text-end font-semibold">{usd(d.net)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/30 font-semibold tabular-nums">
                <tr>
                  <th scope="row" className="px-3 py-2 text-start">14 days</th>
                  <td colSpan={3} />
                  <td className="px-3 py-2 text-end">{usd(total14)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <figure className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm">
                <span className="font-heading text-lg font-extrabold tabular-nums">{usd(total14)}</span>{" "}
                <span className="text-muted-foreground">net over 14 days</span>
              </p>
            </div>
            <div className="mt-3 flex gap-2.5">
              {/* Y axis */}
              <div className="flex h-48 flex-col justify-between text-end text-[0.7rem] text-muted-foreground tabular-nums" aria-hidden>
                <span className="-translate-y-1/2">{usdRound(top)}</span>
                <span>{usdRound(top / 2)}</span>
                <span className="translate-y-1/2">$0</span>
              </div>
              <div className="relative h-48 min-w-0 flex-1">
                {/* Hairline gridlines */}
                {[0, 50, 100].map((p) => (
                  <span key={p} className="absolute inset-x-0 h-px bg-border" style={{ top: `${p}%` }} aria-hidden />
                ))}
                <ul className="absolute inset-0 flex items-end gap-[2px]" aria-label={`Net revenue per day, ${range}`}>
                  {REVENUE_DAYS.map((d, i) => {
                    const h = (d.net / top) * 100;
                    const on = hover === i;
                    return (
                      <li key={d.date} className="relative flex h-full flex-1 items-end justify-center">
                        {/* Label only the peak; the tooltip and table carry the rest. */}
                        {i === peak && hover === null ? (
                          <span className="pointer-events-none absolute z-[1] text-[0.68rem] font-semibold whitespace-nowrap tabular-nums" style={{ bottom: `calc(${h}% + 0.3rem)` }} aria-hidden>
                            {usdRound(d.net)}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onMouseEnter={() => setHover(i)}
                          onMouseLeave={() => setHover(null)}
                          onFocus={() => setHover(i)}
                          onBlur={() => setHover(null)}
                          aria-label={`${shortDate(d.date)}: ${usd(d.net)} net revenue from ${d.orders} orders`}
                          className="flex h-full w-full items-end justify-center rounded-sm focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                        >
                          <span
                            className={cn("block w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity motion-reduce:transition-none", hover !== null && !on && "opacity-40")}
                            style={{ height: `${Math.max(h, d.net > 0 ? 1.5 : 0)}%` }}
                          />
                        </button>
                        {on ? (
                          <span
                            role="tooltip"
                            className={cn(
                              "pointer-events-none absolute z-10 w-max rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-float",
                              i > REVENUE_DAYS.length - 4 ? "end-0" : i < 3 ? "start-0" : "start-1/2 -translate-x-1/2",
                            )}
                            style={{ bottom: `calc(${Math.min(h, 100)}% + 0.4rem)` }}
                          >
                            <span className="block font-semibold">{shortDate(d.date)}</span>
                            <span className="block tabular-nums">{usd(d.net)} net</span>
                            <span className="block text-muted-foreground">
                              {d.orders} orders{d.refunds ? ` · −${usd(d.refunds)} refunds` : ""}
                            </span>
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
            {/* Day numbers on alternate days keep labels legible on phones; the range is in the header. */}
            <div className="mt-2 flex gap-[2px] ps-[3.1rem] text-[0.7rem] text-muted-foreground tabular-nums" aria-hidden>
              {REVENUE_DAYS.map((d, i) => (
                <span key={d.date} className="flex-1 text-center">
                  {i % 2 === 0 ? new Date(d.date).getUTCDate() : ""}
                </span>
              ))}
            </div>
            <figcaption className="mt-3 text-xs text-muted-foreground">Demo records. Hover or focus a day for details, or switch to the table.</figcaption>
          </figure>
        )}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Activity                                                                  */
/* -------------------------------------------------------------------------- */

const EVENT: Record<AdminEvent["kind"], { label: string; Icon: typeof Package; className: string }> = {
  order: { label: "Order", Icon: Package, className: "bg-secondary text-secondary-foreground" },
  payment: { label: "Payment", Icon: CreditCard, className: "bg-ok-soft text-ok" },
  support: { label: "Support", Icon: LifeBuoy, className: "bg-soon-soft text-soon" },
  refund: { label: "Refund", Icon: Undo2, className: "bg-off-soft text-off" },
  system: { label: "System", Icon: FlaskConical, className: "bg-muted text-muted-foreground" },
};

const dayLabel = (t: string) => {
  const days = Math.floor((Date.UTC(2026, 9, 28) - Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate())) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : shortDate(t);
};

function ActivityFeed({ onOpen }: { onOpen: (id: string) => void }) {
  const groups = ACTIVITY.reduce<{ day: string; events: AdminEvent[] }[]>((acc, e) => {
    const day = dayLabel(e.at);
    const last = acc.at(-1);
    if (last?.day === day) last.events.push(e);
    else acc.push({ day, events: [e] });
    return acc;
  }, []);

  return (
    <Card aria-labelledby="activity-title" className="p-4 sm:p-5">
      <CardHeader id="activity-title" title="Activity" description="Latest events · times in UTC" action={<AdminDemoTag />} />
      <div className="mt-4 space-y-4">
        {groups.map((g) => (
          <section key={g.day} aria-label={g.day}>
            <h3 className="mb-2 text-[0.7rem] font-bold tracking-wider text-muted-foreground uppercase">{g.day}</h3>
            <ol className="space-y-1">
              {g.events.map((e) => {
                const { Icon, className, label } = EVENT[e.kind];
                const order = e.ref && ADMIN_ORDER_BY_ID[e.ref];
                return (
                  <li key={e.id} className="flex gap-3 rounded-xl px-1 py-2">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", className)}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">
                        <span className="font-semibold">{e.actor}</span> <span className="text-muted-foreground">{e.action}</span>
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground/70">{label}</span>
                        {order ? (
                          <button
                            type="button"
                            onClick={() => onOpen(order.id)}
                            className="rounded font-mono font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                          >
                            {e.ref}
                          </button>
                        ) : (
                          <span className="font-mono">{e.ref}</span>
                        )}
                        <time dateTime={e.at} title={dateTime(e.at)} className="ms-auto tabular-nums">
                          {ago(e.at)}
                        </time>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  System overview                                                           */
/* -------------------------------------------------------------------------- */

const SYSTEM_STATE: Record<SystemState, { label: string; chip: string; tile: string; Icon: typeof CircleCheck }> = {
  connected: { label: "Connected", chip: "bg-ok-soft text-ok", tile: "bg-ok-soft text-ok", Icon: CircleCheck },
  demo: { label: "Demo only", chip: "bg-soon-soft text-soon", tile: "bg-soon-soft text-soon", Icon: FlaskConical },
  not_configured: { label: "Not configured", chip: "bg-destructive/10 text-destructive", tile: "bg-destructive/10 text-destructive", Icon: CircleOff },
};

function SystemOverview() {
  const connected = SYSTEMS.filter((s) => s.state === "connected").length;
  return (
    <Card aria-labelledby="systems-title" className="overflow-hidden">
      <div className="p-4 pb-3 sm:p-5 sm:pb-3">
        <CardHeader id="systems-title" title="System overview" description="Integrations this platform depends on." />
        <div className="mt-3.5 flex items-center gap-3">
          <p className="font-heading text-2xl font-extrabold tabular-nums">
            {connected}
            <span className="text-base font-bold text-muted-foreground"> / {SYSTEMS.length}</span>
          </p>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">Systems connected</p>
            <span className="mt-1 flex gap-1" aria-hidden>
              {SYSTEMS.map((s) => (
                <span key={s.id} className={cn("h-1.5 flex-1 rounded-full", s.state === "connected" ? "bg-ok" : s.state === "demo" ? "bg-soon" : "bg-destructive/40")} />
              ))}
            </span>
          </div>
        </div>
      </div>
      <ul className="divide-y border-t">
        {SYSTEMS.map((s) => {
          const { label, chip, tile, Icon } = SYSTEM_STATE[s.state];
          return (
            <li key={s.id} className="flex gap-3 px-4 py-3 sm:px-5">
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", tile)}>
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <p className="text-sm font-semibold">{s.label}</p>
                  <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[0.68rem] font-bold", chip)}>{label}</span>
                </div>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{s.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Order details (read-only)                                                 */
/* -------------------------------------------------------------------------- */

function OrderDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [shown, setShown] = React.useState(id);
  if (id && id !== shown) setShown(id);
  const order = ADMIN_ORDER_BY_ID[id ?? shown ?? ""];
  return (
    <Sheet open={Boolean(id && ADMIN_ORDER_BY_ID[id])} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[28rem]">
        {order ? <OrderBody order={order} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function OrderBody({ order: o, onClose }: { order: AdminOrder; onClose: () => void }) {
  const { service, platform } = orderService(o);
  const c = CUSTOMER_BY_ID[o.customerId];
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium">{value}</dd>
    </div>
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-5 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <PlatformTile platform={platform} size="md" className="size-11 rounded-xl" />
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-heading text-lg leading-tight font-bold">{service.name}</SheetTitle>
            <SheetDescription className="mt-0.5 text-sm">
              <span className="font-mono">{o.id}</span> · {platform.name}
            </SheetDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close order details"
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <OrderStatus status={o.status} />
          <AdminDemoTag>Demo record</AdminDemoTag>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
          {ADMIN_ORDER_STATUS[o.status].note}
          {o.flag ? <span className="mt-1.5 block font-medium text-soon">Flag: {o.flag}</span> : null}
        </p>
        <dl className="divide-y rounded-xl border">
          {row(
            "Customer",
            <span>
              {c.name}
              <span className="block text-xs font-normal text-muted-foreground">{c.email}</span>
            </span>,
          )}
          {row("Quantity", num(o.quantity))}
          {row("Amount", usd(o.amount))}
          {o.refunded ? row("Refunded", `−${usd(o.refunded)}`) : null}
          {row("Placed", dateTime(o.placedAt))}
        </dl>
        <div className="rounded-xl border border-dashed p-3.5 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <Lock className="size-4 text-muted-foreground" aria-hidden /> Admin actions aren&apos;t enabled
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Approving, rejecting, refunding and sending to a provider arrive with the Orders page and a backend. Nothing here changes the
            customer&apos;s order or wallet.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {["Approve", "Refund"].map((label) => (
              <button key={label} type="button" disabled className="h-9 cursor-not-allowed rounded-full border text-xs font-semibold text-muted-foreground">
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
