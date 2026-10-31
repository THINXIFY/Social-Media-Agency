/**
 * Sociotix AI — the code-defined tool registry (AI-01).
 *
 * The single source of truth for every AI tool's identity, copy, route,
 * availability and free-usage policy. Static metadata lives here (not in the
 * database) so tools are versioned with the code that implements them.
 *
 * Availability is honest. `availability` here is what a tool shows while it
 * can't run. The server upgrades a tool to "available" only when its
 * generator is implemented (AI-02: the four Content Studio tools), a provider
 * is configured and priced, and the launch switch is on after a successful
 * live test. Pages read the live state from /api/ai/tools.
 */

export type AiCategoryId = "content" | "growth" | "assist";
export type AiAvailability = "available" | "coming_soon" | "unavailable";
export type AiIconKey = "caption" | "hashtag" | "ideas" | "calendar" | "advisor" | "roadmap" | "recommend" | "assistant" | "search" | "order" | "explain" | "support" | "workflow";

export interface AiField {
  id: string;
  label: string;
  kind: "text" | "textarea" | "platforms" | "select" | "number";
  placeholder?: string;
  help?: string;
  options?: string[];
  required?: boolean;
  /** Server-enforced input limit (characters). */
  maxLength?: number;
  /** Platforms: how many may be picked. */
  maxSelect?: number;
  /** Number fields: allowed range. */
  min?: number;
  max?: number;
  /** Select fields: display text per option value. */
  optionLabels?: Record<string, string>;
  /** Optional detail shown under "More options" in the workspace (collapsed by default). */
  advanced?: boolean;
}

export interface AiOutputSection {
  title: string;
  description: string;
}

export interface AiTool {
  id: string;
  slug: string;
  name: string;
  /** One line for cards. */
  tagline: string;
  /** Plain-language explanation for the tool page. */
  description: string;
  category: AiCategoryId;
  icon: AiIconKey;
  /** Planned phase (internal roadmap label). */
  phase: "AI-02" | "AI-03" | "AI-04" | "AI-05" | "AI-07" | "AI-08" | "Later";
  /** Declared availability; the server can only ever downgrade it. */
  availability: AiAvailability;
  /** Why it isn't available yet, in plain language. */
  status: string;
  auth: "none" | "account";
  /** Planned free allowance per day (not active until the tool launches). */
  free: { anonymousPerDay: number; signedInPerDay: number } | null;
  /** What the tool will ask for (shown as a preview while it's not live). */
  fields: AiField[];
  /** How results will be organised. */
  output: AiOutputSection[];
  /** Honest limitations shown beside the tool. */
  limits: string[];
  /** Cost and size guardrails enforced by the execution pipeline. */
  guard: { maxInputChars: number; maxOutputTokens: number; maxCostMicros: number; /** Characters of instructions and server-supplied context per call (cost ceiling estimate); default 4,000. */ promptChars?: number };
}

export const AI_CATEGORIES: { id: AiCategoryId; name: string; description: string }[] = [
  { id: "content", name: "Content Creation", description: "Words, tags and ideas for the posts you're about to publish." },
  { id: "growth", name: "Growth & Strategy", description: "Plans and recommendations shaped around your goals." },
  { id: "assist", name: "Smart Assistance", description: "Help finding services, understanding orders and getting answers." },
];

export const PLATFORM_CHOICES = ["Instagram", "TikTok", "YouTube", "Facebook", "X", "LinkedIn", "Pinterest", "Threads"];

export const TONE_CHOICES = ["Friendly", "Professional", "Playful", "Bold", "Inspirational"] as const;
export const GOAL_CHOICES = ["Grow followers", "More engagement", "Drive website visits", "Sell a product", "Build a community"] as const;

/*
 * Guards are per provider call. maxOutputTokens includes any model thinking;
 * maxCostMicros is the most one call may cost (checked against the model's
 * price before anything is sent) and what each call reserves from the budget.
 */
const CONTENT_GUARD = { maxInputChars: 2_000, maxOutputTokens: 4_000, maxCostMicros: 100_000 };
const STRATEGY_GUARD = { maxInputChars: 3_000, maxOutputTokens: 2_000, maxCostMicros: 40_000 };
/** Growth Intelligence (AI-03): strategy-length answers. Opus 5.5 worst case ≈ $0.134 per call. */
const GROWTH_GUARD = { maxInputChars: 3_000, maxOutputTokens: 6_000, maxCostMicros: 150_000 };
/** Service Recommender: up to 30 catalog candidates are added to the prompt. */
const RECOMMENDER_GUARD = { maxInputChars: 2_000, maxOutputTokens: 4_000, maxCostMicros: 120_000, promptChars: 14_000 };

/** AI Assistant (AI-04): a bounded conversation plus a verified knowledge sheet per turn. Opus 5.5 worst case ≈ $0.074. */
const ASSISTANT_GUARD = { maxInputChars: 8_000, maxOutputTokens: 2_000, maxCostMicros: 90_000, promptChars: 10_000 };
/** AI Service Search (AI-04): up to 40 catalog candidates in the prompt. Opus 5.5 worst case ≈ $0.094. */
const SEARCH_GUARD = { maxInputChars: 1_000, maxOutputTokens: 3_000, maxCostMicros: 100_000, promptChars: 16_000 };
/** Smart Order Assistant (AI-05): up to 24 candidates with limits and order fields. Opus 5.5 worst case ≈ $0.088. */
const ORDER_ASSIST_GUARD = { maxInputChars: 1_200, maxOutputTokens: 2_500, maxCostMicros: 110_000, promptChars: 18_000 };
/** AI Order Explanation (AI-05): one order's fact sheet and timeline. Opus 5.5 worst case ≈ $0.055. */
const ORDER_EXPLAIN_GUARD = { maxInputChars: 600, maxOutputTokens: 1_500, maxCostMicros: 60_000, promptChars: 12_000 };
/** AI Support Assistant (AI-05): same bounds as the assistant. Opus 5.5 worst case ≈ $0.074. */
const SUPPORT_GUARD = { maxInputChars: 8_000, maxOutputTokens: 2_000, maxCostMicros: 90_000, promptChars: 10_000 };
/** Proposed AI-05 allowances (signed-in, per UTC day). Operators can override them with AI_DAILY_ALLOWANCES. */
const ORDER_ASSIST_FREE = { anonymousPerDay: 0, signedInPerDay: 10 };
const ORDER_EXPLAIN_FREE = { anonymousPerDay: 0, signedInPerDay: 20 };
const SUPPORT_FREE = { anonymousPerDay: 0, signedInPerDay: 15 };

export const BUSINESS_TYPES = ["Small business", "Creator", "Online store", "Local service", "SaaS / tech", "Agency", "Nonprofit"] as const;
export const GROWTH_GOALS = ["Grow followers", "More engagement", "Get more leads", "Drive website visits", "Sell more products", "Build a community", "Launch something new"] as const;
export const EXPERIENCE_LEVELS = ["Beginner", "Some experience", "Experienced"] as const;
export const BUDGET_RANGES = ["No budget", "Under $100 a month", "$100–500 a month", "$500–2,000 a month", "Over $2,000 a month"] as const;
export const TIME_AVAILABLE = ["1–2 hours a week", "3–5 hours a week", "5–10 hours a week", "10+ hours a week"] as const;
/** Catalog platforms the Service Recommender can search (ids from the SMM catalog). */
export const CATALOG_PLATFORM_CHOICES: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", facebook: "Facebook", x: "X / Twitter", linkedin: "LinkedIn", pinterest: "Pinterest", telegram: "Telegram", whatsapp: "WhatsApp", snapchat: "Snapchat", twitch: "Twitch", discord: "Discord", reddit: "Reddit", music: "Spotify & Music", website: "Website Promotion" };
export const SERVICE_FOCUS = ["Audience", "Engagement", "Views", "Advertising"] as const;
const FREE_CONTENT = { anonymousPerDay: 0, signedInPerDay: 10 };

const PLATFORMS: AiField = { id: "platforms", label: "Platforms", kind: "platforms", options: PLATFORM_CHOICES, required: true, maxSelect: 3, help: "Pick up to 3. Each gets wording that fits how people use it." };
const TOPIC: AiField = { id: "topic", label: "What's it about?", kind: "textarea", placeholder: "e.g. Launching our autumn coffee menu — warm, cosy, a little playful", required: true, maxLength: 600 };
const TONE: AiField = { id: "tone", label: "Tone", kind: "select", options: [...TONE_CHOICES] };
const AUDIENCE: AiField = { id: "audience", label: "Who's it for?", kind: "text", placeholder: "e.g. Local students and remote workers", maxLength: 160, advanced: true, help: "Helps the wording and references fit the people you are writing for." };
const GOAL: AiField = { id: "goal", label: "Your goal", kind: "select", options: [...GOAL_CHOICES], required: true };
const BRAND: AiField = { id: "brand", label: "About your brand", kind: "textarea", placeholder: "e.g. Independent bike repair shop in Leeds", required: true, maxLength: 600 };

export const AI_TOOLS: AiTool[] = [
  {
    id: "caption-generator",
    slug: "caption-generator",
    name: "AI Caption Generator",
    tagline: "Captions that sound like you, tuned for each platform.",
    description: "Describe your post and pick where it's going. You'll get caption options in your chosen tone, each shaped for how people read on that platform.",
    category: "content",
    icon: "caption",
    phase: "AI-02",
    availability: "coming_soon",
    status: "Coming in Content Studio.",
    auth: "account",
    free: FREE_CONTENT,
    fields: [TOPIC, PLATFORMS, TONE, AUDIENCE],
    output: [
      { title: "Caption options", description: "Several variations per platform to choose from." },
      { title: "Hook lines", description: "Short openers you can swap in." },
      { title: "Call to action", description: "A closing line matched to your goal." },
    ],
    limits: ["Always read before posting — AI can misunderstand context.", "Doesn't check facts, prices or claims."],
    guard: CONTENT_GUARD,
  },
  {
    id: "hashtag-finder",
    slug: "hashtag-keyword-finder",
    name: "AI Hashtag & Keyword Finder",
    tagline: "Relevant tags and search terms for your topic.",
    description: "Give it your topic and platform. It suggests hashtags and keywords grouped from broad to niche, so you can mix discoverability with relevance.",
    category: "content",
    icon: "hashtag",
    phase: "AI-02",
    availability: "coming_soon",
    status: "Coming in Content Studio.",
    auth: "account",
    free: FREE_CONTENT,
    fields: [{ ...TOPIC, placeholder: "e.g. Vegan meal prep for busy parents" }, PLATFORMS],
    output: [
      { title: "Hashtags", description: "Grouped from broad to niche." },
      { title: "Keywords", description: "Phrases people might search for." },
    ],
    limits: ["Suggestions only — no search volume, popularity or trend data.", "Check each platform's rules on banned or restricted tags."],
    guard: CONTENT_GUARD,
  },
  {
    id: "post-ideas",
    slug: "post-ideas-generator",
    name: "AI Post Ideas Generator",
    tagline: "Fresh angles when you don't know what to post.",
    description: "Tell it about your brand and goal. It suggests post ideas with a format and a short outline for each — a starting point, not a finished post.",
    category: "content",
    icon: "ideas",
    phase: "AI-02",
    availability: "coming_soon",
    status: "Coming in Content Studio.",
    auth: "account",
    free: FREE_CONTENT,
    fields: [BRAND, GOAL, PLATFORMS],
    output: [
      { title: "Post ideas", description: "Each with a suggested format (carousel, reel, thread…)." },
      { title: "Outlines", description: "A few bullet points to build each post from." },
    ],
    limits: ["Ideas are general — they don't know your past results.", "Review for accuracy and brand fit."],
    guard: CONTENT_GUARD,
  },
  {
    id: "content-calendar",
    slug: "content-calendar",
    name: "AI Content Calendar",
    tagline: "A balanced posting plan for the weeks ahead.",
    description: "Set your goal, platforms and how often you post. You'll get a week-by-week plan with themes and post types you can adapt.",
    category: "content",
    icon: "calendar",
    phase: "AI-02",
    availability: "coming_soon",
    status: "Coming in Content Studio.",
    auth: "account",
    free: { anonymousPerDay: 0, signedInPerDay: 3 },
    fields: [
      { ...BRAND, placeholder: "e.g. A new skincare brand for sensitive skin" },
      GOAL,
      PLATFORMS,
      { id: "frequency", label: "Posts per week", kind: "number", placeholder: "3", min: 1, max: 14 },
      { id: "days", label: "Plan length", kind: "select", options: ["7", "30"], optionLabels: { "7": "7 days", "30": "30 days" }, required: true },
    ],
    output: [
      { title: "Weekly themes", description: "One focus per week." },
      { title: "Daily plan", description: "Post type and topic for each slot." },
    ],
    limits: ["Doesn't publish or schedule anything.", "Optimal posting times vary by audience."],
    // 30-day plans are generated a week at a time: up to 5 calls, each within this guard.
    guard: CONTENT_GUARD,
  },
  {
    id: "growth-advisor",
    slug: "growth-advisor",
    name: "AI Growth Advisor",
    tagline: "A clear, prioritised strategy for your social media goal.",
    description: "Describe your business, goal and what's getting in the way. You'll get an honest assessment, three to five prioritised recommendations with practical steps, quick wins and what to do this week.",
    category: "growth",
    icon: "advisor",
    phase: "AI-03",
    availability: "coming_soon",
    status: "Coming in Growth Intelligence.",
    auth: "account",
    free: { anonymousPerDay: 0, signedInPerDay: 5 },
    fields: [
      { id: "challenge", label: "What's getting in the way?", kind: "textarea", placeholder: "e.g. We post three times a week but hardly anyone comments, and we're not sure what to post next.", required: true, maxLength: 800 },
      { id: "businessType", label: "You are a…", kind: "select", options: [...BUSINESS_TYPES], required: true },
      { id: "niche", label: "Industry or niche", kind: "text", placeholder: "e.g. Specialty coffee shop in Leeds", required: true, maxLength: 120 },
      { id: "platform", label: "Main platform", kind: "select", options: PLATFORM_CHOICES, required: true },
      { id: "goal", label: "Main goal", kind: "select", options: [...GROWTH_GOALS], required: true },
      { id: "audience", label: "Who you want to reach", kind: "text", placeholder: "e.g. Students and remote workers nearby", maxLength: 160 },
      { id: "profileUrl", label: "Website or profile link", kind: "text", placeholder: "https://…", maxLength: 200, advanced: true, help: "Context only — Sociotix doesn't visit or read the link." },
      { id: "budget", label: "Monthly marketing budget", kind: "select", options: [...BUDGET_RANGES], advanced: true },
      { id: "experience", label: "Experience level", kind: "select", options: [...EXPERIENCE_LEVELS], advanced: true },
    ],
    output: [
      { title: "Growth assessment", description: "Your goal, challenges, opportunities and stated assumptions." },
      { title: "Recommended strategy", description: "Three to five prioritised recommendations with steps." },
      { title: "Quick wins and next steps", description: "What to try now, this week and how to measure it." },
    ],
    limits: ["Advice is based only on what you share — it can't see your accounts or results.", "Recommendations, not guarantees: test them and keep what works."],
    guard: GROWTH_GUARD,
  },
  {
    id: "growth-roadmap",
    slug: "growth-roadmap",
    name: "AI Growth Roadmap",
    tagline: "A realistic 7, 30 or 90-day plan with milestones.",
    description: "Tell it your niche, objective and how much time you have. You'll get a timeline of prioritised tasks, milestones, review checkpoints and success indicators sized to your resources.",
    category: "growth",
    icon: "roadmap",
    phase: "AI-03",
    availability: "coming_soon",
    status: "Coming in Growth Intelligence.",
    auth: "account",
    free: { anonymousPerDay: 0, signedInPerDay: 3 },
    fields: [
      { id: "niche", label: "About your business or channel", kind: "textarea", placeholder: "e.g. A handmade candle brand selling online, mostly to repeat customers.", required: true, maxLength: 600 },
      { id: "platform", label: "Main platform", kind: "select", options: PLATFORM_CHOICES, required: true },
      { id: "objective", label: "Main objective", kind: "select", options: [...GROWTH_GOALS], required: true },
      { id: "time", label: "Time you can give it", kind: "select", options: [...TIME_AVAILABLE], required: true },
      { id: "duration", label: "Plan length", kind: "select", options: ["7", "30", "90"], optionLabels: { "7": "7 days", "30": "30 days", "90": "90 days" }, required: true },
      { id: "challenge", label: "Current challenge", kind: "text", placeholder: "e.g. Not enough time to film videos", maxLength: 200, advanced: true },
      { id: "experience", label: "Experience level", kind: "select", options: [...EXPERIENCE_LEVELS], advanced: true },
      { id: "budget", label: "Monthly marketing budget", kind: "select", options: [...BUDGET_RANGES], advanced: true },
    ],
    output: [
      { title: "Timeline", description: "Daily, weekly or monthly milestones in order." },
      { title: "Prioritised tasks", description: "What to do in each stage, and what depends on what." },
      { title: "Checkpoints", description: "Success indicators and when to review." },
    ],
    limits: ["Milestones are suggestions, not predictions.", "Adjust the plan as you learn what works for your audience."],
    guard: GROWTH_GUARD,
  },
  {
    id: "service-recommender",
    slug: "service-recommender",
    name: "AI Service Recommender",
    tagline: "Find the Sociotix services that fit your goal.",
    description: "Describe what you want to achieve. It suggests services from the real Sociotix catalog, explains why each fits, and only offers ordering for services that are genuinely available.",
    category: "growth",
    icon: "recommend",
    phase: "AI-03",
    availability: "coming_soon",
    status: "Coming in Growth Intelligence.",
    auth: "account",
    free: { anonymousPerDay: 0, signedInPerDay: 5 },
    fields: [
      { id: "goal", label: "What do you want to achieve?", kind: "textarea", placeholder: "e.g. More people watching our new YouTube tutorials, and a few more subscribers.", required: true, maxLength: 500 },
      { id: "platform", label: "Platform", kind: "select", options: Object.keys(CATALOG_PLATFORM_CHOICES), optionLabels: CATALOG_PLATFORM_CHOICES, required: true },
      { id: "focus", label: "Kind of help", kind: "select", options: [...SERVICE_FOCUS], advanced: true },
      { id: "budget", label: "Monthly marketing budget", kind: "select", options: [...BUDGET_RANGES], advanced: true },
    ],
    output: [
      { title: "Recommended services", description: "From the live catalog, with why each fits." },
      { title: "Availability", description: "Only services that pass every check can be ordered." },
      { title: "Guidance", description: "Practical next steps, with or without a service." },
    ],
    limits: ["Only recommends services from the real catalog, and never places an order for you.", "Prices and availability come from Sociotix, not the AI."],
    guard: RECOMMENDER_GUARD,
  },
  {
    id: "assistant",
    slug: "assistant",
    name: "Sociotix AI Assistant",
    tagline: "Ask anything about Sociotix and social media marketing.",
    description: "A conversational guide to Sociotix: what it offers, how services and orders work, which AI tool fits your task, and practical marketing questions. It answers from verified Sociotix information and says so when it doesn't know.",
    category: "assist",
    icon: "assistant",
    phase: "AI-04",
    availability: "coming_soon",
    status: "Coming in Smart Assistance.",
    auth: "account",
    free: { anonymousPerDay: 0, signedInPerDay: 10 },
    fields: [{ id: "message", label: "Your question", kind: "textarea", placeholder: "e.g. How do orders work on Sociotix?", required: true, maxLength: 1_000 }],
    output: [
      { title: "Answers", description: "Short, practical answers grounded in Sociotix's own information." },
      { title: "Helpful links", description: "The right Sociotix page for your next step." },
      { title: "Follow-up questions", description: "Suggestions to keep the conversation going." },
    ],
    limits: ["Can't see your orders, balance or account — and never takes actions for you.", "Prices and availability come from Sociotix's catalog, not the AI."],
    guard: ASSISTANT_GUARD,
  },
  {
    id: "service-search",
    slug: "service-search",
    name: "AI-Powered Service Search",
    tagline: "Describe what you need in plain words. Find the right services.",
    description: "Type what you're trying to do — like promoting a clothing store on Instagram — and see matching services from the real Sociotix catalog, with why each fits. Prices and availability always come from Sociotix.",
    category: "assist",
    icon: "search",
    phase: "AI-04",
    availability: "coming_soon",
    status: "Coming in Smart Assistance.",
    auth: "account",
    free: { anonymousPerDay: 0, signedInPerDay: 10 },
    fields: [
      { id: "query", label: "What do you need?", kind: "textarea", placeholder: "e.g. I want to promote my clothing store on Instagram", required: true, maxLength: 300 },
      { id: "platform", label: "Platform", kind: "select", options: Object.keys(CATALOG_PLATFORM_CHOICES), optionLabels: CATALOG_PLATFORM_CHOICES },
    ],
    output: [
      { title: "Best matches", description: "The services that fit your request most closely." },
      { title: "Other matches", description: "Alternatives worth a look." },
      { title: "Guidance", description: "Helpful next steps, with or without a service." },
    ],
    limits: ["Only shows services from the real catalog, and never places an order for you.", "Keyword search works without AI; AI matching needs a free account."],
    guard: SEARCH_GUARD,
  },
  {
    id: "order-assistant",
    slug: "smart-order-assistant",
    name: "Smart Order Assistant",
    tagline: "Pick the right service and set it up correctly before you order.",
    description: "Describe what you want to achieve. The assistant picks a matching service from the real Sociotix catalog, suggests a quantity within its limits, explains each detail the order needs, and prepares a draft you open in New Order to review and confirm yourself.",
    category: "assist",
    icon: "order",
    phase: "AI-05",
    availability: "coming_soon",
    status: "Coming in Order & Support Intelligence.",
    auth: "account",
    free: ORDER_ASSIST_FREE,
    fields: [
      { id: "goal", label: "What do you want to achieve?", kind: "textarea", placeholder: "e.g. More followers for my new Instagram bakery account", required: true, maxLength: 600 },
      { id: "platform", label: "Platform", kind: "select", options: Object.keys(CATALOG_PLATFORM_CHOICES), optionLabels: CATALOG_PLATFORM_CHOICES },
      { id: "quantity", label: "Quantity you have in mind", kind: "number", min: 1, max: 100_000_000, advanced: true, help: "Optional. It's checked against the service's limits." },
    ],
    output: [
      { title: "Recommended service", description: "One catalog service that fits your goal, and why." },
      { title: "Order draft", description: "A quantity within the service's limits, ready to open in New Order." },
      { title: "Setup checklist", description: "What each order detail needs, so it's right first time." },
    ],
    limits: ["Prepares a draft only — you review and confirm in New Order. It never places or pays for an order.", "Services, limits and prices come from Sociotix's catalog, not the AI."],
    guard: ORDER_ASSIST_GUARD,
  },
  {
    id: "order-explanation",
    slug: "order-explanation",
    name: "AI Order Explanation",
    tagline: "Your order's status, explained simply.",
    description: "Choose one of your orders and get a plain-language explanation of where it stands, what its status and payment mean, and what you can do next — using only what's recorded on the order. Ask a question about it if you like.",
    category: "assist",
    icon: "explain",
    phase: "AI-05",
    availability: "coming_soon",
    status: "Coming in Order & Support Intelligence.",
    auth: "account",
    free: ORDER_EXPLAIN_FREE,
    fields: [
      { id: "reference", label: "Order", kind: "text", placeholder: "ORD-…", required: true, maxLength: 24 },
      { id: "question", label: "Your question (optional)", kind: "text", placeholder: "e.g. Why does it say my information is needed?", maxLength: 300 },
    ],
    output: [
      { title: "Where it stands", description: "The current status and payment state in plain words." },
      { title: "What you can do", description: "Only the actions this order really allows right now." },
      { title: "Recorded timeline", description: "Every recorded step, with its real time." },
    ],
    limits: ["Only reads your own orders, and only what's recorded — it never guesses progress, dates or refunds.", "Read-only: it can't cancel, change or speed up an order."],
    guard: ORDER_EXPLAIN_GUARD,
  },
  {
    id: "support-assistant",
    slug: "support-assistant",
    name: "AI Support Assistant",
    tagline: "Quick answers, and an honest path to a person.",
    description: "Ask about orders, payments, cancellations, refunds, your account or using Sociotix. Answers come from Sociotix's verified help information, and when only the team can help, it tells you exactly how to reach a person.",
    category: "assist",
    icon: "support",
    phase: "AI-05",
    availability: "coming_soon",
    status: "Coming in Order & Support Intelligence.",
    auth: "account",
    free: SUPPORT_FREE,
    fields: [{ id: "message", label: "How can we help?", kind: "textarea", placeholder: "e.g. How do I cancel an order?", required: true, maxLength: 1_000 }],
    output: [
      { title: "Answers", description: "Clear help from Sociotix's verified information." },
      { title: "Next steps", description: "The right page for what you need to do." },
      { title: "Human support", description: "When a person is needed, exactly how to reach one." },
    ],
    limits: ["Can't see or change orders, refunds or your account, and never sends anything for you.", "Support tickets aren't connected yet — it says so instead of pretending."],
    guard: SUPPORT_GUARD,
  },
  {
    id: "workflow-automation",
    slug: "workflow-automation",
    name: "AI Workflow Automation",
    tagline: "Repeatable content routines, under your control.",
    description: "Set up repeatable routines for your content work. Every step stays under your review — nothing runs on its own.",
    category: "assist",
    icon: "workflow",
    phase: "Later",
    availability: "unavailable",
    status: "Not available yet — it needs approval controls that don't exist yet.",
    auth: "account",
    free: null,
    fields: [],
    output: [],
    limits: ["Will never act on your accounts or money without your confirmation."],
    guard: STRATEGY_GUARD,
  },
];

/**
 * Tools that live inside the signed-in Social workspace (AI-07), not on the
 * public /ai-tools pages. They run through the same pipeline (quotas, budget,
 * redaction, validation) and are found by id only — never listed publicly.
 */
export const WORKSPACE_TOOLS: AiTool[] = [
  {
    id: "campaign-planner",
    slug: "campaign-planner",
    name: "AI Campaign Studio",
    tagline: "A clear, goal-based plan for your next campaign.",
    description: "Describe your business, goal and platforms. Get campaign themes, a week-by-week plan, formats, caption and call-to-action ideas, and the metrics worth reviewing — goal-based advice, since no account analytics are connected.",
    category: "growth",
    icon: "roadmap",
    phase: "AI-07",
    availability: "coming_soon",
    status: "Coming with AI Campaign Studio.",
    auth: "account",
    free: { anonymousPerDay: 0, signedInPerDay: 5 },
    fields: [],
    output: [
      { title: "Campaign overview", description: "The objective and the assumptions the plan makes." },
      { title: "Weekly plan", description: "One focus and a few activities per week." },
      { title: "Formats and caption ideas", description: "Starting points for each platform you chose." },
      { title: "What to review", description: "Metrics to watch and practical next steps." },
    ],
    limits: ["Goal-based advice: it never sees your accounts' analytics and never invents results.", "It suggests only — it never drafts, schedules or publishes anything for you."],
    // One plan per call; up to 8 weeks of entries. Opus 5.5 worst case ≈ $0.16.
    guard: { maxInputChars: 3_000, maxOutputTokens: 7_000, maxCostMicros: 180_000 },
  },
  {
    id: "automation-assistant",
    slug: "automation-assistant",
    name: "AI Workflow Assistant",
    tagline: "Describe a routine; get a workflow draft to review.",
    description: "Describe what you'd like automated in plain words. The assistant suggests a workflow using only Sociotix's supported triggers and actions, which you review, adjust and activate yourself.",
    category: "assist",
    icon: "workflow",
    phase: "AI-08",
    availability: "coming_soon",
    status: "Coming with the AI Workflow Assistant.",
    auth: "account",
    free: { anonymousPerDay: 0, signedInPerDay: 10 },
    fields: [],
    output: [{ title: "Workflow draft", description: "A trigger, an action and settings — checked against what Sociotix supports." }],
    limits: ["Suggests only from Sociotix's allowed triggers and actions.", "Never activates anything — you review and activate each workflow."],
    // A short request and one small structured answer. Opus 5.5 worst case ≈ $0.03.
    guard: { maxInputChars: 600, maxOutputTokens: 1_200, maxCostMicros: 40_000, promptChars: 3_000 },
  },
];

export const AI_TOOL_BY_ID: Record<string, AiTool> = Object.fromEntries([...AI_TOOLS, ...WORKSPACE_TOOLS].map((t) => [t.id, t]));
export const AI_TOOL_BY_SLUG: Record<string, AiTool> = Object.fromEntries(AI_TOOLS.map((t) => [t.slug, t]));
export const aiToolHref = (t: AiTool) => `/ai-tools/${t.slug}`;

export const AVAILABILITY_LABEL: Record<AiAvailability, string> = { available: "Available", coming_soon: "Coming soon", unavailable: "Unavailable" };
