import { DemoGate } from "@/components/dashboard/demo-gate";
import type { Metadata } from "next";
import { Settings } from "@/components/dashboard/settings";

export const metadata: Metadata = { title: "Settings" };

function Content() {
  return <Settings />;
}

export default function SettingsPage() {
  return (
    <DemoGate area="Settings" live={<Content />}>
      <Content />
    </DemoGate>
  );
}
