import type { Metadata } from "next";
import { Suspense } from "react";
import { PasswordPanel, SessionsPanel, TwoStepPanel } from "@/components/auth/account-security";
import { requireStaffSession } from "@/server/auth";
import { sessionRows } from "@/server/auth/session-view";
import { recoveryCodesRemaining } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";

export const metadata: Metadata = { title: "Account & security" };

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireStaffSession();
  const [rows, remaining] = await Promise.all([sessionRows(ctx.session.userId, "staff", ctx.session.id), recoveryCodesRemaining(getDb(), ctx.session.userId)]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header>
        <p className="text-[0.8rem] font-medium text-muted-foreground">Administration</p>
        <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Account &amp; security</h1>
        <p className="mt-1 text-[0.95rem] text-muted-foreground">
          {ctx.session.user.name || ctx.session.user.email} · {ctx.staff.roleName} · {ctx.session.user.email}
        </p>
      </header>
      <div className="mt-6 space-y-5">
        <TwoStepPanel remaining={remaining} low={sp.codes === "low"} />
        <SessionsPanel kind="staff" sessions={rows} />
        <PasswordPanel kind="staff" />
      </div>
    </div>
  );
}

export default function Page(props: PageProps<"/admin/account">) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-3xl animate-pulse px-4 py-8 motion-reduce:animate-none" aria-busy="true" />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
