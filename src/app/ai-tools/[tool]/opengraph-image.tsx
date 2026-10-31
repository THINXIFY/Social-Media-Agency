import { AI_TOOL_BY_SLUG, AI_TOOLS } from "@/lib/ai/registry";
import { OG_SIZE, ogImage } from "@/lib/seo/og";

export const alt = "A SociVanta AI tool";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return AI_TOOLS.map((t) => ({ tool: t.slug }));
}

export default async function Image({ params }: { params: Promise<{ tool: string }> }) {
  const tool = AI_TOOL_BY_SLUG[(await params).tool] ?? AI_TOOLS[0];
  return ogImage({ eyebrow: "SociVanta AI", title: tool.name, subtitle: tool.tagline });
}
