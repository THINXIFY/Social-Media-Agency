"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Popover } from "@base-ui/react/popover";
import { Menu } from "@base-ui/react/menu";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CheckCheck,
  CircleCheck,
  CircleUserRound,
  FlaskConical,
  Languages,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  TriangleAlert,
  Wallet,
  X,
} from "lucide-react";
import { PlatformTile } from "@/components/brand";
import { ThemeToggle } from "@/components/site/header";
import { CATEGORY_META, CATALOG_TOTALS, matchesQuery, PLATFORM_BY_ID, SERVICES, type Service } from "@/lib/catalog";
import { type ActivityKind, DEMO_WALLET, money, usd } from "@/lib/demo-account";
import { signOutAction } from "@/app/(auth)/actions";
import { useViewer } from "@/components/auth/viewer";
import { useLiveAccount } from "./live-account";
import { LiveNotifications } from "./live-notifications";
import { formatNumber, languageOf, t, useDisplaySettings } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { markNotificationsRead, resetDemoData, useDemoActivity, useAvatarPreview, useDemoOrders, useDemoPrefsSaved, useOrderingChanges, usePaymentPreviews, useProfile, useTickets, whenLabel } from "./demo-store";
import { offersLanguages, RegionDialog } from "./region";
import { DemoTag, useDestinations } from "./shared";

/* -------------------------------------------------------------------------- */
/*  Global service search                                                     */
/* -------------------------------------------------------------------------- */

const POPULAR = SERVICES.filter((s) => s.featured);

export function searchServices(query: string, limit: number) {
  const q = query.trim();
  if (!q) return { results: POPULAR.slice(0, limit), total: POPULAR.length };
  const all = SERVICES.filter((s) => matchesQuery(s, q)).sort((a, b) => Number(b.featured) - Number(a.featured));
  return { results: all.slice(0, limit), total: all.length };
}

export function ServiceSearch({
  id,
  autoFocus,
  onPick,
  className,
  inline = false,
}: {
  id: string;
  autoFocus?: boolean;
  onPick?: () => void;
  className?: string;
  /** Render results below the field instead of in a floating dropdown. */
  inline?: boolean;
}) {
  const go = useDestinations();
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(inline);
  const [active, setActive] = React.useState(0);
  const { results, total } = React.useMemo(() => searchServices(query, 6), [query]);
  const listId = `${id}-results`;
  const showList = inline || open;

  const pick = (s: Service) => {
    go("new-order", { service: s });
    setOpen(inline);
    onPick?.();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && showList && results[active]) {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === "Escape" && !inline) {
      if (query) setQuery("");
      else e.currentTarget.blur();
      setOpen(false);
    }
  };

  return (
    <div
      className={cn("relative", className)}
      onBlur={(e) => {
        if (!inline && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id} className="sr-only">
        {t("search.label")}
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 start-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        id={id}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        value={query}
        placeholder={t("search.placeholder", { count: formatNumber(CATALOG_TOTALS.services) })}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="h-10 w-full rounded-full border bg-card pe-16 ps-10 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground hover:border-primary/30 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
      />
      {query ? (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            document.getElementById(id)?.focus();
          }}
          className="absolute top-1/2 end-2.5 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("search.clear")}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : !inline ? (
        <kbd className="pointer-events-none absolute top-1/2 end-3 hidden -translate-y-1/2 rounded-md border bg-muted px-1.5 py-0.5 font-sans text-[0.65rem] font-semibold text-muted-foreground xl:block">
          {t("search.shortcut")}
        </kbd>
      ) : null}

      {showList ? (
        <div
          className={cn(
            !inline &&
              "absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 animate-in rounded-2xl border bg-popover p-1.5 shadow-float fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none",
            inline && "mt-3",
          )}
        >
          <p className="px-2.5 pt-1.5 pb-1 text-[0.68rem] font-bold tracking-wider text-muted-foreground uppercase">
            {query.trim() ? t("search.matching", { count: formatNumber(total) }) : t("search.popular")}
          </p>
          {results.length ? (
            <ul id={listId} role="listbox" aria-label={t("search.results")}>
              {results.map((s, i) => {
                const p = PLATFORM_BY_ID[s.platformId];
                return (
                  <li
                    key={s.id}
                    id={`${id}-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(s)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors",
                      i === active && "bg-muted",
                    )}
                  >
                    <PlatformTile platform={p} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{s.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.short} · {CATEGORY_META[s.category].label}
                      </span>
                    </span>
                    <ArrowRight
                      className={cn("size-4 shrink-0 text-primary opacity-0 transition-opacity", i === active && "opacity-100")}
                      aria-hidden
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <div id={listId} role="listbox" aria-label={t("search.results")} className="px-2.5 py-6 text-center">
              <p className="text-sm font-semibold">{t("search.noMatch", { query: query.trim() })}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("search.noMatchHint")}</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Notifications                                                             */
/* -------------------------------------------------------------------------- */

export const ACTIVITY_ICONS: Record<ActivityKind, { Icon: typeof Bell; className: string }> = {
  progress: { Icon: RefreshCw, className: "bg-secondary text-secondary-foreground" },
  attention: { Icon: TriangleAlert, className: "bg-soon-soft text-soon" },
  wallet: { Icon: Wallet, className: "bg-lime/40 text-graphite dark:bg-lime/15 dark:text-lime" },
  completed: { Icon: CircleCheck, className: "bg-ok-soft text-ok" },
  support: { Icon: CircleUserRound, className: "bg-muted text-muted-foreground" },
  demo: { Icon: FlaskConical, className: "border border-dashed border-primary/40 bg-card text-primary" },
};

const popupClass =
  "origin-(--transform-origin) rounded-2xl border bg-popover text-popover-foreground shadow-float outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none";

const iconButton =
  "relative grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none data-popup-open:bg-muted data-popup-open:text-foreground";

function Notifications() {
  const { activity, unread: unreadIds } = useDemoActivity();
  const unread = unreadIds.length;

  return (
    <Popover.Root>
      <Popover.Trigger className={iconButton} aria-label={unread ? t("notif.unreadCount", { count: unread }) : t("notif.title")}>
        <Bell className="size-[1.1rem]" aria-hidden />
        {unread ? (
          <span className="absolute top-1 end-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.6rem] font-bold text-primary-foreground ring-2 ring-background">
            {unread}
          </span>
        ) : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <Popover.Popup className={cn(popupClass, "w-[min(23rem,calc(100vw-1.5rem))]")}>
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <Popover.Title className="font-heading text-sm font-bold">{t("notif.title")}</Popover.Title>
                <DemoTag className="text-muted-foreground" />
              </div>
              <button
                type="button"
                disabled={!unread}
                onClick={() => markNotificationsRead(unreadIds)}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-secondary disabled:pointer-events-none disabled:text-muted-foreground"
              >
                <CheckCheck className="size-3.5" aria-hidden /> {t("notif.markAll")}
              </button>
            </div>
            {activity.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up. Updates about your orders and payments will appear here.</p>
            ) : null}
            <ul className="max-h-[min(24rem,60vh)] overflow-y-auto p-1.5 empty:hidden">
              {activity.map((a) => {
                const { Icon, className } = ACTIVITY_ICONS[a.kind];
                const isUnread = unreadIds.includes(a.id);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => markNotificationsRead([a.id])}
                      className="flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-start transition-colors hover:bg-muted"
                    >
                      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", className)}>
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm", isUnread ? "font-semibold" : "font-medium text-muted-foreground")}>
                          {a.title}
                        </span>
                        <span className="block text-xs text-muted-foreground">{a.detail}</span>
                        <span className="mt-1 block text-[0.7rem] text-muted-foreground/80">{whenLabel(a.when)}</span>
                      </span>
                      {isUnread ? (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label={t("notif.unread")} />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            {languageOf().code !== "en" ? (
              <p className="border-t px-4 py-2 text-[0.7rem] text-muted-foreground">{t("notif.contentNote")}</p>
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* -------------------------------------------------------------------------- */
/*  Profile menu                                                              */
/* -------------------------------------------------------------------------- */

const menuItem =
  "flex h-9 w-full cursor-default items-center gap-2.5 rounded-lg px-2.5 text-sm outline-none select-none data-highlighted:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground";

export function Avatar({ className }: { className?: string }) {
  const { initials } = useProfile();
  const photo = useAvatarPreview();
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-linear-to-br from-[#7047eb] to-[#5a35d8] font-heading text-xs font-bold text-white",
        className,
      )}
      aria-hidden
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL preview, never uploaded
        <img src={photo} alt="" className="size-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

function ProfileMenu() {
  const go = useDestinations();
  const viewer = useViewer();
  const { fullName, profile } = useProfile();
  const { resolvedTheme, setTheme } = useTheme();
  const { edited } = useProfile();
  const live = useLiveAccount();
  const prefsSaved = useDemoPrefsSaved();
  const display = useDisplaySettings();
  const [regionOpen, setRegionOpen] = React.useState(false);
  const changes =
    useDemoOrders().changes +
    usePaymentPreviews().length +
    useTickets().changes +
    useOrderingChanges() +
    (edited ? 1 : 0) +
    (prefsSaved ? 1 : 0);
  return (
    <>
    <Menu.Root>
      <Menu.Trigger
        className="flex items-center gap-2.5 rounded-full p-0.5 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none data-popup-open:bg-muted xl:pe-3"
      >
        <Avatar />
        <span className="hidden text-start xl:block">
          <span className="block text-sm leading-tight font-semibold">{fullName}</span>
          <span className="block text-[0.7rem] leading-tight text-muted-foreground">{live ? live.profile.accountRef : t("menu.demoAccount")}</span>
        </span>
        <span className="sr-only">{t("menu.label")}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <Menu.Popup className={cn(popupClass, "w-[17.5rem] p-1.5")}>
            <div className="flex items-center gap-3 px-2.5 py-2">
              <Avatar />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{viewer?.demo ? fullName : (viewer?.name ?? fullName)}</p>
                <p className="truncate text-xs text-muted-foreground">{viewer?.demo ? `Signed in as ${viewer.email}` : (viewer?.email ?? profile.email)}</p>
              </div>
            </div>
            <Menu.Separator className="my-1.5 h-px bg-border" />
            <Menu.Item className={menuItem} onClick={() => go("profile")}>
              <CircleUserRound aria-hidden /> {t("nav.profile")}
            </Menu.Item>
            <Menu.Item className={menuItem} onClick={() => go("settings")}>
              <Settings aria-hidden /> {t("nav.settings")}
            </Menu.Item>
            <Menu.LinkItem className={menuItem} render={<Link href="/dashboard/security" />}>
              <ShieldCheck aria-hidden /> Sign-in &amp; security
            </Menu.LinkItem>
            <Menu.LinkItem className={menuItem} render={<Link href="/ai-tools" />}>
              <Sparkles aria-hidden /> <span className="flex-1">AI Tools</span>
              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[0.6rem] font-bold text-secondary-foreground">New</span>
            </Menu.LinkItem>
            <Menu.Item className={menuItem} onClick={() => setRegionOpen(true)}>
              <Languages aria-hidden />
              <span className="flex-1">{t("menu.region")}</span>
              <span className="font-mono text-[0.7rem] text-muted-foreground uppercase">
                {offersLanguages() ? `${display.language} · ` : ""}
                {display.currency}
              </span>
            </Menu.Item>
            <Menu.Item
              className={menuItem}
              closeOnClick={false}
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            >
              <Moon className="dark:hidden" aria-hidden />
              <Sun className="hidden dark:block" aria-hidden />
              <span className="dark:hidden">{t("menu.darkMode")}</span>
              <span className="hidden dark:inline">{t("menu.lightMode")}</span>
            </Menu.Item>
            {live ? null : (
              <Menu.Item className={menuItem} disabled={!changes} onClick={resetDemoData}>
                <RotateCcw aria-hidden />
                <span className="flex-1">{t("menu.reset")}</span>
                {changes ? <span className="text-xs text-muted-foreground tabular-nums">{changes}</span> : null}
              </Menu.Item>
            )}
            <Menu.Separator className="my-1.5 h-px bg-border" />
            <Menu.LinkItem className={menuItem} render={<Link href="/" />}>
              <ArrowLeft aria-hidden /> {t("nav.backToWebsite")}
            </Menu.LinkItem>
            <Menu.Item className={menuItem} onClick={() => void signOutAction()}>
              <LogOut aria-hidden /> {t("menu.signOut")}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
    <RegionDialog open={regionOpen} onOpenChange={setRegionOpen} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Top bar                                                                   */
/* -------------------------------------------------------------------------- */

export function TopBar({ mobileLogo, onOpenSearch }: { mobileLogo: React.ReactNode; onOpenSearch: () => void }) {
  const go = useDestinations();
  // Live mode: the real wallet balance (USD, from the ledger). Adding funds isn't open yet, so the pill opens the wallet history.
  const live = useLiveAccount();
  const balance = live ? usd(live.wallet.availableCents / 100) : money(DEMO_WALLET.balance);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const input = document.getElementById("global-search");
        if (input && input.offsetParent) input.focus();
        else onOpenSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenSearch]);

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-xl supports-backdrop-filter:bg-background/70">
      <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        <div className="lg:hidden">{mobileLogo}</div>

        <ServiceSearch id="global-search" className="hidden max-w-md flex-1 md:block" />

        <div className="ms-auto flex items-center gap-1 sm:gap-1.5">
          <button type="button" className={cn(iconButton, "md:hidden")} aria-label={t("search.label")} onClick={onOpenSearch}>
            <Search className="size-[1.1rem]" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => go(live ? "transactions" : "add-funds")}
            className="group me-1 flex h-9 items-center gap-2 rounded-full border bg-card pe-1 ps-3 text-sm shadow-xs transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
            aria-label={live ? `Wallet balance ${balance}. View wallet history` : t("topbar.balance", { amount: balance })}
          >
            <Wallet className="size-4 text-primary" aria-hidden />
            <span className={cn("font-heading font-bold tabular-nums", live && "pe-2")}>{balance}</span>
            {live ? null : (
              <>
                <span className="hidden rounded-full bg-muted px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider text-muted-foreground uppercase sm:inline">
                  {t("common.demo")}
                </span>
                <span className="grid size-7 place-items-center rounded-full bg-lime text-graphite transition-transform group-hover:scale-105">
                  <Plus className="size-3.5" strokeWidth={2.75} aria-hidden />
                </span>
              </>
            )}
          </button>

          {live ? <LiveNotifications /> : <Notifications />}
          <ThemeToggle className="hidden text-muted-foreground sm:inline-flex" />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
