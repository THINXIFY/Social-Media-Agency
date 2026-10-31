import type { Metadata } from "next";
import { AutomationPage } from "@/components/social/loader";
import { AutomationStudio } from "@/components/social/studio";

export const metadata: Metadata = { title: "Automations" };

export default function AutomationsPage() {
  return <AutomationPage render={(data) => <AutomationStudio data={data} />} />;
}
