import { ImageResponse } from "next/og";

/** Shared 1200×630 social-sharing image (SEO-01): brand mark, eyebrow, title and one line. No claims beyond the page's own copy. */
export const OG_SIZE = { width: 1200, height: 630 };

export function ogImage({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", background: "radial-gradient(circle at 85% 10%, #3b2a7a 0%, #141519 55%)", color: "#ffffff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: "#7047eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, fontWeight: 800 }}>S</div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>
            Socio<span style={{ color: "#b9a6ff" }}>tix</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase", color: "#c8ff52" }}>{eyebrow}</div>
          <div style={{ marginTop: 18, fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxWidth: 1000 }}>{title}</div>
          <div style={{ marginTop: 22, fontSize: 32, lineHeight: 1.35, color: "rgba(255,255,255,0.72)", maxWidth: 960 }}>{subtitle}</div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
