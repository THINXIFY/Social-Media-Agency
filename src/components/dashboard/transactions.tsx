"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpDown,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock3,
  Copy,
  FlaskConical,
  type LucideIcon,
  Plus,
  LifeBuoy,
  ReceiptText,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TimerOff,
  Undo2,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  affectsBalance,
  type DemoTransaction,
  formatDate,
  formatDateTime,
  money,
  ORDERS,
  orderService,
  TRANSACTIONS,
  TX_METHOD_LABELS,
  TX_STATUS_LABELS,
  TX_TYPE_LABELS,
  type TxMethod,
  type TxStatus,
  type TxType,
  WALLET_SUMMARY,
} from "@/lib/demo-account";
import { ASSET_BY_SYMBOL, METHOD_BY_ID, NETWORKS, networkLabel } from "@/lib/payments";
import { useDisplay } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { clearPaymentPreviews, type PaymentPreview, usePaymentPreviews } from "./demo-store";
import { FxNote } from "./region";
import { DemoTag, enter, ordersHref, Pagination, Panel, ROUTES, supportHref } from "./shared";
import { CryptoIcon, MethodMark, NetworkBadge } from "./wallet-ui";

/* -------------------------------------------------------------------------- */
/*  Rows                                                                      */
/* -------------------------------------------------------------------------- */

/** A recorded demo transaction, or a preview saved from Add Funds (never submitted). */
type TxRow = DemoTransaction & { preview?: boolean };

const previewRow = (p: PaymentPreview): TxRow => ({
  id: p.id,
  type: "deposit",
  status: "pending",
  amount: p.amount,
  createdAt: p.at,
  method: p.category === "crypto" ? "crypto" : p.methodId === "paypal" ? "paypal" : p.category === "bank" ? "bank" : "card",
  asset: p.asset,
  network: p.network,
  title: p.methodId ? METHOD_BY_ID[p.methodId]?.name : undefined,
  preview: true,
});

const ORDER_BY_ID = Object.fromEntries(ORDERS.map((o) => [o.id, o]));

function titleOf(t: TxRow) {
  if (t.type === "payment" && t.orderId) return orderService(ORDER_BY_ID[t.orderId]).service.name;
  if (t.type === "refund") return `Refund${t.orderId ? ` · ${t.orderId}` : ""}`;
  if (t.type === "adjustment") return t.title ?? "Account adjustment";
  if (t.method === "crypto" && t.asset) return `${t.asset} deposit`;
  if (t.preview && t.title) return `${t.title} deposit`;
  return `${TX_METHOD_LABELS[t.method]} deposit`;
}

/* -------------------------------------------------------------------------- */
/*  Status                                                                    */
/* -------------------------------------------------------------------------- */

const TX_STATUS_STYLES: Record<TxStatus, { className: string; Icon: LucideIcon }> = {
  pending: { className: "bg-muted text-muted-foreground", Icon: Clock3 },
  processing: { className: "bg-secondary text-secondary-foreground", Icon: RefreshCw },
  completed: { className: "bg-ok-soft text-ok", Icon: CircleCheck },
  failed: { className: "bg-destructive/10 text-destructive", Icon: XCircle },
  expired: { className: "bg-off-soft text-off", Icon: TimerOff },
  refunded: { className: "bg-secondary text-secondary-foreground", Icon: Undo2 },
};

function TxStatusBadge({ tx, className }: { tx: TxRow; className?: string }) {
  if (tx.preview) {
    return (
      <span
        className={cn(
          "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-primary/50 px-2.5 text-[0.72rem] font-semibold whitespace-nowrap text-primary",
          className,
        )}
      >
        <FlaskConical className="size-3" strokeWidth={2.5} aria-hidden />
        Preview
      </span>
    );
  }
  const { className: tone, Icon } = TX_STATUS_STYLES[tx.status];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.72rem] font-semibold whitespace-nowrap ring-1 ring-current/15 ring-inset",
        tone,
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      {TX_STATUS_LABELS[tx.status]}
      {awaitingCredit(tx) ? <span className="font-medium opacity-75">· Not credited</span> : null}
    </span>
  );
}

/** A deposit that hasn't reached the balance yet. */
const awaitingCredit = (t: TxRow) => !t.preview && t.type === "deposit" && (t.status === "pending" || t.status === "processing");

/** Whether the amount reached (or left) the balance. Failed, expired, pending and previews didn't. */
const counted = (t: TxRow) => !t.preview && affectsBalance(t);

/**
 * Green with "+" only for money that actually reached the balance (credited deposits, refunds, credits).
 * Pending, processing, failed and expired deposits and previews stay neutral, with no sign.
 */
function Amount({ tx, className }: { tx: TxRow; className?: string }) {
  const credited = counted(tx);
  const sign = !credited ? "" : tx.amount > 0 ? "+" : "−";
  return (
    <span
      className={cn(
        "font-heading font-bold whitespace-nowrap tabular-nums",
        credited ? (tx.amount > 0 ? "text-ok" : "text-foreground") : "text-muted-foreground",
        (tx.status === "failed" || tx.status === "expired") && "line-through decoration-1",
        className,
      )}
    >
      {sign}
      {money(Math.abs(tx.amount))}
    </span>
  );
}

/** Screen-reader wording for an amount, matching what the styling shows. */
function amountLabel(t: TxRow) {
  const value = money(Math.abs(t.amount));
  if (!counted(t)) return `${value}, not credited`;
  return `${t.amount > 0 ? "plus" : "minus"} ${value}`;
}

function TxIcon({ tx, className }: { tx: TxRow; className?: string }) {
  if (tx.type === "payment" && tx.orderId) {
    return <PlatformTile platform={orderService(ORDER_BY_ID[tx.orderId]).platform} size="sm" className={cn("size-10 rounded-xl", className)} />;
  }
  if (tx.method === "crypto" && tx.asset) return <CryptoIcon symbol={tx.asset} className={cn("size-10", className)} />;
  const Icon = tx.type === "refund" ? Undo2 : tx.type === "adjustment" ? SlidersHorizontal : tx.method === "bank" || tx.method === "card" || tx.method === "paypal" ? ArrowDownLeft : Wallet;
  if (tx.type === "deposit") return <MethodMark id={tx.method} className={cn("size-10 rounded-xl", className)} />;
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", tx.type === "refund" ? "bg-secondary text-secondary-foreground" : "bg-lime/40 text-graphite dark:bg-lime/15 dark:text-lime", className)}>
      <Icon className="size-[1.1rem]" aria-hidden />
    </span>
  );
}

/** Short secondary line: how it was paid, or which order. */
function TxMethodLine({ tx }: { tx: TxRow }) {
  if (tx.method === "crypto" && tx.asset) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate">{ASSET_BY_SYMBOL[tx.asset]?.name ?? tx.asset}</span>
        {tx.network ? <NetworkBadge networkId={tx.network} asset={tx.asset} /> : null}
      </span>
    );
  }
  if (tx.orderId) return <span className="truncate">{tx.type === "refund" ? "Returned to balance" : `Order ${tx.orderId}`}</span>;
  if (tx.preview && tx.title) return <span className="truncate">{tx.title}</span>;
  return <span className="truncate">{TX_METHOD_LABELS[tx.method]}</span>;
}

/* -------------------------------------------------------------------------- */
/*  Filters                                                                   */
/* -------------------------------------------------------------------------- */

type TypeFilter = "all" | TxType;
type SortOrder = "newest" | "oldest";

const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "deposit", label: "Deposits" },
  { id: "payment", label: "Order Payments" },
  { id: "refund", label: "Refunds" },
  { id: "adjustment", label: "Adjustments" },
];

const STATUS_OPTIONS = Object.keys(TX_STATUS_LABELS) as TxStatus[];
const METHOD_OPTIONS = Object.keys(TX_METHOD_LABELS) as TxMethod[];

const parseType = (v: string | null): TypeFilter => (v && TYPE_FILTERS.some((f) => f.id === v) ? (v as TypeFilter) : "all");

function matchesSearch(t: TxRow, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [t.id, t.orderId ?? "", titleOf(t), t.asset ?? ""].some((s) => s.toLowerCase().includes(q));
}

const selectClass =
  "h-11 w-full appearance-none rounded-xl border bg-card pe-9 ps-3.5 text-sm font-medium shadow-xs transition-colors outline-none hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15";

function Select({
  id,
  label,
  value,
  onChange,
  children,
  icon: Icon = ChevronDown,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="relative min-w-0">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} value={value} onChange={(ev) => onChange(ev.target.value)} className={selectClass}>
        {children}
      </select>
      <Icon className="pointer-events-none absolute top-1/2 end-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function Transactions() {
  // Re-render when language, currency, time zone or date format change.
  useDisplay();
  const params = useSearchParams();
  const previews = usePaymentPreviews();
  const [type, setType] = React.useState<TypeFilter>(() => parseType(params.get("type")));
  const [status, setStatus] = React.useState<"all" | TxStatus>("all");
  const [method, setMethod] = React.useState<"all" | TxMethod>("all");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortOrder>("newest");
  const [openId, setOpenId] = React.useState<string | null>(() => params.get("tx"));
  const [page, setPage] = React.useState(1);
  // A linked transaction: once it's found, jump to the page that shows it.
  const [revealId, setRevealId] = React.useState<string | null>(() => params.get("tx"));
  const lastTrigger = React.useRef<HTMLElement | null>(null);
  const listTop = React.useRef<HTMLDivElement>(null);

  // Links can arrive while this page is mounted, so follow param changes.
  const txParam = params.get("tx");
  const typeParam = params.get("type");
  const [seen, setSeen] = React.useState({ tx: txParam, type: typeParam });
  if (seen.tx !== txParam || seen.type !== typeParam) {
    setSeen({ tx: txParam, type: typeParam });
    if (txParam && txParam !== seen.tx) {
      setOpenId(txParam);
      setRevealId(txParam);
    }
    if (typeParam !== seen.type) setType(parseType(typeParam));
  }

  // Leaving the page (e.g. "Need help") closes the drawer, so it isn't still open on return.
  const pathname = usePathname();
  if (pathname !== ROUTES.transactions && openId) setOpenId(null);

  React.useEffect(() => {
    const qs = new URLSearchParams();
    if (type !== "all") qs.set("type", type);
    if (openId) qs.set("tx", openId);
    const next = `${ROUTES.transactions}${qs.size ? `?${qs}` : ""}`;
    // Only while this page is showing: closing a drawer on the way to another page mustn't pull the URL back.
    if (window.location.pathname !== ROUTES.transactions) return;
    if (window.location.search !== (qs.size ? `?${qs}` : "")) window.history.replaceState(null, "", next);
  }, [type, openId]);

  const rows = React.useMemo<TxRow[]>(() => [...previews.map(previewRow), ...TRANSACTIONS], [previews]);
  const scoped = rows.filter(
    (t) =>
      matchesSearch(t, query) &&
      (status === "all" || (!t.preview && t.status === status)) &&
      (method === "all" || t.method === method),
  );
  const typeCount = (f: TypeFilter) => scoped.filter((t) => f === "all" || t.type === f).length;
  const visible = scoped
    .filter((t) => type === "all" || t.type === type)
    .sort((a, b) => (sort === "newest" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)));
  const filtered = type !== "all" || status !== "all" || method !== "all" || query.trim() !== "" || sort !== "newest";

  // New search, filters or sort start again from page 1.
  const filterKey = [type, status, method, query.trim(), sort].join("|");
  const [pagedFor, setPagedFor] = React.useState(filterKey);
  if (pagedFor !== filterKey) {
    setPagedFor(filterKey);
    setPage(1);
  }
  if (revealId) {
    const index = visible.findIndex((t) => t.id === revealId);
    setRevealId(null);
    if (index >= 0) setPage(Math.floor(index / PAGE_SIZE) + 1);
  }
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const goToPage = (next: number) => {
    setPage(next);
    // Bring the top of the list back into view if the reader had scrolled past it.
    const top = listTop.current;
    if (top && top.getBoundingClientRect().top < 0) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      top.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    }
  };
  const openTx = rows.find((t) => t.id === openId) ?? null;
  // Saved previews can be cleared or reset elsewhere, so a shared ?tx= link may point at nothing.
  const missingId = openId && !openTx ? openId : null;

  const clearFilters = () => {
    setType("all");
    setStatus("all");
    setMethod("all");
    setQuery("");
    setSort("newest");
  };

  const open = (id: string) => {
    lastTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpenId(id);
  };

  const close = () => {
    setOpenId(null);
    requestAnimationFrame(() => lastTrigger.current?.focus({ preventScroll: true }));
  };

  const s = WALLET_SUMMARY;
  const completedDeposits = TRANSACTIONS.filter((t) => t.type === "deposit" && t.status === "completed").length;
  const e = [0, 1, 2, 3].map(enter);

  return (
    <div className="mx-auto max-w-[90rem] px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <header className={cn("flex flex-wrap items-end justify-between gap-4", e[0].className)} style={e[0].style}>
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Transactions</h1>
          <p className="mt-1 max-w-xl text-[0.95rem] text-muted-foreground">
            A clear view of every deposit, payment, refund, and account adjustment.
          </p>
        </div>
        <Link
          href={ROUTES["add-funds"]!}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_10px_28px_-12px_rgb(112_71_235/0.8)] transition-all hover:-translate-y-px hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none"
        >
          <Plus className="size-4" strokeWidth={2.6} aria-hidden /> Add Funds
        </Link>
      </header>

      {/* Summary */}
      <dl className={cn("mt-5 grid grid-cols-2 gap-2.5 sm:mt-6 sm:gap-3 lg:grid-cols-4", e[1].className)} style={e[1].style}>
        <SummaryTile label="Total Added" value={money(s.added)} hint={`${completedDeposits} completed deposits`} Icon={ArrowDownLeft} tone="bg-ok-soft text-ok" />
        <SummaryTile
          label="Net Spent"
          value={money(s.spent)}
          hint={`${money(s.ordersGross)} orders − ${money(s.refunds)} refunds`}
          Icon={ArrowUpRight}
          tone="bg-secondary text-secondary-foreground"
        />
        <SummaryTile
          label="Pending Deposits"
          value={money(s.pending.amount)}
          hint={s.pending.count ? `Pending · Not credited · ${s.pending.count} ${s.pending.count === 1 ? "deposit" : "deposits"}` : "Nothing pending"}
          Icon={Clock3}
          tone="bg-muted text-foreground/80"
          pending
        />
        <div className="relative isolate flex flex-col-reverse justify-end overflow-hidden rounded-2xl bg-graphite p-3 text-white shadow-soft sm:p-4 dark:bg-[#17181e] dark:ring-1 dark:ring-white/10">
          <div className="pointer-events-none absolute -end-10 -bottom-14 -z-10 size-36 rounded-full bg-lime/20 blur-2xl" aria-hidden />
          <dt className="mt-1 text-[0.8rem] font-semibold">
            Current Balance
            <span className="block text-[0.7rem] leading-snug font-normal text-white/55">Available now · credited funds only</span>
          </dt>
          <dd className="font-heading text-2xl leading-none font-extrabold tabular-nums">{money(s.balance)}</dd>
          <span className="mb-2 hidden size-9 place-items-center rounded-xl bg-white/10 sm:grid" aria-hidden>
            <Wallet className="size-4 text-lime" />
          </span>
        </div>
      </dl>

      <p className={cn("mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-1 text-xs text-muted-foreground tabular-nums", e[1].className)} style={e[1].style}>
        <span className="font-semibold text-foreground">How your balance adds up:</span>
        <span>{money(s.added)} deposits</span>
        <span>+</span>
        <span>{money(s.adjustments)} credits</span>
        <span>−</span>
        <span>{money(s.ordersGross)} orders</span>
        <span>+</span>
        <span>{money(s.refunds)} refunds</span>
        <span>=</span>
        <span className="font-semibold text-foreground">{money(s.balance)}</span>
        <span>· Pending deposits and previews aren&apos;t included.</span>
      </p>
      <FxNote className="mt-1 px-1" />

      {previews.length ? (
        <div role="status" className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-dashed border-primary/40 bg-card px-4 py-3 text-sm">
          <FlaskConical className="size-4 shrink-0 text-primary" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">
              {previews.length === 1 ? "1 payment preview" : `${previews.length} payment previews`} saved in this browser.
            </span>{" "}
            <span className="text-muted-foreground">Never submitted, nothing charged, and not counted in your balance.</span>
          </p>
          <button
            type="button"
            onClick={clearPaymentPreviews}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-xs font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <X className="size-3.5" aria-hidden /> Clear previews
          </button>
        </div>
      ) : null}

      {missingId ? (
        <p role="alert" className="mt-5 flex items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm">
          <ReceiptText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            We couldn&apos;t find transaction <span className="font-semibold">{missingId}</span>. Previews disappear when they&apos;re cleared or the demo is reset.
          </span>
          <button type="button" onClick={() => setOpenId(null)} className="text-sm font-semibold text-primary hover:underline">
            Dismiss
          </button>
        </p>
      ) : null}

      {/* History */}
      <Panel className={cn("mt-5 overflow-hidden", e[2].className)} style={e[2].style} aria-labelledby="tx-list-title">
        <h2 id="tx-list-title" className="sr-only">
          Transaction history
        </h2>
        <div className="space-y-3 p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,1fr)_10.5rem_10.5rem_9.5rem]">
            <div className="relative">
              <label htmlFor="tx-search" className="sr-only">
                Search transactions
              </label>
              <Search className="pointer-events-none absolute top-1/2 start-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                id="tx-search"
                type="search"
                value={query}
                onChange={(ev) => setQuery(ev.target.value)}
                placeholder="Search by transaction ID or order"
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:contents">
              <Select id="tx-status" label="Status" value={status} onChange={(v) => setStatus(v as "all" | TxStatus)}>
                <option value="all">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {TX_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
              <Select id="tx-method" label="Payment method" value={method} onChange={(v) => setMethod(v as "all" | TxMethod)}>
                <option value="all">All methods</option>
                {METHOD_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {TX_METHOD_LABELS[m]}
                  </option>
                ))}
              </Select>
              <div className="col-span-2 sm:col-span-1 lg:contents">
                <Select id="tx-sort" label="Sort by date" value={sort} onChange={(v) => setSort(v as SortOrder)} icon={ArrowUpDown}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </Select>
              </div>
            </div>
          </div>

          <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:-mx-5 sm:px-5">
            <div className="inline-flex gap-1 rounded-full bg-muted p-1" role="group" aria-label="Filter by type">
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={type === f.id}
                  onClick={() => setType(f.id)}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.8rem] font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                    type === f.id && "bg-card text-foreground shadow-sm",
                  )}
                >
                  {f.label}
                  <span className="text-[0.7rem] tabular-nums">{typeCount(f.id)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <p aria-live="polite">
              {visible.length} transaction{visible.length === 1 ? "" : "s"}
              {pageCount > 1 ? ` · page ${current} of ${pageCount}` : ""}
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

        <div ref={listTop} className="scroll-mt-24" aria-hidden />
        {visible.length ? (
          <>
            <div
              className={cn("hidden gap-4 border-y bg-muted/40 px-5 py-2.5 text-[0.68rem] font-bold tracking-wider text-muted-foreground uppercase md:grid", ROW_COLS)}
              aria-hidden
            >
              <span>Transaction</span>
              <span>Date</span>
              <span>Status</span>
              <span className="text-end">Amount</span>
              <span />
            </div>
            <ul className="divide-y border-t md:border-t-0">
              {pageRows.map((t) => (
                <li key={t.id}>
                  <TxRowButton tx={t} onOpen={() => open(t.id)} />
                </li>
              ))}
            </ul>
            {pageCount > 1 ? (
              <Pagination page={current} pageCount={pageCount} total={visible.length} pageSize={PAGE_SIZE} label="Transaction pages" onPage={goToPage} />
            ) : null}
          </>
        ) : (
          <div className="border-t px-6 py-14 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <ReceiptText className="size-5" aria-hidden />
            </span>
            <p className="mt-3 font-semibold">No transactions match</p>
            <p className="mt-1 text-sm text-muted-foreground">Try another search, or clear the filters to see everything.</p>
            <button type="button" onClick={clearFilters} className="mt-3 text-sm font-semibold text-primary hover:underline">
              Clear filters
            </button>
          </div>
        )}
      </Panel>

      <TransactionDetails tx={openTx} onClose={close} />
    </div>
  );
}

const PAGE_SIZE = 20;

function SummaryTile({
  label,
  value,
  hint,
  Icon,
  tone,
  pending,
}: {
  label: string;
  value: string;
  hint: string;
  Icon: LucideIcon;
  tone: string;
  /** Money that isn't in the balance yet: dashed and muted so it never reads as available. */
  pending?: boolean;
}) {
  return (
    <div className={cn("flex flex-col-reverse justify-end rounded-2xl border bg-card p-3 shadow-soft sm:p-4", pending && "border-dashed bg-muted/30 shadow-none")}>
      <dt className="mt-1 text-[0.8rem] font-semibold">
        {label}
        <span className="block text-[0.7rem] leading-snug font-normal text-muted-foreground">{hint}</span>
      </dt>
      <dd className={cn("font-heading text-2xl leading-none font-extrabold tabular-nums", pending && "text-muted-foreground")}>{value}</dd>
      <span className={cn("mb-2 hidden size-9 place-items-center rounded-xl sm:grid", tone)} aria-hidden>
        <Icon className="size-4" />
      </span>
    </div>
  );
}

const ROW_COLS = "md:grid-cols-[minmax(0,1fr)_5.5rem_11.5rem_7rem_1.75rem]";

function TxRowButton({ tx, onOpen }: { tx: TxRow; onOpen: () => void }) {
  const title = titleOf(tx);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${tx.preview ? "Preview" : TX_TYPE_LABELS[tx.type]} ${tx.id}: ${title}, ${amountLabel(tx)}, ${tx.preview ? "not submitted" : TX_STATUS_LABELS[tx.status]}`}
      className={cn(
        "group flex w-full items-center gap-3 px-4 py-3.5 text-start transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none sm:px-5 md:grid md:gap-4",
        ROW_COLS,
        tx.preview && "bg-secondary/20",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <TxIcon tx={tx} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-[0.95rem] leading-snug font-semibold max-md:line-clamp-2 md:truncate">{title}</span>
            <Amount tx={tx} className="text-sm md:hidden" />
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0 font-mono text-[0.7rem]">{tx.id}</span>
            <span aria-hidden>·</span>
            <TxMethodLine tx={tx} />
          </span>
          <span className="mt-2 flex items-center justify-between gap-2 md:hidden">
            <TxStatusBadge tx={tx} />
            <span className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</span>
          </span>
        </span>
      </span>
      <span className="hidden text-sm text-muted-foreground md:block">{formatDate(tx.createdAt)}</span>
      <span className="hidden md:block">
        <TxStatusBadge tx={tx} />
      </span>
      <span className="hidden text-end md:block">
        <Amount tx={tx} className="text-[0.95rem]" />
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

/* -------------------------------------------------------------------------- */
/*  Details drawer                                                            */
/* -------------------------------------------------------------------------- */

/** What the status means for this transaction. Uses the recorded note when there is one. */
function explain(t: TxRow): { title: string; body: string; tone: "info" | "done" | "warn" | "muted" | "demo" } {
  if (t.preview) {
    return {
      title: "Payment preview",
      body: "Saved from Add Funds in this demo. It was never submitted, nothing was charged and your balance didn't change.",
      tone: "demo",
    };
  }
  const refund = t.type === "payment" && t.status === "refunded" ? TRANSACTIONS.find((r) => r.type === "refund" && r.orderId === t.orderId) : undefined;
  const base: Record<TxStatus, { title: string; body: string; tone: "info" | "done" | "warn" | "muted" }> = {
    pending: { title: "Pending · Not credited", body: "Your balance updates once the payment is received.", tone: "info" },
    processing: { title: "Processing · Not credited", body: "Your balance updates once the payment is received.", tone: "info" },
    completed: {
      title: t.type === "payment" ? "Paid from your balance" : t.amount > 0 ? "Added to your balance" : "Completed",
      body: t.type === "payment" ? `Covers order ${t.orderId}.` : t.amount > 0 ? `${money(t.amount)} was added to your balance.` : "",
      tone: "done",
    },
    failed: { title: "Payment didn't go through", body: "Nothing was added to your balance.", tone: "warn" },
    expired: { title: "Payment window closed", body: "Nothing was added to your balance.", tone: "muted" },
    refunded: {
      title: "Refunded",
      body: refund ? `This payment was returned to your balance as ${refund.id}.` : "This payment was refunded.",
      tone: "muted",
    },
  };
  const e = base[t.status];
  return { ...e, body: t.note ?? e.body };
}

const EXPLAIN_TONES = {
  info: "border-primary/20 bg-secondary/50",
  done: "border-ok/25 bg-ok-soft/60",
  warn: "border-destructive/25 bg-destructive/5",
  muted: "bg-muted/60",
  demo: "border-dashed border-primary/40 bg-card",
};

function TransactionDetails({ tx, onClose }: { tx: TxRow | null; onClose: () => void }) {
  const [shown, setShown] = React.useState(tx);
  if (tx && tx !== shown) setShown(tx);
  const t = tx ?? shown;

  return (
    <Sheet open={Boolean(tx)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[30rem]">
        {t ? <DetailsBody key={t.id} tx={t} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailsBody({ tx, onClose }: { tx: TxRow; onClose: () => void }) {
  const [copied, setCopied] = React.useState<"idle" | "done" | "failed">("idle");
  const info = explain(tx);
  const asset = tx.asset ? ASSET_BY_SYMBOL[tx.asset] : null;
  const network = tx.network ? NETWORKS[tx.network] : null;
  const order = tx.orderId ? ORDER_BY_ID[tx.orderId] : null;
  const retry = tx.type === "deposit" && (tx.status === "failed" || tx.status === "expired");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tx.id);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-5 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <TxIcon tx={tx} className="size-11" />
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-heading text-lg leading-tight font-bold">{titleOf(tx)}</SheetTitle>
            <SheetDescription className="mt-0.5 text-sm">
              {tx.preview ? "Deposit preview" : TX_TYPE_LABELS[tx.type]} · {formatDateTime(tx.createdAt)} UTC
            </SheetDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
            aria-label="Close transaction details"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <Amount tx={tx} className="text-[2rem] leading-none" />
          <TxStatusBadge tx={tx} />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5">
        <div className={cn("rounded-2xl border p-4", EXPLAIN_TONES[info.tone])}>
          <p className="text-sm font-semibold">{info.title}</p>
          {info.body ? <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{info.body}</p> : null}
        </div>

        <section aria-labelledby="tx-details-title">
          <h3 id="tx-details-title" className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Details
          </h3>
          <dl className="mt-2 divide-y rounded-2xl border text-sm">
            <Row label="Reference">
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1.5 rounded-md font-mono text-[0.8rem] font-semibold transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                aria-label={`Copy reference ${tx.id}`}
              >
                {tx.id}
                {copied === "done" ? <Check className="size-3.5 text-ok" aria-hidden /> : <Copy className="size-3.5 text-muted-foreground" aria-hidden />}
              </button>
              <span className="sr-only" aria-live="polite">
                {copied === "done" ? "Reference copied" : copied === "failed" ? "Couldn't copy. Select the reference to copy it." : ""}
              </span>
            </Row>
            <Row label="Type">{tx.preview ? "Deposit (preview)" : TX_TYPE_LABELS[tx.type]}</Row>
            <Row label="Amount">
              <span className="font-semibold tabular-nums">{money(Math.abs(tx.amount))}</span> <span className="text-muted-foreground">USD</span>
            </Row>
            <Row label="Method">{tx.preview && tx.title ? tx.title : TX_METHOD_LABELS[tx.method]}</Row>
            {asset ? (
              <Row label="Coin">
                <span className="inline-flex items-center gap-1.5">
                  <CryptoIcon symbol={asset.symbol} className="size-5" />
                  {asset.name} <span className="text-muted-foreground">{asset.symbol}</span>
                </span>
              </Row>
            ) : null}
            {asset && network ? (
              <Row label="Network">
                {network.name}
                {networkLabel(asset, network.id) ? <span className="text-muted-foreground"> · {networkLabel(asset, network.id)}</span> : null}
              </Row>
            ) : null}
            {tx.fees?.map((f) => (
              <Row key={f.label} label={f.label}>
                {money(f.amount)}
              </Row>
            ))}
            <Row label="Date">{formatDateTime(tx.createdAt)} UTC</Row>
            <Row label="Status">{tx.preview ? "Preview — not submitted" : TX_STATUS_LABELS[tx.status]}</Row>
            <Row label="Balance">
              {counted(tx) ? (
                <span className="font-medium">
                  {tx.amount > 0 ? "+" : "−"}
                  {money(Math.abs(tx.amount))}
                  {tx.status === "refunded" ? <span className="block text-xs font-normal text-muted-foreground">Refunded separately</span> : null}
                </span>
              ) : awaitingCredit(tx) ? (
                <span className="text-muted-foreground">Not credited yet</span>
              ) : (
                <span className="text-muted-foreground">No change</span>
              )}
            </Row>
            {order ? (
              <Row label="Related order">
                <Link href={ordersHref({ order: order.id })} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                  {order.id} <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              </Row>
            ) : null}
          </dl>
          <p className="mt-2 text-[0.7rem] text-muted-foreground">Demo record. No real payment, blockchain transaction or bank transfer exists.</p>
        </section>

        {!tx.preview ? (
          <Link
            href={supportHref({ new: true, tx: tx.id })}
            className="flex items-center gap-3 rounded-2xl border p-3.5 text-sm transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <LifeBuoy className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="font-semibold">Need help with this transaction?</span>{" "}
              <span className="text-muted-foreground">Open a ticket with {tx.id} attached.</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t bg-card px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border bg-card text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          {copied === "done" ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied === "done" ? "Copied" : "Copy Reference"}
        </button>
        {order ? (
          <Link
            href={ordersHref({ order: order.id })}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border bg-card text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            View Order <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <Link
            href={ROUTES["add-funds"]!}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border bg-card text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            {retry ? <RefreshCw className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
            {retry ? "Try Again" : "Add Funds"}
          </Link>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-end">{children}</dd>
    </div>
  );
}
