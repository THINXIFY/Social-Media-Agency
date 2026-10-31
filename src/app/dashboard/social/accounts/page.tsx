import type { Metadata } from "next";
import { SocialAccounts } from "@/components/social/accounts";
import { SocialPage } from "@/components/social/loader";

export const metadata: Metadata = { title: "Social accounts" };

export default function SocialAccountsPage() {
  return <SocialPage render={(data) => <SocialAccounts data={data} />} />;
}
