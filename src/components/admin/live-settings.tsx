"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Bot, CircleCheck, CircleDashed, type LucideIcon, Landmark, Lock, Package, Settings2, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/live-account";
import { cn } from "@/lib/utils";
import { SelectInput } from "./form";
import { useReauth } from "./reauth";

/*
 * Live Platform Settings (Phase 5H-B). Reads GET /api/admin/settings. Only
 * reporting preferences are editable (Settings: Manage + re-authentication);
 * everything else is shown read-only with a link to where it's managed.
 */

type Settings = {
  can: { manage: boolean; staff: boolean };
  general: { appUrl: string; environment: string; demoMode: boolean; reporting: { timezone: string; defaultRange: string; version: number; updatedAt: string | null; label: string } };
  orders: { checkoutEnabled: boolean; catalog: { total: number; visible: number; priced: number; purchasable: number }; providers: { ready: number; total: number } };
  financial: { revenuePolicy: "deferred" | "on_completion"; paymentMethods: { id: string; name: string; configured: boolean; accepting: boolean }[] };
  integrations: {
    ai: { generationLive: boolean; generationEnabled: boolean; reason: string | null; emergencyPaused: boolean; providersVerified: number; providersTotal: number; keys: { total: number; active: number } };
    email: boolean;
    social: { connections: number; publishing: number };
  };
  security: {
    staffSession: { absoluteHours: number; idleMinutes: number };
    customerSession: { absoluteDays: number; idleDays: number };
    reauthMinutes: number;
    staffMfaRequired: boolean;
    staff: { role: string; active: number; withMfa: number }[] | null;
    recent: { id: string; label: string; actor: string; at: string }[];
  };
};

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "orders", label: "Orders & services", icon: Package },
  { id: "financial", label: "Financial policies", icon: Landmark },
  { id: "integrations", label: "AI & integrations", icon: Bot },
  { id: "security", label: "Security & administration", icon: ShieldCheck },
];
const RANGES = [
  ["today", "Today"],
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["90d", "Last 90 days"],
] as const;
const btn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

function timeZones() {
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    return ["UTC", ...all.filter((z) => z !== "UTC")];
  } catch {
    return ["UTC"];
  }
}

export function LiveAdminSettings() {
  const [data, setData] = React.useState<Settings | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [n, setN] = React.useState(0);
  const [active, setActive] = React.useState("general");
  React.useEffect(() => {
    let cancelled = false;
    api<Settings>("/api/admin/settings").then(
      (d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      },
      (e: unknown) => !cancelled && setError(e instanceof ApiError || e instanceof Error ? e.message : "Settings couldn't be loaded."),
    );
    return () => {
      cancelled = true;
    };
  }, [n]);

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header>
        <p className="text-[0.8rem] font-medium text-muted-foreground">Administration</p>
        <h1 className="mt-1.5 font-heading text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">Platform settings</h1>
        <p className="mt-1 max-w-2xl text-[0.95rem] text-muted-foreground">How SociVanta is configured right now. Settings you can change are marked; everything else links to where it&apos;s managed.</p>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="min-w-0">
          <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-20 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
            {SECTIONS.map((s) => (
              <li key={s.id} className="shrink-0">
                <a
                  href={`#${s.id}`}
                  onClick={() => setActive(s.id)}
                  aria-current={active === s.id ? "true" : undefined}
                  className={cn("flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none", active === s.id ? "bg-primary/[0.09] text-primary dark:bg-primary/20 dark:text-[#c4b5ff]" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
                >
                  <s.icon className="size-4 shrink-0" aria-hidden /> {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 max-w-4xl space-y-6">
          {error && !data ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/[0.05] p-4 text-sm">
              <span>
                <span className="font-semibold">Settings couldn&apos;t be loaded.</span> <span className="text-muted-foreground">{error}</span>
              </span>
              <button type="button" onClick={() => setN((x) => x + 1)} className={cn(btn, "border bg-card hover:bg-muted")}>
                Try again
              </button>
            </div>
          ) : !data ? (
            <div aria-busy="true" className="space-y-4">
              <span className="sr-only">Loading settings…</span>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-48 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
              ))}
            </div>
          ) : (
            <Body d={data} onSaved={(reporting) => setData({ ...data, general: { ...data.general, reporting: { ...data.general.reporting, ...reporting } } })} />
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ id, icon: Icon, title, description, children }: { id: string; icon: LucideIcon; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 rounded-2xl border bg-card">
      <div className="flex items-start gap-3 border-b p-4 sm:p-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/[0.08] text-primary dark:bg-primary/20 dark:text-[#c4b5ff]" aria-hidden>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-h`} className="font-heading text-base font-bold">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="divide-y">{children}</div>
    </section>
  );
}

function Row({ label, hint, value, state, href, linkLabel }: { label: string; hint?: string; value: React.ReactNode; state?: "ok" | "off" | "neutral"; href?: string; linkLabel?: string }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
        <span className="inline-flex items-center gap-1.5 text-sm">
          {state === "ok" ? <CircleCheck className="size-4 text-ok" aria-hidden /> : state === "off" ? <CircleDashed className="size-4 text-off" aria-hidden /> : null}
          <span className="font-medium">{value}</span>
        </span>
        {href ? (
          <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline dark:text-[#b9a6ff]">
            {linkLabel ?? "Manage"} <ArrowRight className="size-3" aria-hidden />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.68rem] font-semibold text-muted-foreground">
            <Lock className="size-3" aria-hidden /> Read-only
          </span>
        )}
      </div>
    </div>
  );
}

function Body({ d, onSaved }: { d: Settings; onSaved: (r: Partial<Settings["general"]["reporting"]>) => void }) {
  const ai = d.integrations.ai;
  return (
    <>
      <Card id="general" icon={Settings2} title="General" description="Platform details and how reports present dates.">
        <Row label="Site address" hint="APP_URL, used in emails and referral links." value={d.general.appUrl} />
        <Row label="Environment" value={d.general.environment} />
        <Row label="Demo records" hint="When on, admin pages show illustrative data instead of live records." value={d.general.demoMode ? "On" : "Off (live records)"} state={d.general.demoMode ? "off" : "ok"} />
        <ReportingForm d={d} onSaved={onSaved} />
      </Card>

      <Card id="orders" icon={Package} title="Orders & services" description="Current readiness. Change these in their own workspaces, where each change is reviewed.">
        <Row label="Checkout" hint="When off, customers can browse the catalog but can't order." value={d.orders.checkoutEnabled ? "On" : "Off"} state={d.orders.checkoutEnabled ? "ok" : "off"} />
        <Row label="Orderable services" hint="Visible, priced and passing all six eligibility checks." value={`${d.orders.catalog.purchasable} of ${d.orders.catalog.total}`} state={d.orders.catalog.purchasable ? "ok" : "off"} href="/admin/services" linkLabel="Services & Pricing" />
        <Row label="Fulfilment providers" hint="Enabled and supplier-reviewed." value={d.orders.providers.ready ? `${d.orders.providers.ready} ready` : "Not configured"} state={d.orders.providers.ready ? "ok" : "off"} href="/admin/providers" linkLabel="Providers" />
      </Card>

      <Card id="financial" icon={Landmark} title="Financial policies" description="Accounting policies are locked here. Changing them needs a separate, approved release.">
        <Row
          label="Revenue recognition"
          hint={d.financial.revenuePolicy === "deferred" ? "Deferred: completed orders aren't recognised as revenue yet. Set by REVENUE_RECOGNITION_POLICY." : "On completion: an order becomes revenue when it's completed with delivery evidence."}
          value={d.financial.revenuePolicy === "deferred" ? "Deferred" : "On completion"}
        />
        {d.financial.paymentMethods.map((m) => (
          <Row key={m.id} label={m.name} hint="Deposit method" value={m.accepting ? "Accepting deposits" : "Not configured"} state={m.accepting ? "ok" : "off"} href="/admin/payments" linkLabel="Payments" />
        ))}
        <div className="px-4 py-4 sm:px-5">
          <p className="text-sm font-semibold">How the money figures differ</p>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {[
              ["Recognised revenue", "Completed orders under the recognition policy, net of refunds. The only figure that is earned income."],
              ["Order value", "The gross price of orders placed, including open and cancelled ones. Not revenue."],
              ["Wallet funding", "Deposits credited to customer wallets. Money held for customers, not revenue."],
              ["Liabilities", "Wallet balances and payments for orders not yet delivered: money still owed to customers."],
            ].map(([t, x]) => (
              <div key={t}>
                <dt className="font-medium">{t}</dt>
                <dd className="text-xs text-muted-foreground">{x}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>

      <Card id="integrations" icon={Bot} title="AI & integrations" description="Actual readiness, checked now. Nothing here switches an integration on.">
        <Row label="AI generation" hint={ai.emergencyPaused ? "Paused by the emergency switch." : (ai.reason ?? undefined)} value={ai.emergencyPaused ? "Paused" : ai.generationLive ? "Live" : "Off"} state={ai.generationLive && !ai.emergencyPaused ? "ok" : "off"} href="/admin/ai" linkLabel="AI Management" />
        <Row label="AI providers" hint={`${ai.keys.active} active key${ai.keys.active === 1 ? "" : "s"} saved. Key values are never shown.`} value={ai.providersVerified ? `${ai.providersVerified} of ${ai.providersTotal} verified` : "None verified"} state={ai.providersVerified ? "ok" : "off"} href="/admin/ai" linkLabel="AI Management" />
        <Row label="Email delivery" hint="Needed for verification and password emails." value={d.integrations.email ? "Configured" : "Not configured"} state={d.integrations.email ? "ok" : "off"} />
        <Row label="Social connections" hint="Networks customers can connect." value={d.integrations.social.connections ? `${d.integrations.social.connections} enabled` : "Not configured"} state={d.integrations.social.connections ? "ok" : "off"} />
        <Row label="External publishing" hint="Separate from internal automations." value={d.integrations.social.publishing ? `${d.integrations.social.publishing} network${d.integrations.social.publishing === 1 ? "" : "s"}` : "Off"} state={d.integrations.social.publishing ? "ok" : "off"} />
      </Card>

      <Card id="security" icon={ShieldCheck} title="Security & administration" description="Session and sign-in rules enforced by the server.">
        <Row label="Staff two-factor authentication" value="Required for every staff account" state="ok" />
        <Row label="Staff sessions" hint={`Signed out after ${d.security.staffSession.idleMinutes} minutes without activity.`} value={`${d.security.staffSession.absoluteHours} hours at most`} />
        <Row label="Sensitive changes" hint="Settings, payouts and similar actions ask for your password and code again." value={`Re-confirm every ${d.security.reauthMinutes} minutes`} />
        <Row label="Customer sessions" hint={`Signed out after ${d.security.customerSession.idleDays} days without activity.`} value={`${d.security.customerSession.absoluteDays} days at most`} />
        {d.security.staff ? (
          <Row label="Active staff" hint={d.security.staff.map((s) => `${s.role}: ${s.active}${s.withMfa < s.active ? ` (${s.active - s.withMfa} without a confirmed authenticator)` : ""}`).join(" · ") || "No active staff."} value={`${d.security.staff.reduce((a, s) => a + s.active, 0)} people`} href="/admin/staff" linkLabel="Staff & Permissions" />
        ) : null}
        <div className="px-4 py-4 sm:px-5">
          <p className="text-sm font-semibold">Recent administrative changes</p>
          {d.security.recent.length ? (
            <ul className="mt-2 divide-y text-sm">
              {d.security.recent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                  <span className="min-w-0 font-medium">{r.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.actor} · {new Date(r.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Nothing recorded yet.</p>
          )}
        </div>
      </Card>
    </>
  );
}

function ReportingForm({ d, onSaved }: { d: Settings; onSaved: (r: Partial<Settings["general"]["reporting"]>) => void }) {
  const saved = d.general.reporting;
  const [value, setValue] = React.useState({ timezone: saved.timezone, defaultRange: saved.defaultRange });
  const [status, setStatus] = React.useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const { guard, dialog } = useReauth();
  const zones = React.useMemo(() => timeZones(), []);
  const dirty = value.timezone !== saved.timezone || value.defaultRange !== saved.defaultRange;
  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      let out: { reporting: Settings["general"]["reporting"] } | null = null;
      await guard(async () => {
        out = await api("/api/admin/settings/reporting", { method: "POST", body: JSON.stringify({ value, version: saved.version }) });
      });
      if (out) onSaved((out as { reporting: Settings["general"]["reporting"] }).reporting);
      setStatus({ tone: "ok", text: "Saved. Overview and Reports now use these preferences." });
    } catch (e) {
      setStatus({ tone: "error", text: e instanceof ApiError || e instanceof Error ? e.message : "That didn't save." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">Reporting preferences</p>
        <span className={cn("rounded-full px-2 py-0.5 text-[0.68rem] font-semibold", d.can.manage ? "bg-primary/10 text-primary dark:text-[#c4b5ff]" : "bg-muted text-muted-foreground")}>{d.can.manage ? "Editable" : "View only"}</span>
        {dirty ? <span className="rounded-full bg-soon-soft px-2 py-0.5 text-[0.68rem] font-semibold text-soon">Unsaved changes</span> : null}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">Report days start at midnight in this timezone, including across daylight-saving changes. Stored times stay in UTC, and CSV exports use UTC.</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="set-tz" className="mb-1 block text-xs font-semibold text-muted-foreground">
            Reporting timezone
          </label>
          <SelectInput id="set-tz" value={value.timezone} onChange={(e) => setValue((v) => ({ ...v, timezone: e.target.value }))} disabled={!d.can.manage || busy}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </SelectInput>
        </div>
        <div>
          <label htmlFor="set-range" className="mb-1 block text-xs font-semibold text-muted-foreground">
            Default date range
          </label>
          <SelectInput id="set-range" value={value.defaultRange} onChange={(e) => setValue((v) => ({ ...v, defaultRange: e.target.value }))} disabled={!d.can.manage || busy}>
            {RANGES.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </SelectInput>
        </div>
      </div>
      {d.can.manage ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={save} disabled={!dirty || busy} className={cn(btn, "bg-primary text-primary-foreground hover:bg-primary/90")}>
            {busy ? "Saving…" : "Save preferences"}
          </button>
          <button type="button" onClick={() => setValue({ timezone: saved.timezone, defaultRange: saved.defaultRange })} disabled={!dirty || busy} className={cn(btn, "border bg-card hover:bg-muted")}>
            Discard
          </button>
          <span className="text-xs text-muted-foreground">Currently {saved.label}{saved.updatedAt ? ` · last changed ${new Date(saved.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : " · default"}</span>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Changing these needs Settings: Manage.</p>
      )}
      {status ? (
        <p role={status.tone === "error" ? "alert" : "status"} className={cn("mt-2 text-sm", status.tone === "error" ? "text-destructive" : "text-ok")}>
          {status.text}
        </p>
      ) : null}
      {dialog}
    </div>
  );
}
