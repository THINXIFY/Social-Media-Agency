"use client";

import * as React from "react";
import Link from "next/link";
import { Gift, KeyRound, MailCheck, MailOpen } from "lucide-react";
import { forgotPasswordAction, loginAction, registerAction, resendVerificationAction, resetPasswordAction, verifyEmailAction } from "@/app/(auth)/actions";
import { AuthField, AuthFooter, AuthInput, type AuthState, fieldAria, FormAlert, ghostButton, PasswordInput, SubmitButton, SuccessPanel, textLink } from "./fields";

const initial: AuthState = {};

/** Moves focus to the first invalid field after a failed submit. */
function useFocusFirstError(state: AuthState, form: React.RefObject<HTMLFormElement | null>) {
  React.useEffect(() => {
    const first = state.fieldErrors && Object.keys(state.fieldErrors)[0];
    if (first) form.current?.querySelector<HTMLElement>(`#${first}`)?.focus();
  }, [state, form]);
}

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = React.useActionState(loginAction, initial);
  const form = React.useRef<HTMLFormElement>(null);
  useFocusFirstError(state, form);
  return (
    <form ref={form} action={action} noValidate className="space-y-5">
      {notice && !state.error ? <FormAlert state={{ message: notice }} /> : null}
      <FormAlert state={{ error: state.error }} />
      <input type="hidden" name="next" value={next ?? ""} />
      <AuthField id="email" label="Email" error={state.fieldErrors?.email}>
        <AuthInput {...fieldAria("email", state.fieldErrors?.email)} type="email" autoComplete="email" inputMode="email" required defaultValue={state.email} autoFocus />
      </AuthField>
      <AuthField
        id="password"
        label="Password"
        error={state.fieldErrors?.password}
        aside={
          <Link href="/forgot-password" className={`${textLink} text-xs`}>
            Forgot password?
          </Link>
        }
      >
        <PasswordInput {...fieldAria("password", state.fieldErrors?.password)} autoComplete="current-password" required />
      </AuthField>
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
      <AuthFooter>
        New to Sociotix?{" "}
        <Link href="/register" className={textLink}>
          Create an account
        </Link>
      </AuthFooter>
    </form>
  );
}

export function RegisterForm({ referral = null }: { referral?: string | null }) {
  const [state, action] = React.useActionState(registerAction, initial);
  const [fromLink, setFromLink] = React.useState(Boolean(referral));
  const form = React.useRef<HTMLFormElement>(null);
  useFocusFirstError(state, form);
  if (state.done)
    return (
      <SuccessPanel
        icon={MailCheck}
        title="Check your email"
        action={
          <Link href="/login" className={ghostButton}>
            Back to sign in
          </Link>
        }
      >
        We&apos;ve sent a confirmation link to <span className="font-semibold text-foreground">{state.email}</span>. Open it to activate your account. The link expires in 24 hours.
      </SuccessPanel>
    );
  return (
    <form ref={form} action={action} noValidate className="space-y-5">
      <FormAlert state={{ error: state.error }} />
      <AuthField id="name" label="Full name" error={state.fieldErrors?.name}>
        <AuthInput {...fieldAria("name", state.fieldErrors?.name)} autoComplete="name" required maxLength={80} defaultValue={String(state.data?.name ?? "")} autoFocus />
      </AuthField>
      <AuthField id="email" label="Email" error={state.fieldErrors?.email}>
        <AuthInput {...fieldAria("email", state.fieldErrors?.email)} type="email" autoComplete="email" inputMode="email" required defaultValue={state.email} />
      </AuthField>
      <AuthField id="password" label="Password" error={state.fieldErrors?.password} help="At least 10 characters. A short phrase works well.">
        <PasswordInput {...fieldAria("password", state.fieldErrors?.password, true)} autoComplete="new-password" required minLength={10} maxLength={128} />
      </AuthField>
      {fromLink && referral ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/[0.05] px-3.5 py-2.5 text-sm dark:bg-primary/15">
          <input type="hidden" name="ref" value={referral} />
          <input type="hidden" name="refVia" value="link" />
          <span className="min-w-0">
            <Gift className="mr-1.5 inline size-4 -translate-y-px text-primary" aria-hidden />
            Joining with referral code <span className="font-mono font-semibold">{referral}</span>
          </span>
          <button
            type="button"
            onClick={() => setFromLink(false)}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[0.8rem] font-semibold text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            Remove
          </button>
        </div>
      ) : (
        <details className="rounded-xl border px-3.5 py-2.5 text-sm open:pb-3.5" open={Boolean(state.data?.ref)}>
          <summary className="cursor-pointer font-medium text-muted-foreground select-none hover:text-foreground">Have a referral code? (optional)</summary>
          <div className="mt-3">
            <input type="hidden" name="refVia" value="code" />
            <AuthField id="ref" label="Referral code" help="From a friend who uses Sociotix, e.g. SV-7K2M9QXA.">
              <AuthInput {...fieldAria("ref", undefined, true)} autoComplete="off" spellCheck={false} maxLength={32} className="font-mono uppercase" defaultValue={String(state.data?.ref ?? "")} />
            </AuthField>
          </div>
        </details>
      )}
      <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>
      <p className="text-center text-[0.8rem] leading-relaxed text-muted-foreground">Creating an account doesn&apos;t add funds, place orders or charge you anything.</p>
      <AuthFooter>
        Already have an account?{" "}
        <Link href="/login" className={textLink}>
          Sign in
        </Link>
      </AuthFooter>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = React.useActionState(forgotPasswordAction, initial);
  if (state.done)
    return (
      <SuccessPanel
        icon={MailOpen}
        title="Check your email"
        action={
          <Link href="/login" className={ghostButton}>
            Back to sign in
          </Link>
        }
      >
        If an account exists for <span className="font-semibold text-foreground">{state.email}</span>, you&apos;ll receive a link to reset your password. It expires in 1 hour.
      </SuccessPanel>
    );
  return (
    <form action={action} noValidate className="space-y-5">
      <FormAlert state={{ error: state.error }} />
      <AuthField id="email" label="Email" error={state.fieldErrors?.email}>
        <AuthInput {...fieldAria("email", state.fieldErrors?.email)} type="email" autoComplete="email" inputMode="email" required defaultValue={state.email} autoFocus />
      </AuthField>
      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
      <AuthFooter>
        Remembered it?{" "}
        <Link href="/login" className={textLink}>
          Sign in
        </Link>
      </AuthFooter>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = React.useActionState(resetPasswordAction, initial);
  const form = React.useRef<HTMLFormElement>(null);
  useFocusFirstError(state, form);
  return (
    <form ref={form} action={action} noValidate className="space-y-5">
      <FormAlert state={{ error: state.error }} />
      <input type="hidden" name="token" value={token} />
      <AuthField id="password" label="New password" error={state.fieldErrors?.password} help="At least 10 characters.">
        <PasswordInput {...fieldAria("password", state.fieldErrors?.password, true)} autoComplete="new-password" required minLength={10} maxLength={128} autoFocus />
      </AuthField>
      <AuthField id="confirm" label="Confirm new password" error={state.fieldErrors?.confirm}>
        <PasswordInput {...fieldAria("confirm", state.fieldErrors?.confirm)} autoComplete="new-password" required />
      </AuthField>
      <SubmitButton pendingLabel="Saving…">Set new password</SubmitButton>
    </form>
  );
}

export function VerifyEmailConfirm({ token }: { token: string }) {
  const [state, action] = React.useActionState(verifyEmailAction, initial);
  return (
    <form action={action} className="space-y-5">
      <FormAlert state={{ error: state.error }} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingLabel="Confirming…">Confirm my email</SubmitButton>
      {state.error ? (
        <Link href="/login" className={ghostButton}>
          Go to sign in
        </Link>
      ) : null}
    </form>
  );
}

export function ResendVerificationForm({ email }: { email?: string }) {
  const [state, action] = React.useActionState(resendVerificationAction, initial);
  return (
    <form action={action} noValidate className="space-y-5">
      <FormAlert state={state} />
      <AuthField id="email" label="Email" error={state.fieldErrors?.email}>
        <AuthInput {...fieldAria("email", state.fieldErrors?.email)} type="email" autoComplete="email" inputMode="email" required defaultValue={state.email ?? email} />
      </AuthField>
      <SubmitButton pendingLabel="Sending…">
        <KeyRound className="size-4" aria-hidden /> Send a new link
      </SubmitButton>
    </form>
  );
}
