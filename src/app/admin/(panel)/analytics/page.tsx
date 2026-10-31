import { SectionGate } from "@/components/admin/section-gate";
import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminAnalytics } from "@/components/admin/analytics";

export const metadata: Metadata = { title: "Analytics & Reports" };

function Loading() {
  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8" aria-busy="true" aria-label="Loading analytics">
      <div className="h-4 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-3 h-8 w-64 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-7 h-24 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
      <div className="mt-5 h-96 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
    </div>
  );
}

function Content() {
  // Range and filters live in the URL, which needs a Suspense boundary.
  return (
    <Suspense fallback={<Loading />}>
      <AdminAnalytics />
    </Suspense>
  );
}

/** Live mode: Analytics became Reports (5H-B). */
function ToReports(): never {
  redirect("/admin/reports");
}

export default function Page() {
  // The role check runs on the server; demo records only appear in demo mode.
  return (
    <SectionGate section="analytics" live={<ToReports />}>
      <Content />
    </SectionGate>
  );
}
