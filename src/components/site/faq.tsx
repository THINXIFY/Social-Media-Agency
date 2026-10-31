"use client";

import { Accordion } from "@base-ui/react/accordion";
import { ArrowUpRight, BookOpen, Mail, MessageCircle, Plus, Ticket } from "lucide-react";
import { usePreview } from "@/components/providers";
import { Eyebrow, Reveal, Section } from "@/components/site/primitives";

const FAQS = [
  {
    id: "account",
    q: "How do I create an account?",
    a: "Registration opens in the next phase. You'll sign up with an email address, verify it, and use one account for every platform in the catalog.",
  },
  {
    id: "availability",
    q: "Which services are available right now?",
    a: "You can browse, search and filter every service in the catalog — from followers and likes to ads and SEO — and open any of them for a short summary. Ordering isn't open yet: each service becomes orderable once its pricing, fulfilment and compliance are verified, and at that point it shows a price and a Ready to order label.",
  },
  {
    id: "guarantees",
    q: "Are results guaranteed?",
    a: "No. Each service shows how it's delivered before you order, but outcomes such as retention, reach and timing depend on the platform and aren't guaranteed. Please make sure any service you order fits the rules of the platform you use it on.",
  },
  {
    id: "payments",
    q: "How do payments work?",
    a: "You'll be able to add funds to your account balance with a supported payment method, or pay directly for a single order. Prices are shown only once they're configured for a service — we never display placeholder prices.",
  },
  {
    id: "tracking",
    q: "How do I track my order?",
    a: "Each order moves through clear milestones — placed, paid, verified, in delivery and completed. A milestone only changes once it's confirmed, and every change is written to the order's activity log.",
  },
  {
    id: "delivery",
    q: "How long does an order take?",
    a: "It depends on the service and on the platform itself — for example, how long an ad takes to be approved. Each service will show its expected timeline before you order. We don't promise speeds or results we can't control.",
  },
  {
    id: "support",
    q: "How do I get support?",
    a: "Support is attached to each order, so our team sees the full context straight away. You'll also be able to open a general ticket from your dashboard.",
  },
];

export function Faq() {
  const preview = usePreview();
  const soon = (title: string) => () =>
    preview({
      title: `${title} — preview`,
      description: "Support channels open with customer accounts in the next build phase.",
    });

  return (
    <Section id="faq" className="border-t bg-surface/60">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)] lg:gap-14">
        {/* Intro */}
        <Reveal className="lg:sticky lg:top-24 lg:self-start">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="mt-4 text-3xl font-bold text-balance sm:text-[2.6rem] sm:leading-[1.1]">
            Questions, <span className="text-primary">answered.</span>
          </h2>
          <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">
            Everything you need to know about accounts, services, payments and tracking — before your first order.
          </p>

          {/* Support card — desktop position */}
          <div className="mt-8 hidden lg:block">
            <SupportCard onAction={soon} />
          </div>
        </Reveal>

        {/* Questions */}
        <Reveal delay={0.08}>
          <Accordion.Root defaultValue={["availability"]} className="overflow-hidden rounded-3xl border bg-card shadow-soft">
            {FAQS.map((f, i) => (
              <Accordion.Item
                key={f.id}
                value={f.id}
                className="group/item relative border-b transition-colors duration-300 last:border-b-0 data-[open]:bg-secondary/40"
              >
                <span
                  className="absolute inset-y-3 left-0 w-0.5 scale-y-0 rounded-full bg-primary transition-transform duration-300 group-data-[open]/item:scale-y-100"
                  aria-hidden
                />
                <Accordion.Header>
                  <Accordion.Trigger className="group/trigger flex w-full items-center gap-4 px-5 py-4 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:ring-inset sm:px-6 sm:py-[1.15rem]">
                    <span className="hidden w-6 shrink-0 font-mono text-xs text-muted-foreground transition-colors group-data-[panel-open]/trigger:text-primary sm:block">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 text-[0.95rem] font-semibold">{f.q}</span>
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border bg-background text-muted-foreground transition-all duration-300 group-hover/trigger:border-primary/40 group-hover/trigger:text-primary group-data-[panel-open]/trigger:rotate-45 group-data-[panel-open]/trigger:border-primary group-data-[panel-open]/trigger:bg-primary group-data-[panel-open]/trigger:text-primary-foreground">
                      <Plus className="size-3.5" aria-hidden />
                    </span>
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Panel className="h-[var(--accordion-panel-height)] overflow-hidden opacity-100 transition-[height,opacity] duration-300 ease-out data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[starting-style]:h-0 data-[starting-style]:opacity-0">
                  <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground sm:pr-16 sm:pl-16">{f.a}</p>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </Reveal>

        {/* Support card — mobile/tablet position */}
        <div className="lg:hidden">
          <SupportCard onAction={soon} />
        </div>
      </div>
    </Section>
  );
}

function SupportCard({ onAction }: { onAction: (title: string) => () => void }) {
  const channels = [
    { icon: Ticket, label: "Order tickets" },
    { icon: Mail, label: "Email" },
    { icon: MessageCircle, label: "Live chat" },
  ];
  return (
    <div className="relative overflow-hidden rounded-3xl bg-graphite p-6 text-white">
      <div className="pointer-events-none absolute -top-16 -right-12 size-44 rounded-full bg-primary/50 blur-3xl" aria-hidden />
      <div className="relative">
        <p className="font-heading text-lg font-bold">Still have a question?</p>
        <p className="mt-1.5 text-sm leading-relaxed text-white/65">
          Our team can help with services, orders and payments. Support opens alongside customer accounts.
        </p>
        <ul className="mt-5 flex flex-wrap gap-1.5" aria-label="Planned support channels">
          {channels.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-2.5 py-1 text-xs text-white/80 ring-1 ring-white/10"
            >
              <Icon className="size-3.5 text-lime" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onAction("Contact support")}
            className="btn-shine group inline-flex h-10 items-center gap-1.5 rounded-full bg-lime px-4 text-sm font-semibold text-graphite transition-transform hover:-translate-y-px"
          >
            Contact support
            <ArrowUpRight
              className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              aria-hidden
            />
          </button>
          <button
            type="button"
            onClick={onAction("Help center")}
            className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white/80 ring-1 ring-white/15 transition-colors hover:bg-white/10 hover:text-white"
          >
            <BookOpen className="size-4" aria-hidden /> Help center
          </button>
        </div>
      </div>
    </div>
  );
}
