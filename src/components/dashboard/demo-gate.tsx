import { connection } from "next/server";
import { Suspense } from "react";
import { NotConnectedYet } from "@/components/auth/states";
import { getEnv } from "@/server/env";

/**
 * The explicit boundary between demo and real data. With DEMO_MODE on (never
 * allowed in production) the illustrative dashboard renders; with it off the
 * page renders its `live` view backed by the customer's own records, or — for
 * areas whose backend isn't switched on yet — an honest "not connected" state.
 * Decided per request, never baked in at build time, and never a fallback:
 * a failure in live mode surfaces as an error, not as sample data.
 */
async function Decide({ area, live, children }: { area: string; live?: React.ReactNode; children: React.ReactNode }) {
  await connection();
  let demo = false;
  try {
    demo = getEnv().DEMO_MODE;
  } catch {
    demo = false;
  }
  if (demo) return <>{children}</>;
  return live ? <>{live}</> : <NotConnectedYet area={area} />;
}

export function DemoGate({ area, live, children }: { area: string; live?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[96rem] animate-pulse px-4 py-8 motion-reduce:animate-none" aria-busy="true" />}>
      <Decide area={area} live={live}>
        {children}
      </Decide>
    </Suspense>
  );
}
