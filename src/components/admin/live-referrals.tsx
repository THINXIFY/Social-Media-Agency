"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Ban, Flag, History, Lock, RotateCcw, Search, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles, Users } from "lucide-react";
import { ConfirmDialog } from "@/components/dashboard/account-ui";
import { usd } from "@/lib/demo-account";
import { formatDateTime } from "@/lib/i18n";
import { api, ApiError } from "@/lib/live-account";
import { type AdminReferralRow, EVENT_LABEL, FLAG_LABEL, type ProgramSettings, REFERRAL_STATUS_META, REJECT_REASONS, type ReferralFlag, type ReferralStatus } from "@/lib/referrals";
import { cn } from "@/lib/utils";
import { SelectInput } from "./form";
import { useReauth } from "./reauth";

/*
 * Live Admin Referrals (5G-B). Review sign-ups made with referral links,
 * keep draft reward rules and switch attribution or sharing on or off. The
 * server enforces Referrals: View / Manage, re-authentication for program
 * settings and the audit trail. Rewards can't be activated from here.
 */

interface ListResponse {
  referrals: AdminReferralRow[];
  totals: { all: number; signedUp: number; pending: number; qualified: number; ineligible: number; flagged: number; verified: number };
  program: ProgramSettings & { version: number };
  can: { manage: boolean };
}
interface Detail {
  id: string;
  status: ReferralStatus;
  via: string;
  code: string | null;
  codeActive: boolean;
  flags: ReferralFlag[];
  ineligibleReason: string | null;
  attributedAt: string;
  verifiedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  policy: string;
  referrer: { ref: string; name: string; email: string; totalReferrals: number };
  referee: { ref: string; name: string; email: string; joinedAt: string };
  events: { type: string; data: Record<string, unknown>; actor: string; at: string }[];
}
interface Rule {
  id: string;
  version: number;
  status: "draft" | "active" | "retired";
  rewardType: "fixed" | "percent";
  fixedCents: number | null;
  percentBp: number | null;
  capCents: number | null;
  minSpendCents: number;
  qualifyingDays: number;
  holdDays: number;
  minOrders: number;
  maxPerReferrer: number | null;
  createdBy: string | null;
  createdAt: string;
}

const TABS = [
  ["referrals", "Referrals", Users],
  ["rules", "Reward rules", Sparkles],
  ["program", "Program", SlidersHorizontal],
  ["history", "History", History],
] as const;
type Tab = (typeof TABS)[number][0];
const FILTERS = [
  ["all", "All", "all"],
  ["flagged", "Flagged", "flagged"],
  ["signed_up", "Signed up", "signedUp"],
  ["pending", "Under review", "pending"],
  ["ineligible", "Rejected", "ineligible"],
] as const;
const STATUS_TONE: Record<ReferralStatus, string> = {
  signed_up: "bg-secondary text-secondary-foreground",
  pending: "bg-soon-soft text-soon",
  qualified: "bg-ok-soft text-ok",
  ineligible: "bg-off-soft text-off",
};
const message = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "That didn't work.");
const btn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";
const quietBtn = cn(btn, "border bg-card hover:bg-muted");
const primaryBtn = cn(btn, "bg-primary text-primary-foreground hover:bg-primary/90");
const field = "w-full rounded-xl border bg-background px-3 text-sm transition-colors outline-none placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 aria-invalid:border-destructive/60 dark:bg-muted/30";

function useJson<T>(url: string | null) {
  const [n, setN] = React.useState(0);
  const key = url ? `${url}#${n}` : null;
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
  return { data: state.data, error: state.key === key ? state.error : undefined, loading: Boolean(key) && state.key !== key, reload: () => setN((x) => x + 1), set: (data: T) => setState({ key: key ?? undefined, data }) };
}

function Chip({ status }: { status: ReferralStatus }) {
  return <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[0.72rem] font-semibold whitespace-nowrap", STATUS_TONE[status])}>{REFERRAL_STATUS_META[status].label}</span>;
}

function Failed({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div role="alert" className="p-5 text-sm">
      <p className="font-semibold">This couldn&apos;t be loaded.</p>
      <p className="mt-1 text-muted-foreground">{error}</p>
      <button type="button" onClick={retry} className={cn(quietBtn, "mt-3")}>
        Try again
      </button>
    </div>
  );
}

export function LiveAdminReferrals() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = (TABS.some(([id]) => id === params.get("tab")) ? params.get("tab") : "referrals") as Tab;
  const openId = params.get("referral");
  const go = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) u.set(k, v);
      else u.delete(k);
    }
    const s = u.toString();
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number][0]>("all");
  const [q, setQ] = React.useState("");
  const [query, setQuery] = React.useState("");
  React.useEffect(() => {
    const t = window.setTimeout(() => setQuery(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const qs = new URLSearchParams({ status: filter });
  if (query) qs.set("q", query);
  const list = useJson<ListResponse>(`/api/admin/referrals?${qs}`);
  const d = list.data;

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.8rem] font-medium text-muted-foreground">Growth</p>
          <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Referrals</h1>
          <p className="mt-1 max-w-2xl text-[0.95rem] text-muted-foreground">Sign-ups made with customers&apos; referral links. Signals flag a referral for review; they never reject one.</p>
        </div>
        {d ? (
          <p className="text-sm text-muted-foreground tabular-nums">
            <span className="font-semibold text-foreground">{d.totals.all}</span> referrals · <span className="font-semibold text-foreground">{d.totals.verified}</span> email confirmed · <span className="font-semibold text-foreground">{d.totals.flagged}</span> flagged
          </p>
        ) : null}
      </header>

      <div role="note" className="mt-5 flex items-start gap-3 rounded-2xl border border-soon/30 bg-soon-soft/50 p-3.5 text-sm">
        <Lock className="mt-0.5 size-4 shrink-0 text-soon" aria-hidden />
        <p>
          <span className="font-semibold">Rewards are off.</span> No referral can be qualified and no reward rule can be activated until reward rules, eligibility and accounting controls are approved. Customers see &ldquo;Rewards coming soon&rdquo;.
        </p>
      </div>

      <div className="mt-5 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Referral sections">
        {TABS.map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => go({ tab: id === "referrals" ? null : id, referral: null })} className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none", tab === id ? "bg-graphite text-white dark:bg-white dark:text-graphite" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-4">
        {tab === "referrals" ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[30rem_minmax(0,1fr)]">
            <section aria-label="Referral list" className={cn("min-w-0 overflow-hidden rounded-2xl border bg-card", openId && "hidden lg:block")}>
              <div className="space-y-2 border-b p-3">
                <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Filter">
                  {FILTERS.map(([id, label, key]) => (
                    <button key={id} type="button" role="radio" aria-checked={filter === id} onClick={() => setFilter(id)} className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.8rem] font-semibold whitespace-nowrap transition-colors", filter === id ? "bg-graphite text-white dark:bg-white dark:text-graphite" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                      {label}
                      {d ? <span className="text-[0.7rem] tabular-nums opacity-80">{d.totals[key]}</span> : null}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <label htmlFor="ar-search" className="sr-only">
                    Search referrals
                  </label>
                  <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <input id="ar-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} placeholder="Code, email or customer reference" className={cn(field, "h-10 ps-9")} />
                </div>
              </div>
              {list.error ? (
                <Failed error={list.error} retry={list.reload} />
              ) : !d ? (
                <div aria-busy="true" className="space-y-2 p-3">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
                  ))}
                </div>
              ) : d.referrals.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm">
                  <Users className="mx-auto size-6 text-muted-foreground" aria-hidden />
                  <p className="mt-2 font-semibold">{query || filter !== "all" ? "No referrals match" : "No referrals yet"}</p>
                  <p className="mt-1 text-muted-foreground">{query || filter !== "all" ? "Try another filter or search." : "Referrals appear when someone signs up with a customer's link or code."}</p>
                </div>
              ) : (
                <ul className="max-h-[40rem] divide-y overflow-y-auto">
                  {d.referrals.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => go({ referral: r.id })} aria-current={openId === r.id ? "true" : undefined} className={cn("block w-full px-4 py-3 text-start transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none", openId === r.id && "bg-primary/[0.06] dark:bg-primary/15")}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate font-semibold">{r.referee.name || r.referee.email}</span>
                          <Chip status={r.status} />
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          Referred by {r.referrer.name} · {r.code ?? "no code"} · {formatDateTime(r.attributedAt)}
                        </span>
                        {r.flags.length ? (
                          <span className="mt-1.5 flex flex-wrap gap-1">
                            {r.flags.map((f) => (
                              <span key={f} className="inline-flex items-center gap-1 rounded-md bg-soon-soft px-1.5 py-0.5 text-[0.7rem] font-semibold text-soon">
                                <Flag className="size-3" aria-hidden /> {FLAG_LABEL[f].label}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="Referral detail" className={cn("min-w-0 rounded-2xl border bg-card", !openId && "hidden lg:block")}>
              {openId ? (
                <ReferralDetail key={openId} id={openId} canManage={Boolean(d?.can.manage)} onBack={() => go({ referral: null })} onChanged={list.reload} />
              ) : (
                <div className="grid h-full min-h-64 place-items-center p-8 text-center text-sm text-muted-foreground">Select a referral to see its signals and history.</div>
              )}
            </section>
          </div>
        ) : tab === "rules" ? (
          <Rules canManage={Boolean(d?.can.manage)} />
        ) : tab === "program" ? (
          d ? <Program program={d.program} canManage={d.can.manage} onSaved={list.reload} /> : list.error ? <Failed error={list.error} retry={list.reload} /> : <div className="h-48 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
        ) : (
          <AuditHistory />
        )}
      </div>
    </div>
  );
}

function ReferralDetail({ id, canManage, onBack, onChanged }: { id: string; canManage: boolean; onBack: () => void; onChanged: () => void }) {
  const res = useJson<{ referral: Detail }>(`/api/admin/referrals/${id}`);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState<string>(REJECT_REASONS[0]);
  const [other, setOther] = React.useState("");
  const r = res.data?.referral;

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setStatus("");
    try {
      res.set(await api<{ referral: Detail }>(`/api/admin/referrals/${id}`, { method: "POST", body: JSON.stringify(body) }));
      setStatus(done);
      onChanged();
      return true;
    } catch (e) {
      setStatus(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (res.error) return <Failed error={res.error} retry={res.reload} />;
  if (!r)
    return (
      <div aria-busy="true" className="space-y-3 p-5">
        <div className="h-6 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-32 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      </div>
    );
  const rejectReason = reason === "Other" ? other.trim() : reason;

  return (
    <div className="p-4 sm:p-5">
      <button type="button" onClick={onBack} className={cn(quietBtn, "mb-3 lg:hidden")}>
        <ArrowLeft className="size-4" aria-hidden /> All referrals
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold">{r.referee.name || r.referee.email}</h2>
          <p className="text-sm text-muted-foreground">
            Signed up {formatDateTime(r.attributedAt)} via {r.via === "link" ? "referral link" : "entered code"}
          </p>
        </div>
        <Chip status={r.status} />
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Party title="Referred customer" p={r.referee} extra={r.verifiedAt ? `Email confirmed ${formatDateTime(r.verifiedAt)}` : "Email not confirmed"} />
        <Party title="Referrer" p={r.referrer} extra={`${r.referrer.totalReferrals} referral${r.referrer.totalReferrals === 1 ? "" : "s"} in total`} />
        <div className="rounded-xl border p-3 text-sm">
          <dt className="text-xs font-semibold text-muted-foreground">Code</dt>
          <dd className="mt-0.5 font-mono font-semibold">{r.code ?? "—"}</dd>
          <dd className="text-xs text-muted-foreground">{r.code ? (r.codeActive ? "Still active" : "Replaced by the customer") : ""}</dd>
        </div>
        <div className="rounded-xl border p-3 text-sm">
          <dt className="text-xs font-semibold text-muted-foreground">Reward policy</dt>
          <dd className="mt-0.5">{r.policy}</dd>
          {r.reviewedAt ? <dd className="text-xs text-muted-foreground">Last reviewed by {r.reviewedBy ?? "staff"}, {formatDateTime(r.reviewedAt)}</dd> : null}
        </div>
      </dl>

      <section aria-labelledby="signals-h" className="mt-5">
        <h3 id="signals-h" className="flex items-center gap-1.5 text-sm font-bold">
          <ShieldAlert className="size-4 text-muted-foreground" aria-hidden /> Review signals
        </h3>
        {r.flags.length ? (
          <ul className="mt-2 space-y-2">
            {r.flags.map((f) => (
              <li key={f} className="rounded-xl border border-soon/30 bg-soon-soft/40 p-3 text-sm">
                <p className="font-semibold">{FLAG_LABEL[f]?.label ?? f}</p>
                <p className="text-muted-foreground">{FLAG_LABEL[f]?.detail}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-ok" aria-hidden /> No signals found at sign-up.
          </p>
        )}
        {r.ineligibleReason ? (
          <p className="mt-2 text-sm">
            <span className="font-semibold">Rejection reason:</span> {r.ineligibleReason}
          </p>
        ) : null}
      </section>

      <section aria-label="Review actions" className="mt-5 flex flex-wrap gap-2 border-t pt-4">
        {canManage ? (
          <>
            {r.status === "signed_up" ? (
              <button type="button" disabled={busy} onClick={() => act({ action: "review" }, "Marked for review.")} className={quietBtn}>
                <ShieldAlert className="size-4" aria-hidden /> Mark for review
              </button>
            ) : null}
            {r.status === "signed_up" || r.status === "pending" ? (
              <button type="button" disabled={busy} onClick={() => setRejecting(true)} className={cn(quietBtn, "text-destructive")}>
                <Ban className="size-4" aria-hidden /> Reject
              </button>
            ) : null}
            {r.status === "pending" || r.status === "ineligible" ? (
              <button type="button" disabled={busy} onClick={() => act({ action: "restore" }, "Restored to signed up.")} className={quietBtn}>
                <RotateCcw className="size-4" aria-hidden /> Restore
              </button>
            ) : null}
            <button type="button" disabled aria-describedby="qualify-note" className={quietBtn}>
              <Lock className="size-4" aria-hidden /> Qualify
            </button>
            <p id="qualify-note" className="w-full text-xs text-muted-foreground">
              Qualifying is locked until reward rules and accounting controls are approved.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">You can view referrals. Reviewing them needs Referrals: Manage.</p>
        )}
        <p role="status" aria-live="polite" className="w-full text-sm">
          {status}
        </p>
      </section>

      <section aria-labelledby="events-h" className="mt-5">
        <h3 id="events-h" className="flex items-center gap-1.5 text-sm font-bold">
          <History className="size-4 text-muted-foreground" aria-hidden /> History
        </h3>
        <ol className="mt-2 space-y-2 border-s ps-4">
          {r.events.map((e, i) => (
            <li key={i} className="text-sm">
              <p className="font-medium">
                {EVENT_LABEL[e.type] ?? e.type}
                {typeof e.data.reason === "string" ? <span className="font-normal text-muted-foreground"> — {e.data.reason}</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {e.actor} · {formatDateTime(e.at)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <ConfirmDialog
        open={rejecting}
        onOpenChange={(o) => !busy && setRejecting(o)}
        title="Reject this referral?"
        tone="danger"
        icon={Ban}
        description="The referrer will see it as not eligible. You can restore it later. The reason is kept in the history."
        confirmLabel={busy ? "Rejecting…" : "Reject referral"}
        onConfirm={async () => {
          if (rejectReason.length < 4) return setStatus("Give a short reason (at least 4 characters).");
          if (await act({ action: "reject", reason: rejectReason }, "Referral rejected.")) setRejecting(false);
        }}
      >
        <div className="space-y-2">
          <label htmlFor="rej-reason" className="text-sm font-semibold">
            Reason
          </label>
          <SelectInput id="rej-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REJECT_REASONS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </SelectInput>
          {reason === "Other" ? <input aria-label="Describe the reason" value={other} onChange={(e) => setOther(e.target.value)} maxLength={300} className={cn(field, "h-10")} placeholder="Describe the reason" /> : null}
        </div>
      </ConfirmDialog>
    </div>
  );
}

function Party({ title, p, extra }: { title: string; p: { ref: string; name: string; email: string }; extra: string }) {
  return (
    <div className="min-w-0 rounded-xl border p-3 text-sm">
      <dt className="text-xs font-semibold text-muted-foreground">{title}</dt>
      <dd className="mt-0.5 truncate font-semibold">{p.name || "—"}</dd>
      <dd className="truncate text-muted-foreground">{p.email}</dd>
      <dd className="text-xs text-muted-foreground">
        {p.ref} · {extra}
      </dd>
    </div>
  );
}

const ruleSummary = (r: Rule) => {
  const amount = r.rewardType === "fixed" ? `${usd(r.fixedCents! / 100)} per referral` : `${(r.percentBp! / 100).toFixed(2).replace(/\.00$/, "")}% of qualifying spend${r.capCents ? `, up to ${usd(r.capCents / 100)}` : ""}`;
  return `${amount} · ${r.minOrders} order${r.minOrders === 1 ? "" : "s"} and ${usd(r.minSpendCents / 100)} spend within ${r.qualifyingDays} days · ${r.holdDays}-day hold${r.maxPerReferrer ? ` · max ${r.maxPerReferrer} per referrer` : ""}`;
};

function Rules({ canManage }: { canManage: boolean }) {
  const res = useJson<{ rules: Rule[] }>("/api/admin/referrals/rules");
  const [form, setForm] = React.useState({ rewardType: "fixed", amount: "", cap: "", minSpend: "0", minOrders: "1", qualifyingDays: "30", holdDays: "14", maxPerReferrer: "" });
  const [status, setStatus] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus("");
    const amount = num(form.amount);
    try {
      const body = {
        rewardType: form.rewardType,
        fixedCents: form.rewardType === "fixed" && amount != null ? Math.round(amount * 100) : null,
        percentBp: form.rewardType === "percent" && amount != null ? Math.round(amount * 100) : null,
        capCents: form.rewardType === "percent" && num(form.cap) != null ? Math.round(num(form.cap)! * 100) : null,
        minSpendCents: Math.round((num(form.minSpend) ?? 0) * 100),
        minOrders: num(form.minOrders),
        qualifyingDays: num(form.qualifyingDays),
        holdDays: num(form.holdDays),
        maxPerReferrer: num(form.maxPerReferrer),
      };
      const out = await api<{ rules: Rule[] }>("/api/admin/referrals/rules", { method: "POST", body: JSON.stringify(body) });
      res.set(out);
      setStatus("Draft saved. It doesn't apply to anyone.");
      setForm((f) => ({ ...f, amount: "", cap: "" }));
    } catch (err) {
      setStatus(message(err));
    } finally {
      setBusy(false);
    }
  };
  const retire = async (id: string) => {
    try {
      res.set(await api<{ rules: Rule[] }>(`/api/admin/referrals/rules/${id}`, { method: "POST", body: JSON.stringify({ action: "retire" }) }));
      setStatus("Draft retired.");
    } catch (err) {
      setStatus(message(err));
    }
  };
  const label = "mb-1 block text-xs font-semibold text-muted-foreground";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section aria-labelledby="rules-h" className="min-w-0 rounded-2xl border bg-card">
        <div className="border-b px-4 py-3.5">
          <h2 id="rules-h" className="font-bold">
            Draft reward rules
          </h2>
          <p className="text-sm text-muted-foreground">Drafts record proposed terms for approval. None is active, and activation is locked.</p>
        </div>
        {res.error ? (
          <Failed error={res.error} retry={res.reload} />
        ) : !res.data ? (
          <div className="m-4 h-24 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        ) : res.data.rules.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No drafts yet.</p>
        ) : (
          <ul className="divide-y">
            {res.data.rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    Version {r.version} <span className="ms-1 rounded-md bg-muted px-1.5 py-0.5 text-[0.7rem] font-semibold text-muted-foreground uppercase">{r.status}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{ruleSummary(r)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.createdBy ?? "Staff"} · {formatDateTime(r.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled title="Activation needs separate approval and accounting controls" className={quietBtn}>
                    <Lock className="size-4" aria-hidden /> Activate
                  </button>
                  {canManage && r.status === "draft" ? (
                    <button type="button" onClick={() => retire(r.id)} className={quietBtn}>
                      Retire
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="new-rule-h" className="min-w-0 rounded-2xl border bg-card p-4">
        <h2 id="new-rule-h" className="font-bold">
          New draft
        </h2>
        {!canManage ? (
          <p className="mt-1 text-sm text-muted-foreground">Drafting rules needs Referrals: Manage.</p>
        ) : (
          <form onSubmit={save} className="mt-3 space-y-3" noValidate>
            <div>
              <label htmlFor="rt" className={label}>
                Reward type
              </label>
              <SelectInput id="rt" value={form.rewardType} onChange={set("rewardType")}>
                <option value="fixed">Fixed amount</option>
                <option value="percent">Percent of spend</option>
              </SelectInput>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="ra" className={label}>
                  {form.rewardType === "fixed" ? "Amount (USD)" : "Percent"}
                </label>
                <input id="ra" inputMode="decimal" value={form.amount} onChange={set("amount")} className={cn(field, "h-10")} required />
              </div>
              {form.rewardType === "percent" ? (
                <div>
                  <label htmlFor="rc" className={label}>
                    Cap (USD, optional)
                  </label>
                  <input id="rc" inputMode="decimal" value={form.cap} onChange={set("cap")} className={cn(field, "h-10")} />
                </div>
              ) : null}
              <div>
                <label htmlFor="rs" className={label}>
                  Min. spend (USD)
                </label>
                <input id="rs" inputMode="decimal" value={form.minSpend} onChange={set("minSpend")} className={cn(field, "h-10")} />
              </div>
              <div>
                <label htmlFor="ro" className={label}>
                  Min. orders
                </label>
                <input id="ro" inputMode="numeric" value={form.minOrders} onChange={set("minOrders")} className={cn(field, "h-10")} />
              </div>
              <div>
                <label htmlFor="rq" className={label}>
                  Within (days)
                </label>
                <input id="rq" inputMode="numeric" value={form.qualifyingDays} onChange={set("qualifyingDays")} className={cn(field, "h-10")} />
              </div>
              <div>
                <label htmlFor="rh" className={label}>
                  Hold (days)
                </label>
                <input id="rh" inputMode="numeric" value={form.holdDays} onChange={set("holdDays")} className={cn(field, "h-10")} />
              </div>
              <div>
                <label htmlFor="rm" className={label}>
                  Max per referrer
                </label>
                <input id="rm" inputMode="numeric" value={form.maxPerReferrer} onChange={set("maxPerReferrer")} className={cn(field, "h-10")} placeholder="No limit" />
              </div>
            </div>
            <button type="submit" disabled={busy} className={cn(primaryBtn, "w-full")}>
              {busy ? "Saving…" : "Save draft"}
            </button>
            <p className="text-xs text-muted-foreground">Drafts are recorded in the audit log. They never credit wallets, change the ledger or appear to customers.</p>
          </form>
        )}
        <p role="status" aria-live="polite" className="mt-2 text-sm">
          {status}
        </p>
      </section>
    </div>
  );
}

function Program({ program, canManage, onSaved }: { program: ProgramSettings & { version: number }; canManage: boolean; onSaved: () => void }) {
  const { guard, dialog } = useReauth();
  const [value, setValue] = React.useState<ProgramSettings>({ attributionEnabled: program.attributionEnabled, sharingEnabled: program.sharingEnabled });
  const [status, setStatus] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const dirty = value.attributionEnabled !== program.attributionEnabled || value.sharingEnabled !== program.sharingEnabled;
  const save = async () => {
    setBusy(true);
    setStatus("");
    try {
      await guard(() => api("/api/admin/referrals/program", { method: "POST", body: JSON.stringify({ ...value, version: program.version }) }).then(() => undefined));
      setStatus("Program settings saved.");
      onSaved();
    } catch (e) {
      setStatus(message(e));
    } finally {
      setBusy(false);
    }
  };
  const rows: { key: keyof ProgramSettings; title: string; body: string }[] = [
    { key: "sharingEnabled", title: "Referral sharing", body: "Customers can see and copy their referral link and code." },
    { key: "attributionEnabled", title: "Sign-up attribution", body: "New sign-ups with a valid link or code are recorded as referrals." },
  ];
  return (
    <section aria-labelledby="program-h" className="max-w-3xl rounded-2xl border bg-card">
      <div className="border-b px-4 py-3.5">
        <h2 id="program-h" className="font-bold">
          Program settings
        </h2>
        <p className="text-sm text-muted-foreground">Changes need Referrals: Manage and a recent sign-in confirmation. Each change is audited.</p>
      </div>
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.key} className="flex items-start justify-between gap-4 px-4 py-3.5">
            <div className="min-w-0">
              <p id={`p-${r.key}`} className="font-semibold">
                {r.title}
              </p>
              <p className="text-sm text-muted-foreground">{r.body}</p>
            </div>
            <button type="button" role="switch" aria-checked={value[r.key]} aria-labelledby={`p-${r.key}`} disabled={!canManage || busy} onClick={() => setValue((v) => ({ ...v, [r.key]: !v[r.key] }))} className={cn("relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:opacity-50", value[r.key] ? "bg-primary" : "bg-muted-foreground/30")}>
              <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none", value[r.key] ? "translate-x-5.5" : "translate-x-0.5")} />
            </button>
          </li>
        ))}
        <li className="flex items-start justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="font-semibold">Rewards</p>
            <p className="text-sm text-muted-foreground">Locked off. Turning rewards on needs approved rules, eligibility and accounting controls, and a separate reviewed release.</p>
          </div>
          <span className="mt-1 inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 text-[0.72rem] font-semibold text-muted-foreground">
            <Lock className="size-3" aria-hidden /> Off
          </span>
        </li>
      </ul>
      <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3">
        <button type="button" onClick={save} disabled={!canManage || !dirty || busy} className={primaryBtn}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <p role="status" aria-live="polite" className="text-sm">
          {status}
        </p>
      </div>
      {dialog}
    </section>
  );
}

const AUDIT_LABEL: Record<string, string> = {
  "referral.attributed": "Referral recorded at sign-up",
  "referral.code_regenerated": "Customer replaced their code",
  "referral.marked_review": "Marked for review",
  "referral.rejected": "Referral rejected",
  "referral.restored": "Referral restored",
  "referral.policy_drafted": "Reward rule drafted",
  "referral.policy_retired": "Reward rule retired",
  "referral.program_saved": "Program settings changed",
};

function AuditHistory() {
  const res = useJson<{ entries: { id: string; action: string; actor: string; targetType: string; targetId: string | null; at: string }[] }>("/api/admin/referrals/audit");
  return (
    <section aria-labelledby="audit-h" className="rounded-2xl border bg-card">
      <div className="border-b px-4 py-3.5">
        <h2 id="audit-h" className="font-bold">
          Audit history
        </h2>
        <p className="text-sm text-muted-foreground">The latest 100 referral program actions, from the platform audit log.</p>
      </div>
      {res.error ? (
        <Failed error={res.error} retry={res.reload} />
      ) : !res.data ? (
        <div className="m-4 h-32 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      ) : res.data.entries.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <ul className="divide-y">
          {res.data.entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm">
              <span className="min-w-0 font-medium">{AUDIT_LABEL[e.action] ?? e.action}</span>
              <span className="text-xs text-muted-foreground">
                {e.actor} · {formatDateTime(e.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
