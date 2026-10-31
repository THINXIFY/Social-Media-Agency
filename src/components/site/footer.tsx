"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Share2, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand";
import { useCatalogFilters, usePreview } from "@/components/providers";
import { ThemeToggle } from "@/components/site/header";
import { cn } from "@/lib/utils";

/*
 * Global footer. Every link goes to a real route or on-page section; pages
 * that don't exist yet are labelled "Soon" (or open the existing "published
 * before launch" notice for legal pages) instead of pretending. No contact
 * placeholders and no social profiles until real ones are configured.
 */

type FooterLink = { label: string; href?: string; onClick?: () => void; soon?: boolean; note?: string };

// Underline reveal on hover/focus; colour transition only under reduced motion.
const linkClass =
  "rounded-sm bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-0.5 text-left text-[0.88rem] text-muted-foreground transition-[color,background-size] duration-300 ease-out hover:bg-[length:100%_1px] hover:text-primary focus-visible:bg-[length:100%_1px] focus-visible:text-primary dark:hover:text-[#c9bcff] dark:focus-visible:text-[#c9bcff] focus-visible:outline-none motion-reduce:transition-none";

function FooterLinkItem({ link }: { link: FooterLink }) {
  if (link.soon) {
    return (
      <span className="inline-flex items-center gap-2 text-[0.88rem] text-muted-foreground">
        {link.label}
        <span className="rounded-full px-1.5 py-px text-[0.58rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase ring-1 ring-border ring-inset">Soon</span>
      </span>
    );
  }
  const body = (
    <>
      {link.label}
      {link.note ? <span className="sr-only"> ({link.note})</span> : null}
    </>
  );
  if (link.onClick) {
    return (
      <button type="button" onClick={link.onClick} className={linkClass}>
        {body}
      </button>
    );
  }
  return link.href!.startsWith("/") && !link.href!.includes("#") ? (
    <Link href={link.href!} className={linkClass}>
      {body}
    </Link>
  ) : (
    <a href={link.href} className={linkClass}>
      {body}
    </a>
  );
}

export function Footer({ page = "home" }: { page?: "home" | "ai" | "other" }) {
  const { explore: exploreHere } = useCatalogFilters();
  const preview = usePreview();
  // Off the homepage the catalog isn't on the page, so its links go back to it.
  const away = page !== "home";
  const anchor = (hash: string) => (away ? `/${hash}` : hash);
  const router = useRouter();
  const explore = (filters?: Parameters<typeof exploreHere>[0]) => (away ? router.push("/#services") : exploreHere(filters));
  const notYet = (title: string) => () => preview({ title, description: `The ${title} page will be published before launch.` });

  const columns: { title: string; links: FooterLink[] }[] = [
    {
      title: "Marketplace",
      links: [
        { label: "All Services", onClick: () => explore() },
        { label: "Instagram", onClick: () => explore({ platform: "instagram" }) },
        { label: "Facebook", onClick: () => explore({ platform: "facebook" }) },
        { label: "YouTube", onClick: () => explore({ platform: "youtube" }) },
        { label: "TikTok", onClick: () => explore({ platform: "tiktok" }) },
        { label: "How It Works", href: anchor("#how-it-works") },
      ],
    },
    {
      title: "AI & Social",
      links: [
        { label: "AI Tools", href: "/ai-tools" },
        { label: "AI Content Studio", href: "/ai-tools#family-content" },
        { label: "AI Growth Tools", href: "/ai-tools#growth" },
        { label: "Social Management", href: "/social-management" },
        { label: "AI Plans & Pricing", href: "/pricing" },
        { label: "Social Workspace", href: "/dashboard/social", note: "sign-in required" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "More Solutions", href: anchor("#more-solutions") },
        { label: "About", soon: true },
      ],
    },
    {
      title: "Support",
      links: [
        { label: "Order Tracking", href: anchor("#order-tracking") },
        { label: "My Orders", href: "/dashboard/orders", note: "sign-in required" },
        { label: "FAQs", href: anchor("#faq") },
        { label: "Help Center", href: "/help" },
        { label: "Contact Support", href: "/dashboard/support?new=1", note: "sign-in required" },
      ],
    },
  ];

  const legal = ["Terms of Service", "Privacy Policy", "Refund Policy"];

  return (
    <footer className="relative isolate overflow-hidden border-t bg-card dark:bg-[#0f1014]">
      {/* Hairline accent along the top edge. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(112_71_235/0.5)_30%,rgb(200_255_82/0.55)_62%,transparent)]" aria-hidden />
      <div className="pointer-events-none absolute -top-48 -left-40 -z-10 size-[26rem] rounded-full bg-[radial-gradient(closest-side,rgb(112_71_235/0.06),transparent)] dark:bg-[radial-gradient(closest-side,rgb(112_71_235/0.14),transparent)]" aria-hidden />

      <div className="mx-auto w-full max-w-7xl px-4 pt-12 sm:px-6 sm:pt-16 lg:px-8">
        <div className="grid grid-cols-1 gap-11 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.75fr)] lg:gap-14 xl:gap-20">
          {/* Brand */}
          <div className="max-w-[24rem] sm:max-w-none">
            <Link href="/" aria-label="SociVanta home" className="inline-block rounded-md focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
              <Logo />
            </Link>
            <p className="mt-5 max-w-[24rem] font-heading text-[1.2rem] leading-[1.3] font-extrabold tracking-[-0.02em] text-balance text-foreground">
              Smarter social growth. <span className="text-primary dark:text-[#b9a6ff]">Simpler digital marketing.</span>
            </p>
            <p className="mt-2.5 max-w-[24rem] text-[0.88rem] leading-[1.65] text-muted-foreground">Discover social media services, AI-powered tools and a more organized way to manage your online presence.</p>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Link
                href="/ai-tools"
                className="group inline-flex h-10 items-center gap-1.5 rounded-full bg-graphite ps-3 pe-3.5 text-[0.82rem] font-semibold text-white shadow-[0_8px_20px_-12px_rgb(32_33_39/0.7)] transition-[background-color,box-shadow] duration-200 hover:bg-graphite/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none dark:bg-white dark:text-graphite dark:shadow-none dark:hover:bg-white/90"
              >
                <Sparkles className="size-3.5 text-lime dark:text-primary" aria-hidden />
                Explore SociVanta AI
                <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
              </Link>
              <Link
                href="/social-management"
                className="group inline-flex h-10 items-center gap-1.5 rounded-full border bg-background/60 ps-3 pe-3.5 text-[0.82rem] font-semibold text-foreground transition-[border-color,color,background-color] duration-200 hover:border-primary/35 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none dark:bg-white/[0.03] dark:hover:text-[#c9bcff]"
              >
                <Share2 className="size-3.5 text-primary dark:text-[#b9a6ff]" aria-hidden />
                Social Management
                <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
              </Link>
            </div>
          </div>

          {/* Navigation */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-4 lg:pt-1.5">
            {columns.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <p className="text-[0.7rem] font-bold tracking-[0.13em] text-foreground/90 uppercase">{col.title}</p>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <FooterLinkItem link={l} />
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        {/* Brand signature: compact, tinted, fully above the divider. */}
        <div className="mt-12 flex items-end justify-center sm:mt-14" aria-hidden>
          <p className="bg-[linear-gradient(180deg,rgb(112_71_235/0.16),rgb(32_33_39/0.04))] bg-clip-text pb-[0.06em] font-heading text-[clamp(3.25rem,13vw,8.5rem)] leading-[0.9] font-extrabold tracking-[-0.055em] text-transparent select-none dark:bg-[linear-gradient(180deg,rgb(185_166_255/0.2),rgb(255_255_255/0.03))]">
            SociVanta
          </p>
        </div>

        {/* Bottom bar */}
        <div className="border-t py-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-[0.8rem] text-muted-foreground">© 2026 SociVanta. All rights reserved.</p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
                {legal.map((l) => (
                  <button key={l} type="button" onClick={notYet(l)} className={cn(linkClass, "text-[0.8rem]")}>
                    {l}
                  </button>
                ))}
              </nav>
              <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
              <span className="-ms-1.5 flex items-center gap-0.5 text-[0.8rem] text-muted-foreground sm:ms-0">
                <ThemeToggle className="size-9" />
                <span className="sm:sr-only lg:not-sr-only">Theme</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
