import { SectionGate } from "@/components/admin/section-gate";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminOrders } from "@/components/admin/orders";
import { LiveAdminOrders } from "@/components/admin/live-orders";

export const metadata: Metadata = { title: "Orders" };

function Content({ live = false }: { live?: boolean }) {
  // Filters and the open order live in the URL, which needs a Suspense boundary.
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[96rem] px-4 py-8" aria-busy="true" />}>
      {live ? <LiveAdminOrders /> : <AdminOrders />}
    </Suspense>
  );
}

export default function Page() {
  // The role check runs on the server; demo records only appear in demo mode.
  return (
    <SectionGate section="orders" live={<Content live />}>
      <Content />
    </SectionGate>
  );
}
