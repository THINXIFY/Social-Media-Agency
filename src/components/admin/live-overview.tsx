"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Bot, CalendarRange, CircleCheck, CircleDashed, Flag, Inbox, type LucideIcon, Package, PauseCircle, RefreshCw, ShieldAlert, Sparkles, Store, Users, Wallet, Workflow } from "lucide-react";
import { type Compared, type OverviewResponse, RANGE_PRESETS, type RangePreset, type SeriesPoint } from "@/lib/admin-overview";
import { api, ApiError } from "@/lib/live-account";
import { ORDER_STATUS_META, type OrderStatus } from "@/lib/orders";
import { cn } from "@/lib/utils";

/*
 * Live Admin Overview (Phase 5H-A). Everything comes from GET /api/admin/overview,
 * which only returns the sections this viewer's role may see. Nothing is
 * polled; Refresh fetches again. All periods are UTC days.
 */

export const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Math.abs(cents) >= 1_000_000 ? 0 : 2 }).format(cents / 100);
export const num = (v: number) => new Intl.NumberFormat("en-US").format(v);
const compact = (v: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
export const micros = (m: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: m < 10_000_000 ? 4 : 2 }).format(m / 1_000_000);
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
const when = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
export const bucketLabel = (iso: string, unit: "hour" | "day", tz = "UTC") =>
  unit === "hour" ? new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }) : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
const card = "min-w-0 rounded-2xl border bg-card";
const btn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

export function LiveAdminOverview() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // No ?range= means the saved default range, which the server applies.
  const urlPreset = (RANGE_PRESETS.some(([id]) => id === params.get("range")) ? params.get("range") : null) as RangePreset | null;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const [draft, setDraft] = React.useState({ from, to });
  const [n, setN] = React.useState(0);
  const qs = new URLSearchParams(urlPreset ? { range: urlPreset } : {});
  if (urlPreset === "custom") {
    qs.set("from", from);
    qs.set("to", to);
  }
  const url = urlPreset === "custom" && (!from || !to) ? null : `/api/admin/overview?${qs}`;
  const key = url ? `${url}#${n}` : null;
  const [state, setState] = React.useState<{ key?: string; data?: OverviewResponse; error?: string }>({});
  React.useEffect(() => {
    if (!url || !key) return;
    let cancelled = false;
    api<OverviewResponse>(url).then(
      (data) => !cancelled && setState({ key, data }),
      (e: unknown) => !cancelled && setState((s) => ({ ...s, key, error: e instanceof ApiError || e instanceof Error ? e.message : "The overview couldn't be loaded." })),
    );
    return () => {
      cancelled = true;
    };
  }, [url, key]);
  const loading = Boolean(key) && state.key !== key;
  const d = state.data;
  const preset = urlPreset ?? d?.range.preset ?? null;
  const go = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) u.set(k, v);
      else u.delete(k);
    }
    router.replace(`${pathname}?${u}`, { scroll: false });
  };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: d?.range.timezone ?? "UTC" });

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-[0.8rem] font-medium text-muted-foreground">Overview</p>
          <h1 className="mt-1.5 font-heading text-[1.75rem] leading-tight font-extrabold tracking-tight text-balance sm:text-[2.1rem]">Your Business, At a Glance.</h1>
          <p className="mt-1 max-w-2xl text-[0.95rem] text-muted-foreground">Track performance, monitor operations, and stay in control of Sociotix.</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 xl:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-full border bg-card p-1" role="radiogroup" aria-label="Date range">
              {RANGE_PRESETS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={preset === id}
                  onClick={() => (id === "custom" ? go({ range: "custom", from: draft.from || d?.range.from || null, to: draft.to || d?.range.to || null }) : go({ range: id, from: null, to: null }))}
                  className={cn("inline-flex h-8 shrink-0 items-center rounded-full px-2.5 text-[0.8rem] sm:px-3 font-semibold whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none", preset === id ? "bg-graphite text-white dark:bg-white dark:text-graphite" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setN((x) => x + 1)} disabled={loading || !url} className={cn(btn, "border bg-card hover:bg-muted")} aria-label="Refresh overview">
              <RefreshCw className={cn("size-4", loading && "animate-spin motion-reduce:animate-none")} aria-hidden /> Refresh
            </button>
          </div>
          {preset === "custom" ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                go({ range: "custom", from: draft.from, to: draft.to });
              }}
            >
              <label className="text-xs font-semibold text-muted-foreground">
                From
                <input type="date" required max={today} value={draft.from || from} onChange={(e) => setDraft((x) => ({ ...x, from: e.target.value }))} className="mt-1 block h-9 rounded-xl border bg-background px-2.5 text-sm text-foreground dark:bg-muted/30" />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                To
                <input type="date" required max={today} value={draft.to || to} onChange={(e) => setDraft((x) => ({ ...x, to: e.target.value }))} className="mt-1 block h-9 rounded-xl border bg-background px-2.5 text-sm text-foreground dark:bg-muted/30" />
              </label>
              <button type="submit" className={cn(btn, "bg-primary text-primary-foreground hover:bg-primary/90")}>
                Apply
              </button>
            </form>
          ) : null}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            <CalendarRange className="size-3.5" aria-hidden />
            {d ? (
              <>
                {d.range.label} · Updated {time(d.generatedAt)}
              </>
            ) : (
              "Loading…"
            )}
          </p>
        </div>
      </header>

      {state.error && state.key === key ? (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/[0.05] p-4 text-sm">
          <span>
            <span className="font-semibold">The overview couldn&apos;t be loaded.</span> <span className="text-muted-foreground">{state.error}</span>
          </span>
          <button type="button" onClick={() => setN((x) => x + 1)} className={cn(btn, "border bg-card hover:bg-muted")}>
            Try again
          </button>
        </div>
      ) : null}

      {!d ? <Skeleton /> : <Dashboard d={d} stale={loading} />}
    </div>
  );
}

function Skeleton() {
  const b = "animate-pulse rounded-2xl bg-muted motion-reduce:animate-none";
  return (
    <div className="mt-6 space-y-5" aria-busy="true">
      <span className="sr-only">Loading the overview…</span>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={cn("h-28", b)} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={cn("h-80 lg:col-span-2", b)} />
        <div className={cn("h-80", b)} />
      </div>
    </div>
  );
}

function Dashboard({ d, stale }: { d: OverviewResponse; stale: boolean }) {
  const periodWord = d.range.preset === "today" ? "today" : "in this period";
  return (
    <div className={cn("mt-6 space-y-8 transition-opacity", stale && "opacity-60")} aria-busy={stale}>
      {/* A. Executive KPIs */}
      <section aria-label="Key figures" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
        {d.customers ? <Kpi icon={Users} label="Customers" value={num(d.customers.total)} sub={`${num(d.customers.new.value)} new ${periodWord}`} delta={d.customers.new} href="/admin/customers" /> : null}
        {d.orders ? <Kpi icon={Package} label="Orders placed" value={num(d.orders.placed.value)} sub={`${num(d.orders.total)} all time`} delta={d.orders.placed} href="/admin/orders" /> : null}
        {d.finance ? <Kpi icon={CircleCheck} label="Recognised revenue" value={money(d.finance.revenueCents.value)} sub={d.finance.revenuePolicy === "deferred" ? "Recognition is deferred by policy" : `${num(d.finance.recognizedOrders)} completed order${d.finance.recognizedOrders === 1 ? "" : "s"} recognised`} delta={d.finance.revenueCents} href="/admin/payments" tone="lime" /> : null}
        {d.finance ? <Kpi icon={Wallet} label="Wallet funding" value={money(d.finance.fundingCents.value)} sub={`${num(d.finance.fundingCount)} credited deposit${d.finance.fundingCount === 1 ? "" : "s"} · not revenue`} delta={d.finance.fundingCents} href="/admin/payments" /> : null}
        {d.services ? <Kpi icon={Store} label="Orderable services" value={num(d.services.purchasable)} sub={`of ${num(d.services.total)} in the catalog`} href="/admin/services" /> : null}
        {d.support ? <Kpi icon={Inbox} label="Open tickets" value={num(d.support.needsReply + d.support.inProgress + d.support.waiting)} sub={`${num(d.support.needsReply)} need a reply`} href="/admin/support" alert={d.support.needsReply > 0} /> : null}
      </section>

      {/* B. Business performance */}
      {d.orders || d.customers || d.finance ? (
        <Section title="Business performance" description={`${d.range.label}. Buckets are ${d.range.unit === "hour" ? "hours" : "days"} in UTC.`}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {d.orders ? (
              <Panel title="Orders placed" className="lg:col-span-2" aside={<span className="tabular-nums">{num(d.orders.placed.value)} total</span>}>
                <Bars tz={d.range.timezone} series={d.orders.series} unit={d.range.unit} label="Orders placed" format={num} />
              </Panel>
            ) : null}
            {d.orders ? (
              <Panel title="Order status" aside={`Orders placed ${periodWord}`}>
                <HBars empty="No orders were placed in this period." items={d.orders.byStatus.map((s) => ({ key: s.status, label: ORDER_STATUS_META[s.status as OrderStatus]?.label ?? s.status, value: s.count, href: `/admin/orders?status=${s.status}` }))} format={num} />
              </Panel>
            ) : null}
            {d.customers ? (
              <Panel title="New registrations" className={d.finance ? "" : "lg:col-span-2"} aside={<span className="tabular-nums">{num(d.customers.new.value)} · {num(d.customers.verifiedNew)} confirmed email</span>}>
                <Bars tz={d.range.timezone} series={d.customers.series} unit={d.range.unit} label="New registrations" format={num} />
              </Panel>
            ) : null}
            {d.finance ? (
              <Panel title="Wallet funding" aside={<span className="tabular-nums">{money(d.finance.fundingCents.value)}</span>}>
                <Bars tz={d.range.timezone} series={d.finance.fundingSeries} unit={d.range.unit} label="Wallet funding" format={(c) => money(c)} axis={(c) => `$${compact(c / 100)}`} />
              </Panel>
            ) : null}
            {d.finance ? (
              <Panel title="Money, kept separate" aside="Ledger figures">
                <dl className="divide-y text-sm">
                  <Money label="Recognised revenue" hint={`Net of refunds, ${periodWord}`} value={money(d.finance.revenueCents.value)} />
                  <Money label="Revenue to date" hint="Completed orders, net of refunds" value={money(d.finance.revenueLifetimeCents)} />
                  {d.orders ? <Money label="Order value placed" hint={`Gross, ${periodWord}. Not revenue`} value={money(d.orders.valueCents.value)} /> : null}
                  <Money label="Committed to open orders" hint="Paid, not yet delivered (deferred)" value={money(d.finance.committedToOrdersCents)} />
                  <Money label="Wallet balances" hint={`Owed to ${num(d.finance.fundedCustomers)} customer${d.finance.fundedCustomers === 1 ? "" : "s"}`} value={money(d.finance.walletLiabilitiesCents)} />
                </dl>
              </Panel>
            ) : null}
          </div>
        </Section>
      ) : null}

      {/* C. Operational health */}
      <Operations d={d} />

      {/* D. Customer & service insights */}
      {d.orders || d.services ? (
        <Section title="Customer & service insights" description="From real orders and the catalog's eligibility records.">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {d.orders ? (
              <Panel title="Most ordered services" aside={`Orders placed ${periodWord}`}>
                {d.orders.topServices.length ? (
                  <ol className="space-y-2.5">
                    {d.orders.topServices.map((s, i) => (
                      <li key={s.id} className="flex items-start gap-3">
                        <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-muted text-xs font-bold tabular-nums">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold" title={s.name}>
                            {s.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {s.platform || "—"} · {num(s.orders)} order{s.orders === 1 ? "" : "s"} · {money(s.valueCents)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty text="No orders were placed in this period." />
                )}
              </Panel>
            ) : null}
            {d.orders ? (
              <Panel title="Orders by platform" aside={`Orders placed ${periodWord}`}>
                <HBars empty="No orders were placed in this period." items={d.orders.platforms.map((p) => ({ key: p.name, label: p.name, value: p.orders }))} format={num} />
              </Panel>
            ) : null}
            {d.services ? (
              <Panel title="Service readiness" aside={<Link href="/admin/services" className="font-semibold text-primary hover:underline dark:text-[#b9a6ff]">Open catalog</Link>}>
                <Funnel
                  steps={[
                    { label: "In the catalog", value: d.services.total },
                    { label: "Visible to customers", value: d.services.visible },
                    { label: "Priced", value: d.services.priced },
                    { label: "Every eligibility check passed", value: d.services.purchasable },
                  ]}
                />
                <p className="mt-4 flex items-center gap-2 text-sm">
                  <StatusDot ok={d.services.checkoutEnabled} />
                  Checkout {d.services.checkoutEnabled ? "is on" : "is off"}
                  {!d.services.checkoutEnabled ? <span className="text-muted-foreground">: customers can browse but not order.</span> : null}
                </p>
              </Panel>
            ) : null}
          </div>
        </Section>
      ) : null}

      {/* E + F */}
      {d.ai || d.activity ? (
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
          {d.ai ? <AiPanel ai={d.ai} periodWord={periodWord} /> : null}
          {d.activity ? (
            <Section title="Recent activity" description="The latest recorded actions you're allowed to see.">
              <div className={cn(card, "p-2")}>
                {d.activity.length ? (
                  <ul className="divide-y">
                    {d.activity.map((a) => (
                      <li key={a.id}>
                        <Link href={a.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
                          <span className="size-2 shrink-0 rounded-full bg-primary/70" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{a.label}</span>
                            <span className="block text-xs text-muted-foreground">
                              {a.area} · {a.actor}
                            </span>
                          </span>
                          <time dateTime={a.at} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            {when(a.at)}
                          </time>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty text="Nothing has been recorded yet." />
                )}
              </div>
            </Section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  const id = `sec-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="min-w-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id} className="font-heading text-lg font-bold tracking-tight">
          {title}
        </h2>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Panel({ title, aside, className, children }: { title: string; aside?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn(card, "flex flex-col p-4 sm:p-5", className)}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold">{title}</h3>
        {aside ? <span className="text-xs text-muted-foreground">{aside}</span> : null}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Delta({ c }: { c: Compared }) {
  if (c.previous === null) return <span className="text-muted-foreground">No earlier data to compare</span>;
  if (c.previous === 0) return <span className="text-muted-foreground">{c.value === 0 ? "None in either period" : "None in the previous period"}</span>;
  const pct = ((c.value - c.previous) / Math.abs(c.previous)) * 100;
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-semibold", Math.abs(pct) < 0.5 ? "text-muted-foreground" : up ? "text-ok" : "text-destructive")}>
      <Icon className="size-3.5" aria-hidden />
      {up ? "+" : "−"}
      {Math.abs(pct) >= 100 ? Math.round(Math.abs(pct)) : Math.abs(pct).toFixed(1)}%<span className="font-normal text-muted-foreground"> vs previous period</span>
    </span>
  );
}

function Kpi({ icon: Icon, label, value, sub, delta, href, tone, alert }: { icon: LucideIcon; label: string; value: string; sub: string; delta?: Compared; href: string; tone?: "lime"; alert?: boolean }) {
  return (
    <Link href={href} className={cn(card, "group relative flex flex-col overflow-hidden p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-primary/30 hover:shadow-[0_14px_30px_-24px_rgb(112_71_235/0.8)] focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0")}>
      {tone === "lime" ? <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-lime" /> : null}
      <span className="flex items-center justify-between gap-2 text-[0.8rem] font-medium text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/[0.08] text-primary dark:bg-primary/20 dark:text-[#c4b5ff]" aria-hidden>
            <Icon className="size-3.5" />
          </span>
          <span className="truncate">{label}</span>
        </span>
        {alert ? <span className="size-2 shrink-0 rounded-full bg-soon" aria-label="Needs attention" /> : <ArrowRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
      </span>
      <span className="mt-3 truncate font-heading text-[1.65rem] leading-none font-extrabold tracking-tight tabular-nums">{value}</span>
      <span className="mt-2 text-xs text-muted-foreground">{sub}</span>
      {delta ? (
        <span className="mt-1 text-xs">
          <Delta c={delta} />
        </span>
      ) : null}
    </Link>
  );
}

/** Single-series column chart: hover/focus tooltip per bar, buckets before the first record shown as "no history", and a table alternative. */
export function Bars({ series, unit, label, format, axis = (v) => compact(v), tz = "UTC" }: { series: SeriesPoint[]; unit: "hour" | "day"; label: string; format: (v: number) => string; axis?: (v: number) => string; tz?: string }) {
  const max = Math.max(0, ...series.map((p) => p.value));
  const top = max === 0 ? 1 : niceCeil(max);
  const total = series.reduce((s, p) => s + p.value, 0);
  const hasHistory = series.some((p) => !p.beforeData);
  const tick = (i: number) => i === 0 || i === series.length - 1 || (series.length > 8 && i === Math.floor((series.length - 1) / 2));
  if (!hasHistory) return <Empty text="No records exist for this period yet." />;
  return (
    <div>
      <div className="flex gap-2">
        <div className="flex h-44 w-10 shrink-0 flex-col justify-between text-end text-[0.68rem] text-muted-foreground tabular-nums" aria-hidden>
          <span>{axis(top)}</span>
          <span>{axis(top / 2)}</span>
          <span>{axis(0)}</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden>
            <span className="border-t border-dashed border-border" />
            <span className="border-t border-dashed border-border" />
            <span className="border-t border-border" />
          </div>
          <div className="relative flex h-44 items-end gap-[2px]" role="img" aria-label={`${label}: ${format(total)} across ${series.length} ${unit === "hour" ? "hours" : "days"}, peaking at ${format(max)}.`}>
            {series.map((p) => {
              const h = (p.value / top) * 100;
              return (
                <div key={p.t} className="group relative flex h-full min-w-0 flex-1 items-end justify-center">
                  {p.beforeData ? (
                    <span className="h-px w-full bg-[repeating-linear-gradient(90deg,var(--border)_0_3px,transparent_3px_6px)]" />
                  ) : (
                    <span className={cn("w-full max-w-7 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80", p.value === 0 && "h-px rounded-none bg-border")} style={p.value ? { height: `max(${h}%, 3px)` } : undefined} />
                  )}
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg bg-graphite px-2 py-1 text-[0.7rem] whitespace-nowrap text-white shadow-lg group-hover:block dark:bg-white dark:text-graphite">
                    {bucketLabel(p.t, unit, tz)} · {p.beforeData ? "no history yet" : format(p.value)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex text-[0.68rem] text-muted-foreground" aria-hidden>
            {series.map((p, i) => (
              <span key={p.t} className={cn("min-w-0 flex-1 whitespace-nowrap", i === series.length - 1 ? "text-end" : i === 0 ? "text-start" : "text-center")}>
                {tick(i) ? bucketLabel(p.t, unit, tz) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer font-semibold text-muted-foreground hover:text-foreground">View as table</summary>
        <div className="mt-2 max-h-48 overflow-auto rounded-lg border">
          <table className="w-full text-start">
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr>
                <th scope="col" className="px-2 py-1 text-start font-semibold">
                  {unit === "hour" ? "Hour" : "Day"}
                </th>
                <th scope="col" className="px-2 py-1 text-end font-semibold">
                  {label}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {series.map((p) => (
                <tr key={p.t}>
                  <td className="px-2 py-1">{bucketLabel(p.t, unit, tz)}</td>
                  <td className="px-2 py-1 text-end tabular-nums">{p.beforeData ? "No history" : format(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

const niceCeil = (v: number) => {
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
};

export function HBars({ items, format, empty }: { items: { key: string; label: string; value: number; href?: string }[]; format: (v: number) => string; empty: string }) {
  if (!items.length) return <Empty text={empty} />;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((i) => {
        const inner = (
          <>
            <span className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{i.label}</span>
              <span className="shrink-0 font-semibold tabular-nums">{format(i.value)}</span>
            </span>
            <span className="mt-1 block h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max((i.value / max) * 100, 2)}%` }} />
            </span>
          </>
        );
        return (
          <li key={i.key}>
            {i.href ? (
              <Link href={i.href} className="-mx-1.5 block rounded-lg px-1.5 py-0.5 transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(steps[0]?.value ?? 0, 1);
  return (
    <ul className="space-y-2.5">
      {steps.map((s) => (
        <li key={s.label}>
          <span className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0">{s.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">{num(s.value)}</span>
          </span>
          <span className="mt-1 block h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className="block h-full rounded-full bg-primary" style={{ width: `${s.value ? Math.max((s.value / max) * 100, 2) : 0}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Money({ label, hint, value }: { label: string; hint: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <dt className="min-w-0">
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </dt>
      <dd className="shrink-0 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="grid min-h-32 place-items-center rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
      <span className="flex flex-col items-center gap-1.5">
        <CircleDashed className="size-5" aria-hidden />
        {text}
      </span>
    </div>
  );
}

export function StatusDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return <span className={cn("size-2 shrink-0 rounded-full", ok ? "bg-ok" : warn ? "bg-soon" : "bg-off")} aria-hidden />;
}

type OpTile = { icon: LucideIcon; label: string; value: string; detail: string; href: string; state: "ok" | "attention" | "off" };

function Operations({ d }: { d: OverviewResponse }) {
  const tiles: OpTile[] = [];
  const count = (v: number, ok: string, attention: string) => ({ value: num(v), detail: v ? attention : ok, state: (v ? "attention" : "ok") as OpTile["state"] });
  if (d.orders) {
    tiles.push({ icon: Package, label: "Orders awaiting review", href: "/admin/orders?status=pending_review", ...count(d.orders.queues.review, "Queue is clear", "Approve or reject to start work") });
    tiles.push({ icon: AlertTriangle, label: "Waiting on customers", href: "/admin/orders?status=needs_customer_action", ...count(d.orders.queues.needsInfo, "Nothing pending", "Customers must update details"), state: "ok" });
    tiles.push({ icon: Workflow, label: "Ready or in progress", href: "/admin/orders?status=open", value: num(d.orders.queues.ready + d.orders.queues.inProgress), detail: `${num(d.orders.queues.ready)} ready · ${num(d.orders.queues.inProgress)} in progress`, state: "ok" });
  }
  if (d.providers) {
    tiles.push({ icon: ShieldAlert, label: "Uncertain provider outcomes", href: "/admin/providers", ...count(d.providers.unknownOutcomes, "None to resolve", "Resolve before retrying") });
    tiles.push(
      d.providers.ready
        ? { icon: Store, label: "Provider integrations", href: "/admin/providers", value: `${d.providers.ready} ready`, detail: `${num(d.providers.activeAttempts)} active attempt${d.providers.activeAttempts === 1 ? "" : "s"}`, state: "ok" }
        : { icon: Store, label: "Provider integrations", href: "/admin/providers", value: "Not configured", detail: d.providers.total ? `${d.providers.total} added, none enabled and reviewed` : "No providers added", state: "off" },
    );
  }
  if (d.finance) {
    tiles.push({ icon: Wallet, label: "Deposits to verify", href: "/admin/payments?status=under_review", ...count(d.finance.depositsAwaitingReview, "Nothing to verify", "Check the receipt, then credit") });
    tiles.push(
      d.finance.paymentMethods.configured
        ? { icon: CircleCheck, label: "Payment methods", href: "/admin/payments", value: `${d.finance.paymentMethods.configured} of ${d.finance.paymentMethods.total}`, detail: "Accepting deposit requests", state: "ok" }
        : { icon: CircleCheck, label: "Payment methods", href: "/admin/payments", value: "Not configured", detail: "No method accepts deposits yet", state: "off" },
    );
  }
  if (d.support) tiles.push({ icon: Inbox, label: "Tickets needing a reply", href: "/admin/support", ...count(d.support.needsReply, "All caught up", `${num(d.support.waiting)} waiting on customers`) });
  if (d.referrals) tiles.push({ icon: Flag, label: "Flagged referrals", href: "/admin/referrals", ...count(d.referrals.flaggedOpen, "No signals to review", `${num(d.referrals.underReview)} under review`) });
  if (!tiles.length) return null;
  return (
    <Section title="Operational health" description="Current state, not limited to the selected period.">
      <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {tiles.map((t) => (
          <li key={t.label} className="min-w-0">
            <Link href={t.href} className={cn(card, "group flex h-full items-start gap-3 p-3.5 transition-colors hover:border-primary/30 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none", t.state === "attention" && "border-soon/40 bg-soon-soft/30")}>
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", t.state === "attention" ? "bg-soon-soft text-soon" : t.state === "off" ? "bg-off-soft text-off" : "bg-ok-soft text-ok")} aria-hidden>
                <t.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-muted-foreground">{t.label}</span>
                <span className="mt-0.5 block font-heading text-lg leading-tight font-extrabold tabular-nums">{t.value}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  <span className="sr-only">{t.state === "attention" ? "Needs attention. " : t.state === "off" ? "Not configured. " : "OK. "}</span>
                  {t.detail}
                </span>
              </span>
              <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function AiPanel({ ai, periodWord }: { ai: NonNullable<OverviewResponse["ai"]>; periodWord: string }) {
  const genState = ai.emergencyPaused ? { label: "Paused (emergency)", icon: PauseCircle, ok: false, warn: true } : ai.generation.live ? { label: "Live", icon: Sparkles, ok: true, warn: false } : { label: "Off", icon: Bot, ok: false, warn: false };
  const tokens = ai.inputTokens === null ? "Not reported" : num((ai.inputTokens ?? 0) + (ai.outputTokens ?? 0));
  return (
    <Section title="AI & automation" description="Usage estimates from Sociotix's own records, not provider invoices.">
      <div className={cn(card, "p-4 sm:p-5")}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="flex items-center gap-2">
            <StatusDot ok={genState.ok} warn={genState.warn} />
            AI generation: <span className="font-semibold">{genState.label}</span>
          </span>
          <span className="flex items-center gap-2">
            <StatusDot ok={ai.providersActive > 0} />
            Providers verified: <span className="font-semibold tabular-nums">{ai.providersActive ? `${ai.providersActive} of ${ai.providersTotal}` : "None"}</span>
          </span>
          <Link href="/admin/ai" className="ms-auto inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline dark:text-[#b9a6ff]">
            AI Management <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
        {!ai.generation.live && ai.generation.reason ? <p className="mt-1.5 text-xs text-muted-foreground">{ai.generation.reason}</p> : null}
        <dl className="mt-4 grid grid-cols-2 gap-3 2xl:grid-cols-4">
          <Stat label={`Requests ${periodWord}`} value={num(ai.requests)} />
          <Stat label="Errors" value={num(ai.errors)} warn={ai.errors > 0} />
          <Stat label="Tokens" value={tokens} />
          <Stat label="Estimated cost" value={micros(ai.estimatedCostMicros)} />
        </dl>
        {ai.blocked ? <p className="mt-2 text-xs text-muted-foreground">{num(ai.blocked)} request{ai.blocked === 1 ? " was" : "s were"} stopped by allowances or budgets.</p> : null}
        <div className="mt-5 border-t pt-4">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Workflow className="size-4 text-muted-foreground" aria-hidden /> Internal automations
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {ai.automation.runs ? (
              <>
                <span className="font-semibold text-foreground tabular-nums">{num(ai.automation.runs)}</span> run{ai.automation.runs === 1 ? "" : "s"} {periodWord}: {num(ai.automation.succeeded)} succeeded, {num(ai.automation.skipped)} skipped, {num(ai.automation.failed)} failed.
              </>
            ) : (
              `No automation runs ${periodWord}.`
            )}{" "}
            These run inside Sociotix.
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <StatusDot ok={ai.publishingProviders > 0} />
            External publishing: <span className="font-semibold">{ai.publishingProviders ? `${ai.publishingProviders} network${ai.publishingProviders === 1 ? "" : "s"} enabled` : "Off"}</span>
          </p>
        </div>
      </div>
    </Section>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/50 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 font-heading text-lg leading-tight font-extrabold break-words tabular-nums", warn && "text-destructive")}>{value}</dd>
    </div>
  );
}

