import { OG_SIZE, ogImage } from "@/lib/seo/og";

export const alt = "SociVanta — Social Media Services. Simplified.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ eyebrow: "Social media services", title: "Social Media Services. Simplified.", subtitle: "One clear catalog across every major platform, with order tracking in one dashboard." });
}
