import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthHeading, FormSkeleton } from "@/components/auth/frame";
import { StaffLoginForm } from "@/components/auth/staff-forms";
import { getStaffSession } from "@/server/auth";
import { safeNext } from "@/server/auth/cookies";

export const metadata: Metadata = { title: "Staff sign-in" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getStaffSession().catch(() => null);
  if (ctx?.mfaComplete) redirect(safeNext(sp.next, "/admin"));
  return (
    <>
      <AuthHeading title="Sign in to admin" description="Use your staff email and password. You'll confirm with your authenticator app next." />
      <StaffLoginForm next={safeNext(sp.next, "/admin")} notice={sp.signedOut ? "You've been signed out." : undefined} />
    </>
  );
}

export default function Page(props: PageProps<"/admin/login">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
