import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");

describe("server-only module boundaries", () => {
  const serverFiles = walk(join(ROOT, "src/server"));

  it("every server module (except the plain schema) imports server-only", () => {
    const missing = serverFiles.filter((f) => !rel(f).startsWith("src/server/db/schema/")).filter((f) => !/^import "server-only";/m.test(readFileSync(f, "utf8")));
    expect(missing.map(rel)).toEqual([]);
  });

  it("schema files hold table definitions only — no connections, env or secrets", () => {
    for (const f of serverFiles.filter((x) => rel(x).startsWith("src/server/db/schema/"))) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toMatch(/process\.env|new Pool|from "pg"|drizzle\(/);
    }
  });

  it("client components and shared lib code never import server modules", () => {
    const files = [...walk(join(ROOT, "src/components")), ...walk(join(ROOT, "src/lib")), ...walk(join(ROOT, "src/app"))];
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      const importsServer = /from ["']@\/server|from ["'](\.\.\/)+server/.test(src);
      return importsServer && (/^["']use client["'];/m.test(src) || rel(f).startsWith("src/lib/"));
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it("server actions live in 'use server' modules", () => {
    const actions = walk(join(ROOT, "src/app")).filter((f) => /actions\.ts$/.test(f) || /[\\/]actions[\\/]/.test(f));
    expect(actions.length).toBeGreaterThanOrEqual(3);
    for (const f of actions) expect(readFileSync(f, "utf8"), rel(f)).toMatch(/^"use server";/);
  });

  it("session tokens, MFA secrets and recovery codes never reach browser storage", () => {
    const clientFiles = [...walk(join(ROOT, "src/components")), ...walk(join(ROOT, "src/app"))].filter((f) => /^["']use client["'];/m.test(readFileSync(f, "utf8")));
    for (const f of clientFiles) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toMatch(/(localStorage|sessionStorage)\.setItem\([^)]*(session|token|secret|recovery|mfa|password)/i);
      expect(src, rel(f)).not.toMatch(/document\.cookie\s*=/);
    }
  });

  it("no client-exposed env vars or hard-coded connection strings", () => {
    const files = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "scripts"))];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(SECRET|KEY|TOKEN|PASSWORD|DATABASE)/);
      expect(src, rel(f)).not.toMatch(/postgres(ql)?:\/\/[^$<\s"'`]+:[^$<\s"'`]+@/);
    }
  });

  it(".env.example contains placeholders only", () => {
    const example = readFileSync(join(ROOT, ".env.example"), "utf8");
    const assigned = example
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => l.split("=")[0] + "=" + l.split("=").slice(1).join("="));
    expect(assigned).toEqual(["APP_ENV=development", "APP_URL=http://localhost:3000", "DATABASE_URL=", "DATABASE_POOL_MAX=10", "LOG_LEVEL=info", "AUTH_SECRET=", "DATA_ENCRYPTION_KEY=", "EMAIL_TRANSPORT=capture", "EMAIL_FROM=", "EMAIL_API_KEY=", "DEMO_MODE=false", "TRUST_PROXY_HEADERS=false", "AI_PROVIDER=none", "AI_API_KEY=", "AI_MODEL=claude-opus-5-5", "AI_DAILY_BUDGET_MICROS=0", "AI_TIMEOUT_MS=20000", "AI_ANONYMOUS_ENABLED=false", "AI_GENERATION_ENABLED=false", "AI_DAILY_ALLOWANCES=", "SUPPORT_CONTACT_EMAIL=", "SOCIAL_PROVIDERS_ENABLED=", "SOCIAL_INSTAGRAM_CLIENT_ID=", "SOCIAL_INSTAGRAM_CLIENT_SECRET=", "SOCIAL_FACEBOOK_CLIENT_ID=", "SOCIAL_FACEBOOK_CLIENT_SECRET=", "SOCIAL_TIKTOK_CLIENT_ID=", "SOCIAL_TIKTOK_CLIENT_SECRET=", "SOCIAL_YOUTUBE_CLIENT_ID=", "SOCIAL_YOUTUBE_CLIENT_SECRET=", "SOCIAL_X_CLIENT_ID=", "SOCIAL_X_CLIENT_SECRET=", "SOCIAL_LINKEDIN_CLIENT_ID=", "SOCIAL_LINKEDIN_CLIENT_SECRET=", "SOCIAL_PUBLISHING_ENABLED="]);
  });
});
