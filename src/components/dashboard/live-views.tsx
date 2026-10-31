"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  Clock,
  Compass,
  LayoutGrid,
  ListOrdered,
  Lock,
  PackageOpen,
  RotateCw,
  Search,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { CATEGORY_META, CATEGORY_ORDER, PLATFORMS, type ServiceCategory } from "@/lib/catalog";
import { usd } from "@/lib/demo-account";
import { formatDate, formatDateTime, useDisplay } from "@/lib/i18n";
import { api, type WalletEntry } from "@/lib/live-account";
import { cn } from "@/lib/utils";
import type { CustomerDeposit } from "@/lib/deposits";
import { useLiveAccount } from "./live-account";
import { BankInstructionsPanel, DepositStatusBadge } from "./live-deposit";
import { enter, FINDER_ROUTE, Pagination, Panel, PanelHeader, ROUTES } from "./shared";

/*
 * Live-mode (DEMO_MODE off) dashboard views. Every figure comes from the
 * customer's own stored records. Ordering and adding funds aren't open yet,
 * so those actions are shown as unavailable rather than simulated.
 */

const page = "mx-auto max-w-[90rem] px-3 py-4 sm:px-6 sm:py-7 lg:px-8";
const h1 = "text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]";
const cents = (n: number) => usd(n / 100);
const PLATFORM_BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]));

function Header({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  const e = enter(0);
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4", e.className)} style={e.style}>
      <div className="min-w-0">
        <h1 className={h1}>{title}</h1>
        <p className="mt-1 max-w-xl text-[0.95rem] text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

function Stat({ label, value, hint, icon: Icon }: { label: string; value: React.ReactNode; hint?: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Panel className="p-4 sm:p-5">
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" aria-hidden /> {label}
      </p>
      <p className="mt-2 font-heading text-2xl font-extrabold tracking-tight tabular-nums sm:text-[1.65rem]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Panel>
  );
}

function EmptyState({ icon: Icon, title, children, action }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary" aria-hidden>
        <Icon className="size-5" />
      </span>
      <p className="mt-4 font-heading text-lg font-bold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <CircleAlert className="size-6 text-destructive" aria-hidden />
      <p className="mt-3 font-semibold">This didn&apos;t load</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      <button type="button" onClick={onRetry} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
        <RotateCw className="size-3.5" aria-hidden /> Try again
      </button>
    </div>
  );
}

const secondaryLink =
  "inline-flex h-11 items-center gap-2 rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";

const linkButton =
  "inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_10px_28px_-12px_rgb(112_71_235/0.8)] transition-all hover:-translate-y-px hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none";

/* -------------------------------------------------------------------------- */
/*  Overview                                                                  */
/* -------------------------------------------------------------------------- */

export function LiveOverview() {
  useDisplay();
  const live = useLiveAccount()!;
  const { profile, wallet, orderCount } = live;
  const e = [1, 2, 3].map(enter);
  return (
    <div className={page}>
      <Header
        title={`Welcome, ${profile.displayName || profile.firstName}`}
        subtitle="Your account at a glance. Checkout opens once services pass every review — nothing is charged until then."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={ROUTES["new-order"]} className={secondaryLink}>
              <ShoppingBag className="size-4" aria-hidden /> New order
            </Link>
            <Link href={ROUTES["add-funds"]} className={secondaryLink}>
              <Wallet className="size-4" aria-hidden /> Add funds
            </Link>
          </div>
        }
      />

      <div className={cn("mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3", e[0].className)} style={e[0].style}>
        <Stat icon={Wallet} label="Wallet balance" value={cents(wallet.availableCents)} hint="USD · from your account ledger" />
        <Stat icon={Clock} label="Pending deposits" value={cents(wallet.pendingCents)} hint="Not spendable until approved" />
        <Stat icon={ListOrdered} label="Orders" value={orderCount} hint={orderCount ? "All time" : "No orders yet"} />
      </div>

      <div className={cn("mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]", e[1].className)} style={e[1].style}>
        <Panel>
          <PanelHeader className="px-5 pt-5" title="Recent orders" description="Your latest orders and their progress." />
          <EmptyState
            icon={PackageOpen}
            title={orderCount ? `${orderCount} order${orderCount === 1 ? "" : "s"}` : "No orders yet"}
            action={
              orderCount ? (
                <Link href={ROUTES.orders} className={linkButton}>
                  <ListOrdered className="size-4" aria-hidden /> View my orders
                </Link>
              ) : (
                <Link href={FINDER_ROUTE} className={linkButton}>
                  <Compass className="size-4" aria-hidden /> Browse services
                </Link>
              )
            }
          >
            {orderCount ? "See each order's status and recorded activity." : "Ordering isn't open yet. You can already browse every service we plan to offer."}
          </EmptyState>
        </Panel>

        <Panel className="p-5">
          <PanelHeader title="Your account" />
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Account ID</dt>
              <dd className="font-mono text-[0.8rem] font-semibold">{profile.accountRef}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="min-w-0 truncate font-medium">{profile.email}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="font-medium">{formatDate(profile.createdAt, { year: true })}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Account type</dt>
              <dd className="font-medium capitalize">{profile.accountType}</dd>
            </div>
          </dl>
          <Link href={ROUTES.profile} className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            Edit profile <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </Panel>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Transactions (wallet)                                                     */
/* -------------------------------------------------------------------------- */

interface EntriesPage {
  items: WalletEntry[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

/** Loads JSON from one of our APIs. Errors are returned for display — never replaced with sample data. */
function useRemote<T>(url: string) {
  const [attempt, setAttempt] = React.useState(0);
  const key = `${url}#${attempt}`;
  const [state, setState] = React.useState<{ key?: string; data?: T; error?: string }>({});
  React.useEffect(() => {
    let cancelled = false;
    api<T>(url).then(
      (data) => !cancelled && setState({ key, data }),
      (e: Error) => !cancelled && setState({ key, error: e.message }),
    );
    return () => {
      cancelled = true;
    };
  }, [url, key]);
  const loading = state.key !== key;
  // While the next page loads, keep showing the previous one.
  return { data: state.data, error: loading ? undefined : state.error, loading, retry: () => setAttempt((n) => n + 1) };
}

export function LiveTransactions() {
  useDisplay();
  const live = useLiveAccount()!;
  const [pageNo, setPageNo] = React.useState(1);
  const pageSize = 20;
  const history = useRemote<EntriesPage>(`/api/account/wallet/transactions?page=${pageNo}&pageSize=${pageSize}`);
  const e = [1, 2].map(enter);

  return (
    <div className={page}>
      <Header
        title="Transactions"
        subtitle="Your wallet balance, every entry that changed it, and your deposit requests."
        action={
          <Link href={ROUTES["add-funds"]} className={secondaryLink}>
            <Wallet className="size-4" aria-hidden /> Add funds
          </Link>
        }
      />

      <div className={cn("mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2", e[0].className)} style={e[0].style}>
        <Stat icon={Wallet} label="Available balance" value={cents(live.wallet.availableCents)} hint="USD · calculated from your ledger entries" />
        <Stat icon={Clock} label="Pending deposits" value={cents(live.wallet.pendingCents)} hint="Shown separately; not spendable until approved" />
      </div>

      <Panel className={cn("mt-5 overflow-hidden", e[1].className)} style={e[1].style} aria-busy={history.loading || undefined}>
        <PanelHeader className="px-5 pt-5 pb-3" title="Wallet history" description="Read-only. Entries can't be edited or deleted." />
        {history.error ? (
          <ErrorState message={history.error} onRetry={history.retry} />
        ) : !history.data ? (
          <div className="space-y-2 px-5 pb-5" aria-label="Loading wallet history">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
            ))}
          </div>
        ) : history.data.items.length === 0 ? (
          <EmptyState icon={Wallet} title="No transactions yet">
            Verified deposits, order charges and refunds appear here once they&apos;re recorded. Your balance is {cents(live.wallet.availableCents)}.
          </EmptyState>
        ) : (
          <>
            <ul className="divide-y border-t">
              {history.data.items.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(t.at)}</p>
                  </div>
                  <p className={cn("shrink-0 font-heading font-bold tabular-nums", t.amountCents > 0 ? "text-primary" : "text-foreground")}>
                    {t.amountCents > 0 ? "+" : "−"}
                    {cents(Math.abs(t.amountCents))}
                  </p>
                </li>
              ))}
            </ul>
            {history.data.pages > 1 ? (
              <Pagination page={pageNo} pageCount={history.data.pages} total={history.data.total} pageSize={pageSize} label="Wallet history pages" onPage={setPageNo} />
            ) : null}
          </>
        )}
      </Panel>

      <DepositRequests />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Deposit requests                                                          */
/* -------------------------------------------------------------------------- */

interface DepositPage {
  items: CustomerDeposit[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

/** The customer's own requests: pending ones are shown apart from the balance, with every outcome and reason. */
function DepositRequests() {
  const live = useLiveAccount()!;
  const [pageNo, setPageNo] = React.useState(1);
  const [version, setVersion] = React.useState(0);
  const [open, setOpen] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const pageSize = 10;
  const list = useRemote<DepositPage>(`/api/account/deposits?page=${pageNo}&pageSize=${pageSize}&v=${version}`);

  const cancel = async (ref: string) => {
    setBusy(ref);
    setFailure(null);
    try {
      await api(`/api/account/deposits/${encodeURIComponent(ref)}/cancel`, { method: "POST", body: "{}" });
      setVersion((v) => v + 1);
      void live.refreshWallet();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "The request wasn't cancelled.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel className="mt-5 overflow-hidden" aria-busy={list.loading || undefined}>
      <PanelHeader className="px-5 pt-5 pb-3" title="Deposit requests" description="Pending requests are never part of your available balance." />
      {failure ? (
        <p role="alert" className="mx-5 mb-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm">
          {failure}
        </p>
      ) : null}
      {list.error ? (
        <ErrorState message={list.error} onRetry={list.retry} />
      ) : !list.data ? (
        <div className="space-y-2 px-5 pb-5" aria-label="Loading deposit requests">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
          ))}
        </div>
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No deposit requests"
          action={
            <Link href={ROUTES["add-funds"]} className={secondaryLink}>
              <Wallet className="size-4" aria-hidden /> Add funds
            </Link>
          }
        >
          When you request a deposit, its reference and status appear here.
        </EmptyState>
      ) : (
        <>
          <ul className="divide-y border-t">
            {list.data.items.map((d) => {
              const expanded = open === d.reference;
              return (
                <li key={d.reference} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        <span className="font-mono text-[0.82rem]">{d.reference}</span>
                        <DepositStatusBadge status={d.status} />
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {d.methodName} · requested {formatDateTime(d.requestedAt)}
                        {d.creditedAt ? ` · credited ${formatDateTime(d.creditedAt)}` : d.status === "awaiting_payment" && d.expiresAt ? ` · expires ${formatDateTime(d.expiresAt)}` : ""}
                      </p>
                      {d.statusReason ? <p className="mt-1 text-xs text-muted-foreground">{d.statusReason}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={cn("font-heading font-bold tabular-nums", d.status === "credited" ? "text-primary" : "text-muted-foreground")}>
                        {d.status === "credited" ? "+" : ""}
                        {cents(d.amountCents)}
                      </p>
                      {d.instructions ? (
                        <button type="button" onClick={() => setOpen(expanded ? null : d.reference)} aria-expanded={expanded} className="inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold hover:bg-muted">
                          {expanded ? "Hide details" : "Payment details"}
                        </button>
                      ) : null}
                      {d.status === "awaiting_payment" ? (
                        <button type="button" onClick={() => cancel(d.reference)} disabled={busy === d.reference} className="inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50">
                          {busy === d.reference ? "Cancelling…" : "Cancel"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {expanded && d.instructions ? (
                    <div className="mt-3 max-w-lg">
                      <BankInstructionsPanel instructions={d.instructions} amountCents={d.amountCents} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {list.data.pages > 1 ? <Pagination page={pageNo} pageCount={list.data.pages} total={list.data.total} pageSize={pageSize} label="Deposit request pages" onPage={setPageNo} /> : null}
        </>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/*  Service catalog                                                           */
/* -------------------------------------------------------------------------- */

interface CatalogItem {
  id: string;
  name: string;
  description: string;
  platform: { id: string; name: string };
  category: ServiceCategory;
  categoryLabel: string;
  status: "available" | "preview";
  price: { amount: number; unit: string } | null;
  limits: { min: number | null; max: number | null } | null;
}

interface CatalogPage {
  items: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

const control =
  "h-11 rounded-xl border bg-card px-3.5 text-sm shadow-xs outline-none transition-colors hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15";

export function LiveCatalog() {
  useDisplay();
  const [q, setQ] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [platform, setPlatform] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [sort, setSort] = React.useState<"name" | "platform">("platform");
  const [pageNo, setPageNo] = React.useState(1);
  const pageSize = 24;

  // Debounce typing so each keystroke doesn't hit the server.
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setQuery(q.trim());
      setPageNo(1);
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const params = new URLSearchParams({ sort, page: String(pageNo), pageSize: String(pageSize) });
  if (query) params.set("q", query);
  if (platform) params.set("platform", platform);
  if (category) params.set("category", category);
  const result = useRemote<CatalogPage>(`/api/catalog/services?${params}`);
  const e = [1, 2].map(enter);
  const filtered = Boolean(query || platform || category);

  return (
    <div className={page}>
      <Header title="Services" subtitle="Every service in the Sociotix catalog. Prices appear when a service opens for ordering." />

      <div className={cn("mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_10rem]", e[0].className)} style={e[0].style} role="search">
        <label className="relative sm:col-span-2 lg:col-span-1">
          <span className="sr-only">Search services</span>
          <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Search services" maxLength={80} className={cn(control, "w-full ps-10")} />
        </label>
        <label>
          <span className="sr-only">Platform</span>
          <select value={platform} onChange={(ev) => (setPlatform(ev.target.value), setPageNo(1))} className={cn(control, "w-full")}>
            <option value="">All platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Service type</span>
          <select value={category} onChange={(ev) => (setCategory(ev.target.value), setPageNo(1))} className={cn(control, "w-full")}>
            <option value="">All types</option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_META[c].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Sort by</span>
          <select value={sort} onChange={(ev) => (setSort(ev.target.value as "name" | "platform"), setPageNo(1))} className={cn(control, "w-full")}>
            <option value="platform">By platform</option>
            <option value="name">By name</option>
          </select>
        </label>
      </div>

      <div className={cn("mt-5", e[1].className)} style={e[1].style} aria-busy={result.loading || undefined}>
        <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
          {result.data ? `${result.data.total} ${result.data.total === 1 ? "service" : "services"}${filtered ? " match" : ""}` : " "}
        </p>
        {result.error ? (
          <Panel>
            <ErrorState message={result.error} onRetry={result.retry} />
          </Panel>
        ) : !result.data ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading services">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />
            ))}
          </div>
        ) : result.data.items.length === 0 ? (
          <Panel>
            <EmptyState icon={LayoutGrid} title="No services match">
              Try a different search, or clear the platform and type filters.
            </EmptyState>
          </Panel>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {result.data.items.map((s) => {
                const p = PLATFORM_BY_ID.get(s.platform.id);
                return (
                  <li key={s.id}>
                    <Panel className="flex h-full flex-col p-5">
                      <div className="flex items-start gap-3">
                        {p ? <PlatformTile platform={p} size="sm" /> : null}
                        <div className="min-w-0">
                          <p className="font-semibold leading-snug">{s.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.platform.name} · {s.categoryLabel}
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 line-clamp-3 flex-1 text-sm text-muted-foreground">{s.description}</p>
                      <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
                        {s.price ? (
                          <p className="text-sm">
                            <span className="font-heading font-bold tabular-nums">{usd(s.price.amount)}</span> <span className="text-muted-foreground">{s.price.unit}</span>
                          </p>
                        ) : (
                          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Lock className="size-3" aria-hidden /> Not open for ordering yet
                          </p>
                        )}
                        <span className={cn("rounded-full px-2 py-0.5 text-[0.65rem] font-bold tracking-wider uppercase", s.status === "available" ? "bg-lime text-graphite" : "bg-muted text-muted-foreground")}>
                          {s.status === "available" ? "Available" : "Coming soon"}
                        </span>
                      </div>
                    </Panel>
                  </li>
                );
              })}
            </ul>
            {result.data.pages > 1 ? (
              <Panel className="mt-4 overflow-hidden">
                <Pagination page={pageNo} pageCount={result.data.pages} total={result.data.total} pageSize={pageSize} label="Service pages" onPage={(n) => (setPageNo(n), window.scrollTo({ top: 0 }))} />
              </Panel>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
