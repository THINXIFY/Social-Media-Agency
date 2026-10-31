"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { motion } from "motion/react";
import { Menu, Moon, Sparkles, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/brand";
import { usePreview } from "@/components/providers";
import { cn } from "@/lib/utils";

export const NAV = [
  { label: "Home", href: "#top" },
  { label: "Services", href: "#services" },
  { label: "Platforms", href: "#platforms" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Order Tracking", href: "#order-tracking" },
  { label: "More Solutions", href: "#more-solutions" },
];

function useActiveSection(enabled: boolean) {
  const [active, setActive] = React.useState("#top");
  React.useEffect(() => {
    if (!enabled) return;
    const els = NAV.map((n) => document.querySelector(n.href)).filter(Boolean) as Element[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) setActive(`#${visible[0].target.id}`);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [enabled]);
  return active;
}

function useScrolled() {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return scrolled;
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("size-9 rounded-full", className)}
      aria-label="Toggle dark mode"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Moon className="size-[1.1rem] dark:hidden" aria-hidden />
      <Sun className="hidden size-[1.1rem] dark:block" aria-hidden />
    </Button>
  );
}

/** The SociVanta AI entry point: a distinct link so the SMM navigation stays as it is. */
function AiLink({ current, className, onClick, compactAtLg = false }: { current: boolean; className?: string; onClick?: () => void; compactAtLg?: boolean }) {
  return (
    <Link
      href="/ai-tools"
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors",
        current ? "border-primary/40 bg-secondary text-secondary-foreground" : "border-border bg-card/70 text-foreground hover:border-primary/40 hover:text-primary",
        className,
      )}
    >
      <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden />
      {/* Between 1024 and 1279px the section nav needs the room: icon only, same accessible name. */}
      <span className={cn("whitespace-nowrap", compactAtLg && "lg:sr-only xl:not-sr-only")}>AI Tools</span>
    </Link>
  );
}

export function Header({ page = "home" }: { page?: "home" | "ai" | "other" }) {
  const home = page === "home";
  const active = useActiveSection(home);
  // On other pages, section links lead back to the homepage.
  const nav = NAV.map((n) => ({ ...n, href: home ? n.href : `/${n.href}` }));
  const scrolled = useScrolled();
  const preview = usePreview();
  const [open, setOpen] = React.useState(false);

  const openAuth = (kind: "Log in" | "Sign up") =>
    preview({
      title: `${kind} is coming next`,
      description:
        "Accounts, funds and order placement are part of the next build phase. For now you can explore the full service catalog on this page.",
    });

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background-color,border-color,box-shadow] duration-300",
        scrolled
          ? "border-b border-border/80 bg-background/80 shadow-[0_1px_0_rgb(0_0_0/0.02)] backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <a
        href={home ? "#services" : "#main"}
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm"
      >
        {home ? "Skip to services" : "Skip to content"}
      </a>
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-2 px-4 sm:gap-6 lg:gap-3 xl:gap-6 sm:px-6 lg:px-8">
        <a href={home ? "#top" : "/"} aria-label="SociVanta home" className="rounded-md">
          <Logo />
        </a>

        <nav aria-label="Primary" className="ml-1 hidden lg:block xl:ml-4">
          <ul className="flex items-center gap-1">
            {nav.map((item) => {
              const isActive = home && active === item.href;
              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "relative rounded-full px-2 py-2 text-sm font-medium whitespace-nowrap transition-colors xl:px-3",
                      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {isActive ? (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 -z-10 rounded-full bg-card shadow-soft ring-1 ring-border"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    ) : null}
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <AiLink current={page === "ai"} compactAtLg className="hidden h-9 md:inline-flex lg:px-2.5 xl:px-3" />
          <ThemeToggle />
          <Button
            variant="ghost"
            className="hidden h-9 rounded-full px-4 sm:inline-flex"
            onClick={() => openAuth("Log in")}
          >
            Log In
          </Button>
          <Button className="h-9 rounded-full px-3 sm:px-4" onClick={() => openAuth("Sign up")}>
            Sign Up
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" className="size-9 rounded-full lg:hidden" aria-label="Open menu" />
              }
            >
              <Menu className="size-5" aria-hidden />
            </SheetTrigger>
            <SheetContent side="right" className="w-[86vw] max-w-sm gap-0 p-0">
              <div className="flex h-16 items-center border-b px-5">
                <SheetTitle render={<span />}>
                  <Logo />
                </SheetTitle>
              </div>
              <nav aria-label="Mobile" className="flex flex-col p-3">
                {nav.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "rounded-xl px-4 py-3 text-base font-medium transition-colors hover:bg-muted",
                      home && active === item.href && "bg-secondary text-secondary-foreground",
                    )}
                  >
                    {item.label}
                  </a>
                ))}
                <AiLink current={page === "ai"} onClick={() => setOpen(false)} className="mt-2 h-12 justify-center rounded-xl text-base" />
              </nav>
              <div className="mt-auto grid grid-cols-2 gap-2 border-t p-4">
                <Button
                  variant="outline"
                  className="h-11 rounded-full"
                  onClick={() => {
                    setOpen(false);
                    openAuth("Log in");
                  }}
                >
                  Log In
                </Button>
                <Button
                  className="h-11 rounded-full"
                  onClick={() => {
                    setOpen(false);
                    openAuth("Sign up");
                  }}
                >
                  Sign Up
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
