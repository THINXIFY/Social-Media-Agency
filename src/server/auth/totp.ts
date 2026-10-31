import "server-only";
import { randomInt } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";

/** RFC 6238 TOTP (30 s, 6 digits, SHA-1 — what authenticator apps support) via the `otpauth` library. */

export const TOTP_PERIOD = 30;
const ISSUER = "SociVanta";

const totp = (secretBase32: string, label = "staff") => new TOTP({ issuer: ISSUER, label, algorithm: "SHA1", digits: 6, period: TOTP_PERIOD, secret: Secret.fromBase32(secretBase32) });

export const newTotpSecret = () => new Secret({ size: 20 }).base32;

export const totpUri = (secretBase32: string, email: string) => totp(secretBase32, email).toString();

export const totpQrDataUrl = (uri: string) => QRCode.toDataURL(uri, { margin: 1, width: 220, errorCorrectionLevel: "M" });

/** Test helper and enrollment check: the current code for a secret. */
export const currentTotp = (secretBase32: string, timestamp = Date.now()) => totp(secretBase32).generate({ timestamp });

/**
 * Validates a code (±1 step for clock drift) and returns the matched time-step,
 * or null. Callers must reject steps ≤ the factor's last used step (replay).
 */
export function matchTotp(secretBase32: string, code: string, timestamp = Date.now()): number | null {
  const token = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) return null;
  const delta = totp(secretBase32).validate({ token, timestamp, window: 1 });
  if (delta === null) return null;
  return Math.floor(timestamp / 1000 / TOTP_PERIOD) + delta;
}

/* Recovery codes ----------------------------------------------------------- */

export const RECOVERY_CODE_COUNT = 10;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

/** Ten single-use codes like `K7Q2M-9XWAT` (50 bits each). Shown once, stored only as HMACs. */
export function newRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const s = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

/** Normalises user input so `k7q2m 9xwat` matches `K7Q2M-9XWAT`. */
export const normaliseRecoveryCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
