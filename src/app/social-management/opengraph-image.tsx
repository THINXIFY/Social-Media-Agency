import { OG_SIZE, ogImage } from "@/lib/seo/og";

export const alt = "SociVanta Social Management — one workspace for your social media accounts";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ eyebrow: "SociVanta AI · Social Management", title: "Your social media. One smarter workspace.", subtitle: "A calm, read-only dashboard for the accounts you manage." });
}
