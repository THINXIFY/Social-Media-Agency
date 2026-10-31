import type { Metadata } from "next";
import { PublishingLibrary } from "@/components/social/library";
import { PublishingPage } from "@/components/social/loader";

export const metadata: Metadata = { title: "Publishing" };

export default function PublishingLibraryPage() {
  return <PublishingPage render={(data) => <PublishingLibrary data={data} />} />;
}
