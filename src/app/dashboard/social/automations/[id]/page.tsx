import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutomationDetail } from "@/components/social/automation-detail";
import { AutomationPage } from "@/components/social/loader";

export const metadata: Metadata = { title: "Automation" };

/** Only the signed-in customer's own automations are loaded; anything else is a 404. */
export default async function AutomationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AutomationPage
      render={(data) => {
        const a = data.automations.find((x) => x.id === id);
        if (!a) notFound();
        return <AutomationDetail data={data} a={a} />;
      }}
    />
  );
}
