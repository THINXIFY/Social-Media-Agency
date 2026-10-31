import { DemoGate } from "@/components/dashboard/demo-gate";
import type { Metadata } from "next";
import { AddFunds } from "@/components/dashboard/add-funds";

export const metadata: Metadata = { title: "Add Funds" };

function Content() {
  return <AddFunds />;
}

export default function AddFundsPage() {
  return (
    <DemoGate area="Add funds" live={<Content />}>
      <Content />
    </DemoGate>
  );
}
