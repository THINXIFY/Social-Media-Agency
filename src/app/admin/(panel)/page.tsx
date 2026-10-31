import { SectionGate } from "@/components/admin/section-gate";
import { Suspense } from "react";
import { AdminOverview } from "@/components/admin/overview";
import { LiveAdminOverview } from "@/components/admin/live-overview";

function Content({ live = false }: { live?: boolean }) {
  // Demo: the open order lives in ?order=. Live: the date range lives in ?range=. Both need a Suspense boundary.
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[96rem] animate-pulse px-4 py-8 motion-reduce:animate-none" aria-busy="true" />}>
      {live ? <LiveAdminOverview /> : <AdminOverview />}
    </Suspense>
  );
}

export default function Page() {
  // The role check runs on the server; demo records only appear in demo mode.
  return (
    <SectionGate section="overview" live={<Content live />}>
      <Content />
    </SectionGate>
  );
}
