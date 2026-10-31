import "server-only";
import { desc, eq, like, sql } from "drizzle-orm";
import { AI_PROVIDERS } from "@/lib/ai/provider-catalog";
import { requireStaff } from "../../auth";
import { allows } from "../../auth/permissions";
import { requireRecentReauth } from "../../auth/staff";
import type { Executor } from "../../db/client";
import { auditLog, users } from "../../db/schema";
import type { Env } from "../../env";
import { listAssignments } from "./assignments";
import { loadControls } from "./controls";
import { listCredentials } from "./credentials";
import { listModels } from "./models";
import { overview } from "./usage";

/*
 * Admin AI Control Center access rules.
 *  - view:      Settings: View
 *  - manage:    Settings: Manage (models, drafts, compatibility checks, emergency pause)
 *  - sensitive: "Security settings" permission (owner-only by default) plus a fresh
 *               re-authentication: keys, activation, budgets, resuming AI.
 * Every staff route also needs an MFA-complete session (requireStaff).
 */

export const viewer = () => requireStaff("settings:view");
export const manager = () => requireStaff("settings:manage");
export async function sensitive() {
  const actor = await requireStaff("securitySettings");
  requireRecentReauth(actor.context.session);
  return actor;
}

export async function controlCenter(db: Executor, env: Env, access: Parameters<typeof allows>[0]) {
  const [summary, credentials, models, assignments, controls] = await Promise.all([overview(db, env), listCredentials(db), listModels(db), listAssignments(db), loadControls(db)]);
  return {
    summary,
    providers: AI_PROVIDERS,
    credentials,
    models,
    assignments,
    controls,
    can: { manage: allows(access, "settings:manage"), sensitive: allows(access, "securitySettings") },
  };
}

export async function controlAudit(db: Executor) {
  const rows = await db
    .select({ id: auditLog.id, action: auditLog.action, targetId: auditLog.targetId, after: auditLog.after, at: auditLog.at, who: sql<string | null>`coalesce(${users.name}, ${users.email})` })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(like(auditLog.action, "ai_control.%"))
    .orderBy(desc(auditLog.at))
    .limit(100);
  return rows.map((r) => ({ id: String(r.id), action: r.action.replace("ai_control.", ""), target: r.targetId, detail: r.after as Record<string, unknown> | null, by: r.who ?? "System", at: r.at.toISOString() }));
}
