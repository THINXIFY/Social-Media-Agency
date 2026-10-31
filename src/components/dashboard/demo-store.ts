"use client";

import * as React from "react";
import { ACTIVITY, type DemoActivity, type DemoOrder, ORDERS, summarize } from "@/lib/demo-account";
import {
  type DemoTicket,
  isOpenTicket,
  TICKET_CATEGORIES,
  type TicketAttachment,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
  TICKETS,
} from "@/lib/demo-support";
import { ASSET_BY_SYMBOL, DEPOSIT_LIMITS, METHOD_BY_ID, type PaymentCategory } from "@/lib/payments";
import { CATEGORY_FIELDS, SERVICE_BY_ID } from "@/lib/catalog";
import { formatRelative } from "@/lib/i18n";
import {
  DEFAULT_PREFS,
  DEFAULT_PROFILE,
  initialsOf,
  NOTIFICATION_PREFS,
  type Preferences,
  type ProfileData,
  validateProfile,
} from "@/lib/account";
import type { LiveAccount } from "./live-account";
import { useLiveAccount } from "./live-account";

/* -------------------------------------------------------------------------- */
/*  Demo state shared by every dashboard page                                 */
/*  Only the customer's simulated changes are stored, in this browser.        */
/*  Nothing is sent anywhere and no real order changes.                       */
/* -------------------------------------------------------------------------- */

export interface OrderEvent {
  /** ISO time, or null for changes made just now in this demo. */
  at: string | null;
  title: string;
  detail?: string;
  tone?: "default" | "attention" | "done" | "demo" | "muted";
}

/** A demo order plus changes made in this browser. */
export interface LocalOrder extends DemoOrder {
  localEvents: OrderEvent[];
  /** Set once the customer resolves an action in this demo. */
  demoUpdated?: boolean;
}

/** A simulated fix for an order that needed attention. */
interface DemoFix {
  /** "link" when a new target link was given, "recheck" when a re-check was requested. */
  kind: "link" | "recheck";
  link: string;
  at: string;
}

/** A deposit the customer previewed on Add Funds. Never submitted and never credited. */
export interface PaymentPreview {
  id: string;
  amount: number;
  category: PaymentCategory;
  /** Card, bank and other methods. */
  methodId?: string;
  /** Crypto only. */
  asset?: string;
  network?: string;
  at: string;
}

/** Changes to a sample ticket made in this browser. */
interface TicketUpdate {
  status?: TicketStatus;
  read?: boolean;
  messages: DemoTicket["messages"];
  events: DemoTicket["events"];
}

/**
 * An editable order prepared from a previous one. Never submitted.
 * Free-text fields aren't kept, so nothing typed into notes or briefs is stored.
 */
export interface ReorderDraft {
  orderId: string;
  serviceId: string;
  values: Record<string, string>;
  at: string;
}

interface DemoState {
  fixes: Record<string, DemoFix>;
  /** Notification ids marked read; null until the customer reads one. */
  read: string[] | null;
  /** Newest first. */
  previews: PaymentPreview[];
  /** Tickets created in this demo, newest first. */
  tickets: DemoTicket[];
  ticketUpdates: Record<string, TicketUpdate>;
  /** Saved profile edits; null = the original demo profile. */
  profile: ProfileData | null;
  /** Saved preferences; null = defaults. */
  prefs: Preferences | null;
  /** Favorite service ids, most recently added first. */
  favorites: string[];
  reorderDraft: ReorderDraft | null;
}

const STORAGE_KEY = "sv-demo-state";
const MAX_PREVIEWS = 10;
const MAX_TICKETS = 30;
const MAX_FAVORITES = 100;
const EMPTY: DemoState = {
  fixes: {},
  read: null,
  previews: [],
  tickets: [],
  ticketUpdates: {},
  profile: null,
  prefs: null,
  favorites: [],
  reorderDraft: null,
};

/** Field kinds a reorder draft may keep. */
const DRAFT_KINDS = new Set(["link", "quantity", "budget", "select", "date", "consent"]);

/** Keeps only short values for structured fields the service still asks for. */
export function draftValues(serviceId: string, values: Record<string, unknown>) {
  const service = SERVICE_BY_ID[serviceId];
  if (!service) return {};
  const out: Record<string, string> = {};
  for (const f of CATEGORY_FIELDS[service.category]) {
    const v = values[f.id];
    if (DRAFT_KINDS.has(f.kind) && typeof v === "string" && v) out[f.id] = v.slice(0, 500);
  }
  return out;
}

function parseDraft(v: unknown): ReorderDraft | null {
  if (!isObj(v) || typeof v.orderId !== "string" || typeof v.serviceId !== "string" || typeof v.at !== "string") return null;
  if (!ORDERS.some((o) => o.id === v.orderId) || !SERVICE_BY_ID[v.serviceId]) return null;
  return { orderId: v.orderId, serviceId: v.serviceId, at: v.at, values: draftValues(v.serviceId, isObj(v.values) ? v.values : {}) };
}

const str = (v: unknown, max = 120) => (typeof v === "string" ? v.slice(0, max) : "");

/** Accepts a stored profile only if it's complete and valid. */
function parseProfile(v: unknown): ProfileData | null {
  if (!isObj(v)) return null;
  const b = isObj(v.business) ? v.business : {};
  const p: ProfileData = {
    firstName: str(v.firstName, 50),
    lastName: str(v.lastName, 50),
    displayName: str(v.displayName, 30),
    email: str(v.email),
    phone: str(v.phone, 20),
    country: str(v.country, 60) || DEFAULT_PROFILE.country,
    timezone: str(v.timezone, 60) || DEFAULT_PROFILE.timezone,
    accountType: v.accountType === "business" ? "business" : "personal",
    business: { name: str(b.name, 80), website: str(b.website), country: str(b.country, 60) || DEFAULT_PROFILE.country, reference: str(b.reference, 30) },
  };
  return Object.keys(validateProfile(p)).length ? null : p;
}

function parsePrefs(v: unknown): Preferences | null {
  if (!isObj(v)) return null;
  const n = isObj(v.notifications) ? v.notifications : {};
  return {
    notifications: Object.fromEntries(
      NOTIFICATION_PREFS.map(({ id }) => [id, typeof n[id] === "boolean" ? n[id] : DEFAULT_PREFS.notifications[id]]),
    ) as Preferences["notifications"],
    reduceMotion: v.reduceMotion === true,
    platform: str(v.platform, 40),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const STATUSES: TicketStatus[] = ["awaiting", "waiting", "resolved", "closed"];

function validMessages(list: unknown): DemoTicket["messages"] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (m): m is DemoTicket["messages"][number] =>
      isObj(m) && typeof m.id === "string" && typeof m.body === "string" && typeof m.at === "string" && (m.from === "customer" || m.from === "support"),
  );
}

function validEvents(list: unknown): DemoTicket["events"] {
  if (!Array.isArray(list)) return [];
  return list.filter((e): e is DemoTicket["events"][number] => isObj(e) && typeof e.at === "string" && typeof e.label === "string");
}

function validTicket(t: unknown): t is DemoTicket {
  return (
    isObj(t) &&
    typeof t.id === "string" &&
    typeof t.subject === "string" &&
    typeof t.createdAt === "string" &&
    typeof t.category === "string" &&
    t.category in TICKET_CATEGORIES &&
    STATUSES.includes(t.status as TicketStatus) &&
    (t.priority === "normal" || t.priority === "urgent") &&
    validMessages(t.messages).length > 0
  );
}

/** Rejects anything that doesn't match the current payment configuration. */
function validPreview(p: Partial<PaymentPreview> | null | undefined): p is PaymentPreview {
  if (!p || typeof p.id !== "string" || typeof p.at !== "string" || typeof p.amount !== "number") return false;
  if (p.amount < DEPOSIT_LIMITS.min || p.amount > DEPOSIT_LIMITS.max) return false;
  if (p.category === "crypto") return Boolean(p.asset && p.network && ASSET_BY_SYMBOL[p.asset]?.networks.includes(p.network));
  return Boolean(p.methodId && METHOD_BY_ID[p.methodId]?.category === p.category);
}
const listeners = new Set<() => void>();
let memory: DemoState | null = null;

function parse(raw: string | null): DemoState {
  if (!raw) return EMPTY;
  try {
    const data = JSON.parse(raw) as Partial<DemoState>;
    const fixes: Record<string, DemoFix> = {};
    // Only keep fixes for orders that exist and still need attention in the sample data.
    for (const [id, fix] of Object.entries(data.fixes ?? {})) {
      const order = ORDERS.find((o) => o.id === id);
      if (order?.status === "attention" && fix && typeof fix.link === "string" && typeof fix.at === "string") {
        fixes[id] = { kind: fix.kind === "link" ? "link" : "recheck", link: fix.link, at: fix.at };
      }
    }
    const read = Array.isArray(data.read) ? data.read.filter((r): r is string => typeof r === "string") : null;
    const previews = Array.isArray(data.previews) ? data.previews.filter(validPreview).slice(0, MAX_PREVIEWS) : [];
    const tickets = Array.isArray(data.tickets) ? data.tickets.filter(validTicket).slice(0, MAX_TICKETS) : [];
    const ticketUpdates: Record<string, TicketUpdate> = {};
    for (const [id, u] of Object.entries(isObj(data.ticketUpdates) ? data.ticketUpdates : {})) {
      if (!TICKETS.some((t) => t.id === id) || !isObj(u)) continue;
      ticketUpdates[id] = {
        status: STATUSES.includes(u.status as TicketStatus) ? (u.status as TicketStatus) : undefined,
        read: u.read === true ? true : undefined,
        messages: validMessages(u.messages),
        events: validEvents(u.events),
      };
    }
    // Services removed from the catalog drop out of favorites.
    const favorites = Array.isArray(data.favorites)
      ? [...new Set(data.favorites.filter((id): id is string => typeof id === "string" && Boolean(SERVICE_BY_ID[id])))].slice(0, MAX_FAVORITES)
      : [];
    return {
      fixes,
      read,
      previews,
      tickets,
      ticketUpdates,
      profile: parseProfile(data.profile),
      prefs: parsePrefs(data.prefs),
      favorites,
      reorderDraft: parseDraft(data.reorderDraft),
    };
  } catch {
    return EMPTY;
  }
}

function readState() {
  if (memory) return memory;
  try {
    memory = parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    memory = EMPTY;
  }
  return memory;
}

function writeState(next: DemoState) {
  memory = next;
  try {
    const empty =
      !Object.keys(next.fixes).length &&
      !next.read &&
      !next.previews.length &&
      !next.tickets.length &&
      !Object.keys(next.ticketUpdates).length &&
      !next.profile &&
      !next.prefs &&
      !next.favorites.length &&
      !next.reorderDraft;
    if (!empty) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Keep other tabs in step.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY && e.key !== null) return;
    memory = null;
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

const serverState = () => EMPTY;

function useDemoState() {
  return React.useSyncExternalStore(subscribe, readState, serverState);
}

/* -------------------------------------------------------------------------- */
/*  Derived views                                                             */
/* -------------------------------------------------------------------------- */

function applyFix(o: DemoOrder, fix: DemoFix | undefined): LocalOrder {
  if (!fix) return { ...o, localEvents: [] };
  return {
    ...o,
    status: "pending",
    link: fix.link,
    demoUpdated: true,
    localEvents: [
      {
        at: fix.at,
        title: fix.kind === "link" ? "You updated the target link" : "You asked us to re-check the account",
        detail: "Demo only — nothing was sent.",
        tone: "demo",
      },
    ],
  };
}

const derived = new WeakMap<DemoState, { orders: LocalOrder[]; activity: DemoActivity[]; unread: string[] }>();

function derive(state: DemoState) {
  let value = derived.get(state);
  if (value) return value;

  const orders = ORDERS.map((o) => applyFix(o, state.fixes[o.id]));
  const fixed = Object.entries(state.fixes).sort((a, b) => b[1].at.localeCompare(a[1].at));
  const activity: DemoActivity[] = [
    ...fixed.map(([id, fix]) => ({
      id: `demo-${id}-${fix.at}`,
      kind: "demo" as const,
      orderId: id,
      title: `Update saved · ${id}`,
      detail: "Demo only — nothing was sent and delivery hasn't resumed.",
      when: fix.at,
      unread: true,
    })),
    // A paused notice no longer asks for anything once it's been handled in this demo.
    ...ACTIVITY.map((a) => (a.kind === "attention" && a.orderId && state.fixes[a.orderId] ? { ...a, unread: false } : a)),
  ];
  const unread = activity.filter((a) => a.unread && !state.read?.includes(a.id)).map((a) => a.id);

  value = { orders, activity, unread };
  derived.set(state, value);
  return value;
}

/*
 * Live mode (DEMO_MODE off): a real account is present, so every hook below
 * returns the account's own records — and since ordering, support and
 * deposits aren't connected yet, those are empty. Sample records never mix
 * into a real account.
 */
const NO_ORDERS = { orders: [] as LocalOrder[], recent: [] as LocalOrder[], summary: summarize([]), changes: 0 };
const NO_ACTIVITY = { activity: [] as DemoActivity[], unread: [] as string[] };

/** Every order with this browser's demo changes applied, newest first. */
export function useDemoOrders() {
  const live = useLiveAccount();
  const state = useDemoState();
  if (live) return NO_ORDERS;
  const { orders } = derive(state);
  return {
    orders,
    recent: orders.slice(0, 7),
    summary: summarize(orders),
    /** Number of orders changed in this demo. */
    changes: Object.keys(state.fixes).length,
  };
}

export function useDemoActivity() {
  const live = useLiveAccount();
  const { activity, unread } = derive(useDemoState());
  if (live) return NO_ACTIVITY;
  return { activity, unread };
}

/** Simulates resolving an attention order. Stays in this browser; fulfilment is not resumed. */
export function saveDemoFix(id: string, fix: { kind: DemoFix["kind"]; link: string }) {
  const state = readState();
  writeState({ ...state, fixes: { ...state.fixes, [id]: { ...fix, at: new Date().toISOString() } } });
}

/** Payment previews saved on Add Funds, newest first. */
export function usePaymentPreviews() {
  const live = useLiveAccount();
  const previews = useDemoState().previews;
  return live ? NO_PREVIEWS : previews;
}

const NO_PREVIEWS: PaymentPreview[] = [];

/** Saves a preview for the Transactions page. Nothing is charged, submitted or credited. */
export function savePaymentPreview(preview: Omit<PaymentPreview, "id" | "at">) {
  const state = readState();
  const at = new Date().toISOString();
  const id = `PRV-${at.replace(/\D/g, "").slice(4, 14)}`;
  writeState({ ...state, previews: [{ ...preview, id, at }, ...state.previews.filter((p) => p.id !== id)].slice(0, MAX_PREVIEWS) });
  return id;
}

/* -------------------------------------------------------------------------- */
/*  Support tickets                                                           */
/* -------------------------------------------------------------------------- */

const ticketCache = new WeakMap<DemoState, DemoTicket[]>();
const NO_TICKETS: DemoTicket[] = [];

function ticketsOf(state: DemoState) {
  let list = ticketCache.get(state);
  if (list) return list;
  const sample = TICKETS.map((t) => {
    const u = state.ticketUpdates[t.id];
    if (!u) return t;
    return {
      ...t,
      status: u.status ?? t.status,
      unread: u.read ? false : t.unread,
      messages: [...t.messages, ...u.messages],
      events: [...t.events, ...u.events],
    };
  });
  list = [...state.tickets, ...sample];
  ticketCache.set(state, list);
  return list;
}

/** Sample tickets plus this browser's demo tickets and changes. */
export function useTickets() {
  const live = useLiveAccount();
  const state = useDemoState();
  const tickets = live ? NO_TICKETS : ticketsOf(state);
  return {
    tickets,
    summary: {
      open: tickets.filter((t) => isOpenTicket(t.status)).length,
      awaiting: tickets.filter((t) => t.status === "awaiting").length,
      waiting: tickets.filter((t) => t.status === "waiting").length,
      resolved: tickets.filter((t) => t.status === "resolved").length,
      closed: tickets.filter((t) => t.status === "closed").length,
      unread: tickets.filter((t) => t.unread).length,
    },
    /** Tickets created or changed in this demo. */
    changes: live ? 0 : state.tickets.length + Object.keys(state.ticketUpdates).length,
  };
}

const now = () => new Date().toISOString();

/** Applies a change to a demo-created ticket, or records it against a sample ticket. */
function updateTicket(id: string, change: { status?: TicketStatus; read?: boolean; message?: DemoTicket["messages"][number]; event?: string }) {
  const state = readState();
  const event = change.event ? [{ at: now(), label: change.event, demo: true }] : [];
  const message = change.message ? [change.message] : [];
  if (state.tickets.some((t) => t.id === id)) {
    writeState({
      ...state,
      tickets: state.tickets.map((t) =>
        t.id === id
          ? {
              ...t,
              status: change.status ?? t.status,
              unread: change.read ? false : t.unread,
              messages: [...t.messages, ...message],
              events: [...t.events, ...event],
            }
          : t,
      ),
    });
    return;
  }
  if (!TICKETS.some((t) => t.id === id)) return;
  const prev = state.ticketUpdates[id] ?? { messages: [], events: [] };
  writeState({
    ...state,
    ticketUpdates: {
      ...state.ticketUpdates,
      [id]: {
        status: change.status ?? prev.status,
        read: change.read || prev.read,
        messages: [...prev.messages, ...message],
        events: [...prev.events, ...event],
      },
    },
  });
}

/** Creates a ticket in this browser only. Nothing is sent to support. */
export function createDemoTicket(input: {
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  body: string;
  orderId?: string;
  txId?: string;
  attachments: TicketAttachment[];
}) {
  const state = readState();
  const highest = Math.max(...[...TICKETS, ...state.tickets].map((t) => Number(t.id.replace(/[^0-9]/g, "")) || 0));
  const id = "TCK-" + (highest + 1);
  const at = now();
  const ticket: DemoTicket = {
    id,
    subject: input.subject,
    category: input.category,
    priority: input.priority,
    status: "awaiting",
    orderId: input.orderId,
    txId: input.txId,
    createdAt: at,
    unread: false,
    demo: true,
    messages: [{ id: "m1", from: "customer", body: input.body, at, attachments: input.attachments.length ? input.attachments : undefined, demo: true }],
    events: [{ at, label: "Ticket created", demo: true }],
  };
  writeState({ ...state, tickets: [ticket, ...state.tickets].slice(0, MAX_TICKETS) });
  return id;
}

export function replyToTicket(id: string, body: string, attachments: TicketAttachment[]) {
  updateTicket(id, {
    status: "awaiting",
    message: { id: "r" + Date.now(), from: "customer", body, at: now(), attachments: attachments.length ? attachments : undefined, demo: true },
    event: "You replied · Awaiting reply",
  });
}

export function setTicketStatus(id: string, status: "resolved" | "awaiting") {
  updateTicket(id, { status, event: status === "resolved" ? "You marked this resolved" : "You reopened this ticket" });
}

export function markTicketRead(id: string) {
  updateTicket(id, { read: true });
}

export function resetSupportDemo() {
  writeState({ ...readState(), tickets: [], ticketUpdates: {} });
}

export function clearPaymentPreviews() {
  writeState({ ...readState(), previews: [] });
}

export function markNotificationsRead(ids: string[]) {
  const state = readState();
  const read = new Set(state.read);
  ids.forEach((id) => read.add(id));
  writeState({ ...state, read: [...read] });
}

export function resetDemoData() {
  writeState(EMPTY);
  setAvatarPreview(null);
}

/* -------------------------------------------------------------------------- */
/*  Profile & preferences                                                     */
/* -------------------------------------------------------------------------- */

const liveProfileCache = new WeakMap<LiveAccount["profile"], ProfileData>();

/** The profile form's shape for a real account's stored profile. */
function fromLive(live: LiveAccount): ProfileData {
  let p = liveProfileCache.get(live.profile);
  if (!p || p.timezone !== live.preferences.timezone) {
    const r = live.profile;
    p = {
      firstName: r.firstName,
      lastName: r.lastName,
      displayName: r.displayName,
      email: r.email,
      phone: r.phone,
      country: r.country,
      timezone: live.preferences.timezone,
      accountType: r.accountType,
      business: { name: r.businessName, website: r.website, country: r.country, reference: "" },
    };
    liveProfileCache.set(live.profile, p);
  }
  return p;
}

/** The real profile in live mode; otherwise the demo profile with this browser's saved edits. */
export function useProfile() {
  const live = useLiveAccount();
  const saved = useDemoState().profile;
  const profile = live ? fromLive(live) : (saved ?? DEFAULT_PROFILE);
  return {
    profile,
    fullName: `${profile.firstName} ${profile.lastName}`.trim(),
    initials: initialsOf(profile),
    edited: !live && profile !== DEFAULT_PROFILE,
  };
}

export function saveProfile(profile: ProfileData) {
  writeState({ ...readState(), profile });
}

/** True when preferences differ from the defaults (for the Reset Demo Data count). */
export function useDemoPrefsSaved() {
  return useDemoState().prefs !== null;
}

export function usePreferences() {
  return useDemoState().prefs ?? DEFAULT_PREFS;
}

/** Instant-save preferences. Stored in this browser only. */
export function savePreferences(patch: Partial<Preferences>) {
  const state = readState();
  writeState({ ...state, prefs: { ...(state.prefs ?? DEFAULT_PREFS), ...patch } });
}

/* -------------------------------------------------------------------------- */
/*  Favorites & reorder drafts                                                */
/* -------------------------------------------------------------------------- */

const favoriteCache = new WeakMap<DemoState, Set<string>>();

/** Favorite service ids (most recent first) with a quick lookup. */
export function useFavorites() {
  const state = useDemoState();
  let set = favoriteCache.get(state);
  if (!set) {
    set = new Set(state.favorites);
    favoriteCache.set(state, set);
  }
  return { ids: state.favorites, has: set };
}

export function toggleFavorite(serviceId: string) {
  if (!SERVICE_BY_ID[serviceId]) return;
  const state = readState();
  const favorites = state.favorites.includes(serviceId)
    ? state.favorites.filter((id) => id !== serviceId)
    : [serviceId, ...state.favorites].slice(0, MAX_FAVORITES);
  writeState({ ...state, favorites });
}

/** The saved draft, read once when a reorder opens. */
export function readReorderDraft(orderId: string) {
  const draft = readState().reorderDraft;
  return draft?.orderId === orderId ? draft : null;
}

export function saveReorderDraft(orderId: string, serviceId: string, values: Record<string, string>) {
  writeState({ ...readState(), reorderDraft: { orderId, serviceId, values: draftValues(serviceId, values), at: new Date().toISOString() } });
}

export function clearReorderDraft() {
  const state = readState();
  if (state.reorderDraft) writeState({ ...state, reorderDraft: null });
}

/** Saved favorites plus any reorder draft (for the Reset Demo Data count). */
export function useOrderingChanges() {
  const state = useDemoState();
  return state.favorites.length + (state.reorderDraft ? 1 : 0);
}

/* An avatar preview lives in memory only: never stored and never uploaded. */
let avatarUrl: string | null = null;
const avatarListeners = new Set<() => void>();

export function setAvatarPreview(url: string | null) {
  if (avatarUrl && avatarUrl !== url) URL.revokeObjectURL(avatarUrl);
  avatarUrl = url;
  avatarListeners.forEach((l) => l());
}

export function useAvatarPreview() {
  return React.useSyncExternalStore(
    (cb) => {
      avatarListeners.add(cb);
      return () => avatarListeners.delete(cb);
    },
    () => avatarUrl,
    () => null,
  );
}

/** Short relative label for demo changes; sample notices keep their fixed labels. */
export function whenLabel(when: string) {
  if (Number.isNaN(Date.parse(when)) || !/^\d{4}-/.test(when)) return when;
  return formatRelative(when);
}
