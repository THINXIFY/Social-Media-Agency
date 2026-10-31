"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Bell,
  BellOff,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Eye,
  FlaskConical,
  Info,
  Lock,
  type LucideIcon,
  Package,
  Palette,
  Puzzle,
  RotateCcw,
  Server,
  Settings2,
  ShieldCheck,
  TriangleAlert,
  Upload,
  Wallet,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { ConfirmDialog, Switch } from "@/components/dashboard/account-ui";
import { TIMEZONES } from "@/lib/account";
import { dateTime, SYSTEMS, usd } from "@/lib/admin-demo";
import { STATUS_META as PROVIDER_STATUS, statusOf, useProviders } from "@/lib/admin-providers";
import { eligibility, isPriced, PAYMENT_PROVIDER_APPROVED, useServiceRecords } from "@/lib/admin-services";
import {
  type Appearance,
  type AssignmentMode,
  BRAND,
  contrast,
  DEFAULTS,
  type Digest,
  type EditableSection,
  type Errors,
  NOTIFY_EVENTS,
  resetSettings,
  type ReviewMode,
  saveSettings,
  type SettingsSection,
  type SettingsValues,
  useAdminSettings,
  VALIDATE,
} from "@/lib/admin-settings";
import { isQuantityBased } from "@/lib/catalog";
import { CURRENCIES, ENABLED_LANGUAGES, LANGUAGE_BY_CODE, LANGUAGES } from "@/lib/i18n/config";
import { CRYPTO_ASSETS, DEPOSIT_LIMITS, METHOD_STATUS_LABELS, PAYMENT_METHODS, PAYMENTS_LIVE } from "@/lib/payments";
import { cn } from "@/lib/utils";
import { describe, Segmented, SelectInput, TextArea, TextInput } from "./form";
import { AdminDemoTag } from "./ui";

/* -------------------------------------------------------------------------- */
/*  Categories                                                                */
/* -------------------------------------------------------------------------- */

const CATEGORIES: { id: SettingsSection; label: string; description: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", description: "Platform identity, contact details and regional defaults.", icon: Settings2 },
  { id: "branding", label: "Branding", description: "How SociVanta looks to customers and in emails.", icon: Palette },
  { id: "orders", label: "Orders & Services", description: "Operational defaults for orders, review and fulfilment.", icon: Package },
  { id: "payments", label: "Payments & Wallet", description: "Payment methods, wallet rules and verification requirements.", icon: Wallet },
  { id: "notifications", label: "Notifications", description: "Which events you'd like to hear about.", icon: Bell },
  { id: "integrations", label: "Integrations", description: "External services SociVanta depends on, and their real state.", icon: Puzzle },
];
const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<SettingsSection, (typeof CATEGORIES)[number]>;
const isSection = (v: string | null): v is SettingsSection => Boolean(v && v in CATEGORY_BY_ID);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Changes worth a second look before saving, even as demo preferences. */
function confirmationFor(section: EditableSection, before: SettingsValues, after: SettingsValues): { title: string; description: string } | null {
  if (section === "general" && after.general.maintenancePreview && !before.general.maintenancePreview)
    return { title: "Save maintenance mode preview?", description: "This only stores the preview on this device. The site stays online and customers won't see a maintenance page." };
  if (section === "orders" && after.orders.review === "flagged" && before.orders.review === "all")
    return { title: "Review flagged orders only?", description: "Orders without flags would skip staff review once a backend enforces this. Nothing changes for current orders in this demo." };
  if (section === "payments" && !after.payments.adjustmentReason && before.payments.adjustmentReason)
    return { title: "Allow adjustments without a reason?", description: "Every wallet adjustment should carry a written reason for the audit trail. This is a local preference and changes no balances." };
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function AdminSettings() {
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get("section");
  const section: SettingsSection = isSection(raw) ? raw : "general";
  const stored = useAdminSettings();
  const [drafts, setDrafts] = React.useState<Partial<SettingsValues>>({});
  const [tried, setTried] = React.useState<Partial<Record<EditableSection, boolean>>>({});
  const [notice, setNotice] = React.useState<string | null>(null);
  const [ask, setAsk] = React.useState<{ title: string; description: string; confirmLabel: string; danger?: boolean; run: () => void } | null>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const valueOf = <K extends EditableSection>(k: K): SettingsValues[K] => (drafts[k] as SettingsValues[K] | undefined) ?? stored.values[k];
  const dirtyOf = (k: EditableSection) => drafts[k] !== undefined && !same(drafts[k], stored.values[k]);
  const anyDirty = (Object.keys(drafts) as EditableSection[]).some(dirtyOf);

  // Leaving the page with unsaved drafts asks first.
  React.useEffect(() => {
    if (!anyDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  // A notice belongs to the category it was shown on.
  const [noticeFor, setNoticeFor] = React.useState(section);
  if (noticeFor !== section) {
    setNoticeFor(section);
    setNotice(null);
  }

  const go = (id: SettingsSection) => {
    if (id === section) return;
    router.push(id === "general" ? "/admin/settings" : `/admin/settings?section=${id}`, { scroll: false });
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  };

  const set = <K extends EditableSection>(k: K, patch: Partial<SettingsValues[K]>) => {
    setDrafts((d) => ({ ...d, [k]: { ...((d[k] as SettingsValues[K] | undefined) ?? stored.values[k]), ...patch } }));
    setNotice(null);
  };

  const discard = (k: EditableSection) => {
    setDrafts((d) => {
      const next = { ...d };
      delete next[k];
      return next;
    });
    setTried((t) => ({ ...t, [k]: false }));
    setNotice("Changes discarded.");
  };

  const save = (k: EditableSection) => {
    const v = valueOf(k);
    const errs = (VALIDATE[k] as (x: unknown) => Errors)(v);
    if (Object.keys(errs).length) {
      setTried((t) => ({ ...t, [k]: true }));
      setNotice(null);
      requestAnimationFrame(() => document.getElementById(`st-${Object.keys(errs)[0]}`)?.focus());
      return;
    }
    const commit = () => {
      saveSettings(k, v);
      discard(k);
      setNotice("Saved on this device. Customers and live operations aren't affected.");
    };
    const c = confirmationFor(k, stored.values, { ...stored.values, [k]: v });
    if (c) setAsk({ ...c, confirmLabel: "Save changes", run: commit });
    else commit();
  };

  const reset = (k: EditableSection) =>
    setAsk({
      title: `Reset ${CATEGORY_BY_ID[k].label} to defaults?`,
      description: "Your saved demo values for this category are removed and the defaults return. Other categories keep their settings.",
      confirmLabel: "Reset to defaults",
      danger: true,
      run: () => {
        resetSettings(k);
        discard(k);
        setNotice("Defaults restored.");
      },
    });

  const cat = CATEGORY_BY_ID[section];
  const editable = section !== "integrations" ? (section as EditableSection) : null;
  const errorsFor = <K extends EditableSection>(k: K): Errors => {
    const all = (VALIDATE[k] as (x: unknown) => Errors)(valueOf(k));
    if (tried[k]) return all;
    // Before a save attempt, only explain problems in fields that were changed.
    const before = stored.values[k] as unknown as Record<string, unknown>;
    const now = valueOf(k) as unknown as Record<string, unknown>;
    return Object.fromEntries(Object.entries(all).filter(([key]) => !same(before[key], now[key])));
  };

  const view = (() => {
    switch (section) {
      case "general":
        return <GeneralView v={valueOf("general")} set={(p) => set("general", p)} e={errorsFor("general")} />;
      case "branding":
        return <BrandingView v={valueOf("branding")} set={(p) => set("branding", p)} e={errorsFor("branding")} />;
      case "orders":
        return <OrdersView v={valueOf("orders")} set={(p) => set("orders", p)} e={errorsFor("orders")} />;
      case "payments":
        return <PaymentsView v={valueOf("payments")} set={(p) => set("payments", p)} e={errorsFor("payments")} />;
      case "notifications":
        return <NotificationsView v={valueOf("notifications")} set={(p) => set("notifications", p)} />;
      default:
        return <IntegrationsView />;
    }
  })();

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header>
        <p className="flex items-center gap-2 text-[0.8rem] font-medium text-muted-foreground">
          Administration <AdminDemoTag>Local demo settings</AdminDemoTag>
        </p>
        <h1 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Settings</h1>
        <p className="mt-1 max-w-2xl text-[0.95rem] text-muted-foreground">Manage platform preferences and see what&apos;s ready to go live. Changes are saved on this device only and never affect customers.</p>
      </header>

      <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-10">
        {/* Category navigation */}
        <div className="lg:hidden">
          <label htmlFor="st-category" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
            Settings category
          </label>
          <SelectInput id="st-category" value={section} onChange={(e) => go(e.target.value as SettingsSection)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id !== "integrations" && dirtyOf(c.id as EditableSection) ? `${c.label} · unsaved` : c.label}
              </option>
            ))}
          </SelectInput>
        </div>
        <nav aria-label="Settings categories" className="hidden lg:block">
          <ul className="sticky top-24 space-y-0.5">
            {CATEGORIES.map((c) => {
              const on = c.id === section;
              const dirty = c.id !== "integrations" && dirtyOf(c.id as EditableSection);
              return (
                <li key={c.id}>
                  <Link
                    href={c.id === "general" ? "/admin/settings" : `/admin/settings?section=${c.id}`}
                    scroll={false}
                    aria-current={on ? "page" : undefined}
                    onClick={() => requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }))}
                    className={cn(
                      "group flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                      on && "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgb(15_16_20/0.06)] ring-1 ring-border",
                    )}
                  >
                    <c.icon className={cn("size-4 shrink-0", on ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    {dirty ? (
                      <span className="flex items-center gap-1 text-[0.68rem] font-semibold text-soon">
                        <span className="size-1.5 rounded-full bg-soon" aria-hidden />
                        <span className="sr-only">, </span>Unsaved
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Category content */}
        <section className="min-w-0 max-w-3xl" aria-labelledby="st-heading">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h2 id="st-heading" ref={headingRef} tabIndex={-1} className="font-heading text-xl font-extrabold tracking-tight focus:outline-none">
                {cat.label}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{cat.description}</p>
            </div>
            <SavedState section={editable} dirty={editable ? dirtyOf(editable) : false} savedAt={editable ? stored.savedAt[editable] : undefined} />
          </div>
          <Legend />
          {notice ? (
            <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-ok-soft/70 px-3.5 py-2.5 text-[0.82rem] font-medium text-ok dark:bg-ok-soft/20">
              <CircleCheck className="size-4 shrink-0" aria-hidden /> {notice}
            </p>
          ) : null}
          <div className="mt-5 space-y-5">{view}</div>
          {editable ? (
            <SaveBar
              dirty={dirtyOf(editable)}
              saved={Boolean(stored.savedAt[editable])}
              errorCount={tried[editable] ? Object.keys(errorsFor(editable)).length : 0}
              onSave={() => save(editable)}
              onDiscard={() => discard(editable)}
              onReset={() => reset(editable)}
            />
          ) : null}
        </section>
      </div>

      <ConfirmDialog
        open={ask !== null}
        onOpenChange={(o) => !o && setAsk(null)}
        title={ask?.title ?? ""}
        description={ask?.description ?? ""}
        confirmLabel={ask?.confirmLabel}
        cancelLabel="Cancel"
        tone={ask?.danger ? "danger" : "default"}
        icon={ask?.danger ? RotateCcw : TriangleAlert}
        onConfirm={() => ask?.run()}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Frame                                                                     */
/* -------------------------------------------------------------------------- */

function SavedState({ section, dirty, savedAt }: { section: EditableSection | null; dirty: boolean; savedAt?: string }) {
  const base = "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold";
  if (!section)
    return (
      <span className={cn(base, "bg-muted text-muted-foreground")}>
        <Eye className="size-3.5" aria-hidden /> Read only
      </span>
    );
  if (dirty)
    return (
      <span className={cn(base, "bg-soon-soft text-soon")}>
        <span className="size-1.5 rounded-full bg-soon" aria-hidden /> Unsaved changes
      </span>
    );
  if (savedAt)
    return (
      <span className={cn(base, "bg-ok-soft text-ok dark:bg-ok-soft/20")}>
        <CircleCheck className="size-3.5" aria-hidden /> Saved {dateTime(savedAt)}
      </span>
    );
  return <span className={cn(base, "bg-muted text-muted-foreground")}>Default values</span>;
}

function Legend() {
  return (
    <details className="group mt-3 text-xs text-muted-foreground">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-medium hover:text-foreground focus-visible:rounded focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <Info className="size-3.5" aria-hidden /> What do the labels mean?
      </summary>
      <ul className="mt-2 grid gap-1.5 rounded-xl bg-muted/40 p-3 sm:grid-cols-3">
        <li>
          <span className="font-semibold text-foreground">Editable</span> — saved on this device as a demo preference.
        </li>
        <li>
          <Tag kind="code" /> — controlled by application code; shown read-only.
        </li>
        <li>
          <Tag kind="backend" /> — a preview that does nothing until a secure backend enforces it.
        </li>
      </ul>
    </details>
  );
}

function SaveBar({ dirty, saved, errorCount, onSave, onDiscard, onReset }: { dirty: boolean; saved: boolean; errorCount: number; onSave: () => void; onDiscard: () => void; onReset: () => void }) {
  return (
    <div
      className={cn(
        "z-10 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3",
        (dirty || errorCount > 0) && "sticky bottom-3 bg-card/95 shadow-float backdrop-blur supports-[backdrop-filter]:bg-card/85",
      )}
    >
      <p className="min-w-0 text-[0.82rem] text-muted-foreground" aria-live="polite">
        {errorCount ? (
          <span className="font-semibold text-destructive">
            Fix {errorCount} {errorCount === 1 ? "field" : "fields"} to save.
          </span>
        ) : dirty ? (
          <span className="font-semibold text-foreground">You have unsaved changes.</span>
        ) : (
          "All changes saved."
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {dirty ? (
          <button type="button" onClick={onDiscard} className={secondaryBtn}>
            Discard
          </button>
        ) : saved ? (
          <button type="button" onClick={onReset} className={secondaryBtn}>
            <RotateCcw className="size-3.5" aria-hidden /> Reset to defaults
          </button>
        ) : null}
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty}
          className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-[0.85rem] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
        >
          Save changes
        </button>
      </div>
    </div>
  );
}

const secondaryBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border bg-card px-3.5 text-[0.85rem] font-semibold transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";

const TAGS = {
  code: { label: "Set in code", Icon: Lock },
  backend: { label: "Needs backend", Icon: Server },
  preview: { label: "Preview only", Icon: Eye },
} as const;
type TagKind = keyof typeof TAGS;

function Tag({ kind }: { kind: TagKind }) {
  const { label, Icon } = TAGS[kind];
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-muted px-2 text-[0.66rem] font-semibold whitespace-nowrap text-muted-foreground">
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

function Group({ id, title, description, tag, action, children }: { id: string; title: string; description?: React.ReactNode; tag?: TagKind; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`st-g-${id}`} className="rounded-2xl border bg-card shadow-[0_1px_2px_rgb(15_16_20/0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h3 id={`st-g-${id}`} className="flex flex-wrap items-center gap-2 text-[0.95rem] font-bold">
            {title}
            {tag ? <Tag kind={tag} /> : null}
          </h3>
          {description ? <p className="mt-0.5 text-[0.8rem] text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="divide-y px-4 sm:px-5">{children}</div>
    </section>
  );
}

/** One setting: label and help on the left, the control on the right (stacked on phones). */
function Row({
  id,
  label,
  help,
  error,
  tag,
  inline,
  children,
}: {
  id?: string;
  label: string;
  help?: React.ReactNode;
  error?: string;
  tag?: TagKind;
  /** Small controls (switches) stay beside the label even on phones. */
  inline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-x-8 gap-y-2.5 py-4", inline ? "grid-cols-[minmax(0,1fr)_auto] items-start" : "sm:grid-cols-[minmax(0,1fr)_minmax(0,17.5rem)]")}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {id ? (
            <label htmlFor={id} className="text-sm font-semibold">
              {label}
            </label>
          ) : (
            <p className="text-sm font-semibold">{label}</p>
          )}
          {tag ? <Tag kind={tag} /> : null}
        </div>
        {help ? (
          <p id={id ? `${id}-help` : undefined} className="mt-0.5 text-[0.8rem] leading-relaxed text-muted-foreground">
            {help}
          </p>
        ) : null}
      </div>
      <div className={cn("min-w-0", inline && "pt-0.5")}>
        {children}
        {error && id ? (
          <p id={`${id}-error`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-destructive">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Value({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="sm:text-end">
      <p className="text-sm font-semibold">{children}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function ModuleLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 rounded-md text-[0.82rem] font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none">
      {children} <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

function Callout({ icon: Icon = Info, children }: { icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 rounded-xl border border-primary/15 bg-secondary/40 px-3.5 py-3 text-[0.82rem] leading-relaxed text-foreground/85 dark:bg-secondary/15">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

const input = (id: string, e: Errors, key: string) => describe(id, e[key], true);

/* -------------------------------------------------------------------------- */
/*  General                                                                   */
/* -------------------------------------------------------------------------- */

type ViewProps<K extends EditableSection> = { v: SettingsValues[K]; set: (p: Partial<SettingsValues[K]>) => void; e: Errors };

function GeneralView({ v, set, e }: ViewProps<"general">) {
  const lang = LANGUAGE_BY_CODE[ENABLED_LANGUAGES[0]];
  const prepared = LANGUAGES.filter((l) => !ENABLED_LANGUAGES.includes(l.code)).map((l) => l.english);
  return (
    <>
      <Group id="identity" title="Platform" description="The name and address customers know you by.">
        <Row id="st-platformName" label="Platform name" help="Provisional — the final brand name may change." error={e.platformName}>
          <TextInput {...input("st-platformName", e, "platformName")} value={v.platformName} maxLength={40} onChange={(x) => set({ platformName: x.target.value })} />
        </Row>
        <Row id="st-platformUrl" label="Platform URL" help="Leave empty until a domain is chosen. Must start with https://." error={e.platformUrl}>
          <TextInput {...input("st-platformUrl", e, "platformUrl")} type="url" inputMode="url" placeholder="https://your-domain.com" value={v.platformUrl} onChange={(x) => set({ platformUrl: x.target.value })} />
        </Row>
        <Row id="st-supportEmail" label="Support email" help="Where customers can reach the team." error={e.supportEmail}>
          <TextInput {...input("st-supportEmail", e, "supportEmail")} type="email" inputMode="email" autoComplete="off" value={v.supportEmail} onChange={(x) => set({ supportEmail: x.target.value })} />
        </Row>
      </Group>

      <Group id="regional" title="Language & region" description="Defaults for new customers and for reports.">
        <Row label="Default language" tag="code" help={`Other languages (${prepared.join(", ")}) are prepared but switched off until their translations are complete.`}>
          <Value>{lang.english}</Value>
        </Row>
        <Row label="Accounting currency" tag="code" help="Every balance, price, deposit and transaction is stored and charged in USD.">
          <Value>USD — US dollar</Value>
        </Row>
        <Row id="st-displayCurrency" label="Default display currency" tag="preview" help="Starting display currency for new customers, using demo exchange rates. Customers' own choices and customer pages are unchanged." error={e.displayCurrency}>
          <SelectInput {...input("st-displayCurrency", e, "displayCurrency")} value={v.displayCurrency} onChange={(x) => set({ displayCurrency: x.target.value as typeof v.displayCurrency })}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectInput>
        </Row>
        <Row id="st-timezone" label="Platform time zone" tag="preview" help="For reports and daily cut-offs once a backend exists. Admin dates show in UTC today." error={e.timezone}>
          <SelectInput {...input("st-timezone", e, "timezone")} value={v.timezone} onChange={(x) => set({ timezone: x.target.value })}>
            {TIMEZONES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </SelectInput>
        </Row>
      </Group>

      <details className="group rounded-2xl border bg-card" open={v.maintenancePreview || undefined}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 focus-visible:rounded-2xl focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none sm:px-5 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-[0.95rem] font-bold">Advanced</span>
            <span className="block text-[0.8rem] text-muted-foreground">Maintenance mode preview.</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
        </summary>
        <div className="divide-y border-t px-4 sm:px-5">
          <Row id="st-maintenancePreview" label="Maintenance mode" tag="backend" inline help="Plan the message customers would see during maintenance. The site never goes offline from here.">
            <Switch id="st-maintenancePreview" label="Maintenance mode preview" describedBy="st-maintenancePreview-help" checked={v.maintenancePreview} onChange={(c) => set({ maintenancePreview: c })} />
          </Row>
          {v.maintenancePreview ? (
            <div className="space-y-3 py-4">
              <div>
                <label htmlFor="st-maintenanceMessage" className="text-sm font-semibold">
                  Message for customers
                </label>
                <TextArea
                  {...input("st-maintenanceMessage", e, "maintenanceMessage")}
                  aria-describedby={e.maintenanceMessage ? "st-maintenanceMessage-error" : undefined}
                  maxLength={200}
                  value={v.maintenanceMessage}
                  placeholder="We're making improvements and will be back shortly."
                  onChange={(x) => set({ maintenanceMessage: x.target.value })}
                  className="mt-1.5 max-w-xl"
                />
                {e.maintenanceMessage ? (
                  <p id="st-maintenanceMessage-error" role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-destructive">
                    <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> {e.maintenanceMessage}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">{v.maintenanceMessage.trim().length}/200</p>
                )}
              </div>
              <div className="max-w-xl rounded-xl border border-dashed p-3">
                <p className="text-[0.68rem] font-bold tracking-wider text-muted-foreground uppercase">Preview · not shown to customers</p>
                <p className="mt-1.5 text-sm font-semibold">{v.platformName.trim() || "SociVanta"} is under maintenance</p>
                <p className="text-[0.82rem] text-muted-foreground">{v.maintenanceMessage.trim() || "Your message appears here."}</p>
              </div>
            </div>
          ) : null}
        </div>
      </details>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Branding                                                                  */
/* -------------------------------------------------------------------------- */

function BrandingView({ v, set, e }: ViewProps<"branding">) {
  const hex = (s: string) => (/^#[0-9a-f]{6}$/i.test(s.trim()) ? s.trim() : null);
  const primary = hex(v.primaryColor) ?? BRAND.primary;
  const accent = hex(v.accentColor) ?? BRAND.accent;
  const changed = primary.toLowerCase() !== BRAND.primary.toLowerCase() || accent.toLowerCase() !== BRAND.accent.toLowerCase();
  const color = (key: "primaryColor" | "accentColor", label: string, help: string) => (
    <Row id={`st-${key}`} label={label} help={help} error={e[key]}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`Pick ${label.toLowerCase()}`}
          value={(hex(v[key]) ?? DEFAULTS.branding[key]).toLowerCase()}
          onChange={(x) => set({ [key]: x.target.value.toUpperCase() })}
          className="size-10 shrink-0 cursor-pointer rounded-xl border bg-background p-1 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
        />
        <TextInput {...input(`st-${key}`, e, key)} value={v[key]} maxLength={7} spellCheck={false} onChange={(x) => set({ [key]: x.target.value })} className="font-mono uppercase" />
      </div>
    </Row>
  );
  return (
    <>
      <Callout icon={Eye}>Branding here is a preview. The live site keeps its approved logo, favicon and colours; nothing on this page changes them.</Callout>

      <Group id="identity" title="Brand identity" description="Name and artwork shown across the site.">
        <Row id="st-displayName" label="Display name" help="How the brand is written in headers and emails." error={e.displayName}>
          <TextInput {...input("st-displayName", e, "displayName")} value={v.displayName} maxLength={40} onChange={(x) => set({ displayName: x.target.value })} />
        </Row>
        <Row label="Logo" tag="code" help="The approved SociVanta logo. Uploading a replacement needs file storage on a backend.">
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="grid h-16 place-items-center rounded-xl border bg-white text-[#202127]">
                <Logo className="scale-90" />
              </div>
              <div className="grid h-16 place-items-center rounded-xl border border-white/10 bg-graphite text-white">
                <Logo className="scale-90" />
              </div>
            </div>
            <button type="button" disabled aria-describedby="st-upload-note" className={cn(secondaryBtn, "w-full cursor-not-allowed opacity-55 hover:bg-card")}>
              <Upload className="size-3.5" aria-hidden /> Upload logo
            </button>
            <p id="st-upload-note" className="text-xs text-muted-foreground">
              Uploads aren&apos;t available yet.
            </p>
          </div>
        </Row>
        <Row label="Favicon" tag="code" help="Shown in browser tabs and bookmarks. The current file is the framework default; a SociVanta favicon hasn't been added yet.">
          <div className="flex items-center gap-3 sm:justify-end">
            {/* eslint-disable-next-line @next/next/no-img-element -- the live favicon file, shown as-is */}
            <img src="/favicon.ico" alt="Current favicon, 32 pixels" width={32} height={32} className="rounded-md border bg-white p-1" />
            {/* eslint-disable-next-line @next/next/no-img-element -- same file at tab size */}
            <img src="/favicon.ico" alt="Current favicon, 16 pixels" width={16} height={16} />
            <span className="text-xs text-muted-foreground">Default · not branded</span>
          </div>
        </Row>
      </Group>

      <Group id="colours" title="Colours" description="Proposed brand colours. Contrast is checked so buttons stay readable.">
        {color("primaryColor", "Primary colour", "Buttons, links and highlights. White text must stay readable on it.")}
        {color("accentColor", "Accent colour", "Small highlights only, used sparingly.")}
        <div className="py-4">
          <p className="text-[0.68rem] font-bold tracking-wider text-muted-foreground uppercase">Preview{changed ? " · not applied" : ""}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border bg-background p-4">
            <span className="inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold text-white" style={{ background: primary }}>
              Place order
            </span>
            <span className="text-sm font-semibold" style={{ color: primary }}>
              View services
            </span>
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-graphite px-2.5 text-xs font-semibold text-white">
              <span className="size-2 rounded-full" style={{ background: accent }} aria-hidden /> New
            </span>
            <span className="ms-auto text-xs text-muted-foreground tabular-nums">Text contrast {contrast(primary, "#ffffff").toFixed(1)}:1</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Live theme (set in code): Violet {BRAND.primary} · Graphite {BRAND.graphite} · Lime {BRAND.accent}.
          </p>
        </div>
      </Group>

      <Group id="appearance" title="Appearance" description="How the site looks to new visitors.">
        <Row label="Default theme" tag="preview" help="The site currently opens in Light. Visitors can still switch themes themselves.">
          <div className="sm:flex sm:justify-end">
            <Segmented<Appearance>
              name="st-appearance"
              label="Default theme"
              value={v.appearance}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "System" },
              ]}
              onChange={(x) => set({ appearance: x })}
            />
          </div>
        </Row>
      </Group>

      <Group id="email" title="Email sender" description="The identity on emails customers receive." tag="backend">
        <Row id="st-senderName" label="Sender name" error={e.senderName}>
          <TextInput {...input("st-senderName", e, "senderName")} value={v.senderName} maxLength={40} onChange={(x) => set({ senderName: x.target.value })} />
        </Row>
        <Row id="st-replyTo" label="Reply-to address" help="Where customer replies go." error={e.replyTo}>
          <TextInput {...input("st-replyTo", e, "replyTo")} type="email" inputMode="email" autoComplete="off" value={v.replyTo} onChange={(x) => set({ replyTo: x.target.value })} />
        </Row>
        <div className="py-4">
          <p className="text-[0.68rem] font-bold tracking-wider text-muted-foreground uppercase">Inbox preview · sample</p>
          <div className="mt-2 rounded-xl border bg-background p-3.5 text-sm">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: primary }} aria-hidden>
                {(v.senderName.trim() || "S").charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{v.senderName.trim() || "Sender name"}</p>
                <p className="truncate text-xs text-muted-foreground">Reply-to: {v.replyTo.trim() || "—"}</p>
              </div>
            </div>
            <p className="mt-2.5 font-medium">Your order has been received</p>
            <p className="text-xs text-muted-foreground">Sample subject line. No email delivery service is connected, so nothing is sent.</p>
          </div>
        </div>
      </Group>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Orders & Services                                                         */
/* -------------------------------------------------------------------------- */

function OrdersView({ v, set, e }: ViewProps<"orders">) {
  const records = useServiceRecords();
  const live = records.filter((r) => !r.archived && !r.draft);
  const quantity = live.filter((r) => isQuantityBased(r.category));
  const stats = [
    { label: "Services", value: live.length },
    { label: "Visible", value: live.filter((r) => r.visible).length },
    { label: "Priced", value: live.filter(isPriced).length },
    { label: "Ready to buy", value: live.filter((r) => eligibility(r).ready).length },
  ];
  const withLimits = quantity.filter((r) => r.limits.min !== null || r.limits.max !== null).length;
  return (
    <>
      <Group id="catalog" title="Catalog at a glance" description="Live figures from Services & Pricing." action={<ModuleLink href="/admin/services">Services & Pricing</ModuleLink>}>
        <div className="py-4">
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-muted/45 px-3 py-2.5">
                <dt className="text-xs font-medium text-muted-foreground">{s.label}</dt>
                <dd className="mt-0.5 font-heading text-lg font-extrabold tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 flex items-start gap-2 text-[0.8rem] text-muted-foreground">
            <CircleSlash className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {PAYMENT_PROVIDER_APPROVED ? "Purchases follow each service's readiness checks." : "Purchasing stays off for every service: no payment provider is connected. Activation is managed per service in Services & Pricing."}
          </p>
        </div>
      </Group>

      <Group id="quantities" title="Order quantities" description={`Starting limits for new quantity-based services. ${withLimits} of ${quantity.length} existing quantity-based services have their own limits, which stay as they are.`}>
        <Row id="st-defaultMin" label="Default minimum" help="Smallest quantity per order." error={e.defaultMin}>
          <TextInput {...input("st-defaultMin", e, "defaultMin")} inputMode="numeric" value={v.defaultMin} onChange={(x) => set({ defaultMin: x.target.value })} className="tabular-nums" />
        </Row>
        <Row id="st-defaultMax" label="Default maximum" help="Largest quantity per order." error={e.defaultMax}>
          <TextInput {...input("st-defaultMax", e, "defaultMax")} inputMode="numeric" value={v.defaultMax} onChange={(x) => set({ defaultMax: x.target.value })} className="tabular-nums" />
        </Row>
      </Group>

      <Group id="processing" title="Review & processing" description="How new orders move from checkout to fulfilment." tag="backend">
        <Row label="Order review" help={v.review === "all" ? "Staff approve every order before it's processed. Safest while operations are new." : "Only orders with flags (missing details, policy checks) wait for staff."}>
          <div className="sm:flex sm:justify-end">
            <Segmented<ReviewMode>
              name="st-review"
              label="Order review"
              value={v.review}
              options={[
                { value: "all", label: "Every order" },
                { value: "flagged", label: "Flagged only" },
              ]}
              onChange={(x) => set({ review: x })}
            />
          </div>
        </Row>
        <Row id="st-processing" label="Default processing" help="Provider processing becomes available once a provider connection is verified." error={e.processing}>
          <SelectInput {...input("st-processing", e, "processing")} value={v.processing} onChange={(x) => set({ processing: x.target.value as typeof v.processing })}>
            <option value="manual">Manual by staff</option>
            <option value="provider" disabled>
              Through a provider (not available)
            </option>
          </SelectInput>
        </Row>
        <Row label="Provider assignment" help={v.assignment === "staff" ? "Staff choose the provider for each order." : "Use the provider mapped to each service in Providers."}>
          <div className="space-y-2 sm:text-end">
            <Segmented<AssignmentMode>
              name="st-assignment"
              label="Provider assignment"
              value={v.assignment}
              options={[
                { value: "staff", label: "Staff choose" },
                { value: "mapped", label: "Service mapping" },
              ]}
              onChange={(x) => set({ assignment: x })}
            />
            <div>
              <ModuleLink href="/admin/providers">Providers</ModuleLink>
            </div>
          </div>
        </Row>
      </Group>

      <Group id="refunds" title="Cancellations & refunds" description="Policy preferences for when orders can't be completed." tag="backend">
        <Row id="st-allowCancel" label="Cancel before processing starts" inline help="Customers may cancel an order that hasn't started, for a full refund to their wallet.">
          <Switch id="st-allowCancel" label="Cancel before processing starts" describedBy="st-allowCancel-help" checked={v.allowCancelBeforeStart} onChange={(c) => set({ allowCancelBeforeStart: c })} />
        </Row>
        <Row id="st-partialRefunds" label="Partial refunds for under-delivery" inline help="Refund the undelivered share when a provider delivers less than ordered.">
          <Switch id="st-partialRefunds" label="Partial refunds for under-delivery" describedBy="st-partialRefunds-help" checked={v.partialRefunds} onChange={(c) => set({ partialRefunds: c })} />
        </Row>
        <Row label="Refunds are paid to" tag="code" help="Refunds return to the customer's SociVanta wallet in USD.">
          <Value>Customer wallet</Value>
        </Row>
      </Group>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Payments & Wallet                                                         */
/* -------------------------------------------------------------------------- */

function PaymentsView({ v, set, e }: ViewProps<"payments">) {
  const money = (key: "secondReviewAt" | "refundApprovalAbove", label: string, help: string) => (
    <Row id={`st-${key}`} label={label} help={help} error={e[key]}>
      <div className="relative">
        <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <TextInput {...input(`st-${key}`, e, key)} inputMode="numeric" value={v[key]} onChange={(x) => set({ [key]: x.target.value })} className="ps-7 tabular-nums" />
      </div>
    </Row>
  );
  const payments = SYSTEMS.find((s) => s.id === "payments")!;
  return (
    <>
      <Callout icon={ShieldCheck}>No payment credentials, card numbers, keys or wallet addresses are entered or stored here. Nothing on this page moves money or changes a balance.</Callout>

      <Group id="methods" title="Payment methods" description={PAYMENTS_LIVE ? "Methods customers can use." : "Customers can't pay yet. Each method needs a verified processor first."} action={<ModuleLink href="/admin/payments">Payments</ModuleLink>}>
        <MethodRow name="Cryptocurrency" detail={`${CRYPTO_ASSETS.length} assets prepared. ${payments.detail}`} state="not_configured" />
        {PAYMENT_METHODS.map((m) => (
          <MethodRow key={m.id} name={m.name} detail={m.description} state={m.status === "planned" ? "planned" : "not_configured"} label={METHOD_STATUS_LABELS[m.status]} />
        ))}
      </Group>

      <Group id="wallet" title="Wallet" description="Rules for customer funds. Wallet balances are customer money, never revenue.">
        <Row label="Accounting currency" tag="code" help="Wallets, deposits and charges are in USD.">
          <Value>USD</Value>
        </Row>
        <Row label="Deposit limits" tag="code" help="Per deposit, as shown to customers on Add funds.">
          <Value>
            {usd(DEPOSIT_LIMITS.min)} – {usd(DEPOSIT_LIMITS.max)}
          </Value>
        </Row>
        <Row label="Deposit verification" tag="backend" help="A deposit is credited only after staff verify it against the processor's record.">
          <Value>Every deposit</Value>
        </Row>
        <Row id="st-pendingFlagHours" label="Flag pending deposits after" help="Pending deposits older than this would be highlighted for follow-up. They're never credited automatically." error={e.pendingFlagHours}>
          <div className="relative">
            <TextInput {...input("st-pendingFlagHours", e, "pendingFlagHours")} inputMode="numeric" value={v.pendingFlagHours} onChange={(x) => set({ pendingFlagHours: x.target.value })} className="pe-16 tabular-nums" />
            <span className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">hours</span>
          </div>
        </Row>
        {money("secondReviewAt", "Second review from", `Deposits at or above this amount need a second staff member to verify. Between ${usd(DEPOSIT_LIMITS.min)} and ${usd(DEPOSIT_LIMITS.max)}.`)}
      </Group>

      <Group id="adjustments" title="Refunds & adjustments" description="Controls on money returned to or taken from wallets." tag="backend">
        {money("refundApprovalAbove", "Approval needed above", "Refunds larger than this need an owner's approval.")}
        <Row id="st-adjustmentReason" label="Require a reason for adjustments" inline help="Every manual wallet adjustment records a written reason for the audit trail.">
          <Switch id="st-adjustmentReason" label="Require a reason for adjustments" describedBy="st-adjustmentReason-help" checked={v.adjustmentReason} onChange={(c) => set({ adjustmentReason: c })} />
        </Row>
      </Group>

      <Group id="security" title="Verification & reconciliation" description="Requirements real payment processing must meet." tag="backend">
        <ul className="space-y-2.5 py-4 text-[0.85rem]">
          {[
            "Credit a deposit only when the processor confirms settlement. Screenshots and customer-supplied transaction hashes are never proof.",
            "Match amount, currency and reference before crediting, and credit each payment exactly once.",
            "Refunds and adjustments need a reason, an approver and an immutable audit record.",
            "Reconcile deposits, order payments, refunds and wallet balances every day.",
            "Keep payment credentials on the server only, never in the browser.",
          ].map((x) => (
            <li key={x} className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>{x}</span>
            </li>
          ))}
        </ul>
      </Group>
    </>
  );
}

function MethodRow({ name, detail, state, label }: { name: string; detail: string; state: IntegrationState; label?: string }) {
  return (
    <div className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{name}</p>
        <p className="mt-0.5 text-[0.8rem] text-muted-foreground">{detail}</p>
      </div>
      <StateBadge state={state} label={label} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Notifications                                                             */
/* -------------------------------------------------------------------------- */

function NotificationsView({ v, set }: { v: SettingsValues["notifications"]; set: (p: Partial<SettingsValues["notifications"]>) => void }) {
  const on = NOTIFY_EVENTS.filter((x) => v.events[x.id]).length;
  return (
    <>
      <Callout icon={BellOff}>These are preferences only. Nothing is sent — no emails, SMS, push notifications or automated alerts — until a backend and delivery service exist.</Callout>
      <Group
        id="events"
        title="Notify me about"
        description={`${on} of ${NOTIFY_EVENTS.length} events on.`}
        action={
          <button type="button" onClick={() => set({ events: Object.fromEntries(NOTIFY_EVENTS.map((x) => [x.id, on < NOTIFY_EVENTS.length])) as typeof v.events })} className="rounded-md text-[0.82rem] font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none">
            {on < NOTIFY_EVENTS.length ? "Turn all on" : "Turn all off"}
          </button>
        }
      >
        {NOTIFY_EVENTS.map((x) => (
          <Row key={x.id} id={`st-n-${x.id}`} label={x.label} help={x.description} inline>
            <Switch id={`st-n-${x.id}`} label={x.label} describedBy={`st-n-${x.id}-help`} checked={v.events[x.id]} onChange={(c) => set({ events: { ...v.events, [x.id]: c } })} />
          </Row>
        ))}
      </Group>
      <Group id="delivery" title="Delivery" description="How notifications would reach you.">
        <Row label="Frequency" help={v.digest === "instant" ? "One notification per event." : "One summary each morning."}>
          <div className="sm:flex sm:justify-end">
            <Segmented<Digest>
              name="st-digest"
              label="Frequency"
              value={v.digest}
              options={[
                { value: "instant", label: "As it happens" },
                { value: "daily", label: "Daily summary" },
              ]}
              onChange={(x) => set({ digest: x })}
            />
          </div>
        </Row>
        <Row label="Email" tag="backend" help="Needs an email delivery service.">
          <div className="sm:flex sm:justify-end">
            <StateBadge state="not_configured" />
          </div>
        </Row>
        <Row label="In-app alerts" tag="backend" help="The bell in the top bar shows demo items only.">
          <div className="sm:flex sm:justify-end">
            <StateBadge state="demo" />
          </div>
        </Row>
      </Group>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Integrations                                                              */
/* -------------------------------------------------------------------------- */

type IntegrationState = "not_configured" | "planned" | "demo" | "connected";

const STATE: Record<IntegrationState, { label: string; className: string; Icon: LucideIcon }> = {
  not_configured: { label: "Not configured", className: "bg-off-soft text-off", Icon: CircleSlash },
  planned: { label: "Planned", className: "bg-muted text-muted-foreground", Icon: CircleDashed },
  demo: { label: "Demo only", className: "bg-secondary text-secondary-foreground", Icon: FlaskConical },
  connected: { label: "Connected", className: "bg-ok-soft text-ok", Icon: CircleCheck },
};

function StateBadge({ state, label }: { state: IntegrationState; label?: string }) {
  const { label: l, className, Icon } = STATE[state];
  return (
    <span className={cn("inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.72rem] font-semibold whitespace-nowrap ring-1 ring-current/15 ring-inset", className)}>
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      {label ?? l}
    </span>
  );
}

function IntegrationsView() {
  const providers = useProviders().filter((p) => !p.archived);
  const byStatus = providers.reduce<Record<string, number>>((m, p) => ({ ...m, [statusOf(p)]: (m[statusOf(p)] ?? 0) + 1 }), {});
  const sys = (id: string) => SYSTEMS.find((s) => s.id === id)!;
  const items: { id: string; name: string; category: string; state: IntegrationState; detail: string; href?: string; link?: string; tech?: string }[] = [
    {
      id: "payments",
      name: "Payment gateways",
      category: "Crypto, card and bank processors",
      state: sys("payments").state === "connected" ? "connected" : "not_configured",
      detail: sys("payments").detail,
      href: "/admin/payments",
      link: "Payments",
      tech: "Needs a server-side processor account, signed webhooks for settlement and an idempotent wallet ledger.",
    },
    {
      id: "providers",
      name: "Fulfilment providers",
      category: "Order delivery partners",
      state: providers.length ? "demo" : "not_configured",
      detail: providers.length
        ? `${providers.length} sample provider ${providers.length === 1 ? "record" : "records"}: ${Object.entries(byStatus)
            .map(([s, n]) => `${n} ${PROVIDER_STATUS[s as keyof typeof PROVIDER_STATUS].label.toLowerCase()}`)
            .join(", ")}. None is verified, so no order can be fulfilled.`
        : sys("providers").detail,
      href: "/admin/providers",
      link: "Providers",
      tech: "API keys must live in a server-side secret store. Connection checks run from the backend, never the browser.",
    },
    {
      id: "email",
      name: "Email delivery",
      category: "Transactional email",
      state: "not_configured",
      detail: "No email service is connected. Support replies, notifications and receipts aren't sent.",
      tech: "Needs a verified sending domain (SPF, DKIM, DMARC) and a delivery provider.",
    },
    {
      id: "analytics",
      name: "Analytics",
      category: "Reporting and insights",
      state: "demo",
      detail: "Built-in reports run on demo records. No external analytics or tracking scripts are installed.",
      href: "/admin/analytics",
      link: "Analytics",
    },
    {
      id: "referrals",
      name: "Referral rewards",
      category: "Program engine",
      state: "demo",
      detail: "Referrals and rewards are sample records. No reward is credited.",
      href: "/admin/referrals",
      link: "Referrals",
    },
    {
      id: "webhooks",
      name: "Automation & webhooks",
      category: "Outgoing events",
      state: "planned",
      detail: "Signed webhooks for order, payment and ticket events are planned.",
      tech: "Each endpoint will need a signing secret held on the server, retries and delivery logs.",
    },
    {
      id: "auth",
      name: "Authentication & backend",
      category: "Sign-in and access control",
      state: sys("auth").state === "connected" ? "connected" : "not_configured",
      detail: sys("auth").detail,
    },
  ];
  const counts = (Object.keys(STATE) as IntegrationState[]).map((s) => ({ s, n: items.filter((i) => i.state === s).length }));
  return (
    <>
      <div className="flex flex-wrap gap-2" aria-label="Integration summary" role="group">
        {counts.map(({ s, n }) => (
          <span key={s} className="inline-flex h-8 items-center gap-2 rounded-full border bg-card px-3 text-[0.82rem]">
            <span className="font-heading font-extrabold tabular-nums">{n}</span>
            <span className="text-muted-foreground">{STATE[s].label}</span>
          </span>
        ))}
      </div>
      <Callout>
        <span className="font-semibold">Connected</span> appears only after a backend verifies a real connection. Nothing here stores credentials or runs API tests.
      </Callout>
      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Integrations">
        {items.map((i) => (
          <li key={i.id} className="flex min-w-0 flex-col rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgb(15_16_20/0.04)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[0.95rem] font-bold">{i.name}</h3>
                <p className="text-xs text-muted-foreground">{i.category}</p>
              </div>
              <StateBadge state={i.state} />
            </div>
            <p className="mt-2.5 text-[0.82rem] leading-relaxed text-foreground/85">{i.detail}</p>
            {i.tech ? (
              <details className="group mt-2 text-xs text-muted-foreground">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-semibold hover:text-foreground focus-visible:rounded focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                  <ArrowRight className="size-3 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden /> Technical requirements
                </summary>
                <p className="mt-1.5 leading-relaxed">{i.tech}</p>
              </details>
            ) : null}
            {i.href ? (
              <div className="mt-auto pt-3">
                <ModuleLink href={i.href}>Open {i.link}</ModuleLink>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
