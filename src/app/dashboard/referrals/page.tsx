import type { Metadata } from "next";
import { DemoGate } from "@/components/dashboard/demo-gate";
import { LiveReferrals } from "@/components/dashboard/live-referrals";
import { ReferralsRewards } from "@/components/dashboard/referrals";

export const metadata: Metadata = { title: "Referrals" };

export default function ReferralsPage() {
  // Live accounts (DEMO_MODE off) get their real code and referrals (5G-B); demo mode keeps the illustrative program.
  return (
    <DemoGate area="Referrals" live={<LiveReferrals />}>
      <ReferralsRewards />
    </DemoGate>
  );
}
