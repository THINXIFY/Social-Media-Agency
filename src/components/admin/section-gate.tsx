import { Suspense } from "react";
import { AccessDenied, NotConnectedYet, ServiceUnavailable } from "@/components/auth/states";
import { staffPage } from "@/server/auth/pages";
import { ADMIN_SECTION_BY_ID } from "./nav";

/**
 * Server-side gate for each admin module: re-validates the staff session and
 * checks the role grants at least View on the section's module. In live mode
 * (DEMO_MODE off) the illustrative demo records are never shown: the section
 * renders its `live` view (real records) or an honest "not connected" state.
 */
async function Check({ section, live, children }: { section: string; live?: React.ReactNode; children: React.ReactNode }) {
  const r = await staffPage();
  if (r.status !== "ok") return <ServiceUnavailable />;
  if (!r.viewer.sections.includes(section)) return <AccessDenied />;
  if (!r.viewer.demo) return live ? <>{live}</> : <NotConnectedYet area={ADMIN_SECTION_BY_ID[section]?.label ?? "This area"} />;
  return <>{children}</>;
}

export function SectionGate({ section, live, children }: { section: string; live?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[96rem] animate-pulse px-4 py-8 motion-reduce:animate-none" aria-busy="true" aria-label="Checking access" />}>
      <Check section={section} live={live}>
        {children}
      </Check>
    </Suspense>
  );
}
