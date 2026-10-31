"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Copy, FilePlus2, Lightbulb, PenLine, Search, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/dashboard/account-ui";
import { Panel } from "@/components/dashboard/shared";
import { formatDateTime, useDisplay } from "@/lib/i18n";
import { postHref, PUBLISHING_ROUTES, type PostState, type PostView, type PublishingData } from "@/lib/social/publishing";
import { cn } from "@/lib/utils";
import { page, primaryButton, quietButton, SocialHeader, When } from "./parts";
import { EmptyIllustration, PlatformStack, postsApi, PublishingNotice, StateBadge } from "./publishing-parts";

/* Publishing (AI-07): the customer's content library — drafts, planned and scheduled posts. */

const FILTERS: { id: string; label: string; match: (s: PostState) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "drafts", label: "Drafts", match: (s) => s === "draft" || s === "planned" },
  { id: "scheduled", label: "Scheduled", match: (s) => s === "scheduled" || s === "publishing" },
  { id: "published", label: "Published", match: (s) => s === "published" || s === "partly_published" },
  { id: "attention", label: "Needs attention", match: (s) => s === "failed" || s === "needs_review" },
];

const headline = (p: PostView) => p.title?.trim() || p.text.trim().split("\n")[0]?.slice(0, 90) || "Untitled post";

function Empty() {
  const steps = [
    { icon: PenLine, title: "Write a post", body: "Draft once, adjust the wording for each platform, and preview it.", href: PUBLISHING_ROUTES.compose, cta: "Start writing" },
    { icon: CalendarDays, title: "Plan it on the calendar", body: "Give drafts a planned date to see your month at a glance.", href: PUBLISHING_ROUTES.calendar, cta: "Open calendar" },
    { icon: Lightbulb, title: "Get campaign ideas", body: "Plan a campaign, then turn the caption ideas you like into drafts.", href: PUBLISHING_ROUTES.campaigns, cta: "Campaign Studio" },
  ];
  return (
    <Panel className="mt-5 overflow-hidden">
      <div className="flex flex-col items-center px-6 pt-12 pb-8 text-center">
        <EmptyIllustration icon={FilePlus2} />
        <h2 className="mt-5 font-heading text-xl font-bold">Your content library is empty</h2>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">Every post you write is saved here as a private draft. Nothing is posted anywhere until a platform is connected, approved for publishing and you schedule it yourself.</p>
        <Link href={PUBLISHING_ROUTES.compose} className={cn(primaryButton, "mt-6")}>
          <PenLine className="size-4" aria-hidden /> Write your first post
        </Link>
      </div>
      <ul className="grid grid-cols-1 divide-y border-t sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {steps.map((s) => (
          <li key={s.title} className="p-5">
            <s.icon className="size-5 text-primary" aria-hidden />
            <p className="mt-3 text-sm font-semibold">{s.title}</p>
            <p className="mt-1 text-[0.8rem] leading-relaxed text-muted-foreground">{s.body}</p>
            <Link href={s.href} className="mt-3 inline-flex text-[0.8rem] font-semibold text-primary hover:underline">
              {s.cta} →
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function PublishingLibrary({ data }: { data: PublishingData }) {
  useDisplay();
  const router = useRouter();
  const [filter, setFilter] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<PostView | null>(null);
  const f = FILTERS.find((x) => x.id === filter)!;
  const needle = q.trim().toLowerCase();
  const posts = data.posts.filter((p) => f.match(p.state) && (!needle || `${p.title ?? ""} ${p.text}`.toLowerCase().includes(needle)));

  async function duplicate(p: PostView) {
    setBusy(p.id);
    const r = await postsApi<{ post: PostView }>(`/api/social/posts/${p.id}/duplicate`, { method: "POST" });
    setBusy(null);
    if (!r.ok) return setError(r.message);
    router.push(postHref(r.data.post.id));
  }
  async function remove(p: PostView) {
    setBusy(p.id);
    const r = await postsApi(`/api/social/posts/${p.id}`, { method: "DELETE" });
    setBusy(null);
    if (!r.ok) return setError(r.message);
    router.refresh();
  }

  return (
    <div className={page}>
      <SocialHeader
        title="Publishing"
        subtitle="Write, organise and plan your social posts in one place."
        action={
          <Link href={PUBLISHING_ROUTES.compose} className={primaryButton}>
            <PenLine className="size-4" aria-hidden /> New post
          </Link>
        }
      />
      <PublishingNotice data={data} className="mt-6" />

      {!data.posts.length ? (
        <Empty />
      ) : (
        <>
          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter posts">
              {FILTERS.map((x) => {
                const n = data.posts.filter((p) => x.match(p.state)).length;
                return (
                  <button
                    key={x.id}
                    type="button"
                    aria-pressed={filter === x.id}
                    onClick={() => setFilter(x.id)}
                    className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.8rem] font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none", filter === x.id ? "border-transparent bg-graphite text-white dark:bg-white dark:text-graphite" : "bg-card hover:bg-muted")}
                  >
                    {x.label} <span className={cn("tabular-nums", filter === x.id ? "opacity-70" : "text-muted-foreground")}>{n}</span>
                  </button>
                );
              })}
            </div>
            <label className="relative block md:w-72">
              <span className="sr-only">Search posts</span>
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts" className="h-10 w-full rounded-full border bg-card ps-9 pe-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-primary/30" />
            </label>
          </div>

          {error ? (
            <p role="alert" className="mt-3 rounded-2xl bg-destructive/[0.07] px-4 py-3 text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <Panel className="mt-4 overflow-hidden">
            {posts.length ? (
              <ul className="divide-y">
                {posts.map((p) => {
                  const when = p.scheduledAt ?? p.plannedAt;
                  const canDelete = p.status !== "scheduled" && !p.targets.some((t) => ["published", "publishing", "reconciliation_required"].includes(t.status));
                  return (
                    <li key={p.id} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-subtle/60 sm:px-5 md:grid-cols-[minmax(0,1fr)_8rem_10rem_auto] dark:hover:bg-white/[0.02]">
                      <Link href={postHref(p.id)} className="min-w-0 rounded-md focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
                        <p className="truncate text-[0.92rem] font-semibold group-hover:text-primary">{headline(p)}</p>
                        <p className="mt-0.5 flex items-center gap-2 text-[0.75rem] text-muted-foreground">
                          <PlatformStack providers={p.providers} />
                          <span className="truncate">
                            Edited <When iso={p.updatedAt} />
                          </span>
                        </p>
                      </Link>
                      <StateBadge state={p.state} className="justify-self-end md:justify-self-start" />
                      <p className="col-span-2 text-[0.78rem] text-muted-foreground md:col-span-1">{when ? `${p.scheduledAt ? "Scheduled" : "Planned"} ${formatDateTime(when)}` : "No date yet"}</p>
                      <div className="col-span-2 flex gap-1 md:col-span-1 md:justify-end">
                        <button type="button" onClick={() => duplicate(p)} disabled={busy !== null} className={cn(quietButton, "h-8 px-3 text-[0.78rem]")} aria-label={`Duplicate ${headline(p)}`}>
                          <Copy className="size-3.5" aria-hidden /> Duplicate
                        </button>
                        {canDelete ? (
                          <button type="button" onClick={() => setConfirm(p)} disabled={busy !== null} className={cn(quietButton, "h-8 px-3 text-[0.78rem] text-destructive hover:bg-destructive/[0.06]")} aria-label={`Delete ${headline(p)}`}>
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">No posts match. Try another filter or search.</p>
            )}
          </Panel>
        </>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        tone="danger"
        icon={Trash2}
        title="Delete this post?"
        description={confirm ? `"${headline(confirm)}" will be removed permanently. This can't be undone.` : ""}
        confirmLabel="Delete post"
        onConfirm={() => confirm && remove(confirm)}
      />
    </div>
  );
}
