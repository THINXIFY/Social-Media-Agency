import { SectionGate } from "@/components/admin/section-gate";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminCustomers } from "@/components/admin/customers";
import { LiveCustomers } from "@/components/admin/live-customers";

export const metadata: Metadata = { title: "Customers" };

function Content({ live = false }: { live?: boolean }) {
  // Filters and the open customer live in the URL, which needs a Suspense boundary.
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[96rem] px-4 py-8" aria-busy="true" />}>
      {live ? <LiveCustomers /> : <AdminCustomers />}
    </Suspense>
  );
}

export default function Page() {
  // The role check runs on the server; demo records only appear in demo mode.
  return (
    <SectionGate section="customers" live={<Content live />}>
      <Content />
    </SectionGate>
  );
}
