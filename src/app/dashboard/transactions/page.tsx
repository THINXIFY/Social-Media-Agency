import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoGate } from "@/components/dashboard/demo-gate";
import { LiveTransactions } from "@/components/dashboard/live-views";
import { Transactions } from "@/components/dashboard/transactions";

export const metadata: Metadata = { title: "Transactions" };

function Fallback() {
  const block = "animate-pulse rounded-3xl bg-muted motion-reduce:animate-none";
  return (
    <div className="mx-auto max-w-[90rem] px-3 py-4 sm:px-6 sm:py-7 lg:px-8" aria-busy="true">
      <span className="sr-only">Loading transactions…</span>
      <div className={`h-20 max-w-md ${block}`} />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-24 ${block}`} />
        ))}
      </div>
      <div className={`mt-5 h-[32rem] ${block}`} />
    </div>
  );
}

export default function TransactionsPage() {
  // Filters and the open transaction live in the URL (?type=, ?tx=), which needs a Suspense boundary.
  return (
    <DemoGate area="Transactions" live={<LiveTransactions />}>
      <Suspense fallback={<Fallback />}>
        <Transactions />
      </Suspense>
    </DemoGate>
  );
}
