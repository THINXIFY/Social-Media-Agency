import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getEnv } from "../env";
import { errors } from "../errors";

/**
 * Small wrappers over Node's crypto. Nothing here invents cryptography:
 * random tokens, SHA-256, HMAC-SHA256 and AES-256-GCM only.
 */

/** URL-safe random token (256 bits by default). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** Session and email tokens are stored as SHA-256; the raw token only lives in the cookie or link. */
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function keys() {
  const env = getEnv();
  if (!env.AUTH_SECRET || !env.DATA_ENCRYPTION_KEY) throw errors.unavailable("Sign-in isn't available right now.");
  return { auth: Buffer.from(env.AUTH_SECRET, "base64"), data: Buffer.from(env.DATA_ENCRYPTION_KEY, "base64").subarray(0, 32) };
}

/** True when the auth secrets are configured. Auth features fail closed without them. */
export function authConfigured() {
  try {
    keys();
    return true;
  } catch {
    return false;
  }
}

/** Keyed hash for low-entropy values (recovery codes, rate-limit subjects) so a database leak doesn't reveal them. */
export const hmac = (value: string) => createHmac("sha256", keys().auth).update(value).digest("hex");

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys().data, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw errors.ledger("Unreadable encrypted value.");
  const decipher = createDecipheriv("aes-256-gcm", keys().data, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
