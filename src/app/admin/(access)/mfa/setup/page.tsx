import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthHeading, FormSkeleton } from "@/components/auth/frame";
import { MfaEnrollForm } from "@/components/auth/staff-forms";
import { getStaffSession } from "@/server/auth";
import { beginMfaEnrollment } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";

export const metadata: Metadata = { title: "Set up two-step verification" };

async function Content() {
  const ctx = await getStaffSession().catch(() => null);
  if (!ctx) redirect("/admin/login");
  // Already complete (e.g. the re-render right after enrolling): keep the same component so the
  // one-time recovery codes stay on screen; a later visit just shows a link onward.
  if (ctx.mfaComplete)
    return (
      <>
        <AuthHeading eyebrow="Required for staff" title="Two-step verification is on" />
        <MfaEnrollForm qr="" secret="" completed />
      </>
    );
  if (ctx.hasAuthenticator) redirect("/admin/mfa");
  const { qr, secret } = await beginMfaEnrollment(getDb(), ctx.session);
  return (
    <>
      <AuthHeading eyebrow="Required for staff" title="Set up two-step verification" description="Staff accounts need an authenticator app in addition to a password." />
      <MfaEnrollForm qr={qr} secret={secret} />
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Content />
    </Suspense>
  );
}
