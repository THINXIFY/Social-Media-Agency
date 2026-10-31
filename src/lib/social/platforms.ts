import type { PlatformIconKey } from "@/lib/catalog";

/**
 * Social Management (AI-06): the platforms Sociotix can connect to, and
 * exactly what each connection may read. Client-safe metadata only — no
 * endpoints, credentials or secrets (those live in src/server/social).
 *
 * Every capability listed here is read-only and comes from the platform's
 * official API. Nothing posts, schedules, messages, edits a profile or
 * spends money. A platform is only *connectable* when the server says so
 * (credentials configured and the platform's app approval confirmed by an
 * operator); this file never decides availability.
 */

export const SOCIAL_PROVIDER_IDS = ["instagram", "facebook", "tiktok", "youtube", "x", "linkedin"] as const;
export type SocialProviderId = (typeof SOCIAL_PROVIDER_IDS)[number];

export const isSocialProvider = (v: unknown): v is SocialProviderId => typeof v === "string" && (SOCIAL_PROVIDER_IDS as readonly string[]).includes(v);

/** What a connection can read. `profile` is always available once connected. */
export type SocialCapability = "profile" | "audience" | "content-count" | "views";

export const CAPABILITY_LABEL: Record<SocialCapability, string> = {
  profile: "Profile name and handle",
  audience: "Follower count",
  "content-count": "Number of posts",
  views: "Total views",
};

export interface SocialPermission {
  /** What the customer is agreeing to, in plain words. */
  label: string;
  /** Why Sociotix asks for it. */
  why: string;
}

export interface SocialPlatform {
  id: SocialProviderId;
  name: string;
  icon: PlatformIconKey;
  /** Brand colour for the identity chip (used sparingly, never for text). */
  brand: string;
  /** The kind of account that can connect. */
  accountKind: string;
  /** Requirements the customer should know before connecting. */
  requirement: string | null;
  capabilities: SocialCapability[];
  /** The noun the platform uses for followers and posts. */
  nouns: { audience: string; content: string };
  permissions: SocialPermission[];
  /** What Sociotix never does with this connection. */
  never: string[];
  /** Whether the platform lets Sociotix revoke access itself when you disconnect. */
  revokeOnDisconnect: boolean;
  /** Where to remove access by hand (shown when revoking isn't supported or fails). */
  manageAccessHint: string;
  /** Whether access renews automatically, or the platform requires reconnecting periodically. */
  renewal: string;
}

const NEVER = ["Post, schedule or delete anything", "Read or send messages", "Change your profile or settings", "Run ads or spend money"];

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  {
    id: "instagram",
    name: "Instagram",
    icon: "instagram",
    brand: "#E1306C",
    accountKind: "Professional account (Business or Creator)",
    requirement: "Instagram only shares this information for Business and Creator accounts. Personal accounts can switch to a professional account for free in the Instagram app.",
    capabilities: ["profile", "audience", "content-count"],
    nouns: { audience: "Followers", content: "Posts" },
    permissions: [{ label: "Your basic profile", why: "Your username, display name, follower count and number of posts." }],
    never: NEVER,
    revokeOnDisconnect: false,
    manageAccessHint: "In Instagram, open Settings → Website permissions → Apps and websites and remove Sociotix.",
    renewal: "Access lasts about 60 days and renews when you refresh the account.",
  },
  {
    id: "facebook",
    name: "Facebook",
    icon: "facebook",
    brand: "#1877F2",
    accountKind: "Facebook Page you manage",
    requirement: "Facebook connects Pages, not personal profiles. You choose which Pages to share during sign-in.",
    capabilities: ["profile", "audience"],
    nouns: { audience: "Followers", content: "Posts" },
    permissions: [
      { label: "The list of Pages you manage", why: "So you can choose which Pages appear in Sociotix." },
      { label: "Read Page details", why: "Each Page's name and follower count." },
    ],
    never: NEVER,
    // One Facebook sign-in can cover several Pages, so disconnecting one Page never revokes the others.
    revokeOnDisconnect: false,
    manageAccessHint: "In Facebook, open Settings & privacy → Settings → Business integrations and remove Sociotix.",
    renewal: "Access stays valid until you remove Sociotix in Facebook or change your Facebook password.",
  },
  {
    id: "tiktok",
    name: "TikTok",
    icon: "tiktok",
    brand: "#25F4EE",
    accountKind: "Any TikTok account",
    requirement: null,
    capabilities: ["profile", "audience", "content-count"],
    nouns: { audience: "Followers", content: "Videos" },
    permissions: [
      { label: "Your profile", why: "Your display name and username." },
      { label: "Your profile statistics", why: "Your follower count and number of videos." },
    ],
    never: NEVER,
    revokeOnDisconnect: true,
    manageAccessHint: "In TikTok, open Settings and privacy → Security and permissions → Apps and services permissions and remove Sociotix.",
    renewal: "Access renews automatically while you keep the account connected.",
  },
  {
    id: "youtube",
    name: "YouTube",
    icon: "youtube",
    brand: "#FF0000",
    accountKind: "YouTube channel",
    requirement: "Sign in with the Google account that owns the channel.",
    capabilities: ["profile", "audience", "content-count", "views"],
    nouns: { audience: "Subscribers", content: "Videos" },
    permissions: [{ label: "View your YouTube account", why: "Your channel name, subscriber count, number of videos and total views." }],
    never: NEVER,
    revokeOnDisconnect: true,
    manageAccessHint: "In your Google Account, open Security → Your connections to third-party apps & services and remove Sociotix.",
    renewal: "Access renews automatically while you keep the channel connected.",
  },
  {
    id: "x",
    name: "X",
    icon: "x",
    brand: "#0F1419",
    accountKind: "Any X account",
    requirement: null,
    capabilities: ["profile", "audience", "content-count"],
    nouns: { audience: "Followers", content: "Posts" },
    permissions: [
      { label: "Read your profile", why: "Your name, @handle, follower count and number of posts." },
      { label: "Read posts", why: "X requires this alongside profile access. Sociotix only reads your post count." },
      { label: "Stay connected", why: "So you don't have to sign in to X again every two hours." },
    ],
    never: NEVER,
    revokeOnDisconnect: true,
    manageAccessHint: "In X, open Settings → Security and account access → Apps and sessions → Connected apps and remove Sociotix.",
    renewal: "Access renews automatically while you keep the account connected.",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    icon: "linkedin",
    brand: "#0A66C2",
    accountKind: "LinkedIn member profile",
    requirement: "LinkedIn shares your name only — it doesn't share follower counts for personal profiles.",
    capabilities: ["profile"],
    nouns: { audience: "Followers", content: "Posts" },
    permissions: [{ label: "Your name", why: "So the connected profile is labelled correctly." }],
    never: NEVER,
    revokeOnDisconnect: false,
    manageAccessHint: "In LinkedIn, open Settings → Data privacy → Permitted services and remove Sociotix.",
    renewal: "Access lasts about 60 days, then LinkedIn asks you to reconnect.",
  },
];

export const SOCIAL_PLATFORM: Record<SocialProviderId, SocialPlatform> = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.id, p])) as Record<SocialProviderId, SocialPlatform>;

/** Platforms on the roadmap, and ones Sociotix deliberately won't connect. Shown so the list is honest. */
export const SOCIAL_PLANNED: { name: string; icon: PlatformIconKey | null; note: string }[] = [
  { name: "Threads", icon: null, note: "Planned once an account-level reading API fits the same permissions model." },
  { name: "Pinterest", icon: "pinterest", note: "Planned for a later phase." },
];

export const SOCIAL_UNSUPPORTED: { name: string; icon: PlatformIconKey; note: string }[] = [
  { name: "WhatsApp", icon: "whatsapp", note: "Private messaging — not something Sociotix should read." },
  { name: "Telegram", icon: "telegram", note: "No account-level insights in its official API." },
];

/* -------------------------------------------------------------------------- */
/*  Customer-facing view models (built on the server, never containing tokens) */
/* -------------------------------------------------------------------------- */

/** Why a platform can or can't be connected right now. */
export type SocialAvailability = { state: "available" } | { state: "unavailable"; reason: string };

export type SocialConnectionStatus = "active" | "needs_reauth" | "disconnected";
export type SocialHealth = "healthy" | "not_synced" | "sync_issue" | "action_needed" | "disconnected";

export interface SocialMetric {
  capability: Exclude<SocialCapability, "profile">;
  label: string;
  /** Exactly as the platform reported it. */
  value: number;
}

export interface SocialAccountView {
  id: string;
  provider: SocialProviderId;
  displayName: string;
  handle: string | null;
  profileUrl: string | null;
  status: SocialConnectionStatus;
  health: SocialHealth;
  /** Plain-language explanation of the health, with the recovery step if one is needed. */
  healthNote: string;
  /** Metrics from the last successful sync. Empty until a sync has returned them. */
  metrics: SocialMetric[];
  /** Capabilities this platform offers but that this sync couldn't report (e.g. a hidden subscriber count). */
  unavailableMetrics: string[];
  grantedPermissions: string[];
  connectedAt: string;
  lastSyncAt: string | null;
  lastSyncOk: boolean | null;
  /** When the next manual refresh is allowed (rate limit), if it's in the future. */
  refreshAvailableAt: string | null;
  disconnectedAt: string | null;
  revocation: "revoked" | "failed" | "not_supported" | null;
}

export type SocialEventType =
  | "connect_started"
  | "connected"
  | "reconnected"
  | "connect_failed"
  | "sync_succeeded"
  | "sync_failed"
  | "access_renewed"
  | "access_expired"
  | "disconnected"
  | "post_scheduled"
  | "post_cancelled"
  | "post_published"
  | "post_failed"
  | "post_unconfirmed";

export interface SocialEventView {
  id: string;
  provider: SocialProviderId;
  type: SocialEventType;
  /** Human-readable, never containing credentials or raw provider responses. */
  message: string;
  accountName: string | null;
  accountId: string | null;
  at: string;
}

export interface SocialPlatformState {
  id: SocialProviderId;
  availability: SocialAvailability;
}

export interface SocialWorkspace {
  platforms: SocialPlatformState[];
  accounts: SocialAccountView[];
  events: SocialEventView[];
}

export const SOCIAL_ROUTES = {
  landing: "/social-management",
  overview: "/dashboard/social",
  accounts: "/dashboard/social/accounts",
  activity: "/dashboard/social/activity",
} as const;

export const accountHref = (id: string) => `${SOCIAL_ROUTES.accounts}?account=${encodeURIComponent(id)}`;
