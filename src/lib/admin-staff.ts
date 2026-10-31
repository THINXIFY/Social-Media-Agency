/**
 * Staff & permissions: proposed role templates and local invitation drafts.
 *
 * Nothing here is access control. The admin panel has no sign-in and no
 * backend, so roles are templates for the future server-side checks and are
 * never consulted to allow or block anything in this app. The only staff
 * member is the existing demo identity; invitations are drafts that are never
 * sent. No passwords, tokens or keys are stored.
 */

import * as React from "react";
import { ADMIN_USER } from "@/lib/admin-demo";
import { looksSensitive } from "@/lib/admin-orders";

/* -------------------------------------------------------------------------- */
/*  Modules, permissions and roles                                            */
/* -------------------------------------------------------------------------- */

export type Level = "none" | "view" | "manage";
export const LEVELS: Level[] = ["none", "view", "manage"];
export const LEVEL_LABEL: Record<Level, string> = { none: "No access", view: "View only", manage: "Manage" };
const RANK: Record<Level, number> = { none: 0, view: 1, manage: 2 };

export type ModuleId = "overview" | "orders" | "customers" | "services" | "payments" | "providers" | "support" | "referrals" | "settings" | "staff";

export const MODULES: { id: ModuleId; label: string; view: string; manage: string }[] = [
  { id: "overview", label: "Overview & Analytics", view: "See dashboards, reports and exports.", manage: "Same as view; reports can't be changed." },
  { id: "orders", label: "Orders", view: "See orders and their history.", manage: "Approve, update and cancel orders." },
  { id: "customers", label: "Customers", view: "See customer profiles and wallets.", manage: "Edit profiles, flags and notes." },
  { id: "services", label: "Services & Pricing", view: "See the catalog and prices.", manage: "Edit services, visibility and limits." },
  { id: "payments", label: "Payments & Wallet", view: "See deposits, refunds and balances.", manage: "Work the verification and refund queues." },
  { id: "providers", label: "Fulfilment Providers", view: "See providers and their health.", manage: "Edit providers and service mappings." },
  { id: "support", label: "Support", view: "Read tickets and conversations.", manage: "Reply, assign and close tickets." },
  { id: "referrals", label: "Referrals & Rewards", view: "See referrals and rewards.", manage: "Review referrals and program drafts." },
  { id: "settings", label: "Settings", view: "See platform settings.", manage: "Change platform settings." },
  { id: "staff", label: "Staff & Permissions", view: "See the team and roles.", manage: "Invite staff and edit role templates." },
];
export const MODULE_BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m])) as Record<ModuleId, (typeof MODULES)[number]>;

export type SensitiveId = "approveDeposits" | "issueRefunds" | "adjustWallets" | "changePrices" | "configureProviders" | "approveRewards" | "manageStaff" | "securitySettings";

/** High-impact actions. Each also needs Manage on its module. */
export const SENSITIVE: { id: SensitiveId; label: string; description: string; module: ModuleId }[] = [
  { id: "approveDeposits", label: "Approve deposits", description: "Credit a verified deposit to a customer wallet.", module: "payments" },
  { id: "issueRefunds", label: "Issue refunds", description: "Return money for an order to the customer's wallet.", module: "payments" },
  { id: "adjustWallets", label: "Adjust wallet balances", description: "Add or remove funds manually, with a reason.", module: "payments" },
  { id: "changePrices", label: "Change service prices", description: "Set costs and selling prices.", module: "services" },
  { id: "configureProviders", label: "Configure provider connections", description: "Change how orders reach providers.", module: "providers" },
  { id: "approveRewards", label: "Approve referral rewards", description: "Release rewards after their hold.", module: "referrals" },
  { id: "manageStaff", label: "Manage staff roles", description: "Change who has which role and what roles allow.", module: "staff" },
  { id: "securitySettings", label: "Edit platform security settings", description: "Sign-in, two-factor and session rules.", module: "settings" },
];
export const SENSITIVE_BY_ID = Object.fromEntries(SENSITIVE.map((s) => [s.id, s])) as Record<SensitiveId, (typeof SENSITIVE)[number]>;

export type RoleId = "owner" | "admin" | "support" | "orders" | "finance";

export interface RoleAccess {
  modules: Record<ModuleId, Level>;
  sensitive: Record<SensitiveId, boolean>;
}

export interface RoleMeta {
  id: RoleId;
  label: string;
  summary: string;
  /** Hard limits on the template, with the reason shown in the editor. */
  caps: Partial<Record<ModuleId, Level>>;
  blocked: SensitiveId[];
  capReason?: string;
}

export const ROLES: RoleMeta[] = [
  { id: "owner", label: "Owner", summary: "Full intended control, including staff, permissions and sensitive financial settings.", caps: {}, blocked: [] },
  { id: "admin", label: "Administrator", summary: "Runs day-to-day operations. Sensitive permissions are configurable.", caps: {}, blocked: [] },
  {
    id: "support",
    label: "Support Agent",
    summary: "Helps customers with orders and tickets. Can't touch wallets or payment configuration.",
    caps: { payments: "view", settings: "view", staff: "none" },
    blocked: ["approveDeposits", "issueRefunds", "adjustWallets", "changePrices", "configureProviders", "manageStaff", "securitySettings"],
    capReason: "Support Agents can't change wallet balances, payments or staff.",
  },
  {
    id: "orders",
    label: "Order Manager",
    summary: "Reviews orders, services and fulfilment providers. No financial or staff control.",
    caps: { payments: "view", staff: "none", settings: "view" },
    blocked: ["approveDeposits", "issueRefunds", "adjustWallets", "approveRewards", "manageStaff", "securitySettings"],
    capReason: "Order Managers can't manage money or staff permissions.",
  },
  {
    id: "finance",
    label: "Finance Manager",
    summary: "Reviews payments, deposits, refunds and wallet activity. No staff or security control.",
    caps: { staff: "view", settings: "view", providers: "view" },
    blocked: ["manageStaff", "securitySettings", "configureProviders"],
    capReason: "Finance Managers can't manage staff roles or platform security.",
  },
];
export const ROLE_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r])) as Record<RoleId, RoleMeta>;
export const isRole = (v: unknown): v is RoleId => typeof v === "string" && v in ROLE_BY_ID;

const all = <T extends string, V>(keys: readonly T[], v: V) => Object.fromEntries(keys.map((k) => [k, v])) as Record<T, V>;
const MODULE_IDS = MODULES.map((m) => m.id);
const SENSITIVE_IDS = SENSITIVE.map((s) => s.id);
const lv = (o: Partial<Record<ModuleId, Level>>, d: Level = "none") => ({ ...all(MODULE_IDS, d), ...o });
const sv = (on: SensitiveId[]) => ({ ...all(SENSITIVE_IDS, false), ...Object.fromEntries(on.map((k) => [k, true])) }) as Record<SensitiveId, boolean>;

export const DEFAULT_ACCESS: Record<RoleId, RoleAccess> = {
  owner: { modules: lv({}, "manage"), sensitive: sv(SENSITIVE_IDS) },
  admin: { modules: lv({ staff: "view" }, "manage"), sensitive: sv(["approveDeposits", "issueRefunds", "changePrices", "configureProviders", "approveRewards"]) },
  support: { modules: lv({ overview: "view", orders: "view", customers: "view", services: "view", support: "manage", referrals: "view" }), sensitive: sv([]) },
  orders: { modules: lv({ overview: "view", orders: "manage", customers: "view", services: "manage", providers: "manage", support: "view" }), sensitive: sv(["configureProviders"]) },
  finance: { modules: lv({ overview: "view", orders: "view", customers: "view", services: "view", payments: "manage", support: "view", referrals: "manage" }), sensitive: sv(["approveDeposits", "issueRefunds", "approveRewards"]) },
};

export const capOf = (role: RoleId, m: ModuleId): Level => ROLE_BY_ID[role].caps[m] ?? "manage";
export const allowedLevel = (role: RoleId, m: ModuleId, l: Level) => RANK[l] <= RANK[capOf(role, m)];

/** Why a sensitive permission can't be on, or null when it can. */
export function sensitiveBlock(role: RoleId, access: RoleAccess, s: SensitiveId): string | null {
  if (ROLE_BY_ID[role].blocked.includes(s)) return `Not part of the ${ROLE_BY_ID[role].label} role.`;
  const m = SENSITIVE_BY_ID[s].module;
  if (access.modules[m] !== "manage") return `Needs ${MODULE_BY_ID[m].label} set to Manage.`;
  return null;
}

/** Lowering a module switches off the sensitive permissions that depended on it. */
export function withLevel(role: RoleId, access: RoleAccess, m: ModuleId, l: Level): RoleAccess {
  const modules = { ...access.modules, [m]: l };
  const sensitive = { ...access.sensitive };
  for (const s of SENSITIVE) if (sensitive[s.id] && sensitiveBlock(role, { modules, sensitive }, s.id)) sensitive[s.id] = false;
  return { modules, sensitive };
}

export function accessErrors(role: RoleId, a: RoleAccess): string[] {
  const out: string[] = [];
  if (role === "owner" && JSON.stringify(a) !== JSON.stringify(DEFAULT_ACCESS.owner)) out.push("The Owner role must keep full access.");
  for (const m of MODULES) if (!allowedLevel(role, m.id, a.modules[m.id])) out.push(`${m.label} can be at most ${LEVEL_LABEL[capOf(role, m.id)]} for this role.`);
  for (const s of SENSITIVE) if (a.sensitive[s.id] && sensitiveBlock(role, a, s.id)) out.push(`${s.label}: ${sensitiveBlock(role, a, s.id)}`);
  if (!MODULES.some((m) => a.modules[m.id] !== "none")) out.push("Give the role access to at least one area.");
  return out;
}

export const summarize = (a: RoleAccess) => ({
  manage: MODULES.filter((m) => a.modules[m.id] === "manage"),
  view: MODULES.filter((m) => a.modules[m.id] === "view"),
  none: MODULES.filter((m) => a.modules[m.id] === "none"),
  sensitive: SENSITIVE.filter((s) => a.sensitive[s.id]),
});

/* -------------------------------------------------------------------------- */
/*  People                                                                    */
/* -------------------------------------------------------------------------- */

export interface Invite {
  id: string;
  email: string;
  role: Exclude<RoleId, "owner">;
  message: string;
  createdAt: string;
}

export interface StaffEntry {
  id: string;
  name: string;
  email: string;
  role: RoleId;
  kind: "member" | "invite";
  invite?: Invite;
}

/** The single existing identity. No other staff accounts exist. */
export const OWNER_ENTRY: StaffEntry = { id: "owner", name: ADMIN_USER.fullName, email: ADMIN_USER.email, role: "owner", kind: "member" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function inviteErrors(draft: { email: string; role: string; message: string }, invites: Invite[], ignoreId?: string) {
  const e: Partial<Record<"email" | "role" | "message", string>> = {};
  const email = draft.email.trim().toLowerCase();
  if (!email) e.email = "Enter an email address.";
  else if (!EMAIL.test(email) || email.length > 120) e.email = "Enter a valid email address, like name@example.com.";
  else if (email === OWNER_ENTRY.email.toLowerCase()) e.email = `${OWNER_ENTRY.name} is already on the team.`;
  else if (invites.some((i) => i.id !== ignoreId && i.email.toLowerCase() === email)) e.email = "There's already an invitation draft for this email.";
  if (!isRole(draft.role) || draft.role === "owner") e.role = "Choose a role. The Owner role can't be given by invitation.";
  if (draft.message.length > 300) e.message = "Keep the message under 300 characters.";
  else if (looksSensitive(draft.message)) e.message = "Don't include passwords, codes, keys or other credentials.";
  return e;
}

/* -------------------------------------------------------------------------- */
/*  Store                                                                     */
/* -------------------------------------------------------------------------- */

interface State {
  roles: Partial<Record<RoleId, RoleAccess & { savedAt: string }>>;
  invites: Invite[];
}

const KEY = "sv-admin-staff";
const EMPTY: State = { roles: {}, invites: [] };
const listeners = new Set<() => void>();
let memo: { raw: string | null; state: State } | null = null;

function cleanAccess(role: RoleId, raw: unknown): (RoleAccess & { savedAt: string }) | null {
  const r = raw as { modules?: Record<string, unknown>; sensitive?: Record<string, unknown>; savedAt?: unknown } | null;
  if (!r || typeof r.savedAt !== "string" || role === "owner") return null;
  const modules = Object.fromEntries(MODULE_IDS.map((m) => [m, LEVELS.includes(r.modules?.[m] as Level) ? r.modules![m] : "none"])) as Record<ModuleId, Level>;
  const sensitive = Object.fromEntries(SENSITIVE_IDS.map((s) => [s, r.sensitive?.[s] === true])) as Record<SensitiveId, boolean>;
  return accessErrors(role, { modules, sensitive }).length ? null : { modules, sensitive, savedAt: r.savedAt };
}

function read(): State {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (memo?.raw === raw) return memo.state;
  let state = EMPTY;
  try {
    const d = raw ? (JSON.parse(raw) as { roles?: Record<string, unknown>; invites?: unknown[] }) : null;
    if (d) {
      const roles: State["roles"] = {};
      for (const r of ROLES) {
        const c = cleanAccess(r.id, d.roles?.[r.id]);
        if (c) roles[r.id] = c;
      }
      const invites: Invite[] = [];
      for (const x of Array.isArray(d.invites) ? d.invites.slice(0, 50) : []) {
        const i = x as Partial<Invite>;
        if (typeof i.id !== "string" || !/^INV-[A-Z0-9]{6}$/.test(i.id) || typeof i.email !== "string" || typeof i.createdAt !== "string") continue;
        const inv = { id: i.id, email: i.email.trim(), role: i.role as Invite["role"], message: typeof i.message === "string" ? i.message : "", createdAt: i.createdAt };
        if (!Object.keys(inviteErrors(inv, invites)).length) invites.push(inv);
      }
      state = { roles, invites };
    }
  } catch {}
  memo = { raw, state };
  return state;
}

function write(state: State) {
  try {
    if (Object.keys(state.roles).length || state.invites.length) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => (e.key === KEY || e.key === null) && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useStaffAdmin() {
  return React.useSyncExternalStore(subscribe, read, () => EMPTY);
}

export const accessOf = (state: State, role: RoleId): RoleAccess => {
  const s = state.roles[role];
  return s ? { modules: s.modules, sensitive: s.sensitive } : DEFAULT_ACCESS[role];
};

export function saveRole(role: Exclude<RoleId, "owner">, access: RoleAccess) {
  const s = read();
  write({ ...s, roles: { ...s.roles, [role]: { ...access, savedAt: new Date().toISOString() } } });
}

export function resetRole(role: RoleId) {
  const s = read();
  const roles = { ...s.roles };
  delete roles[role];
  write({ ...s, roles });
}

const newId = () => `INV-${Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("")}`;

export function addInvite(d: { email: string; role: Invite["role"]; message: string }) {
  const s = read();
  const inv: Invite = { id: newId(), email: d.email.trim(), role: d.role, message: d.message.trim(), createdAt: new Date().toISOString() };
  write({ ...s, invites: [...s.invites, inv] });
  return inv;
}

export function updateInvite(id: string, patch: Partial<Pick<Invite, "role">>) {
  const s = read();
  write({ ...s, invites: s.invites.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
}

export function removeInvite(id: string) {
  const s = read();
  write({ ...s, invites: s.invites.filter((i) => i.id !== id) });
}
