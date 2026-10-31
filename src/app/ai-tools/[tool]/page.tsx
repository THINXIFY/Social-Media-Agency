import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { LiveAvailabilityBadge } from "@/components/ai/live-badge";
import { FAMILY, ToolGlyph } from "@/components/ai/parts";
import { RelatedToolsSection, ToolGuideSection } from "@/components/ai/tool-guide";
import { AssistantChat } from "@/components/ai/assistant-chat";
import { OrderExplainer } from "@/components/ai/order-explanation";
import { ServiceSearch } from "@/components/ai/service-search";
import { AiWorkspace } from "@/components/ai/workspace";
import { JsonLd } from "@/components/seo/json-ld";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { isIndexableTool, TOOL_GUIDES } from "@/lib/ai/guides";
import { AI_TOOL_BY_SLUG, AI_TOOLS, type AiTool, aiToolHref } from "@/lib/ai/registry";
import { breadcrumbs, faqPage, graph, webApplication, webPage } from "@/lib/seo/schema";
import { SITE } from "@/lib/seo/site";
import { cn } from "@/lib/utils";
import { effectiveAvailability } from "@/server/ai/run";

export function generateStaticParams() {
  return AI_TOOLS.map((t) => ({ tool: t.slug }));
}

/** Whether the tool really runs right now (server state at render; pages are rebuilt when it changes). */
const isLive = (tool: AiTool) => effectiveAvailability(tool) === "available";

/** Availability clause for descriptions: never claims generation that isn't switched on. */
const availabilityNote = (tool: AiTool) => (isLive(tool) ? `Free with a Sociotix account${tool.free ? ` — ${tool.free.signedInPerDay} runs a day` : ""}.` : "Coming soon to Sociotix AI.");

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }): Promise<Metadata> {
  const tool = AI_TOOL_BY_SLUG[(await params).tool];
  if (!tool) return {};
  const guide = TOOL_GUIDES[tool.id];
  const path = aiToolHref(tool);
  const title = guide?.seoTitle ?? `${tool.name} — Sociotix AI`;
  const description = guide ? `${guide.metaDescription} ${availabilityNote(tool)}` : `${tool.tagline} ${tool.description}`.slice(0, 300);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    // Tools without a guide are thin "coming soon" pages: keep them out of the index (links still followed) until they offer real value.
    robots: isIndexableTool(tool.id) ? undefined : { index: false, follow: true },
    openGraph: { type: "website", url: path, siteName: SITE.name, title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

const wrap = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";

/**
 * Tool pages block rather than stream: every known tool is fully prerendered
 * (generateStaticParams), so the complete page — header, workspace and guide —
 * is the first paint. A streamed skeleton here caused a visible layout shift.
 */
export const instant = false;

export default async function AiToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const tool = AI_TOOL_BY_SLUG[(await params).tool];
  if (!tool) notFound();
  const family = FAMILY[tool.category];
  const guide = TOOL_GUIDES[tool.id];
  const live = isLive(tool);
  const path = aiToolHref(tool);
  const examples = guide?.examples.map((e) => ({ title: e.title, fill: e.fill })) ?? [];
  const familyTools = AI_TOOLS.filter((t) => t.category === tool.category && t.id !== tool.id);
  const allowance = tool.free ? (live ? `${tool.free.signedInPerDay} free runs a day` : `${tool.free.signedInPerDay} runs a day · planned`) : null;

  return (
    <>
      <Header page="ai" />
      <main id="main">
        {/* Compact tool header: just enough to orient, then straight into the tool. */}
        <section className="relative isolate" aria-labelledby="tool-title">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 overflow-hidden" aria-hidden>
            <div className={cn("absolute -top-40 left-1/2 h-80 w-[56rem] -translate-x-1/2 rounded-full", tool.category === "growth" ? "bg-[radial-gradient(closest-side,rgb(200_255_82/0.14),transparent)]" : "bg-[radial-gradient(closest-side,rgb(112_71_235/0.13),transparent)] dark:bg-[radial-gradient(closest-side,rgb(112_71_235/0.26),transparent)]")} />
          </div>
          <div className={cn(wrap, "pt-5 pb-6 sm:pt-7 sm:pb-8")}>
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-1 text-[0.8rem] text-muted-foreground">
                <li>
                  <Link href="/ai-tools" className="rounded hover:text-foreground">
                    Sociotix AI
                  </Link>
                </li>
                <ChevronRight className="size-3" aria-hidden />
                <li>
                  <Link href="/ai-tools#tools" className="rounded hover:text-foreground">
                    {family.name}
                  </Link>
                </li>
                <ChevronRight className="size-3" aria-hidden />
                <li aria-current="page" className="text-foreground/80">
                  {tool.name}
                </li>
              </ol>
            </nav>
            <div className="mt-4 flex flex-col gap-4 sm:mt-5 md:flex-row md:items-end md:justify-between md:gap-8">
              <div className="flex items-center gap-4">
                <ToolGlyph tool={tool} size="lg" className="sm:size-14 sm:rounded-[1.1rem]" />
                <div className="min-w-0">
                  <h1 id="tool-title" className="font-heading text-[1.85rem] leading-[1.05] font-extrabold tracking-[-0.035em] text-balance sm:text-[2.5rem]">
                    {tool.name}
                  </h1>
                  <p className="mt-1.5 text-[0.98rem] leading-relaxed text-muted-foreground sm:text-[1.05rem]">{tool.tagline}</p>
                </div>
              </div>
              <ul className="flex flex-wrap items-center gap-2 md:justify-end" aria-label="About this tool">
                <li>
                  <LiveAvailabilityBadge tool={tool} />
                </li>
                {allowance ? <li className="inline-flex h-6 items-center rounded-full border bg-card px-2.5 text-[0.72rem] font-medium text-muted-foreground">{allowance}</li> : null}
                {tool.auth === "account" ? <li className="inline-flex h-6 items-center rounded-full border bg-card px-2.5 text-[0.72rem] font-medium text-muted-foreground">Free account</li> : null}
              </ul>
            </div>
          </div>
        </section>

        <div className={cn(wrap, "pb-16 sm:pb-24")}>
          {tool.id === "assistant" || tool.id === "support-assistant" ? (
            <AssistantChat tool={tool} examples={examples} />
          ) : tool.id === "order-explanation" ? (
            <OrderExplainer tool={tool} />
          ) : tool.id === "service-search" ? (
            <ServiceSearch tool={tool} />
          ) : (
            <AiWorkspace tool={tool} examples={examples} />
          )}

          {guide ? <ToolGuideSection tool={tool} guide={guide} /> : null}

          <RelatedToolsSection tool={tool} guide={guide} others={familyTools} />
        </div>
      </main>
      <Footer page="ai" />
      <JsonLd
        data={graph(
          webPage({ path, name: guide?.seoTitle ?? tool.name, description: guide?.metaDescription ?? tool.description }),
          breadcrumbs([
            { name: SITE.name, path: "/" },
            { name: SITE.aiName, path: "/ai-tools" },
            { name: tool.name, path },
          ]),
          ...(guide ? [faqPage(guide.faqs)] : []),
          // Only a tool that genuinely works is described as an application.
          ...(guide && live ? [webApplication({ path, name: tool.name, description: guide.metaDescription, featureList: guide.options.map((o) => `${o.name}: ${o.detail}`) })] : []),
        )}
      />
    </>
  );
}

