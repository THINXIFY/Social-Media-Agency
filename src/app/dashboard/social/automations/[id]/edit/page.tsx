import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutomationBuilder } from "@/components/social/builder";
import { AutomationPage } from "@/components/social/loader";

export const metadata: Metadata = { title: "Edit automation" };

export default async function EditAutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AutomationPage
      render={(data) => {
        const a = data.automations.find((x) => x.id === id);
        if (!a) notFound();
        return <AutomationBuilder key={a.id + a.updatedAt} existing={a} template={null} />;
      }}
    />
  );
}
