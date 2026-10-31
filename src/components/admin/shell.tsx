"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import {
  ArrowLeft,
  Bell,
  CircleDashed,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldAlert,
  ShieldCheck,
  Siren,
  X,
} from "lucide-react";
import { Logo, PlatformTile } from "@/components/brand";
import { ThemeToggle } from "@/components/site/header";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ACTIVITY, ADMIN_CUSTOMERS, ADMIN_DEPOSITS, ADMIN_ORDERS, ADMIN_SUMMARY, ADMIN_TICKETS, ago, ATTENTION, CUSTOMER_BY_ID, orderService } from "@/lib/admin-demo";
import { staffSignOutAction } from "@/app/admin/(access)/actions";
import { useViewer } from "@/components/auth/viewer";
import { cn } from "@/lib/utils";
import { ADMIN_PRIMARY, ADMIN_SECONDARY, type AdminSection } from "./nav";
import { SEVERITY } from "./ui";
import { popupSurface, menuItem as sharedMenuItem, menuSeparator } from "./menu";

/* -------------------------------------------------------------------------- */
/*  Collapsed sidebar, remembered per browser                                 */
/* -------------------------------------------------------------------------- */

const COLLAPSE_KEY = "sv-admin-sidebar-collapsed";
const listeners = new Set<() => void>();

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function setCollapsed(v: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
  } catch {}
  listeners.forEach((l) => l());
}

function useCollapsed() {
  return React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readCollapsed,
    () => false,
  );
}

/** Work waiting in each queue, shown on its nav item (demo mode only — live queues arrive with their backends). */
const QUEUES: Record<string, { count: number; label: string }> = {
  orders: { count: ADMIN_SUMMARY.review, label: "awaiting review" },
  payments: { count: ADMIN_SUMMARY.pendingVerification.length, label: "to verify" },
  support: { count: ADMIN_SUMMARY.awaitingStaff.length, label: "awaiting staff" },
};

const isActive = (pathname: string, s: AdminSection) => (s.href === "/admin" ? pathname === "/admin" : pathname.startsWith(s.href));

/* -------------------------------------------------------------------------- */
/*  Navigation                                                                */
/* -------------------------------------------------------------------------- */

function NavLink({ section, collapsed, onNavigate }: { section: AdminSection; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, section);
  const Icon = section.icon;
  const demo = useViewer()?.demo ?? false;
  const queue = demo && QUEUES[section.id]?.count ? QUEUES[section.id] : null;
  const preview = !section.built;
  const link = (
    <Link
      href={section.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? section.label : undefined}
      className={cn(
        "group/item relative flex items-center gap-3 rounded-xl text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-lime/50 focus-visible:outline-none",
        collapsed ? "mx-auto size-10 justify-center" : "h-10 w-full px-2.5",
        active && "bg-white/[0.1] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] hover:bg-white/[0.1]",
      )}
    >
      {active ? <span className={cn("absolute top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-e-full bg-lime", collapsed ? "-start-4" : "-start-3")} aria-hidden /> : null}
      <span className="grid size-7 shrink-0 place-items-center">
        <Icon className={cn("size-[1.05rem]", active ? "text-lime" : "group-hover/item:text-white")} aria-hidden />
      </span>
      {collapsed ? null : <span className="truncate">{section.label}</span>}
      {collapsed && queue ? <span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-lime ring-2 ring-graphite" aria-hidden /> : null}
      {!collapsed && queue ? (
        <span className="ms-auto shrink-0 rounded-full bg-lime/15 px-1.5 py-px text-[0.68rem] font-bold text-lime tabular-nums" title={`${queue.count} ${queue.label}`}>
          {queue.count}
          <span className="sr-only"> {queue.label}</span>
        </span>
      ) : !collapsed && preview ? (
        <span className="ms-auto shrink-0" title="Preview · not built yet">
          <CircleDashed className="size-3 text-white/30" aria-hidden />
        </span>
      ) : null}
      {preview ? <span className="sr-only"> (preview)</span> : null}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="inline-end" sideOffset={12}>
        {section.label}
        {queue ? ` · ${queue.count} ${queue.label}` : ""}
        {preview ? " · Preview" : ""}
      </TooltipContent>
    </Tooltip>
  );
}

function NavGroups({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  // Hides sections the role can't open. Cosmetic only — every page re-checks on the server.
  const viewer = useViewer();
  const visible = (s: AdminSection) => !viewer?.sections || viewer.sections.includes(s.id);
  const heading = (label: string, first?: boolean) => (
    <p className={cn("mb-2 px-2.5 text-[0.65rem] font-bold tracking-[0.14em] text-white/55 uppercase", !first && "mt-7", collapsed && "sr-only")}>{label}</p>
  );
  return (
    <>
      {heading("Operations", true)}
      <ul className="space-y-0.5">
        {ADMIN_PRIMARY.filter(visible).map((s) => (
          <li key={s.id}>
            <NavLink section={s} collapsed={collapsed} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
      {collapsed ? <div className="mx-auto my-4 h-px w-8 bg-white/10" aria-hidden /> : null}
      {heading("Administration")}
      <ul className="space-y-0.5">
        {ADMIN_SECONDARY.filter(visible).map((s) => (
          <li key={s.id}>
            <NavLink section={s} collapsed={collapsed} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </>
  );
}

function AdminLogo({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link
      href="/admin"
      // Icon-only when collapsed; otherwise the visible "SociVanta Admin" is the name.
      aria-label={collapsed ? "SociVanta Admin" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-lg text-white focus-visible:ring-3 focus-visible:ring-lime/40 focus-visible:outline-none [&_.text-primary]:text-[#a48bff]",
        collapsed && "[&>span>span]:hidden",
      )}
    >
      <Logo />
      {collapsed ? null : " "}
      {collapsed ? null : (
        <span className="rounded-md bg-lime px-1.5 py-0.5 text-[0.6rem] font-extrabold tracking-wider text-graphite uppercase">Admin</span>
      )}
    </Link>
  );
}

function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      aria-label="Admin"
      className="fixed inset-y-0 start-0 z-40 hidden w-(--admin-sidebar) flex-col bg-graphite text-white transition-[width] duration-300 ease-out motion-reduce:transition-none lg:flex dark:border-e dark:border-white/5 dark:bg-[#121318]"
    >
      <div className={cn("flex h-16 shrink-0 items-center px-5", collapsed && "justify-center px-0")}>
        <AdminLogo collapsed={collapsed} />
      </div>
      <nav aria-label="Admin sections" className="scrollbar-inverse flex-1 overflow-y-auto px-3 pt-2 pb-4">
        <NavGroups collapsed={collapsed} />
      </nav>
      <div className="shrink-0 space-y-1 border-t border-white/10 p-3">
        <Link
          href="/dashboard"
          aria-label={collapsed ? "Customer dashboard" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-xl text-sm font-medium text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-lime/50 focus-visible:outline-none",
            collapsed ? "mx-auto size-10 justify-center" : "h-9 px-2",
          )}
        >
          <span className="grid size-7 shrink-0 place-items-center">
            <LayoutDashboard className="size-[1.05rem]" aria-hidden />
          </span>
          {collapsed ? null : "Customer dashboard"}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className={cn(
            "flex items-center gap-3 rounded-xl text-sm font-medium text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-lime/50 focus-visible:outline-none",
            collapsed ? "mx-auto size-10 justify-center" : "h-9 w-full px-2",
          )}
        >
          <span className="grid size-7 shrink-0 place-items-center">
            {collapsed ? <PanelLeftOpen className="size-[1.05rem]" aria-hidden /> : <PanelLeftClose className="size-[1.05rem]" aria-hidden />}
          </span>
          {collapsed ? null : "Collapse sidebar"}
        </button>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/*  Top bar                                                                   */
/* -------------------------------------------------------------------------- */

const iconButton =
  "relative grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none data-popup-open:bg-muted data-popup-open:text-foreground";
const popupClass = popupSurface;

type Result = { id: string; title: string; meta: string; href: string; tile?: React.ReactNode };

function searchAdmin(query: string, demo: boolean): Result[] {
  const q = query.trim().toLowerCase();
  if (!q || !demo) return [];
  const orders = ADMIN_ORDERS.filter((o) => {
    const { service } = orderService(o);
    return [o.id, CUSTOMER_BY_ID[o.customerId].name, service.name].some((v) => v.toLowerCase().includes(q));
  })
    .slice(0, 5)
    .map((o) => {
      const { service, platform } = orderService(o);
      return {
        id: o.id,
        title: `${o.id} · ${service.name}`,
        meta: CUSTOMER_BY_ID[o.customerId].name,
        href: `/admin/orders?order=${o.id}`,
        tile: <PlatformTile platform={platform} size="xs" />,
      };
    });
  const customers = ADMIN_CUSTOMERS.filter((c) => [c.id, c.name, c.email].some((v) => v.toLowerCase().includes(q)))
    .slice(0, 3)
    .map((c) => ({ id: c.id, title: c.name, meta: `${c.id} · ${c.email}`, href: `/admin/customers?customer=${c.id}` }));
  const deposits = ADMIN_DEPOSITS.filter((d) => d.id.toLowerCase().includes(q))
    .slice(0, 3)
    .map((d) => ({ id: d.id, title: `${d.id} · ${d.method}`, meta: `${CUSTOMER_BY_ID[d.customerId].name} · ${d.amount.toFixed(2)}`, href: `/admin/payments?txn=${d.id}` }));
  const tickets = ADMIN_TICKETS.filter((t) => [t.id, t.subject].some((v) => v.toLowerCase().includes(q)))
    .slice(0, 3)
    .map((t) => ({ id: t.id, title: `${t.id} · ${t.subject}`, meta: CUSTOMER_BY_ID[t.customerId].name, href: `/admin/support?ticket=${t.id}` }));
  return [...customers, ...orders, ...deposits, ...tickets];
}

function AdminSearch({ className, autoFocus, onPick }: { className?: string; autoFocus?: boolean; onPick?: () => void }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const demo = useViewer()?.demo ?? false;
  const results = React.useMemo(() => searchAdmin(query, demo), [query, demo]);
  const go = (r: Result) => {
    router.push(r.href);
    setQuery("");
    setOpen(false);
    onPick?.();
  };

  return (
    <div className={cn("relative", className)} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <label htmlFor="admin-search" className="sr-only">
        Search orders and customers
      </label>
      <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        id="admin-search"
        type="search"
        role="combobox"
        aria-expanded={open && Boolean(query.trim())}
        aria-controls="admin-search-results"
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `admin-res-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        value={query}
        placeholder="Search orders, customers…"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            go(results[active]);
          } else if (e.key === "Escape") {
            setQuery("");
            setOpen(false);
          }
        }}
        className="h-10 w-full rounded-full border bg-card ps-10 pe-4 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground hover:border-primary/30 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
      />
      {open && query.trim() ? (
        <div className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(26rem,70dvh)] overflow-y-auto overscroll-contain rounded-2xl border border-border/80 bg-popover p-1.5 shadow-float dark:border-white/10">
          {results.length ? (
            <ul id="admin-search-results" role="listbox" aria-label="Results">
              {results.map((r, i) => (
                <li
                  key={r.id}
                  id={`admin-res-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r)}
                  className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors", i === active && "bg-primary/[0.07] dark:bg-primary/15")}
                >
                  {r.tile ?? (
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[0.6rem] font-bold text-secondary-foreground">
                      {r.title.slice(0, 1)}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{r.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.meta}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p id="admin-search-results" role="listbox" aria-label="Results" className="px-3 py-5 text-center text-sm text-muted-foreground">
              {demo ? <>Nothing matches “{query.trim()}”.</> : "Search across orders and customers isn't connected yet. Use the Customers page to find a customer."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Alerts() {
  const demo = useViewer()?.demo ?? false;
  const urgent = demo ? ATTENTION.filter((a) => a.count > 0) : [];
  return (
    <Popover.Root>
      <Popover.Trigger className={iconButton} aria-label={`Operational alerts, ${urgent.length}`}>
        <Siren className="size-[1.1rem]" aria-hidden />
        {urgent.length ? (
          <span className="absolute end-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[0.6rem] font-bold text-white ring-2 ring-background">
            {urgent.length}
          </span>
        ) : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <Popover.Popup className={cn(popupClass, "w-[min(22rem,calc(100vw-1.5rem))] p-1.5")}>
            <Popover.Title className="px-2.5 pt-1.5 pb-2 font-heading text-sm font-bold">Operational alerts</Popover.Title>
            {urgent.length === 0 ? <p className="px-2.5 pb-3 text-sm text-muted-foreground">No operational alerts.</p> : null}
            <ul className="empty:hidden">
              {urgent.map((a) => {
                const { Icon, className } = SEVERITY[a.severity];
                return (
                  <li key={a.id}>
                    <Link href={a.href} className="flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-muted">
                      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", className)}>
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">
                          {a.title} <span className="text-muted-foreground tabular-nums">· {a.count}</span>
                        </span>
                        <span className="block text-xs text-muted-foreground">{a.detail}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Notifications() {
  const demo = useViewer()?.demo ?? false;
  const items = demo ? ACTIVITY.slice(0, 6) : [];
  return (
    <Popover.Root>
      <Popover.Trigger className={iconButton} aria-label="Notifications">
        <Bell className="size-[1.1rem]" aria-hidden />
        {items.length ? <span className="absolute end-2 top-2 size-2 rounded-full bg-primary ring-2 ring-background" aria-hidden /> : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <Popover.Popup className={cn(popupClass, "w-[min(22rem,calc(100vw-1.5rem))]")}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <Popover.Title className="font-heading text-sm font-bold">Notifications</Popover.Title>
              {demo ? <span className="text-[0.65rem] font-bold tracking-wider text-muted-foreground uppercase">Demo</span> : null}
            </div>
            {items.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p> : null}
            <ul className="max-h-[min(22rem,60vh)] overflow-y-auto p-1.5 empty:hidden">
              {items.map((e) => (
                <li key={e.id} className="rounded-xl px-2.5 py-2">
                  <p className="text-sm">
                    <span className="font-semibold">{e.actor}</span> {e.action}
                  </p>
                  <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                    {e.ref} · {ago(e.at)}
                  </p>
                </li>
              ))}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

const menuItem = sharedMenuItem;

function ProfileMenu() {
  const viewer = useViewer();
  const name = viewer?.name ?? "Staff";
  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          className="flex items-center gap-2.5 rounded-full p-0.5 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none data-popup-open:bg-muted xl:pe-3"
        >
          <span className="grid size-9 place-items-center rounded-full bg-graphite font-heading text-xs font-bold text-lime dark:bg-white/10" aria-hidden>
            {viewer?.initials ?? "?"}
          </span>
          <span className="hidden text-start xl:block">
            <span className="block text-sm leading-tight font-semibold">{name}</span>
            <span className="block text-[0.7rem] leading-tight text-muted-foreground">{viewer?.roleName ?? "Staff"}</span>
          </span>
          <span className="sr-only">Account menu</span>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50">
            <Menu.Popup className={cn(popupClass, "w-64 p-1.5")}>
              <div className="px-2.5 py-2">
                <p className="text-sm font-semibold">{name}</p>
                <p className="text-xs text-muted-foreground">{viewer?.email}</p>
                <p className="mt-1.5 text-[0.7rem] text-muted-foreground">{viewer?.roleName} · two-step verified</p>
              </div>
              <Menu.Separator className={menuSeparator} />
              <Menu.LinkItem className={menuItem} render={<Link href="/admin/account" />}>
                <ShieldCheck aria-hidden /> Account &amp; security
              </Menu.LinkItem>
              <Menu.LinkItem className={menuItem} render={<Link href="/" />}>
                <ArrowLeft aria-hidden /> Back to website
              </Menu.LinkItem>
              <Menu.Separator className={menuSeparator} />
              <Menu.Item className={menuItem} onClick={() => void staffSignOutAction()}>
                <LogOut aria-hidden /> Sign out
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </>
  );
}

function DemoBadge() {
  const viewer = useViewer();
  if (!viewer?.demo) return null;
  return (
    <span className="me-1 inline-flex h-7 items-center gap-1.5 rounded-full bg-lime px-2.5 text-[0.7rem] font-extrabold tracking-wide text-graphite">
      <ShieldAlert className="size-3.5" aria-hidden /> Demo data
    </span>
  );
}

function DemoNotice() {
  const viewer = useViewer();
  if (!viewer?.demo) return null;
  return (
    <div className="border-b border-soon/20 bg-soon-soft/60">
      <p role="note" className="mx-auto flex max-w-[96rem] items-start gap-2 px-4 py-2 text-xs text-foreground/80 sm:px-6 lg:px-8">
        <ShieldAlert className="mt-px size-3.5 shrink-0 text-soon" aria-hidden />
        <span>
          <span className="font-semibold">Demo data.</span> Records here are illustrative samples and every admin action is inactive. Your sign-in and permissions are real and checked by the server.
        </span>
      </p>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-xl supports-backdrop-filter:bg-background/70">
      <div className="mx-auto flex h-16 max-w-[96rem] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        <button type="button" onClick={onMenu} className={cn(iconButton, "lg:hidden")} aria-label="Open navigation">
          <MenuIcon className="size-5" aria-hidden />
        </button>
        <AdminSearch className="hidden max-w-md flex-1 md:block" />
        <div className="ms-auto flex items-center gap-1 sm:gap-1.5">
          <DemoBadge />
          <Alerts />
          <Notifications />
          <ThemeToggle className="hidden text-muted-foreground sm:inline-flex" />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shell                                                                     */
/* -------------------------------------------------------------------------- */

export function AdminShell({ children }: { children: React.ReactNode }) {
  const collapsed = useCollapsed();
  const [navOpen, setNavOpen] = React.useState(false);
  const pathname = usePathname();
  // Close the phone navigation after a route change.
  const [seen, setSeen] = React.useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setNavOpen(false);
  }

  return (
    <div className="min-h-dvh bg-background" style={{ "--admin-sidebar": collapsed ? "4.5rem" : "15rem" } as React.CSSProperties}>
      <a
        href="#admin-main"
        className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      >
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} />

      <div className="transition-[padding] duration-300 ease-out motion-reduce:transition-none lg:ps-(--admin-sidebar)">
        <TopBar onMenu={() => setNavOpen(true)} />
        <DemoNotice />
        <main id="admin-main" className="pb-12">
          {children}
        </main>
      </div>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-[min(18rem,85vw)] gap-0 bg-graphite p-0 text-white dark:bg-[#121318]">
          <div className="flex h-16 items-center justify-between px-5">
            <SheetTitle className="sr-only">Admin navigation</SheetTitle>
            <AdminLogo />
            <button type="button" onClick={() => setNavOpen(false)} aria-label="Close navigation" className="grid size-9 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="px-4 pb-3 md:hidden">
            <AdminSearch
              onPick={() => setNavOpen(false)}
              className="[&_input]:border-white/15 [&_input]:bg-white/[0.06] [&_input]:text-white [&_input]:placeholder:text-white/45 [&_svg]:text-white/50"
            />
          </div>
          <nav aria-label="Admin sections" className="scrollbar-inverse flex-1 overflow-y-auto px-3 pb-4">
            <NavGroups collapsed={false} onNavigate={() => setNavOpen(false)} />
          </nav>
          <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
            <Link href="/dashboard" className="text-sm font-medium text-white/60 hover:text-white">
              Customer dashboard
            </Link>
            <ThemeToggle className="text-white/70" />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
