"use client";

import * as React from "react";
import { motion } from "motion/react";
import {
  CircleCheck,
  Eye,
  Heart,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Music2,
  Rocket,
  SearchCheck,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_META, type ServiceCategory, type ServiceStatus } from "@/lib/catalog";

export function Section({
  id,
  className,
  children,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section id={id} className={cn("relative py-20 sm:py-28", className)} {...props}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
  action,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <Reveal
      className={cn(
        "mb-12 flex flex-col gap-6 sm:mb-14",
        align === "center" ? "items-center text-center" : "md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-4 text-3xl font-bold text-balance sm:text-[2.6rem] sm:leading-[1.1]">{title}</h2>
        {description ? (
          <p className="mt-4 text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </Reveal>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary uppercase",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-lime ring-2 ring-primary/25" aria-hidden />
      {children}
    </span>
  );
}

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -60px 0px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

const STATUS_STYLES: Record<ServiceStatus, { className: string; Icon: typeof CircleCheck }> = {
  active: { className: "bg-ok-soft text-ok", Icon: CircleCheck },
  preview: { className: "bg-muted text-muted-foreground", Icon: Eye },
};

export const CATEGORY_ICONS: Record<ServiceCategory, LucideIcon> = {
  audience: Users,
  engagement: Heart,
  views: Eye,
  comments: MessageCircle,
  advertising: Megaphone,
  promotion: Rocket,
  messaging: MessagesSquare,
  seo: SearchCheck,
  community: UsersRound,
  music: Music2,
};

export function StatusBadge({ status, className }: { status: ServiceStatus; className?: string }) {
  const { className: tone, Icon } = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[0.72rem] font-semibold whitespace-nowrap",
        tone,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {STATUS_META[status].label}
    </span>
  );
}

/** Small "sample data" marker used on every illustrative preview. */
export function SampleTag({ children = "Illustrative preview", className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-dashed border-primary/40 bg-secondary/60 px-2.5 py-1 text-[0.7rem] font-semibold tracking-wide text-secondary-foreground uppercase",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-primary" aria-hidden />
      {children}
    </span>
  );
}
