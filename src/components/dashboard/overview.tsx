"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronRight,
  CircleCheck,
  Eye,
  EyeOff,
  Heart,
  Info,
  LifeBuoy,
  PackageSearch,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  SearchX,
  TriangleAlert,
  Wallet,
  X,
} from "lucide-react";
import { PlatformIcon, PlatformTile } from "@/components/brand";
import { CATEGORY_ICONS } from "@/components/site/primitives";
import {
  CATALOG_TOTALS,
  CATEGORY_META,
  matchesQuery,
  PLATFORM_BY_ID,
  SERVICE_BY_ID,
  SERVICES,
  type Service,
} from "@/lib/catalog";
import {
  count,
  DEMO_WALLET,
  type DemoOrder,
  formatDate,
  money,
  ORDER_STATUS_META,
  orderService,
} from "@/lib/demo-account";
import { formatMoneyParts, useDisplay } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type LocalOrder, useDemoActivity, useDemoOrders, useFavorites, useProfile, whenLabel } from "./demo-store";
import { FavoriteButton } from "./favorite-button";
import { FxNote } from "./region";
import { FinderPrompt } from "./service-finder";
import {
  DemoTag,
  enter,
  newOrderHref,
  ordersHref,
  OrderStatusBadge,
  Panel,
  PanelHeader,
  ROUTES,
  useDestinations,
} from "./shared";
import { ACTIVITY_ICONS } from "./top-bar";

const primaryBtn =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_10px_28px_-12px_rgb(112_71_235/0.8)] transition-all hover:-translate-y-px hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none active:translate-y-0";
const secondaryBtn =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full border bg-card px-5 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";
const ghostLink =
  "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold text-primary transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";

type OrderFilter = "all" | "active" | "attention" | "completed";

const inFilter = (o: DemoOrder, f: OrderFilter) =>
  f === "all" ||
  (f === "active" && (o.status === "pending" || o.status === "processing")) ||
  o.status === f;

const progressOf = (o: DemoOrder) => Math.round(((o.delivered ?? 0) / o.quantity) * 100);

function useOpenOrder() {
  const go = useDestinations();
  return (o: DemoOrder) => go("orders", { query: { order: o.id } });
}

/* -------------------------------------------------------------------------- */
/*  1 · Welcome                                                               */
/* -------------------------------------------------------------------------- */

const greetingFor = (h: number) => (h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
const noopSubscribe = () => () => {};

function Welcome({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const go = useDestinations();
  const openOrder = useOpenOrder();
  const greeting = React.useSyncExternalStore(
    noopSubscribe,
    () => greetingFor(new Date().getHours()),
    () => "Welcome back",
  );
  const { recent, summary } = useDemoOrders();
  const { profile } = useProfile();
  const live = recent.find((o) => o.status === "processing")!;
  const { service, platform } = orderService(live);
  const pct = progressOf(live);

  return (
    <Panel className={cn("relative isolate overflow-hidden", className)} style={style} aria-labelledby="welcome-title">
      <div
        className="pointer-events-none absolute -top-40 -end-24 -z-10 size-96 rounded-full bg-primary/10 blur-3xl dark:bg-primary/15"
        aria-hidden
      />

      <div className="flex flex-col gap-5 p-4 sm:p-7 2xl:flex-row 2xl:items-end 2xl:justify-between 2xl:gap-8">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {greeting}
            <span className="size-1 rounded-full bg-border" aria-hidden />
            <DemoTag className="text-primary">Demo workspace</DemoTag>
          </p>
          <h1 id="welcome-title" className="mt-2 text-[1.75rem] leading-[1.1] font-extrabold tracking-tight sm:text-[2.25rem]">
            Hi {profile.displayName}, ready for your next order?
          </h1>
          <p className="mt-2.5 max-w-lg text-[0.95rem] leading-relaxed text-muted-foreground">
            {summary.active} orders are in progress and{" "}
            {summary.attention ? (
              <>
                <span className="font-semibold text-soon">
                  {summary.attention} {summary.attention === 1 ? "needs" : "need"} a quick fix
                </span>{" "}
                from you.
              </>
            ) : (
              "nothing needs a fix from you."
            )}
          </p>
        </div>

        <div className="grid shrink-0 grid-cols-[1.3fr_1fr] gap-2.5 sm:flex">
          <button type="button" className={cn(primaryBtn, "h-12 px-4 text-[0.95rem] whitespace-nowrap sm:px-6")} onClick={() => go("new-order")}>
            <Plus className="size-[1.1rem]" strokeWidth={2.6} aria-hidden />
            New Order
          </button>
          <button type="button" className={cn(secondaryBtn, "h-12 px-4 whitespace-nowrap sm:px-5")} onClick={() => go("add-funds")}>
            <Wallet className="size-4" aria-hidden />
            Add Funds
          </button>
        </div>
      </div>

      {/* Live delivery, integrated as the card's footer */}
      <button
        type="button"
        onClick={() => openOrder(live)}
        className="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t bg-muted/40 px-4 py-3.5 text-start transition-colors hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none sm:grid-cols-[auto_minmax(0,14rem)_minmax(0,1fr)_auto] sm:px-7"
        aria-label={`In delivery: ${service.name}, ${pct}% delivered. View order ${live.id}`}
      >
        <PlatformTile platform={platform} size="sm" />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[0.68rem] font-bold tracking-wider text-primary uppercase">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden />
            In delivery
          </span>
          <span className="block truncate text-sm font-semibold">
            {service.name} <span className="font-normal text-muted-foreground">· {live.id}</span>
          </span>
        </span>
        <span className="col-span-3 row-start-2 flex items-center gap-3 sm:col-span-1 sm:row-start-auto">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/80">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {count(live.delivered ?? 0)} / {count(live.quantity)}
          </span>
        </span>
        <span className="col-start-3 row-start-1 flex items-center gap-1 text-sm font-semibold sm:col-start-auto sm:row-start-auto">
          {pct}%
          <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
        </span>
      </button>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/*  2 · Wallet                                                                */
/* -------------------------------------------------------------------------- */

function WalletCard({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const go = useDestinations();
  const [hidden, setHidden] = React.useState(false);
  const { main: whole, rest: cents } = formatMoneyParts(DEMO_WALLET.balance);

  return (
    <section
      aria-labelledby="wallet-title"
      className={cn(
        "relative isolate flex flex-col overflow-hidden rounded-3xl bg-graphite p-5 text-white shadow-float sm:p-6 dark:bg-[#17181e] dark:ring-1 dark:ring-white/10",
        className,
      )}
      style={style}
    >
      {/* Card texture: soft lime light + fine rings */}
      <div className="pointer-events-none absolute -end-20 -bottom-24 -z-10 size-64 rounded-full bg-lime/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -top-24 -start-10 -z-10 size-56 rounded-full bg-primary/35 blur-3xl" aria-hidden />
      <svg className="pointer-events-none absolute -top-16 -end-16 -z-10 size-56 text-white/[0.07]" viewBox="0 0 200 200" aria-hidden>
        {[30, 50, 70, 90].map((r) => (
          <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="currentColor" strokeWidth="1" />
        ))}
      </svg>

      <div className="flex items-center justify-between gap-3">
        <h2 id="wallet-title" className="flex items-center gap-2 text-sm font-semibold text-white/75">
          <span className="grid size-7 place-items-center rounded-lg bg-white/10">
            <Wallet className="size-4 text-lime" aria-hidden />
          </span>
          Available balance
        </h2>
        <div className="flex items-center gap-1.5">
          <DemoTag className="text-white/55" />
          <button
            type="button"
            onClick={() => setHidden((h) => !h)}
            aria-pressed={hidden}
            aria-label={hidden ? "Show balance" : "Hide balance"}
            className="grid size-8 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-lime/50 focus-visible:outline-none"
          >
            {hidden ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
          </button>
        </div>
      </div>

      <p className="mt-5 font-heading leading-none font-extrabold tracking-tight tabular-nums" aria-live="polite">
        {hidden ? (
          <span className="text-[2.6rem] text-white/80">
            <span className="sr-only">Balance hidden</span>
            <span aria-hidden>$•••••</span>
          </span>
        ) : (
          <>
            <span className="text-[2.6rem] sm:text-5xl">{whole}</span>
            <span className="text-2xl text-white/55">{cents}</span>
          </>
        )}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 text-sm">
        <div className="flex flex-col-reverse gap-0.5 bg-graphite/80 px-3.5 py-3 dark:bg-[#17181e]/90">
          <dt className="text-xs text-white/55">Last top-up · {formatDate(DEMO_WALLET.lastTopUp.at)}</dt>
          <dd className="font-semibold tabular-nums">{hidden ? "•••" : money(DEMO_WALLET.lastTopUp.amount)}</dd>
        </div>
        <div className="flex flex-col-reverse gap-0.5 bg-graphite/80 px-3.5 py-3 dark:bg-[#17181e]/90">
          <dt className="text-xs text-white/55">Net spent in October</dt>
          <dd className="font-semibold tabular-nums">{hidden ? "•••" : money(DEMO_WALLET.spentThisMonth)}</dd>
        </div>
      </dl>
      <FxNote tone="inverse" className="mt-3" />

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => go("add-funds")}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-lime text-sm font-semibold text-graphite transition-transform hover:-translate-y-px focus-visible:ring-3 focus-visible:ring-lime/50 focus-visible:outline-none"
        >
          <Plus className="size-4" strokeWidth={2.6} aria-hidden /> Add Funds
        </button>
        <button
          type="button"
          onClick={() => go("transactions")}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-white/10 text-sm font-semibold text-white transition-colors hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-white/30 focus-visible:outline-none"
        >
          <ArrowLeftRight className="size-4" aria-hidden /> Transactions
        </button>
      </div>

      <p className="mt-auto flex gap-2 pt-4 text-[0.72rem] leading-relaxed text-white/50">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        Demo balance for preview only. No real funds are held and payments aren&apos;t enabled yet.
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  3 · Order summary                                                         */
/* -------------------------------------------------------------------------- */

const segmentsOf = (summary: ReturnType<typeof useDemoOrders>["summary"]) => [
  {
    id: "attention",
    label: "Need attention",
    hint: "Paused for you",
    value: summary.attention,
    Icon: TriangleAlert,
    bar: "bg-soon",
    chip: "bg-soon-soft text-soon",
    tile: summary.attention ? "border-soon/30 bg-soon-soft/40" : "",
  },
  {
    id: "active",
    label: "In progress",
    hint: "Queued or delivering",
    value: summary.active,
    Icon: RefreshCw,
    bar: "bg-primary",
    chip: "bg-secondary text-secondary-foreground",
    tile: "",
  },
  {
    id: "completed",
    label: "Completed",
    hint: "Delivered",
    value: summary.completed,
    Icon: CircleCheck,
    bar: "bg-ok",
    chip: "bg-ok-soft text-ok",
    tile: "",
  },
] as const;

function OrderSummary({
  filter,
  onFilter,
  className,
  style,
}: {
  filter: OrderFilter;
  onFilter: (f: OrderFilter) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { summary } = useDemoOrders();
  const SEGMENTS = segmentsOf(summary);
  return (
    <Panel className={cn("flex flex-col p-4 sm:p-6", className)} style={style} aria-labelledby="summary-title">
      <PanelHeader
        id="summary-title"
        title="Orders at a glance"
        description={`All time${summary.cancelled ? ` · ${summary.cancelled} cancelled` : ""} · demo data`}
        action={
          <p className="flex items-baseline gap-1.5">
            <span className="font-heading text-[1.75rem] leading-none font-extrabold tabular-nums">{summary.total}</span>
            <span className="text-xs font-medium text-muted-foreground">total</span>
          </p>
        }
      />

      <div
        className="mt-4 flex h-2 gap-1"
        role="img"
        aria-label={SEGMENTS.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(", ")}
      >
        {SEGMENTS.map((s) => (
          <span
            key={s.id}
            className={cn("rounded-full transition-opacity", s.bar, filter !== "all" && filter !== s.id && "opacity-25")}
            style={{ flexGrow: s.value }}
          />
        ))}
      </div>

      <div className="mt-auto grid grid-cols-3 gap-2 pt-4 sm:gap-3" role="group" aria-label="Filter recent orders by status">
        {SEGMENTS.map((s) => {
          const on = filter === s.id;
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                onFilter(on ? "all" : s.id);
                document.getElementById("recent-orders")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={cn(
                "group relative flex flex-col rounded-2xl border p-3 text-start transition-all hover:border-foreground/20 hover:shadow-soft focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:p-3.5",
                s.tile,
                on && "border-foreground/70 ring-1 ring-foreground/70 hover:border-foreground/70",
              )}
            >
              <span className="flex items-center justify-between">
                <span className={cn("grid size-7 place-items-center rounded-lg", s.chip)}>
                  <s.Icon className="size-3.5" aria-hidden />
                </span>
                {on ? <Check className="size-4" strokeWidth={2.6} aria-hidden /> : null}
              </span>
              <span className="mt-3 font-heading text-2xl leading-none font-extrabold tabular-nums sm:text-[1.75rem]">
                {s.value}
              </span>
              <span className="mt-1.5 text-[0.8rem] leading-tight font-semibold">{s.label}</span>
              <span className="mt-0.5 hidden text-[0.72rem] text-muted-foreground sm:block">{s.hint}</span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/*  4 · Recent orders                                                         */
/* -------------------------------------------------------------------------- */

const FILTERS: { id: OrderFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "attention", label: "Needs attention" },
  { id: "active", label: "In progress" },
  { id: "completed", label: "Completed" },
];

const ROW_COLS = "md:grid-cols-[minmax(0,1fr)_5rem_5rem_9rem_1.75rem]";

function RecentOrders({
  filter,
  onFilter,
  className,
  style,
}: {
  filter: OrderFilter;
  onFilter: (f: OrderFilter) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const go = useDestinations();
  const openOrder = useOpenOrder();
  const { recent, summary } = useDemoOrders();
  const orders = recent.filter((o) => inFilter(o, filter));

  return (
    <Panel id="recent-orders" className={cn("scroll-mt-24 overflow-hidden", className)} style={style} aria-labelledby="orders-title">
      <div className="p-4 pb-4 sm:p-6 sm:pb-5">
        <PanelHeader
          id="orders-title"
          title="Recent orders"
          description="Your latest orders and where they stand."
          action={
            <button type="button" className={ghostLink} onClick={() => go("orders")}>
              View orders <ArrowRight className="size-3.5" aria-hidden />
            </button>
          }
        />
        <div className="-mx-1 mt-4 overflow-x-auto px-1 no-scrollbar">
          <div className="inline-flex gap-1 rounded-full bg-muted p-1" role="group" aria-label="Filter recent orders">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => onFilter(f.id)}
                className={cn(
                  "h-8 shrink-0 rounded-full px-3.5 text-[0.8rem] font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                  filter === f.id && "bg-card text-foreground shadow-sm",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Column headings (tablet & desktop) */}
      <div
        className={cn(
          "hidden gap-4 border-y bg-muted/40 px-6 py-2.5 text-[0.68rem] font-bold tracking-wider text-muted-foreground uppercase md:grid",
          ROW_COLS,
        )}
        aria-hidden
      >
        <span>Service</span>
        <span className="text-end">Quantity</span>
        <span className="text-end">Price</span>
        <span>Status</span>
        <span />
      </div>

      {orders.length ? (
        <ul className="divide-y border-t md:border-t-0">
          {orders.map((o) => (
            <li key={o.id}>
              <OrderRow order={o} onOpen={() => openOrder(o)} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-t px-6 py-12 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <PackageSearch className="size-5" aria-hidden />
          </span>
          <p className="mt-3 font-semibold">No orders here</p>
          <p className="mt-1 text-sm text-muted-foreground">Nothing matches this filter right now.</p>
          <button type="button" className={cn(ghostLink, "mt-3")} onClick={() => onFilter("all")}>
            Show all orders
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-xs text-muted-foreground sm:px-6">
        <span>
          Showing {orders.length} recent of {summary.total} orders
        </span>
        <span className="hidden sm:inline">Prices and orders are illustrative.</span>
      </div>
    </Panel>
  );
}

function OrderRow({ order, onOpen }: { order: LocalOrder; onOpen: () => void }) {
  const { service, platform } = orderService(order);
  const demoTag = order.demoUpdated ? <DemoTag className="text-primary">Demo update</DemoTag> : null;
  const pct = order.status === "processing" ? progressOf(order) : null;
  const flagged = order.status === "attention";

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Order ${order.id}: ${service.name}, ${ORDER_STATUS_META[order.status].label}${order.demoUpdated ? ", updated in this demo only" : ""}`}
      className={cn(
        "group relative flex w-full items-start gap-3 px-4 py-4 text-start transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none sm:px-6 md:grid md:items-center md:gap-4",
        ROW_COLS,
        flagged && "bg-soon-soft/25",
      )}
    >
      {flagged ? <span className="absolute inset-y-3 start-0 w-[3px] rounded-e-full bg-soon" aria-hidden /> : null}

      {/* Service */}
      <span className="flex min-w-0 flex-1 items-start gap-3 md:items-center">
        <PlatformTile platform={platform} size="md" className="size-10 rounded-xl" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-[0.95rem] leading-snug font-semibold max-md:line-clamp-2 md:truncate">{service.name}</span>
            <span className="shrink-0 text-sm font-semibold tabular-nums md:hidden">{money(order.price)}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {order.id}
            <span className="md:hidden"> · {count(order.quantity)}</span> · {formatDate(order.placedAt)}
          </span>
          <span className="mt-2 flex items-center gap-3 md:hidden">
            <OrderStatusBadge status={order.status} />
            {demoTag}
            {pct !== null ? <Progress pct={pct} /> : null}
          </span>
          {pct !== null ? (
            <span className="mt-2 hidden md:flex">
              <Progress pct={pct} className="max-w-48" />
            </span>
          ) : null}
        </span>
      </span>

      <span className="hidden text-end text-sm tabular-nums md:block">{count(order.quantity)}</span>
      <span className="hidden text-end text-sm font-semibold tabular-nums md:block">{money(order.price)}</span>
      <span className="hidden md:flex md:flex-col md:items-start md:gap-1">
        <OrderStatusBadge status={order.status} />
        {demoTag}
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

function Progress({ pct, className }: { pct: number; className?: string }) {
  return (
    <span className={cn("flex min-w-0 flex-1 items-center gap-2", className)}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-[0.7rem] font-semibold text-muted-foreground tabular-nums">{pct}%</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  5 · Quick service finder                                                  */
/* -------------------------------------------------------------------------- */

const SHORTCUTS = ["instagram", "facebook", "youtube", "tiktok", "x"];
const SUGGESTIONS = 4;

function QuickFinder({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const go = useDestinations();
  const [query, setQuery] = React.useState("");
  const [platform, setPlatform] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const matches = React.useMemo(
    () =>
      SERVICES.filter((s) => (!platform || s.platformId === platform) && matchesQuery(s, query)).sort(
        (a, b) => Number(b.featured) - Number(a.featured),
      ),
    [platform, query],
  );
  const shown = matches.slice(0, SUGGESTIONS);
  const selected = shown.find((s) => s.id === selectedId) ?? null;
  const filtered = Boolean(platform || query.trim());

  const clear = () => {
    setQuery("");
    setPlatform(null);
  };

  const chip =
    "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border bg-card text-sm font-medium transition-colors hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";
  const chipOn = "border-foreground bg-foreground text-background hover:border-foreground";

  return (
    <Panel className={cn("p-4 sm:p-6", className)} style={style} aria-labelledby="finder-title">
      <PanelHeader
        id="finder-title"
        title="Find a service"
        description={`${CATALOG_TOTALS.services} services across ${CATALOG_TOTALS.platforms} platforms.`}
        action={
          <button type="button" className={ghostLink} onClick={() => go("new-order")}>
            Browse all <ArrowRight className="size-3.5" aria-hidden />
          </button>
        }
      />

      <div className="relative mt-4">
        <label htmlFor="finder-search" className="sr-only">
          Search services
        </label>
        <Search className="pointer-events-none absolute top-1/2 start-4 size-[1.1rem] -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          id="finder-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What do you need? e.g. “TikTok views”"
          autoComplete="off"
          className="h-12 w-full rounded-2xl border border-transparent bg-muted pe-11 ps-11 text-[0.95rem] transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute top-1/2 end-3 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Popular platforms">
        <button type="button" aria-pressed={!platform} onClick={() => setPlatform(null)} className={cn(chip, "px-4", !platform && chipOn)}>
          All
        </button>
        {SHORTCUTS.map((id) => {
          const p = PLATFORM_BY_ID[id];
          const on = platform === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => setPlatform(on ? null : id)}
              className={cn(chip, "pe-3.5 ps-1.5", on && chipOn)}
            >
              <span className="grid size-6 place-items-center rounded-full" style={{ backgroundColor: p.color, color: p.ink }}>
                <PlatformIcon icon={p.icon} className="size-3.5" />
              </span>
              {p.short}
            </button>
          );
        })}
      </div>

      <FinderPrompt className="mt-3" />

      <div className="mt-5 flex items-center justify-between gap-2">
        <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase" aria-live="polite">
          {filtered ? `${matches.length} match${matches.length === 1 ? "" : "es"}` : "Popular right now"}
        </p>
        {filtered ? (
          <button type="button" onClick={clear} className="text-xs font-semibold text-primary hover:underline">
            Reset
          </button>
        ) : null}
      </div>

      {shown.length ? (
        <ul className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5" aria-label="Suggested services">
          {shown.map((s) => (
            <li key={s.id}>
              <SuggestionCard
                service={s}
                selected={s.id === selected?.id}
                onSelect={() => setSelectedId(s.id === selected?.id ? null : s.id)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-2.5 rounded-2xl border border-dashed px-4 py-8 text-center">
          <SearchX className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-semibold">No services match those filters</p>
          <p className="mt-1 text-xs text-muted-foreground">Try a broader word like “followers” or “views”.</p>
          <button type="button" onClick={clear} className={cn(ghostLink, "mt-2")}>
            Clear filters
          </button>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between sm:pt-5">
        {selected ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <PlatformTile platform={PLATFORM_BY_ID[selected.platformId]} size="xs" />
            <p className="min-w-0 truncate text-sm">
              <span className="text-muted-foreground">Selected </span>
              <span className="font-semibold">{selected.name}</span>
            </p>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear selection"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select a service to pre-fill your order.</p>
        )}
        <button
          type="button"
          className={cn(primaryBtn, "w-full sm:w-auto", !selected && "bg-foreground text-background shadow-none hover:bg-foreground/90")}
          onClick={() => (selected ? go("new-order", { service: selected }) : go("new-order"))}
        >
          {selected ? "Continue to New Order" : "Start a New Order"}
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
    </Panel>
  );
}

function SuggestionCard({ service, selected, onSelect }: { service: Service; selected: boolean; onSelect: () => void }) {
  const p = PLATFORM_BY_ID[service.platformId];
  const Icon = CATEGORY_ICONS[service.category];
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "group flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-start transition-all hover:border-primary/35 hover:bg-secondary/30 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:p-3.5",
        selected && "border-primary bg-secondary/60 ring-1 ring-primary hover:border-primary hover:bg-secondary/60",
      )}
    >
      <PlatformTile platform={p} size="md" className="size-10 rounded-xl" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-snug font-semibold max-md:line-clamp-2 md:truncate">{service.name}</span>
        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Icon className="size-3 shrink-0" aria-hidden />
          <span className="truncate">
            {p.short} · {CATEGORY_META[service.category].short}
          </span>
        </span>
      </span>
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent group-hover:border-primary/50",
        )}
        aria-hidden
      >
        <Check className="size-3" strokeWidth={3.5} />
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Quick access: favorites & recently ordered                                */
/* -------------------------------------------------------------------------- */

const QUICK_LIMIT = 4;

function QuickAccess({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const [tab, setTab] = React.useState<"favorites" | "recent">("favorites");
  const favorites = useFavorites()
    .ids.map((id) => SERVICE_BY_ID[id])
    .filter((s): s is Service => Boolean(s));
  const { orders } = useDemoOrders();
  // The latest order for each service, newest first.
  const recent = React.useMemo(() => {
    const seen = new Set<string>();
    return orders.filter((o) => !seen.has(o.serviceId) && seen.add(o.serviceId)).slice(0, QUICK_LIMIT);
  }, [orders]);

  const tabBtn =
    "inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-[0.8rem] font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none";
  const rowLink =
    "flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-2.5 pe-1 text-start transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";

  return (
    <Panel className={cn("p-4 sm:p-5", className)} style={style} aria-labelledby="quick-title">
      <PanelHeader
        id="quick-title"
        title="Quick access"
        description="Your favorite and recently ordered services."
        action={
          <Link href={newOrderHref()} className={ghostLink}>
            <Plus className="size-3.5" aria-hidden /> New Order
          </Link>
        }
      />

      <div className="mt-4 flex gap-1 rounded-full bg-muted p-1" role="group" aria-label="Show">
        <button
          type="button"
          aria-pressed={tab === "favorites"}
          onClick={() => setTab("favorites")}
          className={cn(tabBtn, tab === "favorites" && "bg-card text-foreground shadow-sm")}
        >
          <Heart className={cn("size-3.5 max-[359px]:hidden", favorites.length && "fill-current text-primary")} aria-hidden />
          Your Favorites
          <span className="text-[0.7rem] tabular-nums">{favorites.length}</span>
        </button>
        <button
          type="button"
          aria-pressed={tab === "recent"}
          onClick={() => setTab("recent")}
          className={cn(tabBtn, tab === "recent" && "bg-card text-foreground shadow-sm")}
        >
          <Repeat className="size-3.5 max-[359px]:hidden" aria-hidden />
          Recently ordered
        </button>
      </div>

      {tab === "favorites" ? (
        favorites.length ? (
          <>
            <ul className="mt-3 grid grid-cols-1 gap-1.5 md:grid-cols-2 xl:grid-cols-1" aria-label="Your favorite services">
              {favorites.slice(0, QUICK_LIMIT).map((s) => {
                const p = PLATFORM_BY_ID[s.platformId];
                return (
                  <li
                    key={s.id}
                    className="group flex items-center gap-1 rounded-2xl border bg-card pe-1.5 transition-colors hover:border-primary/35 hover:bg-secondary/30"
                  >
                    <Link href={newOrderHref(s.id)} className={rowLink} aria-label={`Order ${s.name}`}>
                      <PlatformTile platform={p} size="sm" className="size-9" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{s.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.short} · {CATEGORY_META[s.category].short}
                        </span>
                      </span>
                      <ArrowRight
                        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                        aria-hidden
                      />
                    </Link>
                    <FavoriteButton service={s} />
                  </li>
                );
              })}
            </ul>
            {favorites.length > QUICK_LIMIT ? (
              <Link href={`${ROUTES["new-order"]}?view=favorites`} className={cn(ghostLink, "mt-2 -ms-3")}>
                View all {favorites.length} favorites <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            ) : null}
          </>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed px-4 py-6 text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-2xl bg-secondary text-primary">
              <Heart className="size-[1.1rem]" aria-hidden />
            </span>
            <p className="mt-2.5 text-sm font-semibold">Your favorites will appear here.</p>
            <p className="mt-1 text-xs text-muted-foreground">Save services you use often for faster ordering.</p>
            <Link href={newOrderHref()} className={cn(ghostLink, "mt-2")}>
              Explore Services <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        )
      ) : recent.length ? (
        <ul className="mt-3 grid grid-cols-1 gap-1.5 md:grid-cols-2 xl:grid-cols-1" aria-label="Recently ordered services">
          {recent.map((o) => {
            const { service, platform } = orderService(o);
            return (
              <li key={o.id}>
                <Link
                  href={ordersHref({ order: o.id })}
                  aria-label={`${service.name}, order ${o.id}. View details to reorder.`}
                  className={cn(rowLink, "group border bg-card pe-2.5 hover:border-primary/35 hover:bg-secondary/30")}
                >
                  <PlatformTile platform={platform} size="sm" className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug font-semibold max-md:line-clamp-2 md:truncate">{service.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatDate(o.placedAt)} · {count(o.quantity)} · {o.id}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          Services you order will appear here.
        </p>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/*  6 · Needs action & latest updates                                         */
/* -------------------------------------------------------------------------- */

function NeedsAction({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const go = useDestinations();
  const openOrder = useOpenOrder();
  const needsAction = useDemoOrders().recent.filter((o) => o.status === "attention");

  return (
    <Panel className={cn("p-4 sm:p-5", className)} style={style} aria-labelledby="attention-title">
      <PanelHeader
        id="attention-title"
        title={
          <span className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-lg bg-soon-soft text-soon">
              <TriangleAlert className="size-3.5" aria-hidden />
            </span>
            Needs your action
            {needsAction.length ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-soon px-1.5 text-[0.7rem] font-bold text-white dark:text-graphite">
                {needsAction.length}
              </span>
            ) : null}
          </span>
        }
        description={needsAction.length ? "These orders are paused until you step in." : "Nothing is waiting on you right now."}
      />

      {!needsAction.length ? (
        <p className="mt-4 flex items-center gap-2.5 rounded-2xl border border-dashed p-3.5 text-sm text-muted-foreground">
          <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden />
          All clear. Updates you saved are in this demo only.
        </p>
      ) : null}

      <ul className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-1">
        {needsAction.map((o) => {
          const { service, platform } = orderService(o);
          return (
            <li key={o.id} className="rounded-2xl border border-soon/25 bg-soon-soft/50 p-3.5">
              <div className="flex items-start gap-3">
                <PlatformTile platform={platform} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{service.name}</span>
                    <span className="shrink-0 text-[0.7rem] text-muted-foreground">{o.id}</span>
                  </p>
                  <p className="mt-0.5 text-[0.8rem] leading-snug text-muted-foreground">{o.attention?.reason}</p>
                  <div className="mt-3 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => go("orders", { query: { order: o.id } })}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-xs font-semibold text-background transition-opacity hover:opacity-85 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
                    >
                      {o.attention?.action}
                      <ArrowRight className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => openOrder(o)}
                      className="inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                    >
                      Details
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function LatestUpdates({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const updates = useDemoActivity().activity.filter((a) => a.kind !== "attention");
  return (
    <Panel className={cn("p-4 sm:p-5", className)} style={style} aria-labelledby="updates-title">
      <PanelHeader id="updates-title" title="Latest updates" description="Notifications only — nothing to do here." />
      <ol className="relative mt-4 space-y-4 before:absolute before:top-2 before:bottom-2 before:start-[0.9375rem] before:w-px before:bg-border">
        {updates.map((a) => {
          const { Icon, className: tone } = ACTIVITY_ICONS[a.kind];
          return (
            <li key={a.id} className="relative flex gap-3">
              <span className={cn("relative grid size-[1.875rem] shrink-0 place-items-center rounded-full ring-4 ring-card", tone)}>
                <Icon className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{a.title}</span>
                  <time className="shrink-0 text-[0.7rem] text-muted-foreground">{whenLabel(a.when)}</time>
                </p>
                <p className="text-xs text-muted-foreground">{a.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/*  7 · Contextual help                                                       */
/* -------------------------------------------------------------------------- */

function HelpPanel({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const go = useDestinations();
  return (
    <Panel className={cn("flex items-start gap-4 p-4 sm:p-5", className)} style={style} aria-labelledby="help-title">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
        <LifeBuoy className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="help-title" className="text-[0.95rem] font-bold">
          Need help with an order?
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Share your order ID and our team will look into it with you.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => go("support")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none"
          >
            Get Support
          </button>
          <Link href="/#faq" className={ghostLink}>
            Read the FAQ
          </Link>
        </div>
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function Overview() {
  // Re-render when language, currency, time zone or date format change.
  useDisplay();
  const [filter, setFilter] = React.useState<OrderFilter>("all");
  const a = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(enter);

  // Columns use `display: contents` below xl so every card joins one grid and
  // follows the priority order: new order, attention, active orders, wallet.
  return (
    <div className="mx-auto max-w-[90rem] px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <div className="grid grid-cols-1 gap-3 sm:gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(21rem,24rem)] xl:items-start">
        <div className="contents xl:flex xl:flex-col xl:gap-5">
          <Welcome className={cn("order-1 md:col-span-2", a[0].className)} style={a[0].style} />
          <OrderSummary
            filter={filter}
            onFilter={setFilter}
            className={cn("order-3", a[2].className)}
            style={a[2].style}
          />
          <QuickFinder className={cn("order-6 md:col-span-2", a[5].className)} style={a[5].style} />
          <RecentOrders
            filter={filter}
            onFilter={setFilter}
            className={cn("order-7 md:col-span-2", a[6].className)}
            style={a[6].style}
          />
        </div>
        <div className="contents xl:flex xl:flex-col xl:gap-5">
          <NeedsAction className={cn("order-2 md:col-span-2", a[1].className)} style={a[1].style} />
          <WalletCard className={cn("order-4", a[3].className)} style={a[3].style} />
          <QuickAccess className={cn("order-5 md:col-span-2", a[4].className)} style={a[4].style} />
          <LatestUpdates className={cn("order-8 md:col-span-2", a[7].className)} style={a[7].style} />
          <HelpPanel className={cn("order-9 md:col-span-2", a[8].className)} style={a[8].style} />
        </div>
      </div>
    </div>
  );
}
