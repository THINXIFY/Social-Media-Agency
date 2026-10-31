import "server-only";
import { redirect } from "next/navigation";
import { EnvError, getEnv } from "../env";
import { AppError } from "../errors";
import { getCustomerSession, getStaffSession, type RoleAccess } from "./index";
import { allows, type Module } from "./permissions";

/**
 * Page-level guards for layouts and pages (rendered inside <Suspense>, never
 * cached). They redirect or return a status; route handlers and actions use
 * the throwing guards in ./index instead.
 */

export interface CustomerViewer {
  /** Server-side only: never passed to the browser. */
  customerId: string;
  /** Server-side only: the account behind the customer (AI usage is counted per account). */
  userId: string;
  name: string;
  email: string;
  accountRef: string;
  demo: boolean;
}

export type GuardResult<T> = { status: "ok"; viewer: T } | { status: "unavailable" };

const initialsOf = (name: string, email: string) =>
  (name || email)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** Signed-in, verified customer — or a redirect. Unconfigured backends render an "unavailable" state (fail closed). */
export async function customerPage(): Promise<GuardResult<CustomerViewer>> {
  let ctx;
  try {
    ctx = await getCustomerSession();
  } catch (e) {
    if (e instanceof AppError || e instanceof EnvError) return { status: "unavailable" };
    throw e;
  }
  if (!ctx) redirect("/login");
  if (!ctx.session.user.emailVerifiedAt) redirect("/verify-email?pending=1");
  const name = ctx.customer.displayName || `${ctx.customer.firstName} ${ctx.customer.lastName}`.trim();
  return { status: "ok", viewer: { customerId: ctx.customer.id, userId: ctx.session.userId, name, email: ctx.session.user.email, accountRef: ctx.customer.accountRef, demo: getEnv().DEMO_MODE } };
}

export interface StaffViewer {
  name: string;
  email: string;
  initials: string;
  roleKey: string;
  roleName: string;
  access: RoleAccess;
  /** Admin section ids this viewer may open (from the role's view/manage levels). */
  sections: string[];
  demo: boolean;
}

/** Admin section → the module permission that opens it. */
export const SECTION_MODULE: Record<string, Module> = {
  overview: "overview",
  orders: "orders",
  services: "services",
  customers: "customers",
  payments: "payments",
  providers: "providers",
  support: "support",
  referrals: "referrals",
  analytics: "overview",
  reports: "overview",
  ai: "settings",
  settings: "settings",
  staff: "staff",
};

/** Staff with completed MFA — or a redirect to sign-in / MFA. */
export async function staffPage(): Promise<GuardResult<StaffViewer>> {
  let ctx;
  try {
    ctx = await getStaffSession();
  } catch (e) {
    if (e instanceof AppError || e instanceof EnvError) return { status: "unavailable" };
    throw e;
  }
  if (!ctx) redirect("/admin/login");
  if (!ctx.mfaComplete || !ctx.access) redirect(ctx.hasAuthenticator ? "/admin/mfa" : "/admin/mfa/setup");
  const access = ctx.access;
  const sections = Object.entries(SECTION_MODULE)
    .filter(([, m]) => allows(access, `${m}:view`))
    .map(([s]) => s);
  const { name, email } = ctx.session.user;
  return {
    status: "ok",
    viewer: { name: name || email, email, initials: initialsOf(name, email), roleKey: ctx.staff.roleKey, roleName: ctx.staff.roleName, access, sections, demo: getEnv().DEMO_MODE },
  };
}

/** Whether the signed-in staff member may view an admin section (re-checked from the database). */
export async function canViewSection(section: string): Promise<boolean> {
  const r = await staffPage();
  return r.status === "ok" && r.viewer.sections.includes(section);
}
