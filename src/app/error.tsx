"use client";

import { ErrorState } from "@/components/site/error-state";

/** Public pages: a branded error instead of the framework default (5I-B). */
export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main">
      <ErrorState title="Something went wrong" body="This page hit a problem on our side. Try again in a moment." digest={error.digest} reset={reset} home={{ href: "/", label: "SociVanta homepage" }} />
    </main>
  );
}
