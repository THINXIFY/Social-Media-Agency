import type { Metadata } from "next";
import { AI_FAQ, AiLanding } from "@/components/ai/landing";
import { JsonLd } from "@/components/seo/json-ld";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { isIndexableTool } from "@/lib/ai/guides";
import { AI_TOOLS, aiToolHref } from "@/lib/ai/registry";
import { breadcrumbs, faqPage, graph, itemList, webPage } from "@/lib/seo/schema";
import { SITE } from "@/lib/seo/site";

const TITLE = "AI Social Media Tools for Content Creators | SociVanta AI";
const DESCRIPTION =
  "AI tools for social media content: a caption generator, hashtag and keyword finder, post ideas and a content calendar, shaped for each platform. Launching in stages.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/ai-tools" },
  openGraph: { type: "website", url: "/ai-tools", siteName: SITE.name, title: "SociVanta AI — AI Tools for Social Media", description: "Turn a quick idea into captions, hashtags, post ideas and a posting plan — shaped for each platform." },
  twitter: { card: "summary_large_image", title: "SociVanta AI — AI Tools for Social Media", description: "Turn a quick idea into captions, hashtags, post ideas and a posting plan — shaped for each platform." },
};

export default function AiToolsPage() {
  const guided = AI_TOOLS.filter((t) => isIndexableTool(t.id)).map((t) => ({ name: t.name, path: aiToolHref(t) }));
  return (
    <>
      <Header page="ai" />
      <main id="main">
        <AiLanding />
      </main>
      <Footer page="ai" />
      {/* Matches the visible page: the FAQ answers word for word, and the Content Studio tools it links to. */}
      <JsonLd
        data={graph(
          webPage({ path: "/ai-tools", name: TITLE, description: DESCRIPTION, type: "CollectionPage" }),
          breadcrumbs([
            { name: SITE.name, path: "/" },
            { name: SITE.aiName, path: "/ai-tools" },
          ]),
          itemList("SociVanta AI Content Studio tools", guided),
          faqPage(AI_FAQ.map((f) => ({ q: f.q, a: f.a }))),
        )}
      />
    </>
  );
}
