import { OG_SIZE, ogImage } from "@/lib/seo/og";

export const alt = "Sociotix Social Management — one workspace for your social media accounts";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ eyebrow: "Sociotix AI · Social Management", title: "Your social media. One smarter workspace.", subtitle: "A calm, read-only dashboard for the accounts you manage." });
}
