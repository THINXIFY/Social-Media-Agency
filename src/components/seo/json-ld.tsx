import { serializeJsonLd } from "@/lib/seo/schema";

/** Server-rendered JSON-LD. Build the data with the helpers in `@/lib/seo/schema`. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
