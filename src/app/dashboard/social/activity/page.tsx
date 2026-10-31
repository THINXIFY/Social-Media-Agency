import type { Metadata } from "next";
import { SocialActivity } from "@/components/social/activity";
import { SocialPage } from "@/components/social/loader";

export const metadata: Metadata = { title: "Social activity" };

export default function SocialActivityPage() {
  return <SocialPage render={(data) => <SocialActivity data={data} />} />;
}
