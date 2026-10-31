import { SectionGate } from "@/components/admin/section-gate";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ServicesManager } from "@/components/admin/services";

export const metadata: Metadata = { title: "Services & Pricing" };

function Content({ live = false }: { live?: boolean }) {
  // Filters live in the URL, which needs a Suspense boundary.
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[96rem] px-4 py-8" aria-busy="true" />}>
      <ServicesManager live={live} />
    </Suspense>
  );
}

export default function Page() {
  // The role check runs on the server; demo records only appear in demo mode.
  return (
    <SectionGate section="services" live={<Content live />}>
      <Content />
    </SectionGate>
  );
}
