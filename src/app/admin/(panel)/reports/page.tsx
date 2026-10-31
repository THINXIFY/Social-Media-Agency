import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminAnalytics } from "@/components/admin/analytics";
import { LiveReports } from "@/components/admin/live-reports";
import { SectionGate } from "@/components/admin/section-gate";
import { REPORTS } from "@/lib/reports";
import { allows } from "@/server/auth/permissions";
import { staffPage } from "@/server/auth/pages";

export const metadata: Metadata = { title: "Reports" };

function Loading() {
  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8" aria-busy="true" aria-label="Loading reports">
      <div className="h-4 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-3 h-8 w-56 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="hidden h-72 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none lg:block" />
        <div className="h-96 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
      </div>
    </div>
  );
}

/** Live reports: the list of reports this role may open is decided on the server (and re-checked by every API call). */
async function Live() {
  const r = await staffPage();
  const access = r.status === "ok" ? r.viewer.access : null;
  const allowed = access ? REPORTS.filter((x) => allows(access, `${x.module}:view` as never)).map((x) => x.id) : [];
  return <LiveReports allowed={allowed} />;
}

export default function Page() {
  // Report, range and filters live in the URL, which needs a Suspense boundary. Demo mode keeps the illustrative analytics.
  return (
    <SectionGate
      section="reports"
      live={
        <Suspense fallback={<Loading />}>
          <Live />
        </Suspense>
      }
    >
      <Suspense fallback={<Loading />}>
        <AdminAnalytics />
      </Suspense>
    </SectionGate>
  );
}
