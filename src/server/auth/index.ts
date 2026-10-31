import "server-only";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { type Db, type Executor, getDb } from "../db/client";
import { customers, mfaFactors, roleModuleAccess, roleSensitivePermissions, roles, staffMembers } from "../db/schema";
import { ACCESS_LEVEL, MODULE, SENSITIVE_PERMISSION } from "../db/schema/enums";
import { EnvError, getEnv } from "../env";
import { AppError, errors } from "../errors";
import { type AccessLevel, allows, type Module, type Permission, type RoleAccess, type SensitivePermission } from "./permissions";
import { ALL_COOKIE_NAMES, type ClientInfo, type SessionKind, validateSession, type ValidSession } from "./sessions";

export type { Permission, RoleAccess } from "./permissions";

/**
 * Authentication & authorization boundary (the Data Access Layer).
 *
 * Every protected route handler, server action and page resolves the actor
 * here, from the HttpOnly session cookie and the database — never from
 * anything the browser stores. Nothing is cached: a revoked session or a role
 * change takes effect on the very next request.
 */

export type Actor =
  | { kind: "customer"; userId: string; customerId: string; sessionId: string }
  | { kind: "staff"; userId: string; staffId: string; sessionId: string }
  /** Background jobs acting on the platform's behalf; never created from a request. */
  | { kind: "system"; job: string };

async function cookieValue(kind: SessionKind): Promise<string | null> {
  try {
    const jar = await cookies();
    for (const name of ALL_COOKIE_NAMES[kind]) {
      const v = jar.get(name)?.value;
      if (v) return v;
    }
    return null;
  } catch {
    // Outside a request (scripts, tests without a request scope): nobody is signed in.
    return null;
  }
}

/** Client IP (only when the hosting proxy is trusted) and user agent, for rate limits and audit. */
export async function clientInfo(): Promise<ClientInfo> {
  try {
    const h = await headers();
    const ip = getEnv().TRUST_PROXY_HEADERS ? (h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip")) : null;
    return { ip: ip || null, userAgent: h.get("user-agent") };
  } catch {
    return {};
  }
}

export interface CustomerContext {
  session: ValidSession;
  customer: { id: string; publicRef: string; accountRef: string; firstName: string; lastName: string; displayName: string | null };
}

export async function getCustomerSession(dbOverride?: Db): Promise<CustomerContext | null> {
  // Read the cookie first: no cookie means no database work (and keeps pages dynamic).
  const token = await cookieValue("customer");
  if (!token) return null;
  const db = dbOverride ?? getDb();
  const session = await validateSession(db, token, "customer");
  if (!session) return null;
  const [customer] = await db
    .select({ id: customers.id, publicRef: customers.publicRef, accountRef: customers.accountRef, firstName: customers.firstName, lastName: customers.lastName, displayName: customers.displayName })
    .from(customers)
    .where(eq(customers.userId, session.userId))
    .limit(1);
  return customer ? { session, customer } : null;
}

export interface StaffContext {
  session: ValidSession;
  staff: { id: string; status: string; roleKey: string; roleName: string };
  access: RoleAccess | null;
  /** Second factor verified in this session, with a confirmed authenticator. */
  mfaComplete: boolean;
  hasAuthenticator: boolean;
}

export async function getStaffSession(dbOverride?: Db): Promise<StaffContext | null> {
  const token = await cookieValue("staff");
  if (!token) return null;
  const db = dbOverride ?? getDb();
  const session = await validateSession(db, token, "staff");
  if (!session) return null;
  const [staff] = await db
    .select({ id: staffMembers.id, status: staffMembers.status, roleId: staffMembers.roleId, roleKey: roles.key, roleName: roles.name })
    .from(staffMembers)
    .innerJoin(roles, eq(roles.id, staffMembers.roleId))
    .where(eq(staffMembers.userId, session.userId))
    .limit(1);
  if (!staff || staff.status === "disabled") return null;
  const factors = await db.select({ confirmedAt: mfaFactors.confirmedAt }).from(mfaFactors).where(eq(mfaFactors.userId, session.userId));
  const hasAuthenticator = factors.some((f) => f.confirmedAt);
  const mfaComplete = hasAuthenticator && session.user.mfaEnabled && Boolean(session.mfaVerifiedAt) && staff.status === "active";
  return { session, staff: { id: staff.id, status: staff.status, roleKey: staff.roleKey, roleName: staff.roleName }, access: mfaComplete ? await loadRoleAccess(db, staff.roleId) : null, mfaComplete, hasAuthenticator };
}

export async function getCurrentActor(): Promise<Actor | null> {
  try {
    const staff = await getStaffSession();
    if (staff?.mfaComplete) return { kind: "staff", userId: staff.session.userId, staffId: staff.staff.id, sessionId: staff.session.id };
    const customer = await getCustomerSession();
    if (customer?.session.user.emailVerifiedAt) return { kind: "customer", userId: customer.session.userId, customerId: customer.customer.id, sessionId: customer.session.id };
    return null;
  } catch (e) {
    // No database configured, etc.: fail closed.
    if (e instanceof AppError || e instanceof EnvError) return null;
    throw e;
  }
}

/** A signed-in customer with a verified email. Customer ids always come from here, never from input. */
export async function requireCustomer(): Promise<Extract<Actor, { kind: "customer" }> & { context: CustomerContext }> {
  const ctx = await getCustomerSession().catch((e) => {
    if (e instanceof AppError || e instanceof EnvError) return null;
    throw e;
  });
  if (!ctx) throw errors.unauthenticated();
  if (!ctx.session.user.emailVerifiedAt) throw new AppError("EMAIL_UNVERIFIED", "Confirm your email to continue.");
  return { kind: "customer", userId: ctx.session.userId, customerId: ctx.customer.id, sessionId: ctx.session.id, context: ctx };
}

/** Staff with a completed second factor in this session, holding `permission` (if given). */
export async function requireStaffSession(): Promise<StaffContext & { access: RoleAccess }> {
  const ctx = await getStaffSession().catch((e) => {
    if (e instanceof AppError || e instanceof EnvError) return null;
    throw e;
  });
  if (!ctx) throw errors.unauthenticated();
  if (!ctx.mfaComplete || !ctx.access) throw new AppError("MFA_REQUIRED", "Verify your authenticator code to continue.");
  return ctx as StaffContext & { access: RoleAccess };
}

export async function requireStaff(permission: Permission, db?: Executor): Promise<Extract<Actor, { kind: "staff" }> & { context: StaffContext }> {
  const ctx = await requireStaffSession();
  const actor = { kind: "staff" as const, userId: ctx.session.userId, staffId: ctx.staff.id, sessionId: ctx.session.id };
  await authorize(actor, permission, db);
  return { ...actor, context: ctx };
}

/**
 * Checks a staff member's *current* role in the database (never a cached or
 * client-supplied copy). Disabled or invited staff are denied everything.
 */
export async function authorize(actor: Pick<Extract<Actor, { kind: "staff" }>, "staffId">, permission: Permission, db: Executor = getDb()): Promise<void> {
  const access = await loadStaffAccess(db, actor.staffId);
  if (!access || !allows(access, permission)) throw errors.forbidden();
}

export async function loadStaffAccess(db: Executor, staffId: string): Promise<RoleAccess | null> {
  const [member] = await db.select({ status: staffMembers.status, roleId: staffMembers.roleId }).from(staffMembers).where(eq(staffMembers.id, staffId)).limit(1);
  if (!member || member.status !== "active") return null;
  return loadRoleAccess(db, member.roleId);
}

export async function loadRoleAccess(db: Executor, roleId: string): Promise<RoleAccess | null> {
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) return null;
  const mods = await db.select().from(roleModuleAccess).where(eq(roleModuleAccess.roleId, roleId));
  const sens = await db.select().from(roleSensitivePermissions).where(eq(roleSensitivePermissions.roleId, roleId));
  const modules = Object.fromEntries(MODULE.map((m) => [m, "none"])) as Record<Module, AccessLevel>;
  for (const r of mods) if ((ACCESS_LEVEL as readonly string[]).includes(r.level)) modules[r.module as Module] = r.level as AccessLevel;
  const sensitive = Object.fromEntries(SENSITIVE_PERMISSION.map((s) => [s, false])) as Record<SensitivePermission, boolean>;
  for (const r of sens) sensitive[r.permission as SensitivePermission] = true;
  return { modules, sensitive };
}
