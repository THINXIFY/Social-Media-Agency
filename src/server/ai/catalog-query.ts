import "server-only";
import { CATALOG_PLATFORM_CHOICES } from "@/lib/ai/registry";
import type { ServiceCategory } from "@/lib/catalog";
import { listPublicServices, type PublicService } from "../catalog/catalog";
import type { Db } from "../db/client";

/**
 * Natural-language access to the public catalog (AI-04), shared by AI
 * Service Search, its no-AI keyword mode and the Assistant's fact lookups.
 *
 * Everything goes through `listPublicServices` — visible, non-draft,
 * non-archived services with customer-safe fields; a price only for services
 * that pass all six eligibility gates. Parsing and scoring are deterministic
 * and make no network calls.
 */

export interface ParsedQuery {
  platforms: string[];
  categories: ServiceCategory[];
  terms: string[];
}

/** Platform aliases → catalog platform ids. Word-boundary matched. */
const PLATFORM_ALIASES: [RegExp, string][] = [
  [/\b(instagram|insta|ig|reels?)\b/, "instagram"],
  [/\b(tik ?tok)\b/, "tiktok"],
  [/\b(youtube|yt|youtuber)\b/, "youtube"],
  [/\b(facebook|fb)\b/, "facebook"],
  [/\b(twitter|tweets?)\b|\bon x\b|\bx\.com\b/, "x"],
  [/\blinked ?in\b/, "linkedin"],
  [/\b(pinterest|pins?)\b/, "pinterest"],
  [/\btelegram\b/, "telegram"],
  [/\bwhats ?app\b/, "whatsapp"],
  [/\bsnap ?chat\b/, "snapchat"],
  [/\btwitch\b/, "twitch"],
  [/\bdiscord\b/, "discord"],
  [/\b(reddit|subreddit)\b/, "reddit"],
  [/\b(spotify|soundcloud|music|songs?|tracks?|playlists?|album)\b/, "music"],
  [/\b(website|web ?site|online store website|blog|seo|google ranking)\b/, "website"],
];

/** Intent words → catalog categories. */
const CATEGORY_WORDS: [RegExp, ServiceCategory[]][] = [
  [/\b(followers?|subscribers?|subs|fans?|audience|members?|grow(th|ing)?|bigger)\b/, ["audience"]],
  [/\b(likes?|reactions?|hearts?|engagement|engage|interactions?)\b/, ["engagement"]],
  [/\b(views?|watch(es|ing|ed)?|plays?|streams?|impressions?|reach|seen)\b/, ["views"]],
  [/\b(comments?|replies|reviews?)\b/, ["comments"]],
  [/\b(promot(e|ion|ing)|advertis(e|ing|ement)|ads?|campaigns?|marketing|launch(ing)?|visibility|exposure|boost)\b/, ["promotion", "advertising"]],
  [/\b(seo|search engines?|google|rank(ing)?|backlinks?|traffic)\b/, ["seo"]],
  [/\b(messag(e|es|ing)|broadcasts?|dms?|bulk messages?)\b/, ["messaging"]],
  [/\b(community|communities|groups?|servers?)\b/, ["community"]],
];

const STOP = new Set("i im i'm me my we our us you your a an the to for of on in at with and or but is are be am want wants need needs help find get some more new looking look like would could should can please services service something things stuff business store brand company shop page account channel profile".split(" "));

export function parseServiceQuery(raw: string): ParsedQuery {
  const q = raw.toLowerCase().normalize("NFKC");
  const platforms = [...new Set(PLATFORM_ALIASES.filter(([re]) => re.test(q)).map(([, id]) => id))].slice(0, 3);
  const categories = [...new Set(CATEGORY_WORDS.filter(([re]) => re.test(q)).flatMap(([, c]) => c))];
  const terms = [...new Set(q.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)))].slice(0, 12);
  return { platforms, categories, terms };
}

export interface ScoredService extends PublicService {
  score: number;
  /** Deterministic, human-readable reasons (keyword mode). */
  matched: string[];
}

async function allPublic(db: Db, platform?: string) {
  const out: PublicService[] = [];
  for (let page = 1; page <= 4; page++) {
    const r = await listPublicServices(db, { platform, page, pageSize: 48, sort: "name" });
    out.push(...r.items);
    if (page >= r.pages) break;
  }
  return out;
}

/**
 * Candidates for a request. An explicit platform filter wins over detected
 * platforms. With no signal at all, `includeUnscored` returns a broad sample
 * (for the model to ask a clarifying question); keyword mode never does.
 */
export async function findCandidates(db: Db, parsed: ParsedQuery, opts: { platform?: string; limit?: number; includeUnscored?: boolean } = {}): Promise<ScoredService[]> {
  const platforms = opts.platform ? [opts.platform] : parsed.platforms;
  const pool = platforms.length ? (await Promise.all(platforms.map((p) => allPublic(db, p)))).flat() : await allPublic(db);
  const wanted = new Set<string>(parsed.categories);
  const scored = pool.map((s): ScoredService => {
    const name = s.name.toLowerCase();
    const desc = s.description.toLowerCase();
    const matched: string[] = [];
    let score = 0;
    if (platforms.includes(s.platform.id)) {
      score += 2;
      matched.push(s.platform.name);
    }
    if (wanted.has(s.category)) {
      score += 3;
      matched.push(s.categoryLabel);
    }
    for (const t of parsed.terms) {
      if (name.includes(t)) score += 2;
      else if (desc.includes(t)) score += 1;
    }
    if (s.status === "available") score += 0.5; // a gentle tie-break towards orderable services
    return { ...s, score, matched };
  });
  const signal = platforms.length + parsed.categories.length + parsed.terms.length > 0;
  const ranked = scored.filter((s) => opts.includeUnscored || (signal && s.score >= (wanted.size || parsed.terms.length ? 1 : 2))).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return ranked.slice(0, opts.limit ?? 40);
}

export const platformName = (id: string) => CATALOG_PLATFORM_CHOICES[id] ?? id;

/** What the model may see about a candidate: public identity only — never price, status, costs or notes. */
export const forModel = (s: PublicService) => ({ id: s.id, name: s.name, platform: s.platform.name, category: s.categoryLabel, description: s.description.slice(0, 200) });

/** A service card for the customer, built entirely from the catalog record. */
export interface ServiceCard {
  id: string;
  name: string;
  description: string;
  platform: { id: string; name: string };
  category: string;
  categoryLabel: string;
  status: "available" | "preview";
  price: { amount: number; unit: string } | null;
  limits: { min: number | null; max: number | null } | null;
  fields: { id: string; label: string; required: boolean }[];
  orderable: boolean;
  why: string;
}
export const toCard = (s: PublicService, why: string, checkoutOpen: boolean): ServiceCard => ({
  id: s.id,
  name: s.name,
  description: s.description,
  platform: s.platform,
  category: s.category,
  categoryLabel: s.categoryLabel,
  status: s.status,
  price: s.price,
  limits: s.limits,
  fields: s.fields.map((f) => ({ id: f.id, label: f.label, required: f.required })),
  orderable: s.status === "available" && checkoutOpen,
  why,
});

/** One public service by id (visible, not draft or archived), or null. Same customer-safe shape as the catalog. */
export async function findPublicService(db: Db, id: string): Promise<PublicService | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) || id.length > 80) return null;
  return (await allPublic(db)).find((s) => s.id === id) ?? null;
}
