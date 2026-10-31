"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BadgeCheck, Ban, CircleAlert, CircleCheck, CircleDashed, Landmark, Lock, RotateCcw, Scale, Search, ShieldCheck, Wallet, X } from "lucide-react";
import { DepositStatusBadge } from "@/components/dashboard/live-deposit";
import { Pagination } from "@/components/dashboard/shared";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { usd } from "@/lib/demo-account";
import type { DepositMethodId, DepositStatus, MethodReadiness } from "@/lib/deposits";
import { formatDateTime } from "@/lib/i18n";
import { api, ApiError } from "@/lib/live-account";
import { cn } from "@/lib/utils";
import { inputClass, SelectInput, TextArea, TextInput } from "./form";
import { useReauth } from "./reauth";
import { Card } from "./ui";

/*
 * Live Payments (DEMO_MODE off). Real deposit requests, verification and
 * financial reporting. The server enforces every rule — permissions, fresh
 * re-authentication, two different reviewers, exact amounts, the deposit state
 * machine and the ledger. This page only explains them and offers the next
 * valid step; it never shows a payment as successful unless the database does.
 */

const cents = (n: number) => usd(n / 100);
type Bucket = { count: number; cents: number };
interface Summary {
  walletLiabilitiesCents: number;
  fundedCustomers: number;
  deposits: Record<"credited" | "pending" | "awaitingVerification" | "rejected" | "expired" | "cancelled" | "failed", Bucket>;
  walletMovements: Record<string, { cents: number; entries: number }>;
  revenueCents: number;
}
interface Can {
  manage: boolean;
  approveDeposits: boolean;
  issueRefunds: boolean;
  adjustWallets: boolean;
}
interface Row {
  reference: string;
  customer: { publicRef: string; name: string; email: string };
  amountCents: number;
  method: DepositMethodId;
  status: DepositStatus;
  requestedAt: string;
  expiresAt: string | null;
  reviewsDone: number;
}
interface Detail {
  reference: string;
  amountCents: number;
  method: DepositMethodId;
  methodName: string;
  status: DepositStatus;
  statusReason: string | null;
  requestedAt: string;
  expiresAt: string | null;
  settledAt: string | null;
  paymentReference: string | null;
  customer: { publicRef: string; accountRef: string; name: string; email: string };
  reviews: { step: "first" | "second"; decision: "approve" | "reject"; evidence: Record<string, unknown>; decidedAt: string; by: string; mine: boolean }[];
  notes: { id: string; body: string; at: string; by: string }[];
  ledgerEntry: { id: string; kind: string; postedAt: string; idempotencyKey: string } | null;
  verification: MethodReadiness["verification"];
  blockers: string[];
  next: { id: "record_receipt" | "verify_and_credit" | "wait_for_customer" | "none"; label: string; explain: string };
}

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
  return { data: state.data, error: loading ? undefined : state.error, loading, reload: () => setAttempt((n) => n + 1), set: (data: T) => setState({ key: key ?? undefined, data }) };
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

const STATUS_FILTERS: [string, string][] = [
  ["", "All statuses"],
  ["open", "Open (not closed)"],
  ["awaiting_payment", "Pending"],
  ["under_review", "Awaiting verification"],
  ["credited", "Verified"],
  ["rejected", "Rejected"],
  ["expired", "Expired"],
  ["cancelled", "Cancelled"],
];

export function LivePayments() {
  const params = useSearchParams();
  const pathname = usePathname();
  const overview = useJson<{ summary: Summary; methods: MethodReadiness[]; can: Can }>("/api/admin/payments/summary");
  const [q, setQ] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState(() => params.get("status") ?? "open");
  const [method, setMethod] = React.useState("");
  const [sort, setSort] = React.useState("newest");
  const [page, setPage] = React.useState(1);
  const [openRef, setOpenRef] = React.useState<string | null>(() => params.get("deposit"));
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    const t = window.setTimeout(() => (setQuery(q.trim()), setPage(1)), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  React.useEffect(() => {
    if (pathname !== "/admin/payments") return;
    const u = new URLSearchParams();
    if (status !== "open") u.set("status", status);
    if (openRef) u.set("deposit", openRef);
    const qs = u.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, status, openRef]);

  const lp = new URLSearchParams({ sort, page: String(page), pageSize: "20", v: String(version) });
  if (query) lp.set("q", query);
  if (status) lp.set("status", status);
  if (method) lp.set("method", method);
  const list = useJson<{ items: Row[]; total: number; pages: number }>(`/api/admin/payments/deposits?${lp}`);
  const s = overview.data?.summary;
  const can = overview.data?.can;
  const changed = () => {
    setVersion((v) => v + 1);
    overview.reload();
  };

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header>
        <p className="text-[0.8rem] font-medium text-muted-foreground">Finance</p>
        <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Payments</h1>
        <p className="mt-1 max-w-2xl text-[0.95rem] text-muted-foreground">Deposit requests, verification and wallet liabilities from the ledger. Customer deposits are money owed to customers — never revenue.</p>
      </header>

      {overview.error ? (
        <Card role="alert" className="mt-6 flex flex-col items-center px-6 py-12 text-center">
          <p className="font-heading text-lg font-bold">Payments didn&apos;t load</p>
          <p className="mt-1 text-sm text-muted-foreground">{overview.error}</p>
          <button type="button" onClick={overview.reload} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold hover:bg-muted">
            <RotateCcw className="size-4" aria-hidden /> Try again
          </button>
        </Card>
      ) : (
        <>
          <dl className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy={!s || undefined}>
            {[
              { label: "Wallet liabilities", value: s ? cents(s.walletLiabilitiesCents) : null, note: s ? `${s.fundedCustomers} customer${s.fundedCustomers === 1 ? "" : "s"} with a balance` : "" },
              { label: "Credited deposits", value: s ? cents(s.deposits.credited.cents) : null, note: s ? `${s.deposits.credited.count} verified` : "" },
              { label: "Pending deposits", value: s ? cents(s.deposits.pending.cents) : null, note: s ? `${s.deposits.pending.count} open · not in any wallet` : "" },
              { label: "Awaiting verification", value: s ? String(s.deposits.awaitingVerification.count) : null, note: "Need a second reviewer" },
            ].map((t) => (
              <div key={t.label} className="rounded-2xl border bg-card p-4 sm:p-5">
                <dt className="text-[0.8rem] font-semibold text-muted-foreground">{t.label}</dt>
                <dd className="mt-2 font-heading text-[1.6rem] leading-none font-extrabold tabular-nums">{t.value ?? <span className="inline-block h-7 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" />}</dd>
                <dd className="mt-2 text-xs text-muted-foreground">{t.note}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <MethodsCard methods={overview.data?.methods ?? null} />
            <ReconcileCard summary={s ?? null} can={can ?? null} />
          </div>
        </>
      )}

      <Card className="mt-6 overflow-hidden" aria-busy={list.loading || undefined}>
        <div className="flex flex-col gap-2 p-4 sm:p-5 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <label htmlFor="pay-search" className="sr-only">
              Search deposits
            </label>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input id="pay-search" type="search" value={q} maxLength={80} onChange={(e) => setQ(e.target.value)} placeholder="Search by deposit, customer, email or bank reference" className={cn(inputClass, "h-10 ps-9")} />
          </div>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3 lg:flex">
            <SelectInput aria-label="Status" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="h-10 lg:w-48">
              {STATUS_FILTERS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </SelectInput>
            <SelectInput aria-label="Method" value={method} onChange={(e) => (setMethod(e.target.value), setPage(1))} className="h-10 lg:w-40">
              <option value="">All methods</option>
              <option value="bank">Bank transfer</option>
              <option value="crypto">Crypto</option>
              <option value="card">Card</option>
              <option value="paypal">PayPal</option>
            </SelectInput>
            <SelectInput aria-label="Sort" value={sort} onChange={(e) => (setSort(e.target.value), setPage(1))} className="h-10 lg:w-36">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="amount">Largest first</option>
            </SelectInput>
          </div>
        </div>
        {list.error ? (
          <div role="alert" className="border-t px-6 py-12 text-center">
            <p className="font-semibold">Deposits didn&apos;t load</p>
            <p className="mt-1 text-sm text-muted-foreground">{list.error}</p>
          </div>
        ) : !list.data ? (
          <div className="space-y-2 border-t p-4 sm:p-5" aria-label="Loading deposits">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
            ))}
          </div>
        ) : list.data.items.length === 0 ? (
          <div className="flex flex-col items-center border-t px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary" aria-hidden>
              <Wallet className="size-5" />
            </span>
            <p className="mt-4 font-heading text-lg font-bold">No deposit requests{status || method || query ? " match" : " yet"}</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Requests appear here when customers create them. Nothing is credited until it&apos;s verified.</p>
          </div>
        ) : (
          <>
            <ul className="divide-y border-t" aria-label="Deposit requests">
              {list.data.items.map((r) => (
                <li key={r.reference}>
                  <button type="button" onClick={() => setOpenRef(r.reference)} className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 text-start transition-colors hover:bg-muted/40 sm:px-5 lg:grid-cols-[10rem_minmax(0,1fr)_8rem_10rem_9rem]", openRef === r.reference && "bg-secondary/30")}>
                    <span className="font-mono text-[0.82rem] font-semibold">{r.reference}</span>
                    <span className="order-3 min-w-0 lg:order-none">
                      <span className="block truncate text-sm font-semibold">{r.customer.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.customer.email} · {r.method === "bank" ? "Bank transfer" : r.method}
                      </span>
                    </span>
                    <span className="text-end font-heading font-bold tabular-nums lg:order-none">{cents(r.amountCents)}</span>
                    <span className="order-4 justify-self-end lg:order-none lg:justify-self-start">
                      <DepositStatusBadge status={r.status} />
                    </span>
                    <span className="hidden text-xs text-muted-foreground lg:block">{formatDateTime(r.requestedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {list.data.pages > 1 ? <Pagination page={page} pageCount={list.data.pages} total={list.data.total} pageSize={20} label="Deposit pages" onPage={setPage} /> : null}
          </>
        )}
      </Card>

      <Card className="mt-6 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold">
          <Lock className="size-4 text-muted-foreground" aria-hidden /> Refunds &amp; wallet adjustments
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Switched off. They&apos;re prepared — each needs the original reference, a written reason, the right permission, re-authentication and (for adjustments) a second approver — but stay disabled until their evidence and reconciliation procedures are verified. No balance can be edited directly.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {["Issue refund", "Adjust wallet"].map((l) => (
            <button key={l} type="button" disabled className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-full border border-dashed px-4 text-sm font-semibold text-muted-foreground">
              <Lock className="size-3.5" aria-hidden /> {l} · disabled
            </button>
          ))}
        </div>
      </Card>

      {/* Keyed per deposit so forms and messages start fresh for each one. */}
      <DepositSheet key={openRef ?? "none"} reference={openRef} can={can ?? null} onClose={() => setOpenRef(null)} onChanged={changed} />
    </div>
  );
}

function MethodsCard({ methods }: { methods: MethodReadiness[] | null }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-heading text-base font-bold">Payment methods</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">What customers can use and how each is verified.</p>
      {!methods ? (
        <div className="mt-4 h-40 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      ) : (
        <ul className="mt-4 divide-y rounded-xl border">
          {methods.map((m) => (
            <li key={m.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="flex shrink-0 items-center gap-2 sm:w-48">
                {m.acceptingRequests ? <CircleCheck className="size-4 text-ok" aria-hidden /> : <CircleDashed className="size-4 text-muted-foreground" aria-hidden />}
                <span className="text-sm font-semibold">{m.name}</span>
              </div>
              <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                <p>
                  <span className={cn("font-semibold", m.acceptingRequests ? "text-ok" : "text-foreground")}>{m.configured ? "Configured" : "Not configured"}</span> · {m.verification.available ? "verification available" : "no verification method"} · USD
                  {m.limits ? ` · ${cents(m.limits.minCents)}–${cents(m.limits.maxCents)}` : ""}
                </p>
                <p className="mt-0.5">{m.blockers[0] ?? m.verification.description}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ReconcileCard({ summary, can }: { summary: Summary | null; can: Can | null }) {
  const [state, setState] = React.useState<{ busy: boolean; result?: { ok: boolean; checkedAt: string; exceptions: { code: string; message: string; reference?: string }[] }; error?: string }>({ busy: false });
  const run = async () => {
    setState({ busy: true });
    try {
      setState({ busy: false, result: await api("/api/admin/payments/reconciliation") });
    } catch (e) {
      setState({ busy: false, error: e instanceof Error ? e.message : "The check didn't run." });
    }
  };
  const m = summary?.walletMovements;
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-heading text-base font-bold">
        <Scale className="size-4 text-primary" aria-hidden /> Reconciliation
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Read-only. Problems are reported for a person to investigate; balances are never changed automatically.</p>
      {m ? (
        <dl className="mt-4 space-y-1.5 text-sm">
          {[
            ["Deposit credits", m.depositCredits.cents],
            ["Order charges", m.orderDebits.cents],
            ["Refunds", m.refunds.cents],
            ["Adjustments", m.adjustments.cents],
          ].map(([k, v]) => (
            <div key={k as string} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium tabular-nums">{cents(v as number)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-t pt-1.5">
            <dt className="font-semibold">Wallet liabilities</dt>
            <dd className="font-semibold tabular-nums">{cents(summary!.walletLiabilitiesCents)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Recognised revenue</dt>
            <dd className="font-medium tabular-nums">{cents(summary!.revenueCents)}</dd>
          </div>
        </dl>
      ) : null}
      <button type="button" onClick={run} disabled={state.busy || !can} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-60">
        <ShieldCheck className="size-4" aria-hidden /> {state.busy ? "Checking…" : "Run check now"}
      </button>
      <div role="status" aria-live="polite" className="mt-3 empty:hidden">
        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        {state.result ? (
          state.result.ok ? (
            <p className="flex items-center gap-2 text-sm font-medium text-ok">
              <BadgeCheck className="size-4" aria-hidden /> All checks passed · {formatDateTime(state.result.checkedAt)}
            </p>
          ) : (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold text-destructive">
                <CircleAlert className="size-4" aria-hidden /> {state.result.exceptions.length} exception{state.result.exceptions.length === 1 ? "" : "s"} found
              </p>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
                {state.result.exceptions.slice(0, 50).map((x, i) => (
                  <li key={i}>
                    <span className="font-mono">{x.code}</span> · {x.message}
                    {x.reference ? <span className="text-muted-foreground"> ({x.reference})</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : null}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Deposit detail                                                            */
/* -------------------------------------------------------------------------- */

function DepositSheet({ reference, can, onClose, onChanged }: { reference: string | null; can: Can | null; onClose: () => void; onChanged: () => void }) {
  const detail = useJson<{ deposit: Detail }>(reference ? `/api/admin/payments/deposits/${encodeURIComponent(reference)}` : null);
  const d = detail.data?.deposit && detail.data.deposit.reference === reference ? detail.data.deposit : null;
  const { guard, dialog } = useReauth();
  const [mode, setMode] = React.useState<"none" | "receipt" | "reject">("none");
  const [error, setError] = React.useState<{ message: string; field?: string } | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const act = async (path: string, body: object, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await guard(async () => {
        const res = await api<{ deposit: Detail }>(`/api/admin/payments/deposits/${encodeURIComponent(reference!)}/${path}`, { method: "POST", body: JSON.stringify(body) });
        detail.set({ deposit: res.deposit });
        setMode("none");
        setDone(message);
        onChanged();
      });
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : "That didn't work.", field: e instanceof ApiError ? e.field : undefined });
    } finally {
      setBusy(false);
    }
  };

  const canAct = Boolean(can?.approveDeposits) && Boolean(d?.verification.available);

  return (
    <Sheet open={Boolean(reference)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[38rem]">
        <div className="flex items-start gap-3 border-b px-5 py-4 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary" aria-hidden>
            <Landmark className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-heading text-lg leading-tight font-bold">{d ? cents(d.amountCents) : "Deposit"}</SheetTitle>
            <SheetDescription className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-[0.8rem]">{reference}</span>
              {d ? <DepositStatusBadge status={d.status} /> : null}
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
          ) : !d ? (
            <div className="space-y-3" aria-label="Loading deposit">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
              ))}
            </div>
          ) : (
            <>
              <div role="status" aria-live="polite" className="empty:hidden">
                {done ? (
                  <p className="flex items-center gap-2 rounded-xl border border-ok/30 bg-ok-soft/60 px-3.5 py-2.5 text-sm">
                    <CircleCheck className="size-4 text-ok" aria-hidden /> {done}
                  </p>
                ) : null}
              </div>

              <section aria-label="Next step" className="rounded-2xl border p-4">
                <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Next step</p>
                <p className="mt-1 font-semibold">{d.next.label}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{d.next.explain}</p>
                {d.blockers.length ? (
                  <ul className="mt-3 space-y-1.5">
                    {d.blockers.map((b) => (
                      <li key={b} className="flex gap-2 text-sm">
                        <CircleAlert className="mt-0.5 size-4 shrink-0 text-soon" aria-hidden />
                        {b}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {!can?.approveDeposits && (d.next.id === "record_receipt" || d.next.id === "verify_and_credit") ? (
                  <p className="mt-3 text-xs text-muted-foreground">Your role doesn&apos;t include “Approve deposits”, so you can review but not verify.</p>
                ) : null}
                {canAct ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {d.next.id === "record_receipt" ? (
                      <button type="button" onClick={() => setMode("receipt")} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                        <Landmark className="size-4" aria-hidden /> Record bank receipt
                      </button>
                    ) : null}
                    {d.next.id === "verify_and_credit" && !d.reviews.some((r) => r.step === "first" && r.mine) ? (
                      <button type="button" disabled={busy} onClick={() => act("verify", {}, `Verified. ${cents(d.amountCents)} was credited to the customer's wallet.`)} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                        <BadgeCheck className="size-4" aria-hidden /> {busy ? "Crediting…" : `Verify and credit ${cents(d.amountCents)}`}
                      </button>
                    ) : null}
                    {(d.status === "awaiting_payment" || d.status === "under_review") && !(d.status === "under_review" && d.reviews.some((r) => r.step === "first" && r.mine)) ? (
                      <button type="button" onClick={() => setMode("reject")} className="inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold text-destructive hover:bg-destructive/5">
                        <Ban className="size-4" aria-hidden /> Reject
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </section>

              {mode === "receipt" ? <ReceiptForm amountCents={d.amountCents} busy={busy} error={error} onCancel={() => setMode("none")} onSubmit={(body) => act("receipt", body, "Receipt recorded (review 1 of 2). A different staff member must verify it before anything is credited.")} /> : null}
              {mode === "reject" ? <RejectForm busy={busy} error={error} onCancel={() => setMode("none")} onSubmit={(reason) => act("reject", { reason }, "Rejected. The customer sees your reason; nothing was credited.")} /> : null}
              {mode === "none" && error ? (
                <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm">
                  {error.message}
                </p>
              ) : null}

              <section aria-label="Details">
                <h3 className="mb-2 text-sm font-bold">Request</h3>
                <dl className="divide-y rounded-xl border text-sm">
                  {[
                    ["Customer", `${d.customer.name} · ${d.customer.publicRef}`],
                    ["Email", d.customer.email],
                    ["Method", `${d.methodName} · USD`],
                    ["Requested", formatDateTime(d.requestedAt)],
                    ["Expires", d.expiresAt ? formatDateTime(d.expiresAt) : "—"],
                    ...(d.paymentReference ? [["Bank reference", d.paymentReference]] : []),
                    ...(d.settledAt ? [["Received", formatDateTime(d.settledAt)]] : []),
                    ...(d.statusReason ? [["Reason shown to customer", d.statusReason]] : []),
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="min-w-0 text-end font-medium break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section aria-label="Verification history">
                <h3 className="mb-2 text-sm font-bold">Verification</h3>
                <p className="mb-2 text-xs text-muted-foreground">{d.verification.description}</p>
                {d.reviews.length === 0 ? (
                  <p className="rounded-xl border border-dashed px-3.5 py-3 text-sm text-muted-foreground">No reviews yet.</p>
                ) : (
                  <ol className="space-y-2">
                    {d.reviews.map((r) => (
                      <li key={r.step} className="rounded-xl border px-3.5 py-3 text-sm">
                        <p className="font-semibold">
                          {r.step === "first" ? "Review 1 of 2" : "Review 2 of 2"} · {r.decision === "approve" ? (r.step === "first" ? "receipt recorded" : "verified") : "rejected"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.by}
                          {r.mine ? " (you)" : ""} · {formatDateTime(r.decidedAt)}
                        </p>
                        <Evidence evidence={r.evidence} />
                      </li>
                    ))}
                  </ol>
                )}
                {d.ledgerEntry ? (
                  <p className="mt-2 rounded-xl bg-muted/50 px-3.5 py-2.5 text-xs">
                    Ledger entry <span className="font-mono">{d.ledgerEntry.id.slice(0, 8)}</span> · {d.ledgerEntry.kind} · posted {formatDateTime(d.ledgerEntry.postedAt)}
                  </p>
                ) : null}
              </section>

              <Notes reference={d.reference} notes={d.notes} canAdd={Boolean(can?.manage)} onAdded={(next) => detail.set({ deposit: next })} />
            </>
          )}
        </div>
        {dialog}
      </SheetContent>
    </Sheet>
  );
}

const EVIDENCE_LABELS: Record<string, string> = { bankReference: "Bank reference", amountReceivedCents: "Amount received", receivedOn: "Received on", payerName: "Payer", note: "Note", reason: "Reason" };

function Evidence({ evidence }: { evidence: Record<string, unknown> }) {
  const rows = Object.entries(EVIDENCE_LABELS).filter(([k]) => evidence[k] !== undefined && evidence[k] !== null && evidence[k] !== "");
  if (!rows.length) return null;
  return (
    <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
      {rows.map(([k, label]) => (
        <div key={k} className="flex gap-2">
          <dt className="text-muted-foreground">{label}:</dt>
          <dd className="min-w-0 font-medium break-words">{k === "amountReceivedCents" ? cents(Number(evidence[k])) : String(evidence[k])}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReceiptForm({ amountCents, busy, error, onCancel, onSubmit }: { amountCents: number; busy: boolean; error: { message: string; field?: string } | null; onCancel: () => void; onSubmit: (body: object) => void }) {
  const [f, setF] = React.useState({ bankReference: "", amount: "", receivedOn: new Date().toISOString().slice(0, 10), payerName: "", note: "", onBankStatement: false, referenceMatches: false, fundsCleared: false });
  const set = (patch: Partial<typeof f>) => setF((c) => ({ ...c, ...patch }));
  const amountReceivedCents = Math.round(Number(f.amount) * 100);
  const ready = f.bankReference.trim().length >= 3 && f.payerName.trim().length >= 2 && Number.isFinite(amountReceivedCents) && amountReceivedCents > 0 && f.onBankStatement && f.referenceMatches && f.fundsCleared;
  const fieldErr = (k: string) => (error?.field === k ? error.message : null);
  return (
    <form
      className="space-y-3 rounded-2xl border border-primary/30 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ bankReference: f.bankReference.trim(), amountReceivedCents, receivedOn: f.receivedOn, payerName: f.payerName.trim(), checks: { onBankStatement: f.onBankStatement, referenceMatches: f.referenceMatches, fundsCleared: f.fundsCleared }, note: f.note.trim() });
      }}
    >
      <p className="font-semibold">Record bank receipt · review 1 of 2</p>
      <p className="text-xs text-muted-foreground">Copy these from Sociotix&apos;s own bank statement — never from a customer&apos;s screenshot or message. The amount must be exactly {cents(amountCents)}.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Bank transaction reference
          <TextInput value={f.bankReference} maxLength={60} onChange={(e) => set({ bankReference: e.target.value })} className="mt-1" aria-invalid={Boolean(fieldErr("bankReference")) || undefined} />
        </label>
        <label className="text-sm font-medium">
          Amount received (USD)
          <TextInput inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value.replace(/[^\d.]/g, "") })} placeholder={(amountCents / 100).toFixed(2)} className="mt-1" aria-invalid={Boolean(fieldErr("amountReceivedCents")) || undefined} />
        </label>
        <label className="text-sm font-medium">
          Received on
          <TextInput type="date" value={f.receivedOn} onChange={(e) => set({ receivedOn: e.target.value })} className="mt-1" aria-invalid={Boolean(fieldErr("receivedOn")) || undefined} />
        </label>
        <label className="text-sm font-medium">
          Payer name on statement
          <TextInput value={f.payerName} maxLength={120} onChange={(e) => set({ payerName: e.target.value })} className="mt-1" />
        </label>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="sr-only">Confirmations</legend>
        {(
          [
            ["onBankStatement", "The transfer is on Sociotix's bank statement"],
            ["referenceMatches", "The deposit reference matches"],
            ["fundsCleared", "The funds have cleared"],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={f[k]} onChange={(e) => set({ [k]: e.target.checked })} className="size-4 accent-primary" />
            {l}
          </label>
        ))}
      </fieldset>
      <label className="block text-sm font-medium">
        Internal note (optional)
        <TextArea value={f.note} maxLength={500} onChange={(e) => set({ note: e.target.value })} className="mt-1" />
      </label>
      {error ? <p role="alert" className="text-sm font-medium text-destructive">{error.message}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-10 rounded-full border px-4 text-sm font-semibold hover:bg-muted">
          Cancel
        </button>
        <button type="submit" disabled={!ready || busy} className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {busy ? "Recording…" : "Record receipt"}
        </button>
      </div>
    </form>
  );
}

function RejectForm({ busy, error, onCancel, onSubmit }: { busy: boolean; error: { message: string } | null; onCancel: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = React.useState("");
  return (
    <form className="space-y-3 rounded-2xl border border-destructive/30 p-4" onSubmit={(e) => (e.preventDefault(), onSubmit(reason.trim()))}>
      <p className="font-semibold">Reject this request</p>
      <label className="block text-sm font-medium">
        Reason (shown to the customer)
        <TextArea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className="mt-1" placeholder="e.g. The transfer didn't include the deposit reference." />
      </label>
      {error ? <p role="alert" className="text-sm font-medium text-destructive">{error.message}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-10 rounded-full border px-4 text-sm font-semibold hover:bg-muted">
          Cancel
        </button>
        <button type="submit" disabled={reason.trim().length < 10 || busy} className="h-10 rounded-full bg-destructive px-5 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-50">
          {busy ? "Rejecting…" : "Reject request"}
        </button>
      </div>
    </form>
  );
}

function Notes({ reference, notes, canAdd, onAdded }: { reference: string; notes: Detail["notes"]; canAdd: boolean; onAdded: (d: Detail) => void }) {
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ deposit: Detail }>(`/api/admin/payments/deposits/${encodeURIComponent(reference)}/notes`, { method: "POST", body: JSON.stringify({ body: body.trim() }) });
      onAdded(res.deposit);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The note wasn't saved.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Internal notes">
      <h3 className="mb-2 text-sm font-bold">Internal notes</h3>
      {notes.length ? (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-xl bg-muted/50 px-3.5 py-2.5 text-sm">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {n.by} · {formatDateTime(n.at)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No notes.</p>
      )}
      {canAdd ? (
        <form onSubmit={add} className="mt-3 space-y-2">
          <TextArea value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} placeholder="Add a note for the team (never passwords, codes or card numbers)" aria-label="New note" />
          {error ? <p role="alert" className="text-sm font-medium text-destructive">{error}</p> : null}
          <div className="flex justify-end">
            <button type="submit" disabled={!body.trim() || busy} className="h-9 rounded-full border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50">
              {busy ? "Saving…" : "Add note"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
