import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { Header } from "@/components/site/header";
import { Hero } from "@/components/site/hero";
import { Platforms } from "@/components/site/platforms";
import { Marketplace } from "@/components/site/marketplace";
import { HowItWorks } from "@/components/site/how-it-works";
import { OrderTracking } from "@/components/site/order-tracking";
import { DashboardPreview } from "@/components/site/dashboard-preview";
import { WhyChoose } from "@/components/site/why-choose";
import { MoreSolutions } from "@/components/site/more-solutions";
import { Faq } from "@/components/site/faq";
import { FinalCta } from "@/components/site/final-cta";
import { Footer } from "@/components/site/footer";
import { CATALOG_TOTALS } from "@/lib/catalog";
import { graph, organization, webPage, website } from "@/lib/seo/schema";
import { SITE } from "@/lib/seo/site";

const TITLE = "Sociotix — Social Media Services for Every Major Platform";
const DESCRIPTION = `Browse ${CATALOG_TOTALS.services} listed social media services across ${CATALOG_TOTALS.platforms} platforms in one clear catalog — audience, engagement, views and more — with order tracking in one dashboard.`;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: "/", siteName: SITE.name, title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Platforms />
        <Marketplace />
        <HowItWorks />
        <OrderTracking />
        <DashboardPreview />
        <WhyChoose />
        <MoreSolutions />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <JsonLd data={graph(organization(), website(), webPage({ path: "/", name: TITLE, description: DESCRIPTION }))} />
    </>
  );
}
