"use client";

import * as React from "react";
import {
  Archive,
  CircleCheck,
  CircleHelp,
  Clock3,
  CreditCard,
  FileImage,
  FileText,
  type LucideIcon,
  Package,
  Paperclip,
  Plus,
  ShieldAlert,
  Undo2,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import {
  type TicketAttachment,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
  TICKET_STATUS_LABELS,
} from "@/lib/demo-support";
import { cn } from "@/lib/utils";

export const CATEGORY_ICONS: Record<TicketCategory, LucideIcon> = {
  order: Package,
  payment: CreditCard,
  refund: Undo2,
  service: CircleHelp,
  account: UserRound,
  technical: Wrench,
  other: CircleHelp,
};

const STATUS_STYLES: Record<TicketStatus, { className: string; Icon: LucideIcon }> = {
  awaiting: { className: "bg-secondary text-secondary-foreground", Icon: Clock3 },
  waiting: { className: "bg-soon-soft text-soon", Icon: ShieldAlert },
  resolved: { className: "bg-ok-soft text-ok", Icon: CircleCheck },
  closed: { className: "bg-off-soft text-off", Icon: Archive },
};

export function TicketStatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  const { className: tone, Icon } = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.72rem] font-semibold whitespace-nowrap ring-1 ring-current/15 ring-inset",
        tone,
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      {TICKET_STATUS_LABELS[status]}
    </span>
  );
}

/** Only urgent tickets get a badge, so the red stays meaningful. */
export function PriorityBadge({ priority, className }: { priority: TicketPriority; className?: string }) {
  if (priority !== "urgent") return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full bg-destructive/10 px-2 text-[0.65rem] font-bold tracking-wide whitespace-nowrap text-destructive uppercase",
        className,
      )}
    >
      Urgent
    </span>
  );
}

export function CategoryIcon({ category, className }: { category: TicketCategory; className?: string }) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground/70", className)} aria-hidden>
      <Icon className="size-[1.1rem]" />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Simulated attachments                                                     */
/* -------------------------------------------------------------------------- */

const SAMPLE_ATTACHMENTS: TicketAttachment[] = [
  { name: "screenshot-order-page.png", size: "248 KB", kind: "image" },
  { name: "payment-receipt.pdf", size: "96 KB", kind: "pdf" },
  { name: "screenshot-profile-settings.png", size: "312 KB", kind: "image" },
];

export const MAX_ATTACHMENTS = SAMPLE_ATTACHMENTS.length;

export function AttachmentChip({ file, onRemove, tone = "default" }: { file: TicketAttachment; onRemove?: () => void; tone?: "default" | "onPrimary" }) {
  const Icon = file.kind === "pdf" ? FileText : FileImage;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-xl border py-1.5 pe-2 ps-2 text-xs",
        tone === "onPrimary" ? "border-white/20 bg-white/10 text-white" : "bg-card",
      )}
    >
      <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", tone === "onPrimary" ? "bg-white/15" : "bg-muted text-muted-foreground")}>
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold">{file.name}</span>
        <span className={cn("block text-[0.68rem]", tone === "onPrimary" ? "text-white/70" : "text-muted-foreground")}>
          {file.size} · demo file, no preview
        </span>
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
          aria-label={`Remove ${file.name}`}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

/** Adds sample file details. No file picker opens and nothing is uploaded. */
export function DemoAttachments({ files, onChange }: { files: TicketAttachment[]; onChange: (files: TicketAttachment[]) => void }) {
  const next = SAMPLE_ATTACHMENTS.find((s) => !files.some((f) => f.name === s.name));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {files.map((f) => (
        <AttachmentChip key={f.name} file={f} onRemove={() => onChange(files.filter((x) => x.name !== f.name))} />
      ))}
      {next ? (
        <button
          type="button"
          onClick={() => onChange([...files, next])}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none"
        >
          {files.length ? <Plus className="size-3.5" aria-hidden /> : <Paperclip className="size-3.5" aria-hidden />}
          Add demo attachment
        </button>
      ) : null}
    </div>
  );
}
