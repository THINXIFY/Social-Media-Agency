import { siThreads } from "simple-icons";
import { PlatformIcon } from "@/components/brand";
import type { PlatformIconKey } from "@/lib/catalog";
import { cn } from "@/lib/utils";

/** Icon for an AI-tool platform name (the registry's PLATFORM_CHOICES). Threads isn't in the SMM catalog's icon set, so it's drawn here. */
const KEYS: Record<string, PlatformIconKey | "threads"> = { Instagram: "instagram", TikTok: "tiktok", YouTube: "youtube", Facebook: "facebook", X: "x", LinkedIn: "linkedin", Pinterest: "pinterest", Threads: "threads", "X / Twitter": "x" };

export function AiPlatformIcon({ name, className }: { name: string; className?: string }) {
  const key = KEYS[name];
  if (key === "threads")
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-4", className)} aria-hidden>
        <path d={siThreads.path} />
      </svg>
    );
  return key ? <PlatformIcon icon={key} className={className} /> : null;
}
