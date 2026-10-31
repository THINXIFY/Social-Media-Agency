import type { Metadata } from "next";
import { AutomationBuilder } from "@/components/social/builder";
import { AutomationPage } from "@/components/social/loader";
import { TEMPLATES } from "@/lib/social/automations";

export const metadata: Metadata = { title: "Create automation" };

export default async function NewAutomationPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const { template } = await searchParams;
  const t = TEMPLATES.find((x) => x.id === template) ?? null;
  return <AutomationPage render={() => <AutomationBuilder key={t?.id ?? "blank"} existing={null} template={t} />} />;
}
