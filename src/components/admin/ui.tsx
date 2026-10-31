import {
  Ban,
  CircleCheck,
  Clock3,
  Eye,
  type LucideIcon,
  OctagonAlert,
  RefreshCw,
  TriangleAlert,
  Undo2,
  Info,
} from "lucide-react";
import { ADMIN_ORDER_STATUS, type AdminOrderStatus, type Severity } from "@/lib/admin-demo";
import { cn } from "@/lib/utils";

/* Small admin primitives. Colours always come with an icon and a label. */

const ORDER_STYLE: Record<AdminOrderStatus, { className: string; Icon: LucideIcon }> = {
  review: { className: "bg-soon-soft text-soon", Icon: Eye },
  queued: { className: "bg-muted text-muted-foreground", Icon: Clock3 },
  in_progress: { className: "bg-secondary text-secondary-foreground", Icon: RefreshCw },
  completed: { className: "bg-ok-soft text-ok", Icon: CircleCheck },
  cancelled: { className: "bg-off-soft text-off", Icon: Ban },
  refunded: { className: "bg-off-soft text-off", Icon: Undo2 },
};

export function OrderStatus({ status, className }: { status: AdminOrderStatus; className?: string }) {
  const { className: tone, Icon } = ORDER_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.72rem] font-semibold whitespace-nowrap ring-1 ring-current/15 ring-inset",
        tone,
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      {ADMIN_ORDER_STATUS[status].label}
    </span>
  );
}

export const SEVERITY: Record<Severity, { label: string; className: string; dot: string; Icon: LucideIcon }> = {
  critical: { label: "Critical", className: "bg-destructive/10 text-destructive", dot: "bg-destructive", Icon: OctagonAlert },
  high: { label: "High", className: "bg-soon-soft text-soon", dot: "bg-soon", Icon: TriangleAlert },
  medium: { label: "Medium", className: "bg-secondary text-secondary-foreground", dot: "bg-primary", Icon: Info },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { label, className, Icon } = SEVERITY[severity];
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-full px-2 text-[0.68rem] font-bold", className)}>
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

/** Marks sample records and inactive operations. */
export function AdminDemoTag({ children = "Demo", className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border border-dashed border-current/30 px-2 text-[0.62rem] font-bold tracking-wider text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ className, children, ...props }: React.ComponentProps<"section">) {
  return (
    <section className={cn("rounded-2xl border bg-card shadow-[0_1px_2px_rgb(15_16_20/0.04)]", className)} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({
  id,
  title,
  description,
  action,
  className,
}: {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-[0.95rem] font-bold">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-[0.8rem] text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export const linkButton =
  "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[0.8rem] font-semibold text-primary transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none";
