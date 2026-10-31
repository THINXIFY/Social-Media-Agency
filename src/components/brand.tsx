import {
  siDiscord,
  siFacebook,
  siInstagram,
  siPinterest,
  siReddit,
  siSnapchat,
  siSpotify,
  siTelegram,
  siTiktok,
  siTwitch,
  siWhatsapp,
  siX,
  siYoutube,
} from "simple-icons";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Platform, PlatformIconKey } from "@/lib/catalog";

// LinkedIn isn't distributed by simple-icons; this is a plain "in" glyph.
const LINKEDIN_PATH =
  "M5.34 8.6h3.1V19H5.34zM6.9 3.6a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6M10.38 8.6h2.97v1.42h.04c.41-.78 1.43-1.6 2.94-1.6 3.14 0 3.72 2.07 3.72 4.75V19h-3.1v-5.12c0-1.22-.02-2.79-1.7-2.79-1.7 0-1.96 1.33-1.96 2.7V19h-3.1z";

const PATHS: Record<Exclude<PlatformIconKey, "website">, string> = {
  instagram: siInstagram.path,
  facebook: siFacebook.path,
  x: siX.path,
  youtube: siYoutube.path,
  tiktok: siTiktok.path,
  telegram: siTelegram.path,
  whatsapp: siWhatsapp.path,
  linkedin: LINKEDIN_PATH,
  pinterest: siPinterest.path,
  snapchat: siSnapchat.path,
  twitch: siTwitch.path,
  discord: siDiscord.path,
  reddit: siReddit.path,
  spotify: siSpotify.path,
};

export function PlatformIcon({
  icon,
  className,
  title,
}: {
  icon: PlatformIconKey;
  className?: string;
  title?: string;
}) {
  if (icon === "website") {
    return <Globe className={cn("size-4", className)} strokeWidth={2.2} aria-label={title} aria-hidden={title ? undefined : true} />;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("size-4", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[icon]} />
    </svg>
  );
}

const TILE_SIZES = {
  xs: "size-6 rounded-md [&_svg]:size-3.5",
  sm: "size-8 rounded-lg [&_svg]:size-4",
  md: "size-11 rounded-xl [&_svg]:size-5",
  lg: "size-14 rounded-2xl [&_svg]:size-7",
} as const;

export function PlatformTile({
  platform,
  size = "md",
  className,
}: {
  platform: Platform;
  size?: keyof typeof TILE_SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center ring-1 ring-black/5 ring-inset dark:ring-white/10",
        TILE_SIZES[size],
        className,
      )}
      style={{ backgroundColor: platform.color, color: platform.ink }}
    >
      <PlatformIcon icon={platform.icon} />
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#7047EB" />
        <path
          d="M20.6 10.4c-1.1-1-2.7-1.6-4.5-1.6-2.9 0-4.9 1.5-4.9 3.7 0 4.6 8.6 3 8.6 6.3 0 1.1-1.2 1.9-3 1.9-1.6 0-3-.6-4-1.6"
          fill="none"
          stroke="#fff"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <circle cx="23" cy="22.5" r="2.6" fill="#C8FF52" />
      </svg>
      <span className="font-heading text-[1.15rem] font-extrabold tracking-tight">
        Socio<span className="text-primary">tix</span>
      </span>
    </span>
  );
}
