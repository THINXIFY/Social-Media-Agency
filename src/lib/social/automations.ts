import { z } from "zod";
import { isTimeZone, utcToZonedInput, zonedToUtc } from "./time";

/**
 * Automation Studio (AI-08): the strict allowlist of triggers and actions,
 * shared by the builder, the server, the worker and the AI assistant (whose
 * suggestions must parse against these same schemas).
 *
 * Every action is internal to Sociotix: in-app reminders, checklists, draft
 * review flags, connection-health warnings and draft suggestions the customer
 * approves. Nothing here can publish, schedule posts, place orders, move money,
 * change permissions, message anyone or call external URLs.
 */

const sanitize = (s: string) => s.normalize("NFC").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
const text = (min: number, max: number) =>
  z
    .string()
    .transform((s) => sanitize(s).trim())
    .pipe(z.string().min(min, min ? "Required." : undefined))
    .refine((s) => Array.from(s).length <= max, `Must be ${max} characters or fewer.`);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:00.");

export const WEEKDAYS = [
  { id: 1, short: "Mon", long: "Monday" },
  { id: 2, short: "Tue", long: "Tuesday" },
  { id: 3, short: "Wed", long: "Wednesday" },
  { id: 4, short: "Thu", long: "Thursday" },
  { id: 5, short: "Fri", long: "Friday" },
  { id: 6, short: "Sat", long: "Saturday" },
  { id: 7, short: "Sun", long: "Sunday" },
] as const;

export const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("weekly"), days: z.array(z.number().int().min(1).max(7)).min(1).max(7).transform((d) => [...new Set(d)].sort()), time }).strict(),
  z.object({ type: z.literal("daily"), time }).strict(),
  z.object({ type: z.literal("once"), at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a date and time.") }).strict(),
  z.object({ type: z.literal("draft_due"), time, withinDays: z.number().int().min(1).max(14) }).strict(),
  z.object({ type: z.literal("account_attention"), time }).strict(),
]);
export type Trigger = z.output<typeof triggerSchema>;
export type TriggerType = Trigger["type"];

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reminder"), title: text(1, 80), message: text(0, 500) }).strict(),
  z.object({ type: z.literal("checklist"), title: text(1, 80), items: z.array(text(1, 120)).min(1).max(12) }).strict(),
  z.object({ type: z.literal("flag_drafts"), withinDays: z.number().int().min(1).max(14) }).strict(),
  z.object({ type: z.literal("health_check") }).strict(),
  z.object({ type: z.literal("draft_suggestion"), title: text(1, 80), text: text(1, 2000) }).strict(),
]);
export type Action = z.output<typeof actionSchema>;
export type ActionType = Action["type"];

/** Which actions each trigger may run. Data triggers only run the action that reads the same data. */
export const COMPATIBLE: Record<TriggerType, ActionType[]> = {
  weekly: ["reminder", "checklist", "flag_drafts", "health_check", "draft_suggestion"],
  daily: ["reminder", "checklist", "flag_drafts", "health_check", "draft_suggestion"],
  once: ["reminder", "checklist", "flag_drafts", "health_check", "draft_suggestion"],
  draft_due: ["flag_drafts"],
  account_attention: ["health_check"],
};

export const definitionSchema = z
  .object({
    name: text(1, 80),
    description: text(0, 200).optional().default(""),
    timezone: z.string().refine(isTimeZone, "Unknown time zone."),
    trigger: triggerSchema,
    action: actionSchema,
    /** For data actions: only create something when there's something to review. */
    onlyIfFound: z.boolean().default(true),
    templateId: z.string().max(40).nullable().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (!COMPATIBLE[d.trigger.type].includes(d.action.type)) ctx.addIssue({ code: "custom", path: ["action"], message: `${ACTION_META[d.action.type].label} can't run on "${TRIGGER_META[d.trigger.type].label}".` });
  });
export type AutomationDefinition = z.output<typeof definitionSchema>;
export type AutomationInput = z.input<typeof definitionSchema>;

/* -------------------------------------------------------------------------- */
/*  Labels                                                                    */
/* -------------------------------------------------------------------------- */

export const TRIGGER_META: Record<TriggerType, { label: string; hint: string }> = {
  weekly: { label: "Every week", hint: "On the days and time you choose." },
  daily: { label: "Every day", hint: "At the same time each day." },
  once: { label: "Once", hint: "A single date and time." },
  draft_due: { label: "Drafts planned soon", hint: "Checked daily — runs when drafts are planned within a few days." },
  account_attention: { label: "Account needs attention", hint: "Checked daily — runs when a connected account needs a reconnect or refresh." },
};

export const ACTION_META: Record<ActionType, { label: string; hint: string }> = {
  reminder: { label: "Create a reminder", hint: "An in-app reminder with your message." },
  checklist: { label: "Prepare a checklist", hint: "A checklist you can tick off in Sociotix." },
  flag_drafts: { label: "Flag drafts for review", hint: "Lists drafts planned in the coming days." },
  health_check: { label: "Check account health", hint: "Lists connected accounts that need a reconnect or refresh." },
  draft_suggestion: { label: "Suggest a draft", hint: "Prepares post text you can turn into a draft with one click." },
};

export const AUTOMATION_STATUS = ["draft", "active", "paused", "completed"] as const;
export type AutomationStatus = (typeof AUTOMATION_STATUS)[number];
export const RUN_STATUS = ["running", "succeeded", "skipped", "failed"] as const;
export type RunStatus = (typeof RUN_STATUS)[number];

/* -------------------------------------------------------------------------- */
/*  Scheduling (DST-safe)                                                     */
/* -------------------------------------------------------------------------- */

const pad = (n: number) => String(n).padStart(2, "0");
const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
const isoWeekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/**
 * The instant a wall-clock time names in a zone. A time skipped by a
 * daylight-saving jump runs at the first valid minute after the gap; a time
 * that happens twice runs at its first occurrence.
 */
function wallToInstant(date: string, hhmm: string, tz: string): number | null {
  const r = zonedToUtc(`${date}T${hhmm}`, tz);
  if (r.ok) return Date.parse(r.iso);
  if (r.reason !== "nonexistent") return null;
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  for (let add = 15; add <= 120; add += 15) {
    const total = h * 60 + m + add;
    if (total >= 24 * 60) break;
    const next = zonedToUtc(`${date}T${pad(Math.floor(total / 60))}:${pad(total % 60)}`, tz);
    if (next.ok) return Date.parse(next.iso);
  }
  return null;
}

/** The next run strictly after `after`, or null (one-off already passed). */
export function nextRunAt(trigger: Trigger, tz: string, after: Date): Date | null {
  if (trigger.type === "once") {
    const r = zonedToUtc(trigger.at, tz);
    if (!r.ok) return null;
    const t = Date.parse(r.iso);
    return t > after.getTime() ? new Date(t) : null;
  }
  const today = utcToZonedInput(after.toISOString(), tz).slice(0, 10);
  for (let d = 0; d <= 8; d++) {
    const date = addDays(today, d);
    if (trigger.type === "weekly" && !trigger.days.includes(isoWeekday(date))) continue;
    const t = wallToInstant(date, trigger.time, tz);
    if (t !== null && t > after.getTime()) return new Date(t);
  }
  return null;
}

/** "Every Monday and Thursday at 09:00" — plain language for summaries. */
export function describeTrigger(t: Trigger): string {
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
  switch (t.type) {
    case "weekly":
      if (!t.days.length) return `Every week at ${t.time} (choose days)`;
      return t.days.length === 7 ? `Every day at ${t.time}` : t.days.length === 5 && !t.days.includes(6) && !t.days.includes(7) ? `Every weekday at ${t.time}` : `Every ${list(t.days.map((d) => WEEKDAYS[d - 1]!.long))} at ${t.time}`;
    case "daily":
      return `Every day at ${t.time}`;
    case "once":
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t.at) || Number.isNaN(Date.parse(`${t.at}:00Z`))) return "Once (choose a date and time)";
      return `Once, on ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(Date.parse(`${t.at}:00Z`))}`;
    case "draft_due":
      return `Daily at ${t.time}, when drafts are planned within ${t.withinDays} day${t.withinDays === 1 ? "" : "s"}`;
    case "account_attention":
      return `Daily at ${t.time}, when a connected account needs attention`;
  }
}

export function describeAction(a: Action): string {
  switch (a.type) {
    case "reminder":
      return `Create the reminder “${a.title}”`;
    case "checklist":
      return `Prepare the checklist “${a.title}” (${a.items.length} item${a.items.length === 1 ? "" : "s"})`;
    case "flag_drafts":
      return `Flag drafts planned in the next ${a.withinDays} day${a.withinDays === 1 ? "" : "s"} for review`;
    case "health_check":
      return "List connected accounts that need a reconnect or refresh";
    case "draft_suggestion":
      return `Suggest the draft “${a.title}” for you to approve`;
  }
}

/** Expected frequency, for the review step. */
export function frequency(t: Trigger): string {
  if (t.type === "once") return "Runs once.";
  if (t.type === "weekly") return `Up to ${t.days.length} time${t.days.length === 1 ? "" : "s"} a week.`;
  if (t.type === "daily") return "Up to 7 times a week.";
  return "Checked once a day; creates something only when it finds something.";
}

/** What an automation may access — shown before activation. */
export function permissionsFor(a: Action): string[] {
  const base = ["Create items in your Sociotix Automation inbox"];
  if (a.type === "flag_drafts") return [...base, "Read the planned dates of your own drafts"];
  if (a.type === "health_check") return [...base, "Read the connection status of your own social accounts (never their content)"];
  if (a.type === "draft_suggestion") return [...base, "Prepare post text — a draft is created only when you approve it"];
  return base;
}

/* -------------------------------------------------------------------------- */
/*  Templates                                                                 */
/* -------------------------------------------------------------------------- */

export interface AutomationTemplate {
  id: string;
  name: string;
  purpose: string;
  icon: "bell" | "checklist" | "drafts" | "rocket" | "target" | "health";
  definition: Omit<AutomationInput, "timezone">;
}

export const TEMPLATES: AutomationTemplate[] = [
  {
    id: "weekly-content-reminder",
    name: "Weekly content reminder",
    purpose: "A Monday nudge to review and prepare the week's content.",
    icon: "bell",
    definition: { name: "Weekly content reminder", description: "Review and prepare this week's content.", trigger: { type: "weekly", days: [1], time: "09:00" }, action: { type: "reminder", title: "Plan this week's content", message: "Open your calendar, check what's planned, and fill any gaps for the week ahead." }, onlyIfFound: true },
  },
  {
    id: "content-planning-routine",
    name: "Content planning routine",
    purpose: "A structured weekly planning checklist, every Friday.",
    icon: "checklist",
    definition: { name: "Content planning routine", description: "A weekly planning checklist.", trigger: { type: "weekly", days: [5], time: "14:00" }, action: { type: "checklist", title: "Weekly content plan", items: ["Review last week's posts", "Pick 2–3 themes for next week", "Write or update drafts", "Give each draft a planned date", "Check every account is connected"] }, onlyIfFound: true },
  },
  {
    id: "draft-review-reminder",
    name: "Draft review reminder",
    purpose: "Flags drafts planned in the next 3 days so nothing slips.",
    icon: "drafts",
    definition: { name: "Draft review reminder", description: "Catch drafts that are coming up soon.", trigger: { type: "draft_due", time: "09:00", withinDays: 3 }, action: { type: "flag_drafts", withinDays: 3 }, onlyIfFound: true },
  },
  {
    id: "publishing-preparation",
    name: "Publishing preparation checklist",
    purpose: "A pre-publish checklist every Wednesday.",
    icon: "rocket",
    definition: { name: "Publishing preparation", description: "Get posts ready before they go out.", trigger: { type: "weekly", days: [3], time: "10:00" }, action: { type: "checklist", title: "Before you publish", items: ["Proofread captions", "Check each platform's preview for issues", "Add media where a platform needs it", "Confirm links and calls to action", "Set planned dates on the calendar"] }, onlyIfFound: true },
  },
  {
    id: "campaign-review",
    name: "Campaign review reminder",
    purpose: "A weekly Monday check-in on your campaign goals and metrics.",
    icon: "target",
    definition: { name: "Campaign review", description: "Check your goals against what each platform shows.", trigger: { type: "weekly", days: [1], time: "11:00" }, action: { type: "checklist", title: "Campaign check-in", items: ["Re-read your campaign objective", "Review the metrics each platform shows you", "Note what worked and what didn't", "Adjust next week's themes"] }, onlyIfFound: true },
  },
  {
    id: "account-health-check",
    name: "Social account health check",
    purpose: "Tells you when a connected account needs a reconnect or refresh.",
    icon: "health",
    definition: { name: "Account health check", description: "Spot connections that need attention.", trigger: { type: "account_attention", time: "08:00" }, action: { type: "health_check" }, onlyIfFound: true },
  },
];

/** Shown so customers know what's deliberately not possible yet. */
export const UNAVAILABLE_TEMPLATES = [
  { name: "Auto-publish approved posts", reason: "Publishing isn't switched on for any platform, and automations never publish without your confirmation." },
  { name: "Weekly performance digest", reason: "Needs account analytics, which no platform shares with Sociotix yet." },
  { name: "Reply to comments", reason: "Automations never message anyone on your behalf." },
];

/* -------------------------------------------------------------------------- */
/*  Views                                                                     */
/* -------------------------------------------------------------------------- */

export interface AutomationView {
  id: string;
  name: string;
  description: string;
  templateId: string | null;
  timezone: string;
  trigger: Trigger;
  action: Action;
  onlyIfFound: boolean;
  status: AutomationStatus;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: RunStatus | null;
  /** Something needs the customer (last run failed, or a one-off date passed while paused). */
  attention: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRunView {
  id: string;
  automationId: string | null;
  automationName: string;
  trigger: string;
  scheduledFor: string;
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus;
  outcome: string | null;
  canRetry: boolean;
}

export type InboxKind = "reminder" | "checklist" | "draft_review" | "health_warning" | "suggestion";

export interface InboxItemView {
  id: string;
  kind: InboxKind;
  title: string;
  body: string;
  checklist: { text: string; done: boolean }[];
  refs: { type: "post" | "account"; id: string; label: string }[];
  status: "open" | "done" | "dismissed";
  automationName: string;
  createdAt: string;
  /** For suggestions: the draft created when approved. */
  draftId: string | null;
}

export interface AutomationData {
  automations: AutomationView[];
  runs: AutomationRunView[];
  inbox: InboxItemView[];
}

export const AUTOMATION_ROUTES = {
  studio: "/dashboard/social/automations",
  create: "/dashboard/social/automations/new",
} as const;
export const automationHref = (id: string) => `${AUTOMATION_ROUTES.studio}/${encodeURIComponent(id)}`;
