"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Copy, Download, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { confirmEnrollmentAction, staffLoginAction, staffSetupAction, verifyMfaAction } from "@/app/admin/(access)/actions";
import { cn } from "@/lib/utils";
import { AuthField, AuthInput, type AuthState, fieldAria, FormAlert, ghostButton, PasswordInput, SubmitButton, textLink } from "./fields";

const initial: AuthState = {};

export function StaffLoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = React.useActionState(staffLoginAction, initial);
  return (
    <form action={action} noValidate className="space-y-5">
      {notice && !state.error ? <FormAlert state={{ message: notice }} /> : null}
      <FormAlert state={{ error: state.error }} />
      <input type="hidden" name="next" value={next ?? ""} />
      <AuthField id="email" label="Work email">
        <AuthInput {...fieldAria("email")} type="email" autoComplete="username" inputMode="email" required defaultValue={state.email} autoFocus />
      </AuthField>
      <AuthField id="password" label="Password">
        <PasswordInput {...fieldAria("password")} autoComplete="current-password" required />
      </AuthField>
      <SubmitButton pendingLabel="Checking…">Continue</SubmitButton>
      
    </form>
  );
}

export function StaffSetupForm({ token }: { token: string }) {
  const [state, action] = React.useActionState(staffSetupAction, initial);
  return (
    <form action={action} noValidate className="space-y-5">
      <FormAlert state={{ error: state.error }} />
      <input type="hidden" name="token" value={token} />
      <AuthField id="password" label="Choose a password" error={state.fieldErrors?.password} help="At least 10 characters. Use a password manager.">
        <PasswordInput {...fieldAria("password", state.fieldErrors?.password, true)} autoComplete="new-password" required minLength={10} autoFocus />
      </AuthField>
      <AuthField id="confirm" label="Confirm password" error={state.fieldErrors?.confirm}>
        <PasswordInput {...fieldAria("confirm", state.fieldErrors?.confirm)} autoComplete="new-password" required />
      </AuthField>
      <SubmitButton pendingLabel="Saving…">Continue to authenticator setup</SubmitButton>
    </form>
  );
}

function CodeInput({ error }: { error?: string }) {
  return (
    <AuthField id="code" label="6-digit code" error={error}>
      <AuthInput {...fieldAria("code", error)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} placeholder="123 456" required autoFocus className="text-center font-mono text-lg tracking-[0.35em]" />
    </AuthField>
  );
}

export function MfaEnrollForm({ qr, secret, completed }: { qr: string; secret: string; completed?: boolean }) {
  const [state, action] = React.useActionState(confirmEnrollmentAction, initial);
  const [showKey, setShowKey] = React.useState(false);
  if (state.done && Array.isArray(state.data?.codes)) return <RecoveryCodes codes={state.data.codes as string[]} continueHref="/admin" />;
  if (completed)
    return (
      <Link href="/admin" className={ghostButton}>
        Continue to admin
      </Link>
    );
  return (
    <div className="space-y-6">
      <ol className="space-y-5 text-sm">
        <li className="flex gap-3">
          <Step n={1} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Scan this code with your authenticator app</p>
            <p className="text-xs text-muted-foreground">Google Authenticator, 1Password, Authy or Microsoft Authenticator.</p>
            <div className="mt-3 inline-block rounded-2xl border bg-white p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL, never cached or stored */}
              <img src={qr} alt="QR code for your authenticator app" width={176} height={176} className="size-44" />
            </div>
            <button type="button" onClick={() => setShowKey((v) => !v)} className={cn(textLink, "mt-2 block text-xs")} aria-expanded={showKey}>
              {showKey ? "Hide setup key" : "Can't scan? Enter a setup key"}
            </button>
            {showKey ? (
              <p className="mt-2 rounded-lg bg-muted px-3 py-2 font-mono text-xs break-all select-all" aria-label="Setup key">
                {secret.match(/.{1,4}/g)?.join(" ")}
              </p>
            ) : null}
          </div>
        </li>
        <li className="flex gap-3">
          <Step n={2} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Enter the code it shows</p>
            <form action={action} noValidate className="mt-3 space-y-4">
              <FormAlert state={{ error: state.error }} />
              <CodeInput error={state.fieldErrors?.code} />
              <SubmitButton pendingLabel="Verifying…">Turn on two-step verification</SubmitButton>
            </form>
          </div>
        </li>
      </ol>
    </div>
  );
}

const Step = ({ n }: { n: number }) => (
  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-primary" aria-hidden>
    {n}
  </span>
);

export function MfaVerifyForm({ next }: { next?: string }) {
  const [state, action] = React.useActionState(verifyMfaAction, initial);
  const [mode, setMode] = React.useState<"code" | "recovery">("code");
  return (
    <form action={action} noValidate className="space-y-5">
      <FormAlert state={{ error: state.error }} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="next" value={next ?? ""} />
      {mode === "code" ? (
        <CodeInput error={state.fieldErrors?.code} />
      ) : (
        <AuthField id="recoveryCode" label="Recovery code" error={state.fieldErrors?.recoveryCode} help="Each recovery code works once.">
          <AuthInput {...fieldAria("recoveryCode", state.fieldErrors?.recoveryCode, true)} autoComplete="off" spellCheck={false} placeholder="XXXXX-XXXXX" required autoFocus className="font-mono tracking-wider uppercase" />
        </AuthField>
      )}
      <SubmitButton pendingLabel="Verifying…">Verify</SubmitButton>
      <button type="button" onClick={() => setMode((m) => (m === "code" ? "recovery" : "code"))} className={cn(textLink, "mx-auto flex items-center gap-1.5 text-sm")}>
        {mode === "code" ? <KeyRound className="size-3.5" aria-hidden /> : <Smartphone className="size-3.5" aria-hidden />}
        {mode === "code" ? "Use a recovery code instead" : "Use my authenticator app"}
      </button>
    </form>
  );
}

export function RecoveryCodes({ codes, continueHref }: { codes: string[]; continueHref?: string }) {
  const [saved, setSaved] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => ref.current?.focus(), []);
  const text = `Sociotix admin recovery codes\nEach code works once.\n\n${codes.join("\n")}\n`;
  return (
    <div ref={ref} tabIndex={-1} className="space-y-5 focus:outline-none" role="status">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-ok-soft text-ok dark:bg-ok-soft/20" aria-hidden>
          <ShieldCheck className="size-5" />
        </span>
        <div>
          <p className="font-heading text-lg font-extrabold">Save your recovery codes</p>
          <p className="text-sm text-muted-foreground">Use one if you lose your phone. They won&apos;t be shown again.</p>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-2 rounded-2xl border bg-muted/30 p-4 font-mono text-sm" aria-label="Recovery codes">
        {codes.map((c) => (
          <li key={c} className="rounded-lg bg-card px-2.5 py-1.5 text-center tracking-wider select-all">
            {c}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={ghostButton}
          onClick={() => {
            void navigator.clipboard?.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          className={ghostButton}
          onClick={() => {
            const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            const a = Object.assign(document.createElement("a"), { href: url, download: "sociotix-recovery-codes.txt" });
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 0);
          }}
        >
          <Download className="size-4" aria-hidden /> Download
        </button>
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
        I&apos;ve stored these codes somewhere safe.
      </label>
      {continueHref ? (
        <Link
          href={saved ? continueHref : "#"}
          aria-disabled={!saved}
          onClick={(e) => !saved && e.preventDefault()}
          className={cn(
            "inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none",
            !saved && "pointer-events-auto cursor-not-allowed opacity-50",
          )}
        >
          Continue to admin
        </Link>
      ) : null}
    </div>
  );
}
