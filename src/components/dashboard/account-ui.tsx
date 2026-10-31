"use client";

import * as React from "react";
import { Check, Clock3, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Accessible on/off switch. Changes apply instantly, so there's no Save button. */
export function Switch({
  checked,
  onChange,
  label,
  describedBy,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  describedBy?: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none motion-reduce:transition-none",
        checked ? "bg-primary" : "bg-foreground/15",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none",
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
        )}
        aria-hidden
      />
    </button>
  );
}

/** A titled settings group. Groups are separated by rules rather than boxed in their own cards. */
export function Section({
  id,
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-28 py-7 first:pt-0 last:pb-0", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground" aria-hidden>
              <Icon className="size-4" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-base font-bold sm:text-[1.05rem]">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** One setting: label and help on the left, control on the right. Wide controls stack below on phones. */
export function SettingRow({
  title,
  description,
  descriptionId,
  badge,
  inline,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  descriptionId?: string;
  badge?: React.ReactNode;
  /** Keep the control beside the label at every size (switches). */
  inline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex py-4 first:pt-0 last:pb-0",
        inline ? "items-center justify-between gap-4 sm:gap-6" : "flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
      )}
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {title}
          {badge}
        </p>
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-[0.8rem] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Marks features that need a real account backend. */
export function PendingBadge({ children = t("common.needsSignIn") }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-full bg-muted px-2 text-[0.65rem] font-bold whitespace-nowrap text-muted-foreground">
      <Clock3 className="size-3" aria-hidden />
      {children}
    </span>
  );
}

export function SavedNote({ show }: { show: boolean }) {
  return (
    <span role="status" className="inline-flex h-6 items-center text-xs font-semibold text-ok">
      {show ? (
        <span className="inline-flex items-center gap-1 animate-in fade-in motion-reduce:animate-none">
          <Check className="size-3.5" aria-hidden /> {t("common.saved")}
        </span>
      ) : null}
    </span>
  );
}

/** Briefly shows "Saved" after an instant change. */
export function useSavedFlash() {
  const [shown, setShown] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const flash = React.useCallback(() => {
    setShown(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(false), 2200);
  }, []);
  return [shown, flash] as const;
}

/** Accessible confirmation or information dialog. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  onConfirm,
  cancelLabel = t("common.cancel"),
  tone = "default",
  icon: Icon,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
  /** Omit for information-only dialogs. */
  confirmLabel?: string;
  onConfirm?: () => void;
  cancelLabel?: string;
  tone?: "default" | "danger";
  icon?: LucideIcon;
}) {
  // These dialogs open from ordinary buttons rather than a Dialog.Trigger, so return focus to the opener ourselves.
  const [opener, setOpener] = React.useState<HTMLElement | null>(null);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && typeof document !== "undefined") setOpener(document.activeElement as HTMLElement | null);
  }
  React.useEffect(() => {
    if (open || !opener) return;
    const id = setTimeout(() => opener.focus({ preventScroll: true }), 0);
    return () => clearTimeout(id);
  }, [open, opener]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <div className="p-6 pb-5">
          {Icon ? (
            <span
              className={cn(
                "mb-4 grid size-11 place-items-center rounded-2xl",
                tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground",
              )}
              aria-hidden
            >
              <Icon className="size-5" />
            </span>
          ) : null}
          <DialogTitle className="font-heading text-lg font-bold">{title}</DialogTitle>
          <DialogDescription className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</DialogDescription>
          {children ? <div className="mt-4">{children}</div> : null}
        </div>
        <div className="flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/40 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            autoFocus={tone === "danger" || !onConfirm}
            className="inline-flex h-10 items-center justify-center rounded-full border bg-card px-4 text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            {onConfirm ? cancelLabel : t("common.close")}
          </button>
          {onConfirm && confirmLabel ? (
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
              className={cn(
                "inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:outline-none",
                tone === "danger"
                  ? "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary/35",
              )}
            >
              {confirmLabel}
            </button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
