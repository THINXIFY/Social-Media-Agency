import type { Metadata } from "next";
import { Composer } from "@/components/social/composer";
import { PublishingPage } from "@/components/social/loader";

export const metadata: Metadata = { title: "New post" };

export default function NewPostPage() {
  return <PublishingPage render={(data) => <Composer data={data} post={null} />} />;
}
