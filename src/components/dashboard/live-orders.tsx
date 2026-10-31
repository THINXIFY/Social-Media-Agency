"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CircleAlert, Compass, PackageOpen, RotateCcw, RotateCw, Search, ShoppingBag, X } from "lucide-react";
import { ExplainOrderAction } from "@/components/ai/order-explanation";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { usd } from "@/lib/demo-account";
import { formatDateTime, useDisplay } from "@/lib/i18n";
import { api, ApiError } from "@/lib/live-account";
import { type CustomerOrder, ORDER_STATUS_META, type OrderStatus, type OrderTone, PAYMENT_STATUS_META } from "@/lib/orders";
import { cn } from "@/lib/utils";
import { useLiveAccount } from "./live-account";
import { enter, FINDER_ROUTE, newOrderHref, Pagination, Panel } from "./shared";

/*
 * Live My Orders (DEMO_MODE off): the customer's own orders only, with
 * recorded activity — no sample orders, no invented progress. The open order
 * lives in ?order= so links, Back and Forward work.
 */

const cents = (n: number) => usd(n / 100);
const TONE: Record<OrderTone, string> = {
  pending: "bg-soon-soft text-soon",
  active: "bg-secondary text-secondary-foreground",
  attention: "bg-destructive/10 text-destructive",
  ok: "bg-lime/25 text-graphite dark:text-lime",
  closed: "bg-muted text-muted-foreground",
  bad: "bg-destructive/10 text-destructive",
};

export function OrderBadge({ status, staff = false }: { status: OrderStatus; staff?: boolean }) {
  const m = ORDER_STATUS_META[status];
  return <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[0.7rem] font-bold whitespace-nowrap", TONE[m.tone])}>{staff ? m.label : m.customerLabel}</span>;
}

interface Page {
  items: CustomerOrder[];
  total: number;
  pages: number;
}

const FILTERS: [string, string][] = [
  ["", "All"],
  ["open", "Active"],
  ["attention", "Needs you"],
  ["completed", "Completed"],
  ["closed", "Canceled & failed"],
];

function useJson<T>(url: string | null) {
  const [attempt, setAttempt] = React.useState(0);
  const key = url ? `${url}#${attempt}` : null;
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
  const loading = Boolean(key) && state.key !== key;
  return { data: state.data, error: loading ? undefined : state.error, loading, retry: () => setAttempt((n) => n + 1) };
}

export function LiveOrders() {
  useDisplay();
  const live = useLiveAccount()!;
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const status = params.get("status") ?? "";
  const openRef = params.get("order");
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const [query, setQuery] = React.useState(q.trim());
  const [page, setPage] = React.useState(1);
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    const t = window.setTimeout(() => (setQuery(q.trim()), setPage(1)), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const href = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) u.set(k, v);
      else u.delete(k);
    }
    const s = u.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  const lp = new URLSearchParams({ page: String(page), pageSize: "10", v: String(version) });
  if (status) lp.set("status", status);
  if (query) lp.set("q", query);
  const list = useJson<Page>(`/api/account/orders?${lp}`);
  const e = [0, 1].map(enter);

  return (
    <div className="mx-auto max-w-[90rem] px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <header className={cn("flex flex-wrap items-end justify-between gap-4", e[0].className)} style={e[0].style}>
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">My Orders</h1>
          <p className="mt-1 max-w-xl text-[0.95rem] text-muted-foreground">Every order, its status and what has actually happened so far.</p>
        </div>
        <Link href={newOrderHref()} className="inline-flex h-11 items-center gap-2 rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary">
          <ShoppingBag className="size-4" aria-hidden /> New order
        </Link>
      </header>

      <Panel className={cn("mt-6 overflow-hidden", e[1].className)} style={e[1].style} aria-busy={list.loading || undefined}>
        <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Filter orders" className="-mx-1 flex gap-1 overflow-x-auto no-scrollbar">
            {FILTERS.map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={status === v}
                onClick={() => (setPage(1), router.replace(href({ status: v || null }), { scroll: false }))}
                className={cn("h-9 shrink-0 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors", status === v ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
              >
                {l}
              </button>
            ))}
          </nav>
          <label className="relative lg:w-80">
            <span className="sr-only">Search orders</span>
            <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input type="search" value={q} maxLength={80} onChange={(ev) => setQ(ev.target.value)} placeholder="Search by order, service or link" className="h-10 w-full rounded-xl border bg-card ps-10 pe-3 text-sm outline-none focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15" />
          </label>
        </div>

        {list.error ? (
          <div role="alert" className="flex flex-col items-center border-t px-6 py-12 text-center">
            <CircleAlert className="size-6 text-destructive" aria-hidden />
            <p className="mt-3 font-semibold">Your orders didn&apos;t load</p>
            <p className="mt-1 text-sm text-muted-foreground">{list.error}</p>
            <button type="button" onClick={list.retry} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold hover:bg-muted">
              <RotateCw className="size-3.5" aria-hidden /> Try again
            </button>
          </div>
        ) : !list.data ? (
          <div className="space-y-2 border-t p-4 sm:p-5" aria-label="Loading orders">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
            ))}
          </div>
        ) : list.data.items.length === 0 ? (
          <div className="flex flex-col items-center border-t px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary" aria-hidden>
              <PackageOpen className="size-5" />
            </span>
            <p className="mt-4 font-heading text-lg font-bold">{status || query ? "No orders match" : live.orderCount ? "No orders here" : "No orders yet"}</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {status || query ? "Try another filter or search." : "Ordering isn't open yet. When it is, every order you place appears here with its real progress."}
            </p>
            {!status && !query ? (
              <Link href={FINDER_ROUTE} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                <Compass className="size-4" aria-hidden /> Browse services
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            <ul className="divide-y border-t" aria-label="Orders">
              {list.data.items.map((o) => (
                <li key={o.reference}>
                  <button type="button" onClick={() => router.push(href({ order: o.reference }), { scroll: false })} className={cn("flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 text-start transition-colors hover:bg-muted/40 sm:px-5", openRef === o.reference && "bg-secondary/30")}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{o.service.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        <span className="font-mono">{o.reference}</span> · {o.quantity.toLocaleString("en-US")} · {formatDateTime(o.placedAt)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-heading font-bold tabular-nums">{cents(o.totalCents)}</span>
                      <OrderBadge status={o.status} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {list.data.pages > 1 ? <Pagination page={page} pageCount={list.data.pages} total={list.data.total} pageSize={10} label="Order pages" onPage={setPage} /> : null}
          </>
        )}
      </Panel>

      <OrderSheet
        key={openRef ?? "none"}
        reference={openRef}
        onClose={() => router.push(href({ order: null }), { scroll: false })}
        onChanged={() => {
          setVersion((v) => v + 1);
          void live.refreshWallet();
        }}
      />
    </div>
  );
}

function OrderSheet({ reference, onClose, onChanged }: { reference: string | null; onClose: () => void; onChanged: () => void }) {
  const detail = useJson<{ order: CustomerOrder }>(reference ? `/api/account/orders/${encodeURIComponent(reference)}` : null);
  const [order, setOrder] = React.useState<CustomerOrder | null>(null);
  const o = order ?? detail.data?.order ?? null;
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; field?: string } | null>(null);
  const [link, setLink] = React.useState<string | null>(null);

  const run = async (path: string, body: object) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ order: CustomerOrder }>(`/api/account/orders/${encodeURIComponent(reference!)}/${path}`, { method: "POST", body: JSON.stringify(body) });
      setOrder(res.order);
      setLink(null);
      onChanged();
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : "That didn't work.", field: e instanceof ApiError ? e.field : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={Boolean(reference)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[34rem]">
        <div className="flex items-start gap-3 border-b px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-heading text-lg leading-tight font-bold">{o?.service.name ?? "Order"}</SheetTitle>
            <SheetDescription className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-[0.8rem]">{reference}</span>
              {o ? <OrderBadge status={o.status} /> : null}
            </SheetDescription>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6" aria-busy={detail.loading || undefined}>
          {detail.error ? (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              {detail.error}
            </p>
          ) : !o ? (
            <div className="space-y-3" aria-label="Loading order">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
              ))}
            </div>
          ) : (
            <>
              <section className="rounded-2xl border p-4" aria-label="Status">
                <p className="font-semibold">{ORDER_STATUS_META[o.status].customerLabel}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{ORDER_STATUS_META[o.status].customerExplain}</p>
                {o.statusReason ? <p className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-sm">{o.statusReason}</p> : null}
                {o.canUpdateDetails ? (
                  <form
                    className="mt-3 space-y-2"
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      void run("details", { link: (link ?? o.link ?? "").trim(), details: o.details });
                    }}
                  >
                    <label className="block text-sm font-medium">
                      Target link
                      <input value={link ?? o.link ?? ""} onChange={(ev) => setLink(ev.target.value)} maxLength={500} aria-invalid={error?.field === "link" || undefined} className="mt-1 h-10 w-full rounded-xl border bg-card px-3 text-sm outline-none focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 aria-invalid:border-destructive" />
                    </label>
                    <button type="submit" disabled={busy} className="h-10 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                      {busy ? "Sending…" : "Send updated details"}
                    </button>
                  </form>
                ) : null}
              </section>

              {/* AI-05: a plain-language explanation from this order's record (read-only, runs only when asked). */}
              <ExplainOrderAction order={o} />

              {error ? (
                <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm">
                  {error.message}
                </p>
              ) : null}

              <section aria-label="Order details">
                <h3 className="mb-2 text-sm font-bold">Details</h3>
                <dl className="divide-y rounded-xl border text-sm">
                  {[
                    ["Service", `${o.service.platform} · ${o.service.name}`],
                    ["Quantity", o.quantity.toLocaleString("en-US")],
                    ["Target", o.link ?? "—"],
                    ...Object.entries(o.details).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), v]),
                    ["Total", `${cents(o.totalCents)} USD`],
                    ["Payment", PAYMENT_STATUS_META[o.paymentStatus].label],
                    ["Placed", formatDateTime(o.placedAt)],
                    ...(o.completedAt ? [["Completed", formatDateTime(o.completedAt)]] : []),
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="min-w-0 text-end font-medium break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">{PAYMENT_STATUS_META[o.paymentStatus].explain}</p>
              </section>

              <section aria-label="Activity">
                <h3 className="mb-2 text-sm font-bold">Activity</h3>
                <ol className="space-y-3 border-s ps-4">
                  {o.events.map((ev, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -start-[1.3rem] top-1.5 size-2 rounded-full bg-primary" aria-hidden />
                      <p className="text-sm font-semibold">{ev.label}</p>
                      {ev.detail ? <p className="text-sm text-muted-foreground">{ev.detail}</p> : null}
                      <p className="text-xs text-muted-foreground">{formatDateTime(ev.at)}</p>
                    </li>
                  ))}
                </ol>
              </section>

              <div className="flex flex-wrap gap-2">
                <Link href={newOrderHref(o.service.id)} className="inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold hover:bg-muted">
                  <RotateCcw className="size-4" aria-hidden /> Order again
                </Link>
                {o.canCancel ? (
                  <button type="button" disabled={busy} onClick={() => run("cancel", {})} className="inline-flex h-10 items-center gap-2 rounded-full border border-destructive/40 px-4 text-sm font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-60">
                    {busy ? "Canceling…" : `Cancel and return ${cents(o.totalCents)}`}
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
