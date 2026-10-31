/**
 * Admin view of the referral program.
 *
 * There is no admin referral dataset. The only referral records are the
 * customer dashboard's illustrative sample in `demo-referrals.ts`: one demo
 * account's invites, with masked invitee emails and no link to the admin
 * customers, orders or payments. This module reads that sample as-is and
 * labels it as such — it never invents relationships, qualifying orders or
 * payment evidence. Rewards in that program go to a separate rewards balance
 * and are never added to a wallet, so they have no wallet impact here either.
 *
 * Every recorded referral was created under one policy, v1 (the program's
 * current terms). A settings draft proposes a new policy but never changes
 * v1, any stored reward or any qualification result.
 *
 * Admin state (internal notes and the settings draft) lives under
 * `sv-admin-referrals`.
 */

import * as React from "react";
import { ADMIN_NOW } from "@/lib/admin-demo";
import { DEMO_USER } from "@/lib/demo-account";
import {
  REFERRAL_PROGRAM,
  REFERRAL_STATUS_META,
  REFERRALS,
  REWARD_BY_ID,
  REWARD_STATUS_META,
  REWARDS,
  referralSummary,
  type Referral,
  type ReferralStatus,
  type Reward,
  type RewardStatus,
} from "@/lib/demo-referrals";

export { REFERRAL_PROGRAM, REFERRAL_STATUS_META, REFERRALS, REWARD_STATUS_META, REWARDS, referralSummary };
export type { Referral, ReferralStatus, Reward, RewardStatus };

const NOW = Date.parse(ADMIN_NOW);
const DAY = 86_400_000;
const P = REFERRAL_PROGRAM;
const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY).toISOString();
const usd = (n: number) => `$${n.toFixed(2)}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const cents = (n: number) => Math.round(n * 100) / 100;

/** Who made every sample referral: the customer dashboard's demo account, not an admin customer. */
export const SAMPLE_REFERRER = { name: DEMO_USER.fullName, email: DEMO_USER.email, accountId: DEMO_USER.accountId };

export const REFERRAL_BY_ID: Record<string, Referral> = Object.fromEntries(REFERRALS.map((r) => [r.id, r]));
export const rewardOf = (r: Referral): Reward | null => (r.rewardId ? REWARD_BY_ID[r.rewardId] ?? null : null);

/* -------------------------------------------------------------------------- */
/*  Referrers                                                                 */
/* -------------------------------------------------------------------------- */

export interface Referrer {
  id: string;
  name: string;
  email: string;
  code: string;
  /** Every referral attributed to this referrer. */
  referrals: Referral[];
  /** True for the dashboard demo account, which isn't an admin customer. */
  sample: boolean;
}

/** The sample holds one referrer's invites; every referral belongs to it. */
export const REFERRERS: Referrer[] = [{ id: SAMPLE_REFERRER.accountId, name: SAMPLE_REFERRER.name, email: SAMPLE_REFERRER.email, code: P.code, referrals: REFERRALS, sample: true }];
export const REFERRER_BY_ID: Record<string, Referrer> = Object.fromEntries(REFERRERS.map((x) => [x.id, x]));
export const referrerOf = (r: Referral): Referrer => REFERRERS.find((x) => x.referrals.some((y) => y.id === r.id))!;

/** Codes stay masked until staff choose to reveal them. */
export const maskCode = (code: string) => [...code].map((ch, i) => (ch === "-" || i < 2 || i >= code.length - 2 ? ch : "•")).join("");

const sumRewards = (list: Reward[]) => cents(list.reduce((n, w) => n + w.amount, 0));

export function referrerStats(x: Referrer) {
  const rewards = x.referrals.map(rewardOf).filter((w): w is Reward => Boolean(w));
  const of = (s: RewardStatus) => rewards.filter((w) => w.status === s);
  return {
    invited: x.referrals.length,
    signedUp: x.referrals.filter((r) => r.signedUpAt).length,
    qualified: x.referrals.filter((r) => r.status === "qualified" || r.status === "rewarded").length,
    rewarded: x.referrals.filter((r) => r.status === "rewarded").length,
    /** Approved plus credited, matching the program summary. */
    earned: sumRewards([...of("approved"), ...of("credited")]),
    pending: sumRewards(of("pending")),
    credited: sumRewards(of("credited")),
    reversed: sumRewards(of("reversed")),
    toReview: x.referrals.filter(needsReview).length,
  };
}

/**
 * Attribution guards in the demo model: each referred account (masked email) belongs to one
 * referral and one referrer, and each referral carries at most one reward.
 */
export function attributionCheck() {
  const accounts = new Map<string, string[]>();
  for (const x of REFERRERS) for (const r of x.referrals) accounts.set(r.invitee, [...(accounts.get(r.invitee) ?? []), `${x.id}:${r.id}`]);
  const duplicateAccounts = [...accounts.entries()].filter(([, refs]) => refs.length > 1).map(([email]) => email);
  const perReferral = new Map<string, number>();
  for (const w of REWARDS) perReferral.set(w.referralId, (perReferral.get(w.referralId) ?? 0) + 1);
  const duplicateRewards = [...perReferral.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  return { accounts: accounts.size, referrals: REFERRALS.length, rewards: REWARDS.length, duplicateAccounts, duplicateRewards, ok: !duplicateAccounts.length && !duplicateRewards.length };
}

/* -------------------------------------------------------------------------- */
/*  Policies                                                                  */
/* -------------------------------------------------------------------------- */

export type RewardType = "fixed" | "percent";
export type Destination = "rewards" | "wallet";
export type Distribution = "manual" | "auto";
export type ProgramStatus = "enabled" | "paused" | "disabled";

export interface PolicyTerms {
  rewardType: RewardType;
  fixedAmount: number;
  /** Percent of qualifying spend, when rewardType is "percent". */
  percentRate: number | null;
  percentCap: number | null;
  minSpend: number;
  qualifyingDays: number;
  holdDays: number;
  minOrders: number;
  countRefunded: boolean;
  maxPerReferrer: number | null;
  destination: Destination;
  distribution: Distribution;
}

/** The active terms, read from the program. Every recorded referral and reward was made under these. */
export const ACTIVE_POLICY: PolicyTerms & { version: string; status: "preview" | "active" } = {
  version: "v1",
  status: P.status,
  rewardType: "fixed",
  fixedAmount: P.reward.amount,
  percentRate: null,
  percentCap: null,
  minSpend: P.qualifyingSpend,
  qualifyingDays: P.qualifyingDays,
  holdDays: P.holdDays,
  // "Their first completed order starts qualification."
  minOrders: 1,
  countRefunded: false,
  maxPerReferrer: P.monthlyCap,
  destination: "rewards",
  distribution: "manual",
};

/** Every recorded policy, by version. Only v1 exists; a draft is never added here. */
const POLICIES: Record<string, typeof ACTIVE_POLICY> = { [ACTIVE_POLICY.version]: ACTIVE_POLICY };

/** The version each referral was created under. Every recorded referral predates any other policy. */
const POLICY_OF_REFERRAL: Record<string, string> = Object.fromEntries(REFERRALS.map((r) => [r.id, ACTIVE_POLICY.version]));

/** The policy a referral is bound to. Later rules never apply retroactively. */
export const policyOf = (r: Referral) => POLICIES[POLICY_OF_REFERRAL[r.id]] ?? ACTIVE_POLICY;

export function rewardFor(terms: Pick<PolicyTerms, "rewardType" | "fixedAmount" | "percentRate" | "percentCap">, spend: number) {
  if (terms.rewardType === "fixed") return cents(terms.fixedAmount);
  const raw = cents((spend * (terms.percentRate ?? 0)) / 100);
  return terms.percentCap !== null ? Math.min(raw, terms.percentCap) : raw;
}

export const describeReward = (t: Pick<PolicyTerms, "rewardType" | "fixedAmount" | "percentRate" | "percentCap">) =>
  t.rewardType === "fixed" ? `${usd(t.fixedAmount)} per qualified referral` : `${t.percentRate}% of qualifying spend${t.percentCap !== null ? `, up to ${usd(t.percentCap)}` : ""}`;

/** What a draft would mean for each recorded referral — without touching any record. */
export function impactOf(draft: PolicyTerms) {
  return REFERRALS.map((r) => {
    const reward = rewardOf(r);
    const locked = Boolean(reward);
    const qualifies = r.spend >= draft.minSpend;
    return {
      r,
      locked,
      current: reward ? reward.amount : null,
      draft: locked ? reward!.amount : r.status === "ineligible" ? null : rewardFor(draft, Math.max(r.spend, draft.minSpend)),
      qualifiesNow: qualifies,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Qualification                                                             */
/* -------------------------------------------------------------------------- */

export type CheckState = "met" | "unmet" | "pending" | "unknown" | "na";

export interface Check {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
}

const existingAccount = (r: Referral) => r.status === "ineligible" && /already had/i.test(r.reason ?? "");
const refunded = (r: Referral) => /refund/i.test(r.reason ?? "") || /refund/i.test(rewardOf(r)?.reason ?? "");

/** Each program rule, judged only from what the record holds. */
export function checksOf(r: Referral): Check[] {
  const reward = rewardOf(r);
  const deadline = r.signedUpAt ? addDays(r.signedUpAt, P.qualifyingDays) : null;
  const windowOpen = deadline ? NOW <= Date.parse(deadline) : false;

  const signup: Check = r.signedUpAt
    ? { id: "signup", label: "Signed up through the referral", state: "met", detail: `Signed up ${day(r.signedUpAt)} via ${r.via === "link" ? "invite link" : "invite code"}.` }
    : { id: "signup", label: "Signed up through the referral", state: "unmet", detail: "No signup recorded yet." };

  const spendMet = r.spend >= P.qualifyingSpend;
  const spend: Check = {
    id: "spend",
    label: `Completed orders reach ${usd(P.qualifyingSpend)}`,
    state: spendMet ? "met" : r.signedUpAt && windowOpen ? "pending" : "unmet",
    detail: `${usd(r.spend)} of ${usd(P.qualifyingSpend)} recorded (illustrative total; no linked orders).`,
  };

  let window: Check;
  if (!r.signedUpAt || !deadline) window = { id: "window", label: `Within ${P.qualifyingDays} days of signup`, state: "na", detail: "Starts when they sign up." };
  else if (r.qualifiedAt) {
    const days = Math.round((Date.parse(r.qualifiedAt) - Date.parse(r.signedUpAt)) / DAY);
    const inTime = Date.parse(r.qualifiedAt) <= Date.parse(deadline);
    window = { id: "window", label: `Within ${P.qualifyingDays} days of signup`, state: inTime ? "met" : "unmet", detail: `Qualified ${day(r.qualifiedAt)}, day ${days} of ${P.qualifyingDays}.` };
  } else if (windowOpen) {
    const left = Math.max(0, Math.ceil((Date.parse(deadline) - NOW) / DAY));
    window = { id: "window", label: `Within ${P.qualifyingDays} days of signup`, state: "pending", detail: `${left} days left, until ${day(deadline)}.` };
  } else window = { id: "window", label: `Within ${P.qualifyingDays} days of signup`, state: "unmet", detail: `Window ended ${day(deadline)}.` };

  let hold: Check;
  if (!reward) hold = { id: "hold", label: `${P.holdDays}-day reward hold`, state: "na", detail: "No reward created yet." };
  else if (reward.status === "reversed") hold = { id: "hold", label: `${P.holdDays}-day reward hold`, state: "unmet", detail: reward.reason ?? "Reward reversed." };
  else if (reward.status === "pending")
    hold = {
      id: "hold",
      label: `${P.holdDays}-day reward hold`,
      state: "pending",
      detail: NOW < Date.parse(reward.holdUntil) ? `Held until ${day(reward.holdUntil)}.` : `Hold ended ${day(reward.holdUntil)}; awaiting review.`,
    };
  else hold = { id: "hold", label: `${P.holdDays}-day reward hold`, state: "met", detail: `Hold ended ${day(reward.holdUntil)}.` };

  const newCustomer: Check = existingAccount(r)
    ? { id: "new", label: "Referred person is a new customer", state: "unmet", detail: r.reason ?? "Recorded as an existing account." }
    : { id: "new", label: "Referred person is a new customer", state: "unknown", detail: "Can't be verified: the referred person isn't linked to a customer record." };

  const evidence: Check = refunded(r)
    ? { id: "evidence", label: "Qualifying orders kept (not refunded)", state: "unmet", detail: "The qualifying order was refunded." }
    : r.spend > 0
      ? { id: "evidence", label: "Qualifying orders kept (not refunded)", state: "unknown", detail: "No linked order or payment records to confirm." }
      : { id: "evidence", label: "Qualifying orders kept (not refunded)", state: "na", detail: "No orders recorded yet." };

  return [signup, spend, window, hold, newCustomer, evidence];
}

/* -------------------------------------------------------------------------- */
/*  Reward stage, review flags & next step                                    */
/* -------------------------------------------------------------------------- */

export type RewardStage = "pending_qualification" | "holding" | "awaiting_approval" | "approved" | "credited" | "reversed" | "not_eligible";

export const STAGE_META: Record<RewardStage, { label: string; explain: string; tone: string }> = {
  pending_qualification: { label: "Pending qualification", explain: "No reward until the referral meets every qualifying rule.", tone: "text-muted-foreground" },
  holding: { label: "Holding", explain: `Created and held for ${P.holdDays} days in case the qualifying orders are cancelled or refunded.`, tone: "text-soon" },
  awaiting_approval: { label: "Awaiting approval", explain: "The hold has ended. Staff review is next.", tone: "text-soon" },
  approved: { label: "Approved", explain: "Review complete. It hasn't been credited yet.", tone: "text-primary" },
  credited: { label: "Credited", explain: "Credited to the separate rewards balance. Not wallet money.", tone: "text-ok" },
  reversed: { label: "Reversed", explain: "Removed because the referral stopped meeting the requirements.", tone: "text-muted-foreground" },
  not_eligible: { label: "Not eligible", explain: "This referral doesn't count toward rewards.", tone: "text-muted-foreground" },
};

/** Derived only from the recorded reward status and its hold date. */
export function stageOf(r: Referral): RewardStage {
  const reward = rewardOf(r);
  if (!reward) return r.status === "ineligible" ? "not_eligible" : "pending_qualification";
  if (reward.status === "pending") return NOW < Date.parse(reward.holdUntil) ? "holding" : "awaiting_approval";
  return reward.status;
}

export type FlagKind = "hold" | "awaiting_approval" | "awaiting_credit" | "existing_account" | "no_evidence";

export interface Flag {
  kind: FlagKind;
  label: string;
  /** Something staff would act on, as opposed to context. */
  action: boolean;
}

/** Neutral, record-based flags. No fraud judgements. */
export function flagsOf(r: Referral): Flag[] {
  const stage = stageOf(r);
  const list: Flag[] = [];
  if (stage === "holding") list.push({ kind: "hold", label: "Reward in holding period", action: true });
  if (stage === "awaiting_approval") list.push({ kind: "awaiting_approval", label: "Hold ended, awaiting approval", action: true });
  if (stage === "approved") list.push({ kind: "awaiting_credit", label: "Approved, not yet credited", action: true });
  if (existingAccount(r)) list.push({ kind: "existing_account", label: "Existing account recorded", action: false });
  if (stage === "holding" || stage === "awaiting_approval" || stage === "approved") list.push({ kind: "no_evidence", label: "No linked transaction evidence", action: true });
  return list;
}

export const needsReview = (r: Referral) => flagsOf(r).some((f) => f.action);

export function nextStepOf(r: Referral): { action: string; explain: string } | null {
  const stage = stageOf(r);
  if (stage === "holding") return { action: "Review qualification", explain: "The reward is on hold. Confirm the qualifying orders stand before it's approved." };
  if (stage === "awaiting_approval") return { action: "Approve reward", explain: "The hold has ended. Approving needs a backend with an audit trail." };
  if (stage === "approved") return { action: "Credit reward", explain: "Approved but not credited. Crediting needs a backend with an audit trail." };
  return null;
}

export const waitingNote = (r: Referral) =>
  r.status === "invited"
    ? "Waiting for them to sign up."
    : r.status === "signed_up"
      ? "Waiting for their first completed order."
      : r.status === "pending"
        ? "Waiting for their completed orders to reach the qualifying total."
        : r.status === "ineligible"
          ? "Closed. This referral doesn't count."
          : rewardOf(r)?.status === "credited"
            ? "Closed. The reward was credited to the rewards balance (demo)."
            : "";

/* -------------------------------------------------------------------------- */
/*  Activity                                                                  */
/* -------------------------------------------------------------------------- */

export interface RefEvent {
  id: string;
  at: string;
  kind: "system" | "staff";
  text: string;
  local?: boolean;
  referralId?: string;
}

export function eventsOf(r: Referral, notes: RefNote[]): RefEvent[] {
  const reward = rewardOf(r);
  const list: RefEvent[] = [{ id: "invited", at: r.invitedAt, kind: "system", text: `Invite shared by ${r.via === "link" ? "link" : "code"}`, referralId: r.id }];
  if (r.signedUpAt) list.push({ id: "signup", at: r.signedUpAt, kind: "system", text: "Referred person signed up", referralId: r.id });
  if (r.qualifiedAt) list.push({ id: "qualified", at: r.qualifiedAt, kind: "system", text: `Qualified at ${usd(r.spend)} of completed orders`, referralId: r.id });
  if (reward) {
    list.push({ id: "reward", at: reward.createdAt, kind: "system", text: `${usd(reward.amount)} reward created, held for ${P.holdDays} days`, referralId: r.id });
    if (reward.approvedAt) list.push({ id: "approved", at: reward.approvedAt, kind: "system", text: "Reward approved", referralId: r.id });
    if (reward.creditedAt) list.push({ id: "credited", at: reward.creditedAt, kind: "system", text: "Reward credited to the rewards balance (not wallet)", referralId: r.id });
    if (reward.reversedAt) list.push({ id: "reversed", at: reward.reversedAt, kind: "system", text: `Reward reversed: ${reward.reason ?? "no reason recorded"}`, referralId: r.id });
  }
  for (const n of notes) list.push({ id: n.id, at: n.at, kind: "staff", text: n.text, local: true });
  return list.sort((a, b) => b.at.localeCompare(a.at));
}

/** Recorded activity across all of a referrer's referrals, newest first. */
export const referrerEvents = (x: Referrer) =>
  x.referrals
    .flatMap((r) => eventsOf(r, []).map((e) => ({ ...e, id: `${r.id}-${e.id}` })))
    .sort((a, b) => b.at.localeCompare(a.at));

/* -------------------------------------------------------------------------- */
/*  Admin state: notes and the settings draft                                 */
/* -------------------------------------------------------------------------- */

export interface RefNote {
  id: string;
  at: string;
  text: string;
}

export interface ProgramConfig extends PolicyTerms {
  status: ProgramStatus;
  savedAt: string;
}

interface State {
  notes: Record<string, RefNote[]>;
  referrerNotes: Record<string, RefNote[]>;
  config: ProgramConfig | null;
}

const KEY = "sv-admin-referrals";
const EMPTY: State = { notes: {}, referrerNotes: {}, config: null };
const listeners = new Set<() => void>();
let memo: { raw: string | null; state: State } | null = null;

const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
const pick = <T extends string>(v: unknown, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : null);

function cleanNotes(raw: Record<string, unknown> | undefined, valid: (id: string) => boolean) {
  const out: Record<string, RefNote[]> = {};
  for (const [id, list] of Object.entries(raw ?? {})) {
    if (!valid(id) || !Array.isArray(list)) continue;
    out[id] = list
      .filter((n): n is RefNote => typeof n?.id === "string" && typeof n?.at === "string" && typeof n?.text === "string")
      .map((n) => ({ ...n, text: n.text.slice(0, 1000) }))
      .slice(0, 50);
  }
  return out;
}

function cleanConfig(d: Record<string, unknown> | undefined): ProgramConfig | null {
  if (!d || typeof d.savedAt !== "string") return null;
  const c = {
    rewardType: pick(d.rewardType, ["fixed", "percent"] as const),
    fixedAmount: num(d.fixedAmount, 0, 1000),
    minSpend: num(d.minSpend, 0, 10000),
    qualifyingDays: num(d.qualifyingDays, 1, 365),
    holdDays: num(d.holdDays, 0, 90),
    minOrders: num(d.minOrders, 1, 100),
    destination: pick(d.destination, ["rewards", "wallet"] as const),
    distribution: pick(d.distribution, ["manual", "auto"] as const),
    status: pick(d.status, ["enabled", "paused", "disabled"] as const),
  };
  if (Object.values(c).some((v) => v === null)) return null;
  const percentRate = num(d.percentRate, 0.01, 100);
  if (c.rewardType === "percent" && percentRate === null) return null;
  return {
    ...(c as Omit<ProgramConfig, "percentRate" | "percentCap" | "countRefunded" | "maxPerReferrer" | "savedAt">),
    percentRate,
    percentCap: num(d.percentCap, 0.01, 1000),
    countRefunded: d.countRefunded === true,
    maxPerReferrer: num(d.maxPerReferrer, 1, 1000),
    savedAt: d.savedAt,
  };
}

function read(): State {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (memo?.raw === raw) return memo.state;
  let state: State = EMPTY;
  try {
    const data = raw ? (JSON.parse(raw) as { notes?: Record<string, unknown>; referrerNotes?: Record<string, unknown>; config?: Record<string, unknown> }) : null;
    if (data)
      state = {
        notes: cleanNotes(data.notes, (id) => Boolean(REFERRAL_BY_ID[id])),
        referrerNotes: cleanNotes(data.referrerNotes, (id) => Boolean(REFERRER_BY_ID[id])),
        config: cleanConfig(data.config),
      };
  } catch {}
  memo = { raw, state };
  return state;
}

function write(state: State) {
  try {
    const any = Object.values(state.notes).some((l) => l.length) || Object.values(state.referrerNotes).some((l) => l.length) || state.config;
    if (any) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => (e.key === KEY || e.key === null) && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useReferralAdmin() {
  return React.useSyncExternalStore(subscribe, read, () => EMPTY);
}

const note = (text: string): RefNote => ({ id: `n-${Date.now()}`, at: new Date().toISOString(), text: text.trim().slice(0, 1000) });

export function addReferralNote(id: string, text: string) {
  const s = read();
  write({ ...s, notes: { ...s.notes, [id]: [...(s.notes[id] ?? []), note(text)] } });
}

export function addReferrerNote(id: string, text: string) {
  const s = read();
  write({ ...s, referrerNotes: { ...s.referrerNotes, [id]: [...(s.referrerNotes[id] ?? []), note(text)] } });
}

export function clearReferralNotes() {
  write({ ...read(), notes: {}, referrerNotes: {} });
}

export function saveProgramConfig(c: Omit<ProgramConfig, "savedAt">) {
  write({ ...read(), config: { ...c, savedAt: new Date().toISOString() } });
}

export function discardProgramConfig() {
  write({ ...read(), config: null });
}
