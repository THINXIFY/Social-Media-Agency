"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  ArrowUpDown,
  Check,
  ChevronDown,
  LayoutGrid,
  Search,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformIcon, PlatformTile } from "@/components/brand";
import { useCatalogFilters, usePreview, type CategoryFilter } from "@/components/providers";
import { CATEGORY_ICONS, Section, SectionHeading, StatusBadge } from "@/components/site/primitives";
import { cn } from "@/lib/utils";
import {
  CATALOG_TOTALS,
  CATEGORY_META,
  CATEGORY_ORDER,
  PLATFORMS,
  PLATFORM_BY_ID,
  SERVICES,
  STATUS_META,
  matchesQuery,
  servicesFor,
  type Service,
} from "@/lib/catalog";

const PAGE_SIZE = 12;

const SORTS = {
  recommended: "Recommended",
  category: "Service type",
  platform: "Platform",
  az: "Name A–Z",
  za: "Name Z–A",
} as const;
type SortKey = keyof typeof SORTS;

const TRY_SEARCHES = ["Instagram Followers", "TikTok Views", "YouTube Subscribers", "Facebook Likes", "Website Traffic"];

const PLATFORM_ORDER = Object.fromEntries(PLATFORMS.map((p, i) => [p.id, i]));
const CATEGORY_RANK = Object.fromEntries(CATEGORY_ORDER.map((c, i) => [c, i]));

function sortServices(list: Service[], sort: SortKey) {
  const byName = (a: Service, b: Service) => a.name.localeCompare(b.name);
  const byStatus = (a: Service, b: Service) => STATUS_META[a.status].rank - STATUS_META[b.status].rank;
  const byPlatform = (a: Service, b: Service) => PLATFORM_ORDER[a.platformId] - PLATFORM_ORDER[b.platformId];
  const byCategory = (a: Service, b: Service) => CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
  const copy = [...list];
  switch (sort) {
    case "az":
      return copy.sort(byName);
    case "za":
      return copy.sort((a, b) => byName(b, a));
    case "category":
      return copy.sort((a, b) => byCategory(a, b) || byPlatform(a, b));
    case "platform":
      return copy.sort((a, b) => byPlatform(a, b) || byCategory(a, b));
    default:
      return copy.sort(
        (a, b) => byStatus(a, b) || Number(b.featured) - Number(a.featured) || byPlatform(a, b) || byCategory(a, b),
      );
  }
}

const QUICK_PICKS = SERVICES.filter((s) => s.featured);

/* -------------------------------------------------------------------------- */

export function Marketplace() {
  const { platform, category, status, query, update, reset } = useCatalogFilters();
  const [sort, setSort] = React.useState<SortKey>("recommended");
  const preview = usePreview();

  // Everything except category — used for category counts.
  const baseFiltered = React.useMemo(
    () =>
      SERVICES.filter(
        (s) =>
          (platform === "all" || s.platformId === platform) &&
          (status === "all" || s.status === status) &&
          matchesQuery(s, query),
      ),
    [platform, status, query],
  );

  const results = React.useMemo(
    () => sortServices(baseFiltered.filter((s) => category === "all" || s.category === category), sort),
    [baseFiltered, category, sort],
  );

  const categoryCounts = React.useMemo(() => {
    const counts = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<string, number>;
    baseFiltered.forEach((s) => counts[s.category]++);
    return counts;
  }, [baseFiltered]);

  // Paging resets whenever the filter set changes.
  const filterKey = `${platform}|${category}|${status}|${query}|${sort}`;
  const [paging, setPaging] = React.useState({ key: filterKey, limit: PAGE_SIZE });
  const limit = paging.key === filterKey ? paging.limit : PAGE_SIZE;
  const visible = results.slice(0, limit);

  const isPristine = platform === "all" && category === "all" && status === "all" && !query;
  const activePlatform = platform === "all" ? null : PLATFORM_BY_ID[platform];

  // Service pages and order forms arrive with the customer ordering flow;
  // until then "View service" opens a summary preview.
  const openService = (s: Service) => {
    const p = PLATFORM_BY_ID[s.platformId];
    preview({
      title: s.name,
      description: `${p.name} · ${CATEGORY_META[s.category].label}. ${s.description} You can set up the order details now; ordering opens once pricing for this service is verified.`,
      action: { label: "Configure order", href: `/dashboard/new-order?service=${s.id}` },
    });
  };

  const activeFilters = [
    query ? { key: "query", label: `“${query}”`, clear: () => update({ query: "" }) } : null,
    activePlatform ? { key: "platform", label: activePlatform.name, clear: () => update({ platform: "all" }) } : null,
    category !== "all"
      ? { key: "category", label: CATEGORY_META[category].label, clear: () => update({ category: "all" }) }
      : null,
    status !== "all" ? { key: "status", label: STATUS_META[status].label, clear: () => update({ status: "all" }) } : null,
  ].filter((f) => f !== null);

  return (
    <Section id="services" className="border-t">
      <SectionHeading
        eyebrow="Services marketplace"
        title={
          <>
            Find the right service <span className="text-primary">in seconds.</span>
          </>
        }
        description="Followers, likes, views, ads, SEO and more — search by platform or by what you need, then open any service to see exactly what you'll provide."
        action={<CatalogLegend />}
      />

      {/* Toolbar */}
      <div className="rounded-3xl border bg-card p-3 shadow-soft sm:p-4">
        <div className="flex gap-2 sm:gap-3">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="service-search" className="sr-only">
              Search services
            </label>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-primary" aria-hidden />
            <input
              id="service-search"
              type="search"
              value={query}
              onChange={(e) => update({ query: e.target.value })}
              placeholder={`Search ${SERVICES.length} services…`}
              className="h-14 w-full rounded-2xl border-2 border-transparent bg-muted/70 pr-11 pl-12 text-base font-medium outline-none transition-all placeholder:font-normal placeholder:text-muted-foreground/80 hover:bg-muted focus:border-primary/50 focus:bg-background focus:ring-4 focus:ring-primary/10 [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => update({ query: "" })}
                className="absolute top-1/2 right-3 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>

          <div className="relative shrink-0">
            <label htmlFor="service-sort" className="sr-only">
              Sort services
            </label>
            <ArrowUpDown className="pointer-events-none absolute top-1/2 left-5 size-4 sm:left-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <select
              id="service-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-14 w-14 appearance-none rounded-2xl border bg-background text-sm font-medium text-transparent outline-none focus:border-primary/60 focus:ring-3 focus:ring-primary/15 sm:w-48 sm:pr-10 sm:pl-10 sm:text-foreground [&>option]:text-foreground"
            >
              {Object.entries(SORTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 hidden size-4 -translate-y-1/2 text-muted-foreground sm:block" aria-hidden />
          </div>
        </div>

        {/* Platform filter */}
        <div className="relative mt-3">
          <div role="radiogroup" aria-label="Filter by platform" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
            <FilterChip active={platform === "all"} onClick={() => update({ platform: "all" })}>
              <LayoutGrid className="size-4" aria-hidden />
              All Platforms
              <Count>{SERVICES.length}</Count>
            </FilterChip>
            {PLATFORMS.map((p) => (
              <FilterChip key={p.id} active={platform === p.id} onClick={() => update({ platform: p.id })}>
                <PlatformIcon icon={p.icon} className="size-4" />
                {p.short}
                <Count>{servicesFor(p.id).length}</Count>
              </FilterChip>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent" aria-hidden />
        </div>

        {/* Category filter */}
        <div className="relative mt-2 border-t pt-2">
          <div role="radiogroup" aria-label="Filter by service type" className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-1">
            <TypeChip active={category === "all"} onClick={() => update({ category: "all" })}>
              <Sparkles className="size-3.5" aria-hidden />
              All types
            </TypeChip>
            {CATEGORY_ORDER.map((c) => {
              const Icon = CATEGORY_ICONS[c];
              return (
                <TypeChip
                  key={c}
                  active={category === c}
                  disabled={categoryCounts[c] === 0 && category !== c}
                  onClick={() => update({ category: c as CategoryFilter })}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {CATEGORY_META[c].short}
                  <span className="tabular-nums">{categoryCounts[c]}</span>
                </TypeChip>
              );
            })}
          </div>
          <div className="pointer-events-none absolute right-0 bottom-0 h-10 w-10 bg-gradient-to-l from-card to-transparent" aria-hidden />
        </div>
      </div>

      {/* Quick picks */}
      <AnimatePresence initial={false}>
        {isPristine ? (
          <motion.div
            key="quick-picks"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-8">
              <div className="mb-3 flex items-center gap-2">
                <Star className="size-4 fill-lime text-graphite dark:text-lime" aria-hidden />
                <h3 className="text-sm font-bold">Quick picks</h3>
                <span className="text-xs text-muted-foreground">Jump straight to a common request</span>
              </div>
              <ul className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-3">
                {QUICK_PICKS.map((s) => {
                  const p = PLATFORM_BY_ID[s.platformId];
                  return (
                    <li key={s.id} className="w-[72%] shrink-0 snap-start sm:w-auto">
                      <button
                        type="button"
                        onClick={() => openService(s)}
                        className="group flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft"
                      >
                        <PlatformTile platform={p} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 block text-sm leading-snug font-semibold">{s.name}</span>
                          <span className="block text-xs text-muted-foreground">{CATEGORY_META[s.category].label}</span>
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Results */}
      <div className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {results.length ? (
              <>
                Showing <span className="font-semibold text-foreground">{visible.length}</span> of{" "}
                <span className="font-semibold text-foreground">{results.length}</span>{" "}
                {results.length === 1 ? "service" : "services"}
              </>
            ) : (
              "No matching services"
            )}
          </p>
          {CATALOG_TOTALS.active ? (
            <button
              type="button"
              role="switch"
              aria-checked={status === "active"}
              onClick={() => update({ status: status === "active" ? "all" : "active" })}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                status === "active" ? "border-ok/40 bg-ok-soft text-ok" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Check className="size-3.5" aria-hidden /> Ready to order only
            </button>
          ) : null}
        </div>

        {activeFilters.length ? (
          <div className="-mt-1 mb-4 flex flex-wrap items-center gap-1.5">
            {activeFilters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={f.clear}
                className="inline-flex items-center gap-1.5 rounded-full bg-secondary py-1 pr-2 pl-3 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                aria-label={`Remove filter ${f.label}`}
              >
                {f.label}
                <X className="size-3.5" aria-hidden />
              </button>
            ))}
            {activeFilters.length > 1 ? (
              <button
                type="button"
                onClick={reset}
                className="px-2 py-1 text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Clear all
              </button>
            ) : null}
          </div>
        ) : null}

        {results.length ? (
          <>
            <motion.ul layout className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              <AnimatePresence mode="popLayout" initial={false}>
                {visible.map((s) => (
                  <motion.li
                    key={s.id}
                    layout
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ServiceCard service={s} onOpen={() => openService(s)} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>

            {results.length > visible.length ? (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  className="h-11 w-full rounded-full bg-card px-6 sm:w-auto"
                  onClick={() => setPaging({ key: filterKey, limit: limit + PAGE_SIZE })}
                >
                  Load more
                  <span className="text-muted-foreground tabular-nums">
                    ({Math.min(PAGE_SIZE, results.length - visible.length)} of {results.length - visible.length})
                  </span>
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */

function Count({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-black/5 px-1.5 text-[0.7rem] font-semibold tabular-nums dark:bg-white/10">
      {children}
    </span>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-all",
        active
          ? "border-graphite bg-graphite text-white dark:border-white dark:bg-white dark:text-graphite"
          : "bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function TypeChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "bg-secondary text-secondary-foreground ring-1 ring-primary/30"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CatalogLegend() {
  const items = [
    { label: "Platforms", value: CATALOG_TOTALS.platforms },
    { label: "Services", value: CATALOG_TOTALS.services },
    { label: "Service types", value: CATALOG_TOTALS.categories },
  ];
  return (
    <dl className="hidden w-full shrink-0 grid-cols-3 gap-2 sm:grid md:w-auto">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 rounded-2xl border bg-card px-3.5 py-2.5 md:min-w-28">
          <dt className="truncate text-xs font-semibold text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 font-heading text-xl font-bold tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatPrice(service: Service) {
  return service.price ? `${service.price.currency} ${service.price.amount} ${service.price.unit}` : null;
}

function ServiceCard({ service, onOpen }: { service: Service; onOpen: () => void }) {
  const p = PLATFORM_BY_ID[service.platformId];
  const Icon = CATEGORY_ICONS[service.category];
  const tint = p.color === "#0F1014" ? "#7047EB" : p.color;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative isolate flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card p-3.5 text-left transition-all duration-300 hover:border-transparent hover:shadow-float focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:rounded-3xl sm:p-5 sm:hover:-translate-y-1"
    >
      {/* Brand tint on hover */}
      <span
        className="pointer-events-none absolute -top-16 -right-16 -z-10 size-40 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-20"
        style={{ backgroundColor: tint }}
        aria-hidden
      />

      <div className="flex items-center gap-3 sm:items-start">
        <PlatformTile platform={p} size="md" className="transition-transform duration-300 group-hover:scale-105" />

        {/* Mobile: name + meta inline with the icon */}
        <div className="min-w-0 flex-1 sm:hidden">
          <p className="flex items-center gap-1.5 font-heading text-[0.95rem] leading-snug font-bold">
            <span className="line-clamp-2">{service.name}</span>
            {service.featured ? (
              <Star className="size-3.5 shrink-0 fill-lime text-graphite dark:text-lime" aria-label="Quick pick" />
            ) : null}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {p.short} · {CATEGORY_META[service.category].label}
            </span>
          </p>
        </div>
        <ArrowRight
          className="size-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary sm:hidden"
          aria-hidden
        />

        {/* Tablet/desktop: badges on the right */}
        <div className="ml-auto hidden items-center gap-1.5 sm:flex">
          {service.featured ? (
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-lime px-2 text-[0.68rem] font-bold text-graphite">
              <Star className="size-3 fill-current" aria-hidden /> Quick pick
            </span>
          ) : null}
          {service.status === "active" ? <StatusBadge status="active" /> : null}
        </div>
      </div>

      <div className="hidden sm:mt-4 sm:block">
        <p className="font-heading text-base leading-snug font-bold">{service.name}</p>
        <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">
          <Icon className="size-3.5" aria-hidden />
          {p.short} · {CATEGORY_META[service.category].label}
        </p>
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{service.description}</p>
      </div>

      <div className="mt-auto hidden items-center justify-between gap-2 pt-5 sm:flex">
        <span className="text-xs text-muted-foreground">{formatPrice(service) ?? "Pricing on activation"}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          View service
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </button>
  );
}

function EmptyState() {
  const { explore, reset } = useCatalogFilters();
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-muted">
        <Search className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <p className="mt-4 font-heading text-lg font-bold">No services match those filters</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Try a platform name plus what you need, or start from one of these.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {TRY_SEARCHES.slice(0, 4).map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => explore({ query: q })}
            className="rounded-full border bg-card px-3 py-1.5 text-sm font-medium hover:border-primary/40"
          >
            {q}
          </button>
        ))}
      </div>
      <Button variant="ghost" className="mt-3 rounded-full text-primary" onClick={reset}>
        Clear all filters
      </Button>
    </div>
  );
}
