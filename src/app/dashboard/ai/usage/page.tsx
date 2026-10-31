import type { Metadata } from "next";
import { AiPage } from "@/components/ai-workspace/loader";
import { getDb } from "@/server/db/client";
import { UsageView } from "@/components/ai-workspace/usage";
import { usageData } from "@/server/ai/workspace";

export const metadata: Metadata = { title: "AI usage & allowances" };

export default function AiUsagePage() {
  return <AiPage load={async (viewer, env) => <UsageView data={await usageData(getDb(), viewer, env)} />} />;
}
