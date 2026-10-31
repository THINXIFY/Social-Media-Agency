"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BarChart3, Bot, Briefcase, CalendarRange, ChevronLeft, ChevronRight, Download, Gift, Info, LifeBuoy, type LucideIcon, Package, RefreshCw, Search, Users, Wallet } from "lucide-react";
import { RANGE_PRESETS, type RangePreset } from "@/lib/admin-overview";
import { api, ApiError } from "@/lib/live-account";
import { ORDER_STATUS_META, type OrderStatus } from "@/lib/orders";
import { type Column, type Kpi, REPORT_BY_ID, type ReportId, type ReportResponse, REPORTS } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { Bars, Delta, Empty, HBars, micros, money, num, Panel } from "./live-overview";
import { SelectInput } from "./form";

/*
 * Live Admin Reports (Phase 5H-B). Everything comes from GET /api/admin/reports;
 * CSV comes from /api/admin/reports/export with the same query string, so a
 * table and its export always use the same filters. State lives in the URL.
 */

const ICON: Record<ReportId, LucideIcon> = { business: Briefcase, customers: Users, orders: Package, financial: Wallet, support: LifeBuoy, referrals: Gift, ai: Bot };
const FILTER_KEYS = ["q", "status", "platform", "category", "flagged", "page"] as const;
const btn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";
const quiet = cn(btn, "border bg-card hover:bg-muted");
const field = "h-9 w-full rounded-xl border bg-background px-3 text-sm transition-colors outline-none placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 dark:bg-muted/30";

const fmtMinutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim());
const fmtKpi = (k: Pick<Kpi, "kind" | "value">) => (k.kind === "cents" ? money(k.value) : k.kind === "micros" ? micros(k.value) : k.kind === "minutes" ? fmtMinutes(k.value) : num(k.value));
const STATUS_LABEL = (v: string) => ORDER_STATUS_META[v as OrderStatus]?.label ?? v.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase());
function cell(col: Column, v: string | number | boolean | null, tz: string) {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  switch (col.kind) {
    case "cents":
      return money(Number(v));
    case "count":
      return num(Number(v));
    case "minutes":
      return fmtMinutes(Number(v));
    case "bool":
      return v ? "Yes" : "No";
    case "status":
      return <span className="inline-flex h-6 items-center rounded-full bg-muted px-2 text-[0.72rem] font-semibold whitespace-nowrap">{STATUS_LABEL(String(v))}</span>;
    case "datetime":
      return <time dateTime={String(v)}>{new Date(String(v)).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz })}</time>;
    default:
      return col.key === "tool" || col.key === "review_signals" ? String(v).replace(/_/g, " ") : String(v);
  }
}

export function LiveReports({ allowed }: { allowed: ReportId[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get("report");
  const report = (allowed.includes(requested as ReportId) ? requested : allowed[0]) as ReportId | undefined;
  const urlPreset = (RANGE_PRESETS.some(([id]) => id === params.get("range")) ? params.get("range") : null) as RangePreset | null;
  const [draft, setDraft] = React.useState({ from: params.get("from") ?? "", to: params.get("to") ?? "" });
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const [n, setN] = React.useState(0);
  const [exporting, setExporting] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const qs = new URLSearchParams();
  if (report) qs.set("report", report);
  for (const k of ["range", "from", "to", ...FILTER_KEYS]) {
    const v = params.get(k);
    if (v) qs.set(k, v);
  }
  const ready = report && !(urlPreset === "custom" && (!params.get("from") || !params.get("to")));
  const url = ready ? `/api/admin/reports?${qs}` : null;
  const key = url ? `${url}#${n}` : null;
  const [state, setState] = React.useState<{ key?: string; data?: ReportResponse; error?: string }>({});
  React.useEffect(() => {
    if (!url || !key) return;
    let cancelled = false;
    api<ReportResponse>(url).then(
      (data) => !cancelled && setState({ key, data }),
      (e: unknown) => !cancelled && setState((s) => ({ ...s, key, error: e instanceof ApiError || e instanceof Error ? e.message : "This report couldn't be loaded." })),
    );
    return () => {
      cancelled = true;
    };
  }, [url, key]);
  const loading = Boolean(key) && state.key !== key;
  const d = state.data && state.data.report === report ? state.data : undefined;
  const preset = urlPreset ?? d?.range.preset ?? null;

  const go = (patch: Record<string, string | null>, resetFilters = false) => {
    const u = new URLSearchParams(params.toString());
    if (resetFilters) for (const k of FILTER_KEYS) u.delete(k);
    for (const [k, v] of Object.entries(patch)) {
      if (v) u.set(k, v);
      else u.delete(k);
    }
    if (!("page" in patch)) u.delete("page");
    router.replace(`${pathname}?${u}`, { scroll: false });
  };
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      if ((params.get("q") ?? "") !== q.trim()) go({ q: q.trim() || null });
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the typed text should trigger this
  }, [q]);

  const exportCsv = async () => {
    setExporting(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/reports/export?${qs}`, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "The export couldn't be created.");
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "socivanta-report.csv";
      const lines = (await blob.text()).split("\r\n").filter(Boolean).length - 1;
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      a.click();
      URL.revokeObjectURL(href);
      setNotice({ tone: "ok", text: `Exported ${num(lines)} row${lines === 1 ? "" : "s"} to ${name}.` });
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : "The export couldn't be created." });
    } finally {
      setExporting(false);
    }
  };

  if (!report)
    return (
      <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h1 className="font-heading text-[1.75rem] font-extrabold tracking-tight">Reports</h1>
        <p className="mt-2 text-muted-foreground">Your role doesn&apos;t include any reports.</p>
      </div>
    );
  const meta = REPORT_BY_ID[report];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: d?.range.timezone ?? "UTC" });

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-[0.8rem] font-medium text-muted-foreground">Analytics</p>
          <h1 className="mt-1.5 font-heading text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Reports</h1>
          <p className="mt-1 max-w-2xl text-[0.95rem] text-muted-foreground">Accurate figures from SociVanta&apos;s records, with CSV export for the rows behind them.</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 xl:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-full border bg-card p-1" role="radiogroup" aria-label="Date range">
              {RANGE_PRESETS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={preset === id}
                  onClick={() => (id === "custom" ? go({ range: "custom", from: draft.from || d?.range.from || null, to: draft.to || d?.range.to || null }) : go({ range: id, from: null, to: null }))}
                  className={cn("inline-flex h-8 shrink-0 items-center rounded-full px-2.5 text-[0.8rem] font-semibold whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:px-3", preset === id ? "bg-graphite text-white dark:bg-white dark:text-graphite" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setN((x) => x + 1)} disabled={loading || !url} className={quiet} aria-label="Refresh report">
              <RefreshCw className={cn("size-4", loading && "animate-spin motion-reduce:animate-none")} aria-hidden /> <span className="hidden sm:inline">Refresh</span>
            </button>
            <button type="button" onClick={exportCsv} disabled={exporting || !d} className={cn(btn, "bg-primary text-primary-foreground shadow-[0_10px_24px_-14px_rgb(112_71_235/0.9)] hover:bg-primary/90")}>
              <Download className="size-4" aria-hidden /> {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
          {preset === "custom" ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                go({ range: "custom", from: draft.from, to: draft.to });
              }}
            >
              <label className="text-xs font-semibold text-muted-foreground">
                From
                <input type="date" required max={today} value={draft.from || params.get("from") || ""} onChange={(e) => setDraft((x) => ({ ...x, from: e.target.value }))} className="mt-1 block h-9 rounded-xl border bg-background px-2.5 text-sm text-foreground dark:bg-muted/30" />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                To
                <input type="date" required max={today} value={draft.to || params.get("to") || ""} onChange={(e) => setDraft((x) => ({ ...x, to: e.target.value }))} className="mt-1 block h-9 rounded-xl border bg-background px-2.5 text-sm text-foreground dark:bg-muted/30" />
              </label>
              <button type="submit" className={cn(btn, "bg-primary text-primary-foreground hover:bg-primary/90")}>
                Apply
              </button>
            </form>
          ) : null}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            <CalendarRange className="size-3.5 shrink-0" aria-hidden />
            {d ? `${d.range.label} · Updated ${new Date(d.generatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}` : "Loading…"}
          </p>
        </div>
      </header>

      {notice ? (
        <p role={notice.tone === "error" ? "alert" : "status"} className={cn("mt-4 rounded-xl border px-3.5 py-2.5 text-sm", notice.tone === "error" ? "border-destructive/30 bg-destructive/[0.05]" : "border-ok/30 bg-ok-soft/50")}>
          {notice.text}
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Reports" className="min-w-0">
          <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-20 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
            {REPORTS.filter((x) => allowed.includes(x.id)).map((x) => {
              const Icon = ICON[x.id];
              const active = x.id === report;
              return (
                <li key={x.id} className="shrink-0">
                  <button type="button" aria-current={active ? "page" : undefined} onClick={() => go({ report: x.id }, true)} className={cn("flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none", active ? "bg-primary/[0.09] text-primary dark:bg-primary/20 dark:text-[#c4b5ff]" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {x.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0" aria-busy={loading}>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 font-heading text-xl font-bold tracking-tight">
              <BarChart3 className="size-5 text-primary dark:text-[#c4b5ff]" aria-hidden /> {meta.label}
            </h2>
            <p className="text-sm text-muted-foreground">{meta.description}</p>
          </div>
          {state.error && state.key === key ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/[0.05] p-4 text-sm">
              <span>
                <span className="font-semibold">This report couldn&apos;t be loaded.</span> <span className="text-muted-foreground">{state.error}</span>
              </span>
              <button type="button" onClick={() => setN((x) => x + 1)} className={quiet}>
                Try again
              </button>
            </div>
          ) : !d ? (
            <div aria-busy="true" className="space-y-4">
              <span className="sr-only">Loading the report…</span>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
                ))}
              </div>
              <div className="h-72 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
            </div>
          ) : (
            <ReportBody d={d} stale={loading} q={q} setQ={setQ} params={params} go={go} />
          )}
        </div>
      </div>
    </div>
  );
}

function ReportBody({ d, stale, q, setQ, params, go }: { d: ReportResponse; stale: boolean; q: string; setQ: (v: string) => void; params: URLSearchParams; go: (p: Record<string, string | null>) => void }) {
  const tz = d.range.timezone;
  return (
    <div className={cn("space-y-5 transition-opacity", stale && "opacity-60")}>
      <section aria-label="Key figures" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {d.kpis.map((k) => (
          <div key={k.id} className="min-w-0 rounded-2xl border bg-card p-4">
            <p className="text-[0.8rem] font-medium text-muted-foreground">{k.label}</p>
            <p className="mt-2 truncate font-heading text-[1.5rem] leading-none font-extrabold tracking-tight tabular-nums">{fmtKpi(k)}</p>
            {k.previous !== undefined ? (
              <p className="mt-2 text-xs">
                <Delta c={{ value: k.value, previous: k.previous }} />
              </p>
            ) : null}
            {k.hint ? <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p> : null}
          </div>
        ))}
      </section>

      {d.notes?.length ? (
        <ul className="space-y-1.5 rounded-2xl border border-primary/20 bg-primary/[0.04] p-3.5 text-sm dark:bg-primary/10">
          {d.notes.map((t) => (
            <li key={t} className="flex gap-2">
              <Info className="mt-0.5 size-4 shrink-0 text-primary dark:text-[#c4b5ff]" aria-hidden />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {d.series?.length ? (
        <div className={cn("grid grid-cols-1 gap-4", d.series.length > 1 && "2xl:grid-cols-2")}>
          {d.series.map((s) => (
            <Panel key={s.title} title={s.title} aside={<span className="tabular-nums">{s.kind === "cents" ? money(s.points.reduce((a, p) => a + p.value, 0)) : num(s.points.reduce((a, p) => a + p.value, 0))} total</span>}>
              <Bars tz={tz} series={s.points} unit={d.range.unit} label={s.title} format={s.kind === "cents" ? money : num} axis={s.kind === "cents" ? (c) => money(c).replace(/\.00$/, "") : undefined} />
            </Panel>
          ))}
        </div>
      ) : null}

      {d.breakdowns?.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {d.breakdowns.map((b) => (
            <Panel key={b.id} title={b.title} aside={b.hint}>
              <HBars empty="Nothing recorded in this period." items={b.items} format={b.kind === "cents" ? money : num} />
            </Panel>
          ))}
        </div>
      ) : null}

      {d.table ? (
        <section aria-labelledby="report-table" className="min-w-0 rounded-2xl border bg-card">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b p-3 sm:p-4">
            <div>
              <h3 id="report-table" className="text-sm font-bold">
                {d.table.title}
              </h3>
              <p className="text-xs text-muted-foreground">
                {num(d.table.total)} row{d.table.total === 1 ? "" : "s"} · times shown in {tz === "UTC" ? "UTC" : tz}; exports use UTC
              </p>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
                <label htmlFor="rep-search" className="sr-only">
                  Search this table
                </label>
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input id="rep-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} placeholder="Search" className={cn(field, "ps-9")} />
              </div>
              {d.filters?.map((f) => (
                <div key={f.id} className="w-full min-[420px]:w-44">
                  <SelectInput aria-label={f.label} value={params.get(f.id) ?? ""} onChange={(e) => go({ [f.id]: e.target.value || null })} className="h-9">
                    <option value="">Any {f.label.toLowerCase()}</option>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </SelectInput>
                </div>
              ))}
              {d.report === "referrals" ? (
                <label className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-sm">
                  <input type="checkbox" checked={params.get("flagged") === "1"} onChange={(e) => go({ flagged: e.target.checked ? "1" : null })} className="size-4 accent-[var(--primary)]" />
                  Flagged only
                </label>
              ) : null}
            </div>
          </div>
          {d.table.rows.length === 0 ? (
            <div className="p-4">
              <Empty text={params.get("q") || params.get("status") || params.get("platform") || params.get("category") || params.get("flagged") ? "No rows match these filters." : "No records in this period."} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    {d.table.columns.map((c) => (
                      <th key={c.key} scope="col" className={cn("px-3 py-2 font-semibold whitespace-nowrap sm:px-4", c.kind === "count" || c.kind === "cents" || c.kind === "minutes" ? "text-end" : "text-start")}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {d.table.rows.map((row, i) => {
                    const href = d.table!.rowHref?.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(String(row[k] ?? "")));
                    return (
                      <tr key={i} className="transition-colors hover:bg-muted/40">
                        {d.table!.columns.map((c, j) => (
                          <td key={c.key} className={cn("px-3 py-2.5 whitespace-nowrap sm:px-4", c.kind === "count" || c.kind === "cents" || c.kind === "minutes" ? "text-end tabular-nums" : "")}>
                            {j === 0 && href ? (
                              <Link href={href} className="font-semibold text-primary hover:underline dark:text-[#b9a6ff]">
                                {cell(c, row[c.key], tz)}
                              </Link>
                            ) : (
                              cell(c, row[c.key], tz)
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {d.table.pages > 1 ? (
            <nav aria-label="Table pages" className="flex items-center justify-between gap-2 border-t p-3 text-sm">
              <button type="button" disabled={d.table.page <= 1} onClick={() => go({ page: String(d.table!.page - 1) })} className={quiet}>
                <ChevronLeft className="size-4" aria-hidden /> Previous
              </button>
              <span className="text-muted-foreground tabular-nums">
                Page {d.table.page} of {d.table.pages}
              </span>
              <button type="button" disabled={d.table.page >= d.table.pages} onClick={() => go({ page: String(d.table!.page + 1) })} className={quiet}>
                Next <ChevronRight className="size-4" aria-hidden />
              </button>
            </nav>
          ) : null}
        </section>
      ) : null}

      {d.links?.length ? (
        <div className="flex flex-wrap gap-2">
          {d.links.map((l) => (
            <Link key={l.href} href={l.href} className={quiet}>
              {l.label} <ArrowRight className="size-4" aria-hidden />
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
