"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Info } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  CURRENCIES,
  currencyName,
  ENABLED_LANGUAGES,
  DEMO_FX,
  formatDate,
  formatPrice,
  isConverted,
  LANGUAGES,
  saveDisplay,
  t,
  useDisplay,
} from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ROUTES } from "./shared";

/* Language and currency controls shared by Settings and the account menu. */

/** The language choice only appears when more than one language is enabled. */
export const offersLanguages = () => ENABLED_LANGUAGES.length > 1;

const option =
  "relative flex cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3 transition-[border-color,box-shadow,background-color] select-none hover:border-foreground/25 has-focus-visible:ring-3 has-focus-visible:ring-primary/25";
const optionOn = "border-primary bg-secondary/40 shadow-[0_0_0_1px_var(--color-primary)] hover:border-primary dark:bg-secondary/20";

function Tick({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "ms-auto grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
        on ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent",
      )}
      aria-hidden
    >
      <Check className="size-3" strokeWidth={3.5} />
    </span>
  );
}

export function LanguagePicker({ compact, onChange }: { compact?: boolean; onChange?: () => void }) {
  const { language } = useDisplay();
  const names = new Intl.DisplayNames(LANGUAGES.find((l) => l.code === language)!.intl, { type: "language" });
  const selected = LANGUAGES.find((l) => l.code === language)!;

  return (
    <fieldset>
      <legend className="sr-only">{t("region.language")}</legend>
      <div className={cn("grid grid-cols-1 gap-2", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3")}>
        {LANGUAGES.filter((l) => ENABLED_LANGUAGES.includes(l.code)).map((l) => {
          const on = l.code === language;
          return (
            <label key={l.code} className={cn(option, on && optionOn)}>
              <input
                type="radio"
                name={compact ? "language-compact" : "language"}
                value={l.code}
                checked={on}
                onChange={() => {
                  saveDisplay({ language: l.code });
                  onChange?.();
                }}
                className="sr-only"
              />
              <span className="min-w-0">
                <span lang={l.code} dir={l.dir} className="block text-[0.95rem] leading-snug font-semibold">
                  {l.native}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {l.code === language ? null : <span>{names.of(l.code)}</span>}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-px text-[0.65rem] font-semibold",
                      l.coverage === "complete" ? "bg-ok-soft text-ok" : "bg-soon-soft text-soon",
                    )}
                  >
                    {l.coverage === "complete" ? t("i18n.complete") : t("i18n.partial")}
                  </span>
                </span>
              </span>
              <Tick on={on} />
            </label>
          );
        })}
      </div>
      {selected.coverage === "partial" ? (
        <p className="mt-2.5 flex items-start gap-2 rounded-xl bg-soon-soft/50 px-3 py-2 text-xs leading-relaxed text-foreground/80">
          <Info className="mt-0.5 size-3.5 shrink-0 text-soon" aria-hidden />
          {t("i18n.partialNote")}
        </p>
      ) : null}
    </fieldset>
  );
}

export function CurrencyPicker({ compact }: { compact?: boolean }) {
  const { currency } = useDisplay();
  return (
    <fieldset>
      <legend className="sr-only">{t("region.currency")}</legend>
      <div className={cn("grid grid-cols-2 gap-2", compact ? "sm:grid-cols-4" : "sm:grid-cols-4")}>
        {CURRENCIES.map((code) => {
          const on = code === currency;
          return (
            <label key={code} className={cn(option, "p-2.5 ps-3", on && optionOn)}>
              <input
                type="radio"
                name={compact ? "currency-compact" : "currency"}
                value={code}
                checked={on}
                onChange={() => saveDisplay({ currency: code })}
                className="sr-only"
              />
              <span className="min-w-0">
                <span className="block font-mono text-sm font-bold">{code}</span>
                <span className="block truncate text-[0.7rem] text-muted-foreground" title={currencyName(code)}>
                  {code === "USD" ? t("fx.base") : currencyName(code)}
                </span>
              </span>
              <Tick on={on} />
            </label>
          );
        })}
      </div>
      <FxDetails />
    </fieldset>
  );
}

/** The demo rate in use and what it means. */
function FxDetails() {
  const { currency } = useDisplay();
  return (
    <div className="mt-2.5 rounded-xl bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
      {currency !== "USD" ? (
        <p className="font-semibold text-foreground">
          {t("fx.rate", { rate: formatPrice(DEMO_FX.rates[currency], currency) })}
        </p>
      ) : null}
      <p className={cn(currency !== "USD" && "mt-0.5")}>{t("fx.ratesNote", { date: formatDate(DEMO_FX.asOf, { year: true }) })}</p>
    </div>
  );
}

/** "Estimated display conversion · charged in USD." — shown wherever converted amounts appear. */
export function FxNote({ className, tone = "muted" }: { className?: string; tone?: "muted" | "inverse" }) {
  useDisplay();
  if (!isConverted()) return null;
  return (
    <p className={cn("flex items-center gap-1.5 text-[0.7rem]", tone === "inverse" ? "text-white/60" : "text-muted-foreground", className)}>
      <Info className="size-3 shrink-0" aria-hidden />
      {t("fx.note")}
    </p>
  );
}

/** Compact language & currency dialog for the account menu. */
export function RegionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <div className="p-5 sm:p-6">
          <DialogTitle className="font-heading text-lg font-bold">{t("menu.region")}</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">{t("region.description")}</DialogDescription>
          {offersLanguages() ? (
            <>
              <h3 className="mt-5 mb-2 text-sm font-semibold">{t("region.language")}</h3>
              <LanguagePicker compact />
            </>
          ) : null}
          <h3 className="mt-5 mb-2 text-sm font-semibold">{t("region.currency")}</h3>
          <CurrencyPicker compact />
        </div>
        <div className="flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Link
            href={`${ROUTES.settings}#region`}
            onClick={() => onOpenChange(false)}
            className="inline-flex h-10 items-center justify-center rounded-full px-3 text-sm font-semibold text-primary hover:bg-secondary"
          >
            {t("settings.nav.region")} · {t("nav.settings")}
          </Link>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none"
          >
            {t("common.close")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
