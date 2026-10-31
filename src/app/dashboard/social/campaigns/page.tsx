import type { Metadata } from "next";
import { CampaignStudio } from "@/components/social/campaigns";
import { PublishingPage } from "@/components/social/loader";

export const metadata: Metadata = { title: "Campaign Studio" };

export default function CampaignsPage() {
  return <PublishingPage render={(data) => <CampaignStudio data={data} />} />;
}
