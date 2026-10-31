"use client";

import * as React from "react";
import {
  ArrowLeftRight,
  Ban,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleUserRound,
  Clock3,
  Gift,
  LayoutDashboard,
  LifeBuoy,
  type LucideIcon,
  Package,
  Plus,
  RefreshCw,
  Settings,
  Share2,
  Sparkles,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ORDER_STATUS_META, type OrderStatus } from "@/lib/demo-account";
import type { Service } from "@/lib/catalog";
import { type MessageKey, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Navigation                                                                */
/* -------------------------------------------------------------------------- */

export type Destination =
  | "overview"
  | "new-order"
  | "orders"
  | "add-funds"
  | "transactions"
  | "support"
  | "referrals"
  | "settings"
  | "profile"
  | "social"
  | "ai";

export interface NavItem {
  id: Destination;
  /** Translation key for the label. */
  key: MessageKey;
  icon: LucideIcon;
}

/** The nav item's label in the current language. */
export const navLabel = (item: NavItem) => t(item.key);

export const PRIMARY_NAV: NavItem[] = [
  { id: "overview", key: "nav.overview", icon: LayoutDashboard },
  { id: "new-order", key: "nav.newOrder", icon: Plus },
  { id: "orders", key: "nav.orders", icon: Package },
  { id: "add-funds", key: "nav.addFunds", icon: Wallet },
  { id: "transactions", key: "nav.transactions", icon: ArrowLeftRight },
  { id: "support", key: "nav.support", icon: LifeBuoy },
];

/** SociVanta AI areas that live inside the dashboard (AI-06): kept to one discreet group. */
export const AI_NAV: NavItem[] = [
  { id: "ai", key: "nav.aiHome", icon: Sparkles },
  { id: "social", key: "nav.social", icon: Share2 },
];

export const SECONDARY_NAV: NavItem[] = [
  { id: "referrals", key: "nav.referrals", icon: Gift },
  { id: "settings", key: "nav.settings", icon: Settings },
  { id: "profile", key: "nav.profile", icon: CircleUserRound },
];

/** Dashboard pages. */
export const ROUTES: Record<Destination, string> = {
  overview: "/dashboard",
  "new-order": "/dashboard/new-order",
  orders: "/dashboard/orders",
  "add-funds": "/dashboard/add-funds",
  transactions: "/dashboard/transactions",
  support: "/dashboard/support",
  referrals: "/dashboard/referrals",
  settings: "/dashboard/settings",
  profile: "/dashboard/profile",
  social: "/dashboard/social",
  ai: "/dashboard/ai",
};

export const ordersHref = (query?: Record<string, string>) => {
  const qs = new URLSearchParams(query).toString();
  return qs ? `${ROUTES.orders}?${qs}` : ROUTES.orders!;
};

export const newOrderHref = (serviceId?: string) =>
  serviceId ? `${ROUTES["new-order"]}?service=${encodeURIComponent(serviceId)}` : ROUTES["new-order"]!;

/** The guided Service Finder. Part of ordering, so New Order stays highlighted in navigation. */
export const FINDER_ROUTE = "/dashboard/service-finder";

/** Opens New Order with an editable draft prepared from a previous order. */
export const reorderHref = (orderId: string) => `${ROUTES["new-order"]}?reorder=${encodeURIComponent(orderId)}`;

/** The nav item for the current page. */
export function useActiveDestination(): Destination | null {
  const pathname = usePathname();
  if (pathname === FINDER_ROUTE) return "new-order";
  const match = (Object.entries(ROUTES) as [Destination, string][])
    .sort((a, b) => b[1].length - a[1].length)
    .find(([, href]) => pathname === href || pathname.startsWith(`${href}/`));
  return match?.[0] ?? null;
}

export const transactionsHref = (query?: Record<string, string>) => {
  const qs = new URLSearchParams(query).toString();
  return qs ? `${ROUTES.transactions}?${qs}` : ROUTES.transactions!;
};

/** Support Center. `new` opens the ticket form; `order` / `tx` preselect a reference. */
export const supportHref = (query?: { ticket?: string; new?: boolean; order?: string; tx?: string }) => {
  const qs = new URLSearchParams();
  if (query?.ticket) qs.set("ticket", query.ticket);
  if (query?.new) qs.set("new", "1");
  if (query?.order) qs.set("order", query.order);
  if (query?.tx) qs.set("tx", query.tx);
  return qs.size ? `${ROUTES.support}?${qs}` : ROUTES.support!;
};

/** Navigates between dashboard pages. Every destination is now a built page. */
export function useDestinations() {
  const router = useRouter();
  return React.useCallback(
    (to: Destination, extra?: { service?: Service; query?: Record<string, string> }) => {
      if (to === "new-order") return router.push(newOrderHref(extra?.service?.id));
      const qs = extra?.query ? new URLSearchParams(extra.query).toString() : "";
      router.push(`${ROUTES[to]}${qs ? `?${qs}` : ""}`);
    },
    [router],
  );
}

/* -------------------------------------------------------------------------- */
/*  Small UI pieces                                                           */
/* -------------------------------------------------------------------------- */

const noopSubscribe = () => () => {};

/** False during SSR and hydration, true afterwards. */
export function useHydrated() {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export const ORDER_STATUS_STYLES: Record<OrderStatus, { className: string; dot: string; Icon: LucideIcon }> = {
  pending: { className: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60", Icon: Clock3 },
  processing: { className: "bg-secondary text-secondary-foreground", dot: "bg-primary", Icon: RefreshCw },
  attention: { className: "bg-soon-soft text-soon", dot: "bg-soon", Icon: TriangleAlert },
  completed: { className: "bg-ok-soft text-ok", dot: "bg-ok", Icon: CircleCheck },
  cancelled: { className: "bg-off-soft text-off", dot: "bg-off", Icon: Ban },
};

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const { className: tone, Icon } = ORDER_STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.72rem] font-semibold whitespace-nowrap ring-1 ring-current/15 ring-inset",
        tone,
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      {ORDER_STATUS_META[status].label}
    </span>
  );
}

/** Marks data that isn't real. Used on every demo surface. */
export function DemoTag({ className, children = "Demo data" }: { className?: string; children?: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full border border-dashed border-current/30 px-2 text-[0.62rem] font-bold tracking-wider uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Panel({
  className,
  children,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section className={cn("rounded-3xl border bg-card shadow-soft", className)} {...props}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  description,
  action,
  id,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-base font-bold sm:text-[1.05rem]">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Staggered entrance; CSS-only so content is visible before hydration. */
export function enter(i: number) {
  return {
    className:
      "animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 ease-out motion-reduce:animate-none",
    style: { animationDelay: `${i * 60}ms` },
  };
}

const pageButton =
  "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-full px-2.5 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40";

/** Numbered pager for client-side lists. */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  label,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  /** Accessible name, e.g. "Transaction pages". */
  label: string;
  onPage: (page: number) => void;
}) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
      <p className="text-xs text-muted-foreground tabular-nums">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
          className={cn(pageButton, "text-muted-foreground hover:bg-muted hover:text-foreground")}
        >
          <ChevronLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">Previous</span>
        </button>
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPage(n)}
            aria-label={`Page ${n}`}
            aria-current={n === page ? "page" : undefined}
            className={cn(
              pageButton,
              "tabular-nums",
              n === page ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page === pageCount}
          aria-label="Next page"
          className={cn(pageButton, "text-muted-foreground hover:bg-muted hover:text-foreground")}
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </nav>
  );
}
