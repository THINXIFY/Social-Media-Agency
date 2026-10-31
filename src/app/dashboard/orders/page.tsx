import { DemoGate } from "@/components/dashboard/demo-gate";
import type { Metadata } from "next";
import { Suspense } from "react";
import { LiveOrders } from "@/components/dashboard/live-orders";
import { MyOrders } from "@/components/dashboard/orders";

export const metadata: Metadata = { title: "My Orders" };

function Fallback() {
  const block = "animate-pulse rounded-3xl bg-muted motion-reduce:animate-none";
  return (
    <div className="mx-auto max-w-[90rem] px-3 py-4 sm:px-6 sm:py-7 lg:px-8" aria-busy="true">
      <span className="sr-only">Loading your orders…</span>
      <div className={`h-20 max-w-md ${block}`} />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-20 ${block}`} />
        ))}
      </div>
      <div className={`mt-5 h-[32rem] ${block}`} />
    </div>
  );
}

function Content() {
  // Filters and the open order live in the URL (?status=, ?platform=, ?order=), which needs a Suspense boundary.
  return (
    <Suspense fallback={<Fallback />}>
      <MyOrders />
    </Suspense>
  );
}

export default function OrdersPage() {
  return (
    <DemoGate
      area="Orders"
      live={
        <Suspense fallback={<Fallback />}>
          <LiveOrders />
        </Suspense>
      }
    >
      <Content />
    </DemoGate>
  );
}
