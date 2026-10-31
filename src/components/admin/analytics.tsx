"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { ArrowRight, ArrowUpRight, ChevronRight, CircleCheck, Download, FileText, Info, SlidersHorizontal, X } from "lucide-react";
import { ADMIN_CUSTOMERS, ADMIN_DEPOSITS, ADMIN_ORDER_STATUS, ADMIN_ORDERS, ADMIN_SUMMARY, ADMIN_TICKETS, type AdminOrderStatus, CUSTOMER_BY_ID, orderService, usd } from "@/lib/admin-demo";
import {
  bucketsOf,
  COVERAGE,
  DATA_START,
  depositMetrics,
  depositsIn,
  downloadCsv,
  type Filters,
  grainOf,
  groupCount,
  inBucket,
  isoDay,
  METHOD_LABEL,
  METHOD_OF,
  type MethodKey,
  orderMetrics,
  ordersIn,
  percentChange,
  previousOf,
  type Range,
  RANGE_LABEL,
  walletBalances,
  type Window,
  windowOf,
  within,
} from "@/lib/admin-analytics";
import { detailsMissing, needsAttention } from "@/lib/admin-orders";
import { issuesOf, useProviders } from "@/lib/admin-providers";
import { useServiceRecords } from "@/lib/admin-services";
import { CATEGORY_META, CATEGORY_ORDER, PLATFORM_BY_ID, PLATFORMS, type ServiceCategory } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { SelectInput, TextInput } from "./form";
import { popupSurface } from "./menu";
import { AdminDemoTag } from "./ui";

/* -------------------------------------------------------------------------- */
/*  URL state                                                                 */
/* -------------------------------------------------------------------------- */

type Tab = "overview" | "orders" | "customers" | "payments" | "reports";
const TABS: { id: Exclude<Tab, "reports">; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "orders", label: "Orders" },
  { id: "customers", label: "Customers" },
  { id: "payments", label: "Payments" },
];
type FilterKey = keyof Filters;
/** Which filters mean something on each view. Everything else is ignored there. */
const RELEVANT: Record<Tab, FilterKey[]> = {
  overview: [],
  orders: ["platform", "category", "status"],
  customers: ["platform", "category"],
  payments: ["method"],
  reports: ["platform", "category", "status", "method"],
};

interface State extends Filters {
  tab: Tab;
  range: Range;
  from: string;
  to: string;
}
const DEFAULTS: State = { tab: "overview", range: "30d", from: "", to: "", platform: "", category: "", status: "", method: "" };
const STATUSES = Object.keys(ADMIN_ORDER_STATUS) as AdminOrderStatus[];

function parse(p: URLSearchParams): State {
  const pick = <T extends string>(k: string, allowed: readonly T[], d: T) => {
    const v = p.get(k) as T | null;
    return v && allowed.includes(v) ? v : d;
  };
  const day = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(p.get(k) ?? "") ? p.get(k)! : "");
  return {
    tab: pick("tab", ["overview", "orders", "customers", "payments", "reports"] as const, "overview"),
    range: pick("range", ["7d", "30d", "90d", "all", "custom"] as const, DEFAULTS.range),
    from: day("from"),
    to: day("to"),
    platform: PLATFORM_BY_ID[p.get("platform") ?? ""] ? p.get("platform")! : "",
    category: pick("category", CATEGORY_ORDER, "" as const),
    status: pick("status", ["attention", ...STATUSES] as State["status"][], ""),
    method: pick("method", ["crypto", "card", "bank"] as const, ""),
  };
}

function toQuery(s: State) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) {
    if ((k === "from" || k === "to") && s.range !== "custom") continue;
    if (v !== DEFAULTS[k as keyof State]) q.set(k, String(v));
  }
  return q.toString();
}

/** Only the filters that apply to a view; the rest are left blank there. */
const effective = (s: State, tab: Tab): Filters => ({
  platform: RELEVANT[tab].includes("platform") ? s.platform : "",
  category: RELEVANT[tab].includes("category") ? s.category : "",
  status: RELEVANT[tab].includes("status") ? s.status : "",
  method: RELEVANT[tab].includes("method") ? s.method : "",
});

const DAY = 86_400_000;
const fmtDay = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const fmtNum = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

type Svc = Parameters<typeof ordersIn>[2];
type Buckets = ReturnType<typeof bucketsOf>;

interface Ctx {
  w: Window;
  prevW: Window | null;
  f: Filters;
  svc: Svc;
  buckets: Buckets;
  grain: string;
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function AdminAnalytics() {
  const params = useSearchParams();
  const pathname = usePathname();
  const records = useServiceRecords();
  const providers = useProviders();
  const byId = React.useMemo(() => Object.fromEntries(records.map((r) => [r.id, r])), [records]);
  const svc = React.useCallback((o: (typeof ADMIN_ORDERS)[number]) => byId[o.serviceId], [byId]);

  const [s, setS] = React.useState<State>(() => parse(params));
  const written = React.useRef(toQuery(s));
  // Back/Forward (or a link) changed the URL: adopt it.
  const urlKey = toQuery(parse(params));
  React.useEffect(() => {
    if (urlKey !== written.current) {
      written.current = urlKey;
      setS(parse(new URLSearchParams(urlKey)));
    }
  }, [urlKey]);

  // Every change is its own history entry, so Back steps through views and filters.
  const update = (patch: Partial<State>) => {
    const next = { ...s, ...patch };
    const qs = toQuery(next);
    written.current = qs;
    window.history.pushState(null, "", qs ? `${pathname}?${qs}` : pathname);
    setS(next);
  };

  const w = windowOf(s.range, s.from, s.to);
  const ctx: Ctx = { w, prevW: previousOf(w), f: effective(s, s.tab), svc, buckets: bucketsOf(w), grain: grainOf(w) };

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[0.8rem] font-medium text-muted-foreground">
            Insights <AdminDemoTag>Demo records</AdminDemoTag>
          </p>
          <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Analytics &amp; Reports</h1>
          <p className="mt-1 max-w-xl text-[0.95rem] text-muted-foreground">Understand business performance, track trends and discover opportunities.</p>
        </div>
        <button
          type="button"
          onClick={() => update({ tab: "reports" })}
          aria-pressed={s.tab === "reports"}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-full border bg-card px-4 text-sm font-semibold whitespace-nowrap transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none",
            s.tab === "reports" && "border-primary/50 bg-secondary/50 text-primary dark:bg-secondary/25",
          )}
        >
          <FileText className="size-4" aria-hidden /> Reports
        </button>
      </header>

      {/* Views, and the controls that apply to them */}
      <div className="mt-6 flex flex-col gap-3 border-b lg:flex-row lg:items-end lg:justify-between">
        <div role="tablist" aria-label="Analytics views" className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`an-tab-${t.id}`}
              aria-selected={s.tab === t.id}
              aria-controls="an-panel"
              onClick={() => update({ tab: t.id })}
              className={cn(
                "relative inline-flex h-11 shrink-0 items-center px-3.5 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                s.tab === t.id && "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <Select id="an-range" label="Date range" value={s.range} onChange={(v) => update({ range: v as Range })} className="w-44">
            {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
              <option key={r} value={r}>
                {RANGE_LABEL[r]}
              </option>
            ))}
          </Select>
          {s.range === "custom" ? (
            <>
              <DateInput id="an-from" label="From" value={s.from || isoDay(w.start)} onChange={(v) => update({ from: v })} />
              <DateInput id="an-to" label="To" value={s.to || isoDay(w.end - DAY)} onChange={(v) => update({ to: v })} />
            </>
          ) : null}
          {RELEVANT[s.tab].length ? <FilterControl s={s} tab={s.tab} update={update} /> : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <p aria-live="polite">
          <span className="font-semibold text-foreground">
            {fmtDay(w.start)} – {fmtDay(w.end - DAY)}
          </span>
          {ctx.prevW ? ` · compared with the previous ${w.days} days` : ""}
        </p>
        {RELEVANT[s.tab].map((k) =>
          s[k] ? (
            <button
              key={k}
              type="button"
              onClick={() => update({ [k]: "" } as Partial<State>)}
              aria-label={`Remove filter: ${chipLabel(k, s)}`}
              className="inline-flex h-7 items-center gap-1 rounded-full border bg-card ps-2.5 pe-1.5 font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              {chipLabel(k, s)}
              <X className="size-3.5 opacity-60" aria-hidden />
            </button>
          ) : null,
        )}
      </div>

      <div
        role={s.tab === "reports" ? undefined : "tabpanel"}
        id="an-panel"
        aria-labelledby={s.tab === "reports" ? undefined : `an-tab-${s.tab}`}
        className="mt-4"
      >
        {s.tab === "overview" ? (
          <OverviewView ctx={ctx} providers={providers} byId={byId} />
        ) : s.tab === "orders" ? (
          <OrdersView ctx={ctx} />
        ) : s.tab === "customers" ? (
          <CustomersView ctx={ctx} />
        ) : s.tab === "payments" ? (
          <PaymentsView ctx={ctx} />
        ) : (
          <ReportsView ctx={ctx} />
        )}
      </div>
    </div>
  );
}

function chipLabel(k: FilterKey, s: State) {
  if (k === "platform") return PLATFORM_BY_ID[s.platform]?.name ?? s.platform;
  if (k === "category") return s.category ? CATEGORY_META[s.category].label : "";
  if (k === "status") return s.status === "attention" ? "Needs attention" : s.status ? ADMIN_ORDER_STATUS[s.status].label : "";
  return s.method ? METHOD_LABEL[s.method] : "";
}

/* -------------------------------------------------------------------------- */
/*  Overview                                                                  */
/* -------------------------------------------------------------------------- */

function OverviewView({ ctx, providers, byId }: { ctx: Ctx; providers: ReturnType<typeof useProviders>; byId: Record<string, ReturnType<Svc>> }) {
  const { w, prevW, f, svc, buckets, grain } = ctx;
  const orders = ordersIn(w, f, svc);
  const m = orderMetrics(orders);
  const prev = prevW ? orderMetrics(ordersIn(prevW, f, svc)) : null;
  const dm = depositMetrics(depositsIn(w, f));
  const allTime = w.start <= DATA_START;

  const records = Object.fromEntries(Object.entries(byId).filter((e): e is [string, NonNullable<ReturnType<Svc>>] => Boolean(e[1])));
  const attention = [
    { label: "Orders awaiting review", n: ADMIN_ORDERS.filter((o) => o.status === "review").length, href: "/admin/orders?status=review" },
    { label: "Orders missing customer details", n: ADMIN_ORDERS.filter(detailsMissing).length, href: "/admin/orders?status=attention" },
    { label: "Deposits awaiting verification", n: ADMIN_DEPOSITS.filter((d) => d.status === "verification").length, href: "/admin/payments?type=deposit&status=pending" },
    { label: "Support tickets awaiting staff", n: ADMIN_TICKETS.filter((t) => t.awaitingStaff).length, href: "/admin/support?status=awaiting_staff" },
    { label: "Providers needing setup", n: providers.filter((p) => !p.archived && issuesOf(p, providers, records).length).length, href: "/admin/providers" },
  ].filter((x) => x.n > 0);

  return (
    <>
      <Kpis
        items={[
          { label: "Net order revenue", value: usd(m.net), note: compare(prevW, m.net, prev?.net) ?? "Payments minus refunds", featured: true },
          { label: "Orders", value: fmtNum(m.count), note: compare(prevW, m.count, prev?.count) ?? `Avg ${m.aov !== null ? usd(m.aov) : "—"} each` },
          { label: "Customers", value: fmtNum(m.customers), note: compare(prevW, m.customers, prev?.customers) ?? `ordered, of ${ADMIN_CUSTOMERS.length}` },
          { label: "Pending deposits", value: usd(dm.pending), note: `${plural(dm.pendingCount, "deposit")} to verify`, tone: dm.pendingCount ? "soon" : undefined, href: "/admin/payments?type=deposit&status=pending" },
        ]}
      />
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <ChartCard title="Revenue" subtitle={`Net order revenue by ${grain}`} aside={<span className="font-heading text-lg font-extrabold tabular-nums">{usd(m.net)}</span>}>
          <BarChart
            label={`Net order revenue by ${grain}`}
            empty="No orders in this period."
            data={buckets.map((b) => {
              const x = orderMetrics(orders.filter((o) => inBucket(o.placedAt, b)));
              return { label: b.label, value: x.net, display: usd(x.net), details: [plural(x.count, "order"), x.refunds ? `${usd(x.refunds)} refunded` : "No refunds"] };
            })}
            format={usd}
          />
          {allTime ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CircleCheck className="size-3.5 text-ok" aria-hidden /> Matches Overview and Payments: {usd(ADMIN_SUMMARY.revenue)} net revenue.
            </p>
          ) : null}
        </ChartCard>
        <section aria-labelledby="an-attention" className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 id="an-attention" className="text-[0.95rem] font-bold">
            Needs attention
          </h2>
          <p className="text-xs text-muted-foreground">Open work right now.</p>
          {attention.length ? (
            <ul className="mt-3 space-y-1">
              {attention.map((x) => (
                <li key={x.label}>
                  <Link
                    href={x.href}
                    className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                  >
                    <span className="grid h-6 min-w-6 place-items-center rounded-full bg-soon-soft px-1.5 text-xs font-bold text-soon tabular-nums">{x.n}</span>
                    <span className="min-w-0 flex-1">{x.label}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
              <CircleCheck className="size-4 text-ok" aria-hidden /> All clear.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Orders                                                                    */
/* -------------------------------------------------------------------------- */

function OrdersView({ ctx }: { ctx: Ctx }) {
  const { w, prevW, f, svc, buckets, grain } = ctx;
  const orders = ordersIn(w, f, svc);
  const m = orderMetrics(orders);
  const prev = prevW ? orderMetrics(ordersIn(prevW, f, svc)) : null;
  const by = (st: AdminOrderStatus) => orders.filter((o) => o.status === st).length;
  const attention = orders.filter((o) => needsAttention(o, svc(o))).length;
  const platforms = [...groupCount(orders, (o) => orderService(o).platform.id).entries()]
    .map(([id, list]) => ({ id, list, value: list.reduce((n, o) => n + o.amount, 0) }))
    .sort((a, b) => b.list.length - a.list.length || b.value - a.value);
  const services = [...groupCount(orders, (o) => o.serviceId).entries()]
    .map(([id, list]) => ({ id, list, value: Math.round(list.reduce((n, o) => n + o.amount, 0) * 100) / 100 }))
    .sort((a, b) => b.list.length - a.list.length || b.value - a.value);
  const categories = [...groupCount(orders, (o) => orderService(o).service.category).entries()]
    .map(([id, list]) => ({ id: id as ServiceCategory, list, value: Math.round(list.reduce((n, o) => n + o.amount, 0) * 100) / 100 }))
    .sort((a, b) => b.value - a.value);

  return (
    <>
      <Kpis
        items={[
          { label: "Orders", value: fmtNum(m.count), note: compare(prevW, m.count, prev?.count) ?? "In this period", featured: true },
          { label: "Average order", value: m.aov !== null ? usd(m.aov) : "—", note: "Order payments ÷ orders" },
          { label: "Awaiting review", value: fmtNum(by("review")), note: "Waiting on staff", tone: by("review") ? "soon" : undefined, href: "/admin/orders?status=review" },
          { label: "Needs attention", value: fmtNum(attention), note: "Missing details or blocked", tone: attention ? "destructive" : undefined, href: "/admin/orders?status=attention" },
        ]}
      />
      {orders.length ? (
        <>
          <ChartCard title="Order volume" subtitle={`Orders placed by ${grain}`} link={{ href: "/admin/orders", label: "Open Orders" }} className="mt-4">
            <BarChart
              label={`Orders by ${grain}`}
              empty="No orders in this period."
              data={buckets.map((b) => {
                const n = orders.filter((o) => inBucket(o.placedAt, b)).length;
                return { label: b.label, value: n, display: plural(n, "order"), details: [] };
              })}
              format={(v) => String(Math.round(v))}
            />
          </ChartCard>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card title="Status" subtitle="A status is a record, not proof a provider delivered.">
              <HBars items={STATUSES.filter((st) => by(st)).map((st) => ({ key: st, label: ADMIN_ORDER_STATUS[st].label, value: by(st), display: `${by(st)} · ${pct(by(st), m.count)}%`, href: `/admin/orders?status=${st}` }))} />
            </Card>
            <Card title="Top platforms" subtitle="Orders and order value.">
              <HBars items={platforms.slice(0, 5).map((p) => ({ key: p.id, label: PLATFORM_BY_ID[p.id].name, value: p.list.length, display: `${p.list.length} · ${usd(p.value)}`, href: `/admin/orders?platform=${p.id}` }))} />
            </Card>
          </div>
          <More label="Services and service types">
            <div className="grid gap-4 lg:grid-cols-2">
              <MiniTable
                caption="Most ordered services"
                head={["Service", "Orders", "Value"]}
                rows={services.slice(0, 6).map((x) => {
                  const { service, platform } = orderService(x.list[0]);
                  return [
                    <span key="n">
                      <Link href={`/admin/services?q=${service.id}`} className="font-medium hover:text-primary hover:underline">
                        {service.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{platform.name}</span>
                    </span>,
                    String(x.list.length),
                    usd(x.value),
                  ];
                })}
              />
              <MiniTable caption="By service type" head={["Service type", "Orders", "Value", "Share"]} rows={categories.map((c) => [CATEGORY_META[c.id].label, String(c.list.length), usd(c.value), `${pct(c.value, m.gross)}%`])} />
            </div>
          </More>
        </>
      ) : (
        <Empty text="No orders match this period and these filters." className="mt-4" />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Customers                                                                 */
/* -------------------------------------------------------------------------- */

function CustomersView({ ctx }: { ctx: Ctx }) {
  const { w, f, svc, buckets, grain } = ctx;
  const orders = ordersIn(w, f, svc);
  const joined = ADMIN_CUSTOMERS.filter((c) => within(c.joinedAt, w));
  const byCustomer = [...groupCount(orders, (o) => o.customerId).entries()].map(([id, list]) => ({ id, list, spend: Math.round(list.reduce((n, o) => n + o.amount, 0) * 100) / 100 }));
  const repeat = byCustomer.filter((x) => x.list.length >= 2).length;
  const firstOrder = (id: string) => ADMIN_ORDERS.filter((o) => o.customerId === id).reduce((a, o) => (o.placedAt < a ? o.placedAt : a), "9999");
  const fresh = byCustomer.filter((x) => within(firstOrder(x.id), w)).length;
  const gross = byCustomer.reduce((n, x) => n + x.spend, 0);
  const bands = [
    { label: "Under $25", test: (v: number) => v < 25 },
    { label: "$25 – $50", test: (v: number) => v >= 25 && v < 50 },
    { label: "$50 – $100", test: (v: number) => v >= 50 && v < 100 },
    { label: "$100 or more", test: (v: number) => v >= 100 },
  ];

  return (
    <>
      <Kpis
        items={[
          { label: "Customers", value: fmtNum(ADMIN_CUSTOMERS.length), note: "All accounts", featured: true },
          { label: "New", value: fmtNum(joined.length), note: "Joined in this period" },
          { label: "Ordering", value: fmtNum(byCustomer.length), note: "Placed an order" },
          { label: "Repeat", value: fmtNum(repeat), note: "2 or more orders" },
        ]}
      />
      <ChartCard title="New customers" subtitle={`Sign-ups by ${grain}`} link={{ href: "/admin/customers", label: "Open Customers" }} className="mt-4">
        <BarChart
          label={`New customers by ${grain}`}
          empty={`No one joined in this period. Sign-ups run from ${fmtDay(COVERAGE.customers)}.`}
          data={buckets.map((b) => {
            const n = ADMIN_CUSTOMERS.filter((c) => inBucket(c.joinedAt, b)).length;
            return { label: b.label, value: n, display: `${n} joined`, details: [] };
          })}
          format={(v) => String(Math.round(v))}
        />
      </ChartCard>
      {byCustomer.length ? (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card title="Top customers" subtitle="By order spending in this period.">
              <MiniTable
                caption="Top customers by order spending"
                head={["Customer", "Orders", "Spent"]}
                rows={[...byCustomer]
                  .sort((a, b) => b.spend - a.spend)
                  .slice(0, 5)
                  .map((x) => [
                    <Link key="c" href={`/admin/customers?customer=${x.id}`} className="font-medium hover:text-primary hover:underline">
                      {CUSTOMER_BY_ID[x.id].name}
                    </Link>,
                    String(x.list.length),
                    usd(x.spend),
                  ])}
              />
            </Card>
            <Card title="Spending" subtitle="How much ordering customers spent.">
              <HBars items={bands.map((b) => ({ key: b.label, label: b.label, value: byCustomer.filter((x) => b.test(x.spend)).length, display: plural(byCustomer.filter((x) => b.test(x.spend)).length, "customer") }))} />
            </Card>
          </div>
          <More label="More customer figures">
            <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Mini label="First order in period" value={fmtNum(fresh)} />
              <Mini label="Ordered before" value={fmtNum(byCustomer.length - fresh)} />
              <Mini label="Orders per customer" value={(orders.length / byCustomer.length).toFixed(1)} />
              <Mini label="Average spend" value={usd(gross / byCustomer.length)} />
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">Based on orders in this period. No website traffic, conversion or lifetime-value data exists.</p>
          </More>
        </>
      ) : (
        <Empty text="No customers placed orders in this period." className="mt-4" />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Payments                                                                  */
/* -------------------------------------------------------------------------- */

function PaymentsView({ ctx }: { ctx: Ctx }) {
  const { w, f, svc, buckets, grain } = ctx;
  const deposits = depositsIn(w, f);
  const dm = depositMetrics(deposits);
  const m = orderMetrics(ordersIn(w, { platform: "", category: "", status: "", method: "" }, svc));
  const methods = [...groupCount(deposits, METHOD_OF).entries()].map(([k, list]) => ({ k: k as MethodKey, list, value: list.reduce((n, d) => n + d.amount, 0) })).sort((a, b) => b.value - a.value);
  const pending = deposits.filter((d) => d.status === "verification");
  const balances = walletBalances();
  const bands = [
    { label: "Under $25", test: (v: number) => v < 25 },
    { label: "$25 – $50", test: (v: number) => v >= 25 && v < 50 },
    { label: "$50 – $75", test: (v: number) => v >= 50 && v < 75 },
    { label: "$75 or more", test: (v: number) => v >= 75 },
  ];

  return (
    <>
      <Kpis
        items={[
          { label: "Credited deposits", value: usd(dm.credited), note: `${plural(dm.creditedCount, "deposit")} added to wallets`, featured: true, href: "/admin/payments?type=deposit&status=credited" },
          { label: "Pending deposits", value: usd(dm.pending), note: "Not credited until verified", tone: dm.pendingCount ? "soon" : undefined, href: "/admin/payments?type=deposit&status=pending" },
          { label: "Refunds", value: usd(m.refunds), note: `${plural(m.refundCount, "order")} refunded`, href: "/admin/payments?type=refund" },
          { label: "Wallet balances", value: usd(ADMIN_SUMMARY.liabilities), note: "Owed to customers now" },
        ]}
      />
      <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted/40 px-3.5 py-2.5 text-[0.82rem] text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>
          Deposits and wallet balances are <span className="font-medium text-foreground">customer money</span>, not revenue. Revenue comes only from orders — see Overview.
        </span>
      </p>
      <ChartCard title="Deposits" subtitle={`Credited deposits by ${grain}`} link={{ href: "/admin/payments", label: "Open Payments" }} className="mt-4">
        <BarChart
          label={`Credited deposits by ${grain}`}
          empty="No deposits in this period."
          data={buckets.map((b) => {
            const x = depositMetrics(deposits.filter((d) => inBucket(d.at, b)));
            return {
              label: b.label,
              value: x.credited,
              display: `${usd(x.credited)} credited`,
              details: [x.pendingCount ? `${usd(x.pending)} pending` : "", x.failedCount ? `${usd(x.failed)} failed` : ""].filter(Boolean),
            };
          })}
          format={usd}
        />
      </ChartCard>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="By payment method" subtitle="All deposits in this period.">
          {methods.length ? (
            <HBars items={methods.map((x) => ({ key: x.k, label: METHOD_LABEL[x.k], value: x.value, display: `${usd(x.value)} · ${x.list.length}`, href: `/admin/payments?method=${x.k}` }))} />
          ) : (
            <Empty text="No deposits in this period." small />
          )}
        </Card>
        <Card title="Waiting for verification" subtitle="Not in any wallet yet.">
          {pending.length ? (
            <ul className="mt-1 divide-y">
              {pending.map((d) => (
                <li key={d.id}>
                  <Link href={`/admin/payments?txn=${d.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none">
                    <span className="min-w-0">
                      <span className="font-medium">{CUSTOMER_BY_ID[d.customerId].name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {d.method} · <span className="font-mono">{d.id}</span>
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{usd(d.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Nothing waiting in this period." small />
          )}
        </Card>
      </div>
      <More label="Wallet balances and definitions">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold">Wallet balances now</p>
            <HBars items={bands.map((b) => ({ key: b.label, label: b.label, value: balances.filter((x) => b.test(x.balance)).length, display: plural(balances.filter((x) => b.test(x.balance)).length, "customer") }))} />
          </div>
          <dl className="space-y-2 text-sm">
            {[
              ["Net order revenue", "Order payments minus refunds. The only revenue."],
              ["Credited deposits", "Money customers added to their wallets."],
              ["Pending deposits", "Submitted but not verified, so not in any wallet."],
              ["Wallet balances", "Credited deposits − order payments + refunds, owed to customers."],
              ["Refunds", "Dated by their order; refund times aren't recorded."],
              ["Profit", "Not shown: no verified provider costs exist."],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-medium">{k}</dt>
                <dd className="text-xs text-muted-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </More>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Reports                                                                   */
/* -------------------------------------------------------------------------- */

function ReportsView({ ctx }: { ctx: Ctx }) {
  const { w, f, svc, buckets } = ctx;
  const orders = ordersIn(w, f, svc);
  const deposits = depositsIn(w, f);
  const stamp = `${isoDay(w.start)}_${isoDay(w.end - DAY)}`;
  const reports = [
    {
      id: "orders",
      title: "Orders",
      note: `${plural(orders.length, "order")} in range and filters`,
      rows: () => [
        ["Order ID", "Placed (UTC)", "Customer ID", "Service", "Platform", "Service type", "Status", "Quantity", "Amount USD", "Refunded USD"],
        ...orders.map((o) => {
          const { service, platform } = orderService(o);
          return [o.id, o.placedAt, o.customerId, service.name, platform.name, CATEGORY_META[service.category].label, ADMIN_ORDER_STATUS[o.status].label, o.quantity, o.amount, o.refunded];
        }),
      ],
    },
    {
      id: "revenue",
      title: "Revenue by period",
      note: `${buckets.length} ${grainOf(w)} rows`,
      rows: () => [
        ["Period start (UTC)", "Period", "Orders", "Gross payments USD", "Refunds USD", "Net revenue USD"],
        ...buckets.map((b) => {
          const x = orderMetrics(orders.filter((o) => inBucket(o.placedAt, b)));
          return [isoDay(b.start), b.label, x.count, x.gross, x.refunds, x.net];
        }),
      ],
    },
    {
      id: "customers",
      title: "Customer summary",
      note: `${ADMIN_CUSTOMERS.length} customers · IDs only`,
      rows: () => {
        const balances = Object.fromEntries(walletBalances().map((x) => [x.customer.id, x.balance]));
        return [
          ["Customer ID", "Joined (UTC)", "Orders in range", "Spending in range USD", "Wallet balance now USD"],
          ...ADMIN_CUSTOMERS.map((c) => {
            const os = orders.filter((o) => o.customerId === c.id);
            return [c.id, c.joinedAt, os.length, Math.round(os.reduce((n, o) => n + o.amount, 0) * 100) / 100, balances[c.id]];
          }),
        ];
      },
    },
    {
      id: "deposits",
      title: "Deposits",
      note: `${plural(deposits.length, "deposit")} in range and method`,
      rows: () => [
        ["Deposit ID", "Date (UTC)", "Customer ID", "Method", "Status", "Amount USD"],
        ...deposits.map((d) => [d.id, d.at, d.customerId, d.method, d.status === "verification" ? "Pending verification" : d.status === "credited" ? "Credited" : "Failed", d.amount]),
      ],
    },
  ];
  return (
    <section aria-labelledby="an-reports" className="rounded-2xl border bg-card p-4 sm:p-5">
      <h2 id="an-reports" className="text-[0.95rem] font-bold">
        Reports
      </h2>
      <p className="text-[0.82rem] text-muted-foreground">CSV files of the records behind the current date range and filters.</p>
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {reports.map((r) => (
          <li key={r.id} className="flex flex-col rounded-xl border p-3.5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="size-4 text-primary" aria-hidden /> {r.title}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{r.note}</p>
            <button
              type="button"
              onClick={() => downloadCsv(`sociotix-${r.id}-${stamp}.csv`, r.rows())}
              className="mt-3 inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-full border bg-card px-3.5 text-[0.82rem] font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              <Download className="size-3.5" aria-hidden /> Download CSV
            </button>
          </li>
        ))}
      </ul>
      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
        <li>• Demo records only. No notes, credentials or contact details are exported.</li>
        <li>• Spreadsheet-safe: text that could run as a formula is prefixed with an apostrophe.</li>
        <li>• PDF exports and scheduled reports are planned, not available yet.</li>
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Building blocks                                                           */
/* -------------------------------------------------------------------------- */

function compare(prevW: Window | null, now: number | null, before: number | null | undefined) {
  if (!prevW || now === null || before === null || before === undefined) return null;
  const c = percentChange(now, before);
  return c === null ? null : `${c > 0 ? "+" : ""}${c}% vs previous`;
}

interface KpiItem {
  label: string;
  value: string;
  note: string;
  featured?: boolean;
  tone?: "soon" | "destructive";
  href?: string;
}

function Kpis({ items }: { items: KpiItem[] }) {
  return (
    <section aria-label="Key figures" className="@container">
      <dl className="grid grid-cols-2 gap-2.5 @3xl:grid-cols-4 @3xl:gap-3">
        {items.map((k) => (
          <div
            key={k.label}
            className={cn(
              "group relative flex min-h-[6.25rem] min-w-0 flex-col rounded-2xl border bg-card px-4 py-3.5 transition-colors",
              k.featured && "border-transparent bg-graphite text-white dark:border-white/10 dark:bg-[#1b1c23]",
              k.tone === "soon" && "border-soon/35 bg-soon-soft/25 dark:bg-soon-soft/10",
              k.href && "hover:border-foreground/20 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-primary/30",
            )}
          >
            <dt className={cn("pe-4 text-[0.78rem] font-medium", k.featured ? "text-white/65" : k.tone === "soon" ? "text-soon" : "text-muted-foreground")}>{k.label}</dt>
            <dd className={cn("mt-1 font-heading text-[1.5rem] leading-tight font-extrabold tracking-[-0.015em] tabular-nums", k.tone === "soon" && "text-soon", k.tone === "destructive" && "text-destructive")}>{k.value}</dd>
            <dd className={cn("mt-auto text-[0.75rem] leading-snug", k.featured ? "text-white/60" : /^\+/.test(k.note) ? "text-ok" : /^-/.test(k.note) ? "text-soon" : "text-muted-foreground")}>{k.note}</dd>
            {k.href ? (
              <>
                <Link href={k.href} className="absolute inset-0 rounded-2xl focus-visible:outline-none" aria-label={`${k.label}: ${k.value}, open`} />
                <ArrowUpRight className="absolute end-3 top-3 size-3.5 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />
              </>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}

function ChartCard({ title, subtitle, aside, link, className, children }: { title: string; subtitle: string; aside?: React.ReactNode; link?: { href: string; label: string }; className?: string; children: React.ReactNode }) {
  const id = `an-h-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={cn("min-w-0 rounded-2xl border bg-card p-4 sm:p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={id} className="text-[0.95rem] font-bold">
            {title}
          </h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {aside}
        {link ? (
          <Link href={link.href} className="inline-flex items-center gap-1 text-[0.82rem] font-semibold text-primary hover:underline">
            {link.label} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const id = `an-h-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-2xl border bg-card p-4 sm:p-5">
      <h2 id={id} className="text-[0.95rem] font-bold">
        {title}
      </h2>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
      {children}
    </section>
  );
}

function More({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group mt-4 rounded-2xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold hover:text-primary focus-visible:rounded-2xl focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:px-5 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
        {label}
      </summary>
      <div className="border-t px-4 py-4 sm:px-5">{children}</div>
    </details>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2.5">
      <dt className="text-[0.75rem] leading-snug font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-heading text-[1.15rem] font-extrabold tabular-nums">{value}</dd>
    </div>
  );
}

function HBars({ items }: { items: { key: string; label: string; value: number; display: string; href?: string }[] }) {
  const max = Math.max(1, ...items.map((x) => x.value));
  if (!items.length) return <Empty text="Nothing to show." small />;
  return (
    <ul className="mt-3 space-y-1">
      {items.map((x) => {
        const inner = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-[0.82rem]">
              <span className="truncate">{x.label}</span>
              <span className="shrink-0 font-semibold tabular-nums">{x.display}</span>
            </span>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className="block h-full rounded-full bg-primary/80" style={{ width: `${(x.value / max) * 100}%` }} />
            </span>
          </>
        );
        return (
          <li key={x.key}>
            {x.href ? (
              <Link href={x.href} className="-mx-1.5 block rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none">
                {inner}
              </Link>
            ) : (
              <div className="py-1.5">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MiniTable({ caption, head, rows }: { caption: string; head: string[]; rows: React.ReactNode[][] }) {
  if (!rows.length) return <Empty text="Nothing to show." small />;
  return (
    <table className="mt-2 w-full text-[0.82rem]">
      <caption className="sr-only">{caption}</caption>
      <thead className="text-[0.66rem] tracking-wider text-muted-foreground uppercase">
        <tr>
          {head.map((h, i) => (
            <th key={h} scope="col" className={cn("pb-1.5 font-bold", i === 0 ? "text-start" : "text-end")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className={cn("py-1.5", j === 0 ? "pe-3 text-start [overflow-wrap:anywhere]" : "ps-2 text-end whitespace-nowrap tabular-nums")}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Empty({ text, small, className }: { text: string; small?: boolean; className?: string }) {
  return <p className={cn("rounded-xl border border-dashed text-center text-sm text-muted-foreground", small ? "mt-3 px-3 py-4" : "px-4 py-10", className)}>{text}</p>;
}

/** Accessible bar chart: every bar is focusable with a tooltip, and the values are also in a table. */
function BarChart({ data, label, empty, format }: { data: { label: string; value: number; display: string; details: string[] }[]; label: string; empty: string; format: (v: number) => string }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const max = Math.max(0, ...data.map((d) => d.value));
  if (max <= 0) return <Empty text={empty} />;
  const top = niceTop(max);
  const every = Math.max(1, Math.ceil(data.length / 8));
  return (
    <figure className="min-w-0">
      <div className="flex gap-2">
        <div className="flex h-52 flex-col justify-between text-end text-[0.68rem] text-muted-foreground tabular-nums" aria-hidden>
          <span className="-translate-y-1/2">{format(top)}</span>
          <span>{format(top / 2)}</span>
          <span className="translate-y-1/2">{format(0)}</span>
        </div>
        <div className="relative h-52 min-w-0 flex-1">
          {[0, 50, 100].map((p) => (
            <span key={p} className={cn("absolute inset-x-0 h-px", p === 100 ? "bg-border" : "bg-border/60")} style={{ top: `${p}%` }} aria-hidden />
          ))}
          <ul className="absolute inset-0 flex items-end gap-[3px]" aria-label={label}>
            {data.map((d, i) => {
              const h = (d.value / top) * 100;
              const on = hover === i;
              return (
                <li key={d.label} className="relative flex h-full flex-1 items-end justify-center">
                  <button
                    type="button"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    aria-label={`${d.label}: ${d.display}${d.details.length ? `, ${d.details.join(", ")}` : ""}`}
                    className="flex h-full w-full items-end justify-center rounded-sm focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                  >
                    <span
                      className={cn("block w-full max-w-8 rounded-t-md bg-primary transition-opacity motion-reduce:transition-none", hover !== null && !on && "opacity-35")}
                      style={{ height: `${Math.max(h, d.value > 0 ? 1.5 : 0)}%` }}
                    />
                  </button>
                  {on ? (
                    <span
                      role="tooltip"
                      className={cn(
                        "pointer-events-none absolute z-10 w-max max-w-[14rem] rounded-xl border bg-popover px-3 py-2 text-xs shadow-float",
                        i > data.length - 4 ? "end-0" : i < 3 ? "start-0" : "start-1/2 -translate-x-1/2",
                      )}
                      style={{ bottom: `calc(${Math.min(h, 100)}% + 0.5rem)` }}
                    >
                      <span className="block text-muted-foreground">{d.label}</span>
                      <span className="block text-[0.85rem] font-semibold tabular-nums">{d.display}</span>
                      {d.details.map((x) => (
                        <span key={x} className="block text-muted-foreground">
                          {x}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="mt-2 flex gap-[3px] ps-11 text-[0.66rem] text-muted-foreground" aria-hidden>
        {data.map((d, i) => (
          <span key={d.label} className="relative h-4 min-w-0 flex-1">
            {i % every === 0 ? (
              <span className={cn("absolute start-1/2 -translate-x-1/2 whitespace-nowrap", (i / every) % 2 === 1 && "max-sm:hidden")}>{d.label.split(" – ")[0]}</span>
            ) : null}
          </span>
        ))}
      </div>
      <details className="group mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-primary hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          Show as table
        </summary>
        <table className="mt-2 w-full text-[0.8rem]">
          <caption className="sr-only">{label}</caption>
          <tbody className="divide-y">
            {data.map((d) => (
              <tr key={d.label}>
                <th scope="row" className="py-1 text-start font-normal text-muted-foreground">
                  {d.label}
                </th>
                <td className="py-1 text-end font-semibold tabular-nums">{d.display}</td>
                <td className="hidden py-1 ps-3 text-end text-xs text-muted-foreground sm:table-cell">{d.details.join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function niceTop(max: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * exp;
}

function FilterControl({ s, tab, update }: { s: State; tab: Tab; update: (p: Partial<State>) => void }) {
  const keys = RELEVANT[tab];
  const count = keys.filter((k) => s[k]).length;
  const field = (id: string, label: string, value: string, onChange: (v: string) => void, children: React.ReactNode) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      <SelectInput id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </SelectInput>
    </div>
  );
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`Filters${count ? `, ${count} active` : ""}`}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-3.5 text-sm font-semibold whitespace-nowrap transition-colors hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-primary/15 focus-visible:outline-none data-popup-open:border-primary/50 dark:bg-muted/30",
          count && "border-primary/50 bg-secondary/40 dark:bg-secondary/20",
        )}
      >
        <SlidersHorizontal className="size-4" aria-hidden /> Filters
        {count ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.68rem] font-bold text-primary-foreground tabular-nums">{count}</span> : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <Popover.Popup className={cn(popupSurface, "w-[min(20rem,calc(100vw-1.5rem))] space-y-3 p-4")}>
            <Popover.Title className="text-sm font-bold">Filters</Popover.Title>
            {keys.includes("platform")
              ? field(
                  "an-platform",
                  "Platform",
                  s.platform,
                  (v) => update({ platform: v }),
                  <>
                    <option value="">All platforms</option>
                    {PLATFORMS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </>,
                )
              : null}
            {keys.includes("category")
              ? field(
                  "an-category",
                  "Service type",
                  s.category,
                  (v) => update({ category: v as State["category"] }),
                  <>
                    <option value="">All service types</option>
                    {CATEGORY_ORDER.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_META[c].label}
                      </option>
                    ))}
                  </>,
                )
              : null}
            {keys.includes("status")
              ? field(
                  "an-status",
                  "Order status",
                  s.status,
                  (v) => update({ status: v as State["status"] }),
                  <>
                    <option value="">Any status</option>
                    <option value="attention">Needs attention</option>
                    {STATUSES.map((x) => (
                      <option key={x} value={x}>
                        {ADMIN_ORDER_STATUS[x].label}
                      </option>
                    ))}
                  </>,
                )
              : null}
            {keys.includes("method")
              ? field(
                  "an-method",
                  "Payment method",
                  s.method,
                  (v) => update({ method: v as State["method"] }),
                  <>
                    <option value="">Any method</option>
                    {(Object.keys(METHOD_LABEL) as MethodKey[]).map((k) => (
                      <option key={k} value={k}>
                        {METHOD_LABEL[k]}
                      </option>
                    ))}
                  </>,
                )
              : null}
            {count ? (
              <button type="button" onClick={() => update(Object.fromEntries(keys.map((k) => [k, ""])) as Partial<State>)} className="text-xs font-semibold text-primary hover:underline">
                Clear filters
              </button>
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Select({ id, label, value, onChange, children, className }: { id: string; label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <SelectInput id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-10">
        {children}
      </SelectInput>
    </div>
  );
}

function DateInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="w-[9.5rem] min-w-0">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <TextInput id={id} type="date" value={value} min={isoDay(DATA_START)} max="2026-10-28" onChange={(e) => e.target.value && onChange(e.target.value)} className="h-10" />
    </div>
  );
}
