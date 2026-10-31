import { DemoGate } from "@/components/dashboard/demo-gate";
import type { Metadata } from "next";
import { MyProfile } from "@/components/dashboard/profile";

export const metadata: Metadata = { title: "My Profile" };

function Content() {
  return <MyProfile />;
}

export default function ProfilePage() {
  return (
    <DemoGate area="Your profile" live={<Content />}>
      <Content />
    </DemoGate>
  );
}
