"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import {
  ArrowRight,
  Check,
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
  Users,
  X,
} from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { ConfirmDialog } from "@/components/dashboard/account-ui";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ADMIN_ORDER_STATUS, type AdminOrder, type AdminOrderStatus, ago, CUSTOMER_BY_ID, dateTime, orderService, shortDate, usd } from "@/lib/admin-demo";
import {
  ACTIVE_DAYS,
  type Activity,
  addCustomerNote,
  allFacts,
  clearCustomerNotes,
  type CustomerFacts,
  type CustomerIssue,
  type CustomerNote,
  initialsOf,
  joinedWithin,
  NEW_DAYS,
  transactionsOf,
  useCustomerNotes,
} from "@/lib/admin-customers";
import { looksSensitive } from "@/lib/admin-orders";
import { type ServiceRecord, useServiceRecords } from "@/lib/admin-services";
import { cn } from "@/lib/utils";
import { SelectInput, TextArea } from "./form";
import { AdminDemoTag, linkButton } from "./ui";
import { popupSurface, menuPopup, menuItem as sharedMenuItem, menuSeparator, menuLabel } from "./menu";

/* -------------------------------------------------------------------------- */
/*  Filters (URL)                                                             */
/* -------------------------------------------------------------------------- */

type StatusFilter = "" | Activity;
type AttentionFilter = "" | "any" | CustomerIssue["kind"];
type JoinedFilter = "" | "30" | "45" | "older";
type OrdersFilter = "" | "open_orders" | "no_orders";
type Sort = "newest" | "oldest" | "orders" | "spend";
interface Filters {
  q: string;
  status: StatusFilter;
  attention: AttentionFilter;
  joined: JoinedFilter;
  activity: OrdersFilter;
  sort: Sort;
  page: number;
}
const DEFAULTS: Filters = { q: "", status: "", attention: "", joined: "", activity: "", sort: "newest", page: 1 };
const PAGE_SIZE = 10;
const STATUS_LABEL: Record<Activity, string> = { active: "Active", inactive: "Inactive" };
const ATTENTION_LABEL: Record<Exclude<AttentionFilter, "">, string> = {
  any: "Needs attention",
  order: "Order problems",
  ticket: "Tickets awaiting staff",
  deposit: "Deposits to verify",
};
const JOINED_LABEL: Record<Exclude<JoinedFilter, "">, string> = { "30": "Joined in last 30 days", "45": "Joined in last 45 days", older: "Joined over 45 days ago" };
const ORDERS_LABEL: Record<Exclude<OrdersFilter, "">, string> = { open_orders: "Has open orders", no_orders: "No orders yet" };
const SORT_LABEL: Record<Sort, string> = { newest: "Newest customers", oldest: "Oldest customers", orders: "Most orders", spend: "Highest spending" };

function parseFilters(p: URLSearchParams): Filters {
  const pick = <T extends string>(k: string, allowed: readonly T[], d: T) => {
    const v = p.get(k) as T | null;
    return v && allowed.includes(v) ? v : d;
  };
  // Older links used status=attention before attention had its own filter.
  const legacyAttention = p.get("status") === "attention";
  return {
    q: (p.get("q") ?? "").slice(0, 80),
    status: pick("status", ["active", "inactive"] as const, ""),
    attention: legacyAttention ? "any" : pick("attention", ["any", "order", "ticket", "deposit"] as const, ""),
    joined: pick("joined", ["30", "45", "older"] as const, ""),
    activity: pick("activity", ["open_orders", "no_orders"] as const, ""),
    sort: pick("sort", ["newest", "oldest", "orders", "spend"] as const, "newest"),
    page: Math.max(1, Number(p.get("page")) || 1),
  };
}

function toQuery(f: Filters, customer: string | null) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== DEFAULTS[k as keyof Filters]) q.set(k, String(v));
  if (customer) q.set("customer", customer);
  return q.toString();
}

const ACTIVITY_TONE: Record<Activity, string> = { active: "bg-ok", inactive: "bg-off" };
const ACTIVITY_HELP = `Based on orders, deposits and tickets in the last ${ACTIVE_DAYS} days. Not an account restriction.`;

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function AdminCustomers() {
  const params = useSearchParams();
  const pathname = usePathname();
  const records = useServiceRecords();
  const notes = useCustomerNotes();
  const facts = React.useMemo(() => {
    const byId = Object.fromEntries(records.map((r) => [r.id, r]));
    return allFacts((o: AdminOrder) => byId[o.serviceId] as ServiceRecord | undefined);
  }, [records]);
  const factsById = React.useMemo(() => Object.fromEntries(facts.map((x) => [x.customer.id, x])), [facts]);

  const [f, setF] = React.useState<Filters>(() => parseFilters(params));
  // The open customer lives in the URL so links, Back and Forward work.
  const customerParam = params.get("customer");
  const openId = customerParam && CUSTOMER_BY_ID[customerParam] ? customerParam : null;
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
    if (pathname !== "/admin/customers") return;
    written.current = toQuery(f, null);
    const qs = toQuery(f, new URLSearchParams(location.search).get("customer"));
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
  const matches = facts
    .filter((x) => {
      if (f.status && x.activity !== f.status) return false;
      if (f.attention === "any" ? !x.issues.length : f.attention && !x.issues.some((i) => i.kind === f.attention)) return false;
      if (f.joined === "older" ? joinedWithin(x.customer, 45) : f.joined && !joinedWithin(x.customer, Number(f.joined))) return false;
      if (f.activity === "open_orders" && !x.openOrders) return false;
      if (f.activity === "no_orders" && x.orders.length) return false;
      if (!terms.length) return true;
      const hay = [x.customer.id, x.customer.name, x.customer.email].join(" ").toLowerCase();
      return terms.every((t) => hay.includes(t));
    })
    .sort((a, b) =>
      f.sort === "oldest"
        ? a.customer.joinedAt.localeCompare(b.customer.joinedAt)
        : f.sort === "orders"
          ? b.orders.length - a.orders.length || b.netSpend - a.netSpend
          : f.sort === "spend"
            ? b.netSpend - a.netSpend
            : b.customer.joinedAt.localeCompare(a.customer.joinedAt),
    );
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const rows = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const quiet = !f.status && !f.attention && !f.joined;
  const tiles: { key: string; label: string; value: number; hint: string; patch: Partial<Filters>; on: boolean; tone?: "destructive" }[] = [
    { key: "total", label: "Total customers", value: facts.length, hint: "All accounts", patch: { status: "", attention: "", joined: "" }, on: quiet },
    {
      key: "active",
      label: "Active",
      value: facts.filter((x) => x.activity === "active").length,
      hint: `Activity in ${ACTIVE_DAYS} days`,
      patch: { status: "active", attention: "", joined: "" },
      on: f.status === "active" && !f.attention && !f.joined,
    },
    {
      key: "attention",
      label: "Needs attention",
      value: facts.filter((x) => x.issues.length).length,
      hint: "Orders, tickets or deposits",
      patch: { status: "", attention: "any", joined: "" },
      on: f.attention === "any" && !f.status && !f.joined,
      tone: "destructive",
    },
    {
      key: "new",
      label: "New",
      value: facts.filter((x) => x.isNew).length,
      hint: `Joined in ${NEW_DAYS} days`,
      patch: { status: "", attention: "", joined: "30" },
      on: f.joined === "30" && !f.status && !f.attention,
    },
  ];

  const chips: { key: string; label: string; clear: Partial<Filters> }[] = [];
  if (f.status) chips.push({ key: "status", label: STATUS_LABEL[f.status], clear: { status: "" } });
  if (f.attention) chips.push({ key: "attention", label: ATTENTION_LABEL[f.attention], clear: { attention: "" } });
  if (f.joined) chips.push({ key: "joined", label: JOINED_LABEL[f.joined], clear: { joined: "" } });
  if (f.activity) chips.push({ key: "activity", label: ORDERS_LABEL[f.activity], clear: { activity: "" } });
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
          <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Customers</h1>
          <p className="mt-1 max-w-xl text-[0.95rem] text-muted-foreground">Manage customer accounts, review activity and understand every customer in one place.</p>
        </div>
        {noteCount ? (
          <button type="button" onClick={() => setClearAsk(true)} className={cn(linkButton, "text-muted-foreground hover:text-foreground")}>
            <Trash2 className="size-3.5" aria-hidden /> Clear demo notes ({noteCount})
          </button>
        ) : null}
      </header>

      {/* Summary — one compact strip; each metric filters the directory */}
      <div role="group" aria-label="Filter by summary" className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border lg:grid-cols-4">
        {tiles.map((t) => {
          const hot = t.tone && t.value > 0;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={t.on}
              onClick={() => update(t.patch)}
              className={cn(
                "relative flex flex-col items-start gap-1 bg-card px-4 py-3.5 text-start transition-colors hover:bg-muted/50 focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:px-5",
                t.on && "bg-secondary/50 shadow-[inset_0_-2px_0_var(--primary)] hover:bg-secondary/60 dark:bg-secondary/25",
              )}
            >
              <span className={cn("flex items-center gap-1.5 text-[0.8rem] font-medium text-muted-foreground", hot && "font-semibold text-destructive")}>
                {hot ? <span className="size-1.5 rounded-full bg-destructive" aria-hidden /> : null}
                {t.label}
              </span>
              <span className="font-heading text-[1.6rem] leading-none font-extrabold tabular-nums">{t.value}</span>
              <span className="text-xs text-muted-foreground">{t.hint}</span>
            </button>
          );
        })}
      </div>

      <section aria-labelledby="customers-list-title" className="mt-6 overflow-hidden rounded-2xl border bg-card">
        <h2 id="customers-list-title" className="sr-only">
          Customer directory
        </h2>
        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <label htmlFor="cus-search" className="sr-only">
                Search customers
              </label>
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                id="cus-search"
                type="search"
                value={f.q}
                onChange={(e) => update({ q: e.target.value })}
                placeholder="Search name, email or customer ID"
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
              <Filter id="cus-status" label="Activity status" value={f.status} onChange={(v) => update({ status: v as StatusFilter })}>
                <option value="">Any activity</option>
                <option value="active">Active · last {ACTIVE_DAYS} days</option>
                <option value="inactive">Inactive</option>
              </Filter>
              <Filter id="cus-attention" label="Attention" value={f.attention} onChange={(v) => update({ attention: v as AttentionFilter })}>
                <option value="">Any attention state</option>
                {(Object.keys(ATTENTION_LABEL) as Exclude<AttentionFilter, "">[]).map((a) => (
                  <option key={a} value={a}>
                    {ATTENTION_LABEL[a]}
                  </option>
                ))}
              </Filter>
              <MoreFilters f={f} update={update} />
            </div>
          </div>
          <div className="flex min-h-7 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <p aria-live="polite" className="me-1.5 font-medium">
              {matches.length} customer{matches.length === 1 ? "" : "s"}
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
            {/* Desktop: identity first, numbers right-aligned, activity and attention kept apart */}
            <div className="hidden xl:block">
              <table className="w-full table-fixed text-sm">
                <caption className="sr-only">Customers</caption>
                <thead className="border-y bg-muted/40 text-[0.68rem] tracking-wider text-muted-foreground uppercase">
                  <tr>
                    <th scope="col" className="py-2.5 ps-5 text-start font-bold">Customer</th>
                    <th scope="col" className="w-28 px-3 py-2.5 text-start font-bold">Account</th>
                    <th scope="col" className="w-[4.5rem] px-3 py-2.5 text-end font-bold">Orders</th>
                    <th scope="col" className="w-24 px-3 py-2.5 text-end font-bold">Spent</th>
                    <th scope="col" className="w-28 px-3 py-2.5 text-end font-bold">Wallet</th>
                    <th scope="col" className="w-24 px-3 ps-4 py-2.5 text-start font-bold" title={ACTIVITY_HELP}>
                      Activity
                    </th>
                    <th scope="col" className="w-40 px-3 py-2.5 text-start font-bold">Attention</th>
                    <th scope="col" className="w-20 py-2.5 pe-5 text-end font-bold">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((x) => (
                    <tr key={x.customer.id} onClick={() => open(x.customer.id)} className={cn("group/row cursor-pointer transition-colors hover:bg-muted/40", openId === x.customer.id && "bg-secondary/30 hover:bg-secondary/40")}>
                      <td className="py-3 ps-5">
                        <div className="flex items-center gap-3">
                          <Avatar name={x.customer.name} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="truncate font-semibold group-hover/row:text-primary">{x.customer.name}</span>
                              {x.isNew ? <NewTag /> : null}
                            </span>
                            <span className="block truncate text-[0.8rem] text-muted-foreground">{x.customer.email}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="block font-mono text-[0.78rem] font-medium">{x.customer.id}</span>
                        <span className="block text-xs whitespace-nowrap text-muted-foreground">Joined {shortDate(x.customer.joinedAt)}</span>
                      </td>
                      <td className="px-3 py-3 text-end tabular-nums">
                        <span className="block font-semibold">{x.orders.length}</span>
                        {x.openOrders ? <span className="block text-xs text-muted-foreground">{x.openOrders} open</span> : null}
                      </td>
                      <td className="px-3 py-3 text-end font-semibold tabular-nums">{usd(x.netSpend)}</td>
                      <td className="px-3 py-3 text-end tabular-nums">
                        <span className="font-semibold">{usd(x.balance)}</span>
                        {x.pending ? <span className="block text-xs whitespace-nowrap text-soon">+{usd(x.pending)} pending</span> : null}
                      </td>
                      <td className="px-3 ps-4 py-3">
                        <ActivityDot activity={x.activity} />
                      </td>
                      <td className="px-3 py-3">
                        <AttentionCell issues={x.issues} />
                      </td>
                      <td className="py-3 pe-5 text-end">
                        <ViewButton facts={x} onOpen={() => open(x.customer.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phones & tablets: purpose-built cards, the whole card opens the customer */}
            <ul className="divide-y border-t xl:hidden" aria-label="Customers">
              {rows.map((x) => (
                <li key={x.customer.id} className={cn("relative px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5", openId === x.customer.id && "bg-secondary/30")}>
                  <div className="flex items-start gap-3">
                    <Avatar name={x.customer.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-x-2 text-[0.95rem] leading-snug font-semibold">
                            {x.customer.name}
                            {x.isNew ? <NewTag /> : null}
                          </p>
                          <p className="truncate text-[0.8rem] text-muted-foreground">{x.customer.email}</p>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-mono">{x.customer.id}</span> · Joined {shortDate(x.customer.joinedAt)}
                          </p>
                        </div>
                        <ViewButton facts={x} onOpen={() => open(x.customer.id)} stretch />
                      </div>
                      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <dt className="text-muted-foreground">Orders</dt>
                          <dd className="text-sm font-semibold tabular-nums">{x.orders.length}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-muted-foreground">Spent</dt>
                          <dd className="truncate text-sm font-semibold tabular-nums">{usd(x.netSpend)}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-muted-foreground">Wallet</dt>
                          <dd className="truncate text-sm font-semibold tabular-nums">{usd(x.balance)}</dd>
                        </div>
                      </dl>
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <ActivityDot activity={x.activity} />
                        <AttentionCell issues={x.issues} hideEmpty />
                      </div>
                    </div>
                  </div>
                </li>
              ))}
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
        ) : (
          <div className="border-t px-6 py-14 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              {f.q ? <SearchX className="size-6" aria-hidden /> : <Users className="size-6" aria-hidden />}
            </span>
            <p className="mt-4 font-semibold">{f.q ? `No customers match “${f.q.trim()}”` : "No customers match these filters"}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Search works on name, email and customer ID (for example CUS-1041).</p>
            <button type="button" onClick={() => update({ ...DEFAULTS })} className={cn(linkButton, "mt-3 border bg-card")}>
              Clear all
            </button>
          </div>
        )}
      </section>

      <CustomerDrawer id={openId} factsById={factsById} notes={openId ? notes[openId] ?? [] : []} onClose={close} />

      <ConfirmDialog
        open={clearAsk}
        onOpenChange={setClearAsk}
        title="Clear demo notes?"
        description="Removes every internal customer note added in this browser. Customer records don't change."
        confirmLabel="Clear notes"
        tone="danger"
        icon={Trash2}
        onConfirm={clearCustomerNotes}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small pieces                                                              */
/* -------------------------------------------------------------------------- */

function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-secondary font-heading font-bold text-secondary-foreground",
        size === "lg" ? "size-12 text-base" : "size-9 text-[0.78rem]",
      )}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}

function NewTag() {
  return <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-primary/10 px-1.5 text-[0.68rem] font-bold text-primary">New</span>;
}

/** Activity-derived status. Deliberately plain: it isn't an account state. */
function ActivityDot({ activity, className }: { activity: Activity; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[0.85rem] font-medium whitespace-nowrap", activity === "inactive" && "text-muted-foreground", className)} title={ACTIVITY_HELP}>
      <span className={cn("size-2 shrink-0 rounded-full", ACTIVITY_TONE[activity])} aria-hidden />
      {STATUS_LABEL[activity]}
    </span>
  );
}

/** A quiet attention marker with the most pressing reason; the full list is in the drawer. */
function AttentionCell({ issues, hideEmpty }: { issues: CustomerIssue[]; hideEmpty?: boolean }) {
  if (!issues.length) {
    return hideEmpty ? null : (
      <span className="text-muted-foreground/60">
        <span aria-hidden>—</span>
        <span className="sr-only">Nothing needs attention</span>
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[0.82rem]" title={issues.map((i) => i.title).join("\n")}>
      <CircleAlert className="size-3.5 shrink-0 text-destructive" aria-hidden />
      <span className="truncate font-medium">
        <span className="sr-only">Needs attention: </span>
        {issues[0].reason}
      </span>
      {issues.length > 1 ? <span className="shrink-0 text-xs text-muted-foreground">+{issues.length - 1}</span> : null}
    </span>
  );
}

function ViewButton({ facts: x, onOpen, stretch }: { facts: CustomerFacts; onOpen: () => void; stretch?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label={`View ${x.customer.name}`}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-0.5 rounded-full px-3 text-[0.82rem] font-semibold text-primary transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none",
        stretch && "after:absolute after:inset-0 after:content-['']",
      )}
    >
      View <ChevronRight className="size-4" aria-hidden />
    </button>
  );
}

function Filter({ id, label, value, onChange, children, plain, className }: { id: string; label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; plain?: boolean; className?: string }) {
  return (
    <div className="min-w-0 lg:w-48">
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
  const count = [f.joined, f.activity, f.sort !== DEFAULTS.sort ? "sort" : ""].filter(Boolean).length;
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
                Registration date
              </p>
              <Filter id="cus-joined" label="Registration date" value={f.joined} onChange={(v) => update({ joined: v as JoinedFilter })}>
                <option value="">Any join date</option>
                {(Object.keys(JOINED_LABEL) as Exclude<JoinedFilter, "">[]).map((s) => (
                  <option key={s} value={s}>
                    {JOINED_LABEL[s]}
                  </option>
                ))}
              </Filter>
            </div>
            <div className="space-y-1.5">
              <p aria-hidden className={label}>
                Orders
              </p>
              <Filter id="cus-activity" label="Orders" value={f.activity} onChange={(v) => update({ activity: v as OrdersFilter })}>
                <option value="">Any orders</option>
                {(Object.keys(ORDERS_LABEL) as Exclude<OrdersFilter, "">[]).map((a) => (
                  <option key={a} value={a}>
                    {ORDERS_LABEL[a]}
                  </option>
                ))}
              </Filter>
            </div>
            <div className="space-y-1.5">
              <p aria-hidden className={label}>
                Sort by
              </p>
              <div className="relative">
                <Filter id="cus-sort" label="Sort" value={f.sort} onChange={(v) => update({ sort: v as Sort })} plain>
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
/*  Customer drawer                                                           */
/* -------------------------------------------------------------------------- */

function CustomerDrawer({ id, factsById, notes, onClose }: { id: string | null; factsById: Record<string, CustomerFacts>; notes: CustomerNote[]; onClose: () => void }) {
  const [shown, setShown] = React.useState(id);
  if (id && id !== shown) setShown(id);
  const facts = factsById[id ?? shown ?? ""];
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[40rem]">
        {facts ? <DrawerBody key={facts.customer.id} facts={facts} notes={notes} onClose={onClose} /> : null}
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

function PreviewTag() {
  return <span className="ms-1 rounded-full border border-dashed px-1.5 py-px text-[0.62rem] font-bold tracking-wide text-muted-foreground uppercase">Preview</span>;
}

const DEMO_ACTIONS: Record<string, { description: string; icon: typeof Lock }> = {
  "Contact customer": { description: "Messaging customers needs a backend with staff accounts. No email or notification was sent.", icon: Send },
  "Account restrictions": {
    description: "Restricting or suspending an account needs an authenticated backend with staff permissions and an audit trail. Nothing changed — the account is untouched.",
    icon: Lock,
  },
  "Balance adjustment": {
    description: "Wallet adjustments need an authenticated backend, approval permissions and an audit trail. No balance was changed, and the customer's wallet is untouched.",
    icon: Lock,
  },
};

const ORDER_GROUPS: { label: string; statuses: AdminOrderStatus[] }[] = [
  { label: "Open", statuses: ["review", "queued", "in_progress"] },
  { label: "Completed", statuses: ["completed"] },
  { label: "Cancelled or refunded", statuses: ["cancelled", "refunded"] },
];

const menuItem = sharedMenuItem;

function DrawerBody({ facts: x, notes, onClose }: { facts: CustomerFacts; notes: CustomerNote[]; onClose: () => void }) {
  const c = x.customer;
  const txns = transactionsOf(x);
  const [info, setInfo] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [allTxns, setAllTxns] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [noteError, setNoteError] = React.useState<string | null>(null);
  const notesRef = React.useRef<HTMLElement>(null);
  const [next, ...otherIssues] = x.issues;
  const ordersHref = `/admin/orders?q=${c.id}`;

  const saveNote = () => {
    const text = note.trim();
    if (text.length < 2) return setNoteError("Write a short note first.");
    if (looksSensitive(text)) return setNoteError("Don't store passwords, codes, keys or card numbers in notes.");
    addCustomerNote(c.id, text);
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
  const shownTxns = allTxns ? txns : txns.slice(0, 3);
  const primaryClass =
    "inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none sm:px-5";
  const secondaryClass =
    "inline-flex h-10 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 1 · Identity */}
      <div className="border-b px-5 pt-5 pb-4 sm:px-6">
        <div className="flex items-start gap-3.5">
          <Avatar name={c.name} size="lg" />
          <div className="min-w-0 flex-1">
            <SheetTitle className="flex flex-wrap items-center gap-x-2 font-heading text-lg leading-tight font-bold">
              {c.name}
              {x.isNew ? <NewTag /> : null}
            </SheetTitle>
            <SheetDescription className="mt-0.5 text-sm break-words text-muted-foreground">
              {/* Let long addresses wrap after the @ rather than mid-word. */}
              {c.email.split("@")[0]}@<wbr />
              {c.email.split("@")[1]}
            </SheetDescription>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(c.id);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {}
                }}
                className="-ms-1 inline-flex h-6 items-center gap-1 rounded-md px-1 font-mono text-[0.78rem] font-semibold text-foreground hover:bg-muted"
                aria-label={`Copy ${c.id}`}
              >
                {c.id} {copied ? <Check className="size-3 text-ok" aria-hidden /> : <Copy className="size-3 text-muted-foreground" aria-hidden />}
              </button>
              <ActivityDot activity={x.activity} className="text-xs" />
              <span>{x.lastActivity ? `Last activity ${ago(x.lastActivity)}` : "No activity recorded"}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customer"
            className="-me-1.5 grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* 2 · Needs attention */}
        <section aria-labelledby="attention-title" className="px-5 py-5 sm:px-6">
          {next ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/[0.04] p-4">
              <h3 id="attention-title" className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-destructive uppercase">
                <CircleAlert className="size-3.5" aria-hidden /> Needs attention · {x.issues.length}
              </h3>
              <p className="mt-1.5 text-[0.95rem] font-semibold">{next.title}</p>
              <p className="text-sm text-muted-foreground">{next.detail}</p>
              <p className="mt-2 text-xs font-medium text-muted-foreground">
                Next: <span className="text-foreground">{next.action}</span>
                {next.preview ? " (preview)" : ""}, below.
              </p>
              {otherIssues.length ? (
                <ul className="mt-3 space-y-1 border-t border-destructive/15 pt-3">
                  {otherIssues.map((i) => (
                    <li key={i.id}>
                      <Link href={i.href} className="group -mx-1.5 flex items-start justify-between gap-3 rounded-lg px-1.5 py-1 text-sm hover:bg-destructive/[0.05] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none">
                        <span className="min-w-0">
                          <span className="font-medium group-hover:text-primary">{i.title}</span>
                          {i.preview ? <PreviewTag /> : null}
                          <span className="block text-xs text-muted-foreground">{i.detail}</span>
                        </span>
                        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="flex items-center gap-2 rounded-2xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden />
              <span id="attention-title">Nothing needs attention for this customer.</span>
            </p>
          )}
        </section>

        {/* 3 · Orders & support */}
        <Section id="activity-title" title="Orders & support">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
            {[{ label: "Total orders", value: x.orders.length }, ...ORDER_GROUPS.map((g) => ({ label: g.label, value: g.statuses.reduce((n, s) => n + (x.byStatus[s] ?? 0), 0) }))].map((s) => (
              <div key={s.label} className="min-w-0">
                <dt className="text-xs leading-tight text-muted-foreground">{s.label}</dt>
                <dd className="mt-0.5 font-heading text-lg font-extrabold tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>

          {x.orders.length ? (
            <>
              <ul className="mt-3 divide-y border-t">
                {x.orders.slice(0, 3).map((o) => {
                  const { service, platform } = orderService(o);
                  return (
                    <li key={o.id}>
                      <Link
                        href={`/admin/orders?order=${o.id}`}
                        className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                      >
                        <PlatformTile platform={platform} size="xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium group-hover:text-primary">{service.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            <span className="font-mono">{o.id}</span> · {shortDate(o.placedAt)}
                          </span>
                        </span>
                        <span className="shrink-0 text-end">
                          <span className="block text-sm font-semibold tabular-nums">{usd(o.amount)}</span>
                          <span className="block text-xs text-muted-foreground">{ADMIN_ORDER_STATUS[o.status].label}</span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <Link href={ordersHref} className={cn(linkButton, "mt-1")}>
                {x.orders.length > 3 ? `View all ${x.orders.length} orders` : "Open in Orders"} <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No orders yet.</p>
          )}

          <h4 className="mt-5 flex items-center text-sm font-semibold">
            Support tickets
          </h4>
          {x.tickets.length ? (
            <ul className="mt-2 space-y-2">
              {x.tickets.map((t) => (
                <li key={t.id} className="rounded-xl bg-muted/40 px-3.5 py-2.5 text-sm">
                  <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                    <Link href={`/admin/support?ticket=${t.id}`} className="font-medium hover:text-primary hover:underline">
                      {t.subject}
                    </Link>
                    <span className={cn("text-xs font-semibold", t.awaitingStaff ? "text-soon" : "text-muted-foreground")}>{t.awaitingStaff ? "Awaiting staff" : "Not awaiting staff"}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{t.id}</span> · opened {ago(t.openedAt)}
                    {t.orderId ? (
                      <>
                        {" · "}
                        <Link href={`/admin/orders?order=${t.orderId}`} className="font-mono text-primary hover:underline">
                          {t.orderId}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-sm text-muted-foreground">No support tickets on record.</p>
          )}
        </Section>

        {/* 4 · Wallet & payments — customer funds, kept apart from revenue */}
        <Section id="wallet-title" title="Wallet & payments" aside="USD · demo records">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Available balance</p>
              <p className="font-heading text-[1.75rem] leading-tight font-extrabold tabular-nums">{usd(x.balance)}</p>
            </div>
            <p className="max-w-[16rem] text-xs text-muted-foreground sm:text-end">Held on the customer&apos;s behalf. A liability, not revenue.</p>
          </div>
          <dl className="mt-3 rounded-xl border px-3.5 text-sm" aria-label="Balance reconciliation">
            {[
              { label: "Credited deposits", value: `+${usd(x.credited)}` },
              { label: "Order spending", value: `−${usd(x.spent)}` },
              { label: "Refunds to wallet", value: x.refunds ? `+${usd(x.refunds)}` : usd(0) },
              { label: "Adjustments", value: <Missing>None recorded</Missing> },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-3 border-b py-2">
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd className="font-medium tabular-nums">{r.value}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 py-2.5 font-semibold">
              <dt>Available balance</dt>
              <dd className="tabular-nums">{usd(x.balance)}</dd>
            </div>
          </dl>
          {x.pending ? (
            <p className="mt-3 rounded-xl bg-soon-soft/60 px-3.5 py-2.5 text-sm">
              <span className="font-semibold text-soon">{usd(x.pending)} pending · not credited.</span> <span className="text-muted-foreground">Awaiting verification, so it isn&apos;t in the balance.</span>
            </p>
          ) : null}
          {x.failedDeposits.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {x.failedDeposits.length} failed deposit{x.failedDeposits.length === 1 ? "" : "s"} ({usd(x.failedDeposits.reduce((s, d) => s + d.amount, 0))}) — never credited.
            </p>
          ) : null}

          <h4 className="mt-5 text-sm font-semibold">Recent transactions</h4>
          <ul className="mt-1 divide-y" id="cus-txns">
            {shownTxns.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/admin/payments?txn=${t.id}`}
                  className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium group-hover:text-primary">{t.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    <span className="font-mono">{t.ref}</span> · {t.at ? dateTime(t.at) : "Time not recorded"}
                  </span>
                </span>
                <span className="shrink-0 text-end">
                  <span className={cn("block font-semibold tabular-nums", (t.state === "pending" || t.state === "failed") && "text-muted-foreground line-through decoration-muted-foreground/50")}>
                    {t.state === "charged" ? `−${usd(t.gross)}` : `+${usd(t.gross)}`}
                  </span>
                  <span className={cn("block text-xs", t.state === "pending" ? "font-medium text-soon" : t.state === "failed" ? "text-destructive" : "text-muted-foreground")}>
                    {t.state === "credited" ? "Credited" : t.state === "pending" ? "Pending · not credited" : t.state === "failed" ? "Failed" : t.state === "charged" ? "Order charge" : "Refunded"}
                  </span>
                </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            {txns.length > 3 ? (
              <button type="button" onClick={() => setAllTxns((v) => !v)} aria-expanded={allTxns} aria-controls="cus-txns" className={linkButton}>
                {allTxns ? "Show fewer" : `Show all ${txns.length} transactions`}
              </button>
            ) : null}
            <Link href={`/admin/payments?q=${c.id}`} className={linkButton}>
              View in Payments <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </Section>

        {/* 5 · Account information — secondary details tucked behind a disclosure */}
        <Section id="account-title" title="Account information">
          <dl className="divide-y">
            {row("Country", c.country)}
            {row("Joined", dateTime(c.joinedAt))}
            {row(
              "Activity status",
              <span>
                {STATUS_LABEL[x.activity]}
                <span className="block text-xs font-normal text-muted-foreground">{ACTIVITY_HELP}</span>
              </span>,
            )}
            {row(
              "Verification",
              <span>
                Not verified
                <span className="block text-xs font-normal text-muted-foreground">No identity or email verification on record.</span>
              </span>,
            )}
          </dl>
          <details className="group mt-1">
            <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg text-sm font-semibold text-primary hover:underline focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
              More account details
            </summary>
            <dl className="divide-y">
              {row("Customer ID", <span className="font-mono text-[0.82rem]">{c.id}</span>)}
              {row("Account type", <Missing />)}
              {row("Last activity", x.lastActivity ? dateTime(x.lastActivity) : <Missing />)}
              {row(
                "Restrictions",
                <span>
                  None on record
                  <span className="block text-xs font-normal text-muted-foreground">Account restrictions need a backend; none can be set yet.</span>
                </span>,
              )}
            </dl>
          </details>
        </Section>

        <Section id="notes-title" title="Internal notes" aside={notes.length ? `${notes.length} · staff only` : undefined} sectionRef={notesRef}>
          {notes.length ? (
            <ul className="space-y-2.5">
              {[...notes].reverse().map((n) => (
                <li key={n.id} className="rounded-xl border-s-2 border-primary bg-secondary/40 py-2 ps-3 pe-3 text-sm dark:bg-secondary/20">
                  <p className="flex flex-wrap items-center gap-x-2 text-xs">
                    <span className="inline-flex items-center gap-1 font-bold text-primary">
                      <Eye className="size-3" aria-hidden /> Staff only
                    </span>
                    <AdminDemoTag>Demo</AdminDemoTag>
                    <span className="ms-auto text-muted-foreground tabular-nums">{dateTime(n.at)}</span>
                  </p>
                  <p className="mt-0.5 break-words">{n.text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No internal notes yet. Notes are never shown to the customer.</p>
          )}
          {composing ? (
            <div className="mt-4">
              <label htmlFor="cus-note" className="text-xs font-semibold">
                Internal note
              </label>
              <TextArea
                id="cus-note"
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
                placeholder="Visible to staff only. Never store passwords or payment details."
                aria-invalid={noteError ? true : undefined}
                aria-describedby="cus-note-help"
                className="mt-1.5 min-h-20"
              />
              <p id="cus-note-help" role={noteError ? "alert" : undefined} className={cn("mt-1.5 text-xs", noteError ? "font-medium text-destructive" : "text-muted-foreground")}>
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
            <button type="button" onClick={() => setComposing(true)} className={cn(secondaryClass, "mt-4 gap-2")}>
              <MessageSquarePlus className="size-4" aria-hidden /> Add internal note
            </button>
          )}
        </Section>
      </div>

      {/* Sticky actions: the one next step first, everything else under More */}
      <div className="flex items-center gap-2 border-t bg-background/95 px-5 py-3 backdrop-blur-sm sm:px-6">
        {next ? (
          <Link href={next.href} className={cn(primaryClass, "max-sm:flex-1")}>
            <span className="truncate">{next.action}</span>
            {next.preview ? <span className="hidden text-xs font-medium opacity-80 min-[360px]:inline">(preview)</span> : null}
            <ArrowRight className="size-4 shrink-0" aria-hidden />
          </Link>
        ) : null}
        {x.orders.length ? (
          <Link href={ordersHref} className={next ? cn(secondaryClass, "max-sm:hidden") : primaryClass}>
            View orders <span className={cn("tabular-nums", next ? "text-muted-foreground" : "opacity-80")}>{x.orders.length}</span>
          </Link>
        ) : null}
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
                <Menu.Item onClick={() => setInfo("Contact customer")} className={menuItem}>
                  <Send className="size-3.5 text-muted-foreground" aria-hidden /> Contact customer
                </Menu.Item>
                <Menu.Item onClick={startNote} className={menuItem}>
                  <MessageSquarePlus className="size-3.5 text-muted-foreground" aria-hidden /> Add internal note
                </Menu.Item>
                <Menu.LinkItem render={<Link href={`/admin/payments?q=${c.id}`} />} className={menuItem}>
                  <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden /> View transactions
                </Menu.LinkItem>
                <Menu.Separator className={menuSeparator} />
                <p className={menuLabel}>Needs backend · demo only</p>
                {["Account restrictions", "Balance adjustment"].map((a) => (
                  <Menu.Item key={a} onClick={() => setInfo(a)} className={cn(menuItem, "text-muted-foreground")}>
                    <Lock className="size-3.5" aria-hidden /> {a}
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
        description={info ? DEMO_ACTIONS[info]?.description : ""}
        icon={info ? DEMO_ACTIONS[info]?.icon : Lock}
      />
    </div>
  );
}
