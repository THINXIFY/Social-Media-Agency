"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BadgeCheck, CircleAlert, RotateCcw, Search, UsersRound, X } from "lucide-react";
import { Pagination } from "@/components/dashboard/shared";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { usd } from "@/lib/demo-account";
import { formatDate, formatDateTime } from "@/lib/i18n";
import { api } from "@/lib/live-account";
import { cn } from "@/lib/utils";
import { SelectInput } from "./form";
import { Card } from "./ui";

/*
 * Live customer directory (DEMO_MODE off): registered customers only, with
 * figures read from their stored records — wallet balances from the ledger,
 * order counts from orders, last sign-in from the audit log. Nothing here is
 * estimated or illustrative, and nothing here can change an account.
 */

interface Row {
  publicRef: string;
  accountRef: string;
  name: string;
  email: string;
  country: string | null;
  createdAt: string;
  emailVerified: boolean;
  status: string;
  balanceCents: number;
  orderCount: number;
  lastSignInAt: string | null;
}

interface Directory {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

interface Detail {
  publicRef: string;
  accountRef: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  status: string;
  phone: string | null;
  country: string | null;
  accountType: string;
  businessName: string | null;
  website: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  wallet: { currency: string; availableCents: number; pendingCents: number; hasWallet: boolean };
  orderCount: number;
  openFlags: number;
}

type Sort = "newest" | "oldest" | "name";
const PAGE_SIZE = 20;
const cents = (n: number) => usd(n / 100);

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
  return { data: state.key === key || loading ? state.data : undefined, error: loading ? undefined : state.error, loading, retry: () => setAttempt((n) => n + 1) };
}

function Initials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary font-heading text-xs font-bold text-secondary-foreground" aria-hidden>
      {initials || "?"}
    </span>
  );
}

function Verified({ yes }: { yes: boolean }) {
  return yes ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok">
      <BadgeCheck className="size-3.5" aria-hidden /> Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-soon">
      <CircleAlert className="size-3.5" aria-hidden /> Unverified
    </span>
  );
}

const STATUS_LABEL: Record<string, string> = { active: "Active", locked: "Locked", disabled: "Disabled" };

export function LiveCustomers() {
  const params = useSearchParams();
  const pathname = usePathname();
  const [q, setQ] = React.useState(() => params.get("q") ?? "");
  const [query, setQuery] = React.useState(q.trim());
  const [verified, setVerified] = React.useState(() => params.get("verified") ?? "");
  const [status, setStatus] = React.useState(() => params.get("status") ?? "");
  const [sort, setSort] = React.useState<Sort>(() => (["oldest", "name"].includes(params.get("sort") ?? "") ? (params.get("sort") as Sort) : "newest"));
  const [page, setPage] = React.useState(1);
  const [openRef, setOpenRef] = React.useState<string | null>(() => params.get("customer"));

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  // Filters and the open customer live in the URL, so a link reopens the same view.
  React.useEffect(() => {
    if (pathname !== "/admin/customers") return;
    const u = new URLSearchParams();
    if (query) u.set("q", query);
    if (verified) u.set("verified", verified);
    if (status) u.set("status", status);
    if (sort !== "newest") u.set("sort", sort);
    if (openRef) u.set("customer", openRef);
    const qs = u.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, query, verified, status, sort, openRef]);

  const listParams = new URLSearchParams({ sort, page: String(page), pageSize: String(PAGE_SIZE) });
  if (query) listParams.set("q", query);
  if (verified) listParams.set("verified", verified);
  if (status) listParams.set("status", status);
  const list = useJson<Directory>(`/api/admin/customers?${listParams}`);
  const filtered = Boolean(query || verified || status);
  const reset = () => {
    setQ("");
    setQuery("");
    setVerified("");
    setStatus("");
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header>
        <p className="text-[0.8rem] font-medium text-muted-foreground">People</p>
        <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Customers</h1>
        <p className="mt-1 max-w-2xl text-[0.95rem] text-muted-foreground">Every registered customer, with balances from the ledger and orders as recorded. Viewing a customer never changes their account.</p>
      </header>

      <Card className="mt-6 overflow-hidden" aria-busy={list.loading || undefined}>
        <div className="flex flex-col gap-2 p-4 sm:p-5 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <label htmlFor="cus-search" className="sr-only">
              Search customers
            </label>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              id="cus-search"
              type="search"
              value={q}
              maxLength={80}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, email, customer or account ID"
              autoComplete="off"
              className="h-10 w-full rounded-xl border bg-background ps-9 text-sm transition-colors outline-none hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 dark:bg-muted/30"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3 lg:flex">
            <SelectInput aria-label="Email verification" value={verified} onChange={(e) => (setVerified(e.target.value), setPage(1))} className="h-10 lg:w-40">
              <option value="">Any verification</option>
              <option value="yes">Verified</option>
              <option value="no">Unverified</option>
            </SelectInput>
            <SelectInput aria-label="Account status" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="h-10 lg:w-36">
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="locked">Locked</option>
              <option value="disabled">Disabled</option>
            </SelectInput>
            <SelectInput aria-label="Sort" value={sort} onChange={(e) => (setSort(e.target.value as Sort), setPage(1))} className="h-10 lg:w-36">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
            </SelectInput>
          </div>
        </div>

        <p className="border-t px-4 py-2.5 text-xs text-muted-foreground sm:px-5" aria-live="polite">
          {list.data ? `${list.data.total} customer${list.data.total === 1 ? "" : "s"}${filtered ? " match" : ""}` : " "}
        </p>

        {list.error ? (
          <div role="alert" className="flex flex-col items-center border-t px-6 py-14 text-center">
            <p className="font-heading text-lg font-bold">Customers didn&apos;t load</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{list.error}</p>
            <button type="button" onClick={list.retry} className="mt-5 inline-flex h-10 items-center gap-2 rounded-full border bg-card px-4 text-sm font-semibold hover:bg-muted">
              <RotateCcw className="size-4" aria-hidden /> Try again
            </button>
          </div>
        ) : !list.data ? (
          <div className="space-y-2 border-t p-4 sm:p-5" aria-label="Loading customers">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
            ))}
          </div>
        ) : list.data.items.length === 0 ? (
          <div className="flex flex-col items-center border-t px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary" aria-hidden>
              <UsersRound className="size-5" />
            </span>
            <p className="mt-4 font-heading text-lg font-bold">{filtered ? "No customers match" : "No customers yet"}</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{filtered ? "Try a different search or clear the filters." : "Customers appear here as soon as they register."}</p>
            {filtered ? (
              <button type="button" onClick={reset} className="mt-5 inline-flex h-10 items-center gap-2 rounded-full border bg-card px-4 text-sm font-semibold hover:bg-muted">
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="hidden lg:block">
              <table className="w-full table-fixed text-sm">
                <caption className="sr-only">Customers</caption>
                <thead className="border-y bg-muted/40 text-[0.68rem] tracking-wider text-muted-foreground uppercase">
                  <tr>
                    <th scope="col" className="py-2.5 ps-5 text-start font-bold">Customer</th>
                    <th scope="col" className="w-36 px-3 py-2.5 text-start font-bold">Account</th>
                    <th scope="col" className="w-28 px-3 py-2.5 text-start font-bold">Email</th>
                    <th scope="col" className="w-20 px-3 py-2.5 text-end font-bold">Orders</th>
                    <th scope="col" className="w-28 px-3 py-2.5 text-end font-bold">Wallet</th>
                    <th scope="col" className="w-40 py-2.5 pe-5 ps-4 text-start font-bold">Last sign-in</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {list.data.items.map((c) => (
                    <tr key={c.publicRef} onClick={() => setOpenRef(c.publicRef)} className={cn("group/row cursor-pointer transition-colors hover:bg-muted/40", openRef === c.publicRef && "bg-secondary/30")}>
                      <td className="py-3 ps-5">
                        <div className="flex items-center gap-3">
                          <Initials name={c.name} />
                          <span className="min-w-0">
                            <button type="button" onClick={(e) => (e.stopPropagation(), setOpenRef(c.publicRef))} className="block max-w-full truncate text-start font-semibold group-hover/row:text-primary focus-visible:underline focus-visible:outline-none">
                              {c.name}
                            </button>
                            <span className="block truncate text-[0.8rem] text-muted-foreground">{c.email}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="block font-mono text-[0.78rem] font-medium">{c.publicRef}</span>
                        <span className="block text-xs whitespace-nowrap text-muted-foreground">Joined {formatDate(c.createdAt, { year: true })}</span>
                      </td>
                      <td className="px-3 py-3">
                        <Verified yes={c.emailVerified} />
                        {c.status !== "active" ? <span className="block text-xs font-semibold text-destructive">{STATUS_LABEL[c.status] ?? c.status}</span> : null}
                      </td>
                      <td className="px-3 py-3 text-end font-semibold tabular-nums">{c.orderCount}</td>
                      <td className="px-3 py-3 text-end font-semibold tabular-nums">{cents(c.balanceCents)}</td>
                      <td className="py-3 pe-5 ps-4 text-[0.8rem] text-muted-foreground">{c.lastSignInAt ? formatDateTime(c.lastSignInAt) : "Never"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y border-t lg:hidden" aria-label="Customers">
              {list.data.items.map((c) => (
                <li key={c.publicRef}>
                  <button type="button" onClick={() => setOpenRef(c.publicRef)} className="flex w-full items-start gap-3 px-4 py-4 text-start transition-colors hover:bg-muted/40 sm:px-5">
                    <Initials name={c.name} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{c.name}</span>
                          <span className="block truncate text-[0.8rem] text-muted-foreground">{c.email}</span>
                        </span>
                        <span className="shrink-0 text-end font-semibold tabular-nums">{cents(c.balanceCents)}</span>
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-mono">{c.publicRef}</span>
                        <Verified yes={c.emailVerified} />
                        <span>
                          {c.orderCount} order{c.orderCount === 1 ? "" : "s"}
                        </span>
                        {c.status !== "active" ? <span className="font-semibold text-destructive">{STATUS_LABEL[c.status] ?? c.status}</span> : null}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {list.data.pages > 1 ? <Pagination page={page} pageCount={list.data.pages} total={list.data.total} pageSize={PAGE_SIZE} label="Customer pages" onPage={setPage} /> : null}
          </>
        )}
      </Card>

      <CustomerSheet publicRef={openRef} onClose={() => setOpenRef(null)} />
    </div>
  );
}

function CustomerSheet({ publicRef, onClose }: { publicRef: string | null; onClose: () => void }) {
  const detail = useJson<{ customer: Detail }>(publicRef ? `/api/admin/customers/${encodeURIComponent(publicRef)}` : null);
  const c = detail.data?.customer;
  const rows = (pairs: [string, React.ReactNode][]) => (
    <dl className="divide-y rounded-xl border text-sm">
      {pairs.map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-4 px-3.5 py-2.5">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 text-end font-medium break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <Sheet open={Boolean(publicRef)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[34rem]">
        <div className="flex items-start gap-3 border-b px-5 py-4 sm:px-6">
          {c ? <Initials name={c.name} /> : null}
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-heading text-lg leading-tight font-bold">{c?.name ?? "Customer"}</SheetTitle>
            <SheetDescription className="mt-0.5 font-mono text-[0.8rem]">{publicRef}</SheetDescription>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6" aria-busy={detail.loading || undefined}>
          {detail.error ? (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="font-semibold">This customer didn&apos;t load.</p>
              <p className="mt-0.5 text-muted-foreground">{detail.error}</p>
              <button type="button" onClick={detail.retry} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-semibold hover:bg-muted">
                <RotateCcw className="size-3.5" aria-hidden /> Try again
              </button>
            </div>
          ) : !c ? (
            <div className="space-y-3" aria-label="Loading customer">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Wallet", cents(c.wallet.availableCents)],
                  ["Pending", cents(c.wallet.pendingCents)],
                  ["Orders", String(c.orderCount)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">{k}</p>
                    <p className="mt-1 font-heading text-lg font-bold tabular-nums">{v}</p>
                  </div>
                ))}
              </div>
              <section aria-label="Contact">
                <h3 className="mb-2 text-sm font-bold">Contact</h3>
                {rows([
                  ["Email", c.email],
                  ["Verification", <Verified key="v" yes={c.emailVerified} />],
                  ["Phone", c.phone || "Not provided"],
                  ["Country", c.country || "Not provided"],
                ])}
              </section>
              <section aria-label="Account">
                <h3 className="mb-2 text-sm font-bold">Account</h3>
                {rows([
                  ["Account ID", <span key="a" className="font-mono text-[0.8rem]">{c.accountRef}</span>],
                  ["Status", STATUS_LABEL[c.status] ?? c.status],
                  ["Type", c.accountType === "business" ? `Business${c.businessName ? ` · ${c.businessName}` : ""}` : "Personal"],
                  ...(c.website ? ([["Website", c.website]] as [string, React.ReactNode][]) : []),
                  ["Joined", formatDateTime(c.createdAt)],
                  ["Last sign-in", c.lastSignInAt ? formatDateTime(c.lastSignInAt) : "Never"],
                  ["Open flags", String(c.openFlags)],
                ])}
              </section>
              <p className="text-xs text-muted-foreground">Read-only. Balances change only through recorded ledger entries; nobody can edit them here.</p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
