"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Bell,
  ChevronDown,
  Globe,
  KeyRound,
  Laptop,
  LogOut,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Trash2,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { PLATFORMS } from "@/lib/catalog";
import { SUPPORT_EMAIL } from "@/lib/demo-support";
import { NOTIFICATION_PREFS, TIMEZONES } from "@/lib/account";
import { type DateFormat, formatDate, type MessageKey, saveDisplay, t, timeZoneName, tRich, useDisplay } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ConfirmDialog, PendingBadge, SavedNote, Section, SettingRow, Switch, useSavedFlash } from "./account-ui";
import { resetDemoData, savePreferences, usePreferences } from "./demo-store";
import { useLiveAccount } from "./live-account";
import { CurrencyPicker, LanguagePicker, offersLanguages } from "./region";
import { enter, Panel, ROUTES, useHydrated } from "./shared";

const SECTIONS = [
  { id: "appearance", key: "settings.nav.appearance", icon: Palette },
  { id: "region", key: "settings.nav.region", icon: Globe },
  { id: "notifications", key: "settings.nav.notifications", icon: Bell },
  { id: "preferences", key: "settings.nav.preferences", icon: SlidersHorizontal },
  { id: "security", key: "settings.nav.security", icon: ShieldCheck },
  { id: "account", key: "settings.nav.account", icon: UserRound },
] as const satisfies readonly { id: string; key: MessageKey; icon: unknown }[];

type SectionId = (typeof SECTIONS)[number]["id"];

const selectClass =
  "h-10 w-full appearance-none rounded-xl border bg-card ps-3.5 pe-9 text-sm font-medium shadow-xs outline-none transition-colors hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60 sm:w-80";

const quietButton =
  "inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";

/** Highlights the section currently in view. */
function useActiveSection() {
  const [active, setActive] = React.useState<SectionId>("appearance");
  React.useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => Boolean(el));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id as SectionId);
      },
      { rootMargin: "-120px 0px -55% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return [active, setActive] as const;
}

export function Settings() {
  // Re-render when language, currency, time zone or date format change.
  useDisplay();
  const [active, setActive] = useActiveSection();
  const e = [0, 1].map(enter);

  const jump = (id: SectionId) => {
    setActive(id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.hasAttribute("data-reduce-motion");
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <div className="mx-auto max-w-[90rem] px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <header className={e[0].className} style={e[0].style}>
        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">{t("settings.title")}</h1>
        <p className="mt-1 max-w-xl text-[0.95rem] text-muted-foreground">{t("settings.subtitle")}</p>
      </header>

      <div className={cn("mt-5 grid grid-cols-1 gap-5 sm:mt-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8", e[1].className)} style={e[1].style}>
        <nav
          aria-label={t("settings.sections")}
          className="sticky top-16 z-20 -mx-3 bg-background/90 px-3 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-24 lg:mx-0 lg:self-start lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
        >
          <ul className="flex gap-1 overflow-x-auto no-scrollbar lg:flex-col">
            {SECTIONS.map((s) => {
              const on = active === s.id;
              return (
                <li key={s.id} className="shrink-0">
                  <a
                    href={`#${s.id}`}
                    onClick={(ev) => {
                      ev.preventDefault();
                      jump(s.id);
                    }}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "flex h-9 items-center gap-2.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none lg:h-10 lg:rounded-xl",
                      on && "bg-card text-foreground shadow-sm ring-1 ring-border lg:bg-secondary/70 lg:text-secondary-foreground lg:shadow-none lg:ring-0",
                    )}
                  >
                    <s.icon className="size-4 shrink-0" aria-hidden />
                    {t(s.key)}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <Panel className="min-w-0 divide-y px-5 py-7 sm:px-8">
          <Appearance />
          <Region />
          <Notifications />
          <PreferencesSection />
          <Security />
          <AccountActions />
        </Panel>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Appearance                                                                */
/* -------------------------------------------------------------------------- */

const THEMES = [
  { id: "light", key: "appearance.light", icon: Sun },
  { id: "dark", key: "appearance.dark", icon: Moon },
  { id: "system", key: "appearance.system", icon: Monitor },
] as const;

function ThemeSwatch({ mode }: { mode: "light" | "dark" | "system" }) {
  const pane = (dark: boolean) => (
    <span className={cn("flex h-full flex-1 flex-col gap-1 p-1.5", dark ? "bg-[#17181e]" : "bg-[#f8f9fc]")}>
      <span className={cn("h-1.5 w-2/3 rounded-full", dark ? "bg-white/25" : "bg-graphite/20")} />
      <span className={cn("h-3 rounded", dark ? "bg-white/10" : "bg-white shadow-xs")} />
      <span className="h-1.5 w-1/2 rounded-full bg-primary/70" />
    </span>
  );
  return (
    <span className="flex h-16 overflow-hidden rounded-lg border" aria-hidden>
      {mode === "system" ? (
        <>
          {pane(false)}
          {pane(true)}
        </>
      ) : (
        pane(mode === "dark")
      )}
    </span>
  );
}

function Appearance() {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();
  const prefs = usePreferences();
  const [saved, flash] = useSavedFlash();

  return (
    <Section id="appearance" title={t("settings.nav.appearance")} description={t("appearance.description")} icon={Palette} action={<SavedNote show={saved} />}>
      <fieldset>
        <legend className="text-sm font-semibold">{t("appearance.theme")}</legend>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:max-w-md sm:gap-3">
          {THEMES.map((th) => {
            const on = hydrated && theme === th.id;
            return (
              <label
                key={th.id}
                className={cn(
                  "cursor-pointer rounded-2xl border bg-card p-2 transition-[border-color,box-shadow] select-none hover:border-foreground/25 has-focus-visible:ring-3 has-focus-visible:ring-primary/25",
                  on && "border-primary shadow-[0_0_0_1px_var(--color-primary)] hover:border-primary",
                )}
              >
                <input
                  type="radio"
                  name="theme"
                  value={th.id}
                  checked={on}
                  onChange={() => {
                    setTheme(th.id);
                    flash();
                  }}
                  className="sr-only"
                />
                <ThemeSwatch mode={th.id} />
                <span className="mt-2 flex items-center justify-center gap-1.5 text-sm font-semibold">
                  <th.icon className={cn("size-3.5", on ? "text-primary" : "text-muted-foreground")} aria-hidden />
                  {t(th.key)}
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("appearance.systemHint")}</p>
      </fieldset>

      <div className="mt-6 border-t pt-5">
        <SettingRow title={t("appearance.reduceMotion")} description={t("appearance.reduceMotionDesc")} descriptionId="reduce-motion-desc" inline>
          <Switch
            label={t("appearance.reduceMotion")}
            describedBy="reduce-motion-desc"
            checked={prefs.reduceMotion}
            onChange={(v) => {
              savePreferences({ reduceMotion: v });
              flash();
            }}
          />
        </SettingRow>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Language & region                                                         */
/* -------------------------------------------------------------------------- */

function SelectField({
  id,
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} value={value} disabled={disabled} onChange={(ev) => onChange?.(ev.target.value)} className={selectClass}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </div>
  );
}

const DATE_FORMATS: { id: DateFormat; key: MessageKey }[] = [
  { id: "mdy", key: "region.mdy" },
  { id: "dmy", key: "region.dmy" },
  { id: "iso", key: "region.iso" },
];
/** A fixed sample date so each format can be previewed. */
const SAMPLE = "2026-10-27T09:14:00Z";

function Region() {
  const display = useDisplay();
  const [saved, flash] = useSavedFlash();
  const save = (patch: Parameters<typeof saveDisplay>[0]) => {
    saveDisplay(patch);
    flash();
  };

  return (
    <Section id="region" title={t("settings.nav.region")} description={t("region.description")} icon={Globe} action={<SavedNote show={saved} />}>
      {offersLanguages() ? (
        <div className="mb-6 border-b pb-5">
          <p className="text-sm font-semibold">{t("region.language")}</p>
          <p className="mt-0.5 mb-3 text-[0.8rem] text-muted-foreground">{t("region.languageDesc")}</p>
          <LanguagePicker onChange={flash} />
        </div>
      ) : null}

      <div>
        <p className="text-sm font-semibold">{t("region.currency")}</p>
        <p className="mt-0.5 mb-3 text-[0.8rem] text-muted-foreground">{t("region.currencyDesc")}</p>
        <CurrencyPicker />
      </div>

      <div className="mt-6 divide-y border-t pt-5">
        <SettingRow title={t("region.timezone")} description={t("region.timezoneDesc")}>
          <SelectField id="pref-tz" label={t("region.timezone")} value={display.timezone} onChange={(v) => save({ timezone: v })}>
            {TIMEZONES.map((tz) => (
              <option key={tz.id} value={tz.id}>
                {tz.id === "UTC" ? "UTC" : `${timeZoneName(tz.id, tz.label)} · ${tz.id.split("/").pop()?.replace(/_/g, " ")}`}
              </option>
            ))}
          </SelectField>
        </SettingRow>
        <SettingRow title={t("region.dateFormat")} description={t("region.dateFormatDesc")}>
          <SelectField id="pref-date" label={t("region.dateFormat")} value={display.dateFormat} onChange={(v) => save({ dateFormat: v as DateFormat })}>
            {DATE_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {t(f.key)} · {formatDate(SAMPLE, { year: true, format: f.id })}
              </option>
            ))}
          </SelectField>
        </SettingRow>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Notifications                                                             */
/* -------------------------------------------------------------------------- */

function Notifications() {
  const prefs = usePreferences();
  const [saved, flash] = useSavedFlash();
  return (
    <Section id="notifications" title={t("settings.nav.notifications")} description={t("notifications.description")} icon={Bell} action={<SavedNote show={saved} />}>
      <div className="divide-y">
        {NOTIFICATION_PREFS.map((n) => {
          const label = t(`notifications.${n.id}`);
          return (
            <SettingRow key={n.id} title={label} description={t(`notifications.${n.id}Desc`)} descriptionId={`notif-${n.id}`} inline>
              <Switch
                label={label}
                describedBy={`notif-${n.id}`}
                checked={prefs.notifications[n.id]}
                onChange={(v) => {
                  savePreferences({ notifications: { ...prefs.notifications, [n.id]: v } });
                  flash();
                }}
              />
            </SettingRow>
          );
        })}
      </div>
      <p className="mt-4 rounded-xl bg-muted/60 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">{t("notifications.note")}</p>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Preferences                                                               */
/* -------------------------------------------------------------------------- */

function PreferencesSection() {
  const prefs = usePreferences();
  const [saved, flash] = useSavedFlash();

  return (
    <Section id="preferences" title={t("settings.nav.preferences")} description={t("preferences.description")} icon={SlidersHorizontal} action={<SavedNote show={saved} />}>
      <SettingRow title={t("preferences.platform")} description={t("preferences.platformDesc")} badge={<PendingBadge>{t("common.appliedLater")}</PendingBadge>}>
        <SelectField
          id="pref-platform"
          label={t("preferences.platform")}
          value={prefs.platform}
          onChange={(v) => {
            savePreferences({ platform: v });
            flash();
          }}
        >
          <option value="">{t("common.noPreference")}</option>
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>
      </SettingRow>
      {/* SociVanta AI personalisation (AI-09) is saved on the server; this reopens the short introduction. */}
      <SettingRow title={t("preferences.ai")} description={t("preferences.aiDesc")}>
        <Link href="/dashboard/ai/welcome" className={quietButton}>
          {t("preferences.aiAction")}
        </Link>
      </SettingRow>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Security & privacy                                                        */
/* -------------------------------------------------------------------------- */

type SecurityId = "password" | "twoFactor" | "sessions";

const SECURITY_ICONS: Record<SecurityId, typeof KeyRound> = {
  password: KeyRound,
  twoFactor: Smartphone,
  sessions: Laptop,
};

function Security() {
  const [preview, setPreview] = React.useState<SecurityId | null>(null);
  const ids: SecurityId[] = ["password", "twoFactor", "sessions"];

  return (
    <Section id="security" title={t("security.title")} description={t("security.description")} icon={ShieldCheck}>
      <div className="divide-y">
        {ids.map((id) => {
          const Icon = SECURITY_ICONS[id];
          return (
            <SettingRow
              key={id}
              title={
                <span className="flex items-center gap-2">
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                  {t(`security.${id}`)}
                </span>
              }
              description={t(`security.${id}Row`)}
              badge={<PendingBadge />}
            >
              <button type="button" onClick={() => setPreview(id)} className={quietButton}>
                {t("common.preview")}
              </button>
            </SettingRow>
          );
        })}
      </div>

      <div className="mt-5 rounded-2xl border p-4">
        <p className="text-sm font-semibold">{t("security.privacy")}</p>
        <ul className="mt-2 space-y-1.5 text-[0.8rem] leading-relaxed text-muted-foreground">
          <li>• {t("security.privacy1")}</li>
          <li>• {t("security.privacy2")}</li>
          <li>
            •{" "}
            {tRich("security.privacy3", {
              email: (
                <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className="font-semibold text-primary hover:underline">
                  {SUPPORT_EMAIL}
                </a>
              ),
            })}
          </li>
        </ul>
      </div>

      <ConfirmDialog
        open={preview !== null}
        onOpenChange={(o) => !o && setPreview(null)}
        title={preview ? t(`security.${preview}`) : ""}
        description={preview ? t(`security.${preview}Body`) : ""}
        icon={preview ? SECURITY_ICONS[preview] : undefined}
      />
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Account actions                                                           */
/* -------------------------------------------------------------------------- */

function AccountActions() {
  const [dialog, setDialog] = React.useState<"reset" | "signout" | "delete" | null>(null);
  const [resetDone, setResetDone] = React.useState(false);
  // A real account has no demo data to reset.
  const live = useLiveAccount();

  return (
    <Section id="account" title={t("settings.nav.account")} description={t("account.description")} icon={UserRound}>
      <div className="divide-y">
        {live ? null : (
          <SettingRow title={t("account.reset")} description={t("account.resetDesc")}>
            <button type="button" onClick={() => setDialog("reset")} className={quietButton}>
              <RotateCcw className="size-3.5" aria-hidden /> {t("menu.reset")}
            </button>
          </SettingRow>
        )}
        <SettingRow title={t("account.signOut")} description={t("account.signOutDesc")} badge={<PendingBadge />}>
          <button type="button" onClick={() => setDialog("signout")} className={quietButton}>
            <LogOut className="size-3.5" aria-hidden /> {t("account.signOutButton")}
          </button>
        </SettingRow>
      </div>
      <div role="status" className="empty:hidden">
        {resetDone ? (
          <p className="mt-3 flex items-center gap-2 rounded-xl border border-dashed px-3.5 py-2.5 text-sm text-muted-foreground">
            <RotateCcw className="size-4 shrink-0" aria-hidden /> {t("account.resetDone")}
          </p>
        ) : null}
      </div>

      <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/[0.03] p-4 sm:p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-destructive">
          <TriangleAlert className="size-4" aria-hidden /> {t("account.danger")}
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {t("account.delete")} <PendingBadge>{t("account.requestPreview")}</PendingBadge>
            </p>
            <p className="mt-0.5 text-[0.8rem] text-muted-foreground">{t("account.deleteDesc")}</p>
          </div>
          <button
            type="button"
            onClick={() => setDialog("delete")}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-destructive/40 bg-card px-3.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 focus-visible:ring-3 focus-visible:ring-destructive/30 focus-visible:outline-none"
          >
            <Trash2 className="size-3.5" aria-hidden /> {t("account.requestDeletion")}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={dialog === "reset"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t("account.resetTitle")}
        description={t("account.resetBody")}
        confirmLabel={t("menu.reset")}
        onConfirm={() => {
          resetDemoData();
          setResetDone(true);
        }}
        icon={RotateCcw}
      />
      <ConfirmDialog
        open={dialog === "signout"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t("account.signOut")}
        description={t("account.signOutBody")}
        icon={LogOut}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t("account.delete")}
        description={t("account.deleteBody")}
        tone="danger"
        icon={Trash2}
      >
        <p className="rounded-xl bg-muted/60 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {tRich("account.deleteNote", {
            reset: <span className="font-semibold text-foreground">{t("menu.reset")}</span>,
            email: (
              <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className="font-semibold text-primary hover:underline">
                {SUPPORT_EMAIL}
              </a>
            ),
            support: (
              <Link href={ROUTES.support} className="font-semibold text-primary hover:underline">
                {t("nav.support")}
              </Link>
            ),
          })}
        </p>
      </ConfirmDialog>
    </Section>
  );
}
