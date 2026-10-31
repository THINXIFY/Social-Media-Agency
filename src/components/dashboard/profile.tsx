"use client";

import * as React from "react";
import { BadgeCheck, Briefcase, Camera, Check, CircleAlert, Copy, FlaskConical, LoaderCircle, Pencil, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { DEMO_USER, formatDate } from "@/lib/demo-account";
import {
  type AccountType,
  COUNTRIES,
  type ProfileData,
  type ProfileErrors,
  TIMEZONES,
  timezoneLabel,
  validateProfile,
} from "@/lib/account";
import { saveDisplay, useDisplay } from "@/lib/i18n";
import { ApiError } from "@/lib/live-account";
import { cn } from "@/lib/utils";
import { PendingBadge, Section } from "./account-ui";
import { saveProfile, setAvatarPreview, useAvatarPreview, useProfile } from "./demo-store";
import { useLiveAccount } from "./live-account";
import { DemoTag, enter, Panel } from "./shared";
import { Avatar } from "./top-bar";


const inputClass =
  "h-11 w-full rounded-xl border bg-card px-3.5 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground hover:border-foreground/20 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-primary/15 aria-invalid:border-destructive/60 aria-invalid:focus-visible:ring-destructive/15";

const FIELD_ORDER: (keyof ProfileErrors)[] = ["firstName", "lastName", "displayName", "email", "phone", "businessName", "website", "reference"];
const FIELD_IDS: Record<keyof ProfileErrors, string> = {
  firstName: "p-first",
  lastName: "p-last",
  displayName: "p-display",
  email: "p-email",
  phone: "p-phone",
  businessName: "p-biz-name",
  website: "p-biz-site",
  reference: "p-biz-ref",
};

export function MyProfile() {
  // Re-render when language, currency, time zone or date format change.
  useDisplay();
  const { profile, fullName } = useProfile();
  // Live mode: saved to the account on the server. Demo mode: this browser only.
  const live = useLiveAccount();
  const [saving, setSaving] = React.useState(false);
  const [failure, setFailure] = React.useState<{ message: string; field?: keyof ProfileErrors } | null>(null);
  const [draft, setDraft] = React.useState<ProfileData | null>(null);
  // Errors appear after the first save attempt, then update live as the customer types.
  const [submitted, setSubmitted] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const editing = draft !== null;
  const current = draft ?? profile;
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(profile);
  const errors: ProfileErrors = editing && submitted ? validateProfile(current) : {};
  // The server re-validates everything; a field it rejects is marked like a local error.
  if (failure?.field && editing && !errors[failure.field]) errors[failure.field] = failure.message;

  const set = <K extends keyof ProfileData>(key: K, value: ProfileData[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  };
  const setBiz = (key: keyof ProfileData["business"], value: string) =>
    setDraft((d) => (d ? { ...d, business: { ...d.business, [key]: value } } : d));

  const startEdit = () => {
    setDraft(profile);
    setSubmitted(false);
    setFailure(null);
    setNote(null);
    requestAnimationFrame(() => document.getElementById("p-first")?.focus());
  };

  const cancel = () => {
    setDraft(null);
    setSubmitted(false);
    setFailure(null);
    setNote(dirty ? "Changes discarded." : null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || saving) return;
    const trimmed: ProfileData = {
      ...draft,
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      displayName: draft.displayName.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      business: { ...draft.business, name: draft.business.name.trim(), website: draft.business.website.trim(), reference: draft.business.reference.trim() },
    };
    const found = validateProfile(trimmed);
    setSubmitted(true);
    const first = FIELD_ORDER.find((k) => found[k]);
    if (first) {
      document.getElementById(FIELD_IDS[first])?.focus();
      return;
    }
    if (live) {
      setSaving(true);
      setFailure(null);
      try {
        await live.saveProfile({
          firstName: trimmed.firstName,
          lastName: trimmed.lastName,
          displayName: trimmed.displayName,
          phone: trimmed.phone,
          country: trimmed.country,
          accountType: trimmed.accountType,
          businessName: trimmed.accountType === "business" ? trimmed.business.name : "",
          website: trimmed.accountType === "business" ? trimmed.business.website : "",
        });
        // Time zone is a display preference; the preference sync saves it to the account.
        if (trimmed.timezone !== profile.timezone) saveDisplay({ timezone: trimmed.timezone });
        setDraft(null);
        setSubmitted(false);
        setNote("Profile saved.");
      } catch (err) {
        // The form stays open with the customer's changes so nothing is lost.
        const field = err instanceof ApiError && err.field && err.field in FIELD_IDS ? (err.field as keyof ProfileErrors) : undefined;
        setFailure({ message: err instanceof Error ? err.message : "Your profile wasn't saved. Please try again.", field });
        if (field) document.getElementById(FIELD_IDS[field])?.focus();
      } finally {
        setSaving(false);
      }
      return;
    }
    saveProfile(trimmed);
    setDraft(null);
    setSubmitted(false);
    setNote("Profile saved in this browser. Demo only — nothing was sent or verified.");
  };

  const e = [0, 1, 2].map(enter);
  const err = (k: keyof ProfileErrors) => (editing ? errors[k] : undefined);

  return (
    <div className="mx-auto max-w-[90rem] px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      <header className={cn("flex flex-wrap items-end justify-between gap-4", e[0].className)} style={e[0].style}>
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">My Profile</h1>
          <p className="mt-1 max-w-xl text-[0.95rem] text-muted-foreground">Manage your personal information and account details.</p>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_10px_28px_-12px_rgb(112_71_235/0.8)] transition-all hover:-translate-y-px hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none"
          >
            <Pencil className="size-4" aria-hidden /> Edit Profile
          </button>
        ) : null}
      </header>

      <div role="status" className="empty:hidden">
        {note ? (
          <p className="mt-5 flex items-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-card px-4 py-3 text-sm">
            {live ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : <FlaskConical className="size-4 shrink-0 text-primary" aria-hidden />}
            {note}
          </p>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start">
        <ProfileCard className={e[1].className} live={live} profile={current} fullName={editing ? `${current.firstName} ${current.lastName}`.trim() : fullName} />

        <form onSubmit={save} noValidate className={cn("min-w-0", e[2].className)} aria-label="Profile details">
          <Panel className="divide-y px-5 py-7 sm:px-7">
            <Section
              id="personal"
              title="Personal information"
              description="How you appear in SociVanta and how we can reach you."
              icon={UserRound}
            >
              {editing ? (
                <fieldset className="mb-5">
                  <legend className="text-sm font-semibold">Account type</legend>
                  <div className="mt-1.5 inline-grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1" role="radiogroup" aria-label="Account type">
                    {(["personal", "business"] as AccountType[]).map((t) => {
                      const on = current.accountType === t;
                      const Icon = t === "personal" ? UserRound : Briefcase;
                      return (
                        <label
                          key={t}
                          className={cn(
                            "flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-muted-foreground transition-colors select-none has-focus-visible:ring-2 has-focus-visible:ring-primary/40",
                            on && "bg-card text-foreground shadow-sm",
                          )}
                        >
                          <input type="radio" name="account-type" value={t} checked={on} onChange={() => set("accountType", t)} className="sr-only" />
                          <Icon className="size-4" aria-hidden />
                          {t === "personal" ? "Personal" : "Business"}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}

              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                <Field id="p-first" label="First name" value={current.firstName} editing={editing} error={err("firstName")}>
                  <input id="p-first" autoComplete="given-name" value={current.firstName} onChange={(ev) => set("firstName", ev.target.value)} className={inputClass} {...invalid("p-first", err("firstName"))} />
                </Field>
                <Field id="p-last" label="Last name" value={current.lastName} editing={editing} error={err("lastName")}>
                  <input id="p-last" autoComplete="family-name" value={current.lastName} onChange={(ev) => set("lastName", ev.target.value)} className={inputClass} {...invalid("p-last", err("lastName"))} />
                </Field>
                <Field id="p-display" label="Display name" hint="Shown in greetings across your dashboard." value={current.displayName} editing={editing} error={err("displayName")}>
                  <input id="p-display" autoComplete="nickname" value={current.displayName} maxLength={30} onChange={(ev) => set("displayName", ev.target.value)} className={inputClass} {...invalid("p-display", err("displayName"), "p-display-hint")} />
                </Field>
                <Field
                  id="p-email"
                  label="Email address"
                  value={current.email}
                  badge={live ? <VerifiedBadge verified={live.profile.emailVerified} /> : <PendingBadge>Not verified</PendingBadge>}
                  hint={editing ? (live ? "Your sign-in email. Contact support to change it." : "Email changes will need verification once sign-in is live.") : undefined}
                  editing={editing && !live}
                  error={err("email")}
                >
                  <input id="p-email" type="email" autoComplete="email" value={current.email} onChange={(ev) => set("email", ev.target.value)} className={inputClass} {...invalid("p-email", err("email"), "p-email-hint")} />
                </Field>
                <Field id="p-phone" label="Phone number" optional value={current.phone} badge={current.phone ? <PendingBadge>Not verified</PendingBadge> : null} editing={editing} error={err("phone")}>
                  <input id="p-phone" type="tel" autoComplete="tel" placeholder="+1 555 010 2030" value={current.phone} onChange={(ev) => set("phone", ev.target.value)} className={inputClass} {...invalid("p-phone", err("phone"))} />
                </Field>
                <Field id="p-country" label="Country" value={current.country} editing={editing}>
                  <select id="p-country" autoComplete="country-name" value={current.country} onChange={(ev) => set("country", ev.target.value)} className={inputClass}>
                    {!current.country ? <option value="">Choose a country</option> : null}
                    {COUNTRIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field id="p-tz" label="Timezone" value={timezoneLabel(current.timezone)} editing={editing}>
                  <select id="p-tz" value={current.timezone} onChange={(ev) => set("timezone", ev.target.value)} className={inputClass}>
                    {TIMEZONES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </Section>

            {current.accountType === "business" ? (
              <Section id="business" title="Business information" description="Shown on future invoices and receipts." icon={Briefcase}>
                <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                  <Field id="p-biz-name" label="Business name" value={current.business.name} editing={editing} error={err("businessName")}>
                    <input id="p-biz-name" autoComplete="organization" value={current.business.name} onChange={(ev) => setBiz("name", ev.target.value)} className={inputClass} {...invalid("p-biz-name", err("businessName"))} />
                  </Field>
                  <Field id="p-biz-site" label="Website" optional value={current.business.website} editing={editing} error={err("website")}>
                    <input id="p-biz-site" type="url" inputMode="url" autoComplete="url" placeholder="example.com" value={current.business.website} onChange={(ev) => setBiz("website", ev.target.value)} className={inputClass} {...invalid("p-biz-site", err("website"))} />
                  </Field>
                  <Field id="p-biz-country" label="Company country" value={current.business.country} editing={editing}>
                    <select id="p-biz-country" value={current.business.country} onChange={(ev) => setBiz("country", ev.target.value)} className={inputClass}>
                      {COUNTRIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  {live ? null : <Field id="p-biz-ref" label="Tax or company reference" optional hint="Only if you'd like it on invoices. Never upload documents here." value={current.business.reference} editing={editing} error={err("reference")}>
                    <input id="p-biz-ref" value={current.business.reference} maxLength={30} onChange={(ev) => setBiz("reference", ev.target.value)} className={inputClass} {...invalid("p-biz-ref", err("reference"), "p-biz-ref-hint")} />
                  </Field>}
                </div>
              </Section>
            ) : null}

            <Section id="account" title="Account details" description={live ? "Set when your account was created." : "Fixed for this demo account."} icon={ShieldCheck}>
              <dl className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Account ID</dt>
                  <dd className="mt-1">
                    <CopyId value={live ? live.profile.accountRef : DEMO_USER.accountId} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Preferred currency</dt>
                  <dd className="mt-1 text-sm font-semibold">
                    USD <span className="font-normal text-muted-foreground">· more currencies later</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Preferred language</dt>
                  <dd className="mt-1 text-sm font-semibold">
                    English <span className="font-normal text-muted-foreground">· more languages later</span>
                  </dd>
                </div>
              </dl>
            </Section>
          </Panel>

          {editing ? (
            <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-20 mt-4 lg:bottom-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/95 px-4 py-3 shadow-float backdrop-blur">
                <p className="flex items-center gap-2 text-sm" aria-live="polite">
                  <span className={cn("size-2 rounded-full", failure ? "bg-destructive" : dirty ? "bg-soon" : "bg-muted-foreground/40")} aria-hidden />
                  {saving ? (
                    <span className="font-medium">Saving…</span>
                  ) : failure && !failure.field ? (
                    <span className="font-medium text-destructive">{failure.message}</span>
                  ) : Object.keys(errors).length ? (
                    <span className="font-medium text-destructive">Fix the highlighted fields</span>
                  ) : dirty ? (
                    <span className="font-medium">Unsaved changes</span>
                  ) : (
                    <span className="text-muted-foreground">No changes yet</span>
                  )}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={cancel}
                    className="inline-flex h-10 items-center rounded-full border px-4 text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!dirty || saving}
                    aria-busy={saving || undefined}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {saving ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Check className="size-4" aria-hidden />} {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}

const invalid = (id: string, error?: string, hintId?: string) => ({
  "aria-invalid": error ? true : undefined,
  "aria-describedby": error ? `${id}-error` : hintId,
});

function Field({
  id,
  label,
  value,
  editing,
  error,
  hint,
  badge,
  optional,
  children,
}: {
  id: string;
  label: string;
  value: string;
  editing: boolean;
  error?: string;
  hint?: string;
  badge?: React.ReactNode;
  optional?: boolean;
  children: React.ReactNode;
}) {
  if (!editing) {
    return (
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {label}
          {badge}
        </p>
        <p className={cn("mt-1 truncate text-sm", value ? "font-semibold" : "text-muted-foreground")}>{value || "Not added"}</p>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold">
        {label}
        {optional ? <span className="font-normal text-muted-foreground">(optional)</span> : null}
        {badge}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function CopyId({ value }: { value: string }) {
  const [state, setState] = React.useState<"idle" | "done" | "failed">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("done");
        } catch {
          setState("failed");
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[0.8rem] font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
      aria-label={`Copy account ID ${value}`}
    >
      {value}
      {state === "done" ? <Check className="size-3.5 text-ok" aria-hidden /> : <Copy className="size-3.5 text-muted-foreground" aria-hidden />}
      <span className="sr-only" aria-live="polite">
        {state === "done" ? "Account ID copied" : state === "failed" ? "Couldn't copy" : ""}
      </span>
    </button>
  );
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-primary/10 px-2 text-[0.7rem] font-semibold text-primary">
      <BadgeCheck className="size-3" aria-hidden /> Verified
    </span>
  ) : (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2 text-[0.7rem] font-semibold text-muted-foreground">
      <CircleAlert className="size-3" aria-hidden /> Not verified
    </span>
  );
}

function ProfileCard({ profile, fullName, live, className }: { profile: ProfileData; fullName: string; live: ReturnType<typeof useLiveAccount>; className?: string }) {
  const photo = useAvatarPreview();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setFileError("Choose an image file, like PNG or JPG.");
    if (file.size > 5 * 1024 * 1024) return setFileError("Choose an image under 5 MB.");
    setFileError(null);
    setAvatarPreview(URL.createObjectURL(file));
  };

  return (
    <aside aria-label="Profile overview" className={cn("lg:sticky lg:top-24", className)}>
      <Panel className="overflow-hidden">
        <div className="relative h-20 bg-graphite dark:bg-[#17181e]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgb(112_71_235/0.55),transparent_60%),radial-gradient(circle_at_100%_100%,rgb(200_255_82/0.18),transparent_50%)]" aria-hidden />
        </div>
        <div className="px-5 pb-5">
          <div className="relative z-10 -mt-10 flex items-end justify-between gap-3">
            <Avatar className="size-20 text-2xl ring-4 ring-card" />
            <div className="flex gap-1.5 pb-1">
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden aria-label="Profile photo" onChange={(ev) => { pick(ev.target.files?.[0]); ev.target.value = ""; }} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
              >
                <Camera className="size-3.5" aria-hidden /> {photo ? "Change" : "Preview photo"}
              </button>
              {photo ? (
                <button
                  type="button"
                  onClick={() => setAvatarPreview(null)}
                  className="grid size-8 place-items-center rounded-full border bg-card text-muted-foreground transition-colors hover:text-destructive focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
                  aria-label="Remove photo preview"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
          {fileError ? (
            <p className="mt-2 text-xs font-medium text-destructive" role="alert">
              {fileError}
            </p>
          ) : photo ? (
            <p className="mt-2 text-xs text-muted-foreground">Preview only — not uploaded or saved. It clears when you reload.</p>
          ) : null}

          <p className="mt-4 font-heading text-xl leading-tight font-bold">{fullName}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{profile.email}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-secondary px-2.5 text-xs font-semibold text-secondary-foreground">
              {profile.accountType === "business" ? <Briefcase className="size-3" aria-hidden /> : <UserRound className="size-3" aria-hidden />}
              {profile.accountType === "business" ? "Business" : "Personal"}
            </span>
            {live ? null : <DemoTag className="h-6 text-primary">Demo account</DemoTag>}
          </div>
          <dl className="mt-5 space-y-2.5 border-t pt-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="font-medium">{formatDate(live ? live.profile.createdAt : DEMO_USER.memberSince, { year: true })}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Email</dt>
              <dd>{live ? <VerifiedBadge verified={live.profile.emailVerified} /> : <PendingBadge>Not verified</PendingBadge>}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Sign-in</dt>
              <dd>{live ? <span className="text-sm font-medium">Email &amp; password</span> : <PendingBadge>Not enabled yet</PendingBadge>}</dd>
            </div>
          </dl>
        </div>
      </Panel>
    </aside>
  );
}
