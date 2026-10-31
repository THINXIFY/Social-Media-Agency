import {
  CalendarDays,
  CalendarRange,
  Compass,
  FileQuestion,
  Hash,
  LifeBuoy,
  Lightbulb,
  type LucideIcon,
  MessagesSquare,
  MessageSquareText,
  PenLine,
  Rocket,
  Route,
  ScanSearch,
  Share2,
  ShoppingBag,
  TrendingUp,
  Workflow,
} from "lucide-react";
import type { AiAvailability } from "@/lib/ai/registry";
import type { DestinationGroup, DestinationIcon } from "@/lib/ai/workspace";
import { cn } from "@/lib/utils";

/* Server-safe visual pieces shared by the AI workspace pages (AI-09). */

export const DESTINATION_ICON: Record<DestinationIcon, LucideIcon> = {
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
  social: Share2,
  publishing: PenLine,
  planner: CalendarDays,
  campaign: Rocket,
  automation: Workflow,
};

const GROUP_TONE: Record<DestinationGroup, string> = {
  content: "bg-[linear-gradient(140deg,#8b6cf3_0%,#7047eb_55%,#5a33d6_100%)] text-white shadow-[0_10px_22px_-12px_rgb(112_71_235/0.9),inset_0_1px_0_rgb(255_255_255/0.25)]",
  growth: "bg-[linear-gradient(140deg,#2c2d35_0%,#202127_100%)] text-lime shadow-[0_10px_22px_-14px_rgb(32_33_39/0.9),inset_0_1px_0_rgb(255_255_255/0.08)] dark:ring-1 dark:ring-white/10",
  assist: "bg-card text-foreground ring-1 ring-border shadow-[0_6px_16px_-12px_rgb(32_33_39/0.4)]",
  orders: "bg-card text-primary ring-1 ring-border shadow-[0_6px_16px_-12px_rgb(32_33_39/0.4)] dark:text-[#c4b5ff]",
  social: "bg-lime text-graphite shadow-[0_10px_22px_-14px_rgb(120_160_20/0.8),inset_0_1px_0_rgb(255_255_255/0.4)]",
};

export function DestinationGlyph({ icon, group, size = "md", className }: { icon: DestinationIcon; group: DestinationGroup; size?: "sm" | "md" | "lg"; className?: string }) {
  const Icon = DESTINATION_ICON[icon];
  const dims = { sm: "size-8 rounded-lg [&_svg]:size-4", md: "size-10 rounded-xl [&_svg]:size-[1.15rem]", lg: "size-12 rounded-2xl [&_svg]:size-[1.35rem]" }[size];
  return (
    <span className={cn("grid shrink-0 place-items-center", dims, GROUP_TONE[group], className)} aria-hidden>
      <Icon strokeWidth={2} />
    </span>
  );
}

/** A compact state chip: "Ready" for things that work today, "Coming soon" for AI that hasn't launched. */
export function StateChip({ value, readyLabel = "Ready", className }: { value: AiAvailability; readyLabel?: string; className?: string }) {
  const label = value === "available" ? readyLabel : value === "coming_soon" ? "Coming soon" : "Unavailable";
  return (
    <span
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[0.68rem] font-semibold whitespace-nowrap",
        value === "available" && "bg-ok-soft text-ok",
        value === "coming_soon" && "bg-primary/[0.08] text-primary dark:bg-primary/20 dark:text-[#c4b5ff]",
        value === "unavailable" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", value === "available" ? "bg-ok" : value === "coming_soon" ? "bg-primary dark:bg-[#c4b5ff]" : "bg-muted-foreground/60")} aria-hidden />
      {label}
    </span>
  );
}
