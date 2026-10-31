import type { Metadata } from "next";
import { PRICING_DESCRIPTION, PRICING_FAQ, PRICING_TITLE, PricingPage } from "@/components/ai-workspace/pricing";
import { JsonLd } from "@/components/seo/json-ld";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { AI_ROUTES } from "@/lib/ai/workspace";
import { breadcrumbs, faqPage, graph, webPage } from "@/lib/seo/schema";
import { SITE } from "@/lib/seo/site";

const SOCIAL_TITLE = "Sociotix AI plans — free to start";
const SOCIAL_DESCRIPTION = "Start free with social media planning and automation. Pro and Business are proposed, with pricing not yet announced.";

export const metadata: Metadata = {
  title: { absolute: PRICING_TITLE },
  description: PRICING_DESCRIPTION,
  alternates: { canonical: AI_ROUTES.pricing },
  openGraph: { type: "website", url: AI_ROUTES.pricing, siteName: SITE.name, title: SOCIAL_TITLE, description: SOCIAL_DESCRIPTION },
  twitter: { card: "summary_large_image", title: SOCIAL_TITLE, description: SOCIAL_DESCRIPTION },
};

export default function Pricing() {
  return (
    <>
      <Header page="other" />
      <main id="main">
        <PricingPage />
      </main>
      <Footer page="other" />
      {/* No Offer or Product markup: paid prices aren't announced. The FAQ matches the visible answers word for word. */}
      <JsonLd
        data={graph(
          webPage({ path: AI_ROUTES.pricing, name: PRICING_TITLE, description: PRICING_DESCRIPTION }),
          breadcrumbs([
            { name: SITE.name, path: "/" },
            { name: SITE.aiName, path: "/ai-tools" },
            { name: "Plans & Pricing", path: AI_ROUTES.pricing },
          ]),
          faqPage(PRICING_FAQ),
        )}
      />
    </>
  );
}
