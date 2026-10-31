import { OG_SIZE, ogImage } from "@/lib/seo/og";

export const alt = "SociVanta AI — AI tools for social media content";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ eyebrow: "SociVanta AI", title: "Create smarter. Grow further.", subtitle: "Captions, hashtags, post ideas and a posting plan — shaped for each platform." });
}
