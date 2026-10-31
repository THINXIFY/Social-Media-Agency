import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { bucketKey, buckets, type Compared, type OverviewResponse, type ResolvedRange, type SeriesPoint } from "@/lib/admin-overview";
import { allows, type RoleAccess } from "../auth/permissions";
import { catalogCounts } from "../catalog/catalog";
import type { Db } from "../db/client";
import type { Env } from "../env";
import { overview as aiOverview } from "../ai/control/usage";
import { checkoutEnabled } from "../orders/orders";
import { methodReadiness } from "../payments/methods";
import { balanceSummary } from "../payments/reconcile";

/*
 * Admin Overview analytics (Phase 5H-A). Read-only aggregations over the
 * authoritative tables; nothing here writes or invents a value.
 *
 *  - Every section is computed only when the viewer's role grants View on
 *    the module that owns the data, so a hidden card is also absent from the
 *    API response.
 *  - One window per request: all period figures use [start, end) in UTC.
 *    The previous equal-length window is compared only when records exist
 *    from before it started; otherwise the comparison is null.
 *  - Revenue is the ledger's recognised order revenue net of refunds,
 *    never deposits, wallet balances or the gross value of orders placed.
 *  - Customer details never leave this module: activity shows actor roles
 *    and staff names only, and audit payloads (before/after) aren't read.
 */

const n = (v: unknown) => Number(v ?? 0);
type Row = Record<string, unknown>;
export const rows = async <T extends Row>(db: Db, q: SQL) => (await db.execute<T>(q)).rows;

/** Totals per local hour/day (reporting timezone) for one timestamp column, zero-filled; buckets before the first record are marked. */
export async function series(db: Db, r: ResolvedRange, from: SQL, column: SQL, value: SQL, since: Date | null, where: SQL = sql`true`): Promise<SeriesPoint[]> {
  const format = sql.raw(r.unit === "hour" ? `'YYYY-MM-DD"T"HH24'` : `'YYYY-MM-DD'`);
  const got = await rows<{ b: string; v: string }>(
    db,
    sql`select to_char(${column} at time zone ${r.tz}, ${format}) as b, (${value})::text as v
          from ${from} where ${column} >= ${r.start} and ${column} < ${r.end} and ${where} group by 1`,
  );
  const by = new Map(got.map((g) => [g.b, n(g.v)]));
  const list = buckets(r);
  return list.map((b, i) => {
    const next = list[i + 1] ?? r.end;
    return { t: b.toISOString(), value: by.get(bucketKey(b, r.unit, r.tz)) ?? 0, beforeData: !since || next.getTime() <= since.getTime() };
  });
}

/** Current and previous window totals for one measure. */
export async function compared(db: Db, r: ResolvedRange, comparable: boolean, from: SQL, column: SQL, value: SQL, where: SQL = sql`true`): Promise<Compared> {
  const total = async (a: Date, b: Date) => n((await rows<{ v: string }>(db, sql`select (${value})::text as v from ${from} where ${column} >= ${a} and ${column} < ${b} and ${where}`))[0]?.v);
  const [value_, previous] = await Promise.all([total(r.start, r.end), comparable ? total(r.prevStart, r.start) : null]);
  return { value: value_, previous };
}

/** Audit actions → the module that may see them, the workspace they link to and a readable name. */
const ACTIVITY: { prefix: string; module: Parameters<typeof allows>[1]; area: string; href: string }[] = [
  { prefix: "order.", module: "orders:view", area: "Orders", href: "/admin/orders" },
  { prefix: "auth.registered", module: "customers:view", area: "Customers", href: "/admin/customers" },
  { prefix: "ticket.", module: "support:view", area: "Support", href: "/admin/support" },
  { prefix: "referral.", module: "referrals:view", area: "Referrals", href: "/admin/referrals" },
  { prefix: "deposit.", module: "payments:view", area: "Payments", href: "/admin/payments" },
  { prefix: "wallet.", module: "payments:view", area: "Payments", href: "/admin/payments" },
  { prefix: "refund.", module: "payments:view", area: "Payments", href: "/admin/payments" },
  { prefix: "service.", module: "services:view", area: "Services", href: "/admin/services" },
  { prefix: "provider.", module: "providers:view", area: "Providers", href: "/admin/providers" },
  { prefix: "fulfillment.", module: "providers:view", area: "Providers", href: "/admin/providers" },
  { prefix: "staff.", module: "staff:view", area: "Staff", href: "/admin/staff" },
  { prefix: "ai_control.", module: "settings:view", area: "AI Management", href: "/admin/ai" },
];
const LABELS: Record<string, string> = {
  "auth.registered": "New customer registered",
  "order.created": "Order placed",
  "ticket.created": "Support ticket opened",
  "referral.attributed": "Referral recorded at sign-up",
  "referral.rejected": "Referral rejected",
  "referral.marked_review": "Referral marked for review",
  "settings.reporting_saved": "Reporting preferences changed",
  "report.exported": "Report exported (CSV)",
};
export const activityLabel = (action: string) => LABELS[action] ?? (action.charAt(0).toUpperCase() + action.slice(1)).replace(/[._]/g, " ").replace(/\s+/g, " ");

export async function adminOverview(db: Db, env: Env, access: RoleAccess, r: ResolvedRange): Promise<OverviewResponse> {
  const can = (p: Parameters<typeof allows>[1]) => allows(access, p);
  const [first] = await rows<{ since: Date | null }>(db, sql`select min(created_at) as since from customers`);
  const since = first?.since ? new Date(first.since) : null;
  const comparable = Boolean(since && since <= r.prevStart);
  const out: OverviewResponse = {
    range: { preset: r.preset, from: r.from, to: r.to, label: r.label, unit: r.unit, start: r.start.toISOString(), end: r.end.toISOString(), timezone: r.tz },
    generatedAt: new Date().toISOString(),
    dataSince: since?.toISOString() ?? null,
  };
  const tasks: Promise<void>[] = [];

  if (can("customers:view"))
    tasks.push(
      (async () => {
        const [[t], fresh, [v], s] = await Promise.all([
          rows<{ n: string }>(db, sql`select count(*)::text as n from customers`),
          compared(db, r, comparable, sql`customers`, sql`created_at`, sql`count(*)`),
          rows<{ n: string }>(db, sql`select count(*)::text as n from customers c join users u on u.id = c.user_id where c.created_at >= ${r.start} and c.created_at < ${r.end} and u.email_verified_at is not null`),
          series(db, r, sql`customers`, sql`created_at`, sql`count(*)`, since),
        ]);
        out.customers = { total: n(t.n), new: fresh, verifiedNew: n(v.n), series: s };
      })(),
    );

  if (can("orders:view"))
    tasks.push(
      (async () => {
        const inWindow = sql`placed_at >= ${r.start} and placed_at < ${r.end}`;
        const [[t], placed, value, status, s, top, platforms, queues] = await Promise.all([
          rows<{ n: string }>(db, sql`select count(*)::text as n from orders`),
          compared(db, r, comparable, sql`orders`, sql`placed_at`, sql`count(*)`),
          compared(db, r, comparable, sql`orders`, sql`placed_at`, sql`coalesce(sum(total_cents), 0)`),
          rows<{ status: string; n: string }>(db, sql`select status, count(*)::text as n from orders where ${inWindow} group by status order by count(*) desc`),
          series(db, r, sql`orders`, sql`placed_at`, sql`count(*)`, since),
          rows<{ id: string; name: string; platform: string; n: string; cents: string }>(
            db,
            sql`select service_id as id, max(price_snapshot->>'serviceName') as name, max(price_snapshot->>'platformName') as platform, count(*)::text as n, coalesce(sum(total_cents), 0)::text as cents
                  from orders where ${inWindow} group by service_id order by count(*) desc, sum(total_cents) desc limit 5`,
          ),
          rows<{ name: string; n: string }>(db, sql`select coalesce(nullif(price_snapshot->>'platformName', ''), 'Other') as name, count(*)::text as n from orders where ${inWindow} group by 1 order by count(*) desc limit 8`),
          rows<{ status: string; n: string }>(db, sql`select status, count(*)::text as n from orders where status in ('pending_review', 'needs_customer_action', 'queued', 'in_progress', 'partial') group by status`),
        ]);
        const q = Object.fromEntries(queues.map((x) => [x.status, n(x.n)]));
        out.orders = {
          total: n(t.n),
          placed,
          valueCents: value,
          byStatus: status.map((x) => ({ status: x.status, count: n(x.n) })),
          series: s,
          topServices: top.map((x) => ({ id: x.id, name: x.name || x.id, platform: x.platform ?? "", orders: n(x.n), valueCents: n(x.cents) })),
          platforms: platforms.map((x) => ({ name: x.name, orders: n(x.n) })),
          queues: { review: q.pending_review ?? 0, needsInfo: q.needs_customer_action ?? 0, ready: q.queued ?? 0, inProgress: (q.in_progress ?? 0) + (q.partial ?? 0) },
        };
      })(),
    );

  if (can("payments:view"))
    tasks.push(
      (async () => {
        // Net recognised revenue: credits to revenue:orders less debits to the refunds contra-revenue account.
        const revenueLines = sql`journal_lines l join journal_entries e on e.id = l.entry_id join ledger_accounts a on a.id = l.account_id`;
        const isRevenue = sql`a.code in ('revenue:orders', 'refunds')`;
        // Funding: deposits credited to customer wallets (a liability, never revenue).
        const isFunding = sql`a.code like 'wallet:%' and e.kind = 'deposit_credit'`;
        const [summary, revenue, [recognized], funding, [fundingCount], fundingSeries] = await Promise.all([
          balanceSummary(db),
          compared(db, r, comparable, revenueLines, sql`e.created_at`, sql`-coalesce(sum(l.amount_cents), 0)`, isRevenue),
          rows<{ n: string }>(db, sql`select count(*)::text as n from journal_entries where kind = 'order_revenue' and created_at >= ${r.start} and created_at < ${r.end}`),
          compared(db, r, comparable, revenueLines, sql`e.created_at`, sql`-coalesce(sum(l.amount_cents), 0)`, isFunding),
          rows<{ n: string }>(db, sql`select count(*)::text as n from journal_entries where kind = 'deposit_credit' and created_at >= ${r.start} and created_at < ${r.end}`),
          series(db, r, revenueLines, sql`e.created_at`, sql`-coalesce(sum(l.amount_cents), 0)`, since, isFunding),
        ]);
        const [refunds] = await rows<{ cents: string }>(db, sql`select coalesce(b.balance_cents, 0)::text as cents from ledger_accounts a left join account_balances b on b.account_id = a.id where a.code = 'refunds'`);
        const methods = methodReadiness(env);
        out.finance = {
          revenueCents: revenue,
          revenuePolicy: env.REVENUE_RECOGNITION_POLICY,
          revenueLifetimeCents: summary.revenueCents - n(refunds?.cents),
          recognizedOrders: n(recognized.n),
          fundingCents: funding,
          fundingCount: n(fundingCount.n),
          fundingSeries,
          walletLiabilitiesCents: summary.walletLiabilitiesCents,
          committedToOrdersCents: summary.committedToOrdersCents,
          fundedCustomers: summary.fundedCustomers,
          depositsAwaitingReview: summary.deposits.awaitingVerification.count,
          paymentMethods: { configured: methods.filter((m) => m.acceptingRequests).length, total: methods.length },
        };
      })(),
    );

  if (can("services:view"))
    tasks.push(
      (async () => {
        const [c, checkout] = await Promise.all([catalogCounts(db), checkoutEnabled(db)]);
        out.services = { total: n(c.total), visible: n(c.visible), priced: n(c.priced), purchasable: n(c.purchasable), checkoutEnabled: checkout };
      })(),
    );

  if (can("providers:view"))
    tasks.push(
      (async () => {
        const [[p], [a]] = await Promise.all([
          rows<{ ready: string; total: string }>(db, sql`select count(*) filter (where enabled and supplier_reviewed_at is not null)::text as ready, count(*)::text as total from providers where archived_at is null`),
          rows<{ unknown: string; active: string }>(db, sql`select count(*) filter (where status = 'unknown')::text as unknown, count(*) filter (where status in ('queued', 'submitted', 'in_progress'))::text as active from fulfillment_attempts`),
        ]);
        out.providers = { ready: n(p.ready), total: n(p.total), unknownOutcomes: n(a.unknown), activeAttempts: n(a.active) };
      })(),
    );

  if (can("support:view"))
    tasks.push(
      (async () => {
        const [[t], opened] = await Promise.all([
          rows<{ awaiting: string; progress: string; waiting: string }>(db, sql`select count(*) filter (where status = 'awaiting')::text as awaiting, count(*) filter (where status = 'in_progress')::text as progress, count(*) filter (where status = 'waiting')::text as waiting from tickets where status in ('awaiting', 'in_progress', 'waiting')`),
          compared(db, r, comparable, sql`tickets`, sql`created_at`, sql`count(*)`),
        ]);
        out.support = { needsReply: n(t.awaiting), inProgress: n(t.progress), waiting: n(t.waiting), opened };
      })(),
    );

  if (can("referrals:view"))
    tasks.push(
      (async () => {
        const [fresh, [f]] = await Promise.all([
          compared(db, r, comparable, sql`referrals`, sql`attributed_at`, sql`count(*)`),
          rows<{ flagged: string; review: string }>(db, sql`select count(*) filter (where jsonb_array_length(flags) > 0 and status in ('signed_up', 'pending'))::text as flagged, count(*) filter (where status = 'pending')::text as review from referrals`),
        ]);
        out.referrals = { new: fresh, flaggedOpen: n(f.flagged), underReview: n(f.review) };
      })(),
    );

  // AI Management sits under Settings, the same rule as the /admin/ai section.
  if (can("settings:view"))
    tasks.push(
      (async () => {
        const [[u], [runs], ai] = await Promise.all([
          rows<Row>(
            db,
            sql`select count(*)::int as requests,
                       count(*) filter (where status = 'ok')::int as ok,
                       count(*) filter (where status in ('provider_error', 'timeout', 'invalid_output'))::int as errors,
                       count(*) filter (where status in ('rejected_quota', 'rejected_budget'))::int as blocked,
                       count(input_tokens)::int as token_rows,
                       coalesce(sum(input_tokens), 0)::bigint as input_tokens,
                       coalesce(sum(output_tokens), 0)::bigint as output_tokens,
                       coalesce(sum(cost_micros) filter (where status <> 'pending'), 0)::bigint as cost
                  from ai_usage_events where created_at >= ${r.start} and created_at < ${r.end}`,
          ),
          rows<Row>(
            db,
            sql`select count(*)::int as runs, count(*) filter (where status = 'succeeded')::int as ok, count(*) filter (where status = 'failed')::int as failed, count(*) filter (where status = 'skipped')::int as skipped
                  from automation_runs where created_at >= ${r.start} and created_at < ${r.end}`,
          ),
          aiOverview(db, env),
        ]);
        const tokens = n(u.token_rows) > 0;
        out.ai = {
          requests: n(u.requests),
          succeeded: n(u.ok),
          errors: n(u.errors),
          blocked: n(u.blocked),
          inputTokens: tokens ? n(u.input_tokens) : null,
          outputTokens: tokens ? n(u.output_tokens) : null,
          estimatedCostMicros: n(u.cost),
          generation: ai.generation,
          emergencyPaused: ai.emergencyDisabled,
          providersActive: ai.providers.filter((p) => p.state === "verified").length,
          providersTotal: ai.providers.length,
          automation: { runs: n(runs.runs), succeeded: n(runs.ok), failed: n(runs.failed), skipped: n(runs.skipped) },
          publishingProviders: (env.SOCIAL_PUBLISHING_ENABLED ?? "").split(",").filter((s) => s.trim()).length,
        };
      })(),
    );

  const visible = ACTIVITY.filter((a) => can(a.module));
  if (visible.length)
    tasks.push(
      (async () => {
        const match = sql.join(
          visible.map((a) => sql`l.action like ${a.prefix.endsWith(".") ? `${a.prefix}%` : a.prefix}`),
          sql` or `,
        );
        const feed = await rows<{ id: string; action: string; actor_type: string; actor: string | null; at: Date }>(
          db,
          sql`select l.id, l.action, l.actor_type, case when l.actor_type = 'staff' then coalesce(u.name, 'Staff') end as actor, l.at
                from audit_log l left join users u on u.id = l.actor_user_id
               where ${match} order by l.at desc limit 12`,
        );
        out.activity = feed.map((f) => {
          const a = visible.find((x) => f.action.startsWith(x.prefix))!;
          return { id: f.id, label: activityLabel(f.action), area: a.area, href: a.href, actor: f.actor_type === "staff" ? (f.actor ?? "Staff") : f.actor_type === "system" ? "System" : "Customer", at: new Date(f.at).toISOString() };
        });
      })(),
    );

  await Promise.all(tasks);
  return out;
}
