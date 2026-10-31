import "server-only";
import { ACCESS_LEVEL, MODULE, SENSITIVE_PERMISSION } from "../db/schema/enums";

export type Module = (typeof MODULE)[number];
export type AccessLevel = (typeof ACCESS_LEVEL)[number];
export type SensitivePermission = (typeof SENSITIVE_PERMISSION)[number];

/** `orders:view`, `payments:manage`, or a named sensitive permission such as `approveDeposits`. */
export type Permission = `${Module}:${Exclude<AccessLevel, "none">}` | SensitivePermission;

export interface RoleAccess {
  modules: Record<Module, AccessLevel>;
  sensitive: Record<SensitivePermission, boolean>;
}

/** Each sensitive permission also needs Manage on its module (same rule as the admin UI). */
export const SENSITIVE_MODULE: Record<SensitivePermission, Module> = {
  approveDeposits: "payments",
  issueRefunds: "payments",
  adjustWallets: "payments",
  changePrices: "services",
  configureProviders: "providers",
  approveRewards: "referrals",
  manageStaff: "staff",
  securitySettings: "settings",
};

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, manage: 2 };

export function isPermission(v: string): v is Permission {
  if ((SENSITIVE_PERMISSION as readonly string[]).includes(v)) return true;
  const [m, l] = v.split(":");
  return (MODULE as readonly string[]).includes(m) && (l === "view" || l === "manage");
}

/** Pure check against a role's access. Unknown permissions are denied. */
export function allows(access: RoleAccess, permission: Permission): boolean {
  if (!isPermission(permission)) return false;
  if (permission.includes(":")) {
    const [m, l] = permission.split(":") as [Module, AccessLevel];
    return RANK[access.modules[m] ?? "none"] >= RANK[l];
  }
  const p = permission as SensitivePermission;
  return access.sensitive[p] === true && access.modules[SENSITIVE_MODULE[p]] === "manage";
}
