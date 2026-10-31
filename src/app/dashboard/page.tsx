import { DemoGate } from "@/components/dashboard/demo-gate";
import { LiveOverview } from "@/components/dashboard/live-views";
import { Overview } from "@/components/dashboard/overview";

function Content() {
  return <Overview />;
}

export default function DashboardPage() {
  return (
    <DemoGate area="Your dashboard" live={<LiveOverview />}>
      <Content />
    </DemoGate>
  );
}
