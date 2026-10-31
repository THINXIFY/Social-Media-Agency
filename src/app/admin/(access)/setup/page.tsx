import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthHeading, FormSkeleton } from "@/components/auth/frame";
import { StaffSetupForm } from "@/components/auth/staff-forms";
import { describeSetupLink } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";

export const metadata: Metadata = { title: "Set up staff access", referrer: "no-referrer" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const token = String((await searchParams).token ?? "");
  const invite = token ? await describeSetupLink(getDb(), token).catch(() => null) : null;
  if (!invite)
    return <AuthHeading eyebrow="Sociotix Admin" title="This setup link isn't valid" description="Setup links work once and expire. Ask the platform owner — or, for the first owner, the server operator — for a new one." />;
  return (
    <>
      <AuthHeading eyebrow={`${invite.role} access`} title={`Welcome, ${invite.name || "there"}`} description={<>Set a password for <span className="font-semibold text-foreground">{invite.email}</span>. Next you&apos;ll connect an authenticator app.</>} />
      <StaffSetupForm token={token} />
    </>
  );
}

export default function Page(props: PageProps<"/admin/setup">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
