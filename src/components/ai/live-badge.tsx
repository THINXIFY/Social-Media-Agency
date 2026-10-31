"use client";

import type { AiTool } from "@/lib/ai/registry";
import { AvailabilityBadge } from "./parts";
import { useAvailabilityMap } from "./use-ai-status";

/** A tool's badge: its declared state until the server confirms the live one. */
export function LiveAvailabilityBadge({ tool, className }: { tool: AiTool; className?: string }) {
  const map = useAvailabilityMap();
  return <AvailabilityBadge value={map?.[tool.id] ?? tool.availability} className={className} />;
}
