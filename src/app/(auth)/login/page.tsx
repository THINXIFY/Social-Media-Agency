import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/customer-forms";
import { AuthHeading, FormSkeleton } from "@/components/auth/frame";
import { getCustomerSession } from "@/server/auth";
import { safeNext } from "@/server/auth/cookies";

export const metadata: Metadata = { title: "Sign in · Sociotix" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, "/dashboard");
  const signedIn = await getCustomerSession().catch(() => null);
  if (signedIn?.session.user.emailVerifiedAt) redirect(next);
  const notice = sp.signedOut
    ? "You've been signed out."
    : sp.expired
      ? "Your session ended. Please sign in again."
      : sp.reset
        ? "Your password was updated and every device was signed out. Sign in with your new password."
        : sp.verified
          ? "Your email is confirmed. Sign in to open your dashboard."
          : undefined;
  return (
    <>
      <AuthHeading title="Welcome back" description="Sign in to your Sociotix account." />
      <LoginForm next={next} notice={notice} />
    </>
  );
}

export default function Page(props: PageProps<"/login">) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
