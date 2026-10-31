import Link from "next/link";
import {
  ArrowUpRight,
  MessagesSquare,
  CalendarRange,
  Compass,
  FileQuestion,
  Hash,
  LifeBuoy,
  Lightbulb,
  type LucideIcon,
  MessageSquareText,
  Route,
  ScanSearch,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Workflow,
} from "lucide-react";
import { type AiAvailability, type AiCategoryId, type AiIconKey, type AiTool, aiToolHref, AVAILABILITY_LABEL } from "@/lib/ai/registry";
import { cn } from "@/lib/utils";

export const AI_ICONS: Record<AiIconKey, LucideIcon> = {
  caption: MessageSquareText,
  hashtag: Hash,
  ideas: Lightbulb,
  calendar: CalendarRange,
  advisor: TrendingUp,
  roadmap: Route,
  recommend: Compass,
  assistant: MessagesSquare,
  search: ScanSearch,
  order: ShoppingBag,
  explain: FileQuestion,
  support: LifeBuoy,
  workflow: Workflow,
};

/** Product names for each family of tools. */
export const FAMILY: Record<AiCategoryId, { name: string; short: string }> = {
  content: { name: "Content Studio", short: "Content" },
  growth: { name: "Growth Intelligence", short: "Growth" },
  assist: { name: "Smart Assistance", short: "Assistance" },
};

const PHASE_LABEL: Record<AiTool["phase"], string> = { "AI-02": "Content Studio", "AI-03": "Growth Intelligence", "AI-04": "Smart Assistance", "AI-05": "Order & Support", "AI-07": "Campaign Studio", "AI-08": "Automation Studio", Later: "On the roadmap" };
export const phaseLabel = (t: AiTool) => PHASE_LABEL[t.phase];

export function AvailabilityBadge({ value, className }: { value: AiAvailability; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.7rem] font-semibold whitespace-nowrap ring-1 ring-inset",
        value === "available" && "bg-lime text-graphite ring-black/5",
        value === "coming_soon" && "bg-primary/[0.07] text-primary ring-primary/15 dark:bg-primary/15 dark:text-[#c4b5ff] dark:ring-primary/30",
        value === "unavailable" && "bg-muted text-muted-foreground ring-border",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", value === "available" ? "bg-graphite" : value === "coming_soon" ? "bg-primary dark:bg-[#c4b5ff]" : "bg-muted-foreground/60")} aria-hidden />
      {AVAILABILITY_LABEL[value]}
    </span>
  );
}

const GLYPH: Record<AiCategoryId, string> = {
  content: "bg-[linear-gradient(140deg,#8b6cf3_0%,#7047eb_55%,#5a33d6_100%)] text-white shadow-[0_10px_24px_-12px_rgb(112_71_235/0.9),inset_0_1px_0_rgb(255_255_255/0.25)]",
  growth: "bg-[linear-gradient(140deg,#2c2d35_0%,#202127_100%)] text-lime shadow-[0_10px_24px_-14px_rgb(32_33_39/0.9),inset_0_1px_0_rgb(255_255_255/0.08)] dark:ring-1 dark:ring-white/10",
  assist: "bg-card text-foreground ring-1 ring-border shadow-[0_6px_16px_-12px_rgb(32_33_39/0.4)]",
};

export function ToolGlyph({ tool, className, size = "md" }: { tool: AiTool; className?: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const Icon = AI_ICONS[tool.icon];
  const dims = { sm: "size-8 rounded-lg [&_svg]:size-4", md: "size-10 rounded-xl [&_svg]:size-[1.15rem]", lg: "size-12 rounded-2xl [&_svg]:size-[1.35rem]", xl: "size-16 rounded-[1.25rem] [&_svg]:size-7" }[size];
  return (
    <span className={cn("grid shrink-0 place-items-center", dims, GLYPH[tool.category], className)} aria-hidden>
      <Icon strokeWidth={2} />
    </span>
  );
}

/** Compact row link used in lists (directory roadmap, related tools). */
export function ToolRow({ tool, className }: { tool: AiTool; className?: string }) {
  return (
    <Link
      href={aiToolHref(tool)}
      className={cn("group flex items-center gap-3.5 rounded-2xl p-3 transition-colors hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none", className)}
    >
      <ToolGlyph tool={tool} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.95rem] font-semibold">{tool.name}</span>
        <span className="block truncate text-sm text-muted-foreground">{tool.tagline}</span>
      </span>
      <AvailabilityBadge value={tool.availability} className="hidden sm:inline-flex" />
      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-[color,transform] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary motion-reduce:transition-none" aria-hidden />
    </Link>
  );
}

export function AiMark({ className, children = "Sociotix AI" }: { className?: string; children?: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-graphite px-2.5 py-1 text-[0.72rem] font-semibold text-lime dark:bg-white/10", className)}>
      <Sparkles className="size-3" aria-hidden /> {children}
    </span>
  );
}
