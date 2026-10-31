/**
 * Demo data for SociVanta Rewards (referrals).
 *
 * The program is not live: there is no referral attribution, no tracking
 * and no payout. Every figure here is illustrative and labelled as such in
 * the UI. Rewards are never added to the wallet and can't be spent.
 *
 * All program terms live in `REFERRAL_PROGRAM` so they can be changed in one
 * place. They are example values, not final terms. Summary figures are
 * derived from `REFERRALS` and `REWARDS`, so the page always reconciles.
 */

/* -------------------------------------------------------------------------- */
/*  Program terms (configurable, not final)                                   */
/* -------------------------------------------------------------------------- */

export const REFERRAL_PROGRAM = {
  /** "preview" until the program is verified and launched. */
  status: "preview" as "preview" | "active",
  /** The customer's demo invite code. */
  code: "ALEX-7F3K",
  /** Shape of a future invite link. Not a working route. */
  invitePath: "/invite/ALEX-7F3K",
  /** Example reward per qualified referral. Not a commission rate. */
  reward: { amount: 10, currency: "USD" },
  /** A referral qualifies after the friend's completed orders reach this total… */
  qualifyingSpend: 25,
  /** …within this many days of signing up. */
  qualifyingDays: 60,
  /** Days a reward is held for review (refunds, cancellations) before approval. */
  holdDays: 14,
  /** Maximum rewards per month; null when no cap is set. */
  monthlyCap: null as number | null,
  supportEmail: "hello@thinxify.com",
};

/* -------------------------------------------------------------------------- */
/*  Referrals                                                                 */
/* -------------------------------------------------------------------------- */

export type ReferralStatus = "invited" | "signed_up" | "pending" | "qualified" | "rewarded" | "ineligible";

export const REFERRAL_STATUS_META: Record<ReferralStatus, { label: string; note: string }> = {
  invited: { label: "Invited", note: "Invite shared. We're waiting for them to create an account." },
  signed_up: { label: "Signed Up", note: "They've created an account. Their first completed order starts qualification." },
  pending: { label: "Pending Qualification", note: "They're ordering. The referral qualifies once their completed orders reach the qualifying total." },
  qualified: { label: "Qualified", note: "Requirements met. The reward is held for review before it's approved." },
  rewarded: { label: "Rewarded", note: "The reward was credited to your rewards (demo). It isn't added to your wallet." },
  ineligible: { label: "Ineligible", note: "This referral doesn't count toward rewards." },
};

export interface Referral {
  id: string;
  /** Masked so invitees stay anonymous. */
  invitee: string;
  via: "link" | "code";
  invitedAt: string;
  signedUpAt?: string;
  /** Friend's completed order total so far (illustrative). */
  spend: number;
  qualifiedAt?: string;
  status: ReferralStatus;
  /** Why a referral is ineligible. */
  reason?: string;
  rewardId?: string;
}

const P = REFERRAL_PROGRAM;

export const REFERRALS: Referral[] = [
  { id: "RF-1014", invitee: "ja•••@gmail.com", via: "link", invitedAt: "2026-10-26T15:20:00Z", spend: 0, status: "invited" },
  { id: "RF-1013", invitee: "mi•••@outlook.com", via: "code", invitedAt: "2026-10-24T10:05:00Z", signedUpAt: "2026-10-25T08:40:00Z", spend: 0, status: "signed_up" },
  { id: "RF-1012", invitee: "pr•••@yahoo.com", via: "link", invitedAt: "2026-10-20T18:30:00Z", signedUpAt: "2026-10-21T09:12:00Z", spend: 12, status: "pending" },
  { id: "RF-1011", invitee: "da•••@studio.co", via: "link", invitedAt: "2026-10-18T11:00:00Z", signedUpAt: "2026-10-18T13:45:00Z", spend: 18.5, status: "pending" },
  { id: "RF-1010", invitee: "le•••@gmail.com", via: "code", invitedAt: "2026-10-15T09:25:00Z", signedUpAt: "2026-10-16T16:10:00Z", spend: 32, qualifiedAt: "2026-10-22T12:00:00Z", status: "qualified", rewardId: "RW-508" },
  { id: "RF-1009", invitee: "ch•••@gmail.com", via: "link", invitedAt: "2026-10-08T14:00:00Z", signedUpAt: "2026-10-09T10:30:00Z", spend: 47, qualifiedAt: "2026-10-12T17:20:00Z", status: "qualified", rewardId: "RW-507" },
  { id: "RF-1008", invitee: "an•••@icloud.com", via: "link", invitedAt: "2026-10-02T08:15:00Z", signedUpAt: "2026-10-02T19:05:00Z", spend: 64, qualifiedAt: "2026-10-04T15:40:00Z", status: "rewarded", rewardId: "RW-506" },
  { id: "RF-1007", invitee: "to•••@gmail.com", via: "code", invitedAt: "2026-09-28T13:50:00Z", signedUpAt: "2026-09-29T07:30:00Z", spend: 29, qualifiedAt: "2026-10-01T11:10:00Z", status: "rewarded", rewardId: "RW-505" },
  { id: "RF-1006", invitee: "sa•••@proton.me", via: "link", invitedAt: "2026-09-25T16:40:00Z", spend: 0, status: "invited" },
  {
    id: "RF-1005",
    invitee: "ke•••@gmail.com",
    via: "link",
    invitedAt: "2026-09-22T12:20:00Z",
    signedUpAt: "2026-09-23T09:00:00Z",
    spend: 40,
    qualifiedAt: "2026-09-25T18:30:00Z",
    status: "ineligible",
    reason: "Their qualifying order was refunded, so the reward was reversed.",
    rewardId: "RW-504",
  },
  {
    id: "RF-1004",
    invitee: "ri•••@hotmail.com",
    via: "code",
    invitedAt: "2026-09-20T10:10:00Z",
    signedUpAt: "2026-09-20T10:55:00Z",
    spend: 0,
    status: "ineligible",
    reason: "They already had a SociVanta account. Referrals only count for new customers.",
  },
  { id: "RF-1003", invitee: "el•••@gmail.com", via: "link", invitedAt: "2026-09-18T15:35:00Z", signedUpAt: "2026-09-19T12:20:00Z", spend: 8, status: "pending" },
  { id: "RF-1002", invitee: "no•••@gmail.com", via: "code", invitedAt: "2026-09-15T09:45:00Z", spend: 0, status: "invited" },
  { id: "RF-1001", invitee: "be•••@outlook.com", via: "link", invitedAt: "2026-09-14T17:00:00Z", signedUpAt: "2026-09-15T08:25:00Z", spend: 26, qualifiedAt: "2026-09-20T14:15:00Z", status: "rewarded", rewardId: "RW-503" },
];

/* -------------------------------------------------------------------------- */
/*  Rewards                                                                   */
/* -------------------------------------------------------------------------- */

export type RewardStatus = "pending" | "approved" | "credited" | "reversed";

export const REWARD_STATUS_META: Record<RewardStatus, { label: string; note: string }> = {
  pending: { label: "Pending", note: `Held for ${P.holdDays} days in case the qualifying order is cancelled or refunded.` },
  approved: { label: "Approved", note: "Review complete. It will be credited to your rewards (demo)." },
  credited: { label: "Credited", note: "Credited to your rewards (demo). Not wallet balance and can't be spent." },
  reversed: { label: "Reversed", note: "Removed because the referral stopped meeting the requirements." },
};

export interface Reward {
  id: string;
  referralId: string;
  amount: number;
  status: RewardStatus;
  /** When the referral qualified and the reward was created. */
  createdAt: string;
  /** End of the review hold. */
  holdUntil: string;
  approvedAt?: string;
  creditedAt?: string;
  reversedAt?: string;
  reason?: string;
}

const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString();
const amount = P.reward.amount;

/** One reward per referral that qualified; dates follow the configured hold. */
function reward(id: string, referralId: string, status: RewardStatus, extra: Partial<Reward> = {}): Reward {
  const ref = REFERRALS.find((r) => r.id === referralId)!;
  const holdUntil = addDays(ref.qualifiedAt!, P.holdDays);
  return { id, referralId, amount, status, createdAt: ref.qualifiedAt!, holdUntil, ...extra };
}

export const REWARDS: Reward[] = [
  reward("RW-508", "RF-1010", "pending"),
  reward("RW-507", "RF-1009", "approved", { approvedAt: addDays("2026-10-12T17:20:00Z", P.holdDays) }),
  reward("RW-506", "RF-1008", "credited", { approvedAt: addDays("2026-10-04T15:40:00Z", P.holdDays), creditedAt: addDays("2026-10-04T15:40:00Z", P.holdDays) }),
  reward("RW-505", "RF-1007", "credited", { approvedAt: addDays("2026-10-01T11:10:00Z", P.holdDays), creditedAt: addDays("2026-10-01T11:10:00Z", P.holdDays) }),
  reward("RW-504", "RF-1005", "reversed", {
    approvedAt: addDays("2026-09-25T18:30:00Z", P.holdDays),
    reversedAt: "2026-10-10T09:30:00Z",
    reason: "The friend's qualifying order was refunded.",
  }),
  reward("RW-503", "RF-1001", "credited", { approvedAt: addDays("2026-09-20T14:15:00Z", P.holdDays), creditedAt: addDays("2026-09-20T14:15:00Z", P.holdDays) }),
];

export const REWARD_BY_ID = Object.fromEntries(REWARDS.map((r) => [r.id, r]));
export const REFERRAL_BY_ID = Object.fromEntries(REFERRALS.map((r) => [r.id, r]));

/** The latest date on a reward, for sorting and display. */
export const rewardDate = (r: Reward) => r.reversedAt ?? r.creditedAt ?? r.approvedAt ?? r.createdAt;

/* -------------------------------------------------------------------------- */
/*  Derived summary                                                           */
/* -------------------------------------------------------------------------- */

const sum = (list: Reward[]) => list.reduce((n, r) => n + r.amount, 0);

export function referralSummary() {
  const byStatus = (s: RewardStatus) => REWARDS.filter((r) => r.status === s);
  return {
    invites: REFERRALS.length,
    signups: REFERRALS.filter((r) => r.signedUpAt).length,
    qualified: REFERRALS.filter((r) => r.status === "qualified" || r.status === "rewarded").length,
    /** Approved plus credited. Illustrative only. */
    earned: sum(byStatus("approved")) + sum(byStatus("credited")),
    pending: sum(byStatus("pending")),
    approved: sum(byStatus("approved")),
    credited: sum(byStatus("credited")),
    reversed: sum(byStatus("reversed")),
    counts: Object.fromEntries((["pending", "approved", "credited", "reversed"] as const).map((s) => [s, byStatus(s).length])) as Record<
      RewardStatus,
      number
    >,
  };
}

/** Steps toward qualifying, for progress displays. */
export function qualificationOf(r: Referral) {
  const pct = Math.min(100, Math.round((r.spend / P.qualifyingSpend) * 100));
  const deadline = r.signedUpAt ? addDays(r.signedUpAt, P.qualifyingDays) : null;
  const steps = [
    { label: "Invited", done: true },
    { label: "Signed up", done: Boolean(r.signedUpAt) },
    { label: "First order", done: r.spend > 0 },
    { label: "Qualified", done: Boolean(r.qualifiedAt) },
  ];
  return { pct, deadline, steps, done: steps.filter((s) => s.done).length };
}
