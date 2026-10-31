/*
 * SociVanta AI plans (AI-09): the code-defined product tiers.
 *
 * Free is what every account has today. Pro and Business are proposed tiers,
 * not approved offers: they have no price, no allowance numbers and no
 * checkout. Entitlements are decided on the server only (src/server/ai/plans.ts)
 * and never from anything a browser sends. AI plans are separate from the SMM
 * wallet: wallet balances can't pay for them, and no plan changes allowances.
 */

export type PlanId = "free" | "pro" | "business";
/** included: works today · launching: part of the plan, waiting on launch · planned: proposed, not available. */
export type PlanFeatureState = "included" | "launching" | "planned";

export interface PlanFeature {
  label: string;
  state: PlanFeatureState;
  detail?: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Price label shown to people. Paid tiers stay unannounced until pricing is approved. */
  price: { kind: "free"; label: "Free" } | { kind: "not_announced"; label: "Pricing not announced" };
  audience: string;
  summary: string;
  features: PlanFeature[];
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: { kind: "free", label: "Free" },
    audience: "Every SociVanta account",
    summary: "Everything that works today, with no payment details needed.",
    features: [
      { label: "Social workspace: drafts and content calendar", state: "included", detail: "Live publishing is off for now." },
      { label: "Automation Studio", state: "included", detail: "Up to 25 workflows, 10 active at once." },
      { label: "Usage & allowances dashboard", state: "included" },
      { label: "Daily free runs of every AI tool", state: "launching", detail: "Each tool's allowance starts when it launches." },
      { label: "Social account connections", state: "launching", detail: "Awaiting platform approvals." },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: { kind: "not_announced", label: "Pricing not announced" },
    audience: "Creators and freelancers who use AI every day",
    summary: "A proposed tier for more room to create. Nothing here is available yet.",
    features: [
      { label: "Everything in Free", state: "planned" },
      { label: "Higher daily AI allowances", state: "planned" },
      { label: "More productivity features for frequent use", state: "planned" },
    ],
  },
  {
    id: "business",
    name: "Business",
    price: { kind: "not_announced", label: "Pricing not announced" },
    audience: "Agencies and teams",
    summary: "A proposed tier for higher capacity and team workflows. Nothing here is available yet.",
    features: [
      { label: "Everything in Pro", state: "planned" },
      { label: "Higher capacity for busy workspaces", state: "planned" },
      { label: "Collaboration and professional workflows", state: "planned" },
    ],
  },
];

export const PLAN_BY_ID = Object.fromEntries(PLANS.map((p) => [p.id, p])) as Record<PlanId, Plan>;

export const FEATURE_STATE_LABEL: Record<PlanFeatureState, string> = { included: "Included", launching: "At launch", planned: "Planned" };

/** The short comparison shown under the plan cards: one row per real capability. */
export const PLAN_COMPARISON: { label: string; values: Record<PlanId, string> }[] = [
  { label: "Price", values: { free: "Free", pro: "Not announced", business: "Not announced" } },
  { label: "AI tool runs", values: { free: "Daily free allowance per tool, at launch", pro: "Higher allowances (planned)", business: "Higher capacity (planned)" } },
  { label: "Social workspace", values: { free: "Included", pro: "Included (planned)", business: "Included (planned)" } },
  { label: "Automation Studio", values: { free: "25 workflows, 10 active", pro: "Planned", business: "Planned" } },
  { label: "Team collaboration", values: { free: "Not included", pro: "Not included", business: "Planned" } },
  { label: "Payment", values: { free: "None needed", pro: "Not available yet", business: "Not available yet" } },
];
