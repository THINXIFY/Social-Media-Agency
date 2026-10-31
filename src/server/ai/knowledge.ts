import "server-only";
import { AI_TOOLS, aiToolHref } from "@/lib/ai/registry";
import { catalogCounts } from "../catalog/catalog";
import type { Db } from "../db/client";
import type { Env } from "../env";
import { checkoutEnabled } from "../orders/orders";
import { findCandidates, parseServiceQuery } from "./catalog-query";
import { generationStatus } from "./provider";

/**
 * The AI Assistant's verified knowledge (AI-04).
 *
 * A small, curated set of statements about how Sociotix actually works,
 * plus live facts read from the database and configuration on every turn
 * (catalog size, what's orderable, whether checkout and bank deposits are
 * on, which AI tools work). For each question the most relevant sections
 * and a few matching catalog services are selected into a bounded fact
 * sheet. Prices appear only for services that pass every eligibility gate.
 *
 * No account, order, balance or support data is ever included (AI-05's
 * order tools read the customer's own order separately). No vector database: the knowledge is small enough to select by
 * keyword overlap, deterministically and testably.
 */

/** Internal pages the assistant may point to. The model picks ids; the server owns the URLs. */
export const LINKS = {
  services: { href: "/#services", label: "Browse services" },
  howItWorks: { href: "/#how-it-works", label: "How Sociotix works" },
  faq: { href: "/#faq", label: "Sociotix FAQ" },
  aiTools: { href: "/ai-tools", label: "Sociotix AI tools" },
  serviceSearch: { href: "/ai-tools/service-search", label: "Smart Service Search" },
  newOrder: { href: "/dashboard/new-order", label: "New order" },
  orders: { href: "/dashboard/orders", label: "My orders" },
  addFunds: { href: "/dashboard/add-funds", label: "Add funds" },
  support: { href: "/dashboard/support", label: "Support" },
  newTicket: { href: "/dashboard/support?new=1", label: "Create a support ticket" },
  help: { href: "/help", label: "Help Center" },
  security: { href: "/dashboard/security", label: "Account security" },
  register: { href: "/register", label: "Create an account" },
  login: { href: "/login", label: "Log in" },
  ...Object.fromEntries(AI_TOOLS.filter((t) => t.phase !== "Later").map((t) => [`tool:${t.id}`, { href: aiToolHref(t), label: t.name }])),
} as Record<string, { href: string; label: string }>;
export const ALLOWED_HREFS = new Set(Object.values(LINKS).map((l) => l.href));

export interface Section {
  id: string;
  keywords: string[];
  text: (live: LiveFacts) => string;
}
export interface LiveFacts {
  services: number;
  orderable: number;
  checkoutOpen: boolean;
  bankDeposits: boolean;
  aiLive: boolean;
  /** A monitored inbox the operator has configured (SUPPORT_CONTACT_EMAIL), or null. */
  supportEmail: string | null;
}

/**
 * Customer support tickets are live (Phase 5G-A): signed-in customers open and
 * follow tickets from the dashboard Support page. The assistants can only
 * point there; they never create, read or change tickets themselves.
 */
export const SUPPORT_TICKETS_CONNECTED = true;

/** How a customer can reach a person right now — stated exactly, never embellished. */
export function humanSupportFact(f: Pick<LiveFacts, "supportEmail">) {
  const tickets = SUPPORT_TICKETS_CONNECTED
    ? "To reach a person, sign in and open a support ticket from the Support page in your dashboard; the team replies in the ticket. Nothing typed to an AI assistant is sent to the team."
    : "Support tickets aren't connected yet: the Support page in the dashboard can't take requests, and nothing typed to an AI assistant is sent to the team.";
  const email = f.supportEmail
    ? ` You can also email the Sociotix team at ${f.supportEmail} and include your order reference if it's about an order.`
    : SUPPORT_TICKETS_CONNECTED
      ? ""
      : " No other contact channel is connected yet, so the assistant can't put you in touch with a person right now.";
  return tickets + email;
}

export const SECTIONS: Section[] = [
  {
    id: "about",
    keywords: ["what", "sociotix", "socivanta", "offer", "do", "help", "about", "platforms", "services"],
    text: (f) =>
      `Sociotix is a marketplace for social media services across 15 platforms (Instagram, TikTok, YouTube, Facebook, X / Twitter, LinkedIn, Pinterest, Telegram, WhatsApp, Snapchat, Twitch, Discord, Reddit, Spotify & music, and website promotion). The catalog lists ${f.services} services in categories such as followers & members, likes & reactions, views & plays, comments, promotion, advertising, business messaging, SEO and community campaigns. Sociotix AI is a set of tools for writing and planning social content and finding services. [links: services, aiTools, howItWorks]`,
  },
  {
    id: "ordering",
    keywords: ["order", "orders", "buy", "purchase", "checkout", "how", "work", "place", "configure", "quantity", "link"],
    text: (f) =>
      `How ordering works: you choose a service, then the New Order flow asks for what that service needs (for example the link to your profile or post, and a quantity within the service's limits), shows the price and lets you review before confirming. Orders are paid from your Sociotix wallet balance. A service can be ordered only after its pricing, supplier, fulfilment, payment, legal and technical checks are all complete. ${f.orderable} of ${f.services} services currently pass every check. ${f.checkoutOpen ? "Ordering is open." : "Ordering is not open yet — customers can browse the catalog, but no orders can be placed right now."} [links: newOrder, services]`,
  },
  {
    id: "funds",
    keywords: ["funds", "wallet", "balance", "pay", "payment", "deposit", "money", "bank", "transfer", "top", "add"],
    text: (f) =>
      `Paying: orders use your wallet balance. ${f.bankDeposits ? "You can add funds by bank transfer from the Add funds page. Each deposit is checked and verified by the Sociotix team before it's credited to your wallet." : "Adding funds isn't available yet; payment methods are being set up."} The assistant can't see your balance or deposits — check them in your dashboard. [links: addFunds]`,
  },
  {
    id: "status",
    keywords: ["status", "track", "tracking", "progress", "pending", "processing", "completed", "cancelled", "attention", "where", "my order"],
    text: () =>
      `Order statuses customers see: Awaiting review (the team checks every order before work starts), Approved, In progress, Partially delivered, Needs your information (the team asked for something — update the details from the order), Completed, Rejected or Canceled (the full amount goes back to your wallet), Failed (the team reviews what you're owed) and Refunded. Every status change is recorded on the order. This assistant can't see your orders: open My orders, and choose Explain this order for a plain-language explanation of one of them. [links: orders, tool:order-explanation]`,
  },
  {
    id: "delivery",
    keywords: ["long", "time", "fast", "speed", "delivery", "deliver", "when", "days", "hours", "quick"],
    text: () => `Delivery time depends on the service and on the platform itself (for example how long an ad takes to be approved). Sociotix doesn't promise speeds or results it can't control. The assistant can't give delivery times for specific orders.`,
  },
  {
    id: "guarantees",
    keywords: ["guarantee", "guaranteed", "results", "safe", "ban", "rules", "drop", "refill", "retention", "real"],
    text: () => `Results aren't guaranteed. Outcomes such as retention, reach and timing depend on the platform. Customers should make sure any service they order fits the rules of the platform they use it on.`,
  },
  {
    id: "refunds",
    keywords: ["refund", "refunds", "money back", "cancel", "cancellation", "return", "dispute", "problem", "wrong"],
    text: (f) =>
      `Cancellations: you can cancel an order yourself from its panel in My orders while it's Awaiting review or Needs your information — nothing has been worked on yet, so the full amount goes back to your wallet. Rejected and canceled orders return the full amount automatically. Once work has started, any refund needs a reviewed decision by the Sociotix team; refunds aren't automatic, and the assistant can't check, approve or promise them. ${humanSupportFact(f)} [links: orders, support]`,
  },
  {
    id: "account",
    keywords: ["account", "sign", "signup", "register", "login", "log", "password", "email", "verify", "verification", "security", "2fa"],
    text: () => `Accounts: you create a free account with your email address and verify it by clicking the link Sociotix emails you. A verified account is needed to order and to use Sociotix AI tools. Security settings, including your password, are in your dashboard. [links: register, login, security]`,
  },
  {
    id: "support",
    keywords: ["support", "help", "contact", "ticket", "human", "person", "team", "talk"],
    text: (f) => `Support: ${humanSupportFact(f)} The assistant is an automated guide and can't act on your account or open tickets for you. Answers to common questions are in the Help Center. [links: newTicket, help]`,
  },
  {
    id: "ai-tools",
    keywords: ["ai", "tool", "tools", "caption", "hashtag", "ideas", "calendar", "advisor", "roadmap", "recommender", "search", "assistant", "free", "limit", "generate"],
    text: (f) =>
      `Sociotix AI tools: ${AI_TOOLS.filter((t) => t.phase !== "Later" && t.availability !== "unavailable")
        .map((t) => `${t.name} — ${t.tagline}${t.free ? ` (${t.free.signedInPerDay} free runs a day with a verified account)` : ""}`)
        .join("; ")}. ${f.aiLive ? "These tools are available now." : "These tools are not generating yet — they are coming soon."} Not yet available: ${AI_TOOLS.filter((t) => t.phase === "Later").map((t) => t.name).join(", ") || "none"}. AI tools never connect to or post on social accounts, can't place orders or move money, and briefs aren't stored. [links: aiTools, tool:caption-generator, tool:growth-advisor, tool:service-search]`,
  },
  {
    id: "find",
    keywords: ["find", "recommend", "which", "best", "suitable", "promote", "grow", "need", "looking", "service", "services", "help me"],
    text: () => `Finding services: customers can browse and filter the catalog on the homepage, or describe what they need in plain words in Smart Service Search, which matches requests to real catalog services. [links: serviceSearch, services]`,
  },
  {
    id: "scope",
    keywords: [],
    text: () =>
      `About this assistant: it answers questions about Sociotix and gives general social media marketing advice. It can't see or change orders, balances, deposits or account details, and it never takes actions. Prices and availability come only from Sociotix's catalog.`,
  },
];

const words = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1));

export interface Knowledge {
  sheet: string;
  /** Prices (USD amounts) the answer is allowed to state. */
  prices: number[];
  sections: string[];
}

export async function liveFacts(db: Db, env: Env): Promise<LiveFacts> {
  const counts = await catalogCounts(db);
  return { services: counts.visible, orderable: counts.purchasable, checkoutOpen: await checkoutEnabled(db), bankDeposits: env.PAYMENTS_BANK_ENABLED, aiLive: generationStatus(env).ok, supportEmail: env.SUPPORT_CONTACT_EMAIL ?? null };
}

/** Builds the bounded fact sheet for a question (and the recent conversation, for context). */
export async function buildKnowledge(db: Db, env: Env, question: string, recent = ""): Promise<Knowledge> {
  const facts = await liveFacts(db, env);
  const q = words(`${question} ${recent}`);
  const ranked = SECTIONS.filter((s) => s.id !== "about" && s.id !== "scope")
    .map((s) => ({ s, score: s.keywords.reduce((n, k) => n + (k.includes(" ") ? (`${question} ${recent}`.toLowerCase().includes(k) ? 2 : 0) : q.has(k) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.s);
  const chosen = [SECTIONS.find((s) => s.id === "about")!, ...ranked, SECTIONS.find((s) => s.id === "scope")!];

  // Matching catalog services, when the question names a platform or a kind of service.
  const parsed = parseServiceQuery(question);
  const services = parsed.platforms.length || parsed.categories.length ? await findCandidates(db, parsed, { limit: 8 }) : [];
  const serviceLines = services.map((s) => `- ${s.name} (${s.platform.name}, ${s.categoryLabel}): ${s.status === "available" && s.price ? `orderable once ordering is open; listed price $${s.price.amount} ${s.price.unit}` : "listed in the catalog but not orderable yet; no price is set"}. An order asks for: ${s.fields.map((f) => f.label).join(", ") || "the details shown in New Order"}.`);
  const prices = services.flatMap((s) => (s.status === "available" && s.price ? [s.price.amount] : []));

  const sheet = [
    ...chosen.map((s) => `[${s.id}] ${s.text(facts)}`),
    ...(serviceLines.length ? [`[catalog matches]\n${serviceLines.join("\n")}`] : []),
    `[link ids] ${Object.keys(LINKS).join(", ")}`,
  ].join("\n\n");
  return { sheet: sheet.slice(0, 9_000), prices, sections: chosen.map((s) => s.id) };
}
