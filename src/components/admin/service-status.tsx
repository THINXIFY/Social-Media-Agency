import { Archive, CircleCheck, Eye, EyeOff, FilePen, Lock, type LucideIcon, Tag } from "lucide-react";
import type { PricingStatus, PurchaseStatus } from "@/lib/admin-services";
import { cn } from "@/lib/utils";

/* Pricing and purchase are separate: a priced service isn't orderable until every activation requirement is met. */

const base = "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.72rem] font-semibold whitespace-nowrap";

const PRICING: Record<PricingStatus, { label: string; className: string; Icon: LucideIcon; title: string }> = {
  priced: { label: "Priced", className: "bg-ok-soft text-ok", Icon: CircleCheck, title: "Cost and customer price are saved." },
  not_priced: { label: "Not priced", className: "bg-muted text-muted-foreground", Icon: Tag, title: "Cost or customer price isn't set." },
};

const PURCHASE: Record<PurchaseStatus, { label: string; className: string; Icon: LucideIcon; title: string }> = {
  ready: { label: "Purchase ready", className: "bg-primary/12 text-primary dark:bg-primary/20", Icon: CircleCheck, title: "Every activation requirement is met." },
  not_enabled: {
    label: "Purchase off",
    className: "border border-current/25 text-muted-foreground",
    Icon: Lock,
    title: "Needs fulfilment, platform-policy and payment-provider approval.",
  },
};

export function PricingBadge({ status, className }: { status: PricingStatus; className?: string }) {
  const { label, className: tone, Icon, title } = PRICING[status];
  return (
    <span className={cn(base, tone, className)} title={title}>
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      {label}
    </span>
  );
}

export function PurchaseBadge({ status, className }: { status: PurchaseStatus; className?: string }) {
  const { label, className: tone, Icon, title } = PURCHASE[status];
  return (
    <span className={cn(base, tone, className)} title={title}>
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      {label}
    </span>
  );
}

export function LifecycleBadge({ lifecycle }: { lifecycle: "archived" | "draft" | null }) {
  if (!lifecycle) return null;
  const archived = lifecycle === "archived";
  return (
    <span className={cn(base, archived ? "bg-off-soft text-off" : "border border-dashed border-current/40 text-muted-foreground")}>
      {archived ? <Archive className="size-3" aria-hidden /> : <FilePen className="size-3" aria-hidden />}
      {archived ? "Archived" : "Draft"}
    </span>
  );
}

export function VisibilityBadge({ visible }: { visible: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-[0.68rem] font-semibold",
        visible ? "text-ok" : "bg-muted text-muted-foreground",
      )}
    >
      {visible ? <Eye className="size-3" aria-hidden /> : <EyeOff className="size-3" aria-hidden />}
      {visible ? "Visible" : "Hidden"}
    </span>
  );
}
