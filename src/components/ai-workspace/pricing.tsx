import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { AiMark } from "@/components/ai/parts";
import { BILLING_FACTS, PlanCards, PlanComparison } from "./plans";

/* The public Sociotix AI plans page (AI-09). Server-rendered; every claim matches what works today. */

export const PRICING_TITLE = "Sociotix AI Plans & Pricing — Free to Start";
export const PRICING_DESCRIPTION =
  "See what the free Sociotix AI plan includes for social media planning and automation today, and how the proposed Pro and Business plans will work. No card needed.";

export const PRICING_FAQ: { q: string; a: string }[] = [
  { q: "Is Sociotix AI free?", a: "Yes. Every account is on the Free plan and no payment details are needed. The social workspace and Automation Studio work today, and each AI tool will include a daily free allowance when it launches." },
  { q: "How much will Pro and Business cost?", a: "Pricing hasn't been announced. Pro and Business are proposed plans, and nothing in them is available or billed yet." },
  { q: "When do the AI tools launch?", a: "Each tool launches once its AI service has been tested. Until then its page shows Coming soon, and nothing runs or counts toward an allowance." },
  { q: "What counts toward my daily allowance?", a: "Only completed runs. Requests that hit an AI service error, time out or return something we can't use are never counted. Allowances reset every day at 00:00 UTC." },
  { q: "Can I pay for AI with my Sociotix wallet?", a: "No. Your wallet is only for SMM service orders, and wallet balances will never be used for AI plans." },
  { q: "How are SMM services priced?", a: "Each SMM service has its own price, shown before you order. Those prices are separate from Sociotix AI plans." },
];

export function PricingPage() {
  return (
    <>
      <section className="relative overflow-hidden border-b">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_24rem_at_50%_-10%,rgb(112_71_235/0.14),transparent_70%)] dark:bg-[radial-gradient(50rem_24rem_at_50%_-10%,rgb(112_71_235/0.28),transparent_70%)]" />
        <div className="relative mx-auto max-w-3xl px-4 pt-14 pb-12 text-center sm:px-6 sm:pt-20 sm:pb-16">
          <AiMark />
          <h1 className="mt-5 font-heading text-[2.2rem] leading-[1.05] font-extrabold tracking-tight text-balance sm:text-[3.4rem]">Sociotix AI plans &amp; pricing</h1>
          <p className="mx-auto mt-5 max-w-2xl text-[1.05rem] text-pretty text-muted-foreground sm:text-lg">
            Sociotix AI is free to start. Free includes the social media planning workspace and Automation Studio today, plus a daily allowance for each AI tool as it launches. Pro and Business are proposed plans whose pricing hasn&apos;t been announced.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-2.5">
            <Link href="/register" className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_10px_24px_-14px_rgb(112_71_235/0.9)] hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/35 focus-visible:outline-none">
              Create a free account <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href="/ai-tools" className="inline-flex h-11 items-center rounded-full border bg-card px-5 text-sm font-semibold hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
              Explore the AI tools
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="plans-heading" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
        <h2 id="plans-heading" className="font-heading text-[1.6rem] font-extrabold tracking-tight sm:text-[2rem]">
          Choose what fits
        </h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">Free is the only plan available. The others show where Sociotix AI is heading, clearly marked as proposed.</p>
        <div className="mt-8">
          <PlanCards freeAction={{ href: "/register", label: "Start free" }} />
        </div>
      </section>

      <section aria-labelledby="compare-heading" className="mx-auto max-w-6xl px-4 pb-14 sm:px-6 sm:pb-18">
        <h2 id="compare-heading" className="font-heading text-[1.6rem] font-extrabold tracking-tight sm:text-[2rem]">
          Compare plans
        </h2>
        <div className="mt-6">
          <PlanComparison />
        </div>
      </section>

      <section aria-labelledby="billing-heading" className="border-y bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
          <h2 id="billing-heading" className="font-heading text-[1.6rem] font-extrabold tracking-tight sm:text-[2rem]">
            How billing works
          </h2>
          <dl className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
            {BILLING_FACTS.map((f) => (
              <div key={f.title} className="border-t-2 border-primary/30 pt-4">
                <dt className="font-semibold">{f.title}</dt>
                <dd className="mt-1.5 text-sm text-pretty text-muted-foreground">{f.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-18">
        <h2 id="faq-heading" className="font-heading text-[1.6rem] font-extrabold tracking-tight sm:text-[2rem]">
          Questions about plans
        </h2>
        <div className="mt-6 divide-y rounded-[1.5rem] border bg-card">
          {PRICING_FAQ.map((f) => (
            <details key={f.q} className="group px-5 sm:px-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4.5 font-semibold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/30 [&::-webkit-details-marker]:hidden">
                <h3 className="text-[1rem]">{f.q}</h3>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
              </summary>
              <p className="pb-5 text-[0.95rem] text-pretty text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          Want to see what&apos;s coming?{" "}
          <Link href="/ai-tools" className="font-semibold text-primary hover:underline">
            Browse the AI tools
          </Link>{" "}
          or read about{" "}
          <Link href="/social-management" className="font-semibold text-primary hover:underline">
            social media management in Sociotix
          </Link>
          .
        </p>
      </section>
    </>
  );
}
