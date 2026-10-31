import { SectionGate } from "@/components/admin/section-gate";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminSettings } from "@/components/admin/settings";
import { LiveAdminSettings } from "@/components/admin/live-settings";

export const metadata: Metadata = { title: "Settings" };

function Loading() {
  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8" aria-busy="true" aria-label="Loading settings">
      <div className="h-4 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-3 h-8 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[14.5rem_minmax(0,1fr)]">
        <div className="hidden h-64 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none lg:block" />
        <div className="h-96 max-w-3xl animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
      </div>
    </div>
  );
}

function Content() {
  // The selected category lives in the URL, which needs a Suspense boundary.
  return (
    <Suspense fallback={<Loading />}>
      <AdminSettings />
    </Suspense>
  );
}

export default function Page() {
  // The role check runs on the server; demo records only appear in demo mode.
  return (
    <SectionGate section="settings" live={<LiveAdminSettings />}>
      <Content />
    </SectionGate>
  );
}
