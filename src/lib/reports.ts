/*
 * Admin Reports (Phase 5H-B): the report catalogue shared by the server and
 * the UI. Each report needs View on the module that owns its data; the
 * server re-checks this for every request and export.
 */

export const REPORTS = [
  { id: "business", label: "Business overview", module: "overview", description: "Customers, orders and operations at a glance." },
  { id: "customers", label: "Customers", module: "customers", description: "Registrations, confirmed emails and growth." },
  { id: "orders", label: "Orders & services", module: "orders", description: "Volumes, statuses, platforms and categories." },
  { id: "financial", label: "Financial activity", module: "payments", description: "Revenue, funding, wallets and deposits, kept separate." },
  { id: "support", label: "Customer support", module: "support", description: "Ticket volume, first responses and resolutions." },
  { id: "referrals", label: "Referrals", module: "referrals", description: "Attributed sign-ups, reviews and flags." },
  { id: "ai", label: "AI & automation", module: "settings", description: "Requests, tokens, estimated costs and automation runs." },
] as const;
export type ReportId = (typeof REPORTS)[number]["id"];
export const REPORT_BY_ID = Object.fromEntries(REPORTS.map((r) => [r.id, r])) as Record<ReportId, (typeof REPORTS)[number]>;
export const isReportId = (v: unknown): v is ReportId => typeof v === "string" && v in REPORT_BY_ID;

export const TABLE_PAGE_SIZE = 25;
/** Exports larger than this are refused; narrow the range or filters instead. */
export const EXPORT_MAX_ROWS = 10_000;
/** Exports per staff member per 10 minutes. */
export const EXPORT_RATE = { limit: 10, windowSeconds: 600 };

export type Kpi = { id: string; label: string; value: number; kind: "count" | "cents" | "micros" | "minutes"; previous?: number | null; hint?: string };
export type Breakdown = { id: string; title: string; hint?: string; items: { key: string; label: string; value: number; href?: string }[]; kind: "count" | "cents" };
export type Column = { key: string; label: string; kind?: "text" | "count" | "cents" | "datetime" | "bool" | "status" | "minutes" };
export type ReportTable = { title: string; columns: Column[]; rows: Record<string, string | number | boolean | null>[]; total: number; page: number; pages: number; exportable: boolean; rowHref?: string };

export interface ReportResponse {
  report: ReportId;
  range: { preset: string; from: string; to: string; label: string; unit: "hour" | "day"; timezone: string };
  generatedAt: string;
  kpis: Kpi[];
  series?: { title: string; kind: "count" | "cents"; points: { t: string; value: number; beforeData: boolean }[] }[];
  breakdowns?: Breakdown[];
  notes?: string[];
  filters?: { id: string; label: string; options: { value: string; label: string }[] }[];
  table?: ReportTable;
  links?: { label: string; href: string }[];
}
