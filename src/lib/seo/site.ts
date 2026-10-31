/**
 * Site identity and canonical URLs for metadata, sitemaps and structured data
 * (SEO-01). Server-side only in practice: it reads APP_URL, which is never
 * exposed to the browser.
 *
 * The canonical origin is APP_URL. Production requires it (https, validated
 * in env.ts); this module also refuses to fall back to localhost when
 * APP_ENV=production, so canonicals and the sitemap can never point there.
 */

export const SITE = {
  name: "SociVanta",
  aiName: "SociVanta AI",
  tagline: "Social Media Services. Simplified.",
  description: "SociVanta is a clear, organised marketplace for social media services across every major platform, with SociVanta AI tools for planning and writing social content.",
  locale: "en_US",
} as const;

const DEV_ORIGIN = "http://localhost:3000";

export function siteOrigin(): string {
  const raw = process.env.APP_URL?.trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      // Invalid values are reported by env validation; fall through.
    }
  }
  if (process.env.APP_ENV === "production") throw new Error("APP_URL must be set to the public https origin in production (canonical URLs and the sitemap use it).");
  return DEV_ORIGIN;
}

export const absoluteUrl = (path = "/") => new URL(path, siteOrigin()).toString();
