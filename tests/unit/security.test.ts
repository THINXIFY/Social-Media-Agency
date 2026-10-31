import { describe, expect, it } from "vitest";
import nextConfig, { CONTENT_SECURITY_POLICY } from "../../next.config";
import { serializeJsonLd } from "@/lib/seo/schema";
import { safeNext } from "@/server/auth/cookies";
import { MAX_BODY_BYTES, route } from "@/server/http";
import { REDACT_PATHS, scrub } from "@/server/log";

/* Phase 5I-A: response headers, redirects, logging and markup escaping. */

describe("security headers (SEC-01)", () => {
  it("applies anti-framing, nosniff, referrer and permissions headers to every path", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*")!;
    const h = Object.fromEntries(all.headers.map((x) => [x.key.toLowerCase(), x.value]));
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["content-security-policy"]).toMatch(/frame-ancestors 'none'/);
    expect(h["content-security-policy"]).toMatch(/object-src 'none'/);
    expect(h["content-security-policy"]).toMatch(/base-uri 'self'/);
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toMatch(/camera=\(\)/);
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});

describe("open redirects", () => {
  it("only follows same-site paths under the expected prefix", () => {
    for (const bad of ["https://evil.example", "//evil.example", String.raw`/dashboard\evil`, "/dashboard\r\nx", "/dashboardx/../../evil".replace("/dashboardx", "//evil"), "/admin", "javascript:alert(1)", null, 42]) expect(safeNext(bad, "/dashboard"), String(bad)).toBe("/dashboard");
    expect(safeNext("/dashboard/orders?x=1", "/dashboard")).toBe("/dashboard/orders?x=1");
  });
});

describe("secrets never reach logs", () => {
  it("masks connection-string passwords and bearer tokens, and redacts secret fields", () => {
    expect(scrub("postgres://user:hunter2@db:5432/x")).toBe("postgres://user:***@db:5432/x");
    expect(scrub("Authorization: Bearer abc.def.ghi")).toBe("Authorization: Bearer ***");
    for (const k of ["password", "token", "apiKey", "secret", "cookie", "ciphertext", "DATABASE_URL"]) expect(REDACT_PATHS, k).toContain(k);
  });
});

describe("structured data can't break out of its script tag", () => {
  it("escapes <, >, & and line separators", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>&\u2028" });
    expect(out).not.toMatch(/<|>|&(?!#)/);
    expect(out).toContain("u003c/script"); // the escaped form of "<"
    expect(JSON.parse(out).name.startsWith("</script>")).toBe(true); // still valid JSON with the same value
  });
});

/* Phase 5I-B: strict nonce CSP on session pages, request-size cap on route handlers. */

describe("tightened CSP (5I-B)", () => {
  const directives = () => Object.fromEntries(CONTENT_SECURITY_POLICY.split("; ").map((d) => [d.split(" ")[0], d.slice(d.indexOf(" ") + 1)]));

  it("blocks inline event handlers and keeps every fetch, image, font, frame and worker on this origin", () => {
    const d = directives();
    expect(d["script-src-attr"]).toBe("'none'");
    for (const k of ["connect-src", "img-src", "font-src", "media-src", "worker-src", "manifest-src"]) expect(d[k], k).toMatch(/^'self'/);
    expect(d["frame-src"]).toBe("'none'");
    for (const k of ["connect-src", "img-src", "font-src", "worker-src"]) expect(d[k].includes("http") || d[k].includes("*"), k).toBe(false);
  });

  it("never allows inline or eval'd scripts by keyword (no script-src that would need 'unsafe-inline')", () => {
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/unsafe-inline|unsafe-eval|strict-dynamic/);
    expect(directives()["script-src"]).toBeUndefined();
  });

  it("is what every response carries", async () => {
    const rules = await nextConfig.headers!();
    const csp = rules.find((r) => r.source === "/:path*")!.headers.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp).toBe(CONTENT_SECURITY_POLICY);
  });
});

describe("request size cap (5I-B, H-02)", () => {
  it("refuses a declared body over 1 MB before the handler reads it", async () => {
    let called = false;
    const handler = route(async () => {
      called = true;
      return Response.json({ ok: true });
    });
    const big = await handler(new Request("http://x/api", { method: "POST", headers: { "content-length": String(MAX_BODY_BYTES + 1) }, body: "{}" }), {});
    expect(big.status).toBe(413);
    expect((await big.json()).error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(called).toBe(false);
    const ok = await handler(new Request("http://x/api", { method: "POST", headers: { "content-length": "2" }, body: "{}" }), {});
    expect(ok.status).toBe(200);
  });
});
