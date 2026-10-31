import Link from "next/link";
import { ArrowRight, Check, CircleDashed, Clock3 } from "lucide-react";
import { FEATURE_STATE_LABEL, type PlanFeatureState, type PlanId, PLAN_COMPARISON, PLANS } from "@/lib/ai/plans";
import { cn } from "@/lib/utils";

/* Server-rendered plan presentation (AI-09), shared by /pricing and the dashboard's Plans page. */

const FEATURE_ICON: Record<PlanFeatureState, typeof Check> = { included: Check, launching: Clock3, planned: CircleDashed };

export function PlanCards({ current, freeAction, headingLevel = "h3" }: { current?: PlanId; freeAction?: { href: string; label: string }; headingLevel?: "h2" | "h3" }) {
  const H = headingLevel;
  return (
    <ul className="grid gap-4 lg:grid-cols-3 lg:gap-5">
      {PLANS.map((plan) => {
        const featured = plan.id === "free";
        return (
          <li
            key={plan.id}
            className={cn(
              "relative flex flex-col overflow-hidden rounded-[1.75rem] p-6 sm:p-7",
              featured ? "bg-graphite text-white shadow-[0_30px_60px_-36px_rgb(32_33_39/0.9)] dark:bg-[#17181d] dark:ring-1 dark:ring-white/10" : "border bg-card shadow-soft",
            )}
          >
            {featured ? <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 size-64 rounded-full bg-primary/45 blur-3xl" /> : null}
            <div className="relative flex items-center justify-between gap-3">
              <H className="font-heading text-[1.3rem] font-extrabold tracking-tight">{plan.name}</H>
              {current === plan.id ? (
                <span className="rounded-full bg-lime px-2.5 py-1 text-[0.72rem] font-bold text-graphite">Your plan</span>
              ) : plan.price.kind === "not_announced" ? (
                <span className="rounded-full border border-dashed px-2.5 py-1 text-[0.72rem] font-semibold text-muted-foreground">Proposed</span>
              ) : null}
            </div>
            <p className={cn("relative mt-1 text-sm", featured ? "text-white/65" : "text-muted-foreground")}>{plan.audience}</p>
            <p className={cn("relative mt-5 font-heading font-extrabold tracking-tight", plan.price.kind === "free" ? "text-[2.4rem] leading-none" : "text-[1.35rem] leading-tight text-muted-foreground")}>
              {/* The plan's name already says "Free", so its price line says what that means. */}
              {plan.price.kind === "free" ? "No cost" : plan.price.label}
            </p>
            <p className={cn("relative mt-3 text-sm text-pretty", featured ? "text-white/80" : "text-muted-foreground")}>{plan.summary}</p>
            <ul className="relative mt-5 flex-1 space-y-2.5 border-t pt-5 text-sm" style={featured ? { borderColor: "rgb(255 255 255 / 0.12)" } : undefined}>
              {plan.features.map((f) => {
                const Icon = FEATURE_ICON[f.state];
                return (
                  <li key={f.label} className="flex gap-2.5">
                    <Icon
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        f.state === "included" ? (featured ? "text-lime" : "text-ok") : f.state === "launching" ? (featured ? "text-[#c4b5ff]" : "text-primary") : "text-muted-foreground",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className={cn("font-medium", f.state === "planned" && !featured && "text-muted-foreground")}>{f.label}</span>
                      <span className="sr-only"> ({FEATURE_STATE_LABEL[f.state]})</span>
                      {f.detail || f.state !== "included" ? (
                        <span className={cn("block text-[0.8rem]", featured ? "text-white/55" : "text-muted-foreground")}>
                          <span aria-hidden>{FEATURE_STATE_LABEL[f.state]}</span>
                          {f.detail ? <span aria-hidden> · </span> : null}
                          {f.detail}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="relative mt-6">
              {plan.id === "free" ? (
                current === "free" ? (
                  <p className="inline-flex h-11 w-full items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white/85">You&apos;re on this plan</p>
                ) : freeAction ? (
                  <Link href={freeAction.href} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-lime text-sm font-bold text-graphite transition-[filter] hover:brightness-95 focus-visible:ring-3 focus-visible:ring-lime/50 focus-visible:outline-none">
                    {freeAction.label} <ArrowRight className="size-4" aria-hidden />
                  </Link>
                ) : null
              ) : (
                <p className="inline-flex h-11 w-full items-center justify-center rounded-full border border-dashed text-sm font-semibold text-muted-foreground">Not available yet</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** One row per real capability; a table from 640px, stacked lists below. */
export function PlanComparison() {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[1.5rem] border bg-card shadow-soft sm:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Sociotix AI plan comparison</caption>
          <thead className="bg-surface">
            <tr>
              <th scope="col" className="w-[28%] px-5 py-3.5 font-semibold text-muted-foreground">
                <span className="sr-only">Feature</span>
              </th>
              {PLANS.map((p) => (
                <th key={p.id} scope="col" className="px-5 py-3.5 font-heading text-[0.95rem] font-extrabold">
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {PLAN_COMPARISON.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="px-5 py-3.5 font-semibold">
                  {row.label}
                </th>
                {PLANS.map((p) => (
                  <td key={p.id} className={cn("px-5 py-3.5", p.id === "free" ? "text-foreground" : "text-muted-foreground")}>
                    {row.values[p.id]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 sm:hidden">
        {PLANS.map((p) => (
          <dl key={p.id} className="rounded-2xl border bg-card p-4">
            <p className="font-heading font-extrabold">{p.name}</p>
            {PLAN_COMPARISON.map((row) => (
              <div key={row.label} className="mt-2 flex justify-between gap-4 border-t pt-2 text-sm">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="text-right font-medium">{row.values[p.id]}</dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
    </>
  );
}

export const BILLING_FACTS: { title: string; body: string }[] = [
  { title: "Nothing is billed today", body: "There are no paid subscriptions yet, so there's nothing to pay, cancel or renew." },
  { title: "No payment details stored", body: "Sociotix AI doesn't ask for or keep a card. Free needs no payment method." },
  { title: "Separate from your wallet", body: "Your Sociotix wallet is for SMM service orders only. It can't be used for AI plans." },
  { title: "Prices published first", body: "If paid plans are introduced, their prices and terms will be published here before anything can be bought." },
];
