"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Heart } from "lucide-react";
import type { Service } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { toggleFavorite, useFavorites } from "./demo-store";

/** Saves a service for faster ordering. Stored in this browser only. */
export function FavoriteButton({ service, className }: { service: Service; className?: string }) {
  const on = useFavorites().has.has(service.id);
  // Bumped on each add so the heart pops once, never on first render.
  const [bump, setBump] = React.useState(0);

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={`Favorite ${service.name}`}
      title={on ? "Remove from favorites" : "Save to favorites"}
      onClick={(e) => {
        e.stopPropagation();
        if (!on) setBump((b) => b + 1);
        toggleFavorite(service.id);
      }}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full transition-colors focus-visible:ring-3 focus-visible:ring-primary/30 focus-visible:outline-none",
        on ? "text-primary hover:bg-secondary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <motion.span
        key={bump}
        className="grid place-items-center"
        animate={bump ? { scale: [1, 1.3, 1] } : undefined}
        transition={{ duration: 0.32, ease: "easeOut" }}
      >
        <Heart className={cn("size-[1.05rem] transition-[fill] duration-150", on && "fill-current")} strokeWidth={2.2} aria-hidden />
      </motion.span>
    </button>
  );
}
