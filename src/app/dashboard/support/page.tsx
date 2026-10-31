import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoGate } from "@/components/dashboard/demo-gate";
import { SupportCenter } from "@/components/dashboard/support";
import { LiveSupport } from "@/components/dashboard/live-support";

export const metadata: Metadata = { title: "Support Center" };

function Fallback() {
  const block = "animate-pulse rounded-3xl bg-muted motion-reduce:animate-none";
  return (
    <div className="mx-auto max-w-[90rem] px-3 py-4 sm:px-6 sm:py-7 lg:px-8" aria-busy="true">
      <span className="sr-only">Loading support…</span>
      <div className={`h-20 max-w-md ${block}`} />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-20 ${block}`} />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className={`h-[28rem] ${block}`} />
        <div className={`hidden h-64 xl:block ${block}`} />
      </div>
    </div>
  );
}

export default function SupportPage() {
  // Filters, open tickets and "new ticket" links live in the URL, which needs a Suspense boundary.
  // Live accounts (DEMO_MODE off) get real tickets (5G-A); demo mode keeps the illustrative support center.
  return (
    <DemoGate
      area="Support"
      live={
        <Suspense fallback={<Fallback />}>
          <LiveSupport />
        </Suspense>
      }
    >
      <Suspense fallback={<Fallback />}>
        <SupportCenter />
      </Suspense>
    </DemoGate>
  );
}
