"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardCheck, HelpCircle, Lightbulb, Lock, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./results";

/*
 * Smart Order Assistant results (AI-05). The service card, limits, price,
 * order fields and the draft link all come from the catalog via the server;
 * the model contributes only the explanations. "Continue in New Order" opens
 * the existing wizard with the service and quantity filled in — the customer
 * still reviews every step and confirms there. Nothing is ordered here.
 */

interface Card {
  id: string;
  name: string;
  description: string;
  platform: { id: string; name: string };
  categoryLabel: string;
  status: "available" | "preview";
  price: { amount: number; unit: string } | null;
  limits: { min: number | null; max: number | null } | null;
  orderable: boolean;
}

export interface OrderAssistantResult {
  service: Card | null;
  why: string;
  draft: { serviceId: string; quantity: number | null; quantityNote: string; href: string | null } | null;
  checklist: { label: string; required: boolean; tip: string | null }[];
  tips: string[];
  alternatives: Card[];
  clarifyingQuestion: string | null;
  checkoutOpen: boolean;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n < 1 ? 3 : 2, maximumFractionDigits: 3 })}`;
const range = (l: Card["limits"]) => (l ? `${(l.min ?? 1).toLocaleString("en-US")}${l.max ? `–${l.max.toLocaleString("en-US")}` : "+"}` : null);

function asText(r: OrderAssistantResult) {
  if (!r.service) return [r.clarifyingQuestion, ...r.tips.map((t) => `- ${t}`)].filter(Boolean).join("\n");
  return [
    `${r.service.name} (${r.service.platform.name})`,
    r.why,
    r.draft?.quantity ? `Quantity: ${r.draft.quantity.toLocaleString("en-US")}` : r.draft?.quantityNote,
    "",
    "What the order needs:",
    ...r.checklist.map((c) => `- ${c.label}${c.required ? "" : " (optional)"}${c.tip ? `: ${c.tip}` : ""}`),
    ...(r.tips.length ? ["", "Before you order:", ...r.tips.map((t) => `- ${t}`)] : []),
  ]
    .filter((x) => x !== undefined)
    .join("\n");
}

function Price({ c }: { c: Card }) {
  return c.status === "available" && c.price ? (
    <>
      <span className="font-semibold tabular-nums">{money(c.price.amount)}</span> <span className="text-muted-foreground">{c.price.unit} · listed price</span>
    </>
  ) : (
    <span className="text-muted-foreground">Not available to order yet</span>
  );
}

export function OrderAssistantResults({ result: r }: { result: OrderAssistantResult }) {
  if (!r.service || !r.draft)
    return (
      <div className="space-y-5">
        <div role="status" className="rounded-2xl border border-dashed bg-card px-5 py-6">
          <p className="flex items-center gap-2 font-heading font-bold">
            <HelpCircle className="size-4 text-primary" aria-hidden /> Tell us a little more
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">{r.clarifyingQuestion}</p>
        </div>
        {r.alternatives.length ? <Alternatives cards={r.alternatives} /> : null}
      </div>
    );

  const s = r.service;
  const lim = range(s.limits);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">From the SociVanta catalog. Service details, limits and prices come from SociVanta, not the AI.</p>
        <CopyButton text={asText(r)} label="Copy the plan">
          Copy
        </CopyButton>
      </div>

      {/* Recommended service and the draft */}
      <section aria-labelledby="oa-service" className="overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgb(32_33_39/0.04)]">
        <div className="p-4 sm:p-5">
          <p className="text-xs font-medium text-muted-foreground">
            {s.platform.name} · {s.categoryLabel}
          </p>
          <h3 id="oa-service" className="mt-0.5 font-heading text-lg font-bold">
            {s.name}
          </h3>
          <p className="mt-2 text-sm leading-relaxed">{r.why}</p>
        </div>
        <dl className="grid grid-cols-1 border-t text-sm sm:grid-cols-3 sm:divide-x">
          <div className="px-4 py-3 sm:px-5">
            <dt className="text-xs text-muted-foreground">Quantity</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{r.draft.quantity ? r.draft.quantity.toLocaleString("en-US") : "You choose"}</dd>
          </div>
          <div className="border-t px-4 py-3 sm:border-t-0 sm:px-5">
            <dt className="text-xs text-muted-foreground">Allowed range</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{lim ?? "No quantity"}</dd>
          </div>
          <div className="border-t px-4 py-3 sm:border-t-0 sm:px-5">
            <dt className="text-xs text-muted-foreground">Price</dt>
            <dd className="mt-0.5">
              <Price c={s} />
            </dd>
          </div>
        </dl>
        <p className="border-t px-4 py-2.5 text-xs text-muted-foreground sm:px-5">{r.draft.quantityNote}</p>
        <div className="flex flex-col gap-3 border-t bg-subtle/50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:bg-white/[0.015]">
          {r.draft.href ? (
            <>
              <p className="text-xs text-muted-foreground">Opens New Order with this service{r.draft.quantity ? " and quantity" : ""} filled in. You add the rest, review, and confirm — nothing is ordered until then.</p>
              <Link href={r.draft.href} prefetch={false} className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_8px_18px_-10px_rgb(112_71_235/0.9)] hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none">
                Continue in New Order <ArrowRight className="size-4" aria-hidden />
              </Link>
            </>
          ) : (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
              {s.status !== "available" ? "This service can't be ordered yet, so there's no draft to open. Your plan below still applies once it's available." : "Ordering isn't open yet, so there's no draft to open. Your plan below still applies once it is."}
            </p>
          )}
        </div>
      </section>

      {r.checklist.length ? (
        <section aria-labelledby="oa-check">
          <h3 id="oa-check" className="flex items-center gap-2 font-heading text-[0.98rem] font-bold">
            <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20 dark:text-[#c9bcff]" aria-hidden>
              <ClipboardCheck className="size-3.5" />
            </span>
            What the order will ask for
          </h3>
          <ul className="mt-3 divide-y rounded-2xl border">
            {r.checklist.map((c) => (
              <li key={c.label} className="flex gap-3 px-4 py-3">
                <CheckCircle2 className={cn("mt-0.5 size-4 shrink-0", c.required ? "text-primary" : "text-muted-foreground")} aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {c.label} {c.required ? null : <span className="font-normal text-muted-foreground">(optional)</span>}
                  </p>
                  {c.tip ? <p className="mt-0.5 text-sm text-muted-foreground">{c.tip}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {r.tips.length || r.clarifyingQuestion ? (
        <section aria-labelledby="oa-tips" className="rounded-2xl border bg-lime/15 p-4 sm:p-5 dark:bg-lime/[0.06]">
          <h3 id="oa-tips" className="flex items-center gap-2 font-heading text-[0.98rem] font-bold">
            <Lightbulb className="size-4 text-primary" aria-hidden /> Before you order
          </h3>
          <ul className="mt-2.5 space-y-1.5 text-sm leading-relaxed">
            {r.tips.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          {r.clarifyingQuestion ? <p className="mt-3 text-sm text-muted-foreground">To fine-tune this: {r.clarifyingQuestion}</p> : null}
        </section>
      ) : null}

      {r.alternatives.length ? <Alternatives cards={r.alternatives} /> : null}
    </div>
  );
}

function Alternatives({ cards }: { cards: Card[] }) {
  return (
    <section aria-labelledby="oa-alt">
      <h3 id="oa-alt" className="flex items-center gap-2 font-heading text-[0.98rem] font-bold">
        <PackageCheck className="size-4 text-primary" aria-hidden /> Also worth a look
      </h3>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <li key={c.id} className="rounded-2xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">
              {c.platform.name} · {c.categoryLabel}
            </p>
            <p className="mt-0.5 font-semibold">{c.name}</p>
            <p className="mt-2 text-sm">
              <Price c={c} />
            </p>
            {range(c.limits) ? <p className="mt-0.5 text-xs text-muted-foreground">Quantity {range(c.limits)}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
