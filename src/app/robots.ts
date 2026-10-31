import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/site";

/**
 * robots.txt (SEO-01). Crawl hints only — never a security control: private
 * areas are protected by authentication, and their pages also send noindex.
 * Sign-in and registration pages stay crawlable so their noindex is seen.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/admin", "/api/", "/dev/"] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
