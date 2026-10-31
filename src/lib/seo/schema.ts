import { absoluteUrl, SITE } from "./site";

/**
 * Centralised schema.org (JSON-LD) builders (SEO-01). Every value must match
 * what the page visibly shows: no ratings, reviews, prices, offers or
 * availability that isn't real. Render with <JsonLd>, which escapes safely.
 */

type Thing = Record<string, unknown>;

const ORG_ID = () => `${absoluteUrl("/")}#organization`;
const SITE_ID = () => `${absoluteUrl("/")}#website`;

export function organization(): Thing {
  return { "@type": "Organization", "@id": ORG_ID(), name: SITE.name, url: absoluteUrl("/"), description: SITE.description };
}

export function website(): Thing {
  return { "@type": "WebSite", "@id": SITE_ID(), name: SITE.name, url: absoluteUrl("/"), publisher: { "@id": ORG_ID() }, inLanguage: "en" };
}

export function webPage({ path, name, description, type = "WebPage" }: { path: string; name: string; description: string; type?: "WebPage" | "CollectionPage" }): Thing {
  return { "@type": type, "@id": `${absoluteUrl(path)}#webpage`, url: absoluteUrl(path), name, description, isPartOf: { "@id": SITE_ID() }, inLanguage: "en" };
}

export function breadcrumbs(items: { name: string; path: string }[]): Thing {
  return { "@type": "BreadcrumbList", itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })) };
}

/** Only for questions and answers shown on the page, word for word. */
export function faqPage(items: { q: string; a: string }[]): Thing {
  return { "@type": "FAQPage", mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
}

export function itemList(name: string, items: { name: string; path: string }[]): Thing {
  return { "@type": "ItemList", name, itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, url: absoluteUrl(it.path) })) };
}

/**
 * A tool that customers can actually use right now. Never emitted for tools
 * that are coming soon. The free offer reflects the real daily allowance for
 * signed-in accounts; no ratings are included because none exist.
 */
export function webApplication({ path, name, description, featureList }: { path: string; name: string; description: string; featureList: string[] }): Thing {
  return {
    "@type": "WebApplication",
    name,
    url: absoluteUrl(path),
    description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any (web browser)",
    featureList,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    provider: { "@id": ORG_ID() },
  };
}

/** One JSON-LD document for a page: a @graph of the given nodes. */
export function graph(...nodes: Thing[]): Thing {
  return { "@context": "https://schema.org", "@graph": nodes };
}

/** Serialises JSON-LD for a <script> tag: escapes characters that could end the tag or break parsing. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
