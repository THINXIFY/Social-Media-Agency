import type { Metadata, Viewport } from "next";
import { Inter, Manrope, Noto_Sans_Arabic } from "next/font/google";
import { Providers } from "@/components/providers";
import { SITE, siteOrigin } from "@/lib/seo/site";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

/** Arabic and Urdu in the dashboard. Not preloaded: the browser only fetches it when those scripts appear. */
const arabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  // Canonical, Open Graph and sitemap URLs resolve against APP_URL (never localhost in production).
  metadataBase: new URL(siteOrigin()),
  applicationName: SITE.name,
  title: "SociVanta — Social Media Services. Simplified.",
  description:
    "Discover social media services across all major platforms. Explore solutions, manage orders, and track progress from one dashboard.",
  openGraph: { type: "website", siteName: SITE.name, locale: SITE.locale },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8F9FC" },
    { media: "(prefers-color-scheme: dark)", color: "#0E0F13" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${inter.variable} ${manrope.variable} ${arabic.variable} h-full`}
    >
      {/* Browser extensions (e.g. ColorZilla's cz-shortcut-listen) inject attributes on <body> before hydration. */}
      <body className="min-h-full" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
