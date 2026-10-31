/**
 * SociVanta service catalog.
 *
 * Every listed service is discoverable and can be configured in the New
 * Order flow. A service only becomes orderable once it's added to `ACTIVATIONS`
 * with a configured price — after pricing, supplier capability and
 * platform/payment compliance have been verified. Until then it stays in
 * preview and checkout is disabled.
 *
 * To add a platform, append to `SEEDS`. To add a service, append a
 * `[name, category]` tuple to that platform. Every section of the homepage
 * (directory, marketplace, counts, filters, footer) derives from this file.
 */

/**
 * - `active`  — verified and priced; can be ordered.
 * - `preview` — listed with full details; ordering not yet open.
 */
export type ServiceStatus = "active" | "preview";

export type ServiceCategory =
  | "audience"
  | "engagement"
  | "views"
  | "comments"
  | "promotion"
  | "advertising"
  | "messaging"
  | "seo"
  | "community"
  | "music";

export type PlatformIconKey =
  | "instagram"
  | "facebook"
  | "x"
  | "youtube"
  | "tiktok"
  | "telegram"
  | "whatsapp"
  | "linkedin"
  | "pinterest"
  | "snapchat"
  | "twitch"
  | "discord"
  | "reddit"
  | "spotify"
  | "website";

export interface Price {
  amount: number;
  currency: string;
  /** e.g. "per 1,000", "per campaign" */
  unit: string;
}

export interface Platform {
  id: string;
  name: string;
  /** Short label for chips and tight UI */
  short: string;
  icon: PlatformIconKey;
  /** Brand tile background */
  color: string;
  /** Icon colour drawn on top of `color` */
  ink: string;
  tagline: string;
  /** Extra search terms that should match this platform */
  aliases: string[];
}

export interface Service {
  id: string;
  name: string;
  platformId: string;
  category: ServiceCategory;
  status: ServiceStatus;
  description: string;
  featured: boolean;
  /** `null` until the service is activated with a price. Never invent a number. */
  price: Price | null;
  /** Quantity rules, only when configured on activation. */
  limits: QuantityLimits | null;
}

export interface QuantityLimits {
  min: number;
  max: number;
}

interface Activation {
  price: Price;
  limits?: QuantityLimits;
}

type ServiceSeed = [name: string, category: ServiceCategory];

interface PlatformSeed extends Platform {
  services: ServiceSeed[];
}

/* -------------------------------------------------------------------------- */
/*  Activation                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Services that are verified and ready to order, keyed by service id, with
 * their configured price and optional quantity limits. Empty until the
 * business activates a service.
 *
 * @example "instagram-followers": {
 *   price: { amount: 4.5, currency: "USD", unit: "per 1,000" },
 *   limits: { min: 100, max: 50000 },
 * }
 */
const ACTIVATIONS: Partial<Record<string, Activation>> = {};

/** Shown in "Popular services" and pinned first in the default sort. */
const FEATURED = new Set([
  "instagram-followers",
  "instagram-reels-views",
  "youtube-channel-subscribers",
  "tiktok-video-views",
  "facebook-page-likes",
  "x-followers",
]);

/* -------------------------------------------------------------------------- */
/*  Labels & copy                                                             */
/* -------------------------------------------------------------------------- */

export const CATEGORY_META: Record<ServiceCategory, { label: string; short: string }> = {
  audience: { label: "Followers & members", short: "Followers" },
  engagement: { label: "Likes & reactions", short: "Likes" },
  views: { label: "Views & plays", short: "Views" },
  comments: { label: "Comments & replies", short: "Comments" },
  advertising: { label: "Advertising", short: "Ads" },
  promotion: { label: "Promotion", short: "Promotion" },
  messaging: { label: "Business messaging", short: "Messaging" },
  seo: { label: "SEO & search", short: "SEO" },
  community: { label: "Community campaigns", short: "Community" },
  music: { label: "Music promotion", short: "Music" },
};

export const CATEGORY_ORDER: ServiceCategory[] = [
  "audience",
  "engagement",
  "views",
  "comments",
  "advertising",
  "promotion",
  "messaging",
  "seo",
  "community",
  "music",
];

export const STATUS_META: Record<ServiceStatus, { label: string; note: string; rank: number }> = {
  active: {
    label: "Ready to order",
    note: "Pricing and fulfilment for this service are verified. Results, retention and timing are never guaranteed.",
    rank: 0,
  },
  preview: {
    label: "Preview",
    note: "Ordering opens once pricing, fulfilment and compliance for this service are verified.",
    rank: 1,
  },
};

const METRIC_DELIVERY = [
  "Delivery method and sources shown before you order",
  "Ordering opens once pricing and fulfilment are verified",
  "Results, retention and timing are not guaranteed",
];

export const CATEGORY_DELIVERY: Record<ServiceCategory, string[]> = {
  audience: METRIC_DELIVERY,
  engagement: METRIC_DELIVERY,
  views: METRIC_DELIVERY,
  comments: [
    "Comment guidelines agreed with you before delivery",
    "Ordering opens once pricing and fulfilment are verified",
    "Results and timing are not guaranteed",
  ],
  advertising: [
    "Runs inside the platform's official ads manager",
    "You approve targeting, budget and creative before launch",
    "Results reported from the platform's own ad metrics",
  ],
  promotion: [
    "Uses official boost / promote tools or disclosed creator placements",
    "Sponsored content is always labelled as such",
    "Reach and engagement are not guaranteed",
  ],
  messaging: [
    "Sent through the official WhatsApp Business Platform",
    "Messages go only to contacts who opted in",
    "Templates follow WhatsApp's commerce and messaging policies",
  ],
  seo: [
    "Technical, on-page and content work on your own site",
    "Search ads run through official ad platforms",
    "Rankings and traffic are not guaranteed",
  ],
  community: [
    "Outreach to communities that allow sponsored posts",
    "Every placement is disclosed as paid",
    "Scope agreed with you before anything goes live",
  ],
  music: [
    "Official ad tools and disclosed curator or creator outreach",
    "Scope agreed with you before anything goes live",
    "Streams and placements are not guaranteed",
  ],
};

/* -------------------------------------------------------------------------- */
/*  Order form                                                                */
/* -------------------------------------------------------------------------- */

export type OrderFieldKind = "link" | "quantity" | "budget" | "text" | "textarea" | "date" | "select" | "consent";

export interface OrderField {
  id: string;
  label: string;
  kind: OrderFieldKind;
  required: boolean;
  placeholder?: string;
  help?: string;
  options?: string[];
}

const NOTES: OrderField = {
  id: "notes",
  label: "Notes for our team",
  kind: "textarea",
  required: false,
  placeholder: "Anything we should know before we start",
};

const BUDGET: OrderField = {
  id: "budget",
  label: "Campaign budget",
  kind: "budget",
  required: true,
  placeholder: "0.00",
  help: "The total you want to spend on this campaign.",
};

const BRIEF: OrderField = {
  id: "brief",
  label: "Campaign brief",
  kind: "textarea",
  required: true,
  placeholder: "What you're promoting, who it's for and what success looks like",
};

const link = (label: string, placeholder: string, help = "Make sure it's public so we can deliver to it."): OrderField => ({
  id: "link",
  label,
  kind: "link",
  required: true,
  placeholder,
  help,
});

const quantity = (label = "Quantity"): OrderField => ({ id: "quantity", label, kind: "quantity", required: true, placeholder: "e.g. 1000" });

/** Fields the New Order flow asks for, per service category. */
export const CATEGORY_FIELDS: Record<ServiceCategory, OrderField[]> = {
  audience: [link("Profile, page or channel link", "https://"), quantity(), NOTES],
  engagement: [link("Post or video link", "https://"), quantity(), NOTES],
  views: [link("Video, reel or post link", "https://"), quantity(), NOTES],
  comments: [
    link("Post or video link", "https://"),
    quantity("Number of comments"),
    {
      id: "guidelines",
      label: "Comment guidelines",
      kind: "textarea",
      required: true,
      placeholder: "Tone, topics to mention and anything to avoid",
      help: "Every comment follows these guidelines.",
    },
  ],
  advertising: [
    link("Account or page link", "https://", "The page or account the ads will run from."),
    {
      id: "goal",
      label: "Campaign goal",
      kind: "select",
      required: true,
      options: ["Awareness", "Website traffic", "Engagement", "Leads", "Sales", "App installs"],
    },
    BUDGET,
    { id: "start", label: "Preferred start date", kind: "date", required: false },
    {
      id: "audience",
      label: "Audience targeting",
      kind: "textarea",
      required: false,
      placeholder: "Locations, ages, interests",
      help: "You approve the final targeting before launch.",
    },
  ],
  promotion: [
    link("Profile, page or post link", "https://"),
    {
      id: "goal",
      label: "Promotion goal",
      kind: "select",
      required: true,
      options: ["Reach", "Profile visits", "Engagement", "Website traffic"],
    },
    BUDGET,
    {
      id: "disclosure",
      label: "I agree that sponsored placements are clearly labelled as paid.",
      kind: "consent",
      required: true,
    },
  ],
  messaging: [
    {
      id: "account",
      label: "WhatsApp Business number or account",
      kind: "text",
      required: true,
      placeholder: "+1 555 000 0000",
      help: "We'll connect through the official Business Platform.",
    },
    {
      id: "template",
      label: "Message template",
      kind: "textarea",
      required: true,
      placeholder: "The message you'd like to send",
      help: "Templates are reviewed against WhatsApp's messaging policies.",
    },
    BUDGET,
    { id: "start", label: "Preferred send date", kind: "date", required: false },
    {
      id: "optin",
      label: "Everyone on my contact list has opted in to receive messages from me.",
      kind: "consent",
      required: true,
    },
  ],
  seo: [
    link("Website URL", "https://yourwebsite.com", "Analytics access is requested later through a read-only invite."),
    {
      id: "goals",
      label: "Goals and markets",
      kind: "textarea",
      required: true,
      placeholder: "What you want to rank for and where",
    },
    { id: "pages", label: "Target pages", kind: "textarea", required: false, placeholder: "One URL per line" },
    BUDGET,
  ],
  community: [link("Community or server link", "https://"), BRIEF, BUDGET],
  music: [
    link("Artist or track link", "https://"),
    { id: "release", label: "Release date", kind: "date", required: false },
    BRIEF,
    BUDGET,
  ],
};

const SHORT_LABEL: Record<string, string> = {
  link: "Link",
  quantity: "Quantity",
  budget: "Budget",
  guidelines: "Guidelines",
  goal: "Goal",
  account: "Account",
  template: "Template",
  goals: "Goals",
  brief: "Brief",
};

/** What the customer will need to provide, in a few words. */
export const requirementsOf = (s: Service) =>
  CATEGORY_FIELDS[s.category].filter((f) => f.required && f.kind !== "consent").map((f) => SHORT_LABEL[f.id] ?? f.label);

/** Whether the order form asks for a quantity (metric services) or a budget. */
export const isQuantityBased = (c: ServiceCategory) =>
  c === "audience" || c === "engagement" || c === "views" || c === "comments";

function describe(platform: Platform, category: ServiceCategory) {
  switch (category) {
    case "audience":
      return `Grow followers, subscribers or members for your ${platform.name} profile, page or channel.`;
    case "engagement":
      return `Add likes, reactions, saves or shares to your ${platform.name} posts and videos.`;
    case "views":
      return `Increase views and plays on your ${platform.name} videos, reels, stories or posts.`;
    case "comments":
      return `Add comments or replies to your ${platform.name} posts, following guidelines you set.`;
    case "advertising":
      return `Plan and run ${platform.name} campaigns through official ad tools, with targeting, budget and creative you approve.`;
    case "promotion":
      return `Promote your ${platform.name} presence using native promotion tools and clearly disclosed sponsored placements.`;
    case "messaging":
      return `Reach opted-in customers on WhatsApp with approved templates through the official Business Platform.`;
    case "seo":
      return `Improve how your site is found in search with technical, on-page and content work.`;
    case "community":
      return `Reach relevant ${platform.name} communities with disclosed, rule-compliant sponsored placements.`;
    case "music":
      return `Promote releases with official ad tools and disclosed outreach to curators and creators.`;
  }
}

/* -------------------------------------------------------------------------- */
/*  Platforms                                                                 */
/* -------------------------------------------------------------------------- */

const SEEDS: PlatformSeed[] = [
  {
    id: "instagram",
    name: "Instagram",
    short: "Instagram",
    icon: "instagram",
    color: "#E4405F",
    ink: "#FFFFFF",
    tagline: "Reels, stories and profile reach",
    aliases: ["ig", "insta", "reels", "stories"],
    services: [
      ["Instagram Followers", "audience"],
      ["Instagram Post Likes", "engagement"],
      ["Instagram Reels Views", "views"],
      ["Instagram Reels Likes", "engagement"],
      ["Instagram Video Views", "views"],
      ["Instagram Comments", "comments"],
      ["Instagram Story Views", "views"],
      ["Instagram Story Reactions", "engagement"],
      ["Instagram Shares", "engagement"],
      ["Instagram Saves", "engagement"],
      ["Instagram Profile Promotion", "promotion"],
      ["Instagram Advertising Campaigns", "advertising"],
    ],
  },
  {
    id: "facebook",
    name: "Facebook",
    short: "Facebook",
    icon: "facebook",
    color: "#0866FF",
    ink: "#FFFFFF",
    tagline: "Pages, groups, events and reels",
    aliases: ["fb", "meta"],
    services: [
      ["Facebook Page Followers", "audience"],
      ["Facebook Page Likes", "engagement"],
      ["Facebook Post Likes", "engagement"],
      ["Facebook Post Reactions", "engagement"],
      ["Facebook Post Comments", "comments"],
      ["Facebook Post Shares", "engagement"],
      ["Facebook Video Views", "views"],
      ["Facebook Reels Views", "views"],
      ["Facebook Reels Engagement", "engagement"],
      ["Facebook Event Promotion", "promotion"],
      ["Facebook Group Promotion", "promotion"],
      ["Facebook Page Promotion", "promotion"],
      ["Facebook Advertising Campaigns", "advertising"],
    ],
  },
  {
    id: "x",
    name: "X / Twitter",
    short: "X",
    icon: "x",
    color: "#0F1014",
    ink: "#FFFFFF",
    tagline: "Posts, profiles and audiences",
    aliases: ["twitter", "tweet", "tweets", "x"],
    services: [
      ["X Followers", "audience"],
      ["X Post Likes", "engagement"],
      ["X Post Reposts", "engagement"],
      ["X Post Replies", "comments"],
      ["X Post Views", "views"],
      ["X Video Views", "views"],
      ["X Profile Promotion", "promotion"],
      ["X Post Promotion", "promotion"],
      ["X Audience Campaigns", "advertising"],
    ],
  },
  {
    id: "youtube",
    name: "YouTube",
    short: "YouTube",
    icon: "youtube",
    color: "#FF0000",
    ink: "#FFFFFF",
    tagline: "Channels, videos, shorts and live",
    aliases: ["yt", "shorts"],
    services: [
      ["YouTube Channel Subscribers", "audience"],
      ["YouTube Video Views", "views"],
      ["YouTube Video Likes", "engagement"],
      ["YouTube Video Comments", "comments"],
      ["YouTube Video Shares", "engagement"],
      ["YouTube Shorts Views", "views"],
      ["YouTube Shorts Likes", "engagement"],
      ["YouTube Live Stream Promotion", "promotion"],
      ["YouTube Channel Promotion", "promotion"],
      ["YouTube Advertising Campaigns", "advertising"],
    ],
  },
  {
    id: "tiktok",
    name: "TikTok",
    short: "TikTok",
    icon: "tiktok",
    color: "#0F1014",
    ink: "#FFFFFF",
    tagline: "Short video, live and creators",
    aliases: ["tik tok", "tt"],
    services: [
      ["TikTok Followers", "audience"],
      ["TikTok Video Likes", "engagement"],
      ["TikTok Video Views", "views"],
      ["TikTok Comments", "comments"],
      ["TikTok Shares", "engagement"],
      ["TikTok Favorites", "engagement"],
      ["TikTok Profile Promotion", "promotion"],
      ["TikTok Live Promotion", "promotion"],
      ["TikTok Advertising Campaigns", "advertising"],
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    short: "WhatsApp",
    icon: "whatsapp",
    color: "#25D366",
    ink: "#0F1014",
    tagline: "Channels, Status and business messaging",
    aliases: ["wa", "ctwa"],
    services: [
      ["WhatsApp Channel Followers", "audience"],
      ["WhatsApp Channel Reactions", "engagement"],
      ["WhatsApp Channel Promotion", "promotion"],
      ["WhatsApp Status Promotion", "promotion"],
      ["Click-to-WhatsApp Ad Campaigns", "advertising"],
      ["WhatsApp Business Marketing Messages", "messaging"],
      ["WhatsApp Broadcast Campaigns", "messaging"],
      ["WhatsApp Business Profile Optimization", "messaging"],
      ["WhatsApp Catalog Promotion", "promotion"],
    ],
  },
  {
    id: "telegram",
    name: "Telegram",
    short: "Telegram",
    icon: "telegram",
    color: "#229ED9",
    ink: "#FFFFFF",
    tagline: "Channels, groups and communities",
    aliases: ["tg"],
    services: [
      ["Telegram Channel Members", "audience"],
      ["Telegram Group Members", "audience"],
      ["Telegram Post Views", "views"],
      ["Telegram Reactions", "engagement"],
      ["Telegram Channel Promotion", "promotion"],
      ["Telegram Group Promotion", "promotion"],
      ["Telegram Community Advertising", "advertising"],
    ],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    short: "LinkedIn",
    icon: "linkedin",
    color: "#0A66C2",
    ink: "#FFFFFF",
    tagline: "Profiles, company pages and B2B",
    aliases: ["b2b"],
    services: [
      ["LinkedIn Profile Followers", "audience"],
      ["LinkedIn Company Page Followers", "audience"],
      ["LinkedIn Post Likes", "engagement"],
      ["LinkedIn Post Reactions", "engagement"],
      ["LinkedIn Post Comments", "comments"],
      ["LinkedIn Post Shares", "engagement"],
      ["LinkedIn Post Views", "views"],
      ["LinkedIn Company Page Promotion", "promotion"],
      ["LinkedIn Advertising Campaigns", "advertising"],
    ],
  },
  {
    id: "pinterest",
    name: "Pinterest",
    short: "Pinterest",
    icon: "pinterest",
    color: "#BD081C",
    ink: "#FFFFFF",
    tagline: "Pins, boards and discovery",
    aliases: ["pins"],
    services: [
      ["Pinterest Followers", "audience"],
      ["Pinterest Pin Saves", "engagement"],
      ["Pinterest Pin Engagement", "engagement"],
      ["Pinterest Pin Promotion", "promotion"],
      ["Pinterest Profile Promotion", "promotion"],
      ["Pinterest Advertising Campaigns", "advertising"],
    ],
  },
  {
    id: "snapchat",
    name: "Snapchat",
    short: "Snapchat",
    icon: "snapchat",
    color: "#FFFC00",
    ink: "#0F1014",
    tagline: "Stories, Spotlight and profiles",
    aliases: ["snap", "spotlight"],
    services: [
      ["Snapchat Followers", "audience"],
      ["Snapchat Story Views", "views"],
      ["Snapchat Spotlight Views", "views"],
      ["Snapchat Spotlight Engagement", "engagement"],
      ["Snapchat Profile Promotion", "promotion"],
      ["Snapchat Advertising Campaigns", "advertising"],
    ],
  },
  {
    id: "twitch",
    name: "Twitch",
    short: "Twitch",
    icon: "twitch",
    color: "#9146FF",
    ink: "#FFFFFF",
    tagline: "Channels and live streams",
    aliases: ["stream", "streaming"],
    services: [
      ["Twitch Channel Followers", "audience"],
      ["Twitch Live Stream Promotion", "promotion"],
      ["Twitch Channel Promotion", "promotion"],
      ["Twitch Community Campaigns", "community"],
    ],
  },
  {
    id: "discord",
    name: "Discord",
    short: "Discord",
    icon: "discord",
    color: "#5865F2",
    ink: "#FFFFFF",
    tagline: "Servers and community discovery",
    aliases: ["server"],
    services: [
      ["Discord Server Promotion", "promotion"],
      ["Discord Community Discovery", "community"],
      ["Discord Community Advertising", "advertising"],
      ["Discord Community Growth Campaigns", "community"],
    ],
  },
  {
    id: "reddit",
    name: "Reddit",
    short: "Reddit",
    icon: "reddit",
    color: "#FF4500",
    ink: "#FFFFFF",
    tagline: "Communities and posts",
    aliases: ["subreddit"],
    services: [
      ["Reddit Community Promotion", "promotion"],
      ["Reddit Post Promotion", "promotion"],
      ["Reddit Advertising Campaigns", "advertising"],
      ["Reddit Community Awareness Campaigns", "community"],
    ],
  },
  {
    id: "music",
    name: "Spotify & Music",
    short: "Music",
    icon: "spotify",
    color: "#1ED760",
    ink: "#0F1014",
    tagline: "Spotify, SoundCloud and music discovery",
    aliases: ["spotify", "soundcloud", "music", "artist", "track", "playlist"],
    services: [
      ["Spotify Artist Promotion", "music"],
      ["Spotify Playlist Pitching", "music"],
      ["Spotify Music Advertising", "advertising"],
      ["SoundCloud Track Promotion", "music"],
      ["SoundCloud Artist Promotion", "music"],
      ["Music Discovery Campaigns", "music"],
    ],
  },
  {
    id: "website",
    name: "Website Promotion",
    short: "Website",
    icon: "website",
    color: "#7047EB",
    ink: "#FFFFFF",
    tagline: "Traffic, search and brand awareness",
    aliases: ["web", "site", "google"],
    services: [
      ["Website Traffic Campaigns", "advertising"],
      ["Search Advertising Campaigns", "advertising"],
      ["Display & Retargeting Campaigns", "advertising"],
      ["Brand Awareness Campaigns", "advertising"],
      ["Landing Page Promotion", "promotion"],
      ["Referral Campaigns", "promotion"],
      ["SEO Optimization", "seo"],
      ["Technical SEO Audit", "seo"],
      ["Local SEO", "seo"],
      ["Content Marketing for SEO", "seo"],
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*  Derived catalog                                                           */
/* -------------------------------------------------------------------------- */

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const PLATFORMS: Platform[] = SEEDS.map(({ services, ...p }) => (void services, p));

export const PLATFORM_BY_ID: Record<string, Platform> = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));

export const SERVICES: Service[] = SEEDS.flatMap((seed) =>
  seed.services.map(([name, category]) => {
    const id = slug(name);
    const activation = ACTIVATIONS[id];
    const status: ServiceStatus = activation ? "active" : "preview";
    return {
      id,
      name,
      platformId: seed.id,
      category,
      status,
      description: describe(seed, category),
      featured: FEATURED.has(id),
      price: activation?.price ?? null,
      limits: activation?.limits ?? null,
    };
  }),
);

export const SERVICE_BY_ID: Record<string, Service> = Object.fromEntries(SERVICES.map((s) => [s.id, s]));

export function servicesFor(platformId: string) {
  return SERVICES.filter((s) => s.platformId === platformId);
}

export function platformSummary(platformId: string) {
  const list = servicesFor(platformId);
  const categories = CATEGORY_ORDER.filter((c) => list.some((s) => s.category === c));
  return {
    total: list.length,
    active: list.filter((s) => s.status === "active").length,
    categories,
  };
}

export const CATALOG_TOTALS = {
  platforms: PLATFORMS.length,
  services: SERVICES.length,
  active: SERVICES.filter((s) => s.status === "active").length,
  categories: CATEGORY_ORDER.filter((c) => SERVICES.some((s) => s.category === c)).length,
};

/* -------------------------------------------------------------------------- */
/*  Search                                                                    */
/* -------------------------------------------------------------------------- */

const SYNONYMS: Record<string, string[]> = {
  like: ["reactions"],
  likes: ["reactions"],
  view: ["views", "plays"],
  views: ["view", "plays"],
  follower: ["followers", "subscribers", "members"],
  followers: ["follower", "subscribers", "members"],
  subscribers: ["followers"],
  members: ["followers"],
  ads: ["advertising", "campaigns"],
  ad: ["advertising", "campaigns"],
  promote: ["promotion"],
  boost: ["promotion"],
  visitors: ["traffic"],
  google: ["search", "seo"],
};

function words(s: string) {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

const HAYSTACK = new Map(
  SERVICES.map((s) => {
    const p = PLATFORM_BY_ID[s.platformId];
    const meta = CATEGORY_META[s.category];
    return [s.id, words([s.name, p.name, p.aliases.join(" "), meta.short].join(" "))];
  }),
);

/** Every query word must prefix-match a word in the service (or a synonym). */
export function matchesQuery(service: Service, query: string) {
  const terms = words(query);
  if (!terms.length) return true;
  const hay = HAYSTACK.get(service.id) ?? [];
  return terms.every((t) => {
    const options = [t, ...(SYNONYMS[t] ?? [])];
    return options.some((o) => hay.some((w) => w.startsWith(o)));
  });
}
