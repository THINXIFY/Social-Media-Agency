import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy (5I-A baseline, tightened in 5I-B). No framing, plugins or <base>
 * hijacking; forms post only here; no inline event handlers (script-src-attr); and fetches,
 * images, fonts, media, frames and workers stay on this origin, so injected code can't load
 * from or send data to another site.
 *
 * There is deliberately no script-src: a nonce policy can't cover the prerendered (PPR)
 * shells that cacheComponents serves, so it would block Next.js's own bootstrap scripts
 * (verified in 5I-B). See docs/backend/PHASE_5I_B_LAUNCH_READINESS_REPORT.md, section D.
 */
export const CONTENT_SECURITY_POLICY = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "script-src-attr 'none'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

/** Security headers for every response. HSTS is sent only from production builds. */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // Help articles renamed with the SociVanta → Sociotix rebrand: old links land on the same article.
  async redirects() {
    return [
      { source: "/help/what-is-socivanta", destination: "/help/what-is-sociotix", permanent: true },
      { source: "/help/what-are-socivanta-ai-tools", destination: "/help/what-are-sociotix-ai-tools", permanent: true },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
