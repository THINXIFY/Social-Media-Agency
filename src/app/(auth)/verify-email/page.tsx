import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ResendVerificationForm, VerifyEmailConfirm } from "@/components/auth/customer-forms";
import { AuthHeading, FormSkeleton } from "@/components/auth/frame";

export const metadata: Metadata = { title: "Confirm your email · Sociotix", referrer: "no-referrer" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const token = String((await searchParams).token ?? "");
  // Confirming needs a click (POST), so link scanners that open emails can't use the token.
  if (token)
    return (
      <>
        <AuthHeading title="Confirm your email" description="One click and your account is ready." />
        <VerifyEmailConfirm token={token} />
      </>
    );
  return (
    <>
      <AuthHeading title="Check your inbox" description="Confirm your email to open your dashboard. Didn't get the link? We can send a new one." />
      <ResendVerificationForm />
    </>
  );
}

export default function Page(props: PageProps<"/verify-email">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
