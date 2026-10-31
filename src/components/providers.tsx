"use client";

import * as React from "react";
import Link from "next/link";
import { ThemeProvider } from "next-themes";
import { MotionConfig } from "motion/react";
import { ArrowRight, Clock3 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ServiceCategory, ServiceStatus } from "@/lib/catalog";

/* -------------------------------------------------------------------------- */
/*  Preview dialog — stands in for pages that don't exist yet                 */
/* -------------------------------------------------------------------------- */

export interface PreviewInfo {
  title: string;
  description?: string;
  /** Optional next step that leads to a page that already exists. */
  action?: { label: string; href: string };
}

const PreviewContext = React.createContext<(info: PreviewInfo) => void>(() => {});

export const usePreview = () => React.useContext(PreviewContext);

function PreviewProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = React.useState<PreviewInfo | null>(null);
  const [open, setOpen] = React.useState(false);

  const show = React.useCallback((next: PreviewInfo) => {
    setInfo(next);
    setOpen(true);
  }, []);

  return (
    <PreviewContext.Provider value={show}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-5 p-6 sm:max-w-md">
          <DialogHeader className="gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-secondary text-secondary-foreground">
              <Clock3 className="size-5" aria-hidden />
            </span>
            <DialogTitle className="text-lg font-semibold">{info?.title}</DialogTitle>
            <DialogDescription className="leading-relaxed">
              {info?.description ??
                "This part of Sociotix is in preview. It will be available once the homepage is approved and the next phase is built."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="-mx-6 -mb-6 rounded-b-xl px-6">
            {info?.action ? (
              <>
                <Button variant="ghost" className="h-9 rounded-full px-4" onClick={() => setOpen(false)}>
                  Close
                </Button>
                <Link
                  href={info.action.href}
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {info.action.label}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </>
            ) : (
              <Button className="h-9 rounded-full px-4" onClick={() => setOpen(false)}>
                Got it
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PreviewContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/*  Marketplace filters — shared so other sections can deep-link into them    */
/* -------------------------------------------------------------------------- */

export type CategoryFilter = ServiceCategory | "all";
export type StatusFilter = ServiceStatus | "all";

interface CatalogFilters {
  platform: string;
  category: CategoryFilter;
  status: StatusFilter;
  query: string;
}

interface CatalogFilterContextValue extends CatalogFilters {
  update: (patch: Partial<CatalogFilters>) => void;
  reset: () => void;
  /** Apply filters, then scroll the marketplace into view. */
  explore: (patch?: Partial<CatalogFilters>) => void;
}

const DEFAULT_FILTERS: CatalogFilters = {
  platform: "all",
  category: "all",
  status: "all",
  query: "",
};

const CatalogFilterContext = React.createContext<CatalogFilterContextValue | null>(null);

export function useCatalogFilters() {
  const ctx = React.useContext(CatalogFilterContext);
  if (!ctx) throw new Error("useCatalogFilters must be used inside <Providers>");
  return ctx;
}

function CatalogFilterProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = React.useState<CatalogFilters>(DEFAULT_FILTERS);

  const value = React.useMemo<CatalogFilterContextValue>(
    () => ({
      ...filters,
      update: (patch) => setFilters((f) => ({ ...f, ...patch })),
      reset: () => setFilters(DEFAULT_FILTERS),
      explore: (patch) => {
        setFilters({ ...DEFAULT_FILTERS, ...patch });
        requestAnimationFrame(() =>
          document.getElementById("services")?.scrollIntoView({ block: "start" }),
        );
      },
    }),
    [filters],
  );

  return <CatalogFilterContext.Provider value={value}>{children}</CatalogFilterContext.Provider>;
}

/* -------------------------------------------------------------------------- */

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <MotionConfig reducedMotion="user">
        <PreviewProvider>
          <CatalogFilterProvider>{children}</CatalogFilterProvider>
        </PreviewProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
