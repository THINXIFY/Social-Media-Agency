"use client";

import Link from "next/link";
import { ArrowRight, Ban, CalendarDays, CircleAlert, KeyRound, Lightbulb, Link2, ListChecks, MousePointerClick, PenLine, ShieldCheck } from "lucide-react";
import { Panel } from "@/components/dashboard/shared";
import { CAPABILITY_LABEL, SOCIAL_PLATFORM, SOCIAL_PLATFORMS, SOCIAL_ROUTES, accountHref, type SocialWorkspace } from "@/lib/social/platforms";
import { cn } from "@/lib/utils";
import { ActivityList } from "./activity";
import { eyebrow, HealthPill, metricValue, page, primaryButton, quietButton, SocialHeader, SocialTile, When } from "./parts";

/** Content next actions (AI-07): available now, whether or not accounts are connected. */
function NextActions() {
  const actions = [
    { href: "/dashboard/social/publishing/new", icon: PenLine, title: "Write a post", body: "Draft once, adapt per platform, preview it." },
    { href: "/dashboard/social/calendar", icon: CalendarDays, title: "Plan your month", body: "See planned posts on the content calendar." },
    { href: "/dashboard/social/campaigns", icon: Lightbulb, title: "Plan a campaign", body: "Themes, a weekly plan and caption ideas." },
  ];
  return (
    <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {actions.map((a) => (
        <li key={a.href}>
          <Link href={a.href} className="group flex h-full items-start gap-3 rounded-2xl border bg-card p-4 shadow-soft transition-[border-color,box-shadow] hover:border-primary/30 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/[0.08] text-primary dark:bg-primary/20 dark:text-[#c9bcff]">
              <a.icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-sm font-semibold group-hover:text-primary">
                {a.title} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
              </span>
              <span className="mt-0.5 block text-[0.78rem] text-muted-foreground">{a.body}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* Social workspace overview (AI-06): real connections only. With none, an intentional empty state — never sample accounts or figures. */

function Empty({ data }: { data: SocialWorkspace }) {
  const available = data.platforms.filter((p) => p.availability.state === "available").length;
  const steps = [
    { icon: MousePointerClick, title: "Choose a platform", body: "Pick an account you manage." },
    { icon: KeyRound, title: "Review permissions", body: "See exactly what's shared — read-only." },
    { icon: ShieldCheck, title: "Authorize on the platform", body: "Sign in there. We never see your password." },
  ];
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <section aria-labelledby="empty-title" className="relative isolate overflow-hidden rounded-3xl bg-graphite p-5 text-white sm:p-8 dark:border dark:border-white/[0.06] dark:bg-[#121318]">
        <div className="pointer-events-none absolute -top-28 -end-20 -z-10 size-80 rounded-full bg-primary/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -start-24 -z-10 size-72 rounded-full bg-lime/10 blur-3xl" aria-hidden />
        <p className={cn(eyebrow, "text-lime")}>Your social workspace</p>
        <h2 id="empty-title" className="mt-2 max-w-md font-heading text-[1.6rem] leading-[1.1] font-extrabold tracking-[-0.02em] sm:text-[2rem]">
          Bring your accounts together in one calm place.
        </h2>
        <p className="mt-3 max-w-lg text-[0.95rem] leading-relaxed text-white/65">
          Connect the accounts you manage to see them side by side — each one&apos;s connection health and the figures its platform shares, refreshed when you ask.
        </p>

        <ol className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-2xl bg-white/[0.06] p-3.5 ring-1 ring-white/[0.06] ring-inset">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-lime text-[0.7rem] font-extrabold text-graphite">{i + 1}</span>
                <s.icon className="size-4 text-white/50" aria-hidden />
              </div>
              <p className="mt-2.5 text-sm font-semibold">{s.title}</p>
              <p className="mt-0.5 text-[0.78rem] leading-relaxed text-white/55">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-col gap-3 min-[460px]:flex-row min-[460px]:items-center">
          <Link href={SOCIAL_ROUTES.accounts} className={cn(primaryButton, "h-11 shrink-0 bg-lime px-5 whitespace-nowrap text-graphite shadow-none hover:bg-lime/90 focus-visible:ring-lime/40")}>
            {available ? "Connect your first account" : "See every platform"} <ArrowRight className="size-4" aria-hidden />
          </Link>
          <p className="text-[0.8rem] leading-relaxed text-white/50">{available ? `${available} platform${available === 1 ? " is" : "s are"} ready to connect.` : "Platforms switch on one by one, after each approves SociVanta."}</p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4">
        <Panel className="p-5">
          <h2 className="font-heading text-base font-bold">What each platform shares</h2>
          <ul className="mt-3 divide-y">
            {SOCIAL_PLATFORMS.map((p) => {
              const ready = data.platforms.find((x) => x.id === p.id)?.availability.state === "available";
              return (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <SocialTile provider={p.id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="truncate text-[0.75rem] text-muted-foreground">{p.capabilities.map((c) => (c === "audience" ? p.nouns.audience : c === "content-count" ? p.nouns.content : c === "profile" ? "Profile" : CAPABILITY_LABEL[c])).join(" · ")}</p>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[0.68rem] font-bold whitespace-nowrap", ready ? "bg-ok-soft text-ok" : "bg-muted text-muted-foreground")}>{ready ? "Ready" : "Not yet"}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel className="p-5">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold">
            <Ban className="size-4 text-muted-foreground" aria-hidden /> Never, on any platform
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">SociVanta doesn&apos;t post, schedule, message, change your profile or spend money on your accounts. Connections are read-only, and you can disconnect any time.</p>
        </Panel>
      </div>
    </div>
  );
}

export function SocialOverview({ data }: { data: SocialWorkspace }) {
  const { accounts } = data;
  const attention = accounts.filter((a) => a.health === "action_needed" || a.health === "sync_issue");
  const lastSync = accounts
    .map((a) => a.lastSyncAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const platformsUsed = new Set(accounts.map((a) => a.provider)).size;

  return (
    <div className={page}>
      <SocialHeader
        title="Social workspace"
        subtitle="Every account you've connected, how each connection is doing, and what's happened recently."
        action={
          accounts.length ? (
            <Link href={SOCIAL_ROUTES.accounts} className={quietButton}>
              <Link2 className="size-4" aria-hidden /> Manage accounts
            </Link>
          ) : null
        }
      />

      <NextActions />

      {!accounts.length ? (
        <Empty data={data} />
      ) : (
        <>
          <Panel className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
            <p className="text-sm">
              <span className="font-heading text-xl font-extrabold tabular-nums">{accounts.length}</span> <span className="text-muted-foreground">account{accounts.length === 1 ? "" : "s"} on {platformsUsed} platform{platformsUsed === 1 ? "" : "s"}</span>
            </p>
            <p className="text-sm">
              <span className={cn("font-heading text-xl font-extrabold tabular-nums", attention.length && "text-soon")}>{attention.length}</span> <span className="text-muted-foreground">need{attention.length === 1 ? "s" : ""} attention</span>
            </p>
            <p className="text-sm text-muted-foreground">{lastSync ? <When iso={lastSync} prefix="Last refreshed" /> : "Not refreshed yet"}</p>
          </Panel>

          {attention.length ? (
            <section aria-labelledby="attention-title" className="mt-4 rounded-3xl border border-soon/25 bg-soon-soft/60 p-4 sm:p-5">
              <h2 id="attention-title" className="flex items-center gap-2 text-sm font-bold text-soon">
                <CircleAlert className="size-4" aria-hidden /> Needs your attention
              </h2>
              <ul className="mt-2.5 space-y-2">
                {attention.map((a) => (
                  <li key={a.id}>
                    <Link href={accountHref(a.id)} className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5 transition-colors hover:bg-card/70 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
                      <SocialTile provider={a.provider} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{a.displayName}</span>
                        <span className="block truncate text-[0.78rem] text-muted-foreground">{a.healthNote}</span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <section aria-labelledby="accounts-title">
              <h2 id="accounts-title" className="sr-only">
                Connected accounts
              </h2>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {accounts.map((a) => {
                  const p = SOCIAL_PLATFORM[a.provider];
                  return (
                    <li key={a.id}>
                      <Link href={accountHref(a.id)} className="group flex h-full flex-col rounded-3xl border bg-card p-4 shadow-soft transition-[border-color,box-shadow] hover:border-primary/30 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:p-5">
                        <div className="flex items-start gap-3">
                          <SocialTile provider={a.provider} size="md" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-heading font-bold">{a.displayName}</p>
                            <p className="truncate text-sm text-muted-foreground">{a.handle ?? p.name}</p>
                          </div>
                          <HealthPill health={a.health} />
                        </div>
                        {a.metrics.length ? (
                          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                            {a.metrics.map((m) => (
                              <div key={m.capability}>
                                <dt className="text-[0.7rem] font-semibold text-muted-foreground">{m.label}</dt>
                                <dd className="font-heading text-lg font-extrabold tabular-nums">{metricValue(m.value)}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <p className="mt-4 text-[0.8rem] text-muted-foreground">{p.capabilities.length > 1 ? "Figures appear after the next refresh." : `${p.name} shares profile details only.`}</p>
                        )}
                        <p className="mt-auto pt-4 text-[0.75rem] text-muted-foreground">{a.lastSyncAt ? <When iso={a.lastSyncAt} prefix="Refreshed" /> : "Not refreshed yet"}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            <Panel className="self-start p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-heading text-base font-bold">
                  <ListChecks className="size-4 text-muted-foreground" aria-hidden /> Recent activity
                </h2>
                <Link href={SOCIAL_ROUTES.activity} className="text-sm font-semibold text-primary hover:underline">
                  View all
                </Link>
              </div>
              <ActivityList events={data.events.slice(0, 6)} compact />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
