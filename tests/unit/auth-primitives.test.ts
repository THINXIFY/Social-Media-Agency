import { afterEach, describe, expect, it, vi } from "vitest";
import { safeNext } from "@/server/auth/cookies";
import { decrypt, encrypt, hmac, randomToken, sha256 } from "@/server/auth/crypto";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/auth/password";
import { cookieName, cookieOptions } from "@/server/auth/sessions";
import { currentTotp, matchTotp, newRecoveryCodes, newTotpSecret, normaliseRecoveryCode, TOTP_PERIOD } from "@/server/auth/totp";
import { resetEnvCache } from "@/server/env";

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("passwords", () => {
  it("hashes with argon2id and verifies", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(h, "correct horse battery")).toBe(true);
    expect(await verifyPassword(h, "wrong horse battery")).toBe(false);
    expect(await verifyPassword(null, "anything")).toBe(false);
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });

  it("enforces a sensible policy", () => {
    expect(passwordProblem("short")).toMatch(/at least 10/);
    expect(passwordProblem("a".repeat(129))).toMatch(/at most 128/);
    expect(passwordProblem("password123")).toMatch(/too easy/);
    expect(passwordProblem("aaaaaaaaaaaa")).toMatch(/too easy/);
    expect(passwordProblem("farhan-is-great-2026", "farhan@example.com")).toMatch(/email/);
    expect(passwordProblem("a calm violet morning")).toBeNull();
  });
});

describe("crypto helpers", () => {
  it("tokens are 256-bit, url-safe and stored only as hashes", () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sha256(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256(t)).not.toContain(t);
  });

  it("AES-256-GCM round-trips and detects tampering", () => {
    const sealed = encrypt("JBSWY3DPEHPK3PXP");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decrypt(sealed)).toBe("JBSWY3DPEHPK3PXP");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered!").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
    expect(encrypt("x")).not.toBe(encrypt("x")); // fresh IV each time
  });

  it("HMAC depends on the secret", () => {
    expect(hmac("ABCDE12345")).toMatch(/^[0-9a-f]{64}$/);
    expect(hmac("ABCDE12345")).not.toBe(sha256("ABCDE12345"));
  });

  it("fails closed without secrets", () => {
    vi.stubEnv("AUTH_SECRET", "");
    resetEnvCache();
    expect(() => hmac("x")).toThrow(/Sign-in isn't available/);
  });
});

describe("TOTP and recovery codes", () => {
  it("accepts the current code and ±1 step, returning the matched step", () => {
    const secret = newTotpSecret();
    const now = Date.now();
    const step = Math.floor(now / 1000 / TOTP_PERIOD);
    expect(matchTotp(secret, currentTotp(secret, now), now)).toBe(step);
    expect(matchTotp(secret, currentTotp(secret, now + TOTP_PERIOD * 1000), now)).toBe(step + 1);
    expect(matchTotp(secret, currentTotp(secret, now - 5 * TOTP_PERIOD * 1000), now)).toBeNull();
    expect(matchTotp(secret, "12345", now)).toBeNull();
    expect(matchTotp(secret, "abcdef", now)).toBeNull();
  });

  it("recovery codes are unique, unambiguous and normalised", () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    expect(normaliseRecoveryCode(" k7q2m 9xwat ")).toBe("K7Q2M9XWAT");
  });
});

describe("cookies and redirects", () => {
  it("session cookies are HttpOnly, SameSite=Lax; __Host- and Secure when deployed", () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    resetEnvCache();
    expect(cookieName("customer")).toBe("sv_session");
    expect(cookieOptions(new Date())).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: false });
    vi.stubEnv("APP_URL", "https://app.example.com");
    resetEnvCache();
    expect(cookieName("customer")).toBe("__Host-sv_session");
    expect(cookieName("staff")).toBe("__Host-sv_staff");
    expect(cookieOptions(new Date()).secure).toBe(true);
  });

  it("only allows in-app redirect targets", () => {
    expect(safeNext("/dashboard/orders", "/dashboard")).toBe("/dashboard/orders");
    expect(safeNext("https://evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeNext("//evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeNext("/admin", "/dashboard")).toBe("/dashboard");
    expect(safeNext("/dashboard\\@evil", "/dashboard")).toBe("/dashboard");
    expect(safeNext(undefined, "/admin")).toBe("/admin");
  });
});
