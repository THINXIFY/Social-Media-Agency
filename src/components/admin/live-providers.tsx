"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  KeyRound,
  Link2,
  Lock,
  PackageOpen,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ServerCog,
  Stethoscope,
  Trash2,
  X,
} from "lucide-react";
import { ConfirmDialog } from "@/components/dashboard/account-ui";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { formatDateTime } from "@/lib/i18n";
import { api, ApiError } from "@/lib/live-account";
import { cn } from "@/lib/utils";
import { Field, inputClass, Segmented, SelectInput, TextArea, TextInput } from "./form";
import { useReauth } from "./reauth";
import { Card } from "./ui";

/*
 * Live Fulfilment Providers (Phase 5F, DEMO_MODE off). Real provider records,
 * write-only credentials, service mappings and provider-fulfilment
 * preparation. The server enforces every rule: roles, re-authentication,
 * eligibility (trigger SV012), attempt safety (SV013) and the submission
 * switch, which is off in this phase.
 */

type State = "archived" | "not_connected" | "needs_credential" | "disabled" | "attention" | "ready";
interface ProviderRow {
  id: string;
  name: string;
  type: "api" | "manual";
  state: State;
  stateLabel: string;
  integration: string | null;
  credential: { configured: boolean; last4: string | null; setAt: string | null };
  mappings: { total: number; active: number };
  lastCheck: { ok: boolean; at: string; error: string | null } | null;
  archived: boolean;
}
interface ListResponse {
  providers: ProviderRow[];
  services?: { id: string; name: string; platform: string; gatesDone: number; gatesTotal: number }[];
  submissionsEnabled: boolean;
  can: { configure: boolean; manage: boolean; orders: boolean };
}
interface Mapping {
  providerId: string;
  serviceId: string;
  serviceName: string;
  platform: string;
  providerRef: string;
  priority: number;
  note: string;
  active: boolean;
  gates: { label: string; done: boolean }[];
  blockers: string[];
}
interface ProviderDetail {
  id: string;
  name: string;
  type: "api" | "manual";
  description: string;
  endpoint: string | null;
  authMethod: string | null;
  limitations: string;
  enabled: boolean;
  archived: boolean;
  state: State;
  stateLabel: string;
  stateDetail: string;
  integration: { name: string } | null;
  supplierReviewedAt: string | null;
  enableBlockers: string[];
  credential: { configured: boolean; last4: string | null; setAt: string | null };
  health: { ok: boolean; latencyMs: number | null; error: string | null; at: string }[];
  events: { id: string; type: string; message: string; ok: boolean; by: string; at: string }[];
  mappings: Mapping[];
}
interface QueueRow {
  reference: string;
  orderStatus: string;
  quantity: number;
  placedAt: string;
  service: string;
  platform: string;
  attempt: { status: string; label: string; provider: string | null } | null;
  mappings: { total: number; active: number };
}
interface Attempt {
  id: string;
  provider: string;
  providerServiceRef: string | null;
  providerOrderId: string | null;
  status: string;
  label: string;
  providerStatus: string | null;
  deliveredQty: number;
  error: string | null;
  resolution: string | null;
  preparedBy: string | null;
  submittedAt: string | null;
  lastPolledAt: string | null;
  createdAt: string;
}
interface FulfillmentOrder {
  reference: string;
  customerRef: string;
  service: string;
  platform: string;
  quantity: number;
  link: string | null;
  orderStatus: string;
  paymentStatus: string;
  mappings: { providerId: string; providerName: string; providerRef: string; active: boolean; blockers: string[] }[];
  attempts: Attempt[];
  canPrepare: boolean;
  prepareBlockers: string[];
  submission: { enabled: boolean; reason: string | null };
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

const message = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "That didn't work. Nothing was changed.");
const btn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";
const primaryBtn = cn(btn, "bg-primary text-primary-foreground hover:bg-primary/90");
const quietBtn = cn(btn, "border bg-card hover:bg-muted");
const dangerBtn = cn(btn, "border border-destructive/30 text-destructive hover:bg-destructive/5");

const STATE_STYLE: Record<State, { className: string; Icon: typeof CircleCheck }> = {
  ready: { className: "bg-ok-soft text-ok", Icon: CircleCheck },
  attention: { className: "bg-destructive/10 text-destructive", Icon: CircleAlert },
  disabled: { className: "bg-soon-soft text-soon", Icon: Lock },
  needs_credential: { className: "bg-soon-soft text-soon", Icon: KeyRound },
  not_connected: { className: "bg-muted text-muted-foreground", Icon: CircleDashed },
  archived: { className: "bg-off-soft text-off", Icon: Archive },
};

function StateChip({ state, label }: { state: State; label: string }) {
  const s = STATE_STYLE[state];
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[0.72rem] font-semibold whitespace-nowrap", s.className)}>
      <s.Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

const ATTEMPT_TONE: Record<string, string> = {
  queued: "bg-secondary text-secondary-foreground",
  submitted: "bg-primary/10 text-primary dark:text-[#c4b5ff]",
  in_progress: "bg-primary/10 text-primary dark:text-[#c4b5ff]",
  completed: "bg-ok-soft text-ok",
  partial: "bg-soon-soft text-soon",
  unknown: "bg-destructive/10 text-destructive",
  failed: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

function AttemptChip({ status, label }: { status: string; label: string }) {
  return <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[0.72rem] font-semibold whitespace-nowrap", ATTEMPT_TONE[status] ?? "bg-muted text-muted-foreground")}>{label}</span>;
}

function Alert({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "ok" }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl border px-3.5 py-2.5 text-sm", tone === "error" ? "border-destructive/30 bg-destructive/5" : "border-ok/30 bg-ok-soft text-ok")}>
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function LiveAdminProviders() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = params.get("tab") === "fulfillment" ? "fulfillment" : "providers";
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
  const [version, setVersion] = React.useState(0);
  const list = useJson<ListResponse>(`/api/admin/providers?include=services&v=${version}`);
  const d = list.data;

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header>
        <p className="text-[0.8rem] font-medium text-muted-foreground">Operations</p>
        <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Fulfillment providers</h1>
        <p className="mt-1 max-w-2xl text-[0.95rem] text-muted-foreground">Prepare providers, map catalog services to them and get approved orders ready for provider fulfilment. Nothing here moves money.</p>
      </header>

      <div role="note" className="mt-5 flex items-start gap-3 rounded-2xl border bg-card px-4 py-3.5 text-sm sm:items-center">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground" aria-hidden>
          <Lock className="size-4" />
        </span>
        <p className="min-w-0">
          <span className="font-semibold">Sending orders to providers is switched off.</span>{" "}
          <span className="text-muted-foreground">No provider integration is installed yet, so orders are fulfilled manually from </span>
          <Link href="/admin/orders" className="font-semibold text-primary hover:underline">
            Orders
          </Link>
          <span className="text-muted-foreground">.</span>
        </p>
      </div>

      <div className="mt-6">
        <Segmented
          name="prov-tab"
          label="Section"
          value={tab}
          options={[
            { value: "providers", label: "Providers" },
            { value: "fulfillment", label: "Fulfillment queue" },
          ]}
          onChange={(v) => router.replace(href({ tab: v === "providers" ? null : v, provider: null, order: null }), { scroll: false })}
        />
      </div>

      {tab === "providers" ? (
        <ProvidersTab list={list} href={href} onChanged={() => setVersion((v) => v + 1)} />
      ) : (
        <FulfillmentTab href={href} canAct={Boolean(d?.can.orders)} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Providers tab                                                             */
/* -------------------------------------------------------------------------- */

function ProvidersTab({ list, href, onChanged }: { list: ReturnType<typeof useJson<ListResponse>>; href: (p: Record<string, string | null>) => string; onChanged: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("provider");
  const [q, setQ] = React.useState("");
  const [show, setShow] = React.useState("active");
  const [adding, setAdding] = React.useState(false);
  const d = list.data;
  const rows = (d?.providers ?? []).filter((p) => (show === "archived" ? p.archived : show === "attention" ? p.state === "attention" || p.state === "needs_credential" : !p.archived)).filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <Card className="mt-4 overflow-hidden" aria-busy={list.loading || undefined}>
        <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="relative flex-1">
            <label htmlFor="prov-search" className="sr-only">
              Search providers
            </label>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input id="prov-search" type="search" value={q} maxLength={80} onChange={(e) => setQ(e.target.value)} placeholder="Search providers" className={cn(inputClass, "h-10 ps-9")} />
          </div>
          <SelectInput aria-label="Show" value={show} onChange={(e) => setShow(e.target.value)} className="h-10 sm:w-52">
            <option value="active">Current providers</option>
            <option value="attention">Needs attention</option>
            <option value="archived">Archived</option>
          </SelectInput>
          {d?.can.configure ? (
            <button type="button" onClick={() => setAdding(true)} className={cn(primaryBtn, "h-10")}>
              <Plus className="size-4" aria-hidden /> Add provider
            </button>
          ) : null}
        </div>

        {list.error ? (
          <div role="alert" className="flex flex-col items-center border-t px-6 py-12 text-center">
            <p className="font-semibold">Providers didn&apos;t load</p>
            <p className="mt-1 text-sm text-muted-foreground">{list.error}</p>
            <button type="button" onClick={list.reload} className={cn(quietBtn, "mt-4")}>
              <RotateCcw className="size-3.5" aria-hidden /> Try again
            </button>
          </div>
        ) : !d ? (
          <div className="space-y-2 border-t p-4 sm:p-5" aria-label="Loading providers">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center border-t px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary" aria-hidden>
              <ServerCog className="size-5" />
            </span>
            <p className="mt-4 font-heading text-lg font-bold">{d.providers.length ? "No providers match" : "No providers yet"}</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {d.providers.length ? "Try another search or filter." : "Add a provider to prepare its details and service mappings. New providers stay disabled and can't receive orders until an approved integration and a supplier review exist."}
            </p>
          </div>
        ) : (
          <table className="w-full border-t text-sm">
            <caption className="sr-only">Providers</caption>
            <thead className="hidden bg-muted/40 text-left text-[0.75rem] font-semibold text-muted-foreground md:table-header-group">
              <tr>
                <th scope="col" className="px-5 py-2.5">Provider</th>
                <th scope="col" className="px-3 py-2.5">Status</th>
                <th scope="col" className="px-3 py-2.5">Credential</th>
                <th scope="col" className="px-3 py-2.5">Mappings</th>
                <th scope="col" className="px-5 py-2.5">Last check</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((p) => (
                <tr key={p.id} className={cn("grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-3.5 transition-colors hover:bg-muted/40 md:table-row md:p-0", openId === p.id && "bg-secondary/30")}>
                  <td className="min-w-0 md:px-5 md:py-3.5">
                    <button type="button" onClick={() => router.push(href({ provider: p.id }), { scroll: false })} className="block max-w-full text-start font-semibold hover:text-primary focus-visible:underline focus-visible:outline-none">
                      <span className="block truncate">{p.name}</span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">{p.type === "api" ? "API provider" : "Manual supplier"} · {p.integration ?? "No integration"}</span>
                    </button>
                  </td>
                  <td className="justify-self-end md:px-3 md:py-3.5">
                    <StateChip state={p.state} label={p.stateLabel} />
                  </td>
                  <td className="text-xs text-muted-foreground md:px-3 md:py-3.5 md:text-sm">{p.credential.configured ? `Set ••••${p.credential.last4 ?? ""}` : "Not set"}</td>
                  <td className="justify-self-end text-xs text-muted-foreground md:justify-self-auto md:px-3 md:py-3.5 md:text-sm">
                    {p.mappings.active} active · {p.mappings.total} total
                  </td>
                  <td className="col-span-2 text-xs text-muted-foreground md:col-span-1 md:px-5 md:py-3.5">{p.lastCheck ? `${p.lastCheck.ok ? "Passed" : "Failed"} · ${formatDateTime(p.lastCheck.at)}` : "Never checked"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <ProviderForm open={adding} onClose={() => setAdding(false)} onSaved={(id) => (setAdding(false), onChanged(), router.push(href({ provider: id }), { scroll: false }))} />
      <ProviderDrawer key={openId ?? "none"} id={openId} list={d} onClose={() => router.push(href({ provider: null }), { scroll: false })} onChanged={onChanged} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Add / edit provider                                                       */
/* -------------------------------------------------------------------------- */

function ProviderForm({ open, initial, onClose, onSaved }: { open: boolean; initial?: ProviderDetail; onClose: () => void; onSaved: (id: string) => void }) {
  const [form, setForm] = React.useState({ name: initial?.name ?? "", type: initial?.type ?? "api", endpoint: initial?.endpoint ?? "", authMethod: initial?.authMethod ?? "api_key", description: initial?.description ?? "", limitations: initial?.limitations ?? "" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Same rules as the server, checked first so the message can be specific.
    if (form.endpoint.trim() && !/^https:\/\/\S+$/.test(form.endpoint.trim())) return setError("Use a full https:// address for the API, or leave it empty.");
    setBusy(true);
    setError(null);
    try {
      const body = JSON.stringify({ ...form, authMethod: form.authMethod || null });
      if (initial) {
        await api(`/api/admin/providers/${encodeURIComponent(initial.id)}`, { method: "PATCH", body });
        onSaved(initial.id);
      } else {
        const r = await api<{ id: string }>("/api/admin/providers", { method: "POST", body });
        onSaved(r.id);
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[34rem]">
        <form onSubmit={submit} className="flex flex-col gap-4 p-5 sm:p-6">
          <div>
            <SheetTitle className="font-heading text-xl font-extrabold">{initial ? "Edit provider" : "Add provider"}</SheetTitle>
            <SheetDescription className="mt-1 text-sm text-muted-foreground">{initial ? "Update the provider's details. Enabling and integrations aren't changed here." : "New providers are saved disabled and not connected. They can't receive orders."}</SheetDescription>
          </div>
          <Field id="pf-name" label="Name">
            <TextInput id="pf-name" value={form.name} onChange={set("name")} required minLength={2} maxLength={80} autoComplete="off" />
          </Field>
          <Field id="pf-type" label="Type">
            <SelectInput id="pf-type" value={form.type} onChange={set("type")} className="h-10">
              <option value="api">API provider</option>
              <option value="manual">Manual supplier</option>
            </SelectInput>
          </Field>
          <Field id="pf-endpoint" label="API address" optional help="Context only. Nothing is contacted until an approved integration is installed.">
            <TextInput id="pf-endpoint" value={form.endpoint} onChange={set("endpoint")} placeholder="https://" inputMode="url" maxLength={300} autoComplete="off" />
          </Field>
          <Field id="pf-auth" label="Authentication">
            <SelectInput id="pf-auth" value={form.authMethod ?? ""} onChange={set("authMethod")} className="h-10">
              <option value="api_key">API key</option>
              <option value="oauth">OAuth</option>
              <option value="basic">Username and password</option>
              <option value="none">None</option>
            </SelectInput>
          </Field>
          <Field id="pf-desc" label="Description" optional>
            <TextArea id="pf-desc" value={form.description} onChange={set("description")} rows={3} maxLength={500} />
          </Field>
          <Field id="pf-limits" label="Known limitations" optional>
            <TextArea id="pf-limits" value={form.limitations} onChange={set("limitations")} rows={2} maxLength={500} />
          </Field>
          {error ? <Alert>{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={quietBtn}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className={primaryBtn}>
              {busy ? "Saving…" : initial ? "Save changes" : "Add provider"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/*  Provider drawer                                                           */
/* -------------------------------------------------------------------------- */

function ProviderDrawer({ id, list, onClose, onChanged }: { id: string | null; list: ListResponse | undefined; onClose: () => void; onChanged: () => void }) {
  const detail = useJson<{ provider: ProviderDetail }>(id ? `/api/admin/providers/${encodeURIComponent(id)}` : null);
  const [fresh, setFresh] = React.useState<ProviderDetail | null>(null);
  const p = fresh ?? detail.data?.provider ?? null;
  const { guard, dialog } = useReauth();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [credOpen, setCredOpen] = React.useState(false);
  const [secret, setSecret] = React.useState("");
  const [confirm, setConfirm] = React.useState<null | { title: string; description: string; label: string; run: () => Promise<void> }>(null);
  const can = list?.can;

  const act = async (key: string, run: () => Promise<{ provider: ProviderDetail }>, ok: string) => {
    setBusy(key);
    setError(null);
    setDone(null);
    try {
      await guard(async () => {
        const r = await run();
        setFresh(r.provider);
        setDone(ok);
        onChanged();
      });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };
  const base = id ? `/api/admin/providers/${encodeURIComponent(id)}` : "";

  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[42rem]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-background/95 px-5 py-4 backdrop-blur sm:px-6">
          <div className="min-w-0">
            <SheetTitle className="truncate font-heading text-xl font-extrabold">{p?.name ?? "Provider"}</SheetTitle>
            <SheetDescription className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{p ? <StateChip state={p.state} label={p.stateLabel} /> : "Loading…"}</SheetDescription>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {detail.error && !p ? (
          <div className="p-6">
            <Alert>{detail.error}</Alert>
          </div>
        ) : !p ? (
          <div className="space-y-3 p-6" aria-label="Loading provider">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-6 p-5 sm:p-6">
            <p className="text-sm text-muted-foreground">{p.stateDetail}</p>
            {done ? <Alert tone="ok">{done}</Alert> : null}
            {error ? <Alert>{error}</Alert> : null}

            {!p.enabled && !p.archived ? (
              <section aria-labelledby="pd-blockers" className="rounded-2xl border border-dashed p-4">
                <h3 id="pd-blockers" className="text-sm font-bold">
                  Before this provider can receive orders
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  {p.enableBlockers.map((b) => (
                    <li key={b} className="flex gap-2">
                      <CircleDashed className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {b}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section aria-labelledby="pd-details">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 id="pd-details" className="text-sm font-bold">
                  Details
                </h3>
                {can?.configure && !p.archived ? (
                  <button type="button" onClick={() => setEditing(true)} className={cn(quietBtn, "h-8")}>
                    Edit
                  </button>
                ) : null}
              </div>
              <dl className="divide-y rounded-xl border text-sm">
                {[
                  ["Type", p.type === "api" ? "API provider" : "Manual supplier"],
                  ["Integration", p.integration?.name ?? "None installed"],
                  ["API address", p.endpoint ?? "—"],
                  ["Authentication", { api_key: "API key", oauth: "OAuth", basic: "Username and password", none: "None" }[p.authMethod ?? ""] ?? "—"],
                  ["Supplier review", p.supplierReviewedAt ? formatDateTime(p.supplierReviewedAt) : "Not recorded"],
                  ["Description", p.description || "—"],
                  ["Known limitations", p.limitations || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                    <dt className="shrink-0 text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 text-end font-medium break-words">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section aria-labelledby="pd-cred">
              <h3 id="pd-cred" className="mb-2 text-sm font-bold">
                API credential
              </h3>
              <div className="rounded-xl border p-3.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2">
                    <KeyRound className="size-4 text-muted-foreground" aria-hidden />
                    {p.credential.configured ? (
                      <span>
                        Set <span className="font-mono">••••{p.credential.last4}</span>
                        <span className="text-muted-foreground"> · {formatDateTime(p.credential.setAt!)}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </p>
                  {can?.configure && !p.archived ? (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setCredOpen((v) => !v)} className={cn(quietBtn, "h-8")} aria-expanded={credOpen}>
                        {p.credential.configured ? "Replace" : "Add credential"}
                      </button>
                      {p.credential.configured ? (
                        <button
                          type="button"
                          className={cn(dangerBtn, "h-8")}
                          onClick={() => setConfirm({ title: "Remove the credential?", description: "The stored credential is retired and can't be recovered. You can add a new one later.", label: "Remove credential", run: () => act("cred-del", () => api(`${base}/credential`, { method: "DELETE" }), "Credential removed.") })}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {credOpen ? (
                  <form
                    className="mt-3 flex flex-col gap-2 border-t pt-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act("cred", () => api(`${base}/credential`, { method: "PUT", body: JSON.stringify({ secret }) }), "Credential saved and encrypted.").then(() => {
                        setSecret("");
                        setCredOpen(false);
                      });
                    }}
                  >
                    <Field id="pd-secret" label="Credential" help="Encrypted on the server and never shown again. Only the last four characters are kept for reference.">
                      <TextInput id="pd-secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" spellCheck={false} minLength={8} maxLength={4000} required />
                    </Field>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => (setCredOpen(false), setSecret(""))} className={cn(quietBtn, "h-8")}>
                        Cancel
                      </button>
                      <button type="submit" disabled={busy === "cred"} className={cn(primaryBtn, "h-8")}>
                        {busy === "cred" ? "Saving…" : "Save credential"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            </section>

            <section aria-labelledby="pd-health">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 id="pd-health" className="text-sm font-bold">
                  Integration health
                </h3>
                {can?.configure && !p.archived ? (
                  <button type="button" disabled={busy === "health"} onClick={() => act("health", () => api(`${base}/health`, { method: "POST" }), "Health check recorded.")} className={cn(quietBtn, "h-8")}>
                    <Stethoscope className="size-3.5" aria-hidden /> {busy === "health" ? "Checking…" : "Run health check"}
                  </button>
                ) : null}
              </div>
              {p.health.length ? (
                <ul className="divide-y rounded-xl border text-sm">
                  {p.health.slice(0, 5).map((h) => (
                    <li key={h.at} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
                      <span className="flex min-w-0 items-start gap-2">
                        {h.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />}
                        <span className="min-w-0">
                          <span className="font-medium">{h.ok ? "Passed" : "Failed"}</span>
                          {h.error ? <span className="block text-xs text-muted-foreground">{h.error}</span> : null}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(h.at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed px-3.5 py-3 text-sm text-muted-foreground">No checks yet.</p>
              )}
            </section>

            <Mappings p={p} list={list} base={base} busy={busy} act={act} confirm={setConfirm} />

            <section aria-labelledby="pd-history">
              <h3 id="pd-history" className="mb-2 text-sm font-bold">
                History
              </h3>
              {p.events.length ? (
                <ol className="space-y-2.5 border-s ps-4 text-sm">
                  {p.events.map((e) => (
                    <li key={e.id} className="relative">
                      <span className={cn("absolute -start-[1.3rem] top-1.5 size-2 rounded-full ring-4 ring-background", e.ok ? "bg-primary" : "bg-destructive")} aria-hidden />
                      <p>{e.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.by} · {formatDateTime(e.at)}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
              )}
            </section>

            {can?.configure && !p.archived ? (
              <section aria-label="Archive" className="border-t pt-5">
                <button
                  type="button"
                  className={dangerBtn}
                  onClick={() => setConfirm({ title: `Archive ${p.name}?`, description: "It's kept for history but can't be used again. Its credential is retired and its mappings are switched off.", label: "Archive provider", run: () => act("archive", () => api(base, { method: "DELETE" }), "Provider archived.") })}
                >
                  <Archive className="size-4" aria-hidden /> Archive provider
                </button>
              </section>
            ) : null}
          </div>
        )}
        {p && editing ? <ProviderForm open initial={p} onClose={() => setEditing(false)} onSaved={() => (setEditing(false), setFresh(null), detail.reload(), onChanged())} /> : null}
        <ConfirmDialog
          open={Boolean(confirm)}
          onOpenChange={(o) => !o && setConfirm(null)}
          title={confirm?.title ?? ""}
          description={confirm?.description ?? ""}
          confirmLabel={confirm?.label}
          tone="danger"
          onConfirm={() => {
            const c = confirm;
            setConfirm(null);
            void c?.run();
          }}
        />
        {dialog}
      </SheetContent>
    </Sheet>
  );
}

function Mappings({
  p,
  list,
  base,
  busy,
  act,
  confirm,
}: {
  p: ProviderDetail;
  list: ListResponse | undefined;
  base: string;
  busy: string | null;
  act: (key: string, run: () => Promise<{ provider: ProviderDetail }>, ok: string) => Promise<void>;
  confirm: (c: { title: string; description: string; label: string; run: () => Promise<void> }) => void;
}) {
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState({ serviceId: "", providerRef: "", note: "" });
  const [refError, setRefError] = React.useState<string | null>(null);
  const can = list?.can;
  const mapped = new Set(p.mappings.map((m) => m.serviceId));
  const options = (list?.services ?? []).filter((s) => !mapped.has(s.id));
  return (
    <section aria-labelledby="pd-maps">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id="pd-maps" className="text-sm font-bold">
          Service mappings
        </h3>
        {can?.manage && !p.archived ? (
          <button type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding} className={cn(quietBtn, "h-8")}>
            <Link2 className="size-3.5" aria-hidden /> Map a service
          </button>
        ) : null}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">Mappings are saved inactive. One can be activated only when the service has all six eligibility checks recorded and this provider is enabled. A mapping never makes a service purchasable or changes its price.</p>
      {adding ? (
        <form
          className="mb-3 flex flex-col gap-3 rounded-xl border p-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^[A-Za-z0-9._:\/#-]{1,120}$/.test(form.providerRef.trim())) return setRefError("Use letters, numbers and . _ : / # - only, with no spaces.");
            setRefError(null);
            void act("map", () => api(`${base}/mappings`, { method: "POST", body: JSON.stringify(form) }), "Mapping saved (inactive).").then(() => {
              setAdding(false);
              setForm({ serviceId: "", providerRef: "", note: "" });
            });
          }}
        >
          <Field id="pm-service" label="Catalog service">
            <SelectInput id="pm-service" value={form.serviceId} onChange={(e) => setForm((f) => ({ ...f, serviceId: e.target.value }))} className="h-10">
              <option value="">Choose a service</option>
              {options.map((s) => (
                <option key={s.id} value={s.id}>
                  {`${s.platform} · ${s.name} (${s.gatesDone}/${s.gatesTotal} checks)`}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field id="pm-ref" label="Provider's service reference" help="The provider's own id for this service, from their catalog. Never a credential." error={refError}>
            <TextInput id="pm-ref" value={form.providerRef} onChange={(e) => setForm((f) => ({ ...f, providerRef: e.target.value }))} maxLength={120} required autoComplete="off" />
          </Field>
          <Field id="pm-note" label="Note" optional>
            <TextInput id="pm-note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} maxLength={300} />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className={cn(quietBtn, "h-8")}>
              Cancel
            </button>
            <button type="submit" disabled={!form.serviceId || !form.providerRef || busy === "map"} className={cn(primaryBtn, "h-8")}>
              {busy === "map" ? "Saving…" : "Save mapping"}
            </button>
          </div>
        </form>
      ) : null}
      {p.mappings.length ? (
        <ul className="divide-y rounded-xl border text-sm">
          {p.mappings.map((m) => {
            const done = m.gates.filter((g) => g.done).length;
            const path = `${base}/mappings/${encodeURIComponent(m.serviceId)}`;
            return (
              <li key={m.serviceId} className="px-3.5 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{m.serviceName}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.platform} · <span className="font-mono">{m.providerRef}</span>
                      {m.note ? ` · ${m.note}` : ""}
                    </p>
                  </div>
                  <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-[0.72rem] font-semibold", m.active ? "bg-ok-soft text-ok" : "bg-muted text-muted-foreground")}>{m.active ? "Active" : "Inactive"}</span>
                </div>
                <details className="group mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
                    Eligibility {done}/{m.gates.length} checks recorded
                  </summary>
                  <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                    {m.gates.map((g) => (
                      <li key={g.label} className="flex items-center gap-1.5">
                        {g.done ? <CircleCheck className="size-3.5 text-ok" aria-hidden /> : <CircleDashed className="size-3.5 text-muted-foreground" aria-hidden />}
                        <span className={g.done ? "" : "text-muted-foreground"}>{g.label}</span>
                      </li>
                    ))}
                  </ul>
                </details>
                {!p.archived && (can?.manage || can?.configure) ? (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {m.active ? (
                      can?.manage ? (
                        <button type="button" disabled={busy !== null} onClick={() => act(`off-${m.serviceId}`, () => api(path, { method: "PATCH", body: JSON.stringify({ active: false }) }), "Mapping switched off.")} className={cn(quietBtn, "h-8")}>
                          Switch off
                        </button>
                      ) : null
                    ) : can?.configure ? (
                      <button
                        type="button"
                        disabled={busy !== null || m.blockers.length > 0}
                        title={m.blockers.length ? `Can't activate yet: ${m.blockers.join("; ")}` : undefined}
                        onClick={() => act(`on-${m.serviceId}`, () => api(path, { method: "PATCH", body: JSON.stringify({ active: true }) }), "Mapping activated.")}
                        className={cn(quietBtn, "h-8")}
                      >
                        Activate
                      </button>
                    ) : null}
                    {can?.manage ? (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => confirm({ title: "Remove this mapping?", description: `${m.serviceName} will no longer be mapped to ${p.name}.`, label: "Remove mapping", run: () => act(`rm-${m.serviceId}`, () => api(path, { method: "DELETE" }), "Mapping removed.") })}
                        className={cn(dangerBtn, "h-8")}
                      >
                        <Trash2 className="size-3.5" aria-hidden /> Remove
                      </button>
                    ) : null}
                    {!m.active && m.blockers.length ? <p className="w-full text-xs text-muted-foreground">Can&apos;t activate yet: {m.blockers.slice(0, 3).join("; ")}{m.blockers.length > 3 ? "…" : ""}</p> : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed px-3.5 py-3 text-sm text-muted-foreground">No services mapped to this provider.</p>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Fulfilment queue                                                          */
/* -------------------------------------------------------------------------- */

const VIEWS: { value: "ready" | "active" | "attention" | "all"; label: string }[] = [
  { value: "ready", label: "Ready to prepare" },
  { value: "active", label: "With a provider" },
  { value: "attention", label: "Needs attention" },
  { value: "all", label: "All approved" },
];

function FulfillmentTab({ href, canAct }: { href: (p: Record<string, string | null>) => string; canAct: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const openRef = params.get("order");
  const [view, setView] = React.useState<"ready" | "active" | "attention" | "all">("ready");
  const [q, setQ] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [version, setVersion] = React.useState(0);
  React.useEffect(() => {
    const t = window.setTimeout(() => setQuery(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const lp = new URLSearchParams({ view, v: String(version) });
  if (query) lp.set("q", query);
  const list = useJson<{ items: QueueRow[] }>(`/api/admin/fulfillment?${lp}`);
  const items = list.data?.items;

  return (
    <>
      <Card className="mt-4 overflow-hidden" aria-busy={list.loading || undefined}>
        <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center">
          {/* Four choices don't fit a phone width side by side, so small screens get a select. */}
          <div className="hidden sm:block">
            <Segmented name="ful-view" label="Show" value={view} options={VIEWS} onChange={setView} />
          </div>
          <SelectInput aria-label="Show" value={view} onChange={(e) => setView(e.target.value as typeof view)} className="h-10 sm:hidden">
            {VIEWS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </SelectInput>
          <div className="relative flex-1">
            <label htmlFor="ful-search" className="sr-only">
              Search approved orders
            </label>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input id="ful-search" type="search" value={q} maxLength={80} onChange={(e) => setQ(e.target.value)} placeholder="Search by order or service" className={cn(inputClass, "h-10 ps-9")} />
          </div>
        </div>
        {list.error ? (
          <div role="alert" className="flex flex-col items-center border-t px-6 py-12 text-center">
            <p className="font-semibold">The queue didn&apos;t load</p>
            <p className="mt-1 text-sm text-muted-foreground">{list.error}</p>
            <button type="button" onClick={list.reload} className={cn(quietBtn, "mt-4")}>
              <RotateCcw className="size-3.5" aria-hidden /> Try again
            </button>
          </div>
        ) : !items ? (
          <div className="space-y-2 border-t p-4 sm:p-5" aria-label="Loading the queue">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center border-t px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary" aria-hidden>
              <PackageOpen className="size-5" />
            </span>
            <p className="mt-4 font-heading text-lg font-bold">{query ? "No orders match" : "Nothing here"}</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">Approved orders that are waiting to be fulfilled appear here. Approve orders from Orders first.</p>
          </div>
        ) : (
          <ul className="divide-y border-t" aria-label="Approved orders">
            {items.map((r) => (
              <li key={r.reference}>
                <button
                  type="button"
                  onClick={() => router.push(href({ order: r.reference }), { scroll: false })}
                  className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 text-start transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none sm:px-5 lg:grid-cols-[9.5rem_minmax(0,1.4fr)_7rem_minmax(0,1fr)_9rem]", openRef === r.reference && "bg-secondary/30")}
                >
                  <span className="font-mono text-[0.82rem] font-semibold">{r.reference}</span>
                  <span className="order-3 col-span-2 min-w-0 lg:order-none lg:col-span-1">
                    <span className="block truncate text-sm font-semibold">{r.service}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.platform} · {r.quantity.toLocaleString("en-US")}
                    </span>
                  </span>
                  <span className="hidden text-xs text-muted-foreground lg:block">{r.orderStatus === "queued" ? "Approved" : "In progress"}</span>
                  <span className="justify-self-end lg:justify-self-start">{r.attempt ? <AttemptChip status={r.attempt.status} label={r.attempt.label} /> : <span className="text-xs text-muted-foreground">Not prepared</span>}</span>
                  <span className="order-4 hidden text-xs text-muted-foreground lg:order-none lg:block">{r.mappings.active ? `${r.mappings.active} active mapping${r.mappings.active === 1 ? "" : "s"}` : r.mappings.total ? "Mapped, inactive" : "Not mapped"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <OrderDrawer key={openRef ?? "none"} reference={openRef} canAct={canAct} onClose={() => router.push(href({ order: null }), { scroll: false })} onChanged={() => setVersion((v) => v + 1)} />
    </>
  );
}

function OrderDrawer({ reference, canAct, onClose, onChanged }: { reference: string | null; canAct: boolean; onClose: () => void; onChanged: () => void }) {
  const detail = useJson<{ order: FulfillmentOrder }>(reference ? `/api/admin/fulfillment/${encodeURIComponent(reference)}` : null);
  const [fresh, setFresh] = React.useState<FulfillmentOrder | null>(null);
  const o = fresh ?? detail.data?.order ?? null;
  const { guard, dialog } = useReauth();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const [provider, setProvider] = React.useState("");
  const [cancelling, setCancelling] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [resolving, setResolving] = React.useState<string | null>(null);
  const [resolution, setResolution] = React.useState<{ kind: "not_submitted" | "found"; providerOrderId: string; note: string }>({ kind: "not_submitted", providerOrderId: "", note: "" });

  const act = async (action: string, body: object, ok: string) => {
    setBusy(action);
    setError(null);
    setDone(null);
    try {
      await guard(async () => {
        const r = await api<{ order: FulfillmentOrder }>(`/api/admin/fulfillment/${encodeURIComponent(reference!)}/${action}`, { method: "POST", body: JSON.stringify(body) });
        setFresh(r.order);
        setDone(ok);
        onChanged();
      });
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(null);
    }
  };
  const activeMappings = o?.mappings.filter((m) => m.active) ?? [];
  const chosen = provider || activeMappings[0]?.providerId || "";

  return (
    <Sheet open={Boolean(reference)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[40rem]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-background/95 px-5 py-4 backdrop-blur sm:px-6">
          <div className="min-w-0">
            <SheetTitle className="font-mono text-lg font-bold">{reference}</SheetTitle>
            <SheetDescription className="mt-0.5 truncate text-sm text-muted-foreground">{o ? `${o.platform} · ${o.service}` : "Loading…"}</SheetDescription>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {detail.error && !o ? (
          <div className="p-6">
            <Alert>{detail.error}</Alert>
          </div>
        ) : !o ? (
          <div className="space-y-3 p-6" aria-label="Loading order">
            {[0, 1].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-6 p-5 sm:p-6">
            {done ? <Alert tone="ok">{done}</Alert> : null}
            {error ? <Alert>{error}</Alert> : null}

            <section aria-labelledby="fo-order">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 id="fo-order" className="text-sm font-bold">
                  Order
                </h3>
                <Link href={`/admin/orders?order=${encodeURIComponent(o.reference)}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  Open in Orders <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              </div>
              <dl className="divide-y rounded-xl border text-sm">
                {[
                  ["Customer", o.customerRef],
                  ["Quantity", o.quantity.toLocaleString("en-US")],
                  ["Target", o.link ?? "—"],
                  ["Order status", o.orderStatus === "queued" ? "Approved, not started" : o.orderStatus.replace(/_/g, " ")],
                  ["Payment", o.paymentStatus === "charged" ? "Held for this order" : o.paymentStatus.replace(/_/g, " ")],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                    <dt className="shrink-0 text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 text-end font-medium break-words">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">Order status, payment and completion still change only through Orders. A provider reporting completion never completes the order on its own.</p>
            </section>

            <section aria-labelledby="fo-prepare">
              <h3 id="fo-prepare" className="mb-2 text-sm font-bold">
                Prepare for a provider
              </h3>
              {o.mappings.length ? (
                <fieldset className="space-y-2">
                  <legend className="sr-only">Provider</legend>
                  {o.mappings.map((m) => (
                    <label key={m.providerId} className={cn("flex items-start gap-3 rounded-xl border p-3 text-sm", m.active ? "cursor-pointer has-checked:border-primary/50 has-checked:bg-primary/[0.04]" : "opacity-70")}>
                      <input type="radio" name="fo-provider" value={m.providerId} disabled={!m.active || !canAct} checked={chosen === m.providerId} onChange={() => setProvider(m.providerId)} className="mt-1 accent-[#7047EB]" />
                      <span className="min-w-0">
                        <span className="block font-semibold">{m.providerName}</span>
                        <span className="block text-xs text-muted-foreground">
                          <span className="font-mono">{m.providerRef}</span> · {m.active ? "Active mapping" : `Inactive: ${m.blockers[0] ?? "not verified"}`}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
              {o.prepareBlockers.length ? (
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {o.prepareBlockers.map((b) => (
                    <li key={b} className="flex gap-2">
                      <CircleDashed className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {b}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={!canAct || !o.canPrepare || !chosen || busy !== null} onClick={() => act("prepare", { providerId: chosen }, "Prepared. Nothing was sent to the provider.")} className={primaryBtn}>
                  {busy === "prepare" ? "Preparing…" : "Prepare (not sent)"}
                </button>
                <button type="button" disabled className={quietBtn} title={o.submission.reason ?? undefined}>
                  <Send className="size-3.5" aria-hidden /> Send to provider
                </button>
              </div>
              {o.submission.reason ? <p className="mt-2 text-xs text-muted-foreground">{o.submission.reason}</p> : null}
            </section>

            <section aria-labelledby="fo-attempts">
              <h3 id="fo-attempts" className="mb-2 text-sm font-bold">
                Provider attempts
              </h3>
              {o.attempts.length ? (
                <ul className="space-y-2">
                  {o.attempts.map((a) => (
                    <li key={a.id} className="rounded-xl border p-3.5 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold">{a.provider}</p>
                          <p className="text-xs text-muted-foreground">
                            Prepared {formatDateTime(a.createdAt)}
                            {a.preparedBy ? ` by ${a.preparedBy}` : ""}
                            {a.providerOrderId ? ` · Provider order ${a.providerOrderId}` : ""}
                          </p>
                        </div>
                        <AttemptChip status={a.status} label={a.label} />
                      </div>
                      {a.deliveredQty ? <p className="mt-1.5 text-xs text-muted-foreground">Provider reports {a.deliveredQty.toLocaleString("en-US")} delivered{a.providerStatus ? ` (“${a.providerStatus}”)` : ""}.</p> : null}
                      {a.error ? <p className="mt-1.5 text-xs text-destructive">{a.error}</p> : null}
                      {a.resolution ? <p className="mt-1.5 text-xs text-muted-foreground">{a.resolution}</p> : null}
                      {canAct ? (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {a.status === "queued" ? (
                            <button type="button" onClick={() => (setCancelling(a.id), setReason(""))} className={cn(quietBtn, "h-8")}>
                              Cancel attempt
                            </button>
                          ) : null}
                          {["submitted", "in_progress", "unknown"].includes(a.status) ? (
                            <button type="button" disabled={busy !== null} onClick={() => act("reconcile", { attemptId: a.id }, "Checked with the provider.")} className={cn(quietBtn, "h-8")}>
                              <RefreshCw className="size-3.5" aria-hidden /> Check with provider
                            </button>
                          ) : null}
                          {a.status === "unknown" ? (
                            <button type="button" onClick={() => setResolving(a.id)} className={cn(quietBtn, "h-8")}>
                              Resolve
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      {cancelling === a.id ? (
                        <form
                          className="mt-3 flex flex-col gap-2 border-t pt-3"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void act("cancel", { attemptId: a.id, reason }, "Attempt cancelled.").then((ok) => ok && setCancelling(null));
                          }}
                        >
                          <Field id={`fc-${a.id}`} label="Reason">
                            <TextInput id={`fc-${a.id}`} value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={300} required />
                          </Field>
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setCancelling(null)} className={cn(quietBtn, "h-8")}>
                              Keep it
                            </button>
                            <button type="submit" disabled={busy !== null} className={cn(dangerBtn, "h-8")}>
                              Cancel attempt
                            </button>
                          </div>
                        </form>
                      ) : null}
                      {resolving === a.id ? (
                        <form
                          className="mt-3 flex flex-col gap-3 border-t pt-3"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const body = resolution.kind === "found" ? { resolution: "found", attemptId: a.id, providerOrderId: resolution.providerOrderId, note: resolution.note } : { resolution: "not_submitted", attemptId: a.id, note: resolution.note };
                            void act("resolve", body, "Attempt resolved.").then((ok) => ok && setResolving(null));
                          }}
                        >
                          <p className="text-xs text-muted-foreground">Check the provider&apos;s own dashboard first. Choosing the wrong option could lead to a duplicate order.</p>
                          <Segmented
                            name={`fr-${a.id}`}
                            label="What did you find?"
                            value={resolution.kind}
                            options={[
                              { value: "not_submitted", label: "Not received" },
                              { value: "found", label: "Found at provider" },
                            ]}
                            onChange={(kind) => setResolution((r) => ({ ...r, kind }))}
                          />
                          {resolution.kind === "found" ? (
                            <Field id={`fro-${a.id}`} label="Provider order id">
                              <TextInput id={`fro-${a.id}`} value={resolution.providerOrderId} onChange={(e) => setResolution((r) => ({ ...r, providerOrderId: e.target.value }))} maxLength={120} required autoComplete="off" />
                            </Field>
                          ) : null}
                          <Field id={`frn-${a.id}`} label="How you confirmed it">
                            <TextArea id={`frn-${a.id}`} value={resolution.note} onChange={(e) => setResolution((r) => ({ ...r, note: e.target.value }))} rows={2} minLength={10} maxLength={300} required />
                          </Field>
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setResolving(null)} className={cn(quietBtn, "h-8")}>
                              Cancel
                            </button>
                            <button type="submit" disabled={busy !== null} className={cn(primaryBtn, "h-8")}>
                              Save resolution
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed px-3.5 py-3 text-sm text-muted-foreground">No provider attempts for this order.</p>
              )}
            </section>
          </div>
        )}
        {dialog}
      </SheetContent>
    </Sheet>
  );
}
