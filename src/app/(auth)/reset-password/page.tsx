import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/customer-forms";
import { ghostButton } from "@/components/auth/fields";
import { AuthHeading, FormSkeleton } from "@/components/auth/frame";
import { resetTokenValid } from "@/server/auth/accounts";
import { getDb } from "@/server/db/client";

export const metadata: Metadata = { title: "Choose a new password · Sociotix", referrer: "no-referrer" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const token = String((await searchParams).token ?? "");
  const valid = token ? await resetTokenValid(getDb(), token).catch(() => false) : false;
  if (!valid)
    return (
      <>
        <AuthHeading title="This link has expired" description="Reset links work once and expire after an hour. Request a new one to continue." />
        <Link href="/forgot-password" className={ghostButton}>
          Request a new link
        </Link>
      </>
    );
  return (
    <>
      <AuthHeading title="Choose a new password" description="For your security, every device will be signed out afterwards." />
      <ResetPasswordForm token={token} />
    </>
  );
}

export default function Page(props: PageProps<"/reset-password">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
