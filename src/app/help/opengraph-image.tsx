import { OG_SIZE, ogImage } from "@/lib/seo/og";

export const alt = "Sociotix Help Center: answers, guides and support";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ eyebrow: "Sociotix · Help Center", title: "How can we help you?", subtitle: "Answers about orders, your wallet, AI tools and support tickets." });
}
