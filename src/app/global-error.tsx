"use client";

import { ErrorState } from "@/components/site/error-state";
import "./globals.css";

/** Last resort when the root layout itself fails: it replaces the whole document, so it brings its own <html>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background text-foreground">
        <main id="main">
          <ErrorState title="Something went wrong" body="SociVanta hit a problem loading this page. Try again in a moment." digest={error.digest} reset={reset} home={{ href: "/", label: "SociVanta homepage" }} />
        </main>
      </body>
    </html>
  );
}
