import { SectionGate } from "@/components/admin/section-gate";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminSupport } from "@/components/admin/support";
import { LiveAdminSupport } from "@/components/admin/live-support";

export const metadata: Metadata = { title: "Support Center" };

function Loading() {
  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8" aria-busy="true" aria-label="Loading support">
      <div className="h-4 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-3 h-8 w-56 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-7 h-24 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
      <div className="mt-6 h-[32rem] animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
    </div>
  );
}

function Content({ live = false }: { live?: boolean }) {
  // Filters and the open ticket live in the URL, which needs a Suspense boundary.
  return <Suspense fallback={<Loading />}>{live ? <LiveAdminSupport /> : <AdminSupport />}</Suspense>;
}

export default function Page() {
  // The role check runs on the server; demo records only appear in demo mode.
  return (
    <SectionGate section="support" live={<Content live />}>
      <Content />
    </SectionGate>
  );
}
