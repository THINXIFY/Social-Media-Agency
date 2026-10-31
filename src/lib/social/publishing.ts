import { SOCIAL_PLATFORM, type SocialProviderId } from "./platforms";

/**
 * Social publishing rules (AI-07), shared by the composer, previews and the
 * server. Client-safe: no endpoints or credentials.
 *
 * Limits follow each platform's published documentation at the time of
 * writing and are checked again on the server before anything is scheduled
 * and again when it runs. Publishing itself is switched on per platform only
 * after that platform approves SociVanta's posting permission AND the customer
 * grants it — see src/server/social/publish-adapters.ts.
 */

export type MediaKind = "image" | "video";

export interface PublishRules {
  /** Post formats the platform accepts through its official publishing API. */
  formats: ("text" | "image" | "video")[];
  /** Caption / text limit in characters. */
  textMax: number;
  /** A post can't be published without media. */
  requiresMedia: MediaKind[] | null;
  /** Title required (YouTube). */
  titleMax: number | null;
  /** The extra (write) permissions publishing would need — never requested in AI-06. */
  publishScopes: string[];
  /** The kind of account that can publish. */
  accountNote: string;
  /** Plain-language note shown in the preview. */
  note: string;
}

export const PUBLISH_RULES: Record<SocialProviderId, PublishRules> = {
  instagram: {
    formats: ["image", "video"],
    textMax: 2200,
    requiresMedia: ["image", "video"],
    titleMax: null,
    publishScopes: ["instagram_business_content_publish"],
    accountNote: "Professional (Business or Creator) accounts only.",
    note: "Instagram posts need a photo or video — text-only posts aren't supported.",
  },
  facebook: {
    formats: ["text", "image", "video"],
    textMax: 63206,
    requiresMedia: null,
    titleMax: null,
    publishScopes: ["pages_manage_posts"],
    accountNote: "Facebook Pages you manage.",
    note: "Posts go to a Facebook Page, not a personal profile.",
  },
  tiktok: {
    formats: ["video"],
    textMax: 2200,
    requiresMedia: ["video"],
    titleMax: null,
    publishScopes: ["video.publish"],
    accountNote: "Any TikTok account that grants posting permission.",
    note: "TikTok posts need a video.",
  },
  youtube: {
    formats: ["video"],
    textMax: 5000,
    requiresMedia: ["video"],
    titleMax: 100,
    publishScopes: ["https://www.googleapis.com/auth/youtube.upload"],
    accountNote: "Your YouTube channel.",
    note: "YouTube needs a video and a title; your text becomes the description.",
  },
  x: {
    formats: ["text", "image", "video"],
    textMax: 280,
    requiresMedia: null,
    titleMax: null,
    publishScopes: ["tweet.write"],
    accountNote: "Any X account (requires an X API access tier that allows posting).",
    note: "X counts some characters (like links and emoji) differently, so the count here is approximate.",
  },
  linkedin: {
    formats: ["text", "image", "video"],
    textMax: 3000,
    requiresMedia: null,
    titleMax: null,
    publishScopes: ["w_member_social"],
    accountNote: "Your LinkedIn member profile.",
    note: "Posts are shared from your member profile.",
  },
};

/** Media SociVanta will accept for upload once storage is configured. */
export const MEDIA_RULES: Record<MediaKind, { types: string[]; maxBytes: number; label: string }> = {
  image: { types: ["image/jpeg", "image/png"], maxBytes: 8 * 1024 * 1024, label: "JPEG or PNG, up to 8 MB" },
  video: { types: ["video/mp4", "video/quicktime"], maxBytes: 250 * 1024 * 1024, label: "MP4 or MOV, up to 250 MB" },
};

export const POST_TEXT_MAX = 5000;
export const POST_TITLE_MAX = 100;

export interface PostMediaRef {
  kind: MediaKind;
  name: string;
  bytes: number;
  type: string;
}

export interface PostContent {
  text: string;
  title?: string | null;
  media: PostMediaRef[];
  /** Per-platform text overrides; empty = use the main text. */
  variants?: Partial<Record<SocialProviderId, string>>;
}

/** Characters as people count them (code points, so an emoji counts once). */
export const charCount = (s: string) => Array.from(s).length;

export const textFor = (c: PostContent, p: SocialProviderId) => (c.variants?.[p]?.trim() ? c.variants[p]! : c.text);

export interface ValidationIssue {
  provider: SocialProviderId;
  level: "error" | "warning";
  message: string;
}

/** Everything that would stop this content being published on a platform. */
export function validateForPlatform(c: PostContent, p: SocialProviderId): ValidationIssue[] {
  const r = PUBLISH_RULES[p];
  const name = SOCIAL_PLATFORM[p].name;
  const out: ValidationIssue[] = [];
  const text = textFor(c, p);
  const n = charCount(text);
  if (n > r.textMax) out.push({ provider: p, level: "error", message: `${name} allows ${r.textMax.toLocaleString("en-US")} characters — this is ${n.toLocaleString("en-US")}.` });
  if (!text.trim() && !c.media.length) out.push({ provider: p, level: "error", message: `Add some text or media for ${name}.` });
  if (r.requiresMedia && !c.media.some((m) => r.requiresMedia!.includes(m.kind))) out.push({ provider: p, level: "error", message: r.note });
  for (const m of c.media) if (!r.formats.includes(m.kind)) out.push({ provider: p, level: "error", message: `${name} doesn't accept ${m.kind === "image" ? "images" : "videos"} through its publishing API.` });
  if (r.titleMax !== null) {
    const t = (c.title ?? "").trim();
    if (!t) out.push({ provider: p, level: "error", message: `${name} needs a title.` });
    else if (charCount(t) > r.titleMax) out.push({ provider: p, level: "error", message: `${name} titles can be up to ${r.titleMax} characters.` });
  }
  return out;
}

/** Client-side check before an upload is attempted (the server re-checks the bytes). */
export function checkMediaFile(file: { type: string; size: number }): { ok: true; kind: MediaKind } | { ok: false; message: string } {
  for (const [kind, rule] of Object.entries(MEDIA_RULES) as [MediaKind, (typeof MEDIA_RULES)[MediaKind]][]) {
    if (rule.types.includes(file.type)) return file.size <= rule.maxBytes ? { ok: true, kind } : { ok: false, message: `That ${kind} is too large (${rule.label}).` };
  }
  return { ok: false, message: "Only JPEG/PNG images and MP4/MOV videos can be attached." };
}

/** Identifies a file by its first bytes, never by its name or the browser's claim. */
export function sniffMedia(bytes: Uint8Array): string | null {
  const at = (i: number, sig: number[]) => sig.every((b, k) => bytes[i + k] === b);
  if (at(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at(4, [0x66, 0x74, 0x79, 0x70])) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    return brand === "qt  " ? "video/quicktime" : "video/mp4";
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Post & publishing states                                                  */
/* -------------------------------------------------------------------------- */

export type PostStatus = "draft" | "scheduled" | "cancelled";
export type TargetStatus = "scheduled" | "publishing" | "published" | "failed" | "cancelled" | "reconciliation_required";

/** What the customer sees for a post, derived from the post and its publish targets. */
export type PostState = "draft" | "planned" | "scheduled" | "publishing" | "published" | "partly_published" | "failed" | "needs_review" | "cancelled";

export const POST_STATE_LABEL: Record<PostState, string> = {
  draft: "Draft",
  planned: "Planned",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  partly_published: "Partly published",
  failed: "Failed",
  needs_review: "Needs review",
  cancelled: "Cancelled",
};

export function postState(status: PostStatus, plannedAt: string | null, targets: { status: TargetStatus }[]): PostState {
  if (status === "draft") return plannedAt ? "planned" : "draft";
  if (status === "cancelled" && !targets.some((t) => t.status === "published")) return "cancelled";
  const s = targets.map((t) => t.status);
  if (s.includes("reconciliation_required")) return "needs_review";
  if (s.includes("publishing")) return "publishing";
  if (s.includes("scheduled")) return "scheduled";
  const pub = s.filter((x) => x === "published").length;
  if (pub && pub === s.length) return "published";
  if (pub) return "partly_published";
  if (s.includes("failed")) return "failed";
  return status === "cancelled" ? "cancelled" : "scheduled";
}

export interface PostTargetView {
  id: string;
  connectionId: string;
  provider: SocialProviderId;
  accountName: string;
  status: TargetStatus;
  scheduledAt: string;
  publishedAt: string | null;
  externalUrl: string | null;
  /** Plain-language reason for a failure or review state. */
  note: string | null;
}

export interface PostView {
  id: string;
  title: string | null;
  text: string;
  variants: Partial<Record<SocialProviderId, string>>;
  media: PostMediaRef[];
  providers: SocialProviderId[];
  status: PostStatus;
  state: PostState;
  plannedAt: string | null;
  scheduledAt: string | null;
  timezone: string;
  targets: PostTargetView[];
  createdAt: string;
  updatedAt: string;
}

/** Everything the publishing pages need, loaded on the server per request. */
export interface PublishingData {
  workspace: import("./platforms").SocialWorkspace;
  posts: PostView[];
  /** Per platform: can posts be published there right now, and if not, why. */
  publishing: Record<SocialProviderId, { ok: boolean; reason: string | null }>;
  /** Whether media uploads are configured (not in this build). */
  mediaStorage: boolean;
}

export const PUBLISHING_ROUTES = {
  library: "/dashboard/social/publishing",
  compose: "/dashboard/social/publishing/new",
  calendar: "/dashboard/social/calendar",
  campaigns: "/dashboard/social/campaigns",
} as const;

export const postHref = (id: string) => `${PUBLISHING_ROUTES.library}/${encodeURIComponent(id)}`;
