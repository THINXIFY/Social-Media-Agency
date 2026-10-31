"use client";

import { ArrowUp } from "lucide-react";
import { EXAMPLE_EVENT } from "./workspace";

/** Fills the workspace form with an example brief and scrolls to it. Never generates or uses a run. */
export function TryExampleButton({ toolId, title, values }: { toolId: string; title: string; values: Record<string, string | string[]> }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(EXAMPLE_EVENT, { detail: { toolId, title, values } }))}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
    >
      <ArrowUp className="size-3.5" aria-hidden /> Try this example
      <span className="sr-only">: {title} (fills the form above)</span>
    </button>
  );
}
