import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { type LandingAvailability, SOCIAL_DESCRIPTION, SOCIAL_TITLE, SocialLanding, socialFaq } from "@/components/social/landing";
import { SOCIAL_PROVIDER_IDS, SOCIAL_ROUTES } from "@/lib/social/platforms";
import { breadcrumbs, faqPage, graph, webPage } from "@/lib/seo/schema";
import { SITE } from "@/lib/seo/site";
import { getEnv } from "@/server/env";
import { providerAvailability } from "@/server/social/service";

export const metadata: Metadata = {
  title: { absolute: SOCIAL_TITLE },
  description: SOCIAL_DESCRIPTION,
  alternates: { canonical: SOCIAL_ROUTES.landing },
  openGraph: { type: "website", url: SOCIAL_ROUTES.landing, siteName: SITE.name, title: "SociVanta Social Management — One workspace for your accounts", description: "Bring the social accounts you manage together in one calm, read-only dashboard." },
  twitter: { card: "summary_large_image", title: "SociVanta Social Management — One workspace for your accounts", description: "Bring the social accounts you manage together in one calm, read-only dashboard." },
};

/** Which platforms can really be connected, from the server's configuration at build time (rebuild after switching one on). */
function readiness(): LandingAvailability {
  let env: ReturnType<typeof getEnv> | null = null;
  try {
    env = getEnv();
  } catch {
    env = null;
  }
  return Object.fromEntries(SOCIAL_PROVIDER_IDS.map((id) => [id, env ? providerAvailability(env, id).state === "available" : false])) as LandingAvailability;
}

export default function SocialManagementPage() {
  const ready = readiness();
  return (
    <>
      <Header page="other" />
      <main id="main">
        <SocialLanding ready={ready} />
      </main>
      <Footer page="other" />
      {/* Matches the visible page: the FAQ answers word for word. No WebApplication: connections aren't live yet. */}
      <JsonLd
        data={graph(
          webPage({ path: SOCIAL_ROUTES.landing, name: SOCIAL_TITLE, description: SOCIAL_DESCRIPTION }),
          breadcrumbs([
            { name: SITE.name, path: "/" },
            { name: SITE.aiName, path: "/ai-tools" },
            { name: "Social Management", path: SOCIAL_ROUTES.landing },
          ]),
          faqPage(socialFaq(ready)),
        )}
      />
    </>
  );
}
