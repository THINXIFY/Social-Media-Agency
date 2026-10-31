import type { Metadata } from "next";
import { Suspense } from "react";
import { ServiceUnavailable } from "@/components/auth/states";
import { ViewerProvider } from "@/components/auth/viewer";
import { LiveDashboard } from "@/components/dashboard/live-provider";
import { DashboardShell } from "@/components/dashboard/shell";
import { customerPage } from "@/server/auth/pages";
import { accountSnapshot } from "@/server/customers/customers";
import { getDb } from "@/server/db/client";

export const metadata: Metadata = {
  title: { default: "Overview · SociVanta Dashboard", template: "%s · SociVanta Dashboard" },
  description: "Your SociVanta workspace: balance, orders and services in one place.",
  robots: { index: false, follow: false },
};

/** Every dashboard page needs a signed-in customer with a verified email, checked on the server per request. */
async function Gate({ children }: { children: React.ReactNode }) {
  const r = await customerPage();
  if (r.status !== "ok") return <ServiceUnavailable />;
  const v = r.viewer;
  const shell = <DashboardShell>{children}</DashboardShell>;
  return (
    <ViewerProvider viewer={{ kind: "customer", name: v.name, email: v.email, demo: v.demo }}>
      {/* Live mode: the customer's own records, loaded per request. A failure shows the error page — never sample data. */}
      {v.demo ? shell : <LiveDashboard initial={await accountSnapshot(getDb(), v.customerId)}>{shell}</LiveDashboard>}
    </ViewerProvider>
  );
}

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" aria-busy="true" aria-label="Checking your sign-in" />}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
