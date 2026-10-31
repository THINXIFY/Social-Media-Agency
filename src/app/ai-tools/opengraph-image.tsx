import { OG_SIZE, ogImage } from "@/lib/seo/og";

export const alt = "Sociotix AI — AI tools for social media content";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ eyebrow: "Sociotix AI", title: "Create smarter. Grow further.", subtitle: "Captions, hashtags, post ideas and a posting plan — shaped for each platform." });
}
