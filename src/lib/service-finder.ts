/**
 * Smart Service Finder — a transparent, rules-based matcher.
 *
 * Everything here is derived from catalog data: a service's platform, its
 * category, words in its name and the options its order form already offers.
 * Nothing is predicted and no metadata is invented. Every recommendation
 * carries the plain-language reasons that produced its score.
 *
 * Metric services (followers, likes, views, comments) are never recommended
 * as a growth strategy. When they match, they're listed separately as
 * needing platform-policy and fulfilment review.
 */

import {
  CATEGORY_FIELDS,
  CATEGORY_META,
  CATEGORY_ORDER,
  PLATFORM_BY_ID,
  PLATFORMS,
  type Platform,
  type Service,
  type ServiceCategory,
  SERVICES,
} from "@/lib/catalog";

/* -------------------------------------------------------------------------- */
/*  How each category is delivered                                            */
/* -------------------------------------------------------------------------- */

export type Approach = "ads" | "business" | "content" | "disclosed" | "review";

export const APPROACH_OF: Record<ServiceCategory, Approach> = {
  advertising: "ads",
  messaging: "business",
  seo: "content",
  promotion: "disclosed",
  community: "disclosed",
  music: "disclosed",
  audience: "review",
  engagement: "review",
  views: "review",
  comments: "review",
};

export const APPROACH_META: Record<Approach, { label: string; note: string }> = {
  ads: { label: "Official ad platform", note: "Runs inside the platform's own ads manager." },
  business: { label: "Official business platform", note: "Uses the official WhatsApp Business Platform with opted-in contacts." },
  content: { label: "Content & SEO work", note: "Work on your own website and content." },
  disclosed: { label: "Disclosed promotion", note: "Native promotion tools or placements labelled as sponsored." },
  review: {
    label: "Needs policy review",
    note: "Ordering stays closed until platform-policy and fulfilment checks are complete. Not recommended as a growth strategy.",
  },
};

export const isRecommendable = (s: Service) => APPROACH_OF[s.category] !== "review";

/* -------------------------------------------------------------------------- */
/*  Goals                                                                     */
/* -------------------------------------------------------------------------- */

export type GoalId = "audience" | "post" | "visibility" | "traffic" | "business" | "community" | "presence" | "explore";

export interface Goal {
  id: GoalId;
  label: string;
  hint: string;
  /** Used in explanations: "…you selected YouTube and {phrase}." */
  phrase: string;
  /** How strongly each recommendable category serves this goal. */
  weights: Partial<Record<ServiceCategory, number>>;
  /** Metric categories that match but are only listed as needing review. */
  review: ServiceCategory[];
  /** Words in a service name that make it a closer fit. */
  keywords: string[];
}

const ALL_RECOMMENDABLE = Object.fromEntries(
  CATEGORY_ORDER.filter((c) => APPROACH_OF[c] !== "review").map((c) => [c, 1]),
) as Partial<Record<ServiceCategory, number>>;

export const GOALS: Goal[] = [
  {
    id: "audience",
    label: "Grow my audience",
    hint: "Reach more people who could follow you",
    phrase: "audience growth",
    weights: { promotion: 3, advertising: 2, community: 2, music: 2 },
    review: ["audience"],
    keywords: ["Profile", "Page", "Channel", "Artist", "Server", "Group"],
  },
  {
    id: "post",
    label: "Promote a post or video",
    hint: "Put a specific post, video or stream in front of more people",
    phrase: "post and video promotion",
    weights: { promotion: 3, advertising: 2, music: 1 },
    review: ["views", "engagement"],
    keywords: ["Post", "Video", "Reels", "Shorts", "Pin", "Live", "Track"],
  },
  {
    id: "visibility",
    label: "Increase content visibility",
    hint: "Help your content get discovered",
    phrase: "content visibility",
    weights: { promotion: 3, advertising: 2, music: 2, community: 1 },
    review: ["views"],
    keywords: ["Discovery", "Awareness", "Status", "Spotlight", "Live", "Display", "Playlist"],
  },
  {
    id: "traffic",
    label: "Drive website traffic",
    hint: "Send visitors to your site or landing page",
    phrase: "website traffic",
    weights: { advertising: 3, seo: 3, promotion: 1 },
    review: [],
    keywords: ["Website", "Traffic", "Landing", "Search", "Referral", "SEO"],
  },
  {
    id: "business",
    label: "Promote my business",
    hint: "Advertise products, services or a local business",
    phrase: "business promotion",
    weights: { advertising: 3, messaging: 3, promotion: 2, seo: 2 },
    review: [],
    keywords: ["Business", "Catalog", "Company", "Brand", "Local", "Marketing", "Click-to-WhatsApp"],
  },
  {
    id: "community",
    label: "Build a community",
    hint: "Grow a group, server or channel around your brand",
    phrase: "community building",
    weights: { community: 3, promotion: 2, messaging: 1, advertising: 1 },
    review: ["audience"],
    keywords: ["Community", "Group", "Server", "Channel", "Discovery", "Broadcast"],
  },
  {
    id: "presence",
    label: "Improve my online presence",
    hint: "Look more established in search and on your profiles",
    phrase: "a stronger online presence",
    weights: { seo: 3, promotion: 2, messaging: 2, advertising: 1 },
    review: [],
    keywords: ["SEO", "Profile", "Optimization", "Brand", "Local", "Content", "Company"],
  },
  {
    id: "explore",
    label: "Explore available services",
    hint: "See what's possible across every platform",
    phrase: "a look at what's available",
    weights: ALL_RECOMMENDABLE,
    review: ["audience", "engagement", "views", "comments"],
    keywords: [],
  },
];

export const GOAL_BY_ID = Object.fromEntries(GOALS.map((g) => [g.id, g])) as Record<GoalId, Goal>;

/* -------------------------------------------------------------------------- */
/*  Refinements                                                               */
/* -------------------------------------------------------------------------- */

export interface Option {
  id: string;
  label: string;
  /** Lower-case fragment for explanations. */
  phrase: string;
}

/** "What are you promoting?" — matched against words in service names. */
export const CONTENT_TYPES: (Option & { keywords: string[] })[] = [
  { id: "profile", label: "A profile, page or channel", phrase: "profiles and pages", keywords: ["Profile", "Page", "Channel", "Account"] },
  { id: "post", label: "A post or pin", phrase: "posts", keywords: ["Post", "Pin"] },
  { id: "video", label: "A video, reel or short", phrase: "video content", keywords: ["Video", "Reels", "Shorts", "Spotlight", "Story", "Status"] },
  { id: "live", label: "A live stream", phrase: "live streams", keywords: ["Live"] },
  { id: "community", label: "A group, server or community", phrase: "communities", keywords: ["Group", "Server", "Community"] },
  { id: "music", label: "Music or an artist", phrase: "music", keywords: ["Track", "Artist", "Playlist", "Music"] },
  { id: "business", label: "A business or product", phrase: "businesses and products", keywords: ["Business", "Catalog", "Company", "Brand", "Local", "Event"] },
  { id: "website", label: "A website or landing page", phrase: "websites", keywords: ["Website", "Landing", "SEO", "Search", "Traffic"] },
];

/** Marketing objectives, matched against the goal options each order form already offers. */
export const OBJECTIVES: (Option & { formOptions: string[] })[] = [
  { id: "awareness", label: "Awareness & reach", phrase: "awareness", formOptions: ["Awareness", "Reach"] },
  { id: "traffic", label: "Visits & traffic", phrase: "traffic", formOptions: ["Website traffic", "Profile visits"] },
  { id: "engagement", label: "Engagement", phrase: "engagement", formOptions: ["Engagement"] },
  { id: "conversions", label: "Leads & sales", phrase: "leads and sales", formOptions: ["Leads", "Sales", "App installs"] },
];

export interface Choices {
  goal: GoalId | null;
  /** A platform id, "any", or null before choosing. */
  platform: string | null;
  type: string | null;
  category: ServiceCategory | null;
  objective: string | null;
}

export const EMPTY_CHOICES: Choices = { goal: null, platform: null, type: null, category: null, objective: null };

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean);
const NAME_WORDS = new Map(SERVICES.map((s) => [s.id, words(s.name)]));
const hasWord = (s: Service, keyword: string) => {
  const k = keyword.toLowerCase();
  if (k.includes("-")) return s.name.toLowerCase().includes(k);
  return (NAME_WORDS.get(s.id) ?? []).some((w) => w === k || w === `${k}s` || `${w}s` === k);
};
const matchesAny = (s: Service, keywords: string[]) => keywords.filter((k) => hasWord(s, k));

/** The goal options a service's order form offers, if any. */
const formGoals = (s: Service) => CATEGORY_FIELDS[s.category].find((f) => f.id === "goal")?.options ?? [];
const supportsObjective = (s: Service, objectiveId: string) => {
  const o = OBJECTIVES.find((x) => x.id === objectiveId);
  return Boolean(o && formGoals(s).some((g) => o.formOptions.includes(g)));
};

const onPlatform = (s: Service, platform: string | null) => !platform || platform === "any" || s.platformId === platform;

/** Every service that's relevant to the goal on the chosen platform, before refinements. */
export function candidatePool(goal: Goal, platform: string | null) {
  return SERVICES.filter(
    (s) => onPlatform(s, platform) && ((isRecommendable(s) && (goal.weights[s.category] ?? 0) > 0) || goal.review.includes(s.category)),
  );
}

/** Platforms ordered by their best-fitting service for the goal, then by how many fit. */
export function platformsFor(goal: Goal) {
  const rows = PLATFORMS.map((p) => {
    const fits = candidatePool(goal, p.id)
      .filter(isRecommendable)
      .map((s) => score(s, goal, { ...EMPTY_CHOICES, goal: goal.id, platform: p.id }).score);
    return { platform: p, matches: fits.length, best: Math.max(0, ...fits) };
  });
  return {
    // Array.sort is stable, so ties keep catalog order.
    relevant: rows.filter((r) => r.matches > 0).sort((a, b) => b.best - a.best || b.matches - a.matches),
    other: rows.filter((r) => r.matches === 0),
  };
}

/** Only questions whose answers would change the ranking are asked. */
export function questionsFor(choices: Choices) {
  const goal = choices.goal ? GOAL_BY_ID[choices.goal] : null;
  if (!goal) return { types: [], categories: [], objectives: [], priced: false };
  const pool = candidatePool(goal, choices.platform);

  const types = CONTENT_TYPES.map((t) => ({ ...t, count: pool.filter((s) => matchesAny(s, t.keywords).length).length })).filter(
    (t) => t.count > 0,
  );
  const categories = CATEGORY_ORDER.map((c) => ({ id: c, count: pool.filter((s) => s.category === c).length })).filter((c) => c.count > 0);
  const objectives = OBJECTIVES.map((o) => ({ ...o, count: pool.filter((s) => supportsObjective(s, o.id)).length })).filter(
    (o) => o.count > 0,
  );
  return {
    types: types.length > 1 ? types : [],
    categories: categories.length > 1 ? categories : [],
    // Objectives only differ between services when some forms offer them and others don't.
    objectives: objectives.length > 1 && pool.some((s) => !formGoals(s).length) ? objectives : [],
    /** Budget would only help once services have configured prices. */
    priced: pool.some((s) => s.price),
  };
}

/* -------------------------------------------------------------------------- */
/*  Ranking                                                                   */
/* -------------------------------------------------------------------------- */

export interface Match {
  service: Service;
  platform: Platform;
  score: number;
  /** One sentence: why this was recommended. */
  summary: string;
  /** Supporting reasons, most important first. */
  reasons: string[];
  approach: Approach;
}

export interface FinderResult {
  /** Up to five, at most three per platform when browsing every platform. */
  top: Match[];
  alternatives: Match[];
  /** Matching metric services — listed, never recommended. */
  review: Match[];
  /** Total recommendable matches before trimming. */
  total: number;
}

const TOP = 5;
const ALTERNATIVES = 5;

function score(service: Service, goal: Goal, choices: Choices): Match {
  const platform = PLATFORM_BY_ID[service.platformId];
  const approach = APPROACH_OF[service.category];
  const reasons: string[] = [];
  let points = (goal.weights[service.category] ?? 0) * 10;

  // Each goal word in the name counts, up to two, so "Website Traffic Campaigns" outranks a one-word match.
  const goalWords = matchesAny(service, goal.keywords).slice(0, 2);
  if (goalWords.length) {
    points += 4 * goalWords.length;
    const quoted = goalWords.map((w) => `“${w.toLowerCase()}”`).join(" and ");
    reasons.push(`Focused on ${quoted}, a close fit for ${goal.phrase}.`);
  }

  const type = CONTENT_TYPES.find((t) => t.id === choices.type);
  if (type && matchesAny(service, type.keywords).length) {
    points += 8;
    reasons.push(`Made for ${type.phrase}, which you said you're promoting.`);
  }

  const objective = OBJECTIVES.find((o) => o.id === choices.objective);
  if (objective && supportsObjective(service, objective.id)) {
    points += 6;
    reasons.push(`Its order form lets you set ${objective.phrase} as the campaign goal.`);
  }

  if (choices.category === service.category) reasons.push(`Matches your preferred type: ${CATEGORY_META[service.category].label.toLowerCase()}.`);

  if (service.status === "active") {
    points += 3;
    reasons.push("Pricing is verified and it's ready to order.");
  }
  if (service.featured) points += 1;

  reasons.push(APPROACH_META[approach].note);

  const where = choices.platform && choices.platform !== "any" ? `${platform.name} and ` : "";
  const summary =
    goal.id === "explore"
      ? `Shown because you're exploring ${where ? `${platform.name} services` : "every platform"}.`
      : `Recommended because you selected ${where}${goal.phrase}.`;

  return { service, platform, score: points, summary, reasons, approach };
}

const CATALOG_INDEX = new Map(SERVICES.map((s, i) => [s.id, i]));
/** Highest score first; ties keep catalog order so results are stable. */
const byScore = (a: Match, b: Match) =>
  b.score - a.score || (CATALOG_INDEX.get(a.service.id) ?? 0) - (CATALOG_INDEX.get(b.service.id) ?? 0);

export function recommend(choices: Choices): FinderResult {
  const goal = choices.goal ? GOAL_BY_ID[choices.goal] : null;
  if (!goal) return { top: [], alternatives: [], review: [], total: 0 };

  const pool = candidatePool(goal, choices.platform).filter((s) => !choices.category || s.category === choices.category);
  const matches = pool.map((s) => score(s, goal, choices));
  const recommended = matches.filter((m) => m.approach !== "review").sort(byScore);
  const review = matches
    .filter((m) => m.approach === "review")
    .sort(byScore)
    .map((m) => ({ ...m, summary: `Matches ${goal.phrase}, but this kind of service needs policy and fulfilment review.` }));

  // Across every platform, keep the shortlist varied.
  const spread = !choices.platform || choices.platform === "any";
  const top: Match[] = [];
  const perPlatform = new Map<string, number>();
  for (const m of recommended) {
    if (top.length === TOP) break;
    const used = perPlatform.get(m.platform.id) ?? 0;
    if (spread && used >= 3) continue;
    top.push(m);
    perPlatform.set(m.platform.id, used + 1);
  }
  const alternatives = recommended.filter((m) => !top.includes(m)).slice(0, ALTERNATIVES);

  return { top, alternatives, review, total: recommended.length };
}
