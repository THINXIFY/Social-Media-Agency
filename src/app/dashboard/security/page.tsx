import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PasswordPanel, SessionsPanel } from "@/components/auth/account-security";
import { getCustomerSession } from "@/server/auth";
import { sessionRows } from "@/server/auth/session-view";

export const metadata: Metadata = { title: "Sign-in & security" };

async function Content() {
  const ctx = await getCustomerSession();
  if (!ctx) redirect("/login?expired=1");
  const rows = await sessionRows(ctx.session.userId, "customer", ctx.session.id);
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="font-heading text-[1.6rem] leading-tight font-extrabold tracking-tight sm:text-[1.9rem]">Sign-in &amp; security</h1>
        <p className="mt-1 text-[0.95rem] text-muted-foreground">Signed in as {ctx.session.user.email}</p>
      </header>
      <div className="mt-6 space-y-5">
        <SessionsPanel kind="customer" sessions={rows} />
        <PasswordPanel kind="customer" />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-3xl animate-pulse px-4 py-8 motion-reduce:animate-none" aria-busy="true" />}>
      <Content />
    </Suspense>
  );
}
