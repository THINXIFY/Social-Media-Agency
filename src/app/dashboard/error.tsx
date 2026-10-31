"use client";

import { ErrorState } from "@/components/site/error-state";

/** Shared by every dashboard page, so the copy is about "this page", not one section. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="We couldn't load this page"
      body="Something went wrong on our side. Your orders and balance aren't affected. Try again in a moment."
      digest={error.digest}
      reset={reset}
      home={{ href: "/dashboard", label: "Back to overview" }}
    />
  );
}
