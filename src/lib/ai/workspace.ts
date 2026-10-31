import { z } from "zod";
import type { AiAvailability } from "./registry";

/*
 * SociVanta AI workspace (AI-09): the Command Center's destinations, the
 * goal-based onboarding choices and the deterministic tool recommendations.
 * Shared by the server (validation) and the client (instant previews).
 * Recommendations are plain rules: personalising navigation never calls a model.
 */

export const AI_ROUTES = {
  home: "/dashboard/ai",
  welcome: "/dashboard/ai/welcome",
  usage: "/dashboard/ai/usage",
  plans: "/dashboard/ai/plans",
  pricing: "/pricing",
} as const;

export const PERSONAS = [
  { id: "creator", label: "Content Creator", hint: "You make posts, videos or streams.", reason: "Popular with creators" },
  { id: "small_business", label: "Small Business", hint: "You promote a local or online business.", reason: "Popular with small businesses" },
  { id: "agency", label: "Marketing Agency", hint: "You run social media for clients.", reason: "Popular with agencies" },
  { id: "ecommerce", label: "Ecommerce Brand", hint: "You sell products online.", reason: "Popular with online stores" },
  { id: "freelancer", label: "Freelancer", hint: "You offer your own services.", reason: "Popular with freelancers" },
  { id: "exploring", label: "Exploring AI Tools", hint: "You're curious what's possible.", reason: "A good place to start" },
] as const;
export type PersonaId = (typeof PERSONAS)[number]["id"];

export const GOALS = [
  { id: "content", label: "Create better content", hint: "Captions, hashtags and fresh ideas." },
  { id: "save_time", label: "Save time managing social media", hint: "Plan once, with reminders that follow up." },
  { id: "campaigns", label: "Plan marketing campaigns", hint: "Launches and promotions, step by step." },
  { id: "services", label: "Discover marketing services", hint: "Find services that fit your goal." },
  { id: "organize", label: "Organize content", hint: "Drafts and a calendar in one place." },
  { id: "strategy", label: "Improve my marketing strategy", hint: "Clear priorities and a roadmap." },
] as const;
export type GoalId = (typeof GOALS)[number]["id"];

export const PERSONA_IDS = PERSONAS.map((p) => p.id) as [PersonaId, ...PersonaId[]];
export const GOAL_IDS = GOALS.map((g) => g.id) as [GoalId, ...GoalId[]];
export const PERSONA_BY_ID = Object.fromEntries(PERSONAS.map((p) => [p.id, p])) as Record<PersonaId, (typeof PERSONAS)[number]>;
export const GOAL_BY_ID = Object.fromEntries(GOALS.map((g) => [g.id, g])) as Record<GoalId, (typeof GOALS)[number]>;

/** What the onboarding form may send. Strict: no other fields are accepted or stored. */
export const profileInputSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("complete"), persona: z.enum(PERSONA_IDS), goals: z.array(z.enum(GOAL_IDS)).min(1).max(GOALS.length) }),
  z.strictObject({ action: z.literal("skip") }),
]);
export type ProfileInput = z.infer<typeof profileInputSchema>;

export interface AiProfileView {
  persona: PersonaId | null;
  goals: GoalId[];
  onboarding: "completed" | "skipped";
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*  Destinations                                                              */
/* -------------------------------------------------------------------------- */

export type DestinationGroup = "content" | "growth" | "assist" | "orders" | "social";
export type DestinationIcon =
  | "caption" | "hashtag" | "ideas" | "calendar" | "advisor" | "roadmap" | "recommend" | "assistant" | "search" | "order" | "explain" | "support"
  | "social" | "publishing" | "planner" | "campaign" | "automation";

export interface AiDestination {
  id: string;
  name: string;
  /** A short verb phrase for quick actions. */
  action?: string;
  blurb: string;
  href: string;
  group: DestinationGroup;
  icon: DestinationIcon;
  /** The AI tool behind it; its live availability decides the badge. */
  toolId?: string;
  /** For workspace areas that work without AI: what is honestly true today. */
  note?: string;
}

export const DESTINATION_GROUPS: { id: DestinationGroup; name: string; description: string }[] = [
  { id: "content", name: "AI Content Studio", description: "Captions, hashtags, ideas and posting plans." },
  { id: "growth", name: "Growth Intelligence", description: "Strategy, roadmaps and service recommendations." },
  { id: "assist", name: "AI Assistant & Search", description: "Answers about SociVanta and smarter service search." },
  { id: "orders", name: "Order & Support AI", description: "Help choosing, understanding and fixing orders." },
  { id: "social", name: "Social workspace", description: "Drafts, calendar, campaigns and automations." },
];

export const DESTINATIONS: AiDestination[] = [
  { id: "caption-generator", toolId: "caption-generator", name: "AI Caption Generator", action: "Create a caption", blurb: "Captions in your tone, shaped for each platform.", href: "/ai-tools/caption-generator", group: "content", icon: "caption" },
  { id: "hashtag-finder", toolId: "hashtag-finder", name: "AI Hashtag & Keyword Finder", action: "Find hashtags", blurb: "Relevant tags and search terms, broad to niche.", href: "/ai-tools/hashtag-keyword-finder", group: "content", icon: "hashtag" },
  { id: "post-ideas", toolId: "post-ideas", name: "AI Post Ideas Generator", action: "Generate post ideas", blurb: "Fresh angles with a format and outline each.", href: "/ai-tools/post-ideas-generator", group: "content", icon: "ideas" },
  { id: "content-calendar", toolId: "content-calendar", name: "AI Content Calendar", action: "Build a content calendar", blurb: "A balanced week-by-week posting plan.", href: "/ai-tools/content-calendar", group: "content", icon: "calendar" },
  { id: "growth-advisor", toolId: "growth-advisor", name: "AI Growth Advisor", action: "Get growth advice", blurb: "A prioritised strategy for your goal.", href: "/ai-tools/growth-advisor", group: "growth", icon: "advisor" },
  { id: "growth-roadmap", toolId: "growth-roadmap", name: "AI Growth Roadmap", action: "Create a growth roadmap", blurb: "A 7, 30 or 90-day plan you can follow.", href: "/ai-tools/growth-roadmap", group: "growth", icon: "roadmap" },
  { id: "service-recommender", toolId: "service-recommender", name: "AI Service Recommender", action: "Find marketing services", blurb: "Services from the catalogue matched to your goal.", href: "/ai-tools/service-recommender", group: "growth", icon: "recommend" },
  { id: "assistant", toolId: "assistant", name: "SociVanta AI Assistant", blurb: "Plain answers about SociVanta and its services.", href: "/ai-tools/assistant", group: "assist", icon: "assistant" },
  { id: "service-search", toolId: "service-search", name: "AI-Powered Service Search", blurb: "Describe what you need; get matching services.", href: "/ai-tools/service-search", group: "assist", icon: "search" },
  { id: "order-assistant", toolId: "order-assistant", name: "Smart Order Assistant", blurb: "Help choosing the right service and quantity.", href: "/ai-tools/smart-order-assistant", group: "orders", icon: "order" },
  { id: "order-explanation", toolId: "order-explanation", name: "AI Order Explanation", blurb: "What's happening with an order, in plain words.", href: "/ai-tools/order-explanation", group: "orders", icon: "explain" },
  { id: "support-assistant", toolId: "support-assistant", name: "AI Support Assistant", blurb: "Quick answers before you open a ticket.", href: "/ai-tools/support-assistant", group: "orders", icon: "support" },
  { id: "social", name: "Social Management", action: "Explore Social Management", blurb: "Your social accounts in one calm workspace.", href: "/dashboard/social", group: "social", icon: "social", note: "Account connections are awaiting platform approvals." },
  { id: "publishing", name: "Publishing", blurb: "Write and organise drafts for every platform.", href: "/dashboard/social/publishing", group: "social", icon: "publishing", note: "Drafts work today. Live publishing is off." },
  { id: "calendar", name: "Content Calendar", blurb: "See planned content across the month.", href: "/dashboard/social/calendar", group: "social", icon: "planner", note: "Planning works today. Nothing is posted for you." },
  { id: "campaigns", toolId: "campaign-planner", name: "Campaign Studio", blurb: "Turn a launch into a plan of drafts.", href: "/dashboard/social/campaigns", group: "social", icon: "campaign" },
  { id: "automations", name: "Automation Studio", blurb: "Reminders, checklists and draft reviews on a schedule.", href: "/dashboard/social/automations", group: "social", icon: "automation", note: "Works today, without AI." },
];

export const DESTINATION_BY_ID = Object.fromEntries(DESTINATIONS.map((d) => [d.id, d])) as Record<string, AiDestination>;

/** The eight Command Center quick actions, in display order. */
export const QUICK_ACTION_IDS = ["caption-generator", "hashtag-finder", "post-ideas", "content-calendar", "growth-advisor", "growth-roadmap", "service-recommender", "social"] as const;

/** A destination's state right now: an AI tool follows its live availability; workspace areas work today. */
export function destinationAvailability(d: AiDestination, tools: Record<string, AiAvailability>): AiAvailability {
  return d.toolId ? (tools[d.toolId] ?? "coming_soon") : "available";
}

/* -------------------------------------------------------------------------- */
/*  Recommendations                                                           */
/* -------------------------------------------------------------------------- */

const PERSONA_PICKS: Record<PersonaId, string[]> = {
  creator: ["caption-generator", "post-ideas", "content-calendar"],
  small_business: ["growth-advisor", "growth-roadmap", "service-recommender"],
  agency: ["content-calendar", "campaigns", "social"],
  ecommerce: ["post-ideas", "campaigns", "service-recommender"],
  freelancer: ["caption-generator", "content-calendar", "automations"],
  exploring: ["caption-generator", "growth-advisor", "assistant"],
};

const GOAL_PICKS: Record<GoalId, string[]> = {
  content: ["caption-generator", "post-ideas", "hashtag-finder"],
  save_time: ["automations", "content-calendar", "publishing"],
  campaigns: ["campaigns", "content-calendar", "growth-roadmap"],
  services: ["service-recommender", "service-search", "order-assistant"],
  organize: ["publishing", "calendar", "automations"],
  strategy: ["growth-advisor", "growth-roadmap"],
};

const FILL = ["automations", "caption-generator", "growth-advisor", "content-calendar", "assistant"];

export interface Recommendation {
  destination: AiDestination;
  /** Why it was picked, in plain words (persona first, then goals). */
  reasons: string[];
}

/**
 * Up to `limit` destinations for a persona and goals. Deterministic: the
 * persona's picks score highest, each goal adds to its picks, and ties keep
 * catalogue order. Without a profile, a balanced starter set is returned.
 */
export function recommend(persona: PersonaId | null, goals: readonly GoalId[], limit = 4): Recommendation[] {
  const score = new Map<string, number>();
  const reasons = new Map<string, string[]>();
  const add = (id: string, points: number, reason: string) => {
    if (!DESTINATION_BY_ID[id]) return;
    score.set(id, (score.get(id) ?? 0) + points);
    const r = reasons.get(id) ?? [];
    if (!r.includes(reason)) r.push(reason);
    reasons.set(id, r);
  };
  const p = persona ?? (goals.length ? null : "exploring");
  if (p) PERSONA_PICKS[p].forEach((id, i) => add(id, 10 - i, PERSONA_BY_ID[p].reason));
  for (const g of goals) GOAL_PICKS[g]?.forEach((id, i) => add(id, 6 - i, GOAL_BY_ID[g].label));
  const order = new Map(DESTINATIONS.map((d, i) => [d.id, i]));
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1] || order.get(a[0])! - order.get(b[0])!).map(([id]) => id);
  // When picks overlap, fill the remaining slots from a fixed list so the layout never has a gap.
  for (const id of FILL) {
    if (ranked.length >= limit || ranked.includes(id)) continue;
    ranked.push(id);
    reasons.set(id, ["Also worth exploring"]);
  }
  return ranked.slice(0, limit).map((id) => ({ destination: DESTINATION_BY_ID[id], reasons: reasons.get(id)! }));
}

/** Normalises stored goals: known ids only, no duplicates, catalogue order. */
export const cleanGoals = (raw: unknown): GoalId[] => (Array.isArray(raw) ? GOAL_IDS.filter((g) => raw.includes(g)) : []);
export const cleanPersona = (raw: unknown): PersonaId | null => (PERSONA_IDS as readonly string[]).includes(raw as string) ? (raw as PersonaId) : null;

/* -------------------------------------------------------------------------- */
/*  Command Center and usage views                                            */
/* -------------------------------------------------------------------------- */

export interface WorkspaceSnapshot {
  drafts: { total: number; recent: { id: string; title: string; updatedAt: string }[] };
  planned: { total: number; next: { id: string; title: string; at: string } | null };
  automations: { total: number; active: number; nextRunAt: string | null; openInbox: number };
  accounts: { connected: number };
}

export interface CommandCenterData {
  firstName: string;
  profile: AiProfileView | null;
  tools: Record<string, AiAvailability>;
  /** Whether any AI tool can run right now. */
  generation: boolean;
  workspace: WorkspaceSnapshot;
  /** Runs counted toward allowances today, across tools; null when usage can't be read. */
  runsToday: number | null;
  plan: { id: string; name: string };
}

export const USAGE_OUTCOMES = {
  ok: { label: "Completed", counted: true },
  pending: { label: "In progress", counted: true },
  rejected_quota: { label: "Stopped: daily allowance reached", counted: false },
  rejected_budget: { label: "Paused: platform safety limit reached", counted: false },
  provider_error: { label: "AI service error", counted: false },
  timeout: { label: "AI service timed out", counted: false },
  invalid_output: { label: "Result couldn't be used", counted: false },
} as const;
export type UsageOutcome = keyof typeof USAGE_OUTCOMES;

export interface ToolUsageRow {
  toolId: string;
  name: string;
  href: string | null;
  group: DestinationGroup;
  availability: AiAvailability;
  /** Runs a day for a signed-in account (operator overrides applied). 0 = not part of free use. */
  allowance: number;
  used: number;
  remaining: number;
  /** Today's request outcomes for this tool. */
  outcomes: Partial<Record<UsageOutcome, number>>;
}

export interface UsageData {
  plan: { id: string; name: string };
  /** False when usage records can't be read (for example, sign-in secrets are not configured). */
  readable: boolean;
  generation: boolean;
  resetAt: string;
  tools: ToolUsageRow[];
  totals: { counted: number; notCounted: number };
}
