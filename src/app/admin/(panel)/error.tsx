"use client";

import { ErrorState } from "@/components/site/error-state";

/** Admin pages keep the panel shell around the error; nothing about the failure is shown beyond its reference. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="This section didn't load"
      body="Something went wrong on the server. No changes were made. Try again, or share the reference below with an engineer."
      digest={error.digest}
      reset={reset}
      home={{ href: "/admin", label: "Back to overview" }}
    />
  );
}
