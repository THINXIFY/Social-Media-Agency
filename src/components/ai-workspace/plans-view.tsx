import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { PlanId } from "@/lib/ai/plans";
import { AI_ROUTES } from "@/lib/ai/workspace";
import { AiHeader, aiPage, sectionTitle } from "./parts";
import { BILLING_FACTS, PlanCards, PlanComparison } from "./plans";

/** The signed-in Plans page: the customer's plan (always decided on the server) and an honest comparison. */
export function PlansView({ current }: { current: PlanId }) {
  return (
    <div className={aiPage}>
      <AiHeader kicker="Plans" title="Plans" subtitle="You're on Free. Pro and Business are proposed plans: their pricing hasn't been announced and nothing in them is available yet." />
      <div className="mt-7 flex flex-col gap-9 sm:mt-9">
        <section aria-labelledby="plans-title">
          <h2 id="plans-title" className="sr-only">
            Compare plans
          </h2>
          <PlanCards current={current} />
        </section>
        <section aria-labelledby="compare-title">
          <h2 id="compare-title" className={sectionTitle}>
            At a glance
          </h2>
          <div className="mt-4">
            <PlanComparison />
          </div>
        </section>
        <section aria-labelledby="billing-title" className="rounded-[1.5rem] bg-surface p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="billing-title" className={sectionTitle}>
              Billing
            </h2>
            <Link href={AI_ROUTES.pricing} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline dark:text-[#c4b5ff]">
              Public pricing page <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </div>
          <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {BILLING_FACTS.map((f) => (
              <div key={f.title}>
                <dt className="font-semibold">{f.title}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">{f.body}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
