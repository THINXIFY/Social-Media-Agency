/**
 * Profile and preference definitions for My Profile and Settings.
 *
 * The demo account starts from `DEMO_USER`. Customer edits are stored in this
 * browser only (see the dashboard demo store). Nothing here is verified:
 * email and phone are always shown as unverified, and no passwords, codes or
 * identity documents are ever collected or stored.
 */

import { DEMO_USER } from "@/lib/demo-account";
import { parseLink } from "@/lib/links";

export type AccountType = "personal" | "business";

export interface ProfileData {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  country: string;
  timezone: string;
  accountType: AccountType;
  business: { name: string; website: string; country: string; reference: string };
}

export const DEFAULT_PROFILE: ProfileData = {
  firstName: DEMO_USER.firstName,
  lastName: DEMO_USER.lastName,
  displayName: DEMO_USER.firstName,
  email: DEMO_USER.email,
  phone: "",
  country: DEMO_USER.country,
  timezone: DEMO_USER.timezone,
  accountType: "personal",
  business: { name: "", website: "", country: DEMO_USER.country, reference: "" },
};

export const COUNTRIES = [
  "Australia",
  "Bangladesh",
  "Brazil",
  "Canada",
  "France",
  "Germany",
  "India",
  "Indonesia",
  "Italy",
  "Japan",
  "Mexico",
  "Netherlands",
  "Nigeria",
  "Pakistan",
  "Philippines",
  "Singapore",
  "Spain",
  "Turkey",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Other",
];

export const TIMEZONES: { id: string; label: string }[] = [
  { id: "UTC", label: "UTC" },
  { id: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
  { id: "America/New_York", label: "Eastern Time (New York)" },
  { id: "America/Sao_Paulo", label: "Brasília (São Paulo)" },
  { id: "Europe/London", label: "London" },
  { id: "Europe/Berlin", label: "Central Europe (Berlin)" },
  { id: "Africa/Lagos", label: "West Africa (Lagos)" },
  { id: "Asia/Dubai", label: "Gulf (Dubai)" },
  { id: "Asia/Karachi", label: "Pakistan (Karachi)" },
  { id: "Asia/Kolkata", label: "India (Kolkata)" },
  { id: "Asia/Dhaka", label: "Bangladesh (Dhaka)" },
  { id: "Asia/Singapore", label: "Singapore" },
  { id: "Asia/Tokyo", label: "Japan (Tokyo)" },
  { id: "Australia/Sydney", label: "Australia (Sydney)" },
];

export const timezoneLabel = (id: string) => TIMEZONES.find((t) => t.id === id)?.label ?? id;

export const initialsOf = (p: Pick<ProfileData, "firstName" | "lastName">) =>
  `${p.firstName.trim()[0] ?? ""}${p.lastName.trim()[0] ?? ""}`.toUpperCase() || "?";

export type ProfileErrors = Partial<Record<"firstName" | "lastName" | "displayName" | "email" | "phone" | "businessName" | "website" | "reference", string>>;

const NAME = /^[\p{L}][\p{L}\p{M}' .-]*$/u;

/** Inline validation for the profile form. Empty optional fields are fine. */
export function validateProfile(p: ProfileData): ProfileErrors {
  const e: ProfileErrors = {};
  const name = (v: string, label: string) =>
    !v.trim() ? `Enter your ${label}.` : v.trim().length > 50 ? `Keep your ${label} under 50 characters.` : !NAME.test(v.trim()) ? `Use letters only in your ${label}.` : undefined;
  e.firstName = name(p.firstName, "first name");
  e.lastName = name(p.lastName, "last name");
  const display = p.displayName.trim();
  if (!display) e.displayName = "Enter a display name.";
  else if (display.length < 2 || display.length > 30) e.displayName = "Use 2–30 characters.";
  if (!p.email.trim()) e.email = "Enter your email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email.trim())) e.email = "Enter a valid email, like name@example.com.";
  if (p.phone.trim() && !/^\+?[0-9][0-9 ()-]{6,19}$/.test(p.phone.trim())) e.phone = "Use digits, spaces or dashes, with an optional + country code.";
  if (p.accountType === "business") {
    if (!p.business.name.trim()) e.businessName = "Enter your business name.";
    else if (p.business.name.trim().length > 80) e.businessName = "Keep the business name under 80 characters.";
    if (p.business.website.trim() && !parseLink(p.business.website)) e.website = "Enter a full website address, like example.com.";
    if (p.business.reference.trim() && !/^[A-Za-z0-9 ./-]{3,30}$/.test(p.business.reference.trim())) e.reference = "Use 3–30 letters, numbers, spaces, dots, slashes or dashes.";
  }
  for (const k of Object.keys(e) as (keyof ProfileErrors)[]) if (!e[k]) delete e[k];
  return e;
}

/* -------------------------------------------------------------------------- */
/*  Preferences                                                               */
/* -------------------------------------------------------------------------- */

export type NotificationPref = "orderUpdates" | "orderAttention" | "payments" | "support" | "announcements";

export const NOTIFICATION_PREFS: { id: NotificationPref; label: string; description: string }[] = [
  { id: "orderUpdates", label: "Order status updates", description: "When an order starts, progresses or completes." },
  { id: "orderAttention", label: "Orders needing attention", description: "When an order is paused until you fix something." },
  { id: "payments", label: "Payment & deposit updates", description: "When a deposit is received, fails or expires." },
  { id: "support", label: "Support ticket replies", description: "When our team replies to one of your tickets." },
  { id: "announcements", label: "Product announcements", description: "New services and features. Occasional, never daily." },
];

/** Language, currency, time zone and date format live in the display settings (`@/lib/i18n`). */
export interface Preferences {
  notifications: Record<NotificationPref, boolean>;
  /** Reduce animation even when the device doesn't ask for it. */
  reduceMotion: boolean;
  /** Catalog platform id, or "" for none. */
  platform: string;
}

export const DEFAULT_PREFS: Preferences = {
  notifications: { orderUpdates: true, orderAttention: true, payments: true, support: true, announcements: false },
  reduceMotion: false,
  platform: "",
};

