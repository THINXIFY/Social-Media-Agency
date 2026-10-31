import { Suspense } from "react";
import { AdminShell } from "@/components/admin/shell";
import { ServiceUnavailable } from "@/components/auth/states";
import { ViewerProvider } from "@/components/auth/viewer";
import { staffPage } from "@/server/auth/pages";

/** Every admin page needs a staff session with a completed second factor, checked on the server per request. */
async function Gate({ children }: { children: React.ReactNode }) {
  const r = await staffPage();
  if (r.status !== "ok") return <ServiceUnavailable />;
  const v = r.viewer;
  return (
    <ViewerProvider viewer={{ kind: "staff", name: v.name, email: v.email, initials: v.initials, roleName: v.roleName, sections: v.sections, demo: v.demo }}>
      <AdminShell>{children}</AdminShell>
    </ViewerProvider>
  );
}

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" aria-busy="true" aria-label="Checking your access" />}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
