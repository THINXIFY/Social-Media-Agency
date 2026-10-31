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
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  Copy,
  Ellipsis,
  Eye,
  FileSearch,
  Lock,
  MessageSquare,
  MessageSquarePlus,
  ReceiptText,
  Search,
  SearchX,
  Send,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { ConfirmDialog } from "@/components/dashboard/account-ui";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ADMIN_SUMMARY, ago, CUSTOMER_BY_ID, dateTime, usd } from "@/lib/admin-demo";
import { looksSensitive } from "@/lib/admin-orders";
import {
  ADMIN_TXNS,
  type AdminTxn,
  addPaymentNote,
  clearPaymentNotes,
  eventsOf,
  METHOD_LABEL,
  type MethodKey,
  nextStepOf,
  PAYMENT_TOTALS,
  type PaymentIssue,
  type PaymentNote,
  paymentIssues,
  STATUS_META,
  TXN_BY_ID,
  TYPE_META,
  type TxnStatus,
  type TxnType,
  usePaymentNotes,
  verificationOf,
  withinDays,
} from "@/lib/admin-payments";
import { CRYPTO_ASSETS, METHOD_STATUS_LABELS, NETWORKS, PAYMENT_METHODS, PAYMENTS_LIVE } from "@/lib/payments";
import { cn } from "@/lib/utils";
import { SelectInput, TextArea } from "./form";
import { AdminDemoTag, linkButton } from "./ui";
import { popupSurface, menuPopup, menuItem as sharedMenuItem, menuSeparator, menuLabel } from "./menu";

/* -------------------------------------------------------------------------- */
/*  Filters (URL)                                                             */
/* -------------------------------------------------------------------------- */

type DateFilter = "" | "1" | "7" | "30";
type Sort = "newest" | "oldest" | "amount_desc" | "amount_asc";
interface Filters {
  q: string;
  type: "" | TxnType;
  status: "" | TxnStatus;
  method: "" | MethodKey;
  date: DateFilter;
  sort: Sort;
  page: number;
}
const DEFAULTS: Filters = { q: "", type: "", status: "", method: "", date: "", sort: "newest", page: 1 };
const PAGE_SIZE = 12;
const TYPES = Object.keys(TYPE_META) as TxnType[];
const STATUSES = Object.keys(STATUS_META) as TxnStatus[];
const METHODS = Object.keys(METHOD_LABEL) as MethodKey[];
const DATE_LABEL: Record<Exclude<DateFilter, "">, string> = { "1": "Last 24 hours", "7": "Last 7 days", "30": "Last 30 days" };
const SORT_LABEL: Record<Sort, string> = { newest: "Newest first", oldest: "Oldest first", amount_desc: "Highest amount", amount_asc: "Lowest amount" };

function parseFilters(p: URLSearchParams): Filters {
  const pick = <T extends string>(k: string, allowed: readonly T[], d: T) => {
    const v = p.get(k) as T | null;
    return v && allowed.includes(v) ? v : d;
  };
  return {
    q: (p.get("q") ?? "").slice(0, 80),
    type: pick("type", TYPES, "" as const),
    status: pick("status", STATUSES, "" as const),
    method: pick("method", METHODS, "" as const),
    date: pick("date", ["1", "7", "30"] as const, ""),
    sort: pick("sort", ["newest", "oldest", "amount_desc", "amount_asc"] as const, "newest"),
    page: Math.max(1, Number(p.get("page")) || 1),
  };
}

function toQuery(f: Filters, txn: string | null) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== DEFAULTS[k as keyof Filters]) q.set(k, String(v));
  if (txn) q.set("txn", txn);
  return q.toString();
}

const STATUS_DOT: Record<TxnStatus, string> = { credited: "bg-ok", pending: "bg-soon", failed: "bg-destructive", paid: "bg-muted-foreground", refunded: "bg-primary" };
const needsReview = (t: AdminTxn) => t.status === "pending" || t.status === "failed";

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function AdminPayments() {
  const params = useSearchParams();
  const pathname = usePathname();
  const notes = usePaymentNotes();

  const [f, setF] = React.useState<Filters>(() => parseFilters(params));
  // The open transaction lives in the URL so links, Back and Forward work.
  const txnParam = params.get("txn");
  const openId = txnParam && TXN_BY_ID[txnParam] ? txnParam : null;
  const pushed = React.useRef(false);
  const written = React.useRef(toQuery(f, null));

  // Another page can link here with filters. Adopt them unless we wrote them.
  const urlKey = toQuery(parseFilters(params), null);
  React.useEffect(() => {
    if (urlKey !== written.current) {
      written.current = urlKey;
      setF(parseFilters(new URLSearchParams(urlKey)));
    }
  }, [urlKey]);

  React.useEffect(() => {
    if (pathname !== "/admin/payments") return;
    written.current = toQuery(f, null);
    const qs = toQuery(f, new URLSearchParams(location.search).get("txn"));
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
  // Everything except the type, so the tabs can show counts for each type.
  const base = ADMIN_TXNS.filter((t) => {
    if (f.status && t.status !== f.status) return false;
    if (f.method && t.methodKey !== f.method) return false;
    if (f.date && !withinDays(t, Number(f.date))) return false;
    if (!terms.length) return true;
    const c = CUSTOMER_BY_ID[t.customerId];
    const hay = [t.id, t.ref, c.name, c.id, c.email, t.method, METHOD_LABEL[t.methodKey], t.orderId ?? ""].join(" ").toLowerCase();
    return terms.every((w) => hay.includes(w));
  });
  const matches = base
    .filter((t) => !f.type || t.type === f.type)
    .sort((a, b) =>
      f.sort === "oldest" ? a.sortAt.localeCompare(b.sortAt) : f.sort === "amount_desc" ? b.amount - a.amount : f.sort === "amount_asc" ? a.amount - b.amount : b.sortAt.localeCompare(a.sortAt),
    );
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const rows = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hiddenRefunds = f.date && (!f.type || f.type === "refund") ? ADMIN_TXNS.filter((t) => t.type === "refund").length : 0;

  const T = PAYMENT_TOTALS;
  const tiles = [
    { key: "pending", label: "Pending verification", value: usd(T.pending), hint: `${T.pendingCount} deposits · not credited`, patch: { type: "deposit", status: "pending" } as Partial<Filters>, on: f.status === "pending", hot: T.pendingCount > 0 },
    { key: "credited", label: "Credited deposits", value: usd(T.credited), hint: `${T.creditedCount} deposits`, patch: { type: "deposit", status: "credited" } as Partial<Filters>, on: f.type === "deposit" && f.status === "credited" },
    { key: "refunds", label: "Refunds", value: usd(T.refunds), hint: `${T.refundCount} to customer wallets`, patch: { type: "refund", status: "" } as Partial<Filters>, on: f.type === "refund" && !f.status },
  ];

  const chips: { key: string; label: string; clear: Partial<Filters> }[] = [];
  if (f.status) chips.push({ key: "status", label: STATUS_META[f.status].label, clear: { status: "" } });
  if (f.method) chips.push({ key: "method", label: METHOD_LABEL[f.method], clear: { method: "" } });
  if (f.date) chips.push({ key: "date", label: DATE_LABEL[f.date], clear: { date: "" } });
  if (f.sort !== DEFAULTS.sort) chips.push({ key: "sort", label: `Sort: ${SORT_LABEL[f.sort]}`, clear: { sort: DEFAULTS.sort } });

  const noteCount = Object.values(notes).reduce((n, l) => n + l.length, 0);
  const [clearAsk, setClearAsk] = React.useState(false);

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[0.8rem] font-medium text-muted-foreground">
            Finance <AdminDemoTag>Admin demo</AdminDemoTag>
          </p>
          <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Payments</h1>
          <p className="mt-1 max-w-xl text-[0.95rem] text-muted-foreground">Manage deposits, review transactions and monitor customer wallet activity.</p>
        </div>
        {noteCount ? (
          <button type="button" onClick={() => setClearAsk(true)} className={cn(linkButton, "text-muted-foreground hover:text-foreground")}>
            <Trash2 className="size-3.5" aria-hidden /> Clear demo notes ({noteCount})
          </button>
        ) : null}
      </header>

      {/* Summary — compact, and every figure is summed from the transactions below */}
      <div className="mt-6 overflow-hidden rounded-2xl border bg-card">
        <div role="group" aria-label="Filter by summary" className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
          {tiles.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={t.on}
              onClick={() => update(t.patch)}
              className={cn(
                "flex flex-col items-start gap-1 bg-card px-4 py-3.5 text-start transition-colors hover:bg-muted/50 focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:px-5",
                t.on && "bg-secondary/50 shadow-[inset_0_-2px_0_var(--primary)] hover:bg-secondary/60 dark:bg-secondary/25",
              )}
            >
              <span className={cn("flex items-center gap-1.5 text-[0.8rem] font-medium text-muted-foreground", t.hot && "font-semibold text-soon")}>
                {t.hot ? <span className="size-1.5 rounded-full bg-soon" aria-hidden /> : null}
                {t.label}
              </span>
              <span className="font-heading text-[1.45rem] leading-none font-extrabold tabular-nums">{t.value}</span>
              <span className="text-xs text-muted-foreground">{t.hint}</span>
            </button>
          ))}
          <div className="flex flex-col items-start gap-1 bg-card px-4 py-3.5 sm:px-5">
            <span className="text-[0.8rem] font-medium text-muted-foreground">Wallet liabilities</span>
            <span className="font-heading text-[1.45rem] leading-none font-extrabold tabular-nums">{usd(T.liabilities)}</span>
            <span className="text-xs text-muted-foreground">Customer funds · not revenue</span>
          </div>
        </div>
        <p className="border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          <span className="font-medium text-foreground">Wallet liabilities</span> = credited deposits {usd(T.credited)} − order payments {usd(T.orderPayments)} + refunds {usd(T.refunds)}. Pending and failed deposits are never included.
          {Math.abs(T.liabilities - ADMIN_SUMMARY.liabilities) > 0.001 ? <span className="font-semibold text-destructive"> Doesn&apos;t match the Overview.</span> : null}
        </p>
      </div>

      <AttentionQueue onOpen={open} />

      <section aria-labelledby="txn-list-title" className="mt-6 overflow-hidden rounded-2xl border bg-card">
        <h2 id="txn-list-title" className="sr-only">
          Transactions
        </h2>
        {/* Type tabs keep deposits, order payments, refunds and adjustments clearly apart */}
        <div className="flex gap-1 overflow-x-auto border-b px-3 pt-2 sm:px-4" role="tablist" aria-label="Transaction type">
          {(["", ...TYPES] as Filters["type"][]).map((ty) => {
            const n = ty ? base.filter((t) => t.type === ty).length : base.length;
            const on = f.type === ty;
            return (
              <button
                key={ty || "all"}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => update({ type: ty })}
                className={cn(
                  "relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-t-lg px-3 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                  on && "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary",
                )}
              >
                {ty ? TYPE_META[ty].plural : "All"}
                <span className="text-xs font-medium text-muted-foreground tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <label htmlFor="pay-search" className="sr-only">
                Search transactions
              </label>
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                id="pay-search"
                type="search"
                value={f.q}
                onChange={(e) => update({ q: e.target.value })}
                placeholder="Transaction ID, customer, order or method"
                autoComplete="off"
                className="h-11 w-full rounded-xl border bg-background ps-9 pe-9 text-[0.95rem] transition-colors outline-none hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 lg:h-10 lg:text-sm dark:bg-muted/30 [&::-webkit-search-cancel-button]:hidden"
              />
              {f.q ? (
                <button type="button" onClick={() => update({ q: "" })} aria-label="Clear search" className="absolute end-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
              <Filter id="pay-status" label="Status" value={f.status} onChange={(v) => update({ status: v as Filters["status"] })}>
                <option value="">Any status</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </Filter>
              <Filter id="pay-method" label="Payment method" value={f.method} onChange={(v) => update({ method: v as Filters["method"] })}>
                <option value="">Any method</option>
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </option>
                ))}
              </Filter>
              <MoreFilters f={f} update={update} />
            </div>
          </div>
          <div className="flex min-h-7 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <p aria-live="polite" className="me-1.5 font-medium">
              {matches.length} transaction{matches.length === 1 ? "" : "s"}
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
            {chips.length || f.q || f.type ? (
              <button type="button" onClick={() => update({ ...DEFAULTS })} className="ms-0.5 font-semibold text-primary hover:underline">
                Clear all
              </button>
            ) : null}
            {hiddenRefunds ? <p className="basis-full">Refunds have no recorded time, so date filters leave them out.</p> : null}
          </div>
        </div>

        {rows.length ? (
          <>
            <div className="hidden xl:block">
              <table className="w-full table-fixed text-sm">
                <caption className="sr-only">Transactions</caption>
                <thead className="border-y bg-muted/40 text-[0.68rem] tracking-wider text-muted-foreground uppercase">
                  <tr>
                    <th scope="col" className="w-48 py-2.5 ps-5 text-start font-bold">Transaction</th>
                    <th scope="col" className="px-3 py-2.5 text-start font-bold">Customer</th>
                    <th scope="col" className="w-48 px-3 py-2.5 text-start font-bold">Type · Method</th>
                    <th scope="col" className="w-32 px-3 py-2.5 text-end font-bold">Amount</th>
                    <th scope="col" className="w-48 px-3 ps-6 py-2.5 text-start font-bold">Status</th>
                    <th scope="col" className="w-24 py-2.5 pe-5 text-end font-bold">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((t) => {
                    const c = CUSTOMER_BY_ID[t.customerId];
                    return (
                      <tr key={t.id} onClick={() => open(t.id)} className={cn("group/row cursor-pointer transition-colors hover:bg-muted/40", openId === t.id && "bg-secondary/30 hover:bg-secondary/40")}>
                        <td className="py-3 ps-5">
                          <span className="block font-mono text-[0.8rem] font-semibold">{t.ref}</span>
                          <span className="block text-xs text-muted-foreground">{t.at ? dateTime(t.at) : "Time not recorded"}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="block truncate font-medium group-hover/row:text-primary">{c.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{c.id}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="block font-medium">{TYPE_META[t.type].label}</span>
                          <span className="block truncate text-xs text-muted-foreground">{t.method}</span>
                        </td>
                        <td className="px-3 py-3 text-end">
                          <Amount t={t} />
                        </td>
                        <td className="px-3 ps-6 py-3">
                          <StatusDot status={t.status} />
                        </td>
                        <td className="py-3 pe-5 text-end">
                          <RowAction t={t} onOpen={() => open(t.id)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="divide-y border-t xl:hidden" aria-label="Transactions">
              {rows.map((t) => {
                const c = CUSTOMER_BY_ID[t.customerId];
                return (
                  <li key={t.id} className={cn("relative px-4 py-3.5 transition-colors hover:bg-muted/40 sm:px-5", openId === t.id && "bg-secondary/30")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[0.92rem] font-semibold">
                          {TYPE_META[t.type].label} <span className="font-normal text-muted-foreground">· {t.method}</span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.name} · <span className="font-mono">{t.ref}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{t.at ? dateTime(t.at) : "Time not recorded"}</p>
                      </div>
                      <Amount t={t} />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <StatusDot status={t.status} />
                      <RowAction t={t} onOpen={() => open(t.id)} stretch />
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
                  <PageButton label="Previous page" disabled={page === 1} onClick={() => update({ page: page - 1 })} icon="prev" />
                  <span className="px-2 text-xs font-semibold tabular-nums" aria-current="page">
                    {page} / {pages}
                  </span>
                  <PageButton label="Next page" disabled={page === pages} onClick={() => update({ page: page + 1 })} icon="next" />
                </div>
              </nav>
            ) : null}
          </>
        ) : f.type === "adjustment" ? (
          <div className="border-t px-6 py-14 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <ReceiptText className="size-6" aria-hidden />
            </span>
            <p className="mt-4 font-semibold">No wallet adjustments recorded</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Manual balance adjustments need an authenticated backend with approvals and an audit trail, so none can exist yet.</p>
          </div>
        ) : (
          <div className="border-t px-6 py-14 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <SearchX className="size-6" aria-hidden />
            </span>
            <p className="mt-4 font-semibold">No transactions match</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Search works on transaction or order ID, customer name or ID, and payment method.</p>
            <button type="button" onClick={() => update({ ...DEFAULTS })} className={cn(linkButton, "mt-3 border bg-card")}>
              Clear all
            </button>
          </div>
        )}
        {f.type === "refund" ? (
          <p className="border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
            <span className="font-medium text-foreground">Pending refund requests:</span> none recorded. Every refund above was already returned to the customer&apos;s wallet.
          </p>
        ) : null}
      </section>

      <PaymentMethods />

      <TxnDrawer id={openId} notes={openId ? notes[openId] ?? [] : []} onClose={close} />

      <ConfirmDialog
        open={clearAsk}
        onOpenChange={setClearAsk}
        title="Clear demo notes?"
        description="Removes every internal payment note added in this browser. Transactions don't change."
        confirmLabel="Clear notes"
        tone="danger"
        icon={Trash2}
        onConfirm={clearPaymentNotes}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Requires attention                                                        */
/* -------------------------------------------------------------------------- */

const ISSUE_ICON: Record<PaymentIssue["kind"], { Icon: typeof CircleAlert; className: string; label: string }> = {
  pending: { Icon: CircleAlert, className: "bg-soon-soft text-soon", label: "To verify" },
  failed: { Icon: CircleX, className: "bg-destructive/10 text-destructive", label: "Failed" },
  ticket: { Icon: MessageSquare, className: "bg-secondary text-secondary-foreground", label: "Customer report" },
};

function AttentionQueue({ onOpen }: { onOpen: (id: string) => void }) {
  const items = paymentIssues();
  const [collapsed, setCollapsed] = React.useState(false);
  if (!items.length) {
    return (
      <p className="mt-6 flex items-center gap-2 rounded-2xl border bg-card px-5 py-3.5 text-sm text-muted-foreground">
        <CircleCheck className="size-4 text-ok" aria-hidden /> No payments need attention.
      </p>
    );
  }
  const count = (k: PaymentIssue["kind"]) => items.filter((i) => i.kind === k).length;
  const summary = [count("pending") && `${count("pending")} to verify`, count("failed") && `${count("failed")} failed`, count("ticket") && `${count("ticket")} customer report`].filter(Boolean).join(" · ");
  return (
    <section aria-labelledby="pay-queue-title" className="mt-6 overflow-hidden rounded-2xl border bg-card">
      <h2 id="pay-queue-title">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls="pay-queue-list"
          onClick={() => setCollapsed((v) => !v)}
          className="flex w-full items-center gap-2.5 px-4 py-3 text-start focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none focus-visible:ring-inset sm:px-5"
        >
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-soon px-1.5 text-xs font-bold text-white tabular-nums dark:text-graphite">{items.length}</span>
          <span className="min-w-0">
            <span className="block text-[0.95rem] font-bold">Requires attention</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">{summary}</span>
          </span>
          <ChevronDown className={cn("ms-auto size-4 shrink-0 text-muted-foreground transition-transform", collapsed && "-rotate-90")} aria-hidden />
        </button>
      </h2>
      {!collapsed ? (
        <ul id="pay-queue-list" className="divide-y border-t">
          {items.map((i) => {
            const { Icon, className, label } = ISSUE_ICON[i.kind];
            const btn =
              "inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-full px-4 text-[0.82rem] font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none sm:self-auto";
            return (
              <li key={i.id} className="flex items-start gap-3 px-4 py-3 sm:items-center sm:px-5">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", className)} aria-hidden>
                  <Icon className="size-4" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      <span className="sr-only">{label}: </span>
                      {i.title}
                    </p>
                    <p className="mt-0.5 text-[0.8rem] text-muted-foreground">{i.detail}</p>
                  </div>
                  <span className="hidden shrink-0 text-xs text-muted-foreground md:block">{ago(i.at)}</span>
                  {i.txnId ? (
                    <button type="button" onClick={() => onOpen(i.txnId!)} aria-label={`${i.action}: ${i.txnId}`} className={cn(btn, i.kind === "pending" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border bg-card hover:border-primary/40 hover:text-primary")}>
                      {i.action} <ArrowRight className="size-3.5" aria-hidden />
                    </button>
                  ) : (
                    <Link href={i.href!} className={cn(btn, "border bg-card hover:border-primary/40 hover:text-primary")}>
                      {i.action} <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Payment methods                                                           */
/* -------------------------------------------------------------------------- */

function PaymentMethods() {
  const networks = new Set(CRYPTO_ASSETS.flatMap((a) => a.networks)).size;
  const rows = [
    { id: "crypto", name: "Cryptocurrency", detail: `${CRYPTO_ASSETS.length} assets listed across ${networks} networks (${CRYPTO_ASSETS.slice(0, 3).map((a) => a.symbol).join(", ")}…). No deposit addresses or chain monitoring.`, state: "Awaiting integration" },
    ...PAYMENT_METHODS.map((m) => ({ id: m.id, name: m.name, detail: m.description, state: METHOD_STATUS_LABELS[m.status] })),
  ];
  return (
    <section aria-labelledby="methods-title" className="mt-6 rounded-2xl border bg-card">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none focus-visible:ring-inset sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span id="methods-title" className="block text-[0.95rem] font-bold">
              Payment methods
            </span>
            <span className="block text-xs text-muted-foreground">
              {PAYMENTS_LIVE ? "Live" : "0 connected"} · {rows.length} methods configured as data only · admin deposits are demo records
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0" aria-hidden />
        </summary>
        <ul className="divide-y border-t">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.detail}</p>
              </div>
              <span className={cn("inline-flex h-6 shrink-0 items-center self-start rounded-full px-2.5 text-xs font-semibold sm:self-auto", r.state === "Planned" ? "bg-muted text-muted-foreground" : "bg-soon-soft text-soon")}>{r.state}</span>
            </li>
          ))}
        </ul>
        <p className="border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          &ldquo;Connected&rdquo; appears only once a verified gateway is live. Supported networks: {Object.keys(NETWORKS).length} listed in configuration.
        </p>
      </details>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small pieces                                                              */
/* -------------------------------------------------------------------------- */

function Amount({ t, large }: { t: AdminTxn; large?: boolean }) {
  const credited = t.status === "credited" || t.status === "refunded";
  const notCredited = t.status === "pending" || t.status === "failed";
  return (
    <span className="shrink-0 text-end">
      <span className={cn("block font-semibold whitespace-nowrap tabular-nums", large ? "font-heading text-[1.75rem] leading-tight font-extrabold" : "text-[0.92rem]", credited && "text-ok", notCredited && "text-muted-foreground")}>
        {credited ? "+" : t.status === "paid" ? "−" : ""}
        {usd(t.amount)} <span className={cn("font-medium text-muted-foreground", large ? "text-sm" : "text-[0.7rem]")}>USD</span>
      </span>
      {notCredited ? <span className="block text-xs font-medium text-muted-foreground">Not credited</span> : null}
    </span>
  );
}

function StatusDot({ status, className }: { status: TxnStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[0.85rem] font-medium whitespace-nowrap", status === "pending" && "font-semibold text-soon", status === "failed" && "text-destructive", className)}>
      <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[status])} aria-hidden />
      {STATUS_META[status].label}
    </span>
  );
}

function RowAction({ t, onOpen, stretch }: { t: AdminTxn; onOpen: () => void; stretch?: boolean }) {
  const review = needsReview(t);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label={`${review ? "Review" : "View"} ${t.id}`}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-0.5 rounded-full px-3.5 text-[0.82rem] font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none",
        t.status === "pending" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-primary hover:bg-secondary",
        stretch && "after:absolute after:inset-0 after:content-['']",
      )}
    >
      {review ? "Review" : "View"} <ChevronRight className="size-4" aria-hidden />
    </button>
  );
}

function Filter({ id, label, value, onChange, children, plain, className }: { id: string; label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; plain?: boolean; className?: string }) {
  return (
    <div className="min-w-0 lg:w-44">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <SelectInput id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn("h-11 lg:h-10", className, value && !plain && "border-primary/50 bg-secondary/40 dark:bg-secondary/20")}>
        {children}
      </SelectInput>
    </div>
  );
}

const popupClass = popupSurface;

function MoreFilters({ f, update }: { f: Filters; update: (patch: Partial<Filters>) => void }) {
  const count = [f.date, f.sort !== DEFAULTS.sort ? "sort" : ""].filter(Boolean).length;
  const label = "text-xs font-semibold text-muted-foreground";
  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          "col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl border bg-background px-3.5 text-sm font-semibold whitespace-nowrap transition-colors hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-primary/15 focus-visible:outline-none data-popup-open:border-primary/50 sm:col-span-1 lg:h-10 dark:bg-muted/30",
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
                Date
              </p>
              <Filter id="pay-date" label="Date" value={f.date} onChange={(v) => update({ date: v as DateFilter })}>
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
                <Filter id="pay-sort" label="Sort" value={f.sort} onChange={(v) => update({ sort: v as Sort })} plain>
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

function PageButton({ label, disabled, onClick, icon }: { label: string; disabled: boolean; onClick: () => void; icon: "prev" | "next" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-9 place-items-center rounded-full border bg-card transition-colors hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:opacity-40"
    >
      <ChevronRight className={cn("size-4", icon === "prev" && "rotate-180")} aria-hidden />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Transaction drawer                                                        */
/* -------------------------------------------------------------------------- */

function TxnDrawer({ id, notes, onClose }: { id: string | null; notes: PaymentNote[]; onClose: () => void }) {
  const [shown, setShown] = React.useState(id);
  if (id && id !== shown) setShown(id);
  const txn = TXN_BY_ID[id ?? shown ?? ""];
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[38rem]">
        {txn ? <DrawerBody key={txn.id} t={txn} notes={notes} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Section({ id, title, aside, children, sectionRef }: { id: string; title: string; aside?: React.ReactNode; children: React.ReactNode; sectionRef?: React.Ref<HTMLElement> }) {
  return (
    <section ref={sectionRef} aria-labelledby={id} className="scroll-mt-2 border-t px-5 py-6 sm:px-6">
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

const Missing = ({ children = "Not recorded" }: { children?: React.ReactNode }) => <span className="font-normal text-muted-foreground italic">{children}</span>;

const DEMO: Record<string, { description: string; icon: typeof Lock }> = {
  "Review deposit": {
    description:
      "In production you'd confirm settlement against the payment processor or bank statement. No processor is connected, so nothing can be confirmed here, and nothing changed.",
    icon: FileSearch,
  },
  "View payment evidence": {
    description: "No payment evidence is stored for this deposit. Even when it is, screenshots or customer-provided transaction hashes aren't proof of settlement on their own.",
    icon: FileSearch,
  },
  "Request information": { description: "Asking the customer for details needs a backend with staff messaging. No message or notification was sent.", icon: Send },
  "Contact customer": { description: "Messaging customers needs a backend with staff accounts. No email or notification was sent.", icon: Send },
  "Approve deposit": {
    description: "Approving would credit the customer's wallet. That needs confirmed settlement, an authenticated backend and an audit trail. Nothing was credited and the balance is unchanged.",
    icon: Lock,
  },
  "Reject deposit": { description: "Rejecting needs an authenticated backend with an audit trail. The deposit keeps its status and the customer wasn't notified.", icon: Lock },
};

const menuItem = sharedMenuItem;

function DrawerBody({ t, notes, onClose }: { t: AdminTxn; notes: PaymentNote[]; onClose: () => void }) {
  const c = CUSTOMER_BY_ID[t.customerId];
  const next = nextStepOf(t);
  const checks = t.type === "deposit" && needsReview(t) ? verificationOf(t) : null;
  const events = eventsOf(t, notes);
  const [info, setInfo] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [noteError, setNoteError] = React.useState<string | null>(null);
  const notesRef = React.useRef<HTMLElement>(null);
  const customerHref = `/admin/customers?customer=${c.id}`;
  const orderHref = t.orderId ? `/admin/orders?order=${t.orderId}` : null;

  const saveNote = () => {
    const text = note.trim();
    if (text.length < 2) return setNoteError("Write a short note first.");
    if (looksSensitive(text)) return setNoteError("Don't store passwords, keys, recovery phrases or card details in notes.");
    addPaymentNote(t.id, text);
    setNote("");
    setNoteError(null);
    setComposing(false);
  };
  const startNote = () => {
    setComposing(true);
    requestAnimationFrame(() => notesRef.current?.scrollIntoView({ block: "start" }));
  };

  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2.5 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium break-words">{value}</dd>
    </div>
  );
  const primary =
    "inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none max-sm:flex-1";

  const impact =
    t.status === "credited"
      ? { label: "Credited to wallet", value: `+${usd(t.amount)}`, tone: "text-ok", note: "Included in the customer's available balance." }
      : t.status === "refunded"
        ? { label: "Refunded to wallet", value: `+${usd(t.amount)}`, tone: "text-ok", note: "Returned to the customer's available balance. Accounted for separately from deposits." }
        : t.status === "paid"
          ? { label: "Debited from wallet", value: `−${usd(t.amount)}`, tone: "text-foreground", note: "Spent from the customer's balance on an order." }
          : {
              label: "Not credited",
              value: usd(0),
              tone: "text-muted-foreground",
              note:
                t.status === "pending"
                  ? `The requested ${usd(t.amount)} isn't available to the customer and isn't part of wallet liabilities until settlement is verified.`
                  : `The ${usd(t.amount)} payment failed and was never available to the customer.`,
            };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b px-5 pt-5 pb-4 sm:px-6">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", t.type === "deposit" ? "bg-ok-soft text-ok" : t.type === "refund" ? "bg-secondary text-secondary-foreground" : "bg-muted text-foreground")} aria-hidden>
          <ReceiptText className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <SheetTitle className="font-heading text-lg leading-tight font-bold">
            {TYPE_META[t.type].label} · {usd(t.amount)}
          </SheetTitle>
          <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(t.ref);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {}
              }}
              className="-ms-1 inline-flex h-6 items-center gap-1 rounded-md px-1 font-mono text-[0.78rem] font-semibold text-foreground hover:bg-muted"
              aria-label={`Copy ${t.ref}`}
            >
              {t.ref} {copied ? <Check className="size-3 text-ok" aria-hidden /> : <Copy className="size-3 text-muted-foreground" aria-hidden />}
            </button>
            <span>{c.name}</span>
            <AdminDemoTag>Demo record</AdminDemoTag>
          </SheetDescription>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close transaction"
          className="-me-1.5 grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* 1 · Status & next action */}
        <section aria-labelledby="pay-status-title" className="px-5 py-5 sm:px-6">
          <h3 id="pay-status-title" className="sr-only">
            Status
          </h3>
          <div className={cn("rounded-2xl border p-4", t.status === "pending" ? "border-soon/35 bg-soon-soft/40" : t.status === "failed" ? "border-destructive/30 bg-destructive/[0.04]" : "bg-muted/40")}>
            <StatusDot status={t.status} className="text-[0.95rem]" />
            <p className="mt-1 text-sm text-muted-foreground">{STATUS_META[t.status].explain}</p>
            <div className="mt-4 border-t border-current/10 pt-4">
              <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">What happens next</p>
              <p className="mt-1 text-[0.95rem] font-semibold">{next.explain}</p>
            </div>
          </div>
        </section>

        {/* Verification — only for deposits that aren't credited */}
        {checks ? (
          <Section id="verify-title" title="Deposit verification" aside={`${checks.filter((x) => x.ok).length} of ${checks.filter((x) => x.ok !== null).length} confirmed`}>
            <ol className="space-y-2.5">
              {checks.map((x, i) => (
                <li key={x.id} className={cn("flex gap-3 rounded-xl px-3.5 py-3", x.ok === false ? "bg-destructive/[0.05]" : x.ok === null ? "bg-secondary/40 dark:bg-secondary/20" : "bg-muted/40")}>
                  <span
                    className={cn(
                      "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[0.68rem] font-bold",
                      x.ok === true ? "bg-ok-soft text-ok" : x.ok === false ? "bg-destructive/12 text-destructive" : "bg-primary text-primary-foreground",
                    )}
                    aria-hidden
                  >
                    {x.ok === true ? <Check className="size-3" strokeWidth={3} /> : x.ok === false ? <X className="size-3" strokeWidth={3} /> : i + 1}
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">
                      {x.question}
                      <span className="sr-only">{x.ok === true ? " Yes." : x.ok === false ? " Not met." : ""}</span>
                    </p>
                    <p className="text-muted-foreground">{x.answer}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        ) : null}

        {/* 2 · Transaction overview */}
        <Section id="overview-title" title="Transaction overview">
          <dl className="divide-y">
            {row("Transaction ID", <span className="font-mono text-[0.82rem]">{t.id}</span>)}
            {row(
              "Customer",
              <span>
                <Link href={customerHref} className="font-semibold text-primary hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none">
                  {c.name}
                </Link>
                <span className="block text-xs font-normal break-all text-muted-foreground">
                  {c.email} · {c.id}
                </span>
              </span>,
            )}
            {row("Amount", `${usd(t.amount)} USD`)}
            {row("Type", TYPE_META[t.type].label)}
            {row("Method", t.method)}
            {t.methodKey === "crypto" ? row("Network", <Missing />) : null}
            {row("Date", t.at ? dateTime(t.at) : <Missing>Time not recorded</Missing>)}
            {orderHref
              ? row(
                  "Related order",
                  <Link href={orderHref} className="font-mono text-[0.82rem] font-semibold text-primary hover:underline">
                    {t.orderId}
                  </Link>,
                )
              : null}
          </dl>
        </Section>

        {/* 3 · Wallet impact */}
        <Section id="impact-title" title="Wallet impact">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{impact.label}</p>
              <p className={cn("font-heading text-[1.75rem] leading-tight font-extrabold tabular-nums", impact.tone)}>{impact.value}</p>
            </div>
            {t.status === "pending" ? <span className="inline-flex h-6 items-center rounded-full bg-soon-soft px-2.5 text-xs font-semibold text-soon">Requested {usd(t.amount)} · not credited</span> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{impact.note}</p>
          <Link href={customerHref} className={cn(linkButton, "mt-2")}>
            See {c.name.split(" ")[0]}&apos;s wallet <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </Section>

        {/* 4 · Activity & notes */}
        <Section id="pay-activity-title" title="Activity & notes" sectionRef={notesRef}>
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
              <label htmlFor="pay-note" className="text-xs font-semibold">
                Internal note
              </label>
              <TextArea
                id="pay-note"
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
                placeholder="Staff only. Never store card numbers, keys, recovery phrases or documents."
                aria-invalid={noteError ? true : undefined}
                aria-describedby="pay-note-help"
                className="mt-1.5 min-h-20"
              />
              <p id="pay-note-help" role={noteError ? "alert" : undefined} className={cn("mt-1.5 text-xs", noteError ? "font-medium text-destructive" : "text-muted-foreground")}>
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

      {/* Sticky actions: one clear next step, the rest under More */}
      <div className="flex items-center gap-2 border-t bg-background/95 px-5 py-3 backdrop-blur-sm sm:px-6">
        {t.status === "pending" ? (
          <button type="button" onClick={() => setInfo("Review deposit")} className={primary}>
            Review deposit <ArrowRight className="size-4" aria-hidden />
          </button>
        ) : t.status === "failed" ? (
          <Link href={customerHref} className={primary}>
            Open customer <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : orderHref ? (
          <Link href={orderHref} className={primary}>
            Open order <ArrowRight className="size-4" aria-hidden />
          </Link>
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
              <Menu.Popup className={cn(menuPopup, "w-60")}>
                {t.status !== "failed" ? (
                  <Menu.LinkItem render={<Link href={customerHref} />} className={menuItem}>
                    <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden /> Open customer
                  </Menu.LinkItem>
                ) : null}
                <Menu.Item onClick={startNote} className={menuItem}>
                  <MessageSquarePlus className="size-3.5 text-muted-foreground" aria-hidden /> Add internal note
                </Menu.Item>
                {t.type === "deposit" && needsReview(t) ? (
                  <>
                    <Menu.Item onClick={() => setInfo("View payment evidence")} className={menuItem}>
                      <FileSearch className="size-3.5 text-muted-foreground" aria-hidden /> View payment evidence
                    </Menu.Item>
                    <Menu.Item onClick={() => setInfo(t.status === "failed" ? "Contact customer" : "Request information")} className={menuItem}>
                      <Send className="size-3.5 text-muted-foreground" aria-hidden /> {t.status === "failed" ? "Contact customer" : "Request information"}
                    </Menu.Item>
                  </>
                ) : null}
                {t.status === "pending" ? (
                  <>
                    <Menu.Separator className={menuSeparator} />
                    <p className={menuLabel}>Needs backend · demo only</p>
                    {["Approve deposit", "Reject deposit"].map((a) => (
                      <Menu.Item key={a} onClick={() => setInfo(a)} className={cn(menuItem, "text-muted-foreground")}>
                        <Lock className="size-3.5" aria-hidden /> {a}
                      </Menu.Item>
                    ))}
                  </>
                ) : null}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      <ConfirmDialog
        open={info !== null}
        onOpenChange={(v) => !v && setInfo(null)}
        title={`${info ?? ""} — demo only`}
        description={info ? DEMO[info]?.description : ""}
        icon={info ? DEMO[info]?.icon : Lock}
      />
    </div>
  );
}
