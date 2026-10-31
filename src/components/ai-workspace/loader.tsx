import "server-only";
import { connection } from "next/server";
import { Suspense } from "react";
import { ServiceUnavailable } from "@/components/auth/states";
import { customerPage } from "@/server/auth/pages";
import { type AiViewer } from "@/server/ai/workspace";
import { type Env, getEnv } from "@/server/env";

/**
 * Loads an AI workspace page for the signed-in customer, per request. The
 * viewer's ids stay on the server; only the page's own view data is rendered.
 */
async function Load({ load }: { load: (viewer: AiViewer, env: Env) => Promise<React.ReactNode> }) {
  await connection();
  const r = await customerPage();
  if (r.status !== "ok") return <ServiceUnavailable />;
  return <>{await load({ customerId: r.viewer.customerId, userId: r.viewer.userId, name: r.viewer.name }, getEnv())}</>;
}

function Fallback() {
  const block = "animate-pulse rounded-3xl bg-muted motion-reduce:animate-none";
  return (
    <div className="mx-auto max-w-[90rem] px-3 py-4 sm:px-6 sm:py-7 lg:px-8" aria-busy="true">
      <span className="sr-only">Loading Sociotix AI…</span>
      <div className={`h-28 max-w-xl ${block}`} />
      <div className={`mt-5 h-11 w-80 max-w-full ${block}`} />
      <div className={`mt-8 h-56 ${block}`} />
      <div className={`mt-6 h-72 ${block}`} />
    </div>
  );
}

export function AiPage({ load }: { load: (viewer: AiViewer, env: Env) => Promise<React.ReactNode> }) {
  return (
    <Suspense fallback={<Fallback />}>
      <Load load={load} />
    </Suspense>
  );
}
