import { DemoGate } from "@/components/dashboard/demo-gate";
import type { Metadata } from "next";
import { Suspense } from "react";
import { NewOrder, NewOrderSkeleton } from "@/components/dashboard/new-order";

export const metadata: Metadata = { title: "New Order" };

function Content() {
  // The flow reads ?service= / ?platform= / ?reorder= for preselection, which needs a Suspense boundary.
  return (
    <Suspense fallback={<NewOrderSkeleton />}>
      <NewOrder />
    </Suspense>
  );
}

export default function NewOrderPage() {
  return (
    <DemoGate area="Ordering" live={<Content />}>
      <Content />
    </DemoGate>
  );
}
