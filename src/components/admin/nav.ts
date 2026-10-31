import {
  BarChart3,
  CreditCard,
  Gift,
  LayoutDashboard,
  LifeBuoy,
  type LucideIcon,
  Package,
  Plug,
  Settings,
  ShieldCheck,
  Sparkles,
  Tags,
  Users,
} from "lucide-react";

export interface AdminSection {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Built and working (not a preview). */
  built?: boolean;
  /** What the page will do once built. Shown on its preview. */
  summary: string;
  planned: string[];
}

export const ADMIN_PRIMARY: AdminSection[] = [
  { id: "overview", label: "Overview", href: "/admin", icon: LayoutDashboard, built: true, summary: "", planned: [] },
  {
    id: "orders",
    label: "Orders",
    href: "/admin/orders",
    icon: Package,
    built: true,
    summary: "Review, approve and track every customer order.",
    planned: ["Review queue with flags and approve or reject", "Filters by status, platform, customer and date", "Order timeline, provider status and refunds"],
  },
  {
    id: "services",
    label: "Services & Pricing",
    href: "/admin/services",
    icon: Tags,
    built: true,
    summary: "Manage the 118-service catalog, activation and pricing.",
    planned: ["Activate services once pricing and compliance are verified", "Set prices, quantity limits and provider mapping", "Preview how changes appear to customers"],
  },
  {
    id: "customers",
    label: "Customers",
    href: "/admin/customers",
    icon: Users,
    built: true,
    summary: "Customer accounts, wallets and history.",
    planned: ["Search customers and view profiles", "Wallet balance, deposits and order history", "Notes, flags and account status"],
  },
  {
    id: "payments",
    label: "Payments",
    href: "/admin/payments",
    built: true,
    icon: CreditCard,
    summary: "Deposits, verification, refunds and wallet reconciliation.",
    planned: ["Verify manual deposits before crediting", "Refunds and adjustments with an audit trail", "Reconcile deposits, revenue and wallet liabilities"],
  },
  {
    id: "providers",
    label: "Providers",
    href: "/admin/providers",
    built: true,
    icon: Plug,
    summary: "Connect fulfilment providers and monitor their health.",
    planned: ["Connect provider APIs and map services", "Balance, error rate and response monitoring", "Fallback routing when a provider fails"],
  },
  {
    id: "support",
    label: "Support",
    href: "/admin/support",
    built: true,
    icon: LifeBuoy,
    summary: "Customer tickets, replies and response tracking.",
    planned: ["Ticket inbox with assignment and priorities", "Replies linked to orders and payments", "Response-time tracking"],
  },
  {
    id: "referrals",
    label: "Referrals",
    href: "/admin/referrals",
    built: true,
    icon: Gift,
    summary: "Referral program settings, qualification and reward approval.",
    planned: ["Program terms and reward amounts", "Approve, hold or reverse rewards", "Fraud and self-referral checks"],
  },
];

export const ADMIN_SECONDARY: AdminSection[] = [
  {
    id: "ai",
    label: "AI Management",
    href: "/admin/ai",
    built: true,
    icon: Sparkles,
    summary: "AI providers, keys, models, tool assignments, spending limits and usage.",
    planned: [],
  },
  {
    id: "reports",
    label: "Reports",
    href: "/admin/reports",
    built: true,
    icon: BarChart3,
    summary: "Business, customer, order, financial, support, referral and AI reports with CSV export.",
    planned: [],
  },
  {
    id: "settings",
    label: "Settings",
    href: "/admin/settings",
    built: true,
    icon: Settings,
    summary: "Reporting preferences and a read-only view of platform configuration.",
    planned: [],
  },
  {
    id: "staff",
    label: "Staff & Permissions",
    href: "/admin/staff",
    built: true,
    icon: ShieldCheck,
    summary: "Team members, roles and access.",
    planned: ["Invite staff and assign roles", "Granular permissions enforced by the backend", "Audit log of staff actions"],
  },
];

export const ADMIN_SECTIONS = [...ADMIN_PRIMARY, ...ADMIN_SECONDARY];
export const ADMIN_SECTION_BY_ID = Object.fromEntries(ADMIN_SECTIONS.map((s) => [s.id, s]));
