import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { ResolvedRange } from "@/lib/admin-overview";
import { ORDER_STATUS_META, type OrderStatus } from "@/lib/orders";
import { FLAG_LABEL, REFERRAL_STATUS_META, type ReferralFlag, type ReferralStatus } from "@/lib/referrals";
import { type Column, EXPORT_MAX_ROWS, type Kpi, REPORT_BY_ID, type ReportId, type ReportResponse, TABLE_PAGE_SIZE } from "@/lib/reports";
import { CATEGORY_LABEL, STATUS_META, type TicketCategory, type TicketStatus } from "@/lib/support";
import { overview as aiOverview } from "../ai/control/usage";
import { allows, type RoleAccess } from "../auth/permissions";
import { catalogCounts } from "../catalog/catalog";
import type { Db } from "../db/client";
import { DEPOSIT_STATUS, ORDER_STATUS, REFERRAL_STATUS, TICKET_CATEGORY, TICKET_STATUS } from "../db/schema/enums";
import type { Env } from "../env";
import { AppError, errors } from "../errors";
import { balanceSummary } from "../payments/reconcile";
import { adminOverview, compared, rows, series } from "./overview";

/*
 * Admin Reports (Phase 5H-B). Read-only, built on the 5H-A definitions
 * (`compared`, `series`, `balanceSummary`, `adminOverview`), so a figure
 * means the same thing on the Overview, in a report and in its export.
 *
 *  - Each report needs View on the module that owns its data (REPORTS in
 *    lib/reports.ts); cross-module fields are added only when the viewer
 *    can see that module too.
 *  - Every table is one query definition used by both the paginated view
 *    and the CSV export, so they reconcile for identical filters.
 *  - Tables show customer references, never emails; audit payloads,
 *    secrets and credentials are never selected.
 */

type Filters = { q: string; status: string; platform: string; category: string; flagged: boolean; page: number };
type Ctx = { db: Db; env: Env; access: RoleAccess; r: ResolvedRange; f: Filters; since: Date | null; comparable: boolean };
type TableDef = { title: string; columns: Column[]; from: SQL; where: SQL; select: SQL; order: SQL; rowHref?: string };

const n = (v: unknown) => Number(v ?? 0);
const iso = (col: SQL) => sql`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const inWindow = (col: SQL, r: ResolvedRange) => sql`${col} >= ${r.start} and ${col} < ${r.end}`;
const can = (c: Ctx, m: string) => allows(c.access, `${m}:view` as never);

export function parseFilters(p: URLSearchParams): Filters {
  const s = (k: string, re: RegExp) => {
    const v = (p.get(k) ?? "").trim();
    return re.test(v) ? v : "";
  };
  const page = Number(p.get("page") ?? 1);
  return {
    q: (p.get("q") ?? "").trim().slice(0, 80),
    status: s("status", /^[a-z_]{1,40}$/),
    platform: s("platform", /^[a-z0-9-]{1,40}$/),
    category: s("category", /^[a-z_]{1,40}$/),
    flagged: p.get("flagged") === "1",
    page: Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1,
  };
}

const kpi = (id: string, label: string, value: number, kind: Kpi["kind"], extra: Partial<Kpi> = {}): Kpi => ({ id, label, value, kind, ...extra });
const cmp = (id: string, label: string, c: { value: number; previous: number | null }, kind: Kpi["kind"], hint?: string) => kpi(id, label, c.value, kind, { previous: c.previous, hint });
const one = async <T extends Record<string, unknown>>(db: Db, q: SQL) => (await rows<T>(db, q))[0] ?? ({} as T);

/* -------------------------------------------------------------------------- */
/*  Table definitions (shared by the view and the export)                     */
/* -------------------------------------------------------------------------- */

function customersTable(c: Ctx): TableDef {
  const conds: SQL[] = [inWindow(sql`c.created_at`, c.r)];
  if (c.f.q) conds.push(sql`(c.public_ref ilike ${like(c.f.q)} or c.first_name ilike ${like(c.f.q)} or c.last_name ilike ${like(c.f.q)})`);
  const orders = can(c, "orders");
  return {
    title: "Customers who joined in this period",
    columns: [
      { key: "customer_ref", label: "Customer" },
      { key: "name", label: "Name" },
      { key: "joined_at_utc", label: "Joined (UTC)", kind: "datetime" },
      { key: "email_confirmed", label: "Email confirmed", kind: "bool" },
      ...(orders ? [{ key: "orders", label: "Orders (all time)", kind: "count" as const }] : []),
    ],
    from: sql`customers c join users u on u.id = c.user_id`,
    where: sql.join(conds, sql` and `),
    select: sql`c.public_ref as customer_ref, coalesce(nullif(c.display_name, ''), trim(c.first_name || ' ' || c.last_name)) as name, ${iso(sql`c.created_at`)} as joined_at_utc, (u.email_verified_at is not null) as email_confirmed
      ${orders ? sql`, (select count(*)::int from orders o where o.customer_id = c.id) as orders` : sql``}`,
    order: sql`c.created_at desc, c.id`,
    rowHref: "/admin/customers?customer={customer_ref}",
  };
}

function ordersWhere(c: Ctx) {
  const conds: SQL[] = [inWindow(sql`o.placed_at`, c.r)];
  if (c.f.status && (ORDER_STATUS as readonly string[]).includes(c.f.status)) conds.push(sql`o.status = ${c.f.status}`);
  if (c.f.platform) conds.push(sql`o.price_snapshot->>'platformId' = ${c.f.platform}`);
  if (c.f.category) conds.push(sql`o.price_snapshot->>'category' = ${c.f.category}`);
  return conds;
}
function ordersTable(c: Ctx): TableDef {
  const conds = ordersWhere(c);
  if (c.f.q) conds.push(sql`(o.public_ref ilike ${like(c.f.q)} or o.price_snapshot->>'serviceName' ilike ${like(c.f.q)})`);
  return {
    title: "Orders placed in this period",
    columns: [
      { key: "order_ref", label: "Order" },
      { key: "placed_at_utc", label: "Placed (UTC)", kind: "datetime" },
      { key: "service", label: "Service" },
      { key: "platform", label: "Platform" },
      { key: "category", label: "Category" },
      { key: "quantity", label: "Quantity", kind: "count" },
      { key: "order_value_cents", label: "Order value (gross)", kind: "cents" },
      { key: "status", label: "Status", kind: "status" },
    ],
    from: sql`orders o`,
    where: sql.join(conds, sql` and `),
    select: sql`o.public_ref as order_ref, ${iso(sql`o.placed_at`)} as placed_at_utc, coalesce(o.price_snapshot->>'serviceName', o.service_id) as service, coalesce(o.price_snapshot->>'platformName', '') as platform,
      coalesce(o.price_snapshot->>'categoryLabel', '') as category, o.quantity, o.total_cents as order_value_cents, o.status`,
    order: sql`o.placed_at desc, o.id`,
    rowHref: "/admin/orders?order={order_ref}",
  };
}

function depositsTable(c: Ctx): TableDef {
  const conds: SQL[] = [inWindow(sql`d.requested_at`, c.r)];
  if (c.f.status && (DEPOSIT_STATUS as readonly string[]).includes(c.f.status)) conds.push(sql`d.status = ${c.f.status}`);
  if (c.f.q) conds.push(sql`(d.public_ref ilike ${like(c.f.q)} or cu.public_ref ilike ${like(c.f.q)})`);
  return {
    title: "Deposit requests in this period",
    columns: [
      { key: "deposit_ref", label: "Deposit" },
      { key: "requested_at_utc", label: "Requested (UTC)", kind: "datetime" },
      { key: "customer_ref", label: "Customer" },
      { key: "method", label: "Method" },
      { key: "amount_cents", label: "Amount", kind: "cents" },
      { key: "status", label: "Status", kind: "status" },
    ],
    from: sql`deposits d join customers cu on cu.id = d.customer_id`,
    where: sql.join(conds, sql` and `),
    select: sql`d.public_ref as deposit_ref, ${iso(sql`d.requested_at`)} as requested_at_utc, cu.public_ref as customer_ref, d.method, d.amount_cents, d.status`,
    order: sql`d.requested_at desc, d.id`,
    rowHref: "/admin/payments?deposit={deposit_ref}",
  };
}

// First staff reply after a ticket was opened (append-only messages, 5G-A).
const firstReply = sql`(select min(m.created_at) from ticket_messages m where m.ticket_id = t.id and m.author_type = 'staff')`;
function ticketsWhere(c: Ctx) {
  const conds: SQL[] = [inWindow(sql`t.created_at`, c.r)];
  if (c.f.status && (TICKET_STATUS as readonly string[]).includes(c.f.status)) conds.push(sql`t.status = ${c.f.status}`);
  if (c.f.category && (TICKET_CATEGORY as readonly string[]).includes(c.f.category)) conds.push(sql`t.category = ${c.f.category}`);
  return conds;
}
function ticketsTable(c: Ctx): TableDef {
  const conds = ticketsWhere(c);
  if (c.f.q) conds.push(sql`t.public_ref ilike ${like(c.f.q)}`);
  return {
    title: "Tickets opened in this period",
    columns: [
      { key: "ticket_ref", label: "Ticket" },
      { key: "opened_at_utc", label: "Opened (UTC)", kind: "datetime" },
      { key: "category", label: "Topic" },
      { key: "priority", label: "Priority" },
      { key: "status", label: "Status", kind: "status" },
      { key: "first_response_minutes", label: "First response (min)", kind: "minutes" },
      { key: "resolved_at_utc", label: "Resolved (UTC)", kind: "datetime" },
    ],
    from: sql`tickets t`,
    where: sql.join(conds, sql` and `),
    select: sql`t.public_ref as ticket_ref, ${iso(sql`t.created_at`)} as opened_at_utc, t.category, t.priority, t.status,
      round(extract(epoch from (${firstReply} - t.created_at)) / 60)::int as first_response_minutes, ${iso(sql`t.resolved_at`)} as resolved_at_utc`,
    order: sql`t.created_at desc, t.id`,
    rowHref: "/admin/support?ticket={ticket_ref}",
  };
}

function referralsTable(c: Ctx): TableDef {
  const conds: SQL[] = [inWindow(sql`r.attributed_at`, c.r)];
  if (c.f.status && (REFERRAL_STATUS as readonly string[]).includes(c.f.status)) conds.push(sql`r.status = ${c.f.status}`);
  if (c.f.flagged) conds.push(sql`jsonb_array_length(r.flags) > 0`);
  if (c.f.q) conds.push(sql`(rc.code ilike ${like(c.f.q)} or a.public_ref ilike ${like(c.f.q)} or b.public_ref ilike ${like(c.f.q)})`);
  return {
    title: "Referrals recorded in this period",
    columns: [
      { key: "attributed_at_utc", label: "Signed up (UTC)", kind: "datetime" },
      { key: "referrer_ref", label: "Referrer" },
      { key: "referred_ref", label: "Referred customer" },
      { key: "code", label: "Code" },
      { key: "via", label: "Via" },
      { key: "status", label: "Status", kind: "status" },
      { key: "review_signals", label: "Review signals" },
      { key: "email_confirmed", label: "Email confirmed", kind: "bool" },
    ],
    from: sql`referrals r join customers a on a.id = r.referrer_customer_id join customers b on b.id = r.referee_customer_id left join referral_codes rc on rc.id = r.code_id`,
    where: sql.join(conds, sql` and `),
    select: sql`${iso(sql`r.attributed_at`)} as attributed_at_utc, a.public_ref as referrer_ref, b.public_ref as referred_ref, coalesce(rc.code, '') as code, r.via, r.status,
      (select coalesce(string_agg(x, '; '), '') from jsonb_array_elements_text(r.flags) x) as review_signals, (r.verified_at is not null) as email_confirmed`,
    order: sql`r.attributed_at desc, r.id`,
  };
}

function aiTable(c: Ctx): TableDef {
  return {
    title: "AI usage by tool (estimates)",
    columns: [
      { key: "tool", label: "Tool" },
      { key: "requests", label: "Requests", kind: "count" },
      { key: "succeeded", label: "Succeeded", kind: "count" },
      { key: "errors", label: "Errors", kind: "count" },
      { key: "input_tokens", label: "Input tokens", kind: "count" },
      { key: "output_tokens", label: "Output tokens", kind: "count" },
      { key: "estimated_cost_usd_micros", label: "Estimated cost (not an invoice)", kind: "count" },
    ],
    from: sql`(select tool_id as tool, count(*)::int as requests, count(*) filter (where status = 'ok')::int as succeeded,
        count(*) filter (where status in ('provider_error', 'timeout', 'invalid_output'))::int as errors,
        sum(input_tokens)::bigint as input_tokens, sum(output_tokens)::bigint as output_tokens,
        coalesce(sum(cost_micros) filter (where status <> 'pending'), 0)::bigint as estimated_cost_usd_micros
        from ai_usage_events where ${inWindow(sql`created_at`, c.r)} group by tool_id) x`,
    where: c.f.q ? sql`x.tool ilike ${like(c.f.q)}` : sql`true`,
    select: sql`x.*`,
    order: sql`x.requests desc, x.tool`,
  };
}

/** The table a report shows and exports, or null when it has none for this viewer. */
function tableFor(id: ReportId, c: Ctx): TableDef | null {
  switch (id) {
    case "customers":
      return customersTable(c);
    case "orders":
      return ordersTable(c);
    case "financial":
      return depositsTable(c);
    case "support":
      return ticketsTable(c);
    case "referrals":
      return referralsTable(c);
    case "ai":
      return aiTable(c);
    default:
      return null;
  }
}

export async function tableRows(db: Db, t: TableDef, limit: number, offset: number) {
  return rows<Record<string, string | number | boolean | null>>(db, sql`select ${t.select} from ${t.from} where ${t.where} order by ${t.order} limit ${limit} offset ${offset}`);
}
export async function tableCount(db: Db, t: TableDef) {
  return n((await one<{ n: string }>(db, sql`select count(*)::text as n from ${t.from} where ${t.where}`)).n);
}

/* -------------------------------------------------------------------------- */
/*  Reports                                                                   */
/* -------------------------------------------------------------------------- */

async function context(db: Db, env: Env, access: RoleAccess, r: ResolvedRange, f: Filters): Promise<Ctx> {
  const first = await one<{ since: Date | null }>(db, sql`select min(created_at) as since from customers`);
  const since = first.since ? new Date(first.since) : null;
  return { db, env, access, r, f, since, comparable: Boolean(since && since <= r.prevStart) };
}

export function assertCanView(access: RoleAccess, id: ReportId) {
  if (!allows(access, `${REPORT_BY_ID[id].module}:view` as never)) throw errors.forbidden("view this report");
}

export async function buildReport(db: Db, env: Env, access: RoleAccess, id: ReportId, r: ResolvedRange, f: Filters): Promise<ReportResponse> {
  assertCanView(access, id);
  const c = await context(db, env, access, r, f);
  const base: ReportResponse = { report: id, range: { preset: r.preset, from: r.from, to: r.to, label: r.label, unit: r.unit, timezone: r.tz }, generatedAt: new Date().toISOString(), kpis: [] };
  const out = await BUILDERS[id](c, base);
  const t = tableFor(id, c);
  if (t) {
    const total = await tableCount(db, t);
    const pages = Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE));
    const page = Math.min(f.page, pages);
    out.table = { title: t.title, columns: t.columns, rows: await tableRows(db, t, TABLE_PAGE_SIZE, (page - 1) * TABLE_PAGE_SIZE), total, page, pages, exportable: true, rowHref: t.rowHref };
  }
  return out;
}

const BUILDERS: Record<ReportId, (c: Ctx, out: ReportResponse) => Promise<ReportResponse>> = {
  async business(c, out) {
    const o = await adminOverview(c.db, c.env, c.access, c.r);
    if (o.customers) out.kpis.push(kpi("customers", "Customers (all time)", o.customers.total, "count"), cmp("new_customers", "New customers", o.customers.new, "count"));
    if (o.orders) out.kpis.push(cmp("orders", "Orders placed", o.orders.placed, "count"), cmp("order_value", "Order value (gross, not revenue)", o.orders.valueCents, "cents"));
    if (o.finance) out.kpis.push(cmp("revenue", "Recognised revenue", o.finance.revenueCents, "cents", o.finance.revenuePolicy === "deferred" ? "Recognition is deferred by policy" : undefined));
    if (o.support) out.kpis.push(kpi("open_tickets", "Open tickets", o.support.needsReply + o.support.inProgress + o.support.waiting, "count"));
    out.series = [
      ...(o.orders ? [{ title: "Orders placed", kind: "count" as const, points: o.orders.series }] : []),
      ...(o.customers ? [{ title: "New registrations", kind: "count" as const, points: o.customers.series }] : []),
      ...(o.finance ? [{ title: "Wallet funding (not revenue)", kind: "cents" as const, points: o.finance.fundingSeries }] : []),
    ];
    if (o.orders) out.breakdowns = [{ id: "status", title: "Order status", hint: "Orders placed in this period", kind: "count", items: o.orders.byStatus.map((s) => ({ key: s.status, label: ORDER_STATUS_META[s.status as OrderStatus]?.label ?? s.status, value: s.count, href: `/admin/orders?status=${s.status}` })) }];
    out.links = [{ label: "Open the live Overview", href: "/admin" }];
    return out;
  },

  async customers(c, out) {
    const { db, r } = c;
    const [fresh, total, verified, s] = await Promise.all([
      compared(db, r, c.comparable, sql`customers`, sql`created_at`, sql`count(*)`),
      one<{ n: string }>(db, sql`select count(*)::text as n from customers`),
      one<{ n: string }>(db, sql`select count(*)::text as n from customers c join users u on u.id = c.user_id where ${inWindow(sql`c.created_at`, r)} and u.email_verified_at is not null`),
      series(db, r, sql`customers`, sql`created_at`, sql`count(*)`, c.since),
    ]);
    out.kpis.push(kpi("total", "Customers (all time)", n(total.n), "count"), cmp("new", "New customers", fresh, "count"), kpi("verified", "Confirmed their email", n(verified.n), "count", { hint: fresh.value ? `${Math.round((n(verified.n) / fresh.value) * 100)}% of new customers` : undefined }));
    if (can(c, "orders")) {
      const active = await one<{ n: string }>(db, sql`select count(distinct customer_id)::text as n from orders where ${inWindow(sql`placed_at`, r)}`);
      out.kpis.push(kpi("ordering", "Customers who ordered", n(active.n), "count", { hint: "Placed at least one order in this period" }));
    }
    out.series = [{ title: "New registrations", kind: "count", points: s }];
    out.links = [{ label: "Open Customers", href: "/admin/customers" }];
    return out;
  },

  async orders(c, out) {
    const { db, r } = c;
    const where = sql.join(ordersWhere(c), sql` and `);
    const [agg, prev, s, status, platform, category, plats] = await Promise.all([
      one<{ n: string; cents: string; done: string; closed: string }>(
        db,
        sql`select count(*)::text as n, coalesce(sum(total_cents), 0)::text as cents, count(*) filter (where status = 'completed')::text as done,
                   count(*) filter (where status in ('cancelled', 'failed', 'refunded', 'rejected'))::text as closed from orders o where ${where}`,
      ),
      c.comparable ? compared(db, r, true, sql`orders o`, sql`o.placed_at`, sql`count(*)`, sql.join(ordersWhere(c).slice(1).concat(sql`true`), sql` and `)) : null,
      series(db, r, sql`orders o`, sql`o.placed_at`, sql`count(*)`, c.since, sql.join(ordersWhere(c).slice(1).concat(sql`true`), sql` and `)),
      rows<{ k: string; v: string }>(db, sql`select o.status as k, count(*)::text as v from orders o where ${where} group by 1 order by count(*) desc`),
      rows<{ k: string; label: string; v: string }>(db, sql`select o.price_snapshot->>'platformId' as k, max(o.price_snapshot->>'platformName') as label, count(*)::text as v from orders o where ${where} group by 1 order by count(*) desc limit 10`),
      rows<{ k: string; label: string; v: string }>(db, sql`select o.price_snapshot->>'category' as k, max(o.price_snapshot->>'categoryLabel') as label, count(*)::text as v from orders o where ${where} group by 1 order by count(*) desc limit 10`),
      rows<{ id: string; name: string }>(db, sql`select id, name from platforms order by sort, name`),
    ]);
    out.kpis.push(
      kpi("placed", "Orders placed", n(agg.n), "count", { previous: prev?.previous ?? null }),
      kpi("value", "Order value (gross)", n(agg.cents), "cents", { hint: "Not revenue: includes open and cancelled orders" }),
      kpi("completed", "Completed", n(agg.done), "count"),
      kpi("closed", "Cancelled, failed, refunded or rejected", n(agg.closed), "count"),
    );
    out.series = [{ title: "Orders placed", kind: "count", points: s }];
    out.breakdowns = [
      { id: "status", title: "By status", kind: "count", items: status.map((x) => ({ key: x.k, label: ORDER_STATUS_META[x.k as OrderStatus]?.label ?? x.k, value: n(x.v), href: `/admin/orders?status=${x.k}` })) },
      { id: "platform", title: "By platform", kind: "count", items: platform.map((x) => ({ key: x.k ?? "other", label: x.label || "Other", value: n(x.v) })) },
      { id: "category", title: "By category", kind: "count", items: category.map((x) => ({ key: x.k ?? "other", label: x.label || "Other", value: n(x.v) })) },
    ];
    out.filters = [
      { id: "status", label: "Status", options: ORDER_STATUS.map((s) => ({ value: s, label: ORDER_STATUS_META[s].label })) },
      { id: "platform", label: "Platform", options: plats.map((p) => ({ value: p.id, label: p.name })) },
    ];
    if (can(c, "services")) {
      const cat = await catalogCounts(c.db);
      out.notes = [`Catalog readiness: ${n(cat.purchasable)} of ${n(cat.total)} services pass every eligibility check (${n(cat.visible)} visible, ${n(cat.priced)} priced).`];
    }
    out.links = [
      { label: "Open Orders", href: "/admin/orders" },
      ...(can(c, "services") ? [{ label: "Open Services & Pricing", href: "/admin/services" }] : []),
    ];
    return out;
  },

  async financial(c, out) {
    const { db, r } = c;
    const lines = sql`journal_lines l join journal_entries e on e.id = l.entry_id join ledger_accounts a on a.id = l.account_id`;
    const [summary, revenue, funding, revenueSeries, fundingSeries, moves, deposits, refunds] = await Promise.all([
      balanceSummary(db),
      compared(db, r, c.comparable, lines, sql`e.created_at`, sql`-coalesce(sum(l.amount_cents), 0)`, sql`a.code in ('revenue:orders', 'refunds')`),
      compared(db, r, c.comparable, lines, sql`e.created_at`, sql`-coalesce(sum(l.amount_cents), 0)`, sql`a.code like 'wallet:%' and e.kind = 'deposit_credit'`),
      series(db, r, lines, sql`e.created_at`, sql`-coalesce(sum(l.amount_cents), 0)`, c.since, sql`a.code in ('revenue:orders', 'refunds')`),
      series(db, r, lines, sql`e.created_at`, sql`-coalesce(sum(l.amount_cents), 0)`, c.since, sql`a.code like 'wallet:%' and e.kind = 'deposit_credit'`),
      rows<{ kind: string; cents: string }>(db, sql`select e.kind, (-coalesce(sum(l.amount_cents), 0))::text as cents from ${lines} where a.code like 'wallet:%' and ${inWindow(sql`e.created_at`, r)} group by e.kind order by 1`),
      rows<{ status: string; n: string }>(db, sql`select status, count(*)::text as n from deposits where ${inWindow(sql`requested_at`, r)} group by status order by count(*) desc`),
      one<{ cents: string }>(db, sql`select coalesce(b.balance_cents, 0)::text as cents from ledger_accounts a left join account_balances b on b.account_id = a.id where a.code = 'refunds'`),
    ]);
    const deferred = c.env.REVENUE_RECOGNITION_POLICY === "deferred";
    out.kpis.push(
      cmp("revenue", "Recognised revenue", revenue, "cents", deferred ? "Recognition is deferred by policy" : "Completed orders, net of refunds"),
      kpi("revenue_to_date", "Revenue to date", summary.revenueCents - n(refunds.cents), "cents"),
      cmp("funding", "Wallet funding", funding, "cents", "Credited deposits. A liability, not revenue"),
      kpi("wallets", "Wallet balances", summary.walletLiabilitiesCents, "cents", { hint: "Owed to customers (current)" }),
      kpi("committed", "Committed to open orders", summary.committedToOrdersCents, "cents", { hint: "Paid, not yet delivered (current)" }),
      kpi("to_verify", "Deposits to verify", summary.deposits.awaitingVerification.count, "count", { hint: "Current" }),
    );
    if (can(c, "orders")) {
      const v = await compared(db, r, c.comparable, sql`orders`, sql`placed_at`, sql`coalesce(sum(total_cents), 0)`);
      out.kpis.splice(3, 0, cmp("order_value", "Order value placed", v, "cents", "Gross. Not revenue"));
    }
    out.series = [
      { title: "Recognised revenue", kind: "cents", points: revenueSeries },
      { title: "Wallet funding (not revenue)", kind: "cents", points: fundingSeries },
    ];
    const MOVE: Record<string, string> = { deposit_credit: "Deposits credited", order_debit: "Charged for orders", order_cancel: "Released from cancelled orders", refund: "Refunds", adjustment: "Manual adjustments", reward_credit: "Rewards", reversal: "Reversals" };
    out.breakdowns = [
      { id: "movements", title: "Wallet movements", hint: "Into wallets (+) and out of wallets (−)", kind: "cents", items: moves.map((m) => ({ key: m.kind, label: MOVE[m.kind] ?? m.kind, value: n(m.cents) })) },
      { id: "deposits", title: "Deposit requests by status", kind: "count", items: deposits.map((d) => ({ key: d.status, label: d.status.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase()), value: n(d.n), href: `/admin/payments?status=${d.status}` })) },
    ];
    out.notes = [
      deferred
        ? "Revenue recognition is set to deferred (REVENUE_RECOGNITION_POLICY). Completed orders aren't recognised as revenue until the policy changes, so revenue can read $0 while orders are delivered."
        : "Revenue is recognised when an order is completed with delivery evidence, net of refunds.",
      "Profit and margin aren't shown: provider costs aren't recorded in the ledger yet.",
    ];
    out.filters = [{ id: "status", label: "Deposit status", options: DEPOSIT_STATUS.map((s) => ({ value: s, label: s.replace(/_/g, " ") })) }];
    out.links = [{ label: "Open Payments", href: "/admin/payments" }];
    return out;
  },

  async support(c, out) {
    const { db, r } = c;
    const where = sql.join(ticketsWhere(c), sql` and `);
    const [opened, resolved, open, response, replies, s, cats, statuses] = await Promise.all([
      compared(db, r, c.comparable, sql`tickets`, sql`created_at`, sql`count(*)`),
      one<{ n: string }>(db, sql`select count(*)::text as n from tickets where ${inWindow(sql`resolved_at`, r)}`),
      one<{ n: string }>(db, sql`select count(*)::text as n from tickets where status in ('awaiting', 'in_progress', 'waiting')`),
      one<{ median: string | null; answered: string; total: string }>(
        db,
        sql`select percentile_cont(0.5) within group (order by extract(epoch from (fr - created_at)) / 60)::text as median, count(fr)::text as answered, count(*)::text as total
              from (select t.created_at, ${firstReply} as fr from tickets t where ${where}) x`,
      ),
      one<{ n: string }>(db, sql`select count(*)::text as n from ticket_messages where author_type = 'staff' and ${inWindow(sql`created_at`, r)}`),
      series(db, r, sql`tickets`, sql`created_at`, sql`count(*)`, c.since),
      rows<{ k: string; v: string }>(db, sql`select t.category as k, count(*)::text as v from tickets t where ${where} group by 1 order by count(*) desc`),
      rows<{ k: string; v: string }>(db, sql`select t.status as k, count(*)::text as v from tickets t where ${where} group by 1 order by count(*) desc`),
    ]);
    out.kpis.push(
      cmp("opened", "Tickets opened", opened, "count"),
      kpi("resolved", "Resolved in this period", n(resolved.n), "count"),
      kpi("open", "Open now", n(open.n), "count", { hint: "Current" }),
      kpi("staff_replies", "Staff replies", n(replies.n), "count"),
    );
    if (response.median !== null) out.kpis.push(kpi("first_response", "Median first response", Math.round(Number(response.median)), "minutes", { hint: `${n(response.answered)} of ${n(response.total)} tickets answered` }));
    else out.notes = ["No ticket opened in this period has a staff reply yet, so there's no first-response time to report."];
    out.series = [{ title: "Tickets opened", kind: "count", points: s }];
    out.breakdowns = [
      { id: "category", title: "By topic", kind: "count", items: cats.map((x) => ({ key: x.k, label: CATEGORY_LABEL[x.k as TicketCategory] ?? x.k, value: n(x.v) })) },
      { id: "status", title: "By current status", kind: "count", items: statuses.map((x) => ({ key: x.k, label: STATUS_META[x.k as TicketStatus]?.staff ?? x.k, value: n(x.v) })) },
    ];
    out.filters = [
      { id: "status", label: "Status", options: TICKET_STATUS.map((s) => ({ value: s, label: STATUS_META[s].staff })) },
      { id: "category", label: "Topic", options: TICKET_CATEGORY.map((s) => ({ value: s, label: CATEGORY_LABEL[s] })) },
    ];
    out.links = [{ label: "Open Support", href: "/admin/support" }];
    return out;
  },

  async referrals(c, out) {
    const { db, r } = c;
    const [fresh, agg, now, s, by, via] = await Promise.all([
      compared(db, r, c.comparable, sql`referrals`, sql`attributed_at`, sql`count(*)`),
      one<{ verified: string; rejected: string; qualified: string }>(
        db,
        sql`select count(*) filter (where verified_at is not null)::text as verified, count(*) filter (where status = 'ineligible')::text as rejected, count(*) filter (where status = 'qualified')::text as qualified
              from referrals where ${inWindow(sql`attributed_at`, r)}`,
      ),
      one<{ flagged: string; review: string }>(db, sql`select count(*) filter (where jsonb_array_length(flags) > 0 and status in ('signed_up', 'pending'))::text as flagged, count(*) filter (where status = 'pending')::text as review from referrals`),
      series(db, r, sql`referrals`, sql`attributed_at`, sql`count(*)`, c.since),
      rows<{ k: string; v: string }>(db, sql`select status as k, count(*)::text as v from referrals where ${inWindow(sql`attributed_at`, r)} group by 1 order by count(*) desc`),
      rows<{ k: string; v: string }>(db, sql`select via as k, count(*)::text as v from referrals where ${inWindow(sql`attributed_at`, r)} group by 1 order by count(*) desc`),
    ]);
    out.kpis.push(
      cmp("new", "Referred sign-ups", fresh, "count"),
      kpi("verified", "Confirmed their email", n(agg.verified), "count"),
      kpi("flagged", "Flagged, awaiting review", n(now.flagged), "count", { hint: "Current" }),
      kpi("review", "Under review", n(now.review), "count", { hint: "Current" }),
      kpi("rejected", "Rejected", n(agg.rejected), "count"),
    );
    out.series = [{ title: "Referred sign-ups", kind: "count", points: s }];
    out.breakdowns = [
      { id: "status", title: "By status", kind: "count", items: by.map((x) => ({ key: x.k, label: REFERRAL_STATUS_META[x.k as ReferralStatus]?.label ?? x.k, value: n(x.v) })) },
      { id: "via", title: "By source", kind: "count", items: via.map((x) => ({ key: x.k, label: x.k === "link" ? "Referral link" : "Entered code", value: n(x.v) })) },
    ];
    out.notes = ["Qualification and rewards are locked: no referral can be qualified until reward rules and accounting controls are approved."];
    out.filters = [{ id: "status", label: "Status", options: REFERRAL_STATUS.map((s) => ({ value: s, label: REFERRAL_STATUS_META[s].label })) }];
    out.links = [{ label: "Open Referrals", href: "/admin/referrals" }];
    return out;
  },

  async ai(c, out) {
    const { db, r } = c;
    const [u, runs, s, state, prov] = await Promise.all([
      one<Record<string, string>>(
        db,
        sql`select count(*)::text as requests, count(*) filter (where status = 'ok')::text as ok,
                   count(*) filter (where status in ('provider_error', 'timeout', 'invalid_output'))::text as errors,
                   count(*) filter (where status in ('rejected_quota', 'rejected_budget'))::text as blocked,
                   count(input_tokens)::text as token_rows, coalesce(sum(input_tokens), 0)::text as input_tokens, coalesce(sum(output_tokens), 0)::text as output_tokens,
                   coalesce(sum(cost_micros) filter (where status <> 'pending'), 0)::text as cost
              from ai_usage_events where ${inWindow(sql`created_at`, r)}`,
      ),
      rows<{ k: string; v: string }>(db, sql`select status as k, count(*)::text as v from automation_runs where ${inWindow(sql`created_at`, r)} group by 1 order by count(*) desc`),
      series(db, r, sql`ai_usage_events`, sql`created_at`, sql`count(*)`, c.since),
      aiOverview(db, c.env),
      rows<{ k: string | null; v: string }>(db, sql`select provider as k, count(*)::text as v from ai_usage_events where ${inWindow(sql`created_at`, r)} group by 1 order by count(*) desc`),
    ]);
    const tokens = n(u.token_rows) > 0;
    out.kpis.push(
      kpi("requests", "AI requests", n(u.requests), "count"),
      kpi("errors", "Errors", n(u.errors), "count"),
      kpi("blocked", "Stopped by limits", n(u.blocked), "count"),
      ...(tokens ? [kpi("tokens", "Tokens", n(u.input_tokens) + n(u.output_tokens), "count")] : []),
      kpi("cost", "Estimated cost", n(u.cost), "micros", { hint: "Sociotix's estimate, not a provider invoice" }),
    );
    out.series = [{ title: "AI requests", kind: "count", points: s }];
    const RUN: Record<string, string> = { running: "Running", succeeded: "Succeeded", skipped: "Skipped", failed: "Failed" };
    out.breakdowns = [
      { id: "provider", title: "Requests by provider", kind: "count", items: prov.map((x) => ({ key: x.k ?? "none", label: x.k ?? "Not sent to a provider", value: n(x.v) })) },
      { id: "automation", title: "Internal automation runs", hint: "Run inside Sociotix; not external publishing", kind: "count", items: runs.map((x) => ({ key: x.k, label: RUN[x.k] ?? x.k, value: n(x.v) })) },
    ];
    out.notes = [
      `AI generation is ${state.emergencyDisabled ? "paused by the emergency switch" : state.generation.live ? "live" : `off${state.generation.reason ? `: ${state.generation.reason}` : ""}`}.`,
      ...(tokens ? [] : ["Token counts aren't reported for the requests in this period."]),
      "External publishing to social networks is separate from automations and stays off unless enabled for a network.",
    ];
    out.links = [{ label: "Open AI Management", href: "/admin/ai" }];
    return out;
  },
};

/* -------------------------------------------------------------------------- */
/*  CSV export                                                                */
/* -------------------------------------------------------------------------- */

/** Escapes one CSV cell; text that a spreadsheet could run as a formula is prefixed with an apostrophe. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "yes" : "no";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

const CENT_KEYS = /_cents$/;

/** Builds the CSV for a report's table with the same filters as the view. Refuses more than EXPORT_MAX_ROWS rows. */
export async function exportReport(db: Db, env: Env, access: RoleAccess, id: ReportId, r: ResolvedRange, f: Filters) {
  assertCanView(access, id);
  const c = await context(db, env, access, r, f);
  const t = id === "business" ? null : tableFor(id, c);
  let header: string[];
  let body: (string | number | boolean | null)[][];
  if (!t) {
    // Business overview: the daily figures behind its charts.
    const rep = await buildReport(db, env, access, "business", r, f);
    const list = rep.series ?? [];
    header = [r.unit === "hour" ? "hour_start_utc" : "day_start_utc", ...list.map((s) => s.title.toLowerCase().replace(/\(.*\)/, "").trim().replace(/\W+/g, "_") + (s.kind === "cents" ? "_usd" : ""))];
    body = (list[0]?.points ?? []).map((p, i) => [p.t, ...list.map((s) => (s.points[i].beforeData ? null : s.kind === "cents" ? (s.points[i].value / 100).toFixed(2) : s.points[i].value))]);
  } else {
    const total = await tableCount(db, t);
    if (total > EXPORT_MAX_ROWS) throw new AppError("VALIDATION_FAILED", `This export has ${total.toLocaleString("en-US")} rows; the limit is ${EXPORT_MAX_ROWS.toLocaleString("en-US")}. Narrow the date range or filters.`, { details: { field: "range" } });
    const data = await tableRows(db, t, EXPORT_MAX_ROWS, 0);
    header = t.columns.map((col) => (CENT_KEYS.test(col.key) ? col.key.replace(CENT_KEYS, "_usd") : col.key.replace(/_micros$/, "")));
    body = data.map((row) =>
      t.columns.map((col) => {
        const v = row[col.key];
        if (v === null || v === undefined) return null;
        if (CENT_KEYS.test(col.key)) return (Number(v) / 100).toFixed(2);
        if (col.key.endsWith("_micros")) return (Number(v) / 1_000_000).toFixed(6);
        if (col.key === "review_signals" && typeof v === "string") return v.split("; ").filter(Boolean).map((x) => FLAG_LABEL[x as ReferralFlag]?.label ?? x).join("; ");
        return v as string | number | boolean;
      }),
    );
  }
  const csv = [header, ...body].map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return { csv, rows: body.length, filename: `sociotix-${id}-${r.from}-to-${r.to}.csv` };
}
