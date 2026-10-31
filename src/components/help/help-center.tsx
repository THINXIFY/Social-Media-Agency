import Link from "next/link";
import { ArrowRight, BookOpen, CircleUserRound, CreditCard, LifeBuoy, type LucideIcon, Package, Rocket, Share2, Sparkles, Wrench } from "lucide-react";
import { HELP_ARTICLE_BY_SLUG, HELP_ARTICLES, HELP_CATEGORIES, type HelpCategoryId, helpHref, POPULAR } from "@/lib/help/articles";
import { HelpSearch } from "./search";

/* The public Help Center hub (5G-A). Server-rendered; search enhances it. */

export const HELP_TITLE = "Help Center — SociVanta Support & Guides";
export const HELP_DESCRIPTION = "Find answers about SociVanta orders, your wallet, account security, AI tools and the social workspace, or open a support ticket with our team.";

/** Short titles get the brand suffix; long ones stand alone so they stay within ~60 characters. */
export const articleTitle = (title: string) => (title.length <= 42 ? `${title} | SociVanta Help` : title);

export const CATEGORY_ICON: Record<HelpCategoryId, LucideIcon> = {
  "getting-started": Rocket,
  account: CircleUserRound,
  orders: Package,
  payments: CreditCard,
  "ai-tools": Sparkles,
  social: Share2,
  troubleshooting: Wrench,
};

export const popularArticles = () => POPULAR.map((s) => HELP_ARTICLE_BY_SLUG[s]).filter(Boolean);

export function HelpCenter() {
  return (
    <>
      <section className="relative border-b">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(48rem_22rem_at_50%_-8%,rgb(112_71_235/0.13),transparent_70%)] dark:bg-[radial-gradient(48rem_22rem_at_50%_-8%,rgb(112_71_235/0.26),transparent_70%)]" />
        </div>
        <div className="relative mx-auto max-w-3xl px-4 pt-14 pb-12 text-center sm:px-6 sm:pt-20 sm:pb-16">
          <p className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-[0.75rem] font-semibold text-muted-foreground">
            <LifeBuoy className="size-3.5 text-primary" aria-hidden /> Help Center
          </p>
          <h1 className="mt-5 font-heading text-[2.2rem] leading-[1.05] font-extrabold tracking-tight text-balance sm:text-[3.2rem]">How can we help you?</h1>
          <p className="mx-auto mt-4 max-w-xl text-[1.02rem] text-pretty text-muted-foreground sm:text-lg">Find answers, explore helpful guides, or contact our support team.</p>
          <div className="mx-auto mt-8 max-w-2xl">
            <HelpSearch />
          </div>
        </div>
      </section>

      <section aria-labelledby="popular-heading" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 id="popular-heading" className="font-heading text-[1.4rem] font-extrabold tracking-tight sm:text-[1.7rem]">
          Popular questions
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Good places to start, chosen by our team.</p>
        <ul className="mt-6 grid gap-3 md:grid-cols-2">
          {popularArticles().map((a) => (
            <li key={a.slug}>
              <Link href={helpHref(a.slug)} className="group flex h-full flex-col rounded-2xl border bg-card p-4 transition-[border-color,box-shadow] duration-200 hover:border-primary/35 hover:shadow-[0_14px_30px_-24px_rgb(112_71_235/0.7)] focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:p-5">
                <span className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold leading-snug">{a.title}</h3>
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none" aria-hidden />
                </span>
                <p className="mt-1.5 text-sm text-pretty text-muted-foreground">{a.answer}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="topics-heading" className="border-y bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <h2 id="topics-heading" className="font-heading text-[1.4rem] font-extrabold tracking-tight sm:text-[1.7rem]">
            Browse by topic
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {HELP_CATEGORIES.map((c) => {
              const Icon = CATEGORY_ICON[c.id];
              const items = HELP_ARTICLES.filter((a) => a.category === c.id);
              return (
                <section key={c.id} id={c.id} aria-labelledby={`cat-${c.id}`} className="scroll-mt-24 rounded-2xl border bg-card p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/[0.08] text-primary dark:bg-primary/20 dark:text-[#c4b5ff]" aria-hidden>
                      <Icon className="size-[1.15rem]" />
                    </span>
                    <div className="min-w-0">
                      <h3 id={`cat-${c.id}`} className="font-heading font-bold">
                        {c.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">{c.description}</p>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-1">
                    {items.map((a) => (
                      <li key={a.slug}>
                        <Link href={helpHref(a.slug)} className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none">
                          <BookOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="min-w-0">{a.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      </section>

      <ContactStrip />
    </>
  );
}

export function ContactStrip({ heading = "Still need help?" }: { heading?: string }) {
  return (
    <section aria-labelledby="contact-heading" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="relative overflow-hidden rounded-[1.75rem] bg-graphite px-6 py-8 text-white sm:px-10 sm:py-10 dark:bg-[#17181d] dark:ring-1 dark:ring-white/10">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-primary/40 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 id="contact-heading" className="font-heading text-[1.4rem] font-extrabold tracking-tight sm:text-[1.6rem]">
              {heading}
            </h2>
            <p className="mt-1.5 text-sm text-white/70">Open a support ticket and our team will reply in your dashboard. Include your order reference if it&apos;s about an order.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/support?new=1" className="inline-flex h-11 items-center gap-2 rounded-full bg-lime px-5 text-sm font-bold text-graphite transition-[filter] hover:brightness-95 focus-visible:ring-3 focus-visible:ring-lime/50 focus-visible:outline-none">
              Create a support ticket <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href="/dashboard/support" className="inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold text-white/80 ring-1 ring-white/20 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-3 focus-visible:ring-white/40 focus-visible:outline-none">
              View my tickets
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
