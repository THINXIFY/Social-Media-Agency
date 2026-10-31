import type { Metadata } from "next";
import { Suspense } from "react";
import { AiControlCenter } from "@/components/admin/ai-control";
import { AiDiagnosticsView } from "@/components/admin/ai-diagnostics";
import { SectionGate } from "@/components/admin/section-gate";
import { aiDiagnostics } from "@/server/ai/diagnostics";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";

export const metadata: Metadata = { title: "AI Management" };

async function Center() {
  // The existing usage & health view stays as the Overview's detail.
  const diagnostics = <AiDiagnosticsView data={await aiDiagnostics(getDb(), getEnv())} />;
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[96rem] px-4 py-8" aria-busy="true" />}>
      <AiControlCenter diagnostics={diagnostics} />
    </Suspense>
  );
}

export default function Page() {
  // Real records in both modes: there are no demo AI records. The role check runs on the server.
  return (
    <SectionGate section="ai" live={<Center />}>
      <Center />
    </SectionGate>
  );
}
