import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, LifeBuoy } from "lucide-react";
import { articleTitle, CATEGORY_ICON, ContactStrip } from "@/components/help/help-center";
import { HelpSearch } from "@/components/help/search";
import { JsonLd } from "@/components/seo/json-ld";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { HELP_ARTICLE_BY_SLUG, HELP_ARTICLES, HELP_CATEGORIES, helpHref } from "@/lib/help/articles";
import { breadcrumbs, graph, webPage } from "@/lib/seo/schema";
import { SITE } from "@/lib/seo/site";

type Props = { params: Promise<{ slug: string }> };

export const generateStaticParams = () => HELP_ARTICLES.map((a) => ({ slug: a.slug }));


export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = HELP_ARTICLE_BY_SLUG[(await params).slug];
  if (!a) return {};
  const path = helpHref(a.slug);
  return {
    title: { absolute: articleTitle(a.title) },
    description: a.description,
    alternates: { canonical: path },
    openGraph: { type: "article", url: path, siteName: SITE.name, title: a.title, description: a.description },
    twitter: { card: "summary_large_image", title: a.title, description: a.description },
  };
}

/** Articles are fully prerendered, so the page blocks rather than streams; an unknown slug is then always a real 404. */
export const instant = false;

const formatUpdated = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

export default async function HelpArticlePage({ params }: Props) {
  const a = HELP_ARTICLE_BY_SLUG[(await params).slug];
  if (!a) notFound();
  const cat = HELP_CATEGORIES.find((c) => c.id === a.category)!;
  const Icon = CATEGORY_ICON[a.category];
  const siblings = HELP_ARTICLES.filter((x) => x.category === a.category);
  const related = a.related.map((s) => HELP_ARTICLE_BY_SLUG[s]).filter(Boolean);
  const path = helpHref(a.slug);
  return (
    <>
      <Header page="other" />
      <main id="main">
        <div className="border-b bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between">
            <nav aria-label="Breadcrumb" className="min-w-0 text-sm">
              <ol className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                <li>
                  <Link href="/help" className="inline-flex items-center gap-1 font-semibold hover:text-foreground">
                    <LifeBuoy className="size-3.5" aria-hidden /> Help Center
                  </Link>
                </li>
                <li aria-hidden>/</li>
                <li>
                  <Link href={`/help#${cat.id}`} className="hover:text-foreground">
                    {cat.name}
                  </Link>
                </li>
              </ol>
            </nav>
            <div className="w-full md:max-w-sm">
              <HelpSearch compact />
            </div>
          </div>
        </div>

        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <article className="min-w-0 max-w-[44rem]">
            <p className="inline-flex items-center gap-1.5 text-[0.78rem] font-semibold text-primary dark:text-[#c4b5ff]">
              <Icon className="size-3.5" aria-hidden /> {cat.name}
            </p>
            <h1 className="mt-2 font-heading text-[1.9rem] leading-[1.12] font-extrabold tracking-tight text-balance sm:text-[2.4rem]">{a.title}</h1>
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden /> Last updated <time dateTime={a.updated}>{formatUpdated(a.updated)}</time>
            </p>

            <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/[0.04] p-5 dark:bg-primary/10">
              <p className="text-[0.72rem] font-bold tracking-[0.12em] text-primary uppercase dark:text-[#c4b5ff]">Short answer</p>
              <p className="mt-1.5 text-[1.05rem] leading-relaxed text-pretty">{a.answer}</p>
            </div>

            {a.steps?.length ? (
              <section aria-labelledby="steps-heading" className="mt-8">
                <h2 id="steps-heading" className="font-heading text-[1.2rem] font-bold">
                  Step by step
                </h2>
                <ol className="mt-4 space-y-3">
                  {a.steps.map((s, i) => (
                    <li key={s} className="flex gap-3">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-graphite text-[0.8rem] font-bold text-lime dark:bg-white/10" aria-hidden>
                        {i + 1}
                      </span>
                      <span className="pt-0.5 text-[1rem] leading-relaxed">{s}</span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {a.body?.length ? (
              <section aria-label="More detail" className="mt-8 space-y-4 text-[1rem] leading-relaxed text-pretty text-foreground/90">
                {a.body.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </section>
            ) : null}

            {related.length ? (
              <section aria-labelledby="related-heading" className="mt-10 border-t pt-8">
                <h2 id="related-heading" className="font-heading text-[1.1rem] font-bold">
                  Related articles
                </h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {related.map((r) => (
                    <li key={r.slug}>
                      <Link href={helpHref(r.slug)} className="group flex h-full items-start justify-between gap-3 rounded-xl border bg-card p-3.5 text-sm transition-colors hover:border-primary/35 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
                        <span className="font-semibold leading-snug">{r.title}</span>
                        <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <Link href="/help" className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" aria-hidden /> All help topics
            </Link>
          </article>

          <aside aria-label={`More in ${cat.name}`} className="lg:pt-10">
            <div className="rounded-2xl border bg-card p-4 lg:sticky lg:top-24">
              <p className="text-sm font-bold">More in {cat.name}</p>
              <ul className="mt-2 space-y-0.5">
                {siblings.map((s) => (
                  <li key={s.slug}>
                    <Link href={helpHref(s.slug)} aria-current={s.slug === a.slug ? "page" : undefined} className="-mx-2 flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted aria-[current=page]:bg-primary/[0.07] aria-[current=page]:font-semibold aria-[current=page]:text-primary dark:aria-[current=page]:text-[#c4b5ff]">
                      <BookOpen className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/dashboard/support?new=1" className="mt-4 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none">
                Contact support
              </Link>
            </div>
          </aside>
        </div>
        <ContactStrip heading="Didn't find what you need?" />
      </main>
      <Footer page="other" />
      <JsonLd
        data={graph(
          webPage({ path, name: a.title, description: a.description }),
          breadcrumbs([
            { name: SITE.name, path: "/" },
            { name: "Help Center", path: "/help" },
            { name: a.title, path },
          ]),
        )}
      />
    </>
  );
}
