"use client";

import * as React from "react";
import { KeyRound, Laptop, LogOut, MonitorSmartphone, ShieldCheck, Smartphone } from "lucide-react";
import { changePasswordAction, revokeOtherSessionsAction, revokeSessionAction, signOutEverywhereAction, staffReauthAction } from "@/app/actions/account";
import { cn } from "@/lib/utils";
import { AuthField, AuthInput, type AuthState, fieldAria, FormAlert, PasswordInput, SubmitButton } from "./fields";
import { RecoveryCodes } from "./staff-forms";

/** Sign-in & security panels shared by the customer dashboard and the admin panel. */

export interface SessionRow {
  id: string;
  current: boolean;
  device: string;
  lastSeen: string;
  started: string;
}

const card = "rounded-2xl border bg-card shadow-[0_1px_2px_rgb(15_16_20/0.04)]";
const secondary =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border bg-card px-3.5 text-[0.85rem] font-semibold transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:opacity-50";

function Panel({ id, title, description, icon: Icon, children }: { id: string; title: string; description: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={card}>
      <div className="flex items-start gap-3 border-b px-4 py-4 sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary" aria-hidden>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 id={id} className="text-[0.95rem] font-bold">
            {title}
          </h2>
          <p className="text-[0.8rem] text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

export function SessionsPanel({ kind, sessions }: { kind: "customer" | "staff"; sessions: SessionRow[] }) {
  const [state, revoke] = React.useActionState(revokeSessionAction, {} as AuthState);
  const [others, revokeOthers] = React.useActionState(revokeOtherSessionsAction, {} as AuthState);
  return (
    <Panel id="sec-sessions" title="Where you're signed in" description="Sign out anything you don't recognise." icon={MonitorSmartphone}>
      <div className="space-y-3">
        <FormAlert state={state.error || state.message ? state : others} />
        <ul className="divide-y rounded-xl border">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
              {/mobile|iphone|android/i.test(s.device) ? <Smartphone className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <Laptop className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {s.device}
                  {s.current ? <span className="ms-2 rounded-full bg-ok-soft px-2 py-0.5 text-[0.68rem] font-bold text-ok dark:bg-ok-soft/20">This device</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  Active {s.lastSeen} · signed in {s.started}
                </p>
              </div>
              {!s.current ? (
                <form action={revoke}>
                  <input type="hidden" name="kind" value={kind} />
                  <input type="hidden" name="sessionId" value={s.id} />
                  <button type="submit" className={secondary}>
                    Sign out
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {sessions.length > 1 ? (
            <form action={revokeOthers}>
              <input type="hidden" name="kind" value={kind} />
              <button type="submit" className={secondary}>
                Sign out other sessions
              </button>
            </form>
          ) : null}
          <form action={signOutEverywhereAction}>
            <input type="hidden" name="kind" value={kind} />
            <button type="submit" className={cn(secondary, "text-destructive hover:bg-destructive/10")}>
              <LogOut className="size-3.5" aria-hidden /> Sign out everywhere
            </button>
          </form>
        </div>
      </div>
    </Panel>
  );
}

export function PasswordPanel({ kind }: { kind: "customer" | "staff" }) {
  // React resets the uncontrolled fields after each submission.
  const [state, action] = React.useActionState(changePasswordAction, {} as AuthState);
  return (
    <Panel id="sec-password" title="Password" description="Changing it signs out your other sessions." icon={KeyRound}>
      <form action={action} noValidate className="max-w-md space-y-4">
        <FormAlert state={state} />
        <input type="hidden" name="kind" value={kind} />
        <AuthField id="currentPassword" label="Current password" error={state.fieldErrors?.currentPassword}>
          <PasswordInput {...fieldAria("currentPassword", state.fieldErrors?.currentPassword)} autoComplete="current-password" required />
        </AuthField>
        <AuthField id="newPassword" label="New password" error={state.fieldErrors?.newPassword} help="At least 10 characters.">
          <PasswordInput {...fieldAria("newPassword", state.fieldErrors?.newPassword, true)} autoComplete="new-password" required minLength={10} />
        </AuthField>
        <AuthField id="confirmPassword" label="Confirm new password" error={state.fieldErrors?.confirmPassword}>
          <PasswordInput {...fieldAria("confirmPassword", state.fieldErrors?.confirmPassword)} autoComplete="new-password" required />
        </AuthField>
        <SubmitButton pendingLabel="Saving…" className="w-auto">
          Change password
        </SubmitButton>
      </form>
    </Panel>
  );
}

export function TwoStepPanel({ remaining, low }: { remaining: number; low?: boolean }) {
  const [state, action] = React.useActionState(staffReauthAction, {} as AuthState);
  const [open, setOpen] = React.useState(Boolean(low));
  return (
    <Panel id="sec-mfa" title="Two-step verification" description="Required for every staff account." icon={ShieldCheck}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-ok-soft px-2.5 text-[0.72rem] font-bold text-ok dark:bg-ok-soft/20">
            <ShieldCheck className="size-3" aria-hidden /> Authenticator app on
          </span>
          <span className={cn("text-muted-foreground", remaining <= 3 && "font-semibold text-soon")}>{remaining} of 10 recovery codes left</span>
        </div>
        {state.done && Array.isArray(state.data?.codes) ? (
          <RecoveryCodes codes={state.data.codes as string[]} />
        ) : open ? (
          <form action={action} noValidate className="max-w-md space-y-4 rounded-xl bg-muted/40 p-4">
            <p className="text-sm font-semibold">Confirm it&apos;s you to create new recovery codes</p>
            <p className="text-xs text-muted-foreground">Your old codes stop working immediately.</p>
            <FormAlert state={{ error: state.error }} />
            <AuthField id="password" label="Password" error={state.fieldErrors?.password}>
              <PasswordInput {...fieldAria("password", state.fieldErrors?.password)} autoComplete="current-password" required />
            </AuthField>
            <AuthField id="code" label="Authenticator code" error={state.fieldErrors?.code}>
              <AuthInput {...fieldAria("code", state.fieldErrors?.code)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} required className="font-mono tracking-[0.3em]" />
            </AuthField>
            <div className="flex gap-2">
              <SubmitButton pendingLabel="Checking…" className="w-auto">
                Create new codes
              </SubmitButton>
              <button type="button" className={secondary + " h-11"} onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className={secondary} onClick={() => setOpen(true)}>
            Generate new recovery codes
          </button>
        )}
      </div>
    </Panel>
  );
}
