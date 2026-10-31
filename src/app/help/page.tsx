import type { Metadata } from "next";
import { HELP_DESCRIPTION, HELP_TITLE, HelpCenter, popularArticles } from "@/components/help/help-center";
import { JsonLd } from "@/components/seo/json-ld";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { breadcrumbs, faqPage, graph, webPage } from "@/lib/seo/schema";
import { SITE } from "@/lib/seo/site";

const SOCIAL = { title: "Sociotix Help Center", description: "Answers about orders, your wallet, account security, AI tools and the social workspace, plus support tickets." };

export const metadata: Metadata = {
  title: { absolute: HELP_TITLE },
  description: HELP_DESCRIPTION,
  alternates: { canonical: "/help" },
  openGraph: { type: "website", url: "/help", siteName: SITE.name, ...SOCIAL },
  twitter: { card: "summary_large_image", ...SOCIAL },
};

export default function HelpPage() {
  return (
    <>
      <Header page="other" />
      <main id="main">
        <HelpCenter />
      </main>
      <Footer page="other" />
      {/* The FAQ entries are the popular questions shown on the page, with the same short answers. */}
      <JsonLd
        data={graph(
          webPage({ path: "/help", name: HELP_TITLE, description: HELP_DESCRIPTION, type: "CollectionPage" }),
          breadcrumbs([
            { name: SITE.name, path: "/" },
            { name: "Help Center", path: "/help" },
          ]),
          faqPage(popularArticles().map((a) => ({ q: a.title, a: a.answer }))),
        )}
      />
    </>
  );
}
