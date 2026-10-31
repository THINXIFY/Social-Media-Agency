"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { BadgeCheck, ChevronDown, CircleAlert, CircleCheck, ClipboardList, Lock, MessageSquareWarning, PackageOpen, Play, RotateCcw, Search, UserPlus, X } from "lucide-react";
import { OrderBadge } from "@/components/dashboard/live-orders";
import { Pagination } from "@/components/dashboard/shared";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { usd } from "@/lib/demo-account";
import { formatDateTime } from "@/lib/i18n";
import { api, ApiError } from "@/lib/live-account";
import { ORDER_STATUS_META, type OrderPaymentStatus, type OrderRevenueStatus, type OrderStatus, PAYMENT_STATUS_META, REVENUE_STATUS_META } from "@/lib/orders";
import { cn } from "@/lib/utils";
import { inputClass, SelectInput, TextArea, TextInput } from "./form";
import { menuItem, menuPopup } from "./menu";
import { useReauth } from "./reauth";
import { Card } from "./ui";

/*
 * Live Admin Orders (DEMO_MODE off). Real orders and a manual fulfilment
 * workflow. The server enforces every rule — Orders: Manage, re-auth for
 * money-moving steps, the order state machine and its ledger postings. The
 * page offers one primary next step and keeps the rest under More.
 */

const cents = (n: number) => usd(n / 100);

interface Row {
  reference: string;
  customer: { publicRef: string; name: string; email: string };
  service: { name: string; platformId: string; platform: string };
  quantity: number;
  totalCents: number;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  assignee: string | null;
  placedAt: string;
}
interface ListResponse {
  items: Row[];
  total: number;
  pages: number;
  queues: { review: number; needsInfo: number; ready: number; inProgress: number };
  checkoutEnabled: boolean;
  can: { manage: boolean };
}
interface Detail {
  reference: string;
  customer: { publicRef: string; accountRef: string; name: string; email: string };
  service: { id: string; name: string; platform: string; category: string };
  snapshot: Record<string, unknown>;
  quantity: number;
  link: string | null;
  details: Record<string, string>;
  totalCents: number;
  status: OrderStatus;
  statusReason: string | null;
  paymentStatus: OrderPaymentStatus;
  revenueStatus: OrderRevenueStatus;
  ledger: { debitEntryId: string | null; releaseEntryId: string | null; recognitionEntryId: string | null };
  fulfillment: { method: string | null; reference: string | null; assignee: string | null; assignedToMe: boolean; startedAt: string | null; completedAt: string | null };
  placedAt: string;
  events: { type: string; label: string; by: string; data: Record<string, unknown>; at: string }[];
  notes: { id: string; body: string; at: string; by: string }[];
  next: { id: "approve" | "start" | "complete" | "await_customer" | "none"; label: string };
  blockers: string[];
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
  return { data: state.data, error: loading ? undefined : state.error, loading, reload: () => setAttempt((n) => n + 1) };
}

const STATUSES: [string, string][] = [
  ["open", "Open orders"],
  ["", "All statuses"],
  ["pending_review", "Awaiting review"],
  ["needs_customer_action", "Needs customer info"],
  ["queued", "Approved / ready"],
  ["in_progress", "In progress"],
  ["completed", "Completed"],
  ["failed", "Failed"],
  ["rejected", "Rejected"],
  ["cancelled", "Canceled"],
];

export function LiveAdminOrders() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const status = params.get("status") ?? "open";
  const assigned = params.get("assigned") ?? "";
  const sort = params.get("sort") ?? "newest";
  const openRef = params.get("order");
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const [query, setQuery] = React.useState(q.trim());
  const [page, setPage] = React.useState(1);
  const [version, setVersion] = React.useState(0);

  const href = React.useCallback(
    (patch: Record<string, string | null>) => {
      const u = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) u.set(k, v);
        else u.delete(k);
      }
      const s = u.toString();
      return s ? `${pathname}?${s}` : pathname;
    },
    [params, pathname],
  );
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const lp = new URLSearchParams({ sort, page: String(page), pageSize: "20", v: String(version) });
  if (status && status !== "all") lp.set("status", status); // "all" = no status filter
  if (assigned) lp.set("assigned", assigned);
  if (query) lp.set("q", query);
  const list = useJson<ListResponse>(`/api/admin/orders?${lp}`);
  const d = list.data;
  const filter = (patch: Record<string, string | null>) => {
    setPage(1);
    router.replace(href(patch), { scroll: false });
  };

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.8rem] font-medium text-muted-foreground">Operations</p>
          <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Orders</h1>
          <p className="mt-1 max-w-2xl text-[0.95rem] text-muted-foreground">Review, fulfil and close real orders. Every step is recorded; money only moves through the ledger.</p>
        </div>
        {d ? (
          <span className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold", d.checkoutEnabled ? "bg-ok-soft text-ok" : "bg-muted text-muted-foreground")}>
            {d.checkoutEnabled ? <CircleCheck className="size-3.5" aria-hidden /> : <Lock className="size-3.5" aria-hidden />}
            {d.checkoutEnabled ? "Checkout on" : "Checkout off — customers can't place orders"}
          </span>
        ) : null}
      </header>

      <div role="group" aria-label="Filter by queue" className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["Awaiting review", d?.queues.review, "pending_review"],
            ["Needs customer info", d?.queues.needsInfo, "needs_customer_action"],
            ["Ready to fulfil", d?.queues.ready, "queued"],
            ["In progress", d?.queues.inProgress, "in_progress"],
          ] as const
        ).map(([label, n, s]) => (
          <button key={s} type="button" onClick={() => filter({ status: s })} aria-pressed={status === s} className={cn("rounded-2xl border bg-card p-4 text-start transition-colors hover:border-primary/40 sm:p-5", status === s && "border-primary/50 ring-2 ring-primary/15")}>
            <span className="block text-[0.8rem] font-semibold text-muted-foreground">{label}</span>
            <span className="mt-2 block font-heading text-[1.6rem] leading-none font-extrabold tabular-nums">{n ?? <span className="inline-block h-7 w-10 animate-pulse rounded bg-muted motion-reduce:animate-none" />}</span>
          </button>
        ))}
      </div>

      <Card className="mt-6 overflow-hidden" aria-busy={list.loading || undefined}>
        <div className="flex flex-col gap-2 p-4 sm:p-5 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <label htmlFor="ord-search" className="sr-only">
              Search orders
            </label>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input id="ord-search" type="search" value={q} maxLength={80} onChange={(e) => setQ(e.target.value)} placeholder="Search by order, customer, email, service or link" className={cn(inputClass, "h-10 ps-9")} />
          </div>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3 lg:flex">
            <SelectInput aria-label="Status" value={status} onChange={(e) => filter({ status: e.target.value || "all" })} className="h-10 lg:w-48">
              {STATUSES.map(([v, l]) => (
                <option key={v || "all"} value={v || "all"}>
                  {l}
                </option>
              ))}
            </SelectInput>
            <SelectInput aria-label="Assignment" value={assigned} onChange={(e) => filter({ assigned: e.target.value || null })} className="h-10 lg:w-40">
              <option value="">Anyone</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
            </SelectInput>
            <SelectInput aria-label="Sort" value={sort} onChange={(e) => filter({ sort: e.target.value === "newest" ? null : e.target.value })} className="h-10 lg:w-36">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="amount">Largest first</option>
            </SelectInput>
          </div>
        </div>
        {list.error ? (
          <div role="alert" className="flex flex-col items-center border-t px-6 py-12 text-center">
            <p className="font-semibold">Orders didn&apos;t load</p>
            <p className="mt-1 text-sm text-muted-foreground">{list.error}</p>
            <button type="button" onClick={list.reload} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold hover:bg-muted">
              <RotateCcw className="size-3.5" aria-hidden /> Try again
            </button>
          </div>
        ) : !d ? (
          <div className="space-y-2 border-t p-4 sm:p-5" aria-label="Loading orders">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
            ))}
          </div>
        ) : d.items.length === 0 ? (
          <div className="flex flex-col items-center border-t px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary" aria-hidden>
              <PackageOpen className="size-5" />
            </span>
            <p className="mt-4 font-heading text-lg font-bold">{query || assigned || (status && status !== "open" && status !== "all") ? "No orders match" : "No orders yet"}</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{d.checkoutEnabled ? "New orders appear here for review." : "Checkout is switched off, so customers can't place orders yet."}</p>
          </div>
        ) : (
          <>
            <ul className="divide-y border-t" aria-label="Orders">
              {d.items.map((r) => (
                <li key={r.reference}>
                  <button type="button" onClick={() => router.push(href({ order: r.reference }), { scroll: false })} className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 text-start transition-colors hover:bg-muted/40 sm:px-5 lg:grid-cols-[9.5rem_minmax(0,1.2fr)_minmax(0,1fr)_6rem_10rem_8rem]", openRef === r.reference && "bg-secondary/30")}>
                    <span className="font-mono text-[0.82rem] font-semibold">{r.reference}</span>
                    <span className="order-3 min-w-0 lg:order-none">
                      <span className="block truncate text-sm font-semibold">{r.service.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.service.platform} · {r.quantity.toLocaleString("en-US")}
                      </span>
                    </span>
                    <span className="order-5 hidden min-w-0 lg:order-none lg:block">
                      <span className="block truncate text-sm">{r.customer.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{r.assignee ? `Assigned · ${r.assignee}` : "Unassigned"}</span>
                    </span>
                    <span className="text-end font-heading font-bold tabular-nums lg:order-none">{cents(r.totalCents)}</span>
                    <span className="order-4 justify-self-end lg:order-none lg:justify-self-start">
                      <OrderBadge status={r.status} staff />
                    </span>
                    <span className="hidden text-xs text-muted-foreground lg:block">{formatDateTime(r.placedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {d.pages > 1 ? <Pagination page={page} pageCount={d.pages} total={d.total} pageSize={20} label="Order pages" onPage={setPage} /> : null}
          </>
        )}
      </Card>

      <OrderDrawer key={openRef ?? "none"} reference={openRef} canManage={Boolean(d?.can.manage)} onClose={() => router.push(href({ order: null }), { scroll: false })} onChanged={() => setVersion((v) => v + 1)} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Drawer                                                                    */
/* -------------------------------------------------------------------------- */

type Form = "none" | "info" | "reject" | "cancel" | "fail" | "start" | "progress" | "complete";

function OrderDrawer({ reference, canManage, onClose, onChanged }: { reference: string | null; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const detail = useJson<{ order: Detail }>(reference ? `/api/admin/orders/${encodeURIComponent(reference)}` : null);
  const [fresh, setFresh] = React.useState<Detail | null>(null);
  const o = fresh ?? detail.data?.order ?? null;
  const staff = useJson<{ staff: { userId: string; name: string }[] }>(reference && canManage ? "/api/admin/orders/assignees" : null);
  const { guard, dialog } = useReauth();
  const [form, setForm] = React.useState<Form>("none");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  const act = async (action: string, body: object, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await guard(async () => {
        const res = await api<{ order: Detail }>(`/api/admin/orders/${encodeURIComponent(reference!)}/${action}`, { method: "POST", body: JSON.stringify(body) });
        setFresh(res.order);
        setForm("none");
        setDone(message);
        onChanged();
      });
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const s = o?.status;
  const primary =
    !o || !canManage
      ? null
      : o.next.id === "approve"
        ? { label: "Approve", icon: BadgeCheck, run: () => act("approve", {}, "Approved. It's ready for fulfilment.") }
        : o.next.id === "start"
          ? o.fulfillment.assignee
            ? { label: "Start fulfilment", icon: Play, run: () => setForm("start") }
            : { label: "Assign to me", icon: UserPlus, run: () => act("assign", {}, "Assigned to you.") }
          : o.next.id === "complete"
            ? { label: "Complete with evidence", icon: CircleCheck, run: () => setForm("complete") }
            : null;
  const more: { label: string; run: () => void; danger?: boolean }[] = !o || !canManage ? [] : [];
  if (o && canManage) {
    if (s === "pending_review" || s === "queued") more.push({ label: "Ask the customer for information", run: () => setForm("info") });
    if (s === "in_progress" || s === "partial") more.push({ label: "Record progress", run: () => setForm("progress") });
    if (s === "pending_review" || s === "needs_customer_action") more.push({ label: "Reject and return funds", run: () => setForm("reject"), danger: true });
    if (s === "pending_review" || s === "needs_customer_action" || s === "queued") more.push({ label: "Cancel and return funds", run: () => setForm("cancel"), danger: true });
    if (s === "queued" || s === "in_progress" || s === "partial") more.push({ label: "Mark failed", run: () => setForm("fail"), danger: true });
  }

  return (
    <Sheet open={Boolean(reference)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[40rem]">
        <div className="flex items-start gap-3 border-b px-5 py-4 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary" aria-hidden>
            <ClipboardList className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-heading text-lg leading-tight font-bold">{o ? `${o.service.name} · ${cents(o.totalCents)}` : "Order"}</SheetTitle>
            <SheetDescription className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-[0.8rem]">{reference}</span>
              {o ? <OrderBadge status={o.status} staff /> : null}
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
                <p className="mt-1 font-semibold">{o.next.label}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{ORDER_STATUS_META[o.status].staffExplain}</p>
                {o.statusReason ? <p className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-sm">{o.statusReason}</p> : null}
                {o.blockers.map((b) => (
                  <p key={b} className="mt-2 flex gap-2 text-sm">
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-soon" aria-hidden />
                    {b}
                  </p>
                ))}
                {!canManage ? <p className="mt-3 text-xs text-muted-foreground">Your role can view orders but not change them.</p> : null}
                {primary || more.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {primary ? (
                      <button type="button" disabled={busy} onClick={primary.run} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                        <primary.icon className="size-4" aria-hidden /> {primary.label}
                      </button>
                    ) : null}
                    {more.length ? (
                      <Menu.Root>
                        <Menu.Trigger className="inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold hover:bg-muted data-popup-open:bg-muted">
                          More <ChevronDown className="size-4" aria-hidden />
                        </Menu.Trigger>
                        <Menu.Portal>
                          <Menu.Positioner side="bottom" align="start" sideOffset={6} className="z-[60]">
                            <Menu.Popup className={cn(menuPopup, "w-64")}>
                              {more.map((m) => (
                                <Menu.Item key={m.label} className={cn(menuItem, m.danger && "text-destructive")} onClick={m.run}>
                                  {m.label}
                                </Menu.Item>
                              ))}
                            </Menu.Popup>
                          </Menu.Positioner>
                        </Menu.Portal>
                      </Menu.Root>
                    ) : null}
                  </div>
                ) : null}
              </section>

              {form !== "none" ? (
                <ActionForm
                  form={form}
                  busy={busy}
                  error={error}
                  onCancel={() => (setForm("none"), setError(null))}
                  onSubmit={(action, body, message) => act(action, body, message)}
                  total={o.totalCents}
                />
              ) : error ? (
                <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm">
                  {error}
                </p>
              ) : null}

              <section aria-label="Order">
                <h3 className="mb-2 text-sm font-bold">Order</h3>
                <dl className="divide-y rounded-xl border text-sm">
                  {[
                    ["Customer", `${o.customer.name} · ${o.customer.publicRef}`],
                    ["Email", o.customer.email],
                    ["Service", `${o.service.platform} · ${o.service.name} (${o.service.category})`],
                    ["Quantity", o.quantity.toLocaleString("en-US")],
                    ["Target", o.link ?? "—"],
                    ...Object.entries(o.details).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), v]),
                    ["Unit price (frozen)", `${usd(Number(o.snapshot.unitPriceMicros ?? 0) / 1_000_000)} ${String(o.snapshot.unit ?? "")}`],
                    ["Total", `${cents(o.totalCents)} USD`],
                    ["Placed", formatDateTime(o.placedAt)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="min-w-0 text-end font-medium break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section aria-label="Money">
                <h3 className="mb-2 text-sm font-bold">Payment &amp; revenue</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border p-3 text-sm">
                    <p className="font-semibold">{PAYMENT_STATUS_META[o.paymentStatus].label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{PAYMENT_STATUS_META[o.paymentStatus].explain}</p>
                  </div>
                  <div className="rounded-xl border p-3 text-sm">
                    <p className="font-semibold">Revenue · {REVENUE_STATUS_META[o.revenueStatus].label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{REVENUE_STATUS_META[o.revenueStatus].explain}</p>
                  </div>
                </div>
              </section>

              <section aria-label="Fulfilment">
                <h3 className="mb-2 text-sm font-bold">Fulfilment</h3>
                <dl className="divide-y rounded-xl border text-sm">
                  {[
                    ["Method", o.fulfillment.method === "manual" ? "Manual (staff)" : "Not set"],
                    ["Assigned to", o.fulfillment.assignee ? `${o.fulfillment.assignee}${o.fulfillment.assignedToMe ? " (you)" : ""}` : "Unassigned"],
                    ["Internal reference", o.fulfillment.reference ?? "—"],
                    ["Started", o.fulfillment.startedAt ? formatDateTime(o.fulfillment.startedAt) : "—"],
                    ["Completed", o.fulfillment.completedAt ? formatDateTime(o.fulfillment.completedAt) : "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="min-w-0 text-end font-medium break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
                {canManage && staff.data && !["completed", "cancelled", "rejected", "failed", "refunded", "needs_customer_action"].includes(o.status) ? (
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <span className="shrink-0 text-muted-foreground">Assign to</span>
                    <SelectInput aria-label="Assign to" value="" onChange={(e) => e.target.value && act("assign", { assigneeUserId: e.target.value }, "Assignment updated.")} className="h-9 flex-1">
                      <option value="">Choose a staff member…</option>
                      {staff.data.staff.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.name}
                        </option>
                      ))}
                    </SelectInput>
                  </label>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">Manual fulfilment only. No order is sent to an external provider.</p>
              </section>

              <section aria-label="Activity">
                <h3 className="mb-2 text-sm font-bold">Activity</h3>
                <ol className="space-y-3 border-s ps-4">
                  {o.events.map((ev, i) => (
                    <li key={i} className="relative text-sm">
                      <span className="absolute -start-[1.3rem] top-1.5 size-2 rounded-full bg-primary" aria-hidden />
                      <p className="font-semibold">{ev.label}</p>
                      {typeof ev.data.customerMessage === "string" ? <p className="text-muted-foreground">“{ev.data.customerMessage}”</p> : null}
                      {typeof ev.data.note === "string" ? <p className="text-muted-foreground">{ev.data.note}</p> : null}
                      {typeof ev.data.evidenceNote === "string" ? <p className="text-muted-foreground">Evidence: {ev.data.evidenceNote}</p> : null}
                      {typeof ev.data.evidenceUrl === "string" && ev.data.evidenceUrl ? (
                        <a href={ev.data.evidenceUrl} target="_blank" rel="noreferrer noopener" className="break-all text-primary underline">
                          {ev.data.evidenceUrl}
                        </a>
                      ) : null}
                      {typeof ev.data.fulfillmentRef === "string" ? <p className="text-muted-foreground">Ref {ev.data.fulfillmentRef}</p> : null}
                      <p className="text-xs text-muted-foreground">
                        {ev.by} · {formatDateTime(ev.at)}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>

              <Notes reference={o.reference} notes={o.notes} canAdd={canManage} onAdded={setFresh} />
            </>
          )}
        </div>
        {dialog}
      </SheetContent>
    </Sheet>
  );
}

function ActionForm({ form, busy, error, total, onCancel, onSubmit }: { form: Exclude<Form, "none">; busy: boolean; error: string | null; total: number; onCancel: () => void; onSubmit: (action: string, body: object, message: string) => void }) {
  const [text, setText] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [checks, setChecks] = React.useState({ deliveredAsOrdered: false, verifiedOnTarget: false });
  const cfg = {
    info: { title: "Ask the customer for information", field: "Message to the customer", min: 10, action: "request-info", key: "message", button: "Send request", done: "Sent to the customer. The order waits for their update." },
    reject: { title: "Reject this order", field: "Reason (shown to the customer)", min: 10, action: "reject", key: "reason", button: `Reject and return ${cents(total)}`, done: `Rejected. ${cents(total)} was returned to the customer's wallet.` },
    cancel: { title: "Cancel this order", field: "Reason (shown to the customer)", min: 10, action: "cancel", key: "reason", button: `Cancel and return ${cents(total)}`, done: `Canceled. ${cents(total)} was returned to the customer's wallet.` },
    fail: { title: "Mark this order failed", field: "Reason (shown to the customer)", min: 10, action: "fail", key: "reason", button: "Mark failed", done: "Marked failed. If work had started, the payment is held for refund review." },
    start: { title: "Start fulfilment", field: "Internal fulfilment reference", min: 2, action: "start", key: "fulfillmentRef", button: "Start fulfilment", done: "Fulfilment started." },
    progress: { title: "Record progress", field: "What happened (facts only)", min: 5, action: "progress", key: "note", button: "Add update", done: "Progress recorded." },
    complete: { title: "Complete with evidence", field: "Completion evidence", min: 20, action: "complete", key: "evidenceNote", button: "Complete order", done: "Completed." },
  }[form];
  const ready = text.trim().length >= cfg.min && (form !== "complete" || (checks.deliveredAsOrdered && checks.verifiedOnTarget));
  const body = form === "complete" ? { evidenceNote: text.trim(), evidenceUrl: url.trim(), checks } : form === "progress" ? { note: text.trim(), evidenceUrl: url.trim() } : { [cfg.key]: text.trim() };
  const danger = form === "reject" || form === "cancel" || form === "fail";
  return (
    <form className={cn("space-y-3 rounded-2xl border p-4", danger ? "border-destructive/30" : "border-primary/30")} onSubmit={(e) => (e.preventDefault(), onSubmit(cfg.action, body, cfg.done))}>
      <p className="flex items-center gap-2 font-semibold">
        {form === "info" ? <MessageSquareWarning className="size-4 text-primary" aria-hidden /> : null}
        {cfg.title}
      </p>
      <label className="block text-sm font-medium">
        {cfg.field}
        {form === "start" ? <TextInput value={text} maxLength={80} onChange={(e) => setText(e.target.value)} className="mt-1" placeholder="e.g. MAN-2026-0142" /> : <TextArea value={text} maxLength={form === "complete" ? 500 : 500} onChange={(e) => setText(e.target.value)} className="mt-1" />}
      </label>
      {form === "complete" || form === "progress" ? (
        <label className="block text-sm font-medium">
          Evidence link (optional, https)
          <TextInput value={url} maxLength={500} onChange={(e) => setUrl(e.target.value)} className="mt-1" placeholder="https://" />
        </label>
      ) : null}
      {form === "complete" ? (
        <fieldset className="space-y-1.5">
          <legend className="sr-only">Confirmations</legend>
          {(
            [
              ["deliveredAsOrdered", "Delivered as ordered (quantity and target)"],
              ["verifiedOnTarget", "I checked the delivery on the target"],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={checks[k]} onChange={(e) => setChecks((c) => ({ ...c, [k]: e.target.checked }))} className="size-4 accent-primary" />
              {l}
            </label>
          ))}
        </fieldset>
      ) : null}
      {danger ? <p className="text-xs text-muted-foreground">Needs your password and authenticator code.</p> : null}
      {error ? <p role="alert" className="text-sm font-medium text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-10 rounded-full border px-4 text-sm font-semibold hover:bg-muted">
          Back
        </button>
        <button type="submit" disabled={!ready || busy} className={cn("h-10 rounded-full px-5 text-sm font-semibold text-white disabled:opacity-50", danger ? "bg-destructive hover:bg-destructive/90" : "bg-primary hover:bg-primary/90")}>
          {busy ? "Saving…" : cfg.button}
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
      const res = await api<{ order: Detail }>(`/api/admin/orders/${encodeURIComponent(reference)}/notes`, { method: "POST", body: JSON.stringify({ body: body.trim() }) });
      onAdded(res.order);
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
