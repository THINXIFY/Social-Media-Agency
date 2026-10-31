"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, CircleCheck, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Result shape every auth server action returns. */
export interface AuthState {
  error?: string;
  fieldErrors?: Record<string, string>;
  done?: boolean;
  message?: string;
  email?: string;
  data?: Record<string, unknown>;
}

/** Inputs: 48px tall, calm borders, a clear violet focus ring and an unmistakable error state. */
const authInput =
  "h-12 w-full rounded-xl border border-input bg-background px-4 text-[0.95rem] text-foreground shadow-[0_1px_1px_rgb(15_16_20/0.03)] transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-muted-foreground/60 hover:border-foreground/25 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive/70 aria-invalid:focus-visible:ring-destructive/15 motion-reduce:transition-none dark:bg-white/[0.03] dark:hover:border-white/25";

export function AuthField({
  id,
  label,
  error,
  help,
  aside,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  help?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[0.875rem] font-semibold text-foreground/90">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 flex items-start gap-1.5 text-[0.8rem] font-medium text-destructive">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="mt-2 text-[0.8rem] leading-relaxed text-muted-foreground">
          {help}
        </p>
      ) : null}
    </div>
  );
}

export const fieldAria = (id: string, error?: string, help?: unknown) => ({
  id,
  name: id,
  "aria-invalid": error ? true : undefined,
  "aria-describedby": error ? `${id}-error` : help ? `${id}-help` : undefined,
});

export function AuthInput({ className, ...props }: React.ComponentProps<"input">) {
  return <input {...props} className={cn(authInput, className)} />;
}

export function PasswordInput({ className, ...props }: React.ComponentProps<"input">) {
  const [shown, setShown] = React.useState(false);
  return (
    <div className="relative">
      <AuthInput {...props} type={shown ? "text" : "password"} className={cn("pe-14", className)} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute end-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none motion-reduce:transition-none"
      >
        {shown ? <EyeOff className="size-[1.1rem]" aria-hidden /> : <Eye className="size-[1.1rem]" aria-hidden />}
      </button>
    </div>
  );
}

export function SubmitButton({ children, pendingLabel, className }: { children: React.ReactNode; pendingLabel: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={cn(
        "relative inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[0.95rem] font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_10px_24px_-12px_var(--color-primary)] transition-[background-color,transform,box-shadow] duration-150 hover:bg-primary/92 active:translate-y-px focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:outline-none disabled:cursor-wait disabled:opacity-85 motion-reduce:transition-none motion-reduce:active:translate-y-0",
        className,
      )}
    >
      {pending ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormAlert({ state }: { state: AuthState }) {
  if (state.error)
    return (
      <p role="alert" className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3 text-[0.875rem] leading-snug text-destructive">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="flex items-start gap-2.5 rounded-xl border border-ok/20 bg-ok-soft/60 px-4 py-3 text-[0.875rem] leading-snug text-ok dark:bg-ok-soft/15">
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        {state.message}
      </p>
    );
  return null;
}

export function SuccessPanel({ icon: Icon, title, children, action }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => ref.current?.focus(), []);
  return (
    <div ref={ref} tabIndex={-1} role="status" className="text-center focus:outline-none">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20" aria-hidden>
        <Icon className="size-6" />
      </span>
      <h1 className="mt-6 font-heading text-[1.75rem] leading-tight font-extrabold tracking-[-0.02em]">{title}</h1>
      <div className="mt-2.5 text-[0.95rem] leading-relaxed text-muted-foreground">{children}</div>
      {action ? <div className="mt-8">{action}</div> : null}
    </div>
  );
}

/** Secondary actions under a form, separated by a hairline. */
export function AuthFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 border-t pt-6 text-center text-[0.9rem] text-muted-foreground">{children}</div>;
}

export const textLink = "font-semibold text-primary underline-offset-4 hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none";
export const ghostButton =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border bg-background px-5 text-[0.95rem] font-semibold transition-colors hover:bg-muted focus-visible:ring-4 focus-visible:ring-primary/25 focus-visible:outline-none motion-reduce:transition-none dark:bg-white/[0.03]";
