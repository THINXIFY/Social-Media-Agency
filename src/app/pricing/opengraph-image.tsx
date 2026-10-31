import { OG_SIZE, ogImage } from "@/lib/seo/og";

export const alt = "SociVanta AI plans and pricing — free to start";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ eyebrow: "SociVanta AI · Plans", title: "Free to start. Honest about what's next.", subtitle: "Social media planning and automation today; paid plans not yet announced." });
}
