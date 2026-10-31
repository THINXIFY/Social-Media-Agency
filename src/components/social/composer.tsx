"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, CalendarClock, Check, CircleAlert, Clock, Film, ImageIcon, Lock, Save, Send, Sparkles, X } from "lucide-react";
import { ConfirmDialog } from "@/components/dashboard/account-ui";
import { Panel, useHydrated } from "@/components/dashboard/shared";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime, useDisplay } from "@/lib/i18n";
import { SOCIAL_PLATFORM, SOCIAL_PLATFORMS, type SocialProviderId } from "@/lib/social/platforms";
import { charCount, MEDIA_RULES, POST_TEXT_MAX, postHref, PUBLISH_RULES, PUBLISHING_ROUTES, textFor, validateForPlatform, type PostContent, type PostView, type PublishingData } from "@/lib/social/publishing";
import { browserTimeZone, utcToZonedInput } from "@/lib/social/time";
import { cn } from "@/lib/utils";
import { page, primaryButton, quietButton, SocialNav, SocialTile } from "./parts";
import { postsApi, StateBadge, useUnsavedWarning } from "./publishing-parts";

/* The post composer (AI-07): write once, adapt per platform, preview, save, plan — and schedule only where publishing is really available. */

const field = "w-full rounded-2xl border bg-background px-3.5 py-2.5 text-[0.92rem] outline-none transition-[border-color,box-shadow] focus-visible:border-primary/40 focus-visible:ring-3 focus-visible:ring-primary/20 dark:bg-white/[0.02]";
const label = "text-[0.78rem] font-semibold";

/* -------------------------------------------------------------------------- */
/*  Preview                                                                   */
/* -------------------------------------------------------------------------- */

const FOLD: Record<SocialProviderId, number> = { instagram: 125, facebook: 480, tiktok: 100, youtube: 160, x: 280, linkedin: 210 };

function Folded({ text, at }: { text: string; at: number }) {
  const [open, setOpen] = React.useState(false);
  const chars = Array.from(text);
  if (chars.length <= at || open) return <span className="whitespace-pre-wrap">{text}</span>;
  return (
    <span className="whitespace-pre-wrap">
      {chars.slice(0, at).join("").trimEnd()}…{" "}
      <button type="button" onClick={() => setOpen(true)} className="font-semibold text-muted-foreground hover:underline">
        more
      </button>
    </span>
  );
}

function MediaSlot({ provider, tall = false }: { provider: SocialProviderId; tall?: boolean }) {
  const r = PUBLISH_RULES[provider];
  return (
    <div className={cn("grid place-items-center bg-[repeating-linear-gradient(135deg,transparent_0_10px,rgb(32_33_39/0.035)_10px_20px)] text-center dark:bg-[repeating-linear-gradient(135deg,transparent_0_10px,rgb(255_255_255/0.04)_10px_20px)]", tall ? "aspect-[9/16] max-h-80" : provider === "youtube" ? "aspect-video" : "aspect-[4/3]")}>
      <span className="flex flex-col items-center gap-1.5 px-4 text-[0.72rem] text-muted-foreground">
        {r.requiresMedia?.includes("video") && !r.requiresMedia.includes("image") ? <Film className="size-5" aria-hidden /> : <ImageIcon className="size-5" aria-hidden />}
        {r.requiresMedia ? `${SOCIAL_PLATFORM[provider].name} needs ${r.requiresMedia.length === 1 ? `a ${r.requiresMedia[0]}` : "a photo or video"}` : "Optional media"}
      </span>
    </div>
  );
}

function Preview({ content, provider }: { content: PostContent; provider: SocialProviderId }) {
  const text = textFor(content, provider);
  const p = SOCIAL_PLATFORM[provider];
  const head = (
    <div className="flex items-center gap-2.5 px-3.5 py-3">
      <SocialTile provider={provider} size="sm" className="rounded-full" />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[0.82rem] font-bold">Your account</p>
        <p className="truncate text-[0.7rem] text-muted-foreground">{provider === "facebook" ? "Your Page" : provider === "linkedin" ? "Your profile" : "@youraccount"}</p>
      </div>
    </div>
  );
  const body = text.trim() ? <Folded text={text} at={FOLD[provider]} /> : <span className="text-muted-foreground italic">Your text will appear here.</span>;
  if (provider === "tiktok") {
    return (
      <div className="relative mx-auto w-full max-w-[15rem] overflow-hidden rounded-2xl bg-graphite text-white">
        <div className="aspect-[9/16] bg-[repeating-linear-gradient(135deg,transparent_0_10px,rgb(255_255_255/0.04)_10px_20px)]" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-[0.75rem] leading-snug">
          <p className="font-bold">@youraccount</p>
          <p className="mt-1">{body}</p>
        </div>
        <span className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-2 py-0.5 text-[0.62rem] font-semibold">Video required</span>
      </div>
    );
  }
  if (provider === "youtube") {
    return (
      <div className="overflow-hidden rounded-2xl border bg-card">
        <MediaSlot provider="youtube" />
        <div className="flex gap-2.5 p-3.5">
          <SocialTile provider="youtube" size="sm" className="rounded-full" />
          <div className="min-w-0">
            <p className="line-clamp-2 text-[0.88rem] font-bold">{content.title?.trim() || <span className="text-muted-foreground italic">Add a title</span>}</p>
            <p className="mt-0.5 text-[0.72rem] text-muted-foreground">Your channel</p>
            <p className="mt-2 text-[0.76rem] text-muted-foreground">{body}</p>
          </div>
        </div>
      </div>
    );
  }
  const mediaFirst = provider === "instagram";
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      {head}
      {mediaFirst ? <MediaSlot provider={provider} /> : null}
      <div className={cn("px-3.5 text-[0.85rem] leading-relaxed", mediaFirst ? "py-3" : "pb-3")}>
        {mediaFirst ? <span className="me-1 font-bold">youraccount</span> : null}
        {body}
      </div>
      {!mediaFirst && content.media.length ? <MediaSlot provider={provider} /> : null}
      <p className="border-t px-3.5 py-2 text-[0.68rem] text-muted-foreground">{p.name} · no reactions or counts are shown in previews</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Composer                                                                  */
/* -------------------------------------------------------------------------- */

export function Composer({ data, post }: { data: PublishingData; post: PostView | null }) {
  useDisplay();
  const router = useRouter();
  const hydrated = useHydrated();
  const tz = post?.timezone && post.timezone !== "UTC" ? post.timezone : hydrated ? browserTimeZone() : "UTC";
  const locked = post?.status === "scheduled";

  const [title, setTitle] = React.useState(post?.title ?? "");
  const [text, setText] = React.useState(post?.text ?? "");
  const [providers, setProviders] = React.useState<SocialProviderId[]>(post?.providers.length ? post.providers : ["instagram", "facebook"]);
  const [variants, setVariants] = React.useState<Partial<Record<SocialProviderId, string>>>(post?.variants ?? {});
  const [planned, setPlanned] = React.useState(post?.plannedAt ? utcToZonedInput(post.plannedAt, post.timezone) : "");
  const [editing, setEditing] = React.useState<SocialProviderId | "all">("all");
  const [previewOf, setPreviewOf] = React.useState<SocialProviderId | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "save" | "schedule" | "cancel">(null);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  useUnsavedWarning(dirty);

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
    setMessage(null);
  };
  const content: PostContent = { text, title, media: [], variants };
  const shown = previewOf && providers.includes(previewOf) ? previewOf : (providers[0] ?? null);
  const issues = providers.flatMap((p) => validateForPlatform(content, p));
  const accounts = data.workspace.accounts.filter((a) => providers.includes(a.provider));
  const schedulable = accounts.filter((a) => a.status === "active" && data.publishing[a.provider].ok);
  const scheduleBlocker = !data.workspace.accounts.length
    ? "Connect an account and wait for its platform to approve publishing before scheduling."
    : !schedulable.length
      ? "None of the selected platforms can publish yet — each needs its platform's approval for posting."
      : issues.some((i) => i.level === "error" && schedulable.some((a) => a.provider === i.provider))
        ? "Fix the issues shown in the preview first."
        : null;

  const editValue = editing === "all" ? text : (variants[editing] ?? "");
  const setEditValue = (v: string) => (editing === "all" ? touch(setText)(v) : touch(setVariants)({ ...variants, [editing]: v }));
  const limit = editing === "all" ? Math.min(POST_TEXT_MAX, ...providers.map((p) => PUBLISH_RULES[p].textMax)) : PUBLISH_RULES[editing].textMax;
  const used = charCount(editValue);

  async function save(): Promise<PostView | null> {
    setBusy("save");
    const body = JSON.stringify({ title: title || null, text, variants: Object.fromEntries(Object.entries(variants).filter(([k, v]) => providers.includes(k as SocialProviderId) && v?.trim())), providers, plannedLocal: planned || null, timezone: tz });
    const r = post ? await postsApi<{ post: PostView }>(`/api/social/posts/${post.id}`, { method: "PATCH", body }) : await postsApi<{ post: PostView }>("/api/social/posts", { method: "POST", body });
    setBusy(null);
    if (!r.ok) {
      setMessage({ ok: false, text: r.message });
      return null;
    }
    setDirty(false);
    setMessage({ ok: true, text: "Draft saved." });
    if (!post) router.replace(postHref(r.data.post.id));
    else router.refresh();
    return r.data.post;
  }

  async function cancelSchedule() {
    if (!post) return;
    setBusy("cancel");
    const r = await postsApi<{ cancelled: number; inFlight: number }>(`/api/social/posts/${post.id}/cancel`, { method: "POST" });
    setBusy(null);
    setMessage(r.ok ? { ok: true, text: r.data.inFlight ? "Cancelled what hadn't started. One account was already publishing and couldn't be stopped." : "Schedule cancelled. Nothing was published." } : { ok: false, text: r.message });
    router.refresh();
  }

  const toggle = (p: SocialProviderId) => touch(setProviders)(providers.includes(p) ? providers.filter((x) => x !== p) : [...providers, p]);

  return (
    <div className={page}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={PUBLISHING_ROUTES.library}
              onClick={(e) => {
                if (dirty) {
                  e.preventDefault();
                  setLeaving(true);
                }
              }}
              className="grid size-10 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
              aria-label="Back to Publishing"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-[1.5rem] leading-tight font-extrabold tracking-tight sm:text-[1.8rem]">{post ? "Edit post" : "New post"}</h1>
              <p className="flex items-center gap-2 text-[0.82rem] text-muted-foreground">
                {post ? <StateBadge state={post.state} /> : null}
                {dirty ? <span className="text-soon">Unsaved changes</span> : post ? `Saved ${formatDateTime(post.updatedAt)}` : "Not saved yet"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {locked ? (
              <button type="button" className={quietButton} onClick={cancelSchedule} disabled={busy !== null}>
                <Ban className="size-4" aria-hidden /> {busy === "cancel" ? "Cancelling…" : "Cancel schedule"}
              </button>
            ) : (
              <>
                <button type="button" className={quietButton} onClick={() => setScheduleOpen(true)} disabled={busy !== null} aria-describedby={scheduleBlocker ? "schedule-why" : undefined}>
                  <CalendarClock className="size-4" aria-hidden /> Schedule
                </button>
                <button type="button" className={primaryButton} onClick={save} disabled={busy !== null || (!dirty && !!post)}>
                  <Save className="size-4" aria-hidden /> {busy === "save" ? "Saving…" : "Save draft"}
                </button>
              </>
            )}
          </div>
        </div>
        <SocialNav />
      </div>

      {message ? (
        <p role="status" className={cn("mt-5 rounded-2xl px-4 py-3 text-sm font-medium", message.ok ? "bg-ok-soft text-ok" : "bg-destructive/[0.07] text-destructive")}>
          {message.text}
        </p>
      ) : null}
      {locked ? (
        <p className="mt-5 flex items-start gap-2 rounded-2xl bg-primary/[0.06] px-4 py-3 text-sm text-foreground dark:bg-primary/15">
          <Lock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> This post is scheduled, so it can&apos;t be edited. Cancel the schedule to make changes.
        </p>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <fieldset disabled={locked} className="min-w-0 space-y-5">
          <Panel className="p-4 sm:p-5">
            <p className={label}>Platforms</p>
            <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="Platforms">
              {SOCIAL_PLATFORMS.map((p) => {
                const on = providers.includes(p.id);
                return (
                  <button key={p.id} type="button" aria-pressed={on} onClick={() => toggle(p.id)} className={cn("inline-flex h-9 items-center gap-2 rounded-full border ps-1 pe-3 text-[0.8rem] font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none", on ? "border-primary/40 bg-primary/[0.06] dark:bg-primary/15" : "bg-card text-muted-foreground hover:text-foreground")}>
                    <SocialTile provider={p.id} size="xs" className="rounded-full" />
                    {p.name}
                    {on ? <Check className="size-3.5 text-primary" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>

            {providers.includes("youtube") ? (
              <label className="mt-5 block">
                <span className={label}>Title <span className="font-normal text-muted-foreground">(YouTube)</span></span>
                <input value={title} maxLength={100} onChange={(e) => touch(setTitle)(e.target.value)} className={cn(field, "mt-1.5")} placeholder="A clear, descriptive video title" />
              </label>
            ) : (
              <label className="mt-5 block">
                <span className={label}>Internal name <span className="font-normal text-muted-foreground">(optional, only you see it)</span></span>
                <input value={title} maxLength={100} onChange={(e) => touch(setTitle)(e.target.value)} className={cn(field, "mt-1.5")} placeholder="e.g. Autumn menu launch" />
              </label>
            )}

            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={label} id="text-label">
                  Text
                </span>
                {providers.length > 1 ? (
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Edit text for">
                    {(["all", ...providers] as const).map((k) => (
                      <button key={k} type="button" aria-pressed={editing === k} onClick={() => setEditing(k)} className={cn("h-7 rounded-full px-2.5 text-[0.72rem] font-semibold transition-colors", editing === k ? "bg-graphite text-white dark:bg-white dark:text-graphite" : "text-muted-foreground hover:bg-muted")}>
                        {k === "all" ? "All platforms" : SOCIAL_PLATFORM[k].name}
                        {k !== "all" && variants[k]?.trim() ? " •" : ""}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <textarea aria-labelledby="text-label" value={editValue} onChange={(e) => setEditValue(e.target.value)} rows={8} className={cn(field, "mt-2 resize-y leading-relaxed")} placeholder={editing === "all" ? "Write your post…" : `Custom text for ${SOCIAL_PLATFORM[editing].name}. Leave empty to use the main text.`} />
              <p className={cn("mt-1.5 flex justify-end gap-3 text-[0.72rem] sm:justify-between", used > limit ? "font-semibold text-destructive" : "text-muted-foreground")}>
                <span className="hidden sm:inline">{editing === "all" ? "Shared by every platform unless you customise one." : `Only used on ${SOCIAL_PLATFORM[editing].name}.`}</span>
                <span className="tabular-nums" aria-live="polite">
                  {used.toLocaleString("en-US")} / {limit.toLocaleString("en-US")}
                </span>
              </p>
            </div>
          </Panel>

          <Panel className="p-4 sm:p-5">
            <p className={label}>Media</p>
            <div className="mt-2.5 flex items-start gap-3 rounded-2xl border border-dashed p-4">
              <ImageIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="text-[0.8rem] leading-relaxed text-muted-foreground">
                <p className="font-semibold text-foreground">Media uploads aren&apos;t available yet</p>
                <p className="mt-0.5">Secure media storage switches on with publishing. Accepted then: images ({MEDIA_RULES.image.label}) and videos ({MEDIA_RULES.video.label}).</p>
              </div>
            </div>
          </Panel>

          <Panel className="p-4 sm:p-5">
            <label className="block">
              <span className={label}>Planned date <span className="font-normal text-muted-foreground">(optional — for your calendar; nothing is posted)</span></span>
              <input type="datetime-local" value={planned} onChange={(e) => touch(setPlanned)(e.target.value)} className={cn(field, "mt-1.5")} />
            </label>
            <p className="mt-1.5 text-[0.72rem] text-muted-foreground">Time zone: {tz}</p>

            <div className="mt-5">
              <p className={label}>Accounts</p>
              {accounts.length ? (
                <ul className="mt-2 space-y-1.5">
                  {accounts.map((a) => (
                    <li key={a.id} className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2 text-[0.8rem] dark:bg-white/[0.03]">
                      <SocialTile provider={a.provider} size="xs" />
                      <span className="min-w-0 flex-1 truncate font-semibold">{a.displayName}</span>
                      <span className="text-[0.7rem] text-muted-foreground">{data.publishing[a.provider].ok ? "Can publish" : "Publishing not available"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 rounded-xl bg-muted/50 px-3 py-2.5 text-[0.8rem] text-muted-foreground dark:bg-white/[0.03]">
                  No connected accounts for these platforms.{" "}
                  <Link href="/dashboard/social/accounts" className="font-semibold text-primary hover:underline">
                    See accounts
                  </Link>
                </p>
              )}
            </div>
            {scheduleBlocker && !locked ? (
              <p id="schedule-why" className="mt-3 flex items-start gap-2 text-[0.75rem] text-muted-foreground">
                <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {scheduleBlocker}
              </p>
            ) : null}
          </Panel>

          <p className="flex items-center gap-2 text-[0.78rem] text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" aria-hidden /> Need words?{" "}
            <Link href="/ai-tools/caption-generator" className="font-semibold text-primary hover:underline">
              Caption Generator
            </Link>{" "}
            or{" "}
            <Link href={PUBLISHING_ROUTES.campaigns} className="font-semibold text-primary hover:underline">
              Campaign Studio
            </Link>
          </p>
        </fieldset>

        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <Panel className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className={label}>Preview</p>
              <span className="text-[0.68rem] text-muted-foreground">Approximate layout — not the exact platform design</span>
            </div>
            {providers.length ? (
              <>
                <div className="mt-3 flex flex-wrap gap-1" role="tablist" aria-label="Preview platform">
                  {providers.map((p) => {
                    const bad = issues.some((i) => i.provider === p && i.level === "error");
                    return (
                      <button key={p} type="button" role="tab" aria-selected={shown === p} onClick={() => setPreviewOf(p)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[0.75rem] font-semibold transition-colors", shown === p ? "border-primary/40 bg-primary/[0.06] dark:bg-primary/15" : "bg-card text-muted-foreground hover:text-foreground")}>
                        <SocialTile provider={p} size="xs" className="size-4 rounded [&_svg]:size-2.5" />
                        {SOCIAL_PLATFORM[p].name}
                        {bad ? <CircleAlert className="size-3.5 text-destructive" aria-label="has issues" /> : null}
                      </button>
                    );
                  })}
                </div>
                {shown ? (
                  <div className="mt-4" role="tabpanel">
                    <Preview content={content} provider={shown} />
                    <ul className="mt-3 space-y-1.5">
                      {issues
                        .filter((i) => i.provider === shown)
                        .map((i) => (
                          <li key={i.message} className="flex items-start gap-2 rounded-xl bg-destructive/[0.06] px-3 py-2 text-[0.76rem] text-destructive">
                            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {i.message}
                          </li>
                        ))}
                      {issues.some((i) => i.provider === shown && i.message === PUBLISH_RULES[shown].note) ? null : <li className="text-[0.72rem] text-muted-foreground">{PUBLISH_RULES[shown].note}</li>}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-4 rounded-2xl bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">Choose at least one platform to see a preview.</p>
            )}
          </Panel>
        </div>
      </div>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="gap-0 p-0 sm:max-w-md" showCloseButton={false}>
          {!scheduleBlocker ? (
            <ScheduleForm
              accounts={schedulable}
              tz={tz}
              busy={busy === "schedule"}
              onCancel={() => setScheduleOpen(false)}
              onSchedule={async (when, ids) => {
                const saved = dirty || !post ? await save() : post;
                if (!saved) return;
                setBusy("schedule");
                const r = await postsApi<{ ambiguous: boolean }>(`/api/social/posts/${saved.id}/schedule`, { method: "POST", body: JSON.stringify({ when, timezone: tz, connectionIds: ids }) });
                setBusy(null);
                setScheduleOpen(false);
                setMessage(r.ok ? { ok: true, text: r.data.ambiguous ? "Scheduled. That time happens twice when the clocks change, so the first one was used." : "Scheduled. You can cancel any time before it starts publishing." } : { ok: false, text: r.message });
                router.refresh();
              }}
            />
          ) : (
          <>
          <div className="p-6">
            <span className="mb-4 grid size-11 place-items-center rounded-2xl bg-secondary text-secondary-foreground" aria-hidden>
              <Send className="size-5" />
            </span>
            <DialogTitle className="font-heading text-lg font-bold">Scheduling isn&apos;t available yet</DialogTitle>
            <DialogDescription className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{scheduleBlocker ?? "Choose accounts that can publish."}</DialogDescription>
            <ul className="mt-4 space-y-2 text-[0.8rem] text-muted-foreground">
              {["A connected account on the platform", "The platform's approval of Sociotix's posting permission", "Your permission to post, granted on the platform", "Your explicit schedule — nothing is ever posted automatically"].map((s) => (
                <li key={s} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden /> {s}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[0.78rem] text-muted-foreground">You can save this as a draft and give it a planned date for your calendar.</p>
          </div>
          <div className="flex justify-end gap-2 border-t bg-muted/40 px-6 py-4">
            <button type="button" className={quietButton} onClick={() => setScheduleOpen(false)}>
              <X className="size-4" aria-hidden /> Close
            </button>
          </div>
          </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={leaving} onOpenChange={setLeaving} tone="danger" title="Leave without saving?" description="Your changes to this post haven't been saved." confirmLabel="Leave" cancelLabel="Keep editing" onConfirm={() => router.push(PUBLISHING_ROUTES.library)} />
    </div>
  );
}

function ScheduleForm({ accounts, tz, busy, onCancel, onSchedule }: { accounts: PublishingData["workspace"]["accounts"]; tz: string; busy: boolean; onCancel: () => void; onSchedule: (when: string, ids: string[]) => void }) {
  const [when, setWhen] = React.useState("");
  const [ids, setIds] = React.useState<string[]>(accounts.map((a) => a.id));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (when && ids.length) onSchedule(when, ids);
      }}
    >
      <div className="space-y-4 p-6">
        <DialogTitle className="font-heading text-lg font-bold">Schedule this post</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">It will be published at this time to the accounts you choose. You can cancel until it starts.</DialogDescription>
        <label className="block">
          <span className={label}>Date and time</span>
          <input type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} className={cn(field, "mt-1.5")} />
          <span className="mt-1 block text-[0.72rem] text-muted-foreground">Time zone: {tz}</span>
        </label>
        <fieldset>
          <legend className={label}>Accounts</legend>
          <ul className="mt-2 space-y-1.5">
            {accounts.map((a) => (
              <li key={a.id}>
                <label className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2 text-[0.82rem]">
                  <input type="checkbox" checked={ids.includes(a.id)} onChange={(e) => setIds(e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id))} className="size-4 accent-[#7047eb]" />
                  <SocialTile provider={a.provider} size="xs" />
                  {a.displayName}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </div>
      <div className="flex justify-end gap-2 border-t bg-muted/40 px-6 py-4">
        <button type="button" className={quietButton} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={primaryButton} disabled={busy || !when || !ids.length}>
          <Send className="size-4" aria-hidden /> {busy ? "Scheduling…" : "Schedule post"}
        </button>
      </div>
    </form>
  );
}
