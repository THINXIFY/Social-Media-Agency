"use client";

import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";

/**
 * The one "something went wrong" panel for error boundaries (5I-B). It never
 * shows the error message or stack: only safe copy and the opaque digest that
 * matches the server log line, so support can find it.
 */
export function ErrorState({ title, body, digest, reset, home }: { title: string; body: string; digest?: string; reset: () => void; home: { href: string; label: string } }) {
  return (
    <div role="alert" className="mx-auto grid min-h-[60dvh] max-w-md place-items-center px-4 py-16 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-soon-soft text-soon">
          <TriangleAlert className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 font-heading text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          <button type="button" onClick={reset} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <RotateCcw className="size-4" aria-hidden /> Try again
          </button>
          <Link href={home.href} className="inline-flex h-10 items-center rounded-full border px-5 text-sm font-semibold hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            {home.label}
          </Link>
        </div>
        {digest && <p className="mt-6 text-xs text-muted-foreground">Reference: <code className="font-mono">{digest}</code></p>}
      </div>
    </div>
  );
}
