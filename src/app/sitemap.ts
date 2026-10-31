import type { MetadataRoute } from "next";
import { isIndexableTool } from "@/lib/ai/guides";
import { AI_TOOLS, aiToolHref } from "@/lib/ai/registry";
import { AI_ROUTES } from "@/lib/ai/workspace";
import { HELP_ARTICLES, helpHref } from "@/lib/help/articles";
import { SOCIAL_ROUTES } from "@/lib/social/platforms";
import { absoluteUrl } from "@/lib/seo/site";

/**
 * XML sitemap (SEO-01): only canonical, indexable public pages. Tool pages
 * without a guide are noindex and left out. No lastmod, changefreq or
 * priority: Google ignores the latter two, and lastmod is only useful when
 * it's accurate.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const tools = AI_TOOLS.filter((t) => isIndexableTool(t.id)).map((t) => aiToolHref(t));
  return ["/", "/ai-tools", ...tools, SOCIAL_ROUTES.landing, AI_ROUTES.pricing, "/help", ...HELP_ARTICLES.map((a) => helpHref(a.slug))].map((path) => ({ url: absoluteUrl(path) }));
}
