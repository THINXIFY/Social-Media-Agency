import type { Metadata } from "next";
import { Suspense } from "react";
import { RegisterForm } from "@/components/auth/customer-forms";
import { AuthHeading, FormSkeleton } from "@/components/auth/frame";
import { normalizeCode } from "@/server/referrals/referrals";

export const metadata: Metadata = { title: "Create account · SociVanta" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  // A referral link carries ?ref=CODE. It's only checked on the server at sign-up.
  const referral = normalizeCode(Array.isArray(sp.ref) ? sp.ref[0] : sp.ref);
  return <RegisterForm referral={referral} />;
}

export default function Page(props: PageProps<"/register">) {
  return (
    <>
      <AuthHeading title="Create your account" description="It takes less than a minute. We'll ask you to confirm your email." />
      <Suspense fallback={<FormSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
