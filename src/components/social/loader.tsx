import "server-only";
import { connection } from "next/server";
import { Suspense } from "react";
import { ServiceUnavailable } from "@/components/auth/states";
import { SOCIAL_PROVIDER_IDS, type SocialWorkspace } from "@/lib/social/platforms";
import type { PublishingData } from "@/lib/social/publishing";
import { listPosts, publishingAvailability } from "@/server/social/publishing";
import { customerPage } from "@/server/auth/pages";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { socialWorkspace } from "@/server/social/service";

/**
 * Loads the signed-in customer's own Social workspace per request. The same
 * real data in demo and live mode: there is no sample social data, ever.
 */
async function Load({ render }: { render: (data: SocialWorkspace) => React.ReactNode }) {
  await connection();
  const r = await customerPage();
  if (r.status !== "ok") return <ServiceUnavailable />;
  return <>{render(await socialWorkspace(getDb(), r.viewer.customerId, getEnv()))}</>;
}

function Fallback() {
  const block = "animate-pulse rounded-3xl bg-muted motion-reduce:animate-none";
  return (
    <div className="mx-auto max-w-[90rem] px-3 py-4 sm:px-6 sm:py-7 lg:px-8" aria-busy="true">
      <span className="sr-only">Loading your social workspace…</span>
      <div className={`h-24 max-w-lg ${block}`} />
      <div className={`mt-5 h-11 w-72 ${block}`} />
      <div className={`mt-6 h-80 ${block}`} />
    </div>
  );
}

export function SocialPage({ render }: { render: (data: SocialWorkspace) => React.ReactNode }) {
  return (
    <Suspense fallback={<Fallback />}>
      <Load render={render} />
    </Suspense>
  );
}

/** The publishing pages: the workspace plus the customer's own posts and per-platform publishing availability. */
async function LoadPublishing({ render }: { render: (data: PublishingData) => React.ReactNode }) {
  await connection();
  const r = await customerPage();
  if (r.status !== "ok") return <ServiceUnavailable />;
  const env = getEnv();
  const [workspace, posts] = await Promise.all([socialWorkspace(getDb(), r.viewer.customerId, env), listPosts(getDb(), r.viewer.customerId)]);
  const publishing = Object.fromEntries(
    SOCIAL_PROVIDER_IDS.map((id) => {
      const a = publishingAvailability(env, id);
      return [id, { ok: a.ok, reason: a.ok ? null : a.reason }];
    }),
  ) as PublishingData["publishing"];
  return <>{render({ workspace, posts, publishing, mediaStorage: false })}</>;
}

export function PublishingPage({ render }: { render: (data: PublishingData) => React.ReactNode }) {
  return (
    <Suspense fallback={<Fallback />}>
      <LoadPublishing render={render} />
    </Suspense>
  );
}

/** Automation Studio: the customer's own workflows, runs and inbox, plus what the builder needs to know. */
async function LoadAutomations({ render }: { render: (data: import("@/lib/social/automations").AutomationData & { accounts: number }) => React.ReactNode }) {
  await connection();
  const r = await customerPage();
  if (r.status !== "ok") return <ServiceUnavailable />;
  const { automationData } = await import("@/server/social/automations");
  const [data, workspace] = await Promise.all([automationData(getDb(), r.viewer.customerId), socialWorkspace(getDb(), r.viewer.customerId, getEnv())]);
  return <>{render({ ...data, accounts: workspace.accounts.length })}</>;
}

export function AutomationPage({ render }: { render: (data: import("@/lib/social/automations").AutomationData & { accounts: number }) => React.ReactNode }) {
  return (
    <Suspense fallback={<Fallback />}>
      <LoadAutomations render={render} />
    </Suspense>
  );
}
