import { HELP_ARTICLE_BY_SLUG, HELP_ARTICLES, HELP_CATEGORIES } from "@/lib/help/articles";
import { OG_SIZE, ogImage } from "@/lib/seo/og";

export const alt = "A SociVanta Help Center article";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const a = HELP_ARTICLE_BY_SLUG[(await params).slug] ?? HELP_ARTICLES[0];
  const cat = HELP_CATEGORIES.find((c) => c.id === a.category)?.name ?? "Help Center";
  return ogImage({ eyebrow: `SociVanta Help · ${cat}`, title: a.title, subtitle: a.answer.length > 110 ? `${a.answer.slice(0, 107)}…` : a.answer });
}
