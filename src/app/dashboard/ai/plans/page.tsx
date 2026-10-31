import type { Metadata } from "next";
import { AiPage } from "@/components/ai-workspace/loader";
import { PlansView } from "@/components/ai-workspace/plans-view";
import { planFor } from "@/server/ai/plans";

export const metadata: Metadata = { title: "AI plans" };

export default function AiPlansPage() {
  return <AiPage load={async (viewer) => <PlansView current={planFor(viewer.customerId).id} />} />;
}
