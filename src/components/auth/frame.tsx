import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Logo, PlatformTile } from "@/components/brand";
import { ThemeToggle } from "@/components/site/header";
import { CATALOG_TOTALS, PLATFORMS } from "@/lib/catalog";
import { cn } from "@/lib/utils";

/**
 * Frames for sign-in screens.
 *  - customer: a welcoming two-column composition (brand story + elevated form card) on desktop,
 *    a single focused column on tablet and phone.
 *  - staff: a centred, enterprise panel on a graphite field — distinct, but the same typography,
 *    fields and violet accents.
 */
export function AuthFrame({ variant = "customer", children }: { variant?: "customer" | "staff"; children: React.ReactNode }) {
  return variant === "staff" ? <StaffFrame>{children}</StaffFrame> : <CustomerFrame>{children}</CustomerFrame>;
}

const enter = "animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 ease-out motion-reduce:animate-none";

/* -------------------------------------------------------------------------- */
/*  Customer                                                                  */
/* -------------------------------------------------------------------------- */

function CustomerFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip bg-background">
      {/* Backdrop: a quiet dotted field and one soft violet light, both faded at the edges. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 [background-image:radial-gradient(var(--color-foreground)_1px,transparent_1px)] [background-size:22px_22px] opacity-[0.06] [mask-image:radial-gradient(ellipse_70%_60%_at_60%_40%,black,transparent)] dark:opacity-[0.09]" />
        <div className="absolute top-[-18rem] left-1/2 h-[36rem] w-[60rem] -translate-x-1/3 rounded-full bg-primary/[0.09] blur-[120px] dark:bg-primary/[0.16]" />
      </div>

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="rounded-lg focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none" aria-label="SociVanta home">
          <Logo />
        </Link>
        <ThemeToggle className="text-muted-foreground" />
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 content-center items-center gap-12 px-5 pt-4 pb-10 sm:px-8 sm:pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-20 lg:pt-0 lg:pb-16">
        <BrandStory />
        <CompactBrand />
        <section
          className={cn(
            "mx-auto w-full max-w-[30rem] sm:rounded-[1.75rem] sm:border sm:bg-card sm:p-9 sm:shadow-[0_1px_2px_rgb(15_16_20/0.04),0_24px_60px_-28px_rgb(32_33_39/0.28)] dark:sm:shadow-[0_24px_60px_-28px_rgb(0_0_0/0.7)]",
            enter,
          )}
        >
          {children}
        </section>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-5 pb-6 text-center text-xs text-muted-foreground sm:px-8 lg:text-start">
        SociVanta ·{" "}
        <Link href="/" className="underline-offset-4 hover:text-foreground hover:underline">
          Back to website
        </Link>
      </footer>
    </div>
  );
}

function BrandStory() {
  const shown = PLATFORMS.slice(0, 8);
  const more = PLATFORMS.length - shown.length;
  return (
    <div className="hidden lg:block">
      <p className="inline-flex h-8 items-center gap-2 rounded-full border bg-card/70 px-3 text-xs font-semibold text-muted-foreground backdrop-blur">
        <span className="size-1.5 rounded-full bg-lime ring-2 ring-lime/30" aria-hidden />
        {CATALOG_TOTALS.services} services · {CATALOG_TOTALS.platforms} platforms
      </p>
      <h2 className="mt-6 max-w-[34rem] font-heading text-[3.25rem] leading-[1.04] font-extrabold tracking-[-0.03em] text-balance">
        Every platform. <span className="text-primary">One calm workspace.</span>
      </h2>
      <p className="mt-5 max-w-[30rem] text-[1.05rem] leading-relaxed text-muted-foreground">
        Discover services across every major network, follow each order as it progresses and manage your account from a single dashboard.
      </p>

      <div className="mt-10 max-w-[30rem] rounded-2xl border bg-card/70 p-5 backdrop-blur">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Supported platforms</p>
          {more > 0 ? <p className="text-xs text-muted-foreground">and {more} more</p> : null}
        </div>
        <ul className="mt-4 grid grid-cols-8 gap-2.5" aria-label="Supported platforms">
          {shown.map((p) => (
            <li key={p.id} title={p.name}>
              <PlatformTile platform={p} size="md" className="size-full max-w-11 aspect-square" />
              <span className="sr-only">{p.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Tablet and phone: a quiet identity strip instead of the full brand story. */
function CompactBrand() {
  return (
    <div className="mx-auto -mb-6 flex w-full max-w-[30rem] items-center gap-3 sm:-mb-4 lg:hidden">
      <ul className="flex -space-x-1.5" aria-hidden>
        {PLATFORMS.slice(0, 5).map((p) => (
          <li key={p.id}>
            <PlatformTile platform={p} size="sm" className="ring-2 ring-background" />
          </li>
        ))}
      </ul>
      <p className="text-[0.8rem] text-muted-foreground">
        {CATALOG_TOTALS.services} services across {CATALOG_TOTALS.platforms} platforms
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Staff                                                                     */
/* -------------------------------------------------------------------------- */

function StaffFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip bg-[#121317] text-white">
      {/* Backdrop: a fine control grid, concentric rings behind the panel and a single violet light. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 [background-image:linear-gradient(rgb(255_255_255/0.045)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.045)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_60%_55%_at_50%_45%,black,transparent)]" />
        <div className="absolute top-1/2 left-1/2 size-[44rem] -translate-1/2 rounded-full border border-white/[0.05]" />
        <div className="absolute top-1/2 left-1/2 size-[64rem] -translate-1/2 rounded-full border border-white/[0.035]" />
        <div className="absolute top-[-14rem] left-1/2 h-[28rem] w-[44rem] -translate-x-1/2 rounded-full bg-primary/25 blur-[120px]" />
      </div>

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg focus-visible:ring-3 focus-visible:ring-primary/40 focus-visible:outline-none [&_span]:text-white">
          <Logo />{" "}
          <span className="rounded-md border border-white/15 px-1.5 py-0.5 text-[0.65rem] font-bold tracking-[0.14em] text-white/70 uppercase">Admin</span>
          <span className="sr-only">, home page</span>
        </Link>
        <ThemeToggle className="text-white/60 hover:text-white" />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-6 sm:px-8 sm:py-10">
        <section className={cn("w-full max-w-[28rem] rounded-[1.5rem] border border-white/10 bg-card p-6 text-foreground shadow-[0_40px_120px_-40px_rgb(0_0_0/0.85)] sm:p-9", enter)}>
          <div className="mb-7 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20" aria-hidden>
              <ShieldCheck className="size-5" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">SociVanta Admin</p>
              <p className="text-xs text-muted-foreground">Staff access</p>
            </div>
          </div>
          {children}
        </section>
      </main>

      <footer className="px-5 pb-6 text-center text-xs text-white/45">Restricted to authorized SociVanta staff. Every sign-in requires two-step verification.</footer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared                                                                    */
/* -------------------------------------------------------------------------- */

export function AuthHeading({ title, description, eyebrow }: { title: string; description?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-8">
      {eyebrow ? <p className="mb-2.5 text-xs font-bold tracking-[0.12em] text-primary uppercase">{eyebrow}</p> : null}
      <h1 className="font-heading text-[1.75rem] leading-[1.15] font-extrabold tracking-[-0.02em] sm:text-[2rem]">{title}</h1>
      {description ? <p className="mt-2.5 text-[0.95rem] leading-relaxed text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      <div className="h-9 w-52 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      <div className="h-4 w-64 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-8 h-12 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      <div className="h-12 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      <div className="h-12 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
    </div>
  );
}
