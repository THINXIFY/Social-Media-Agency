import type { Metadata } from "next";
import { SocialPage } from "@/components/social/loader";
import { SocialOverview } from "@/components/social/overview";

export const metadata: Metadata = { title: "Social workspace" };

export default function SocialOverviewPage() {
  return <SocialPage render={(data) => <SocialOverview data={data} />} />;
}
