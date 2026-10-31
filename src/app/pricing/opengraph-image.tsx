import { OG_SIZE, ogImage } from "@/lib/seo/og";

export const alt = "Sociotix AI plans and pricing — free to start";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ eyebrow: "Sociotix AI · Plans", title: "Free to start. Honest about what's next.", subtitle: "Social media planning and automation today; paid plans not yet announced." });
}
