import { DemoGate } from "@/components/dashboard/demo-gate";
import type { Metadata } from "next";
import { Suspense } from "react";
import { LiveCatalog } from "@/components/dashboard/live-views";
import { ServiceFinder } from "@/components/dashboard/service-finder";

export const metadata: Metadata = { title: "Find the Right Service" };

function Fallback() {
  const block = "animate-pulse rounded-3xl bg-muted motion-reduce:animate-none";
  return (
    <div className="mx-auto max-w-[90rem] px-3 pt-4 sm:px-6 sm:pt-7 lg:px-8" aria-busy="true">
      <span className="sr-only">Loading Service Finder…</span>
      <div className={`h-24 max-w-2xl ${block}`} />
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className={`h-[28rem] ${block}`} />
        <div className={`hidden h-80 xl:block ${block}`} />
      </div>
    </div>
  );
}

function Content() {
  // Answers live in the URL so returning from New Order restores them, which needs a Suspense boundary.
  return (
    <Suspense fallback={<Fallback />}>
      <ServiceFinder />
    </Suspense>
  );
}

export default function ServiceFinderPage() {
  return (
    <DemoGate area="Service finder" live={<LiveCatalog />}>
      <Content />
    </DemoGate>
  );
}
