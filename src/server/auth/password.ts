import "server-only";
import { hash, verify } from "@node-rs/argon2";

/**
 * Passwords: argon2id with OWASP's recommended parameters
 * (19 MiB memory, 2 iterations, 1 lane). Hashes embed their parameters, so
 * they can be raised later without breaking existing accounts.
 */
const OPTIONS = { algorithm: 2 /* Argon2id */, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const hashPassword = (password: string) => hash(password, OPTIONS);

let dummy: Promise<string> | null = null;

/**
 * Verifies a password. When there's no account (hash null) it still runs a
 * full argon2 verification so response times don't reveal which emails exist.
 */
export async function verifyPassword(passwordHash: string | null | undefined, password: string): Promise<boolean> {
  if (!passwordHash) {
    dummy ??= hashPassword("dummy-password-for-timing");
    await verify(await dummy, password).catch(() => false);
    return false;
  }
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

const COMMON = new Set([
  "password123",
  "password1234",
  "1234567890",
  "12345678910",
  "qwertyuiop",
  "1q2w3e4r5t",
  "iloveyou123",
  "passw0rd123",
  "administrator",
  "letmein1234",
  "welcome123",
  "abc1234567",
  "sociotix123",
  "socivanta123",
]);

/** Returns a user-facing problem, or null when the password is acceptable. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return "That password is too easy to guess.";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "Don't include your email address in your password.";
  return null;
}
