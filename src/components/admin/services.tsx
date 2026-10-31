"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Copy,
  Ellipsis,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SearchX,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { ConfirmDialog } from "@/components/dashboard/account-ui";
import { CATEGORY_META, CATEGORY_ORDER, PLATFORM_BY_ID, PLATFORMS, type ServiceCategory } from "@/lib/catalog";
import {
  blankService,
  isPriced,
  lifecycleOf,
  pricingStatus,
  purchaseStatus,
  PRICING_MODELS,
  type ServiceRecord,
  uniqueId,
  unitMargin,
} from "@/lib/admin-services";
import { cn } from "@/lib/utils";
import { SelectInput } from "./form";
import { type EditorMode, ServiceEditor } from "./service-editor";
import { useServiceSource } from "./service-source";
import { LifecycleBadge, PricingBadge, PurchaseBadge, VisibilityBadge } from "./service-status";
import { AdminDemoTag, Card, linkButton } from "./ui";
import { popupSurface, menuPopup, menuItem as sharedMenuItem } from "./menu";

/* -------------------------------------------------------------------------- */
/*  Filters (kept in the URL so a refresh or shared link keeps the view)       */
/* -------------------------------------------------------------------------- */

type Sort = "name" | "platform" | "price" | "margin" | "updated";
interface Filters {
  q: string;
  platform: string;
  type: ServiceCategory | "";
  pricing: "" | "priced" | "unpriced";
  purchase: "" | "ready" | "not_enabled";
  visibility: "" | "visible" | "hidden";
  view: "active" | "archived";
  sort: Sort;
  page: number;
}

const DEFAULTS: Filters = { q: "", platform: "", type: "", pricing: "", purchase: "", visibility: "", view: "active", sort: "name", page: 1 };
const PAGE_SIZE = 15;

function parseFilters(p: URLSearchParams): Filters {
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T) => {
    const v = p.get(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  };
  return {
    q: (p.get("q") ?? "").slice(0, 80),
    platform: PLATFORM_BY_ID[p.get("platform") ?? ""] ? p.get("platform")! : "",
    type: pick("type", CATEGORY_ORDER, "" as ServiceCategory | ""),
    pricing: pick("pricing", ["priced", "unpriced"] as const, ""),
    purchase: pick("purchase", ["ready", "not_enabled"] as const, ""),
    visibility: pick("visibility", ["visible", "hidden"] as const, ""),
    view: pick("view", ["active", "archived"] as const, "active"),
    sort: pick("sort", ["name", "platform", "price", "margin", "updated"] as const, "name"),
    page: Math.max(1, Number(p.get("page")) || 1),
  };
}

function toQuery(f: Filters) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== DEFAULTS[k as keyof Filters]) q.set(k, String(v));
  return q.toString();
}

const money = (n: number, model: ServiceRecord["pricing"]["model"]) =>
  PRICING_MODELS[model].percent ? `${n}%` : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(n);
const unitShort: Record<ServiceRecord["pricing"]["model"], string> = { per1000: "/ 1k", unit: "/ unit", fixed: "/ order", fee: "of budget" };

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `live`: DEMO_MODE off — records come from the catalog database and every
 * change is saved (and audited) on the server. Otherwise the browser-only demo.
 */
export function ServicesManager({ live = false }: { live?: boolean }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const source = useServiceSource(live);
  const records = source.records;
  const [f, setF] = React.useState<Filters>(() => parseFilters(params));
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [editor, setEditor] = React.useState<{ mode: EditorMode; record: ServiceRecord; section?: "pricing" } | null>(null);
  const [bulk, setBulk] = React.useState<"show" | "hide" | "archive" | "restore" | null>(null);
  const [resetAsk, setResetAsk] = React.useState(false);
  const [notice, setNotice] = React.useState<{ text: string; tone: "ok" | "error" } | null>(null);

  React.useEffect(() => {
    if (pathname !== "/admin/services") return;
    const qs = toQuery(f);
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }, [f, pathname]);

  // Changing any filter returns to page 1 and clears a selection that may no longer be visible.
  const update = (patch: Partial<Filters>) => {
    setF((cur) => ({ ...cur, ...patch, page: patch.page ?? 1 }));
    if (patch.page === undefined) setSelected(new Set());
  };

  const inView = records.filter((r) => (f.view === "archived" ? r.archived : !r.archived));
  // Every word must match somewhere, so "tiktok views" finds "TikTok Video Views".
  const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = inView
    .filter((r) => {
      if (f.platform && r.platformId !== f.platform) return false;
      if (f.type && r.category !== f.type) return false;
      if (f.pricing && (f.pricing === "priced") !== isPriced(r)) return false;
      if (f.purchase && f.purchase !== purchaseStatus(r)) return false;
      if (f.visibility && (f.visibility === "visible") !== r.visible) return false;
      if (!terms.length) return true;
      const p = PLATFORM_BY_ID[r.platformId];
      const hay = [r.name, r.id, p.name, CATEGORY_META[r.category].label].join(" ").toLowerCase();
      return terms.every((t) => hay.includes(t));
    })
    .sort((a, b) => {
      const marginOf = (r: ServiceRecord) => unitMargin(r.pricing)?.margin ?? -Infinity;
      switch (f.sort) {
        case "platform":
          return PLATFORM_BY_ID[a.platformId].name.localeCompare(PLATFORM_BY_ID[b.platformId].name) || a.name.localeCompare(b.name);
        case "price":
          return (b.pricing.price ?? -1) - (a.pricing.price ?? -1) || a.name.localeCompare(b.name);
        case "margin":
          return marginOf(b) - marginOf(a) || a.name.localeCompare(b.name);
        case "updated":
          return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || a.name.localeCompare(b.name);
        default:
          return a.name.localeCompare(b.name);
      }
    });
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const rows = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtered = toQuery({ ...f, view: "active", sort: "name", page: 1 }) !== "";

  const active = records.filter((r) => !r.archived);
  const summary = {
    total: active.length,
    platforms: new Set(active.map((r) => r.platformId)).size,
    priced: active.filter(isPriced).length,
    purchaseReady: active.filter((r) => purchaseStatus(r) === "ready").length,
  };

  const flash = (text: string) => {
    const n = { text, tone: "ok" as const };
    setNotice(n);
    window.setTimeout(() => setNotice((m) => (m === n ? null : m)), 4000);
  };
  // Errors stay until dismissed or replaced.
  const fail = (e: unknown, what: string) => setNotice({ text: `${what} ${e instanceof Error ? e.message : "Please try again."}`, tone: "error" });

  // Throws on failure so the editor stays open with the admin's changes.
  const onSave = async (record: ServiceRecord, kind: "draft" | "full") => {
    const saved = await source.save(record, editor?.mode === "new" ? "new" : "edit");
    setEditor(null);
    const priced = isPriced(saved);
    flash(
      `${kind === "draft" ? "Draft saved" : "Saved"}: ${saved.name}${priced ? " is now Priced" : ""}. ${
        purchaseStatus(saved) === "ready" ? "Purchase ready." : "Purchase stays off until fulfilment, policy and payment approval."
      }${live ? "" : " Admin demo — customers see no change."}`,
    );
  };
  const duplicate = (r: ServiceRecord) => {
    const copy: ServiceRecord = {
      ...r,
      id: uniqueId(`${r.id}-copy`, source.exists),
      name: `${r.name} (copy)`,
      visible: false,
      draft: true,
      archived: false,
      origin: "custom",
      checks: { fulfillmentVerified: false, policyReviewed: false },
      updatedAt: null,
      version: undefined,
    };
    setEditor({ mode: "new", record: copy });
  };
  const archive = async (r: ServiceRecord, archived: boolean) => {
    try {
      await source.setFlags([r.id], { archived });
      setEditor(null);
      flash(`${archived ? "Archived" : "Restored"}: ${r.name}.`);
    } catch (e) {
      setEditor(null);
      fail(e, `${r.name} wasn't ${archived ? "archived" : "restored"}.`);
    }
  };

  const pageIds = rows.map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const runBulk = async () => {
    const ids = [...selected];
    const action = bulk;
    if (!action) return;
    const patch = action === "show" || action === "hide" ? { visible: action === "show" } : { archived: action === "archive" };
    try {
      // All or nothing: if any service changed meanwhile, none are updated.
      await source.setFlags(ids, patch);
      flash(`${ids.length} service${ids.length === 1 ? "" : "s"} ${action === "show" ? "shown in catalog" : action === "hide" ? "hidden from catalog" : action === "archive" ? "archived" : "restored"}.`);
      setSelected(new Set());
    } catch (e) {
      fail(e, "Nothing was changed.");
    }
  };

  const changes = source.changes;

  if (live && source.state !== "ready") {
    return (
      <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8" aria-busy={source.state === "loading" || undefined}>
        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Services &amp; Pricing</h1>
        {source.state === "loading" ? (
          <div className="mt-7 space-y-3" aria-label="Loading the catalog">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
              ))}
            </div>
            <div className="h-96 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
          </div>
        ) : (
          <Card className="mt-7 flex flex-col items-center px-6 py-14 text-center" role="alert">
            <p className="font-heading text-lg font-bold">The catalog didn&apos;t load</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{source.error}</p>
            <button type="button" onClick={source.reload} className="mt-5 inline-flex h-10 items-center gap-2 rounded-full border bg-card px-4 text-sm font-semibold hover:bg-muted">
              <RotateCcw className="size-4" aria-hidden /> Try again
            </button>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[0.8rem] font-medium text-muted-foreground">
            Catalog {live ? null : <AdminDemoTag>Admin demo</AdminDemoTag>}
          </p>
          <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Services &amp; Pricing</h1>
          <p className="mt-1 max-w-2xl text-[0.95rem] text-muted-foreground">
            Manage the catalog, set pricing and track what each service needs before it can be ordered.{" "}
            {live ? "Changes are saved to the catalog and recorded in the audit log." : "Changes stay in this browser."}
          </p>
        </div>
        <div className={cn("grid gap-2 sm:flex", live ? "grid-cols-1" : "grid-cols-2")}>
          {live ? null : (
            <button
              type="button"
              onClick={() => setResetAsk(true)}
              disabled={!changes}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border bg-card px-4 text-sm font-semibold whitespace-nowrap transition-colors hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="size-4" aria-hidden /> Reset demo{changes ? ` (${changes})` : ""}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditor({ mode: "new", record: blankService() })}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold whitespace-nowrap text-primary-foreground shadow-[0_8px_20px_-12px_rgb(112_71_235/0.9)] transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none"
          >
            <Plus className="size-4" aria-hidden /> Add service
          </button>
        </div>
      </header>

      <dl className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Total services", value: summary.total, note: `${records.length - summary.total} archived` },
          { label: "Platforms", value: summary.platforms, note: "With at least one service" },
          { label: "Priced", value: summary.priced, note: `${summary.total - summary.priced} not priced yet` },
          { label: "Purchase ready", value: summary.purchaseReady, note: "Needs fulfilment, policy and payment approval" },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border bg-card p-4 sm:p-5">
            <dt className="text-[0.8rem] font-semibold text-muted-foreground">{t.label}</dt>
            <dd className="mt-2 font-heading text-[1.75rem] leading-none font-extrabold tabular-nums">{t.value}</dd>
            <dd className="mt-2 text-xs text-muted-foreground">{t.note}</dd>
          </div>
        ))}
      </dl>

      <p role="status" aria-live="polite" className="sr-only">
        {notice?.tone === "ok" ? notice.text : ""}
      </p>
      {notice ? (
        <div
          role={notice.tone === "error" ? "alert" : undefined}
          className={cn(
            "mt-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm",
            notice.tone === "error" ? "border-destructive/30 bg-destructive/5" : "border-ok/30 bg-ok-soft/60",
          )}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="grid size-7 place-items-center rounded-full hover:bg-background/60">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}

      <Card aria-labelledby="catalog-title" className="mt-6 overflow-hidden">
        <h2 id="catalog-title" className="sr-only">
          Service catalog
        </h2>
        <div className="space-y-3 p-4 sm:p-5">
          {/* Search leads; Platform and Status are the everyday filters; the rest live under More filters. */}
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <label htmlFor="svc-search" className="sr-only">
                Search services
              </label>
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                id="svc-search"
                type="search"
                value={f.q}
                onChange={(e) => update({ q: e.target.value })}
                placeholder="Search by name, ID, platform or type"
                autoComplete="off"
                className="h-10 w-full rounded-xl border bg-background ps-9 pe-9 text-sm transition-colors outline-none hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 dark:bg-muted/30 [&::-webkit-search-cancel-button]:hidden"
              />
              {f.q ? (
                <button type="button" onClick={() => update({ q: "" })} aria-label="Clear search" className="absolute end-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(3,minmax(0,auto))] lg:flex">
              <FilterSelect id="f-platform" label="Platform" value={f.platform} onChange={(v) => update({ platform: v })} className="h-10 lg:w-44">
                <option value="">All platforms</option>
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect id="f-status" label="Status" value={statusValue(f)} onChange={(v) => update(statusPatch(v))} className="h-10 lg:w-40">
                <option value="">Any status</option>
                <option value="needs_price">Needs price</option>
                <option value="priced">Priced</option>
                <option value="purchase_ready">Purchase ready</option>
                <option value="purchase_off">Purchase off</option>
              </FilterSelect>
              <MoreFilters f={f} update={update} />
            </div>
            <div className="inline-flex shrink-0 gap-1 rounded-xl bg-muted p-1" role="group" aria-label="Show">
              {(["active", "archived"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={f.view === v}
                  onClick={() => update({ view: v })}
                  className={cn(
                    "h-8 flex-1 rounded-lg px-3 text-[0.82rem] font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                    f.view === v && "bg-card text-foreground shadow-sm",
                  )}
                >
                  {v === "active" ? "Active" : "Archived"} <span className="text-xs tabular-nums">{records.filter((r) => (v === "archived" ? r.archived : !r.archived)).length}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-h-7 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <p aria-live="polite" className="me-1.5">
              {matches.length} service{matches.length === 1 ? "" : "s"}
              {matches.length > PAGE_SIZE ? ` · page ${page} of ${pages}` : ""}
            </p>
            {chips(f).map((c) => (
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
            {chips(f).length ? (
              <button type="button" onClick={() => update({ ...DEFAULTS, view: f.view })} className="ms-0.5 font-semibold text-primary hover:underline">
                Clear all
              </button>
            ) : null}
          </div>
        </div>

        {selected.size ? (
          <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 border-y bg-secondary/50 px-4 py-2.5 sm:px-5 dark:bg-secondary/25">
            <p className="me-auto text-sm font-semibold">{selected.size} selected</p>
            {f.view === "active" ? (
              <>
                <BulkButton onClick={() => setBulk("show")} icon={Eye}>
                  Show in catalog
                </BulkButton>
                <BulkButton onClick={() => setBulk("hide")} icon={EyeOff}>
                  Hide
                </BulkButton>
                <BulkButton onClick={() => setBulk("archive")} icon={Archive} danger>
                  Archive
                </BulkButton>
              </>
            ) : (
              <BulkButton onClick={() => setBulk("restore")} icon={RotateCcw}>
                Restore
              </BulkButton>
            )}
            <button type="button" onClick={() => setSelected(new Set())} className={linkButton}>
              Clear
            </button>
          </div>
        ) : null}

        {rows.length ? (
          <>
            {/* Wide screens: four compact columns */}
            <div className="hidden xl:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Services, {f.view}</caption>
                <thead className="border-y bg-muted/40 text-[0.68rem] tracking-wider text-muted-foreground uppercase">
                  <tr>
                    <th scope="col" className="w-10 py-2 ps-5">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={allOnPage}
                        onChange={() => setSelected((cur) => (allOnPage ? new Set([...cur].filter((id) => !pageIds.includes(id))) : new Set([...cur, ...pageIds])))}
                        className="size-4 accent-[var(--primary)]"
                      />
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-bold">Service</th>
                    <th scope="col" className="w-60 px-3 py-2 text-start font-bold">Pricing</th>
                    <th scope="col" className="w-64 px-3 py-2 text-start font-bold">Status</th>
                    <th scope="col" className="w-32 py-2 pe-5 text-end font-bold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => {
                    const p = PLATFORM_BY_ID[r.platformId];
                    return (
                      <tr key={r.id} className={cn("group/row transition-colors hover:bg-muted/40", selected.has(r.id) && "bg-secondary/30 hover:bg-secondary/40")}>
                        <td className="py-2.5 ps-5">
                          <input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="size-4 accent-[var(--primary)]" />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-3">
                            <PlatformTile platform={p} size="sm" className="size-8" />
                            <button
                              type="button"
                              onClick={() => setEditor({ mode: "edit", record: r })}
                              className="min-w-0 text-start focus-visible:rounded focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                            >
                              <span className="line-clamp-1 font-semibold group-hover/row:text-primary">{r.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {p.short} · {CATEGORY_META[r.category].short} · <span className="font-mono text-[0.7rem]">{r.id}</span>
                              </span>
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <PricingCell record={r} onSetPrice={() => setEditor({ mode: "edit", record: r, section: "pricing" })} />
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusCell record={r} />
                        </td>
                        <td className="py-2.5 pe-5">
                          <RowActions record={r} onEdit={() => setEditor({ mode: "edit", record: r })} onDuplicate={() => duplicate(r)} onArchive={(a) => archive(r, a)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Phones & tablets: compact cards */}
            <ul className="divide-y border-t xl:hidden" aria-label="Services">
              {rows.map((r) => {
                const p = PLATFORM_BY_ID[r.platformId];
                return (
                  <li key={r.id} className={cn("flex gap-3 px-4 py-3 sm:px-5", selected.has(r.id) && "bg-secondary/30")}>
                    <input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="mt-2.5 size-4 shrink-0 accent-[var(--primary)]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2.5">
                        <PlatformTile platform={p} size="sm" className="size-8" />
                        <button type="button" onClick={() => setEditor({ mode: "edit", record: r })} className="min-w-0 flex-1 text-start focus-visible:rounded focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none">
                          <span className="line-clamp-2 text-sm font-semibold">{r.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.short} · {CATEGORY_META[r.category].short}
                          </span>
                        </button>
                        <RowActions record={r} onEdit={() => setEditor({ mode: "edit", record: r })} onDuplicate={() => duplicate(r)} onArchive={(a) => archive(r, a)} compact />
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 ps-[2.625rem]">
                        <PricingCell record={r} onSetPrice={() => setEditor({ mode: "edit", record: r, section: "pricing" })} />
                        <StatusCell record={r} inline />
                      </div>
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
                  <button
                    type="button"
                    onClick={() => update({ page: page - 1 })}
                    disabled={page === 1}
                    aria-label="Previous page"
                    className="grid size-9 place-items-center rounded-full border bg-card transition-colors hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:opacity-40"
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                  </button>
                  <span className="px-2 text-xs font-semibold tabular-nums" aria-current="page">
                    {page} / {pages}
                  </span>
                  <button
                    type="button"
                    onClick={() => update({ page: page + 1 })}
                    disabled={page === pages}
                    aria-label="Next page"
                    className="grid size-9 place-items-center rounded-full border bg-card transition-colors hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:opacity-40"
                  >
                    <ChevronRight className="size-4" aria-hidden />
                  </button>
                </div>
              </nav>
            ) : null}
          </>
        ) : (
          <div className="border-t px-6 py-14 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <SearchX className="size-6" aria-hidden />
            </span>
            <p className="mt-4 font-semibold">{f.view === "archived" && !filtered ? "No archived services" : "No services match"}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {f.view === "archived" && !filtered ? "Archived services appear here and can be restored at any time." : "Try a different search or clear the filters."}
            </p>
            {filtered ? (
              <button type="button" onClick={() => update({ ...DEFAULTS, view: f.view, sort: f.sort })} className={cn(linkButton, "mt-3 border bg-card")}>
                Clear filters
              </button>
            ) : null}
          </div>
        )}
      </Card>

      <ServiceEditor
        open={Boolean(editor)}
        mode={editor?.mode ?? "edit"}
        initial={editor?.record ?? null}
        initialSection={editor?.section}
        onClose={() => setEditor(null)}
        onSave={onSave}
        onDuplicate={duplicate}
        onArchive={archive}
        live={live}
        exists={source.exists}
      />

      <ConfirmDialog
        open={bulk !== null}
        onOpenChange={(o) => !o && setBulk(null)}
        title={
          bulk === "archive"
            ? `Archive ${selected.size} service${selected.size === 1 ? "" : "s"}?`
            : bulk === "restore"
              ? `Restore ${selected.size} service${selected.size === 1 ? "" : "s"}?`
              : `${bulk === "show" ? "Show" : "Hide"} ${selected.size} service${selected.size === 1 ? "" : "s"}?`
        }
        description={
          bulk === "archive"
            ? "They leave the catalog and the active list. Pricing and settings are kept, and you can restore them later."
            : bulk === "restore"
              ? "They return to the active list with their previous settings."
              : bulk === "show"
                ? "They become visible in the catalog. Visibility never enables ordering — each service still needs every eligibility check."
                : "They're hidden from the catalog. Nothing else changes."
        }
        confirmLabel={bulk === "archive" ? "Archive" : bulk === "restore" ? "Restore" : bulk === "show" ? "Show in catalog" : "Hide from catalog"}
        tone={bulk === "archive" ? "danger" : "default"}
        icon={bulk === "archive" ? Archive : bulk === "restore" ? RotateCcw : bulk === "show" ? Eye : EyeOff}
        onConfirm={runBulk}
      />
      <ConfirmDialog
        open={resetAsk}
        onOpenChange={setResetAsk}
        title="Reset admin demo data?"
        description="Every service edit, draft and archive made in this browser is removed and the catalog returns to its baseline. Customer demo data isn't affected."
        confirmLabel="Reset admin data"
        tone="danger"
        icon={RotateCcw}
        onConfirm={() => {
          source.reset();
          setSelected(new Set());
          flash("Admin demo data reset.");
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small pieces                                                              */
/* -------------------------------------------------------------------------- */

function FilterSelect({
  id,
  label,
  value,
  onChange,
  className,
  children,
  plain,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  children: React.ReactNode;
  /** Sorting isn't a filter, so it isn't highlighted when set. */
  plain?: boolean;
}) {
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <SelectInput id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn(className, value && !plain && "border-primary/50 bg-secondary/40 dark:bg-secondary/20")}>
        {children}
      </SelectInput>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Status filter, chips and More filters                                     */
/* -------------------------------------------------------------------------- */

type StatusValue = "" | "needs_price" | "priced" | "purchase_ready" | "purchase_off";

/** The Status filter is a shortcut over the existing pricing and purchase filters (same URL params). */
function statusValue(f: Filters): StatusValue {
  if (f.purchase === "ready") return "purchase_ready";
  if (f.purchase === "not_enabled") return "purchase_off";
  if (f.pricing === "unpriced") return "needs_price";
  if (f.pricing === "priced") return "priced";
  return "";
}

function statusPatch(v: string): Partial<Filters> {
  switch (v as StatusValue) {
    case "needs_price":
      return { pricing: "unpriced", purchase: "" };
    case "priced":
      return { pricing: "priced", purchase: "" };
    case "purchase_ready":
      return { pricing: "", purchase: "ready" };
    case "purchase_off":
      return { pricing: "", purchase: "not_enabled" };
    default:
      return { pricing: "", purchase: "" };
  }
}

const SORT_LABEL: Record<Sort, string> = { name: "Name A–Z", platform: "Platform", price: "Highest price", margin: "Highest margin", updated: "Recently edited" };

/** Active filters as removable chips. Search has its own clear button. */
function chips(f: Filters) {
  const list: { key: string; label: string; clear: Partial<Filters> }[] = [];
  if (f.platform) list.push({ key: "platform", label: PLATFORM_BY_ID[f.platform].name, clear: { platform: "" } });
  const status = statusValue(f);
  if (status) {
    const labels: Record<Exclude<StatusValue, "">, string> = { needs_price: "Needs price", priced: "Priced", purchase_ready: "Purchase ready", purchase_off: "Purchase off" };
    list.push({ key: "status", label: labels[status], clear: { pricing: "", purchase: "" } });
  }
  if (f.type) list.push({ key: "type", label: CATEGORY_META[f.type].label, clear: { type: "" } });
  if (f.visibility) list.push({ key: "visibility", label: f.visibility === "visible" ? "Visible" : "Hidden", clear: { visibility: "" } });
  if (f.sort !== DEFAULTS.sort) list.push({ key: "sort", label: `Sort: ${SORT_LABEL[f.sort]}`, clear: { sort: DEFAULTS.sort } });
  return list;
}

const popupClassSm = popupSurface;

function MoreFilters({ f, update }: { f: Filters; update: (patch: Partial<Filters>) => void }) {
  const count = [f.type, f.visibility, f.sort !== DEFAULTS.sort ? "sort" : ""].filter(Boolean).length;
  const label = "text-xs font-semibold text-muted-foreground";
  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          "inline-flex h-10 items-center justify-center gap-2 rounded-xl border bg-background px-3.5 text-sm font-semibold transition-colors hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-primary/15 focus-visible:outline-none data-popup-open:border-primary/50 dark:bg-muted/30",
          count && "border-primary/50 bg-secondary/40 dark:bg-secondary/20",
          "col-span-2 sm:col-span-1",
        )}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        More filters
        {count ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.68rem] font-bold text-primary-foreground tabular-nums">{count}</span> : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <Popover.Popup className={cn(popupClassSm, "w-[min(20rem,calc(100vw-1.5rem))] space-y-3 p-4")}>
            <Popover.Title className="text-sm font-bold">More filters</Popover.Title>
            <div className="space-y-1.5">
              <p aria-hidden className={label}>
                Service type
              </p>
              <FilterSelect id="f-type" label="Service type" value={f.type} onChange={(v) => update({ type: v as ServiceCategory | "" })} className="h-10">
                <option value="">All types</option>
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </option>
                ))}
              </FilterSelect>
            </div>
            <div className="space-y-1.5">
              <p aria-hidden className={label}>
                Pricing
              </p>
              <FilterSelect id="f-pricing" label="Pricing" value={f.pricing} onChange={(v) => update({ pricing: v as Filters["pricing"] })} className="h-10">
                <option value="">Any pricing</option>
                <option value="priced">Priced</option>
                <option value="unpriced">Not priced</option>
              </FilterSelect>
            </div>
            <div className="space-y-1.5">
              <p aria-hidden className={label}>
                Visibility
              </p>
              <FilterSelect id="f-visibility" label="Visibility" value={f.visibility} onChange={(v) => update({ visibility: v as Filters["visibility"] })} className="h-10">
                <option value="">Any visibility</option>
                <option value="visible">Visible</option>
                <option value="hidden">Hidden</option>
              </FilterSelect>
            </div>
            <div className="space-y-1.5">
              <p aria-hidden className={label}>
                Sort by
              </p>
              <div className="relative">
                <FilterSelect plain id="f-sort" label="Sort" value={f.sort} onChange={(v) => update({ sort: v as Sort })} className="h-10">
                  {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
                    <option key={s} value={s}>
                      {SORT_LABEL[s]}
                    </option>
                  ))}
                </FilterSelect>
              </div>
            </div>
            {count ? (
              <button type="button" onClick={() => update({ type: "", visibility: "", sort: DEFAULTS.sort })} className="text-xs font-semibold text-primary hover:underline">
                Reset these filters
              </button>
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* -------------------------------------------------------------------------- */
/*  Compact cells                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Customer price is the headline; cost and margin sit underneath.
 * Unpriced services say so plainly and offer Set price right there.
 */
function PricingCell({ record: r, onSetPrice }: { record: ServiceRecord; onSetPrice: () => void }) {
  const { model, cost, price } = r.pricing;
  if (cost === null || price === null) {
    return (
      <div className="min-w-0">
        <p className="text-sm font-semibold text-muted-foreground">Pricing not set</p>
        <button
          type="button"
          onClick={onSetPrice}
          aria-label={`Set price for ${r.name}`}
          title="Add your cost and the customer price"
          className="mt-1 inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-primary/45 bg-secondary/40 px-2.5 text-xs font-semibold whitespace-nowrap text-primary transition-colors hover:border-primary hover:bg-secondary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none dark:bg-secondary/20"
        >
          <Tag className="size-3.5" aria-hidden /> Set price
        </button>
      </div>
    );
  }
  const m = unitMargin(r.pricing);
  return (
    <div className="min-w-0">
      <p className="leading-tight tabular-nums">
        <span className="text-[0.95rem] font-bold">{money(price, model)}</span>{" "}
        <span className="text-xs font-medium text-muted-foreground">{unitShort[model]}</span>
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs tabular-nums">
        <span className="text-muted-foreground">Cost {money(cost, model)}</span>
        <MarginText margin={m?.margin ?? null} />
      </p>
    </div>
  );
}

/** Pricing state first, then purchase. Visibility only shows when it's the exception (hidden). */
function StatusCell({ record: r, inline }: { record: ServiceRecord; inline?: boolean }) {
  const lifecycle = lifecycleOf(r);
  return (
    <div className={cn("flex flex-wrap items-center gap-1", inline && "justify-end")}>
      {lifecycle ? <LifecycleBadge lifecycle={lifecycle} /> : <PricingBadge status={pricingStatus(r)} />}
      <PurchaseBadge status={purchaseStatus(r)} />
      {!r.archived && !r.visible ? <VisibilityBadge visible={false} /> : null}
    </div>
  );
}

/** Green when healthy, amber under 15%, muted when it can't be worked out. */
function MarginText({ margin }: { margin: number | null }) {
  if (margin === null) return <span className="text-muted-foreground">Margin —</span>;
  const low = margin < 15;
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold", low ? "text-soon" : "text-ok")} title={low ? "Low margin (under 15%)" : "Healthy margin"}>
      <span className={cn("size-1.5 rounded-full", low ? "bg-soon" : "bg-ok")} aria-hidden />+{margin.toFixed(1)}% margin
    </span>
  );
}

function BulkButton({ onClick, icon: Icon, danger, children }: { onClick: () => void; icon: typeof Eye; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-semibold transition-colors focus-visible:ring-3 focus-visible:outline-none",
        danger ? "border-destructive/30 text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/30" : "hover:border-primary/40 hover:text-primary focus-visible:ring-primary/30",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {children}
    </button>
  );
}

const menuItem = sharedMenuItem;
const popupClass = menuPopup;

function RowActions({
  record,
  onEdit,
  onDuplicate,
  onArchive,
  compact,
}: {
  record: ServiceRecord;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: (archived: boolean) => void;
  compact?: boolean;
}) {
  const [ask, setAsk] = React.useState(false);
  return (
    <div className="flex items-center justify-end gap-1">
      {!compact ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${record.name}`}
          className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[0.8rem] font-semibold text-primary transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          <Pencil className="size-3.5" aria-hidden /> Edit
        </button>
      ) : null}
      <Menu.Root>
        <Menu.Trigger
          aria-label={`More actions for ${record.name}`}
          className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none data-popup-open:bg-muted"
        >
          <Ellipsis className="size-4" aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={12} className="z-50">
            <Menu.Popup className={cn(popupClass, "w-48")}>
              <Menu.Item className={menuItem} onClick={onEdit}>
                <Pencil aria-hidden /> Edit
              </Menu.Item>
              <Menu.Item className={menuItem} onClick={onDuplicate}>
                <Copy aria-hidden /> Duplicate
              </Menu.Item>
              {record.archived ? (
                <Menu.Item className={menuItem} onClick={() => onArchive(false)}>
                  <RotateCcw aria-hidden /> Restore
                </Menu.Item>
              ) : (
                <Menu.Item className={cn(menuItem, "text-destructive [&_svg]:text-destructive")} onClick={() => setAsk(true)}>
                  <Archive aria-hidden /> Archive
                </Menu.Item>
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <ConfirmDialog
        open={ask}
        onOpenChange={setAsk}
        title={`Archive ${record.name}?`}
        description="It's hidden from the catalog and the active list. You can restore it at any time; its ID stays reserved."
        confirmLabel="Archive service"
        tone="danger"
        icon={Archive}
        onConfirm={() => onArchive(true)}
      />
    </div>
  );
}
