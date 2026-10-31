import { OG_SIZE, ogImage } from "@/lib/seo/og";

export const alt = "Sociotix — Smarter Social. Bigger Impact.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ eyebrow: "Social growth & marketing", title: "Smarter Social. Bigger Impact.", subtitle: "One clear catalog across every major platform, with order tracking in one dashboard." });
}
