"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Ellipsis, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import { MotionConfig } from "motion/react";
import { usePathname } from "next/navigation";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { Languages } from "lucide-react";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/site/header";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LANGUAGE_BY_CODE, t, TRANSLATED_PATHS, useDisplaySettings } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  type Destination,
  navLabel,
  AI_NAV,
  type NavItem,
  PRIMARY_NAV,
  ROUTES,
  SECONDARY_NAV,
  useActiveDestination,
  useDestinations,
  useHydrated,
} from "./shared";
import { useDemoOrders, usePreferences, useProfile } from "./demo-store";
import { useLiveAccount } from "./live-account";
import { Avatar, ServiceSearch, TopBar } from "./top-bar";

/* -------------------------------------------------------------------------- */
/*  Collapsed state, remembered per browser                                   */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = "sv-sidebar-collapsed";
const listeners = new Set<() => void>();
let memory = false;

function readCollapsed() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === null ? memory : v === "1";
  } catch {
    return memory;
  }
}

function writeCollapsed(value: boolean) {
  memory = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
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

/* -------------------------------------------------------------------------- */
/*  Sidebar                                                                   */
/* -------------------------------------------------------------------------- */

/** A link to a dashboard page. */
function NavTarget({
  id,
  className,
  children,
  ...props
}: { id: Destination; className?: string; children: React.ReactNode } & Pick<
  React.ComponentProps<"a">,
  "aria-label" | "aria-current" | "onClick"
>) {
  return (
    <Link href={ROUTES[id]} className={className} {...props}>
      {children}
    </Link>
  );
}

function SidebarLogo({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href="/dashboard"
      aria-label={t("nav.home")}
      className={cn(
        "rounded-lg text-white focus-visible:ring-3 focus-visible:ring-lime/40 focus-visible:outline-none [&_.text-primary]:text-[#a48bff]",
        collapsed && "[&>span>span]:hidden",
      )}
    >
      <Logo />
    </Link>
  );
}

function NavBadge({ collapsed }: { collapsed: boolean }) {
  const { attention } = useDemoOrders().summary;
  if (!attention) return null;
  if (collapsed) {
    return <span className="absolute top-2 end-2 size-2 rounded-full bg-[#ffb648] ring-2 ring-graphite" aria-hidden />;
  }
  return (
    <span className="ms-auto rounded-full bg-[#ffb648]/15 px-2 py-0.5 text-[0.68rem] font-bold text-[#ffc56b]">
      {attention}
    </span>
  );
}

/** Shared sizing so expanded rows and collapsed squares line up with the logo. */
const sidebarItemClass = (collapsed: boolean) =>
  cn(
    "group/item relative flex items-center gap-3 rounded-xl text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-lime/50 focus-visible:outline-none",
    collapsed ? "mx-auto size-11 justify-center" : "h-10 w-full px-2",
  );

function WithTooltip({ show, label, children }: { show: boolean; label: string; children: React.ReactElement }) {
  if (!show) return children;
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="inline-end" sideOffset={12}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const active = item.id === useActiveDestination();
  const { attention } = useDemoOrders().summary;
  const Icon = item.icon;

  return (
    <WithTooltip
      show={collapsed}
      label={item.id === "orders" && attention ? t("nav.needAttention", { label: navLabel(item), count: attention }) : navLabel(item)}
    >
      <NavTarget
        id={item.id}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? navLabel(item) : undefined}
        className={cn(
          sidebarItemClass(collapsed),
          active && "bg-white/[0.1] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] hover:bg-white/[0.1]",
        )}
      >
        {active ? (
          <span
            className={cn(
              "absolute top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-e-full bg-lime",
              collapsed ? "-start-4" : "-start-3",
            )}
            aria-hidden
          />
        ) : null}
        <span className="grid size-8 shrink-0 place-items-center">
          <Icon
            className={cn("size-[1.15rem] transition-colors", active ? "text-lime" : "group-hover/item:text-white")}
            aria-hidden
          />
        </span>
        {collapsed ? null : <span className="truncate">{navLabel(item)}</span>}
        {item.id === "orders" ? <NavBadge collapsed={collapsed} /> : null}
      </NavTarget>
    </WithTooltip>
  );
}

function SidebarNewOrder({ collapsed }: { collapsed: boolean }) {
  const active = useActiveDestination() === "new-order";
  return (
    <WithTooltip show={collapsed} label={t("nav.newOrder")}>
      <NavTarget
        id="new-order"
        aria-label={collapsed ? t("nav.newOrder") : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-[0_4px_10px_-6px_rgb(112_71_235/0.4)] transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-lime/60 focus-visible:outline-none",
          collapsed ? "mx-auto size-11" : "h-11 w-full",
          active && "ring-2 ring-lime/70 ring-offset-2 ring-offset-graphite dark:ring-offset-[#121318]",
        )}
      >
        <Plus className="size-[1.1rem]" strokeWidth={2.6} aria-hidden />
        {collapsed ? null : t("nav.newOrder")}
      </NavTarget>
    </WithTooltip>
  );
}

function Sidebar({ collapsed, animate }: { collapsed: boolean; animate: boolean }) {
  const { fullName } = useProfile();
  const live = useLiveAccount();
  const back = (
    <Link href="/" aria-label={collapsed ? t("nav.backToWebsite") : undefined} className={sidebarItemClass(collapsed)}>
      <span className="grid size-8 shrink-0 place-items-center">
        <ArrowLeft className="size-[1.15rem]" aria-hidden />
      </span>
      {collapsed ? null : t("nav.backToWebsite")}
    </Link>
  );

  return (
    <aside
      aria-label={t("nav.sidebar")}
      className={cn(
        "fixed inset-y-0 start-0 z-40 hidden w-(--sidebar) flex-col overflow-hidden bg-graphite text-white lg:flex dark:border-e dark:border-white/5 dark:bg-[#121318]",
        animate && "transition-[width] duration-300 ease-out motion-reduce:transition-none",
      )}
    >
      {/* Soft light leak, keeps the graphite from feeling flat */}
      <div
        className="pointer-events-none absolute -top-32 -start-28 size-72 rounded-full bg-primary/10 blur-3xl"
        aria-hidden
      />

      <div className={cn("relative flex h-16 shrink-0 items-center px-5", collapsed && "justify-center px-0")}>
        <SidebarLogo collapsed={collapsed} />
      </div>

      <div className="relative px-3 pt-3 pb-2">
        <SidebarNewOrder collapsed={collapsed} />
      </div>

      <nav aria-label={t("nav.primary")} className="relative flex-1 overflow-y-auto px-3 pt-3 scrollbar-inverse">
        <p
          className={cn(
            "mb-2 px-2 text-[0.65rem] font-bold tracking-[0.14em] text-white/55 uppercase",
            collapsed && "sr-only",
          )}
        >
          {t("nav.workspace")}
        </p>
        <ul className="space-y-1">
          {PRIMARY_NAV.filter((item) => item.id !== "new-order").map((item) => (
            <li key={item.id}>
              <SidebarItem item={item} collapsed={collapsed} />
            </li>
          ))}
        </ul>

        <p
          className={cn(
            "mt-7 mb-2 px-2 text-[0.65rem] font-bold tracking-[0.14em] text-white/55 uppercase",
            collapsed && "sr-only",
          )}
        >
          {t("nav.ai")}
        </p>
        {collapsed ? <div className="mx-auto mt-5 mb-3 h-px w-8 bg-white/10" aria-hidden /> : null}
        <ul className="space-y-1">
          {AI_NAV.map((item) => (
            <li key={item.id}>
              <SidebarItem item={item} collapsed={collapsed} />
            </li>
          ))}
        </ul>

        <p
          className={cn(
            "mt-7 mb-2 px-2 text-[0.65rem] font-bold tracking-[0.14em] text-white/55 uppercase",
            collapsed && "sr-only",
          )}
        >
          {t("nav.account")}
        </p>
        {collapsed ? <div className="mx-auto mt-5 mb-3 h-px w-8 bg-white/10" aria-hidden /> : null}
        <ul className="space-y-1">
          {SECONDARY_NAV.map((item) => (
            <li key={item.id}>
              <SidebarItem item={item} collapsed={collapsed} />
            </li>
          ))}
          <li>
            <WithTooltip show={collapsed} label={t("nav.backToWebsite")}>
              {back}
            </WithTooltip>
          </li>
        </ul>
      </nav>

      <div className="relative shrink-0 border-t border-white/10 p-3">
        {collapsed ? null : (
          <div className="mb-2 flex items-center gap-3 rounded-2xl bg-white/[0.05] p-2.5">
            <Avatar className="size-8" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{fullName}</p>
              <p className="truncate text-[0.7rem] text-white/50">{live ? live.profile.accountRef : t("nav.demoWorkspace")}</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => writeCollapsed(!collapsed)}
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          aria-expanded={!collapsed}
          className={cn(sidebarItemClass(collapsed), "text-white/50")}
        >
          <span className="grid size-8 shrink-0 place-items-center">
            {collapsed ? (
              <PanelLeftOpen className="size-[1.15rem]" aria-hidden />
            ) : (
              <PanelLeftClose className="size-[1.15rem]" aria-hidden />
            )}
          </span>
          {collapsed ? null : t("nav.collapse")}
        </button>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mobile & tablet: bottom tab bar                                           */
/* -------------------------------------------------------------------------- */

const TAB_IDS: Destination[] = ["overview", "orders", "new-order", "add-funds"];
const MORE_IDS: Destination[] = ["transactions", "support", "social", "referrals", "settings", "profile"];
const ALL_NAV = [...PRIMARY_NAV, ...AI_NAV, ...SECONDARY_NAV];
const navItem = (id: Destination) => ALL_NAV.find((n) => n.id === id)!;

function BottomNav() {
  const go = useDestinations();
  const activeId = useActiveDestination();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const { attention } = useDemoOrders().summary;

  // New Order is a focused flow with its own sticky action bar.
  if (activeId === "new-order") return null;

  return (
    <>
      <nav
        aria-label={t("nav.primary")}
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-xl grid-cols-5 px-2">
          {TAB_IDS.map((id) => {
            const item = navItem(id);
            const Icon = item.icon;
            const active = id === activeId;
            if (id === "new-order") {
              return (
                <li key={id} className="grid place-items-center">
                  <NavTarget id={id} className="group -mt-6 flex flex-col items-center gap-1 focus-visible:outline-none">
                    <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_30px_-8px_rgb(112_71_235/0.7)] ring-4 ring-background transition-transform group-active:scale-95 group-focus-visible:ring-primary/40">
                      <Plus className="size-6" strokeWidth={2.6} aria-hidden />
                    </span>
                    <span className="text-[0.68rem] font-semibold text-foreground">{t("nav.newOrder")}</span>
                  </NavTarget>
                </li>
              );
            }
            return (
              <li key={id}>
                <NavTarget
                  id={id}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl text-[0.68rem] font-medium text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none active:bg-muted",
                    active && "font-semibold text-primary",
                  )}
                >
                  {active ? (
                    <span className="absolute top-0 h-0.5 w-8 rounded-b-full bg-primary" aria-hidden />
                  ) : null}
                  <span className="relative">
                    <Icon className="size-5" aria-hidden />
                    {id === "orders" && attention ? (
                      <span className="absolute -top-1 -end-2 grid h-4 min-w-4 place-items-center rounded-full bg-soon px-1 text-[0.58rem] font-bold text-white ring-2 ring-card dark:text-graphite">
                        {attention}
                      </span>
                    ) : null}
                  </span>
                  {navLabel(item)}
                </NavTarget>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl text-[0.68rem] font-medium text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none active:bg-muted"
            >
              <Ellipsis className="size-5" aria-hidden />
              {t("nav.more")}
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-border" aria-hidden />
          <div className="flex items-center justify-between px-5">
            <SheetTitle className="font-heading text-base font-bold">{t("nav.more")}</SheetTitle>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted"
              aria-label={t("common.close")}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <ul className="grid grid-cols-2 gap-2 px-4">
            {MORE_IDS.map((id) => {
              const item = navItem(id);
              const Icon = item.icon;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      go(id);
                    }}
                    className="flex h-14 w-full items-center gap-3 rounded-2xl border bg-card px-3.5 text-start text-sm font-semibold transition-colors hover:border-primary/30 active:bg-muted"
                  >
                    <span className="grid size-8 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    {navLabel(item)}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mx-4 flex items-center justify-between gap-3 rounded-2xl bg-muted/60 px-3.5 py-2">
            <span className="text-sm font-medium">{t("nav.appearance")}</span>
            <ThemeToggle />
          </div>
          <Link
            href="/"
            className="mx-4 flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> {t("nav.backToWebsite")}
          </Link>
        </SheetContent>
      </Sheet>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shell                                                                     */
/* -------------------------------------------------------------------------- */

/** Shown on pages that aren't translated into the selected language yet. */
function TranslationNotice() {
  const { language } = useDisplaySettings();
  const pathname = usePathname();
  if (language === "en" || TRANSLATED_PATHS.includes(pathname)) return null;
  const name = new Intl.DisplayNames(LANGUAGE_BY_CODE[language].intl, { type: "language" }).of(language) ?? LANGUAGE_BY_CODE[language].native;
  return (
    <div className="border-b bg-secondary/40 dark:bg-secondary/20">
      <p role="note" className="mx-auto flex max-w-[90rem] items-center gap-2 px-4 py-2 text-xs font-medium text-secondary-foreground sm:px-6 lg:px-8">
        <Languages className="size-3.5 shrink-0" aria-hidden />
        {t("i18n.pageInEnglish", { language: name })}
      </p>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const display = useDisplaySettings();
  const { dir, intl } = LANGUAGE_BY_CODE[display.language];
  const pathname = usePathname();
  // Untranslated pages are English, so their content reads left to right even in an RTL frame.
  const pageInEnglish = display.language !== "en" && !TRANSLATED_PATHS.includes(pathname);
  const collapsed = useCollapsed();
  const hydrated = useHydrated();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const openSearch = React.useCallback(() => setSearchOpen(true), []);
  const { reduceMotion } = usePreferences();

  // Language and direction for the dashboard; the marketing site stays English, left to right.
  React.useEffect(() => {
    const html = document.documentElement;
    html.lang = display.language === "en" ? "en" : intl.split("-u-")[0];
    html.dir = dir;
    return () => {
      html.lang = "en";
      html.dir = "ltr";
    };
  }, [display.language, dir, intl]);

  // The Settings "Reduce motion" choice: CSS animations via a root attribute, Motion via MotionConfig.
  React.useEffect(() => {
    document.documentElement.toggleAttribute("data-reduce-motion", reduceMotion);
    return () => document.documentElement.removeAttribute("data-reduce-motion");
  }, [reduceMotion]);

  return (
    <DirectionProvider direction={dir}>
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
    <div
      className="min-h-dvh"
      style={{ "--sidebar": collapsed ? "4.75rem" : "16rem" } as React.CSSProperties}
    >
      <a
        href="#dashboard-main"
        className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:start-3"
      >
        {t("nav.skip")}
      </a>

      <Sidebar collapsed={collapsed} animate={hydrated} />

      <div className={cn("lg:ps-(--sidebar)", hydrated && "transition-[padding] duration-300 ease-out motion-reduce:transition-none")}>
        <TopBar
          onOpenSearch={openSearch}
          mobileLogo={
            <Link href="/dashboard" aria-label="Sociotix dashboard" className="[&>span>span]:hidden sm:[&>span>span]:inline">
              <Logo />
            </Link>
          }
        />
        <TranslationNotice />
        <main id="dashboard-main" className="pb-28 lg:pb-12" dir={pageInEnglish ? "ltr" : undefined} lang={pageInEnglish ? "en" : undefined}>
          <DirectionProvider direction={pageInEnglish ? "ltr" : dir}>{children}</DirectionProvider>
        </main>
      </div>

      <BottomNav />

      <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
        <SheetContent side="top" showCloseButton={false} className="max-h-[85dvh] overflow-y-auto rounded-b-3xl p-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="font-heading text-base font-bold">{t("nav.findService")}</SheetTitle>
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted"
              aria-label={t("nav.closeSearch")}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <ServiceSearch id="mobile-search" inline autoFocus onPick={() => setSearchOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
    </MotionConfig>
    </DirectionProvider>
  );
}
