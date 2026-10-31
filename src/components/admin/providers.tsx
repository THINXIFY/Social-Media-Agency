"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import {
  Archive,
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Ellipsis,
  Link2,
  Lock,
  Pencil,
  Plug,
  Plus,
  Power,
  RotateCcw,
  Search,
  SearchX,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { ConfirmDialog, Switch } from "@/components/dashboard/account-ui";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  AUTH_LABEL,
  type AuthMethod,
  blankProvider,
  compatibilityNote,
  endpointError,
  isConfigured,
  issuesOf,
  type Mapping,
  mappingState,
  nextStepOf,
  patchProvider,
  type Provider,
  type ProviderIssue,
  providerIdFrom,
  type ProviderStatus,
  type ProviderType,
  refError,
  removeMapping,
  resetProviders,
  saveProvider,
  secretError,
  type Section,
  serviceEligibility,
  setMapping,
  statusOf,
  STATUS_META,
  TYPE_LABEL,
  useProviders,
  useProvidersChanged,
} from "@/lib/admin-providers";
import { type ServiceRecord, useServiceRecords } from "@/lib/admin-services";
import { CATEGORY_META, PLATFORM_BY_ID, PLATFORMS } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { describe, Field, Segmented, SelectInput, TextArea, TextInput } from "./form";
import { AdminDemoTag, linkButton } from "./ui";
import { popupSurface, menuPopup, menuItem as sharedMenuItem, menuSeparator } from "./menu";

/* -------------------------------------------------------------------------- */
/*  Filters (URL)                                                             */
/* -------------------------------------------------------------------------- */

type VerifyFilter = "" | "pending" | "reviewed";
type Sort = "name" | "updated" | "mappings";
interface Filters {
  q: string;
  status: "" | ProviderStatus;
  type: "" | ProviderType;
  verify: VerifyFilter;
  sort: Sort;
  view: "active" | "archived";
  page: number;
}
const DEFAULTS: Filters = { q: "", status: "", type: "", verify: "", sort: "name", view: "active", page: 1 };
const PAGE_SIZE = 10;
const STATUSES = Object.keys(STATUS_META) as ProviderStatus[];
const VERIFY_LABEL: Record<Exclude<VerifyFilter, "">, string> = { pending: "Supplier review pending", reviewed: "Supplier reviewed" };
const SORT_LABEL: Record<Sort, string> = { name: "Name", updated: "Recently updated", mappings: "Most mapped services" };

function parseFilters(p: URLSearchParams): Filters {
  const pick = <T extends string>(k: string, allowed: readonly T[], d: T) => {
    const v = p.get(k) as T | null;
    return v && allowed.includes(v) ? v : d;
  };
  return {
    q: (p.get("q") ?? "").slice(0, 80),
    status: pick("status", STATUSES, "" as const),
    type: pick("type", ["manual", "api"] as const, ""),
    verify: pick("verify", ["pending", "reviewed"] as const, ""),
    sort: pick("sort", ["name", "updated", "mappings"] as const, "name"),
    view: pick("view", ["active", "archived"] as const, "active"),
    page: Math.max(1, Number(p.get("page")) || 1),
  };
}

function toQuery(f: Filters, provider: string | null) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== DEFAULTS[k as keyof Filters]) q.set(k, String(v));
  if (provider) q.set("provider", provider);
  return q.toString();
}

type EditorState = { mode: "new" | "edit"; provider: Provider; section?: Section } | null;

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function AdminProviders() {
  const params = useSearchParams();
  const pathname = usePathname();
  const providers = useProviders();
  const records = useServiceRecords();
  const recordById = React.useMemo(() => Object.fromEntries(records.map((r) => [r.id, r])), [records]);

  const [f, setF] = React.useState<Filters>(() => parseFilters(params));
  const providerParam = params.get("provider");
  const openId = providerParam && providers.some((p) => p.id === providerParam) ? providerParam : null;
  const pushed = React.useRef(false);
  const written = React.useRef(toQuery(f, null));
  const [editor, setEditor] = React.useState<EditorState>(null);
  const [resetAsk, setResetAsk] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const changed = useProvidersChanged();

  const urlKey = toQuery(parseFilters(params), null);
  React.useEffect(() => {
    if (urlKey !== written.current) {
      written.current = urlKey;
      setF(parseFilters(new URLSearchParams(urlKey)));
    }
  }, [urlKey]);

  React.useEffect(() => {
    if (pathname !== "/admin/providers") return;
    written.current = toQuery(f, null);
    const qs = toQuery(f, new URLSearchParams(location.search).get("provider"));
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
  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((cur) => (cur === msg ? null : cur)), 4000);
  };

  const update = (patch: Partial<Filters>) => setF((cur) => ({ ...cur, ...patch, page: patch.page ?? 1 }));

  const active = providers.filter((p) => !p.archived);
  const serviceName = (id: string) => recordById[id]?.name ?? id;
  const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = providers
    .filter((p) => (f.view === "archived" ? p.archived : !p.archived))
    .filter((p) => {
      if (f.status && statusOf(p) !== f.status) return false;
      if (f.type && p.type !== f.type) return false;
      if (f.verify && p.supplierReviewed !== (f.verify === "reviewed")) return false;
      if (!terms.length) return true;
      const hay = [p.name, p.id, p.description, ...p.mappings.flatMap((m) => [m.serviceId, serviceName(m.serviceId), m.ref])].join(" ").toLowerCase();
      return terms.every((t) => hay.includes(t));
    })
    .sort((a, b) => (f.sort === "updated" ? b.updatedAt.localeCompare(a.updatedAt) : f.sort === "mappings" ? b.mappings.length - a.mappings.length || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)));
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const rows = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const withIssues = active.map((p) => ({ p, issues: issuesOf(p, providers, recordById) })).filter((x) => x.issues.length);
  const mappedServices = new Set(active.flatMap((p) => p.mappings.map((m) => m.serviceId))).size;

  const chips: { key: string; label: string; clear: Partial<Filters> }[] = [];
  if (f.status) chips.push({ key: "status", label: STATUS_META[f.status].label, clear: { status: "" } });
  if (f.type) chips.push({ key: "type", label: TYPE_LABEL[f.type], clear: { type: "" } });
  if (f.verify) chips.push({ key: "verify", label: VERIFY_LABEL[f.verify], clear: { verify: "" } });
  if (f.sort !== DEFAULTS.sort) chips.push({ key: "sort", label: `Sort: ${SORT_LABEL[f.sort]}`, clear: { sort: DEFAULTS.sort } });

  const configure = (p: Provider, section?: Section) => setEditor({ mode: "edit", provider: p, section });
  const details = openId ? providers.find((p) => p.id === openId) ?? null : null;

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[0.8rem] font-medium text-muted-foreground">
            Operations <AdminDemoTag>Admin demo</AdminDemoTag>
          </p>
          <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Fulfillment Providers</h1>
          <p className="mt-1 max-w-xl text-[0.95rem] text-muted-foreground">Manage fulfillment partners, service connections and delivery operations in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {changed ? (
            <button type="button" onClick={() => setResetAsk(true)} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
              <RotateCcw className="size-4" aria-hidden /> Reset provider demo
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setEditor({ mode: "new", provider: blankProvider() })}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold whitespace-nowrap text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none"
          >
            <Plus className="size-4" aria-hidden /> Add provider
          </button>
        </div>
      </header>

      {notice ? (
        <p role="status" className="mt-4 flex items-center gap-2 rounded-xl border border-ok/30 bg-ok-soft/50 px-4 py-2.5 text-sm font-medium">
          <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden /> {notice}
        </p>
      ) : null}

      {/* Summary */}
      <div className="mt-6 overflow-hidden rounded-2xl border bg-card">
        <div role="group" aria-label="Provider summary" className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
          <SummaryTile label="Total providers" value={active.length} hint={`${active.filter((p) => p.demo).length} simulated samples`} on={!f.status && !f.verify && f.view === "active"} onClick={() => update({ status: "", verify: "", type: "", view: "active" })} />
          <SummaryTile label="Connected" value={0} hint="Needs a verified backend connection" />
          <SummaryTile label="Needs attention" value={withIssues.length} hint="Setup, review or mapping issues" tone={withIssues.length ? "destructive" : undefined} />
          <SummaryTile label="Mapped services" value={mappedServices} hint="Across active providers" />
        </div>
        <p className="border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          Mappings never change prices, catalog visibility or checkout. No provider receives orders in this demo.
        </p>
      </div>

      {/* Provider issues */}
      {withIssues.length ? (
        <section aria-labelledby="prov-issues-title" className="mt-6 overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-center gap-2.5 px-4 py-3 sm:px-5">
            <span className="grid h-6 min-w-6 place-items-center rounded-full bg-destructive px-1.5 text-xs font-bold text-white tabular-nums">{withIssues.length}</span>
            <div className="min-w-0">
              <h2 id="prov-issues-title" className="text-[0.95rem] font-bold">
                Needs attention
              </h2>
              <p className="text-xs text-muted-foreground">Incomplete setup, pending supplier reviews and mapping problems.</p>
            </div>
          </div>
          <ul className="divide-y border-t">
            {withIssues.map(({ p, issues }) => (
              <li key={p.id} className="flex items-start gap-3 px-4 py-3 sm:items-center sm:px-5">
                <ProviderIcon p={p} />
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {p.name} <span className="font-mono text-xs font-normal text-muted-foreground">{p.id}</span>
                    </p>
                    <p className="mt-0.5 text-[0.82rem]">
                      <span className="font-semibold text-destructive">{issues[0].title}</span>
                      <span className="text-muted-foreground"> — {issues[0].detail}</span>
                      {issues.length > 1 ? <span className="text-muted-foreground"> · +{issues.length - 1} more</span> : null}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => configure(p, issues[0].section)}
                    aria-label={`${issues[0].action}: ${p.name}`}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-full bg-primary px-4 text-[0.82rem] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none sm:self-auto"
                  >
                    {issues[0].action} <ArrowRight className="size-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Directory */}
      <section aria-labelledby="prov-list-title" className="mt-6 overflow-hidden rounded-2xl border bg-card">
        <h2 id="prov-list-title" className="sr-only">
          Provider directory
        </h2>
        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <label htmlFor="prov-search" className="sr-only">
                Search providers
              </label>
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                id="prov-search"
                type="search"
                value={f.q}
                onChange={(e) => update({ q: e.target.value })}
                placeholder="Provider name, ID or mapped service"
                autoComplete="off"
                className="h-11 w-full rounded-xl border bg-background ps-9 pe-9 text-[0.95rem] transition-colors outline-none hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 lg:h-10 lg:text-sm dark:bg-muted/30 [&::-webkit-search-cancel-button]:hidden"
              />
              {f.q ? (
                <button type="button" onClick={() => update({ q: "" })} aria-label="Clear search" className="absolute end-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
              <Filter id="prov-status" label="Connection status" value={f.status} onChange={(v) => update({ status: v as Filters["status"] })}>
                <option value="">Any status</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </Filter>
              <Filter id="prov-type" label="Provider type" value={f.type} onChange={(v) => update({ type: v as Filters["type"] })}>
                <option value="">Any type</option>
                <option value="api">API</option>
                <option value="manual">Manual</option>
              </Filter>
              <Filter id="prov-verify" label="Verification" value={f.verify} onChange={(v) => update({ verify: v as VerifyFilter })}>
                <option value="">Any verification</option>
                <option value="pending">{VERIFY_LABEL.pending}</option>
                <option value="reviewed">{VERIFY_LABEL.reviewed}</option>
              </Filter>
              <SortMenu f={f} update={update} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-h-7 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <p aria-live="polite" className="me-1.5 font-medium">
                {matches.length} provider{matches.length === 1 ? "" : "s"}
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
                <button type="button" onClick={() => update({ ...DEFAULTS, view: f.view })} className="ms-0.5 font-semibold text-primary hover:underline">
                  Clear all
                </button>
              ) : null}
            </div>
            <div className="inline-flex shrink-0 gap-1 rounded-xl bg-muted p-1" role="group" aria-label="Show">
              {(["active", "archived"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={f.view === v}
                  onClick={() => update({ view: v })}
                  className={cn(
                    "h-8 rounded-lg px-3 text-[0.82rem] font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                    f.view === v && "bg-card text-foreground shadow-sm",
                  )}
                >
                  {v === "active" ? "Active" : "Archived"} <span className="text-xs tabular-nums">{providers.filter((p) => (v === "archived" ? p.archived : !p.archived)).length}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {rows.length ? (
          <>
            <div className="hidden xl:block">
              <table className="w-full table-fixed text-sm">
                <caption className="sr-only">Providers</caption>
                <thead className="border-y bg-muted/40 text-[0.68rem] tracking-wider text-muted-foreground uppercase">
                  <tr>
                    <th scope="col" className="py-2.5 ps-5 text-start font-bold">Provider</th>
                    <th scope="col" className="w-20 px-3 py-2.5 text-start font-bold">Type</th>
                    <th scope="col" className="w-48 px-3 py-2.5 text-start font-bold">Connection</th>
                    <th scope="col" className="w-48 px-3 py-2.5 text-start font-bold">Verification</th>
                    <th scope="col" className="w-24 px-3 py-2.5 text-end font-bold">Mapped</th>
                    <th scope="col" className="w-28 px-3 py-2.5 text-start font-bold">Last check</th>
                    <th scope="col" className="w-32 py-2.5 pe-5 text-end font-bold">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((p) => (
                    <tr key={p.id} onClick={() => open(p.id)} className={cn("group/row cursor-pointer transition-colors hover:bg-muted/40", openId === p.id && "bg-secondary/30 hover:bg-secondary/40")}>
                      <td className="py-3 ps-5">
                        <div className="flex items-center gap-3">
                          <ProviderIcon p={p} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="truncate font-semibold group-hover/row:text-primary">{p.name}</span>
                              {p.demo ? <SimTag /> : null}
                            </span>
                            <span className="block truncate font-mono text-xs text-muted-foreground">{p.id}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-medium">{TYPE_LABEL[p.type]}</td>
                      <td className="px-3 py-3">
                        <StatusDot status={statusOf(p)} />
                      </td>
                      <td className="px-3 py-3">
                        <VerifyText p={p} />
                      </td>
                      <td className="px-3 py-3 text-end font-semibold tabular-nums">{p.mappings.length}</td>
                      <td className="px-3 py-3 text-muted-foreground">Never</td>
                      <td className="py-3 pe-5 text-end">
                        <RowAction p={p} providers={providers} records={recordById} onView={() => open(p.id)} onConfigure={(s) => configure(p, s)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y border-t xl:hidden" aria-label="Providers">
              {rows.map((p) => (
                <li key={p.id} className={cn("relative px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5", openId === p.id && "bg-secondary/30")}>
                  <button type="button" onClick={() => open(p.id)} className="absolute inset-0 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none focus-visible:ring-inset" aria-label={`View ${p.name}`} />
                  <div className="pointer-events-none relative flex items-start gap-3">
                    <ProviderIcon p={p} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 text-[0.95rem] leading-snug font-semibold">
                        {p.name}
                        {p.demo ? <SimTag /> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{p.id}</span> · {TYPE_LABEL[p.type]} · {p.mappings.length} mapped
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <StatusDot status={statusOf(p)} />
                        <VerifyText p={p} compact />
                      </div>
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
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
              {f.view === "archived" ? <Archive className="size-6" aria-hidden /> : <SearchX className="size-6" aria-hidden />}
            </span>
            <p className="mt-4 font-semibold">{f.view === "archived" && !f.q && !chips.length ? "No archived providers" : providers.length ? "No providers match" : "No providers yet"}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {f.view === "archived" ? "Archived providers appear here and can be restored." : "Search works on provider name, ID and mapped services."}
            </p>
            {chips.length || f.q ? (
              <button type="button" onClick={() => update({ ...DEFAULTS, view: f.view })} className={cn(linkButton, "mt-3 border bg-card")}>
                Clear all
              </button>
            ) : null}
          </div>
        )}
      </section>

      <DetailsDrawer provider={details} providers={providers} records={recordById} onClose={close} onConfigure={configure} onNotice={flash} />

      <ProviderEditor
        state={editor}
        providers={providers}
        records={recordById}
        onClose={() => setEditor(null)}
        onSaved={(p, kind, isNew) => {
          setEditor(null);
          flash(kind === "draft" ? `${p.name} saved as a draft.` : isNew ? `${p.name} added.` : `${p.name} saved.`);
        }}
      />

      <ConfirmDialog
        open={resetAsk}
        onOpenChange={setResetAsk}
        title="Reset provider demo data?"
        description="Restores the three sample providers and removes every provider and mapping added in this browser. Services, orders and payments aren't affected."
        confirmLabel="Reset providers"
        tone="danger"
        icon={RotateCcw}
        onConfirm={() => {
          resetProviders();
          flash("Provider demo data reset.");
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small pieces                                                              */
/* -------------------------------------------------------------------------- */

function SummaryTile({ label, value, hint, tone, on, onClick }: { label: string; value: number; hint: string; tone?: "destructive"; on?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span className={cn("flex items-center gap-1.5 text-[0.8rem] font-medium text-muted-foreground", tone && "font-semibold text-destructive")}>
        {tone ? <span className="size-1.5 rounded-full bg-destructive" aria-hidden /> : null}
        {label}
      </span>
      <span className="font-heading text-[1.6rem] leading-none font-extrabold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </>
  );
  const cls = "flex flex-col items-start gap-1 bg-card px-4 py-3.5 text-start sm:px-5";
  return onClick ? (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(cls, "transition-colors hover:bg-muted/50 focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none", on && "bg-secondary/50 shadow-[inset_0_-2px_0_var(--primary)] dark:bg-secondary/25")}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function ProviderIcon({ p }: { p: Provider }) {
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", p.type === "api" ? "bg-secondary text-secondary-foreground" : "bg-muted text-foreground/70")} aria-hidden>
      {p.type === "api" ? <Plug className="size-4" /> : <Pencil className="size-4" />}
    </span>
  );
}

function SimTag() {
  return <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-dashed px-1.5 text-[0.62rem] font-bold tracking-wide text-muted-foreground uppercase">Simulated</span>;
}

function StatusDot({ status, className }: { status: ProviderStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[0.85rem] font-medium whitespace-nowrap", status === "disabled" && "text-muted-foreground", className)} title={STATUS_META[status].explain}>
      <span className={cn("size-2 shrink-0 rounded-full", STATUS_META[status].dot)} aria-hidden />
      {STATUS_META[status].label}
    </span>
  );
}

function VerifyText({ p, compact }: { p: Provider; compact?: boolean }) {
  return p.supplierReviewed ? (
    <span className={cn("text-[0.82rem]", compact && "text-xs")}>
      <span className="inline-flex items-center gap-1 font-medium">
        <Check className="size-3.5 text-ok" aria-hidden /> Supplier reviewed
      </span>
      {!compact ? <span className="block text-xs text-muted-foreground">Connection not verified</span> : null}
    </span>
  ) : (
    <span className={cn("inline-flex items-center gap-1 text-[0.82rem] font-medium text-soon", compact && "text-xs")}>
      <CircleAlert className="size-3.5" aria-hidden /> Supplier review pending
    </span>
  );
}

function RowAction({ p, providers, records, onView, onConfigure }: { p: Provider; providers: Provider[]; records: Record<string, ServiceRecord>; onView: () => void; onConfigure: (s?: Section) => void }) {
  const next = nextStepOf(p, providers, records);
  const cls = "inline-flex h-9 shrink-0 items-center gap-0.5 rounded-full px-3.5 text-[0.82rem] font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";
  return next && !p.archived ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onConfigure(next.section);
      }}
      aria-label={`Configure ${p.name}`}
      className={cn(cls, "bg-primary text-primary-foreground hover:bg-primary/90")}
    >
      Configure <ChevronRight className="size-4" aria-hidden />
    </button>
  ) : (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onView();
      }}
      aria-label={`View ${p.name}`}
      className={cn(cls, "text-primary hover:bg-secondary")}
    >
      View <ChevronRight className="size-4" aria-hidden />
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

function SortMenu({ f, update }: { f: Filters; update: (patch: Partial<Filters>) => void }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          "inline-flex h-11 items-center justify-center gap-2 rounded-xl border bg-background px-3.5 text-sm font-semibold whitespace-nowrap transition-colors hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-primary/15 focus-visible:outline-none data-popup-open:border-primary/50 lg:h-10 dark:bg-muted/30",
          f.sort !== DEFAULTS.sort && "border-primary/50 bg-secondary/40 dark:bg-secondary/20",
        )}
      >
        <SlidersHorizontal className="size-4" aria-hidden /> Sort
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <Popover.Popup className={cn(popupClass, "w-[min(18rem,calc(100vw-1.5rem))] space-y-2 p-4")}>
            <Popover.Title className="text-sm font-bold">Sort providers</Popover.Title>
            <div className="relative">
              <Filter id="prov-sort" label="Sort" value={f.sort} onChange={(v) => update({ sort: v as Sort })} plain>
                {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABEL[s]}
                  </option>
                ))}
              </Filter>
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

const Missing = ({ children = "Not set" }: { children?: React.ReactNode }) => <span className="font-normal text-muted-foreground italic">{children}</span>;
const menuItem = sharedMenuItem;

/* -------------------------------------------------------------------------- */
/*  Details drawer                                                            */
/* -------------------------------------------------------------------------- */

function DetailsDrawer({
  provider,
  providers,
  records,
  onClose,
  onConfigure,
  onNotice,
}: {
  provider: Provider | null;
  providers: Provider[];
  records: Record<string, ServiceRecord>;
  onClose: () => void;
  onConfigure: (p: Provider, s?: Section) => void;
  onNotice: (msg: string) => void;
}) {
  const [shown, setShown] = React.useState(provider);
  if (provider && provider !== shown) setShown(provider);
  const p = provider ?? shown;
  return (
    <Sheet open={Boolean(provider)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[38rem]">
        {p ? <DetailsBody key={p.id} p={p} providers={providers} records={records} onClose={onClose} onConfigure={onConfigure} onNotice={onNotice} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailsBody({
  p,
  providers,
  records,
  onClose,
  onConfigure,
  onNotice,
}: {
  p: Provider;
  providers: Provider[];
  records: Record<string, ServiceRecord>;
  onClose: () => void;
  onConfigure: (p: Provider, s?: Section) => void;
  onNotice: (msg: string) => void;
}) {
  const status = statusOf(p);
  const issues = issuesOf(p, providers, records);
  const next = nextStepOf(p, providers, records);
  const [ask, setAsk] = React.useState<"disable" | "enable" | "archive" | "restore" | "test" | null>(null);
  const fallback = p.fallbackId ? providers.find((x) => x.id === p.fallbackId) : null;

  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 py-2.5 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium break-words">{value}</dd>
    </div>
  );
  const primary =
    "inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none max-sm:flex-1";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b px-5 pt-5 pb-4 sm:px-6">
        <ProviderIcon p={p} />
        <div className="min-w-0 flex-1">
          <SheetTitle className="flex flex-wrap items-center gap-x-2 font-heading text-lg leading-tight font-bold">
            {p.name}
            {p.demo ? <SimTag /> : null}
          </SheetTitle>
          <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono text-[0.78rem] font-semibold text-foreground">{p.id}</span>
            <span>{TYPE_LABEL[p.type]} provider</span>
            {p.archived ? <span className="font-semibold">Archived</span> : <StatusDot status={status} className="text-xs" />}
          </SheetDescription>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close provider"
          className="-me-1.5 grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* What needs attention */}
        <section aria-labelledby="prov-attn-title" className="px-5 py-5 sm:px-6">
          <div className={cn("rounded-2xl border p-4", issues.length ? "border-destructive/30 bg-destructive/[0.04]" : "bg-muted/40")}>
            <h3 id="prov-attn-title" className={cn("text-xs font-bold tracking-wider uppercase", issues.length ? "text-destructive" : "text-muted-foreground")}>
              What needs attention
            </h3>
            {p.archived ? (
              <p className="mt-1.5 text-sm">Archived. Restore it to configure or map services again.</p>
            ) : next ? (
              <>
                <p className="mt-1.5 text-[0.95rem] font-semibold">{next.title}</p>
                <p className="text-sm text-muted-foreground">{next.detail}</p>
                {issues.length > 1 ? (
                  <ul className="mt-3 space-y-1 border-t border-current/10 pt-3 text-sm">
                    {issues.slice(next.id === issues[0].id ? 1 : 0).map((i) => (
                      <li key={i.id} className="flex items-start gap-2">
                        <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
                        <span>
                          <span className="font-medium">{i.title}</span> <span className="text-muted-foreground">— {i.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="mt-1.5 flex items-start gap-2 text-sm">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                Setup is complete. The only remaining step, a real connection check, needs a secure backend.
              </p>
            )}
            <p className="mt-3 border-t border-current/10 pt-3 text-xs text-muted-foreground">{STATUS_META[status].explain}</p>
          </div>
        </section>

        <DSection id="prov-config-title" title="Configuration">
          <dl className="divide-y">
            {row("Type", TYPE_LABEL[p.type])}
            {p.type === "api" ? row("API endpoint", p.endpoint ? <span className="font-mono text-[0.8rem] break-all">{p.endpoint}</span> : <Missing />) : null}
            {p.type === "api" ? row("Authentication", p.authMethod ? `${AUTH_LABEL[p.authMethod]} · credentials not stored here` : <Missing />) : null}
            {p.type === "manual" ? row("Instructions", p.instructions || <Missing />) : null}
            {row("Supplier review", p.supplierReviewed ? "Completed (simulated attestation)" : <span className="text-soon">Pending</span>)}
            {row("Connection verified", <Missing>Never · no connection checks exist yet</Missing>)}
            {row("Last successful check", <Missing>Not recorded</Missing>)}
            {p.description ? row("Description", p.description) : null}
          </dl>
        </DSection>

        <DSection
          id="prov-map-title"
          title="Mapped services"
          aside={`${p.mappings.length} mapped`}
        >
          {p.mappings.length ? (
            <ul className="divide-y">
              {p.mappings.map((m) => (
                <MappingRow key={m.serviceId} m={m} p={p} providers={providers} records={records} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No services mapped yet.</p>
          )}
          {!p.archived ? (
            <button type="button" onClick={() => onConfigure(p, "mapping")} className={cn(linkButton, "mt-2")}>
              <Link2 className="size-3.5" aria-hidden /> Manage mappings
            </button>
          ) : null}
        </DSection>

        <DSection id="prov-ops-title" title="Operations">
          <dl className="divide-y">
            {row("Limitations", p.limitations || <Missing>None noted</Missing>)}
            {row("Operational notes", p.operationalNotes || <Missing>None noted</Missing>)}
            {row("Fallback provider", fallback ? fallback.name : <Missing>None</Missing>)}
            {p.notes ? row("Internal notes", p.notes) : null}
          </dl>
        </DSection>

        <DSection id="prov-activity-title" title="Recent activity">
          <p className="text-sm text-muted-foreground">No operational activity recorded. No orders have been sent to any provider, and there are no health or delivery records.</p>
        </DSection>
      </div>

      <div className="flex items-center gap-2 border-t bg-background/95 px-5 py-3 backdrop-blur-sm sm:px-6">
        {p.archived ? (
          <button type="button" onClick={() => setAsk("restore")} className={primary}>
            <RotateCcw className="size-4" aria-hidden /> Restore provider
          </button>
        ) : next ? (
          next.id === "enable" ? (
            <button type="button" onClick={() => setAsk("enable")} className={primary}>
              <Power className="size-4" aria-hidden /> Enable provider
            </button>
          ) : (
            <button type="button" onClick={() => onConfigure(p, next.section)} className={primary}>
              {next.action} <ArrowRight className="size-4" aria-hidden />
            </button>
          )
        ) : (
          <button type="button" onClick={() => onConfigure(p)} className={primary}>
            Configure <ArrowRight className="size-4" aria-hidden />
          </button>
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
                {!p.archived ? (
                  <>
                    <Menu.Item onClick={() => onConfigure(p)} className={menuItem}>
                      <Pencil className="size-3.5 text-muted-foreground" aria-hidden /> Configure
                    </Menu.Item>
                    <Menu.Item onClick={() => setAsk("test")} className={menuItem}>
                      <Plug className="size-3.5 text-muted-foreground" aria-hidden /> Test connection <span className="ms-auto text-[0.68rem] font-semibold text-muted-foreground">Preview</span>
                    </Menu.Item>
                    <Menu.Separator className={menuSeparator} />
                    <Menu.Item onClick={() => setAsk(p.enabled ? "disable" : "enable")} className={menuItem}>
                      <Power className="size-3.5 text-muted-foreground" aria-hidden /> {p.enabled ? "Disable provider" : "Enable provider"}
                    </Menu.Item>
                    <Menu.Item onClick={() => setAsk("archive")} className={cn(menuItem, "text-destructive")}>
                      <Archive className="size-3.5" aria-hidden /> Archive provider
                    </Menu.Item>
                  </>
                ) : (
                  <Menu.Item onClick={() => setAsk("restore")} className={menuItem}>
                    <RotateCcw className="size-3.5 text-muted-foreground" aria-hidden /> Restore provider
                  </Menu.Item>
                )}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      <ConfirmDialog
        open={ask === "test"}
        onOpenChange={(v) => !v && setAsk(null)}
        title="Test connection — preview"
        description="Connection tests run on a secure backend that holds the provider's credentials. None exists yet, so nothing was contacted and the status hasn't changed."
        icon={Lock}
      />
      <ConfirmDialog
        open={ask === "disable" || ask === "enable"}
        onOpenChange={(v) => !v && setAsk(null)}
        title={ask === "disable" ? `Disable ${p.name}?` : `Enable ${p.name}?`}
        description={ask === "disable" ? "It stays in the directory with its mappings, but is marked Disabled. You can enable it again at any time." : "It returns to its previous setup state. Nothing is connected or sent to the provider."}
        confirmLabel={ask === "disable" ? "Disable provider" : "Enable provider"}
        tone={ask === "disable" ? "danger" : "default"}
        icon={Power}
        onConfirm={() => {
          patchProvider(p.id, { enabled: ask !== "disable" });
          onNotice(`${p.name} ${ask === "disable" ? "disabled" : "enabled"}.`);
        }}
      />
      <ConfirmDialog
        open={ask === "archive" || ask === "restore"}
        onOpenChange={(v) => !v && setAsk(null)}
        title={ask === "archive" ? `Archive ${p.name}?` : `Restore ${p.name}?`}
        description={ask === "archive" ? "It moves to Archived and its mappings stop counting. Its ID stays reserved and you can restore it later." : "It returns to the active directory with its configuration and mappings."}
        confirmLabel={ask === "archive" ? "Archive provider" : "Restore provider"}
        tone={ask === "archive" ? "danger" : "default"}
        icon={ask === "archive" ? Archive : RotateCcw}
        onConfirm={() => {
          patchProvider(p.id, { archived: ask === "archive" });
          onNotice(`${p.name} ${ask === "archive" ? "archived" : "restored"}.`);
        }}
      />
    </div>
  );
}

function DSection({ id, title, aside, children }: { id: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t px-5 py-6 sm:px-6">
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

function MappingState({ m, p, providers, records }: { m: Mapping; p: Provider; providers: Provider[]; records: Record<string, ServiceRecord> }) {
  const s = mappingState(m, p, providers, records);
  if (s.kind === "ok") return <span className="inline-flex items-center gap-1 text-xs font-medium text-ok"><Check className="size-3" aria-hidden /> Eligible</span>;
  if (s.kind === "blocked") return <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive"><Lock className="size-3" aria-hidden /> Blocked · {s.reason}</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-soon"><CircleAlert className="size-3" aria-hidden /> Conflict · also mapped to {s.others.join(", ")}</span>;
}

function MappingRow({ m, p, providers, records, actions }: { m: Mapping; p: Provider; providers: Provider[]; records: Record<string, ServiceRecord>; actions?: React.ReactNode }) {
  const r = records[m.serviceId];
  const platform = r ? PLATFORM_BY_ID[r.platformId] : null;
  return (
    <li className="flex items-start gap-3 py-2.5">
      {platform ? <PlatformTile platform={platform} size="xs" className="mt-0.5" /> : <span className="size-6" />}
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{r?.name ?? m.serviceId}</p>
        <p className="text-xs text-muted-foreground">
          {platform ? `${platform.short} · ${CATEGORY_META[r!.category].short} · ` : ""}
          <span className="font-mono">{m.serviceId}</span> → <span className="font-mono font-semibold text-foreground">{m.ref}</span>
        </p>
        <MappingState m={m} p={p} providers={providers} records={records} />
      </div>
      {actions}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Editor                                                                    */
/* -------------------------------------------------------------------------- */

const SECTIONS: { id: Section; label: string }[] = [
  { id: "general", label: "General" },
  { id: "connection", label: "Connection" },
  { id: "mapping", label: "Service mapping" },
  { id: "operations", label: "Operations" },
  { id: "review", label: "Review" },
];

function ProviderEditor({
  state,
  providers,
  records,
  onClose,
  onSaved,
}: {
  state: EditorState;
  providers: Provider[];
  records: Record<string, ServiceRecord>;
  onClose: () => void;
  onSaved: (p: Provider, kind: "draft" | "full", isNew: boolean) => void;
}) {
  const [confirmClose, setConfirmClose] = React.useState(false);
  const dirty = React.useRef(false);
  const requestClose = () => (dirty.current ? setConfirmClose(true) : onClose());
  return (
    <>
      <Sheet open={Boolean(state)} onOpenChange={(o) => !o && requestClose()}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[42rem]">
          {state ? (
            <EditorBody
              key={`${state.mode}-${state.provider.id}`}
              state={state}
              providers={providers}
              records={records}
              onDirty={(d) => (dirty.current = d)}
              onClose={requestClose}
              onSaved={(p, kind) => {
                dirty.current = false;
                onSaved(p, kind, state.mode === "new");
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Discard unsaved changes?"
        description="Your edits to this provider haven't been saved. Mappings you saved are kept."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={() => {
          dirty.current = false;
          onClose();
        }}
      />
    </>
  );
}

type Errors = Partial<Record<"name" | "id" | "endpoint" | "authMethod" | "instructions" | "description" | "notes" | "limitations" | "operationalNotes" | "fallbackId", string>>;
const FIELD_ORDER: (keyof Errors)[] = ["name", "id", "description", "notes", "endpoint", "authMethod", "instructions", "limitations", "operationalNotes", "fallbackId"];

function validate(p: Provider, isNew: boolean, full: boolean, taken: (id: string) => boolean): Errors {
  const e: Errors = {};
  if (!p.name.trim()) e.name = "Give the provider a name.";
  if (isNew) {
    if (!/^[a-z0-9][a-z0-9-]{1,46}$/.test(p.id)) e.id = "Use 2–47 lowercase letters, numbers or hyphens.";
    else if (taken(p.id)) e.id = "Another provider already uses this ID.";
  }
  for (const k of ["description", "notes", "instructions", "limitations", "operationalNotes"] as const) {
    const err = p[k] ? secretError(p[k]) : null;
    if (err) e[k] = err;
  }
  if (p.type === "api" && p.endpoint.trim()) {
    const err = endpointError(p.endpoint);
    if (err) e.endpoint = err;
  }
  if (p.fallbackId === p.id && p.id) e.fallbackId = "A provider can't be its own fallback.";
  if (full) {
    if (p.type === "api") {
      if (!p.endpoint.trim()) e.endpoint = endpointError("") ?? undefined;
      if (!p.authMethod) e.authMethod = "Choose how this provider authenticates.";
    } else if (p.instructions.trim().length < 10 && !e.instructions) e.instructions = "Describe how staff fulfil orders (at least a sentence).";
  }
  return e;
}

const FIELD_DOM: Record<keyof Errors, string> = {
  name: "prov-name",
  id: "prov-id",
  description: "prov-desc",
  notes: "prov-notes",
  endpoint: "prov-endpoint",
  authMethod: "prov-auth",
  instructions: "prov-instructions",
  limitations: "prov-limits",
  operationalNotes: "prov-opnotes",
  fallbackId: "prov-fallback",
};

function EditorBody({
  state,
  providers,
  records,
  onDirty,
  onClose,
  onSaved,
}: {
  state: NonNullable<EditorState>;
  providers: Provider[];
  records: Record<string, ServiceRecord>;
  onDirty: (d: boolean) => void;
  onClose: () => void;
  onSaved: (p: Provider, kind: "draft" | "full") => void;
}) {
  const isNew = state.mode === "new";
  const [start] = React.useState(() => ({ p: state.provider, idEdited: false }));
  const [form, setForm] = React.useState(start);
  const [attempt, setAttempt] = React.useState<"draft" | "full" | null>(null);
  const scroller = React.useRef<HTMLDivElement>(null);
  const p = form.p;
  const saved = providers.find((x) => x.id === state.provider.id && !isNew);
  const taken = (id: string) => providers.some((x) => x.id === id);

  const dirty = JSON.stringify(form.p) !== JSON.stringify(start.p);
  React.useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

  const errors = validate(p, isNew, attempt === "full", taken);
  const shown: Errors = attempt ? errors : { ...errors, name: undefined, id: p.name.trim() ? errors.id : undefined };
  const set = (patch: Partial<Provider>) => setForm((cur) => ({ ...cur, p: { ...cur.p, ...patch } }));

  const jump = React.useCallback((id: Section) => {
    const el = document.getElementById(`prov-sec-${id}`);
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop - 8, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, []);
  React.useEffect(() => {
    if (!state.section) return;
    const id = requestAnimationFrame(() => {
      const el = document.getElementById(`prov-sec-${state.section}`);
      if (el && scroller.current) scroller.current.scrollTop = el.offsetTop - 8;
    });
    return () => cancelAnimationFrame(id);
  }, [state.section]);

  const save = (kind: "draft" | "full") => {
    setAttempt(kind);
    const e = validate(p, isNew, kind === "full", taken);
    const first = FIELD_ORDER.find((k) => e[k]);
    if (first) {
      requestAnimationFrame(() => document.getElementById(FIELD_DOM[first])?.focus());
      return;
    }
    // Keep the latest mappings: they save on their own while the editor is open.
    const next: Provider = { ...p, name: p.name.trim(), mappings: saved?.mappings ?? p.mappings, draft: kind === "draft" };
    saveProvider(next);
    onSaved(next, kind);
  };

  const others = providers.filter((x) => x.id !== p.id && !x.archived);
  const live = saved ?? p;
  const completeness = [
    { label: "Name and ID", ok: Boolean(p.name.trim()) && !errors.id },
    { label: p.type === "api" ? "API endpoint and authentication method" : "Manual fulfilment instructions", ok: isConfigured(p) },
    { label: "Supplier eligibility review", ok: p.supplierReviewed },
    { label: `Services mapped (${live.mappings.length})`, ok: live.mappings.length > 0 },
  ];
  const blockers = live.mappings.map((m) => mappingState(m, live, providers, records)).filter((s) => s.kind !== "ok").length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-5 pt-5 pb-3 sm:px-6">
        <div className="flex items-start gap-3">
          <ProviderIcon p={p} />
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-heading text-lg leading-tight font-bold">{isNew ? "Add provider" : `Configure ${state.provider.name}`}</SheetTitle>
            <SheetDescription className="mt-0.5 text-sm text-muted-foreground">
              {isNew ? "Saved in this browser only. Nothing is connected or sent to the provider." : <span className="font-mono text-[0.8rem]">{state.provider.id}</span>}
            </SheetDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close editor"
            className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <nav aria-label="Editor sections" className="-mx-1 mt-3 flex gap-1 overflow-x-auto no-scrollbar">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => jump(s.id)}
              className="h-8 shrink-0 rounded-full px-3 text-[0.8rem] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      <div ref={scroller} className="relative min-h-0 flex-1 space-y-9 overflow-y-auto px-5 py-6 sm:px-6">
        {attempt && Object.keys(errors).length ? (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            Fix {Object.keys(errors).length} field{Object.keys(errors).length === 1 ? "" : "s"} before saving.
          </p>
        ) : null}

        <EditorSection id="general" title="General" description="Who the provider is and how it's used.">
          <Field id="prov-name" label="Provider name" error={shown.name}>
            <TextInput
              {...describe("prov-name", shown.name)}
              value={p.name}
              maxLength={80}
              autoComplete="off"
              onChange={(e) => {
                const name = e.target.value;
                setForm((cur) => ({ ...cur, p: { ...cur.p, name, id: isNew && !cur.idEdited ? providerIdFrom(name, taken) : cur.p.id } }));
              }}
            />
          </Field>
          <Segmented<ProviderType>
            name="prov-type"
            label="Provider type"
            value={p.type}
            options={[
              { value: "api", label: "API provider" },
              { value: "manual", label: "Manual fulfilment" },
            ]}
            onChange={(type) => set({ type })}
          />
          <Field id="prov-id" label="Provider ID" error={shown.id} help={isNew ? "Used in links and mappings. It can't be changed after you save." : "Fixed after creation."}>
            <TextInput
              {...describe("prov-id", shown.id, true)}
              value={p.id}
              maxLength={47}
              readOnly={!isNew}
              spellCheck={false}
              autoComplete="off"
              className={cn("font-mono", !isNew && "bg-muted/50 text-muted-foreground")}
              onChange={(e) => setForm((cur) => ({ ...cur, idEdited: true, p: { ...cur.p, id: e.target.value.toLowerCase() } }))}
            />
          </Field>
          <details className="group rounded-xl border px-3.5" open={Boolean(p.description || p.notes)}>
            <summary className="flex h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden /> Description & internal notes
              <span className="ms-auto text-xs font-normal text-muted-foreground">Optional</span>
            </summary>
            <div className="space-y-4 pb-4">
              <Field id="prov-desc" label="Description" optional error={shown.description}>
                <TextArea {...describe("prov-desc", shown.description)} value={p.description} maxLength={500} onChange={(e) => set({ description: e.target.value })} />
              </Field>
              <Field id="prov-notes" label="Internal notes" optional error={shown.notes} help="Staff only. Never paste credentials.">
                <TextArea {...describe("prov-notes", shown.notes, true)} value={p.notes} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} />
              </Field>
            </div>
          </details>
          <div className="flex items-start justify-between gap-4 rounded-xl border p-3.5">
            <div>
              <p className="text-sm font-semibold">Enabled</p>
              <p id="prov-enabled-desc" className="mt-0.5 text-xs text-muted-foreground">
                Disabled providers keep their setup but are never offered for a service.
              </p>
            </div>
            <Switch id="prov-enabled" label="Enabled" describedBy="prov-enabled-desc" checked={p.enabled} onChange={(v) => set({ enabled: v })} />
          </div>
        </EditorSection>

        <EditorSection id="connection" title="Connection" description={p.type === "api" ? "Where the provider's API lives and how it authenticates." : "How staff fulfil orders with this provider."}>
          {p.type === "api" ? (
            <>
              <Field id="prov-endpoint" label="API endpoint" error={shown.endpoint} help="The base address only, starting with https://. Never include keys or tokens.">
                <TextInput {...describe("prov-endpoint", shown.endpoint, true)} value={p.endpoint} maxLength={300} inputMode="url" spellCheck={false} autoComplete="off" placeholder="https://api.provider.com/v2" className="font-mono text-[0.85rem]" onChange={(e) => set({ endpoint: e.target.value })} />
              </Field>
              <Field id="prov-auth" label="Authentication method" error={shown.authMethod} help="Choose the method only. Credentials are never entered here; a secure backend will hold them.">
                <SelectInput {...describe("prov-auth", shown.authMethod, true)} value={p.authMethod} onChange={(e) => set({ authMethod: e.target.value as AuthMethod })}>
                  <option value="">Choose a method</option>
                  {(Object.keys(AUTH_LABEL) as Exclude<AuthMethod, "">[]).map((a) => (
                    <option key={a} value={a}>
                      {AUTH_LABEL[a]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </>
          ) : (
            <Field id="prov-instructions" label="Fulfilment instructions" error={shown.instructions} help="What staff do when an order is assigned to this provider.">
              <TextArea {...describe("prov-instructions", shown.instructions, true)} value={p.instructions} maxLength={2000} className="min-h-24" onChange={(e) => set({ instructions: e.target.value })} />
            </Field>
          )}
          <div className="rounded-xl bg-muted/40 p-3.5 text-sm">
            <p className="font-semibold">Connection summary</p>
            <ul className="mt-1.5 space-y-1 text-[0.82rem] text-muted-foreground">
              <li>{isConfigured(p) ? "✓ Required details are complete." : "• Required details are missing."}</li>
              <li>• Verification: never verified. Last check: not recorded.</li>
              <li>• Testing a connection needs a secure backend, so it&apos;s not available in this demo.</li>
            </ul>
          </div>
        </EditorSection>

        <EditorSection id="mapping" title="Service mapping" description="Pair Sociotix services with this provider's own service references. Mappings save immediately and never change pricing or availability.">
          {isNew || !saved ? (
            <p className="rounded-xl bg-muted/40 p-3.5 text-sm text-muted-foreground">Save the provider first, then map services here.</p>
          ) : (
            <MappingManager provider={saved} providers={providers} records={records} supplierReviewed={saved.supplierReviewed} onReview={() => jump("review")} />
          )}
        </EditorSection>

        <EditorSection id="operations" title="Operational settings" description="Limits, requirements and what happens if this provider can't fulfil.">
          <p className="text-sm">
            <span className="text-muted-foreground">Fulfilment method:</span> <span className="font-semibold">{p.type === "api" ? "Through the provider's API (once connected)" : "Manual, by staff"}</span>
          </p>
          <Field id="prov-limits" label="Limitations & requirements" optional error={shown.limitations} help="E.g. quantity limits, public accounts only, regions served.">
            <TextArea {...describe("prov-limits", shown.limitations, true)} value={p.limitations} maxLength={1000} onChange={(e) => set({ limitations: e.target.value })} />
          </Field>
          <details className="group rounded-xl border px-3.5" open={Boolean(p.operationalNotes || p.fallbackId)}>
            <summary className="flex h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden /> Notes & fallback
              <span className="ms-auto text-xs font-normal text-muted-foreground">Optional</span>
            </summary>
            <div className="space-y-4 pb-4">
              <Field id="prov-opnotes" label="Operational notes" optional error={shown.operationalNotes}>
                <TextArea {...describe("prov-opnotes", shown.operationalNotes)} value={p.operationalNotes} maxLength={1000} onChange={(e) => set({ operationalNotes: e.target.value })} />
              </Field>
              <Field id="prov-fallback" label="Fallback provider" optional error={shown.fallbackId} help="Used if this provider can't take an order. Only a preference; nothing routes automatically.">
                <SelectInput {...describe("prov-fallback", shown.fallbackId, true)} value={p.fallbackId} onChange={(e) => set({ fallbackId: e.target.value })}>
                  <option value="">No fallback</option>
                  {others.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                      {!o.enabled ? " (disabled)" : ""}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
          </details>
        </EditorSection>

        <EditorSection id="review" title="Review" description="What's complete, and what still blocks this provider.">
          <ul className="divide-y rounded-xl border">
            {completeness.map((c) => (
              <li key={c.label} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-full", c.ok ? "bg-ok-soft text-ok" : "bg-muted text-muted-foreground")} aria-hidden>
                  {c.ok ? <Check className="size-3" strokeWidth={3} /> : <span className="size-1.5 rounded-full bg-current" />}
                </span>
                <span className={cn(!c.ok && "text-muted-foreground")}>
                  {c.label}
                  <span className="sr-only">{c.ok ? ": done" : ": not done"}</span>
                </span>
              </li>
            ))}
            <li className="flex items-center gap-3 px-3.5 py-2.5 text-sm text-muted-foreground">
              <Lock className="size-4 shrink-0" aria-hidden /> Connection verified — needs a secure backend
            </li>
          </ul>
          {blockers ? (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {blockers} mapping{blockers === 1 ? " needs" : "s need"} attention in Service mapping.
            </p>
          ) : null}
          <div className="flex items-start justify-between gap-4 rounded-xl border p-3.5">
            <div>
              <p className="text-sm font-semibold">Supplier eligibility review completed</p>
              <p id="prov-supplier-desc" className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Confirms the supplier was checked against Sociotix&apos;s supplier and platform policies. A simulated attestation in this demo; it doesn&apos;t verify a connection.
              </p>
            </div>
            <Switch id="prov-supplier" label="Supplier eligibility review completed (simulated)" describedBy="prov-supplier-desc" checked={p.supplierReviewed} onChange={(v) => set({ supplierReviewed: v })} />
          </div>
        </EditorSection>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t bg-card px-5 py-3.5 pb-[calc(env(safe-area-inset-bottom)+0.875rem)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {dirty ? "Unsaved changes" : "No changes"} · admin demo, saved in this browser
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {isNew || state.provider.draft ? (
            <button
              type="button"
              onClick={() => save("draft")}
              className="inline-flex h-10 items-center justify-center rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              Save draft
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => save("full")}
            disabled={!isNew && !state.provider.draft && !dirty}
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {isNew || state.provider.draft ? "Save provider" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditorSection({ id, title, description, children }: { id: Section; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={`prov-sec-${id}`} aria-labelledby={`prov-sec-${id}-title`} className="scroll-mt-2 space-y-4">
      <div>
        <h3 id={`prov-sec-${id}-title`} className="text-base font-bold">
          {title}
        </h3>
        <p className="mt-0.5 text-[0.82rem] text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mapping                                                                   */
/* -------------------------------------------------------------------------- */

function MappingManager({
  provider,
  providers,
  records,
  supplierReviewed,
  onReview,
}: {
  provider: Provider;
  providers: Provider[];
  records: Record<string, ServiceRecord>;
  supplierReviewed: boolean;
  onReview: () => void;
}) {
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [removeAsk, setRemoveAsk] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);

  return (
    <div className="space-y-3">
      {!provider.supplierReviewed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-soon/35 bg-soon-soft/40 p-3.5 text-sm">
          <p>
            <span className="font-semibold">Supplier review pending.</span> <span className="text-muted-foreground">Complete it in Review and save before mapping services.</span>
          </p>
          <button type="button" onClick={onReview} className={linkButton}>
            Go to Review <ArrowRight className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : null}

      {saved ? (
        <p role="status" className="flex items-center gap-2 text-sm font-medium text-ok">
          <CircleCheck className="size-4" aria-hidden /> {saved}
        </p>
      ) : null}

      {provider.mappings.length ? (
        <ul className="divide-y rounded-xl border px-3.5" aria-label="Mapped services">
          {provider.mappings.map((m) =>
            editing === m.serviceId ? (
              <li key={m.serviceId} className="py-3">
                <MappingForm
                  provider={provider}
                  providers={providers}
                  records={records}
                  initial={m}
                  onCancel={() => setEditing(null)}
                  onDone={(msg) => {
                    setEditing(null);
                    setSaved(msg);
                  }}
                />
              </li>
            ) : (
              <MappingRow
                key={m.serviceId}
                m={m}
                p={provider}
                providers={providers}
                records={records}
                actions={
                  <span className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setEditing(m.serviceId)} aria-label={`Edit mapping for ${records[m.serviceId]?.name ?? m.serviceId}`} className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button type="button" onClick={() => setRemoveAsk(m.serviceId)} aria-label={`Remove mapping for ${records[m.serviceId]?.name ?? m.serviceId}`} className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </span>
                }
              />
            ),
          )}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No services mapped yet.</p>
      )}

      {adding ? (
        <div className="rounded-xl border p-3.5">
          <MappingForm
            provider={provider}
            providers={providers}
            records={records}
            onCancel={() => setAdding(false)}
            onDone={(msg) => {
              setAdding(false);
              setSaved(msg);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setSaved(null);
          }}
          disabled={!supplierReviewed}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-foreground"
        >
          <Plus className="size-4" aria-hidden /> Map a service
        </button>
      )}

      <ConfirmDialog
        open={removeAsk !== null}
        onOpenChange={(v) => !v && setRemoveAsk(null)}
        title="Remove this mapping?"
        description={`${records[removeAsk ?? ""]?.name ?? removeAsk} will no longer be mapped to ${provider.name}. The service itself doesn't change.`}
        confirmLabel="Remove mapping"
        tone="danger"
        icon={Trash2}
        onConfirm={() => {
          if (removeAsk) removeMapping(provider.id, removeAsk);
          setSaved("Mapping removed.");
        }}
      />
    </div>
  );
}

/** Choose a Sociotix service → enter the provider's reference → save. */
function MappingForm({
  provider,
  providers,
  records,
  initial,
  onCancel,
  onDone,
}: {
  provider: Provider;
  providers: Provider[];
  records: Record<string, ServiceRecord>;
  initial?: Mapping;
  onCancel: () => void;
  onDone: (msg: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const [platform, setPlatform] = React.useState("");
  const [eligibleOnly, setEligibleOnly] = React.useState(true);
  const [serviceId, setServiceId] = React.useState(initial?.serviceId ?? "");
  const [ref, setRef] = React.useState(initial?.ref ?? "");
  const [tried, setTried] = React.useState(false);
  const uid = React.useId();

  const all = Object.values(records).filter((r) => !r.archived);
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const listed = all
    .filter((r) => (!platform || r.platformId === platform) && (!eligibleOnly || serviceEligibility(r).ok) && terms.every((t) => `${r.name} ${r.id} ${CATEGORY_META[r.category].label}`.toLowerCase().includes(t)))
    .sort((a, b) => Number(serviceEligibility(b).ok) - Number(serviceEligibility(a).ok) || a.name.localeCompare(b.name));
  const hiddenIneligible = eligibleOnly ? all.filter((r) => !serviceEligibility(r).ok).length : 0;
  const shown = listed.slice(0, 30);
  const record = records[serviceId];
  const elig = serviceEligibility(record);
  const duplicate = serviceId && serviceId !== initial?.serviceId && provider.mappings.some((m) => m.serviceId === serviceId);
  const refTaken = ref.trim() && provider.mappings.find((m) => m.ref.toLowerCase() === ref.trim().toLowerCase() && m.serviceId !== (initial?.serviceId ?? serviceId));
  const conflicts = serviceId ? providers.filter((x) => x.id !== provider.id && !x.archived && x.mappings.some((m) => m.serviceId === serviceId)).map((x) => x.name) : [];
  const compat = compatibilityNote(record, provider);

  const serviceErr = !serviceId ? "Choose a service to map." : !elig.ok ? elig.reason : duplicate ? "Already mapped to this provider. Edit the existing mapping instead." : null;
  const refErr = refError(ref) ?? (refTaken ? `This reference is already used for ${records[refTaken.serviceId]?.name ?? refTaken.serviceId}.` : null);

  const submit = () => {
    setTried(true);
    if (!provider.supplierReviewed || serviceErr || refErr) {
      requestAnimationFrame(() => document.getElementById(serviceErr ? `${uid}-search` : `${uid}-ref`)?.focus());
      return;
    }
    setMapping(provider.id, serviceId, ref, initial?.serviceId);
    onDone(`${record.name} ${initial ? "updated" : "mapped"} → ${ref.trim()}`);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">{initial ? "Edit mapping" : "Map a service"}</p>
      {!initial ? (
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-xs font-semibold text-muted-foreground">1 · Choose a Sociotix service</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_11rem]">
            <div className="relative">
              <label htmlFor={`${uid}-search`} className="sr-only">
                Search services
              </label>
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <TextInput id={`${uid}-search`} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services" autoComplete="off" className="ps-9" />
            </div>
            <label htmlFor={`${uid}-platform`} className="sr-only">
              Platform
            </label>
            <SelectInput id={`${uid}-platform`} value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="">All platforms</option>
              {PLATFORMS.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.name}
                </option>
              ))}
            </SelectInput>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <input type="checkbox" checked={eligibleOnly} onChange={(e) => setEligibleOnly(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            Eligible services only{hiddenIneligible ? ` (${hiddenIneligible} hidden)` : ""}
          </label>
          {shown.length ? (
            <div role="radiogroup" aria-label="Sociotix services" className="max-h-64 divide-y overflow-y-auto rounded-xl border">
              {shown.map((r) => {
                const e = serviceEligibility(r);
                const pl = PLATFORM_BY_ID[r.platformId];
                const mappedHere = provider.mappings.some((m) => m.serviceId === r.id);
                return (
                  <label key={r.id} className={cn("flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 has-focus-visible:ring-2 has-focus-visible:ring-primary/40 has-focus-visible:ring-inset", serviceId === r.id && "bg-secondary/40 dark:bg-secondary/20", !e.ok && "cursor-not-allowed opacity-60")}>
                    <input type="radio" name={`${uid}-svc`} value={r.id} checked={serviceId === r.id} disabled={!e.ok} onChange={() => setServiceId(r.id)} className="sr-only" />
                    <PlatformTile platform={pl} size="xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {pl.short} · {CATEGORY_META[r.category].short} · <span className="font-mono">{r.id}</span>
                      </span>
                    </span>
                    {mappedHere ? (
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">Mapped</span>
                    ) : !e.ok ? (
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">Policy review needed</span>
                    ) : serviceId === r.id ? (
                      <Check className="size-4 shrink-0 text-primary" aria-hidden />
                    ) : null}
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl bg-muted/40 p-3.5 text-sm text-muted-foreground">
              {eligibleOnly && hiddenIneligible ? (
                <>
                  No services have passed platform-policy review yet.{" "}
                  <Link href="/admin/services" className="font-semibold text-primary hover:underline">
                    Review services in Services & Pricing
                  </Link>{" "}
                  first.
                </>
              ) : (
                "No services match."
              )}
            </p>
          )}
          {listed.length > shown.length ? <p className="text-xs text-muted-foreground">Showing 30 of {listed.length}. Search to narrow it down.</p> : null}
        </fieldset>
      ) : (
        <p className="text-sm">
          <span className="text-muted-foreground">Service:</span> <span className="font-medium">{record?.name ?? serviceId}</span> <span className="font-mono text-xs text-muted-foreground">{serviceId}</span>
        </p>
      )}

      {tried && serviceErr ? (
        <p role="alert" className="flex items-start gap-1.5 text-xs font-medium text-destructive">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> {serviceErr}
        </p>
      ) : null}
      {serviceId && conflicts.length ? (
        <p className="flex items-start gap-1.5 text-xs font-medium text-soon">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> Also mapped to {conflicts.join(", ")}. Saving creates a conflict to resolve.
        </p>
      ) : null}
      {serviceId && compat ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> {compat}
        </p>
      ) : null}

      <Field id={`${uid}-ref`} label={initial ? "Provider service reference" : "2 · Provider service reference"} error={tried ? refErr : null} help="The provider's own ID or code for this service, e.g. NW-1042.">
        <TextInput
          {...describe(`${uid}-ref`, tried ? refErr : null, true)}
          value={ref}
          maxLength={64}
          spellCheck={false}
          autoComplete="off"
          className="font-mono"
          onChange={(e) => setRef(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
          Cancel
        </button>
        <button type="button" onClick={submit} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none">
          Save mapping
        </button>
      </div>
    </div>
  );
}

export type { ProviderIssue };
