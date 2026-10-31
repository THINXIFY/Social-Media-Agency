import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";

export const metadata: Metadata = { title: { absolute: "Page not found — Sociotix" }, robots: { index: false, follow: true } };

/** Branded 404 (status stays 404) with links back into the site. */
export default function NotFound() {
  return (
    <>
      <Header page="other" />
      <main id="main" className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
        <p className="text-[0.74rem] font-semibold tracking-[0.14em] text-primary uppercase">404</p>
        <h1 className="mt-3 font-heading text-[2.2rem] leading-tight font-extrabold tracking-tight sm:text-5xl">We couldn&apos;t find that page</h1>
        <p className="mt-4 max-w-xl text-muted-foreground">The link may be out of date, or the page may have moved. These are good places to start:</p>
        <nav aria-label="Helpful links" className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Sociotix homepage
          </Link>
          <Link href="/ai-tools" className="inline-flex h-11 items-center rounded-full border bg-card px-5 text-sm font-semibold hover:bg-muted">
            Sociotix AI tools
          </Link>
          <Link href="/#services" className="inline-flex h-11 items-center rounded-full border bg-card px-5 text-sm font-semibold hover:bg-muted">
            Browse services
          </Link>
        </nav>
      </main>
      <Footer page="other" />
    </>
  );
}
