import type { Metadata } from "next";
import { CommandCenter } from "@/components/ai-workspace/command-center";
import { AiPage } from "@/components/ai-workspace/loader";
import { getDb } from "@/server/db/client";
import { commandCenterData } from "@/server/ai/workspace";

export const metadata: Metadata = { title: "Sociotix AI" };

export default function AiHomePage() {
  return <AiPage load={async (viewer, env) => <CommandCenter data={await commandCenterData(getDb(), viewer, env)} />} />;
}
