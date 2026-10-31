import { SectionGate } from "@/components/admin/section-gate";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminProviders } from "@/components/admin/providers";
import { LiveAdminProviders } from "@/components/admin/live-providers";

export const metadata: Metadata = { title: "Fulfillment Providers" };

function Loading() {
  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8" aria-busy="true" aria-label="Loading providers">
      <div className="h-4 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-3 h-8 w-64 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-7 h-28 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
      <div className="mt-6 h-96 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
    </div>
  );
}

function Content({ live = false }: { live?: boolean }) {
  // Filters and the open provider live in the URL, which needs a Suspense boundary.
  return <Suspense fallback={<Loading />}>{live ? <LiveAdminProviders /> : <AdminProviders />}</Suspense>;
}

export default function Page() {
  // The role check runs on the server; demo records only appear in demo mode.
  return (
    <SectionGate section="providers" live={<Content live />}>
      <Content />
    </SectionGate>
  );
}
