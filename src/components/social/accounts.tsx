"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Ban,
  CircleCheck,
  CircleX,
  Clock,
  ExternalLink,
  Info,
  KeyRound,
  Link2,
  Link2Off,
  Lock,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { ConfirmDialog } from "@/components/dashboard/account-ui";
import { Panel } from "@/components/dashboard/shared";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PlatformIcon } from "@/components/brand";
import {
  CAPABILITY_LABEL,
  SOCIAL_PLANNED,
  SOCIAL_PLATFORM,
  SOCIAL_PLATFORMS,
  SOCIAL_ROUTES,
  SOCIAL_UNSUPPORTED,
  type SocialAccountView,
  type SocialPlatform,
  type SocialProviderId,
  type SocialWorkspace,
} from "@/lib/social/platforms";
import { cn } from "@/lib/utils";
import { eyebrow, HealthPill, metricValue, page, primaryButton, quietButton, socialApi, SocialHeader, SocialTile, When } from "./parts";

/* -------------------------------------------------------------------------- */
/*  Outcome banner (after the platform redirects back)                        */
/* -------------------------------------------------------------------------- */

const OUTCOME: Record<string, { tone: "ok" | "info" | "error"; title: (name: string, n: number) => string; body: (name: string) => string }> = {
  connected: { tone: "ok", title: (name, n) => (n > 1 ? `${n} ${name} accounts connected` : `${name} connected`), body: () => "You'll find it below. Refresh it any time to load the latest details." },
  reconnected: { tone: "ok", title: (name) => `${name} reconnected`, body: () => "Access is up to date again." },
  denied: { tone: "info", title: () => "Nothing was connected", body: (name) => `You cancelled on ${name}. You can try again whenever you like.` },
  expired: { tone: "error", title: () => "That sign-in link has expired", body: () => "For your security each connection link works once and only for a few minutes. Start again from this page." },
  linked_elsewhere: { tone: "error", title: () => "Already connected elsewhere", body: (name) => `This ${name} account is connected to a different SociVanta account. Disconnect it there first.` },
  no_accounts: { tone: "error", title: (name) => `${name} didn't share an account`, body: (name) => (name === "Facebook" ? "Choose at least one Page when Facebook asks." : name === "YouTube" ? "The Google account you chose doesn't have a YouTube channel." : "Make sure you sign in with the right account and allow the requested access.") },
  unavailable: { tone: "error", title: (name) => `${name} isn't available right now`, body: () => "Connections for this platform were switched off. Nothing was connected." },
  failed: { tone: "error", title: () => "Couldn't finish connecting", body: () => "Nothing was connected and no access was kept. Please try again in a moment." },
};

function OutcomeBanner() {
  const params = useSearchParams();
  const router = useRouter();
  const result = params.get("result");
  const provider = params.get("provider");
  const n = Number(params.get("count") ?? "1") || 1;
  const o = result ? OUTCOME[result] : null;
  if (!o) return null;
  const name = provider && provider in SOCIAL_PLATFORM ? SOCIAL_PLATFORM[provider as SocialProviderId].name : "The platform";
  const Icon = o.tone === "ok" ? CircleCheck : o.tone === "info" ? Info : CircleX;
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-2xl border px-4 py-3.5",
        o.tone === "ok" && "border-ok/25 bg-ok-soft",
        o.tone === "info" && "bg-muted/60",
        o.tone === "error" && "border-destructive/25 bg-destructive/[0.06]",
      )}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", o.tone === "ok" ? "text-ok" : o.tone === "error" ? "text-destructive" : "text-muted-foreground")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{o.title(name, n)}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{o.body(name)}</p>
      </div>
      <button type="button" onClick={() => router.replace(SOCIAL_ROUTES.accounts, { scroll: false })} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-background/60" aria-label="Dismiss">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Connect: choose → review permissions → authorize → connected              */
/* -------------------------------------------------------------------------- */

const STEPS = ["Choose platform", "Review permissions", "Authorize", "Connected"];

function Stepper({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Connection steps">
      {STEPS.map((s, i) => (
        <li key={s} className="min-w-0" aria-current={i === current ? "step" : undefined}>
          <span className={cn("block h-1 rounded-full", i < current ? "bg-primary" : i === current ? "bg-primary/60" : "bg-border")} aria-hidden />
          <span className={cn("mt-1.5 block truncate text-[0.68rem] font-semibold", i === current ? "text-foreground" : "text-muted-foreground")}>
            <span className="sr-only">{i < current ? "Done: " : i === current ? "Current: " : ""}</span>
            {s}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ConnectDialog({ platform, reconnect, onOpenChange }: { platform: SocialPlatform | null; reconnect: SocialAccountView | null; onOpenChange: (open: boolean) => void }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const open = platform !== null;
  // Each time the dialog opens it starts fresh.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBusy(false);
      setError(null);
    }
  }

  async function go() {
    if (!platform) return;
    setBusy(true);
    setError(null);
    const r = await socialApi<{ url: string }>(`/api/social/connect/${platform.id}`, { method: "POST", body: JSON.stringify(reconnect ? { connectionId: reconnect.id } : {}) });
    if (!r.ok) {
      setBusy(false);
      setError(r.message);
      return;
    }
    // Leave for the platform's own sign-in page. SociVanta never sees the password.
    window.location.assign(r.data.url);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-lg" showCloseButton={false}>
        {platform ? (
          <>
            <div className="border-b px-5 pt-5 pb-4 sm:px-6">
              <Stepper current={busy ? 2 : 1} />
              <div className="mt-5 flex items-center gap-3">
                <SocialTile provider={platform.id} size="md" />
                <div className="min-w-0">
                  <DialogTitle className="font-heading text-lg leading-tight font-bold">{reconnect ? `Reconnect ${reconnect.displayName}` : `Connect ${platform.name}`}</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">{platform.accountKind}</DialogDescription>
                </div>
              </div>
            </div>

            <div className="space-y-5 px-5 py-5 sm:px-6">
              <section aria-labelledby="perm-title">
                <h3 id="perm-title" className="text-sm font-bold">
                  SociVanta will ask {platform.name} for
                </h3>
                <ul className="mt-2.5 space-y-2">
                  {platform.permissions.map((p) => (
                    <li key={p.label} className="flex gap-3 rounded-2xl bg-muted/50 px-3.5 py-3">
                      <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      <div>
                        <p className="text-sm font-semibold">{p.label}</p>
                        <p className="text-[0.8rem] leading-relaxed text-muted-foreground">{p.why}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="never-title">
                <h3 id="never-title" className="text-sm font-bold">
                  SociVanta never
                </h3>
                <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 min-[420px]:grid-cols-2">
                  {platform.never.map((n) => (
                    <li key={n} className="flex items-start gap-2 text-[0.8rem] text-muted-foreground">
                      <Ban className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {n}
                    </li>
                  ))}
                </ul>
              </section>

              {platform.requirement ? (
                <p className="flex gap-2.5 rounded-2xl border border-soon/20 bg-soon-soft px-3.5 py-3 text-[0.8rem] leading-relaxed text-soon">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {platform.requirement}
                </p>
              ) : null}

              <p className="flex gap-2.5 text-[0.8rem] leading-relaxed text-muted-foreground">
                <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                You&apos;ll sign in on {platform.name}&apos;s own page — SociVanta never asks for your password. Access is stored encrypted, and you can disconnect at any time. {platform.renewal}
              </p>

              {error ? (
                <p role="alert" className="rounded-2xl bg-destructive/[0.07] px-3.5 py-3 text-sm font-medium text-destructive">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t bg-muted/40 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button type="button" className={quietButton} onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className={primaryButton} onClick={go} disabled={busy} autoFocus>
                {busy ? (
                  <>
                    <RefreshCw className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Opening {platform.name}…
                  </>
                ) : (
                  <>
                    Continue to {platform.name} <ArrowUpRight className="size-4" aria-hidden />
                  </>
                )}
              </button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Account card + details drawer                                             */
/* -------------------------------------------------------------------------- */

function AccountCard({ a, onOpen }: { a: SocialAccountView; onOpen: () => void }) {
  const p = SOCIAL_PLATFORM[a.provider];
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group flex h-full w-full flex-col rounded-3xl border bg-card p-4 text-start shadow-soft transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-[0_18px_40px_-30px_rgb(112_71_235/0.6)] focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:p-5"
      >
        <div className="flex items-start gap-3">
          <SocialTile provider={a.provider} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-[1.02rem] font-bold">{a.displayName}</p>
            <p className="truncate text-sm text-muted-foreground">{a.handle ?? p.name}</p>
          </div>
          <HealthPill health={a.health} />
        </div>
        {a.metrics.length ? (
          <dl className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-muted/50 p-3">
            {a.metrics.map((m) => (
              <div key={m.capability} className="min-w-0">
                <dt className="truncate text-[0.68rem] font-semibold text-muted-foreground">{m.label}</dt>
                <dd className="mt-0.5 truncate font-heading text-[1.05rem] font-extrabold tabular-nums">{metricValue(m.value)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-4 rounded-2xl bg-muted/50 px-3 py-2.5 text-[0.8rem] text-muted-foreground">{a.provider === "linkedin" ? "LinkedIn shares your name only." : "No figures reported yet."}</p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-[0.78rem] text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            {a.lastSyncAt ? <When iso={a.lastSyncAt} prefix="Refreshed" /> : "Not refreshed yet"}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-primary">
            Details <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
          </span>
        </div>
      </button>
    </li>
  );
}

function AccountSheet({ data, account, onClose, onReconnect, onDisconnected }: { data: SocialWorkspace; account: SocialAccountView | null; onClose: () => void; onReconnect: (a: SocialAccountView) => void; onDisconnected: (message: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"sync" | "disconnect" | null>(null);
  const [note, setNote] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  // Keep showing the last account while the drawer animates closed; a different account starts without old notes.
  const [shown, setShown] = React.useState(account);
  if (account && account !== shown) {
    if (account.id !== shown?.id) setNote(null);
    setShown(account);
  }
  const a = account ?? shown;
  if (!a) return null;
  const p = SOCIAL_PLATFORM[a.provider];
  const available = data.platforms.find((x) => x.id === a.provider)?.availability.state === "available";
  const history = data.events.filter((e) => e.accountId === a.id).slice(0, 8);
  // Decided on the server when the page loaded (the page refreshes after every action).
  const coolingDown = a.refreshAvailableAt !== null;

  async function refresh() {
    setBusy("sync");
    const r = await socialApi<{ ok: boolean; message: string }>(`/api/social/accounts/${a!.id}/sync`, { method: "POST" });
    setBusy(null);
    setNote(r.ok ? { ok: r.data.ok, text: r.data.message } : { ok: false, text: r.message });
    router.refresh();
  }
  async function disconnect() {
    setBusy("disconnect");
    const r = await socialApi<{ message: string }>(`/api/social/accounts/${a!.id}`, { method: "DELETE" });
    setBusy(null);
    if (!r.ok) {
      setNote({ ok: false, text: r.message });
      return;
    }
    // The drawer closes and the page shows exactly what happened, including whether the platform confirmed revoking access.
    onDisconnected(r.data.message);
    onClose();
    router.refresh();
  }

  return (
    <>
      <Sheet open={!!account} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[32rem]">
          <div className="relative overflow-hidden border-b bg-graphite px-5 pt-5 pb-5 text-white sm:px-6 dark:bg-[#121318]">
            <div className="pointer-events-none absolute -top-24 -end-16 size-56 rounded-full bg-primary/25 blur-3xl" aria-hidden />
            <div className="relative flex items-start gap-3">
              <SocialTile provider={a.provider} size="lg" />
              <div className="min-w-0 flex-1">
                <SheetTitle className="font-heading text-xl leading-tight font-bold text-white">{a.displayName}</SheetTitle>
                <SheetDescription className="mt-0.5 truncate text-sm text-white/60">{a.handle ? `${a.handle} · ${p.name}` : p.name}</SheetDescription>
              </div>
              <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-lime/50 focus-visible:outline-none" aria-label="Close details">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="relative mt-4 flex flex-wrap items-center gap-2">
              <HealthPill health={a.health} />
              {a.profileUrl ? (
                <a href={a.profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-6 items-center gap-1 rounded-full bg-white/10 px-2 text-[0.72rem] font-semibold text-white/80 hover:bg-white/15">
                  View on {p.name} <ExternalLink className="size-3" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : null}
            </div>
          </div>

          <div className="space-y-6 px-5 py-5 sm:px-6">
            <p className={cn("rounded-2xl px-3.5 py-3 text-sm leading-relaxed", a.health === "healthy" ? "bg-muted/50 text-muted-foreground" : a.health === "action_needed" ? "bg-destructive/[0.07] text-destructive" : "bg-soon-soft text-soon")}>{a.healthNote}</p>

            {note ? (
              <p role="status" className={cn("rounded-2xl px-3.5 py-3 text-sm font-medium", note.ok ? "bg-ok-soft text-ok" : "bg-destructive/[0.07] text-destructive")}>
                {note.text}
              </p>
            ) : null}

            <section aria-labelledby="insights-title">
              <div className="flex items-baseline justify-between gap-3">
                <h3 id="insights-title" className="font-heading text-base font-bold">
                  Account insights
                </h3>
                {a.lastSyncAt ? (
                  <span className="text-[0.75rem] text-muted-foreground">
                    <When iso={a.lastSyncAt} prefix="As of" />
                  </span>
                ) : null}
              </div>
              {a.metrics.length ? (
                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {a.metrics.map((m) => (
                    <div key={m.capability} className="rounded-2xl border p-3">
                      <dt className="text-[0.72rem] font-semibold text-muted-foreground">{m.label}</dt>
                      <dd className="mt-1 font-heading text-xl font-extrabold tabular-nums">{metricValue(m.value)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <p className="mt-2.5 text-[0.78rem] leading-relaxed text-muted-foreground">
                {a.metrics.length ? `Exactly as ${p.name} reported them at the last refresh.` : p.capabilities.length > 1 ? `Figures appear after ${p.name} reports them.` : `${p.name} shares profile details only, so there are no figures to show.`}
                {a.unavailableMetrics.length ? ` ${p.name} didn't share: ${a.unavailableMetrics.join(", ").toLowerCase()}.` : ""}
              </p>
            </section>

            <section aria-labelledby="perm-list-title">
              <h3 id="perm-list-title" className="font-heading text-base font-bold">
                Permissions
              </h3>
              <ul className="mt-2.5 space-y-1.5">
                {a.grantedPermissions.map((g) => (
                  <li key={g} className="flex items-center gap-2 text-sm">
                    <ShieldCheck className="size-4 shrink-0 text-ok" aria-hidden /> {g} <span className="text-muted-foreground">· read-only</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[0.78rem] text-muted-foreground">{p.renewal}</p>
            </section>

            <section aria-labelledby="history-title">
              <h3 id="history-title" className="font-heading text-base font-bold">
                Connection history
              </h3>
              <ol className="mt-3 space-y-3 border-s ps-4">
                {history.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute top-1.5 -start-[1.3rem] size-2 rounded-full bg-border ring-4 ring-popover" aria-hidden />
                    <p className="text-sm">{e.message}</p>
                    <p className="text-[0.75rem] text-muted-foreground">
                      <When iso={e.at} />
                    </p>
                  </li>
                ))}
                <li className="relative">
                  <span className="absolute top-1.5 -start-[1.3rem] size-2 rounded-full bg-primary ring-4 ring-popover" aria-hidden />
                  <p className="text-sm">First connected</p>
                  <p className="text-[0.75rem] text-muted-foreground">
                    <When iso={a.connectedAt} />
                  </p>
                </li>
              </ol>
            </section>
          </div>

          <div className="sticky bottom-0 mt-auto flex flex-wrap gap-2 border-t bg-popover/95 px-5 py-4 backdrop-blur sm:px-6">
            {a.status === "needs_reauth" ? (
              <button type="button" className={primaryButton} onClick={() => onReconnect(a)} disabled={!available}>
                <Link2 className="size-4" aria-hidden /> Reconnect
              </button>
            ) : (
              <button type="button" className={primaryButton} onClick={refresh} disabled={busy !== null || coolingDown || !available} aria-describedby={coolingDown || !available ? "refresh-why" : undefined}>
                <RefreshCw className={cn("size-4", busy === "sync" && "animate-spin motion-reduce:animate-none")} aria-hidden /> {busy === "sync" ? "Refreshing…" : "Refresh now"}
              </button>
            )}
            <button type="button" className={cn(quietButton, "text-destructive hover:bg-destructive/[0.06]")} onClick={() => setConfirm(true)} disabled={busy !== null}>
              <Link2Off className="size-4" aria-hidden /> Disconnect
            </button>
            {coolingDown || !available ? (
              <p id="refresh-why" className="basis-full text-[0.75rem] text-muted-foreground">
                {!available ? `${p.name} connections are switched off right now, so this account can't be refreshed.` : "Refreshed moments ago — you can refresh again in a few minutes."}
              </p>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        tone="danger"
        icon={Link2Off}
        title={`Disconnect ${a.displayName}?`}
        description={
          p.revokeOnDisconnect
            ? `SociVanta will delete its stored access and ask ${p.name} to remove SociVanta's permission. Nothing on your ${p.name} account changes.`
            : `SociVanta will delete its stored access. ${p.name} doesn't let apps remove their own permission, so you'll also be shown how to remove it in ${p.name}. Nothing on your account changes.`
        }
        confirmLabel="Disconnect"
        onConfirm={disconnect}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Platform directory                                                        */
/* -------------------------------------------------------------------------- */

function PlatformCard({ platform, data, onConnect, sharedReasonId }: { platform: SocialPlatform; data: SocialWorkspace; onConnect: () => void; sharedReasonId: string | null }) {
  const availability = data.platforms.find((x) => x.id === platform.id)!.availability;
  const connected = data.accounts.filter((a) => a.provider === platform.id).length;
  const reasonId = `why-${platform.id}`;
  return (
    <li className="flex flex-col rounded-3xl border bg-card p-4 shadow-soft sm:p-5">
      <div className="flex items-center gap-3">
        <SocialTile provider={platform.id} size="md" />
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-[1.02rem] font-bold">{platform.name}</h3>
          <p className="truncate text-[0.8rem] text-muted-foreground">{platform.accountKind}</p>
        </div>
        {connected ? <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.7rem] font-bold text-secondary-foreground">{connected} connected</span> : null}
      </div>
      <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={`What ${platform.name} shares`}>
        {platform.capabilities.map((c) => (
          <li key={c} className="rounded-full border px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
            {c === "audience" ? platform.nouns.audience : c === "content-count" ? platform.nouns.content : CAPABILITY_LABEL[c]}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-4">
        {availability.state === "available" ? (
          <button type="button" className={cn(primaryButton, "w-full")} onClick={onConnect}>
            <Link2 className="size-4" aria-hidden /> {connected ? `Connect another ${platform.name} account` : `Connect ${platform.name}`}
          </button>
        ) : (
          <>
            <button type="button" className={cn(quietButton, "w-full")} disabled aria-describedby={sharedReasonId ?? reasonId}>
              <Lock className="size-4" aria-hidden /> Not available yet
            </button>
            {/* When no platform is on, one shared explanation above covers every card (no wall of repeated text on mobile). */}
            {sharedReasonId ? null : (
              <p id={reasonId} className="mt-2 text-[0.75rem] leading-relaxed text-muted-foreground">
                {availability.reason}
              </p>
            )}
          </>
        )}
      </div>
    </li>
  );
}

export function SocialAccounts({ data }: { data: SocialWorkspace }) {
  const router = useRouter();
  const params = useSearchParams();
  const [connecting, setConnecting] = React.useState<{ platform: SocialPlatform; reconnect: SocialAccountView | null } | null>(null);
  const openId = params.get("account");
  const open = openId ? (data.accounts.find((a) => a.id === openId) ?? null) : null;
  const setOpen = (id: string | null) => {
    const q = new URLSearchParams(params);
    q.delete("result");
    q.delete("provider");
    q.delete("count");
    if (id) q.set("account", id);
    else q.delete("account");
    router.replace(`${SOCIAL_ROUTES.accounts}${q.size ? `?${q}` : ""}`, { scroll: false });
  };
  const anyAvailable = data.platforms.some((p) => p.availability.state === "available");
  const [disconnected, setDisconnected] = React.useState<string | null>(null);

  return (
    <div className={page}>
      <SocialHeader title="My social accounts" subtitle="Connect the accounts you manage, see what each one shares, and disconnect any time. Read-only — SociVanta never posts for you." />

      <div className="mt-6 space-y-8">
        <OutcomeBanner />
        {disconnected ? (
          <div role="status" className="flex items-start gap-3 rounded-2xl border bg-muted/60 px-4 py-3.5">
            <Link2Off className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <p className="min-w-0 flex-1 text-sm leading-relaxed">{disconnected}</p>
            <button type="button" onClick={() => setDisconnected(null)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-background/60" aria-label="Dismiss">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}

        {data.accounts.length ? (
          <section aria-labelledby="connected-title">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="connected-title" className="font-heading text-lg font-bold">
                Connected
              </h2>
              <span className="text-sm text-muted-foreground">
                {data.accounts.length} account{data.accounts.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.accounts.map((a) => (
                <AccountCard key={a.id} a={a} onOpen={() => setOpen(a.id)} />
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="platforms-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="platforms-title" className="font-heading text-lg font-bold">
                {data.accounts.length ? "Add another platform" : "Choose a platform"}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">You sign in on the platform itself. SociVanta only ever asks for read-only access.</p>
            </div>
          </div>
          {!anyAvailable ? (
            <Panel className="mt-3 flex items-start gap-3 bg-subtle/60 p-4 shadow-none sm:p-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-card text-primary ring-1 ring-border">
                <Clock className="size-4" aria-hidden />
              </span>
              <div className="text-sm" id="platforms-off">
                <p className="font-semibold">Connections open platform by platform</p>
                <p className="mt-0.5 leading-relaxed text-muted-foreground">Each platform has to review and approve SociVanta before accounts can be linked. None are switched on yet, so there&apos;s nothing to set up today — every platform below shows exactly where it stands.</p>
              </div>
            </Panel>
          ) : null}
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SOCIAL_PLATFORMS.map((p) => (
              <PlatformCard key={p.id} platform={p} data={data} onConnect={() => setConnecting({ platform: p, reconnect: null })} sharedReasonId={anyAvailable ? null : "platforms-off"} />
            ))}
          </ul>
        </section>

        <section aria-labelledby="later-title" className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <h2 id="later-title" className="sr-only">
            Other platforms
          </h2>
          <Panel className="p-4 shadow-none sm:p-5">
            <p className={cn(eyebrow, "text-muted-foreground")}>Planned</p>
            <ul className="mt-3 space-y-2.5">
              {SOCIAL_PLANNED.map((p) => (
                <li key={p.name} className="flex items-start gap-3 text-sm">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground/70">{p.icon ? <PlatformIcon icon={p.icon} className="size-4" /> : <span className="text-[0.8rem] font-bold">@</span>}</span>
                  <span>
                    <span className="font-semibold">{p.name}</span>
                    <span className="block text-[0.8rem] text-muted-foreground">{p.note}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel className="p-4 shadow-none sm:p-5">
            <p className={cn(eyebrow, "text-muted-foreground")}>Not supported</p>
            <ul className="mt-3 space-y-2.5">
              {SOCIAL_UNSUPPORTED.map((p) => (
                <li key={p.name} className="flex items-start gap-3 text-sm">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground/50">
                    <PlatformIcon icon={p.icon} className="size-4" />
                  </span>
                  <span>
                    <span className="font-semibold">{p.name}</span>
                    <span className="block text-[0.8rem] text-muted-foreground">{p.note}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </section>
      </div>

      <ConnectDialog platform={connecting?.platform ?? null} reconnect={connecting?.reconnect ?? null} onOpenChange={(o) => !o && setConnecting(null)} />
      <AccountSheet
        data={data}
        account={open}
        onClose={() => setOpen(null)}
        onDisconnected={setDisconnected}
        onReconnect={(a) => {
          setOpen(null);
          setConnecting({ platform: SOCIAL_PLATFORM[a.provider], reconnect: a });
        }}
      />
    </div>
  );
}
