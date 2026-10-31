import "server-only";
import { sql } from "drizzle-orm";
import { tzLabel } from "@/lib/admin-overview";
import { activityLabel, rows } from "../analytics/overview";
import { overview as aiOverview } from "../ai/control/usage";
import { allows, type RoleAccess } from "../auth/permissions";
import { REAUTH_WINDOW_MS, SESSION_POLICY } from "../auth/sessions";
import { catalogCounts } from "../catalog/catalog";
import type { Db } from "../db/client";
import { emailConfigured } from "../email";
import type { Env } from "../env";
import { checkoutEnabled } from "../orders/orders";
import { methodReadiness } from "../payments/methods";
import { loadReporting } from "./reporting";

/*
 * Platform Settings (Phase 5H-B). One read model for /admin/settings, built
 * from the configuration sources that already exist: env, platform_settings
 * and the modules' own readiness checks. Only reporting preferences are
 * editable here; everything else is read-only with a link to where it's
 * managed. No secret, key or credential value is ever selected.
 */

const list = (raw: string | undefined) => (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const hours = (ms: number) => Math.round(ms / 3_600_000);
const minutes = (ms: number) => Math.round(ms / 60_000);

export async function settingsOverview(db: Db, env: Env, access: RoleAccess) {
  const staffView = allows(access, "staff:view");
  const [reporting, checkout, catalog, providers, ai, staff, recent] = await Promise.all([
    loadReporting(db),
    checkoutEnabled(db),
    catalogCounts(db),
    rows<{ ready: string; total: string }>(db, sql`select count(*) filter (where enabled and supplier_reviewed_at is not null)::text as ready, count(*)::text as total from providers where archived_at is null`),
    aiOverview(db, env),
    staffView
      ? rows<{ role: string; active: string; mfa: string }>(
          db,
          sql`select r.name as role, count(*) filter (where s.status = 'active')::text as active,
                     count(*) filter (where s.status = 'active' and exists (select 1 from mfa_factors f where f.user_id = s.user_id and f.confirmed_at is not null))::text as mfa
                from staff_members s join roles r on r.id = s.role_id group by r.name order by count(*) desc, r.name`,
        )
      : Promise.resolve(null),
    rows<{ id: string; action: string; actor: string | null; at: Date }>(
      db,
      sql`select l.id, l.action, u.name as actor, l.at from audit_log l left join users u on u.id = l.actor_user_id
           where l.actor_type = 'staff' and (l.action like 'settings.%' or l.action like 'ai_control.%' or l.action like 'staff.%' or l.action = 'referral.program_saved' or l.action = 'report.exported')
           order by l.at desc limit 8`,
    ),
  ]);
  const methods = methodReadiness(env);
  const publishing = list(env.SOCIAL_PUBLISHING_ENABLED);
  const socialProviders = list(env.SOCIAL_PROVIDERS_ENABLED);
  return {
    can: { manage: allows(access, "settings:manage"), staff: staffView },
    general: {
      appUrl: env.APP_URL,
      environment: process.env.NODE_ENV === "production" ? "Production build" : "Development",
      demoMode: env.DEMO_MODE,
      reporting: { ...reporting, label: tzLabel(reporting.timezone) },
    },
    orders: {
      checkoutEnabled: checkout,
      catalog: { total: Number(catalog.total), visible: Number(catalog.visible), priced: Number(catalog.priced), purchasable: Number(catalog.purchasable) },
      providers: { ready: Number(providers[0]?.ready ?? 0), total: Number(providers[0]?.total ?? 0) },
    },
    financial: {
      revenuePolicy: env.REVENUE_RECOGNITION_POLICY,
      paymentMethods: methods.map((m) => ({ id: m.id, name: m.name, configured: m.configured, accepting: m.acceptingRequests })),
    },
    integrations: {
      ai: {
        generationLive: ai.generation.live,
        generationEnabled: ai.generation.enabled,
        reason: ai.generation.reason,
        emergencyPaused: ai.emergencyDisabled,
        providersVerified: ai.providers.filter((p) => p.state === "verified").length,
        providersTotal: ai.providers.length,
        keys: ai.keys,
      },
      email: emailConfigured(),
      social: { connections: socialProviders.length, publishing: publishing.length },
    },
    security: {
      staffSession: { absoluteHours: hours(SESSION_POLICY.staff.absoluteMs), idleMinutes: minutes(SESSION_POLICY.staff.idleMs) },
      customerSession: { absoluteDays: Math.round(SESSION_POLICY.customer.absoluteMs / 86_400_000), idleDays: Math.round(SESSION_POLICY.customer.idleMs / 86_400_000) },
      reauthMinutes: minutes(REAUTH_WINDOW_MS),
      staffMfaRequired: true,
      staff: staff ? staff.map((s) => ({ role: s.role, active: Number(s.active), withMfa: Number(s.mfa) })).filter((s) => s.active > 0) : null,
      recent: recent.map((r) => ({ id: r.id, label: activityLabel(r.action), actor: r.actor ?? "Staff", at: new Date(r.at).toISOString() })),
    },
  };
}
export type SettingsOverview = Awaited<ReturnType<typeof settingsOverview>>;
