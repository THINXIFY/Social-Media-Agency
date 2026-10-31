/*
 * Referral program definitions shared by the customer and admin UIs (Phase 5G-B).
 *
 * Statuses are the database values. "Invited" isn't one of them: Sociotix
 * doesn't send invitations, so nothing records a real invitation event, and a
 * copied link is never counted as one. Qualification needs an approved, active
 * reward policy; none can be activated yet (database guard SV014).
 */

export const REFERRAL_STATUSES = ["signed_up", "pending", "qualified", "ineligible"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const REFERRAL_STATUS_META: Record<ReferralStatus, { label: string; customer: string; tone: "neutral" | "info" | "success" | "danger" }> = {
  signed_up: { label: "Signed up", customer: "Signed up", tone: "neutral" },
  pending: { label: "Under review", customer: "Under review", tone: "info" },
  qualified: { label: "Qualified", customer: "Qualified", tone: "success" },
  ineligible: { label: "Rejected", customer: "Not eligible", tone: "danger" },
};

/** Review signals. They only ever flag a referral for a person to look at; they never reject it. */
export const REFERRAL_FLAGS = ["same_network", "similar_email", "high_volume"] as const;
export type ReferralFlag = (typeof REFERRAL_FLAGS)[number];
export const FLAG_LABEL: Record<ReferralFlag, { label: string; detail: string }> = {
  same_network: { label: "Same network", detail: "The sign-up came from an IP address the referrer used in the last 30 days." },
  similar_email: { label: "Similar email", detail: "The new email matches the referrer's once dots and +tags are ignored." },
  high_volume: { label: "High volume", detail: "This code brought 10 or more sign-ups in the past 24 hours." },
};

export const EVENT_LABEL: Record<string, string> = {
  signed_up: "Signed up with the referral",
  email_verified: "Confirmed their email",
  marked_review: "Marked for review",
  rejected: "Rejected",
  restored: "Restored to signed up",
};

export const REJECT_REASONS = ["Same person or household", "Duplicate or fake account", "Breaks the program terms", "Other"] as const;

export type ProgramSettings = { attributionEnabled: boolean; sharingEnabled: boolean };

export type OwnReferral = { id: string; name: string; joinedAt: string; verified: boolean; status: ReferralStatus };
export type OwnReferralSummary = {
  code: string | null;
  link: string | null;
  program: ProgramSettings;
  rewardsEnabled: false;
  counts: { joined: number; verified: number; underReview: number; qualified: number };
  history: OwnReferral[];
};

export type AdminReferralRow = {
  id: string;
  status: ReferralStatus;
  via: "link" | "code";
  code: string | null;
  flags: ReferralFlag[];
  attributedAt: string;
  verifiedAt: string | null;
  referrer: { ref: string; name: string; email: string };
  referee: { ref: string; name: string; email: string };
};
