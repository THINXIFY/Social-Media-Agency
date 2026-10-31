import { CircleAlert, CircleCheck, CircleDashed } from "lucide-react";
import { formatDateTime } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { AiDiagnostics, AiToolStats } from "@/server/ai/diagnostics";
import { Card, CardHeader } from "./ui";

/*
 * AI usage & health (AI-02). A read-only operations view: whether generation
 * is live (and if not, exactly why), spend against the daily budget, and how
 * requests ended. Metadata only — prompts and results are never stored.
 */

const dollars = (micros: number) => `$${(micros / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: micros > 0 && micros < 10_000 ? 4 : 2 })}`;

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "bad" | "warn" }) {
  return (
    <div className="rounded-xl border bg-background px-4 py-3 dark:bg-white/[0.02]">
      <p className="text-[0.75rem] font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums", tone === "bad" && "text-destructive", tone === "warn" && "text-amber-600 dark:text-amber-400")}>{value}</p>
    </div>
  );
}

function ToolTable({ id, title, rows }: { id: string; title: string; rows: AiToolStats[] }) {
  return (
    <Card aria-labelledby={id} className="p-5">
      <CardHeader id={id} title={title} description="Quota and budget rejections are requests that never reached the provider." />
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No AI requests in this period.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                {["Tool", "Requests", "Succeeded", "Provider failures", "Invalid output", "Over quota", "Over budget", "Spend", "Avg latency"].map((h, i) => (
                  <th key={h} scope="col" className={cn("py-2 pr-3 font-semibold", i > 0 && "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {rows.map((r) => (
                <tr key={r.toolId}>
                  <th scope="row" className="py-2.5 pr-3 font-medium">
                    {r.name}
                  </th>
                  <td className="py-2.5 pr-3 text-right">{r.requests}</td>
                  <td className="py-2.5 pr-3 text-right">{r.ok}</td>
                  <td className={cn("py-2.5 pr-3 text-right", r.failed > 0 && "font-semibold text-destructive")}>{r.failed}</td>
                  <td className={cn("py-2.5 pr-3 text-right", r.invalid > 0 && "text-amber-600 dark:text-amber-400")}>{r.invalid}</td>
                  <td className="py-2.5 pr-3 text-right">{r.quotaRejected}</td>
                  <td className="py-2.5 pr-3 text-right">{r.budgetRejected}</td>
                  <td className="py-2.5 pr-3 text-right">{dollars(r.spendMicros)}</td>
                  <td className="py-2.5 pr-3 text-right">{r.avgLatencyMs === null ? "—" : `${(r.avgLatencyMs / 1000).toFixed(1)} s`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function AiDiagnosticsView({ data }: { data: AiDiagnostics }) {
  const { config, budget, today, week } = data;
  const used = budget.dailyMicros > 0 ? Math.min(100, Math.round(((budget.spentMicros + budget.reservedMicros) / budget.dailyMicros) * 100)) : 0;
  const checks = [
    { label: "Provider", ok: config.provider !== "none", detail: config.provider === "none" ? "Not configured" : config.provider },
    { label: "Model", ok: Boolean(config.model) && config.priced, detail: config.model ? `${config.model}${config.priced ? "" : " (no known price)"}` : "Not set" },
    { label: "Daily budget", ok: budget.dailyMicros > 0, detail: budget.dailyMicros > 0 ? dollars(budget.dailyMicros) : "Zero — no spending allowed" },
    { label: "Provider ready", ok: config.providerReady, detail: config.providerReady ? "Credentials, adapter and price in place" : "Not ready" },
    { label: "Launch switch", ok: config.generationEnabled, detail: config.generationEnabled ? "On" : "Off until the live provider test passes" },
  ];

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header>
        <p className="text-[0.8rem] font-medium text-muted-foreground">SociVanta AI</p>
        {/* Rendered inside AI Management (which owns the page h1), so this is a section heading. */}
        <h2 className="mt-1.5 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-[2.1rem]">AI usage &amp; health</h2>
        <p className="mt-1 max-w-2xl text-[0.95rem] text-muted-foreground">Whether Content Studio can generate, today&apos;s spend against the budget, and how requests ended. Usage metadata only — prompts and results are never stored.</p>
      </header>

      <div className="mt-7 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card aria-labelledby="ai-status" className="p-5">
          <CardHeader
            id="ai-status"
            title="Generation status"
            action={
              <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[0.72rem] font-semibold", config.live ? "bg-lime text-graphite" : "bg-muted text-muted-foreground")}>
                {config.live ? <CircleCheck className="size-3.5" aria-hidden /> : <CircleDashed className="size-3.5" aria-hidden />}
                {config.live ? "Live" : "Off"}
              </span>
            }
          />
          {config.reason ? <p className="mt-3 rounded-xl bg-subtle px-3.5 py-2.5 text-sm dark:bg-white/[0.03]">{config.reason}</p> : null}
          <ul className="mt-4 divide-y text-sm">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center justify-between gap-4 py-2.5">
                <span className="flex items-center gap-2 font-medium">
                  {c.ok ? <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" aria-label="Ready" /> : <CircleAlert className="size-4 text-muted-foreground" aria-label="Not ready" />}
                  {c.label}
                </span>
                <span className="truncate text-right text-muted-foreground">{c.detail}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Timeout {config.timeoutMs / 1000}s per call · Anonymous use {config.anonymousEnabled ? "on" : "off"} · The API key is never shown.
          </p>
        </Card>

        <Card aria-labelledby="ai-today" className="p-5">
          <CardHeader id="ai-today" title="Today (UTC)" description="Spend includes reservations for requests still in progress." />
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold tabular-nums">
                {dollars(budget.spentMicros)} spent{budget.reservedMicros > 0 ? ` + ${dollars(budget.reservedMicros)} reserved` : ""}
              </span>
              <span className="text-muted-foreground tabular-nums">of {dollars(budget.dailyMicros)}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Daily budget used" aria-valuenow={used} aria-valuemin={0} aria-valuemax={100}>
              <div className={cn("h-full rounded-full", used >= 90 ? "bg-destructive" : "bg-primary")} style={{ width: `${used}%` }} />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Requests" value={today.requests} />
            <Stat label="Succeeded" value={today.ok} />
            <Stat label="Provider failures" value={today.failed} tone={today.failed > 0 ? "bad" : undefined} />
            <Stat label="Invalid output" value={today.invalid} tone={today.invalid > 0 ? "warn" : undefined} />
            <Stat label="Quota rejections" value={today.quotaRejected} />
            <Stat label="Budget rejections" value={today.budgetRejected} tone={today.budgetRejected > 0 ? "warn" : undefined} />
          </div>
        </Card>
      </div>

      <div className="mt-5 space-y-5">
        <ToolTable id="ai-tools-today" title="By tool — today" rows={today.tools} />
        <ToolTable id="ai-tools-week" title={`By tool — last 7 days (${week.requests} requests, ${dollars(week.spendMicros)})`} rows={week.tools} />
        <Card aria-labelledby="ai-failures" className="p-5">
          <CardHeader id="ai-failures" title="Recent failures" description="Outages, timeouts and unusable output from the last 7 days. None of these used a customer's free run." />
          {data.recentFailures.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No failures in the last 7 days.</p>
          ) : (
            <ul className="mt-4 divide-y text-sm">
              {data.recentFailures.map((f, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="font-medium">{f.name}</span>
                  <span className="text-muted-foreground">
                    {f.status === "invalid_output" ? "Invalid output" : f.status === "timeout" ? "Timeout" : `Provider error${f.errorCode ? ` (${f.errorCode})` : ""}`} · {formatDateTime(f.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
