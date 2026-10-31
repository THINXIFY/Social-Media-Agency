"use client";

import * as React from "react";
import Link from "next/link";
import { BadgeCheck, Check, Copy, Gift, Link2, type LucideIcon, MailCheck, RefreshCw, Share2, ShieldCheck, Sparkles, UserPlus, Users } from "lucide-react";
import { ConfirmDialog } from "@/components/dashboard/account-ui";
import { api, ApiError } from "@/lib/live-account";
import { formatDate } from "@/lib/i18n";
import { type OwnReferralSummary, REFERRAL_STATUS_META, type ReferralStatus } from "@/lib/referrals";
import { cn } from "@/lib/utils";

/*
 * Live customer Referrals (5G-B). Real data only: the caller's own code and
 * the people who signed up with it. Rewards aren't offered yet, so nothing
 * here shows an amount, a balance or a date anyone will be paid.
 */

const btn = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";
const STATUS_TONE: Record<ReferralStatus, string> = {
  signed_up: "bg-secondary text-secondary-foreground",
  pending: "bg-soon-soft text-soon",
  qualified: "bg-ok-soft text-ok",
  ineligible: "bg-off-soft text-off",
};
const noop = () => () => {};
const message = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "That didn't work. Please try again.");

function ReferralChip({ status }: { status: ReferralStatus }) {
  return <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[0.72rem] font-semibold whitespace-nowrap", STATUS_TONE[status])}>{REFERRAL_STATUS_META[status].customer}</span>;
}

export function LiveReferrals() {
  const [data, setData] = React.useState<OwnReferralSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    api<OwnReferralSummary>("/api/account/referrals").then(
      (d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      },
      (e) => !cancelled && setError(message(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [n]);

  return (
    <div className="mx-auto max-w-[80rem] px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <header className="min-w-0">
        <p className="inline-flex items-center gap-1.5 text-[0.78rem] font-semibold tracking-wide text-primary uppercase dark:text-[#c4b5ff]">
          <Gift className="size-3.5" aria-hidden /> Referrals
        </p>
        <h1 className="mt-1.5 font-heading text-[1.75rem] leading-tight font-extrabold tracking-tight text-balance sm:text-[2.2rem]">Share Sociotix. Grow Together.</h1>
        <p className="mt-1.5 max-w-2xl text-[0.95rem] text-pretty text-muted-foreground">Invite friends and colleagues with your personal link. When someone creates an account with it, you&apos;ll see them here.</p>
      </header>

      {error && !data ? (
        <div role="alert" className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/[0.05] p-5 text-sm">
          <p className="font-semibold">Your referrals couldn&apos;t be loaded.</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <button type="button" onClick={() => setN((x) => x + 1)} className={cn(btn, "mt-3 border bg-card hover:bg-muted")}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <div aria-busy="true" className="mt-6 space-y-5">
          <span className="sr-only">Loading your referrals…</span>
          <div className="h-56 animate-pulse rounded-[1.5rem] bg-muted motion-reduce:animate-none" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
            ))}
          </div>
        </div>
      ) : (
        <Loaded data={data} onChange={setData} />
      )}
    </div>
  );
}

function Loaded({ data, onChange }: { data: OwnReferralSummary; onChange: (d: OwnReferralSummary) => void }) {
  return (
    <>
      <ShareCard data={data} onChange={onChange} />

      <section aria-label="Your referral numbers" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={UserPlus} label="Joined with your link" value={String(data.counts.joined)} />
        <Stat icon={MailCheck} label="Confirmed their email" value={String(data.counts.verified)} />
        <Stat icon={ShieldCheck} label="Under review" value={String(data.counts.underReview)} />
        <Stat icon={Sparkles} label="Rewards" value="Coming soon" soft />
      </section>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <History data={data} />
        <HowItWorks />
      </div>
    </>
  );
}

function ShareCard({ data, onChange }: { data: OwnReferralSummary; onChange: (d: OwnReferralSummary) => void }) {
  const [copied, setCopied] = React.useState<"link" | "code" | null>(null);
  const [status, setStatus] = React.useState("");
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // The Web Share API exists only in some browsers; false during server rendering.
  const canShare = React.useSyncExternalStore(
    noop,
    () => typeof navigator.share === "function",
    () => false,
  );

  if (!data.program.sharingEnabled || !data.code || !data.link)
    return (
      <section className="mt-6 rounded-[1.5rem] border bg-card p-6">
        <h2 className="font-heading text-lg font-bold">Referral sharing is paused</h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">You can&apos;t get a referral link right now. People who already joined with your link are still listed below.</p>
      </section>
    );

  const copy = async (what: "link" | "code") => {
    const text = what === "link" ? data.link! : data.code!;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setStatus(what === "link" ? "Referral link copied." : "Referral code copied.");
      window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 2000);
    } catch {
      setStatus("Copy didn't work. Select the text and copy it instead.");
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: "Join me on Sociotix", text: "I use Sociotix to grow on social media. Create your account with my link:", url: data.link! });
    } catch {
      // Closing the share sheet isn't an error.
    }
  };
  const regenerate = async () => {
    setBusy(true);
    try {
      onChange(await api<OwnReferralSummary>("/api/account/referrals/code", { method: "POST", body: "{}" }));
      setStatus("You have a new referral code. Your old link no longer works for new sign-ups.");
    } catch (e) {
      setStatus(message(e));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <section aria-labelledby="share-heading" className="relative mt-6 overflow-hidden rounded-[1.5rem] bg-graphite p-5 text-white sm:p-7 dark:bg-[#17181d] dark:ring-1 dark:ring-white/10">
      <div aria-hidden className="pointer-events-none absolute -top-28 -right-20 size-72 rounded-full bg-primary/45 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 size-64 rounded-full bg-lime/10 blur-3xl" />
      <div className="relative">
        <h2 id="share-heading" className="font-heading text-[1.2rem] font-bold sm:text-[1.35rem]">
          Your referral link
        </h2>
        <p className="mt-1 text-sm text-white/70">Anyone who creates an account with this link, or enters your code at sign-up, is added to your referrals.</p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="ref-link" className="sr-only">
            Referral link
          </label>
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-white/10 ps-4 pe-1 ring-1 ring-white/15">
            <Link2 className="size-4 shrink-0 text-white/60" aria-hidden />
            <input id="ref-link" readOnly value={data.link} onFocus={(e) => e.currentTarget.select()} className="h-full min-w-0 flex-1 bg-transparent text-sm text-white outline-none" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => copy("link")} className={cn(btn, "h-11 flex-1 bg-lime px-5 font-bold text-graphite hover:brightness-95 focus-visible:ring-lime/50 sm:flex-none")}>
              {copied === "link" ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied === "link" ? "Copied" : "Copy link"}
            </button>
            {canShare && (
              <button type="button" onClick={share} className={cn(btn, "h-11 flex-1 text-white ring-1 ring-white/25 hover:bg-white/10 focus-visible:ring-white/40 sm:flex-none")}>
                <Share2 className="size-4" aria-hidden /> Share
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="text-white/70">Or share your code</span>
          <button type="button" onClick={() => copy("code")} aria-label={`Copy referral code ${data.code}`} className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/10 px-3 font-mono font-semibold tracking-wider ring-1 ring-white/15 transition-colors hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-white/40 focus-visible:outline-none">
            {data.code}
            {copied === "code" ? <Check className="size-3.5 text-lime" aria-hidden /> : <Copy className="size-3.5 text-white/60" aria-hidden />}
          </button>
          <button type="button" onClick={() => setConfirm(true)} className="inline-flex items-center gap-1.5 rounded-md text-[0.8rem] font-semibold text-white/60 underline-offset-4 hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none">
            <RefreshCw className="size-3.5" aria-hidden /> Get a new code
          </button>
        </div>
        <p role="status" aria-live="polite" className="mt-3 min-h-5 text-[0.8rem] text-lime">
          {status}
        </p>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={(o) => !busy && setConfirm(o)}
        title="Get a new referral code?"
        description="Your current link and code will stop working for new sign-ups. People who already joined stay in your referrals."
        confirmLabel={busy ? "Creating…" : "Get a new code"}
        onConfirm={regenerate}
        icon={RefreshCw}
      />
    </section>
  );
}

function Stat({ icon: Icon, label, value, soft }: { icon: LucideIcon; label: string; value: string; soft?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2 text-[0.8rem] text-muted-foreground">
        <Icon className="size-4 shrink-0 text-primary dark:text-[#c4b5ff]" aria-hidden />
        <span className="min-w-0">{label}</span>
      </div>
      <p className={cn("mt-2 font-heading font-extrabold tracking-tight", soft ? "text-lg text-muted-foreground" : "text-[1.7rem] leading-none tabular-nums")}>{value}</p>
    </div>
  );
}

function History({ data }: { data: OwnReferralSummary }) {
  return (
    <section aria-labelledby="history-heading" className="min-w-0 rounded-[1.25rem] border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
        <h2 id="history-heading" className="font-heading font-bold">
          People who joined
        </h2>
        <span className="text-xs text-muted-foreground">{data.history.length === 1 ? "1 person" : `${data.history.length} people`}</span>
      </div>
      {data.history.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/[0.08] text-primary dark:bg-primary/20 dark:text-[#c4b5ff]" aria-hidden>
            <Users className="size-5" />
          </span>
          <p className="mt-3 font-semibold">No one has joined with your link yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Share your link with someone who&apos;d find Sociotix useful. They&apos;ll appear here once they create an account.</p>
        </div>
      ) : (
        <ul className="divide-y">
          {data.history.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 sm:px-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-bold" aria-hidden>
                {r.name.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  Joined {formatDate(r.joinedAt, { year: true })}
                  {" · "}
                  {r.verified ? (
                    <span className="inline-flex items-center gap-1 text-ok">
                      <BadgeCheck className="size-3.5" aria-hidden /> Email confirmed
                    </span>
                  ) : (
                    "Email not confirmed yet"
                  )}
                </p>
              </div>
              <ReferralChip status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Share2, title: "Share your link or code", body: "Send it to people you know. Copying or sharing it doesn't count as an invitation on its own." },
  { icon: UserPlus, title: "They create an account", body: "Using your link, or entering your code on the sign-up page. Each person can only be referred once." },
  { icon: ShieldCheck, title: "We confirm the sign-up", body: "You'll see when they confirm their email. Our team may review sign-ups to keep the program fair." },
];

function HowItWorks() {
  return (
    <aside className="min-w-0 space-y-5">
      <section aria-labelledby="how-heading" className="rounded-[1.25rem] border bg-card p-5">
        <h2 id="how-heading" className="font-heading font-bold">
          How referrals work
        </h2>
        <ol className="mt-4 space-y-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-primary/[0.08] text-primary dark:bg-primary/20 dark:text-[#c4b5ff]" aria-hidden>
                <s.icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </p>
                <p className="mt-0.5 text-[0.82rem] text-pretty text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="rewards-heading" className="rounded-[1.25rem] border border-dashed bg-surface p-5">
        <h2 id="rewards-heading" className="flex items-center gap-2 font-heading font-bold">
          <Sparkles className="size-4 text-primary dark:text-[#c4b5ff]" aria-hidden /> Rewards coming soon
        </h2>
        <p className="mt-1.5 text-[0.85rem] text-pretty text-muted-foreground">Referral rewards aren&apos;t available yet. We&apos;ll publish the rules before any reward applies, so there&apos;s nothing to claim or track today.</p>
        <p className="mt-3 text-[0.85rem] text-pretty text-muted-foreground">Self-referrals and duplicate accounts aren&apos;t counted.</p>
        <Link href="/help/how-referrals-work" className="mt-3 inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline dark:text-[#c4b5ff]">
          Read the referral guide
        </Link>
      </section>
    </aside>
  );
}
