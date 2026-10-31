import "server-only";
import { MODULE, SENSITIVE_PERMISSION } from "../db/schema/enums";
import type { AccessLevel, Module, RoleAccess, SensitivePermission } from "./permissions";

/**
 * The approved default role templates, as designed in Admin → Staff &
 * Permissions (`src/lib/admin-staff.ts`). A test keeps the two in sync.
 * These become real roles only when seeded into the database; nothing reads
 * the browser copies as security.
 */

const lv = (o: Partial<Record<Module, AccessLevel>>, d: AccessLevel = "none") => Object.fromEntries(MODULE.map((m) => [m, o[m] ?? d])) as Record<Module, AccessLevel>;
const sv = (on: readonly SensitivePermission[]) => Object.fromEntries(SENSITIVE_PERMISSION.map((s) => [s, on.includes(s)])) as Record<SensitivePermission, boolean>;

export const ROLE_TEMPLATES: { key: string; name: string; access: RoleAccess }[] = [
  { key: "owner", name: "Owner", access: { modules: lv({}, "manage"), sensitive: sv(SENSITIVE_PERMISSION) } },
  {
    key: "admin",
    name: "Administrator",
    access: { modules: lv({ staff: "view" }, "manage"), sensitive: sv(["approveDeposits", "issueRefunds", "changePrices", "configureProviders", "approveRewards"]) },
  },
  {
    key: "support",
    name: "Support Agent",
    access: { modules: lv({ overview: "view", orders: "view", customers: "view", services: "view", support: "manage", referrals: "view" }), sensitive: sv([]) },
  },
  {
    key: "orders",
    name: "Order Manager",
    access: { modules: lv({ overview: "view", orders: "manage", customers: "view", services: "manage", providers: "manage", support: "view" }), sensitive: sv(["configureProviders"]) },
  },
  {
    key: "finance",
    name: "Finance Manager",
    access: {
      modules: lv({ overview: "view", orders: "view", customers: "view", services: "view", payments: "manage", support: "view", referrals: "manage" }),
      sensitive: sv(["approveDeposits", "issueRefunds", "approveRewards"]),
    },
  },
];
