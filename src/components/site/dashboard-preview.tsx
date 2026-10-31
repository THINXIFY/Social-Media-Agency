"use client";

import * as React from "react";
import { motion } from "motion/react";
import {
  Bell,
  CheckCircle2,
  Headphones,
  History,
  LayoutDashboard,
  Plus,
  ShoppingBag,
  Timer,
  Wallet,
} from "lucide-react";
import { Logo, PlatformTile } from "@/components/brand";
import { SampleTag, Section, SectionHeading } from "@/components/site/primitives";
import { cn } from "@/lib/utils";
import { PLATFORM_BY_ID } from "@/lib/catalog";

const NAV = [
  { icon: LayoutDashboard, label: "Overview" },
  { icon: Plus, label: "New order" },
  { icon: History, label: "Order history" },
  { icon: Bell, label: "Notifications" },
  { icon: Headphones, label: "Support" },
];

const STATS = [
  { icon: ShoppingBag, label: "New orders", value: "2" },
  { icon: Timer, label: "Active orders", value: "3" },
  { icon: CheckCircle2, label: "Completed", value: "12" },
];

const HISTORY = [
  { id: "SV-0104", service: "Instagram Advertising Campaigns", platform: "instagram", status: "In progress" },
  { id: "SV-0103", service: "Facebook Page Promotion", platform: "facebook", status: "In review" },
  { id: "SV-0102", service: "TikTok Advertising Campaigns", platform: "tiktok", status: "Completed" },
  { id: "SV-0101", service: "Reddit Post Promotion", platform: "reddit", status: "Completed" },
];

const STATUS_TONE: Record<string, string> = {
  "In progress": "bg-secondary text-secondary-foreground",
  "In review": "bg-soon-soft text-soon",
  Completed: "bg-ok-soft text-ok",
};

const NOTIFICATIONS = [
  { title: "Campaign approved by platform", meta: "SV-0104 · sample" },
  { title: "Report ready to download", meta: "SV-0102 · sample" },
  { title: "Support replied to your ticket", meta: "Ticket #48 · sample" },
];

export function DashboardPreview() {
  return (
    <Section id="dashboard" className="overflow-hidden border-t bg-surface/60">
      <SectionHeading
        align="center"
        eyebrow="Customer dashboard"
        title="One calm place for every order."
        description="Balance, orders, history, notifications and support — designed to stay simple as your account grows."
      />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "0px 0px -80px 0px" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto max-w-6xl"
      >
        <div className="pointer-events-none absolute inset-x-20 -top-10 h-40 rounded-full bg-primary/20 blur-[90px]" aria-hidden />
        <div className="relative rounded-[1.75rem] border bg-card p-2 shadow-float">
          <div className="flex overflow-hidden rounded-[1.4rem] border bg-background" aria-label="Dashboard preview with sample data" role="img">
            {/* Sidebar */}
            <aside className="hidden w-56 shrink-0 flex-col border-r bg-card p-4 md:flex">
              <Logo className="scale-90 origin-left" />
              <ul className="mt-7 space-y-1">
                {NAV.map((n, i) => (
                  <li
                    key={n.label}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium",
                      i === 0 ? "bg-secondary text-secondary-foreground" : "text-muted-foreground",
                    )}
                  >
                    <n.icon className="size-4" aria-hidden />
                    {n.label}
                  </li>
                ))}
              </ul>
              <div className="mt-auto rounded-2xl bg-graphite p-4 text-white">
                <Headphones className="size-5 text-lime" aria-hidden />
                <p className="mt-2 text-sm font-semibold">Need help?</p>
                <p className="mt-0.5 text-xs text-white/60">Open a ticket from any order.</p>
              </div>
            </aside>

            {/* Main */}
            <div className="min-w-0 flex-1 p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Welcome back</p>
                  <p className="font-heading text-lg font-bold">Overview</p>
                </div>
                <SampleTag>Sample data</SampleTag>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[1.1fr_2fr]">
                {/* Balance */}
                <div className="relative overflow-hidden rounded-2xl bg-graphite p-5 text-white">
                  <div className="pointer-events-none absolute -right-10 -bottom-12 size-40 rounded-full bg-primary/60 blur-3xl" aria-hidden />
                  <div className="relative flex items-center gap-2 text-xs text-white/60">
                    <Wallet className="size-4 text-lime" aria-hidden /> Account balance
                  </div>
                  <p className="relative mt-3 font-heading text-3xl font-extrabold tabular-nums">$250.00</p>
                  <div className="relative mt-4 flex gap-2">
                    <span className="rounded-full bg-lime px-3 py-1.5 text-xs font-bold text-graphite">Add funds</span>
                    <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">Statement</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  {STATS.map((s) => (
                    <div key={s.label} className="rounded-2xl border bg-card p-3 sm:p-4">
                      <s.icon className="size-4 text-primary" aria-hidden />
                      <p className="mt-3 font-heading text-2xl font-extrabold tabular-nums">{s.value}</p>
                      <p className="text-[0.7rem] text-muted-foreground sm:text-xs">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1.1fr]">
                {/* History */}
                <div className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold">Order history</p>
                    <span className="text-xs font-semibold text-primary">View all</span>
                  </div>
                  <ul className="mt-3 divide-y">
                    {HISTORY.map((o) => (
                      <li key={o.id} className="flex items-center gap-3 py-2.5">
                        <PlatformTile platform={PLATFORM_BY_ID[o.platform]} size="xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{o.service}</span>
                          <span className="font-mono text-[0.7rem] text-muted-foreground">{o.id}</span>
                        </span>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold", STATUS_TONE[o.status])}>
                          {o.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Notifications */}
                <div className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold">Notifications</p>
                    <span className="grid size-5 place-items-center rounded-full bg-primary text-[0.65rem] font-bold text-primary-foreground">
                      3
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2.5">
                    {NOTIFICATIONS.map((n) => (
                      <li key={n.title} className="flex gap-2.5 rounded-xl bg-muted/60 p-2.5">
                        <Bell className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                        <span>
                          <span className="block text-xs font-semibold">{n.title}</span>
                          <span className="text-[0.7rem] text-muted-foreground">{n.meta}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          Visual preview of the planned customer dashboard. All figures are sample data.
        </p>
      </motion.div>
    </Section>
  );
}
