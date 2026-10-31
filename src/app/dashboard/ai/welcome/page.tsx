import type { Metadata } from "next";
import { AiPage } from "@/components/ai-workspace/loader";
import { getDb } from "@/server/db/client";
import { Onboarding } from "@/components/ai-workspace/onboarding";
import { AI_TOOLS, WORKSPACE_TOOLS } from "@/lib/ai/registry";
import { effectiveAvailability } from "@/server/ai/run";
import { aiProfile } from "@/server/ai/workspace";

export const metadata: Metadata = { title: "Personalize Sociotix AI" };

export default function AiWelcomePage() {
  return (
    <AiPage
      load={async (viewer, env) => {
        const tools = Object.fromEntries([...AI_TOOLS, ...WORKSPACE_TOOLS].map((t) => [t.id, effectiveAvailability(t, { env })]));
        return <Onboarding profile={await aiProfile(getDb(), viewer.customerId)} tools={tools} />;
      }}
    />
  );
}
