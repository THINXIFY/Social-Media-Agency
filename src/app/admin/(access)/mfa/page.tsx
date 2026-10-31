import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthHeading, FormSkeleton } from "@/components/auth/frame";
import { MfaVerifyForm } from "@/components/auth/staff-forms";
import { getStaffSession } from "@/server/auth";
import { safeNext } from "@/server/auth/cookies";

export const metadata: Metadata = { title: "Two-step verification" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getStaffSession().catch(() => null);
  if (!ctx) redirect("/admin/login");
  if (ctx.mfaComplete) redirect(safeNext(sp.next, "/admin"));
  if (!ctx.hasAuthenticator) redirect("/admin/mfa/setup");
  return (
    <>
      <AuthHeading eyebrow="Two-step verification" title="Enter your code" description="Open your authenticator app and enter the 6-digit code for Sociotix." />
      <MfaVerifyForm next={safeNext(sp.next, "/admin")} />
    </>
  );
}

export default function Page(props: PageProps<"/admin/mfa">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
