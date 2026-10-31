import "server-only";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getEnv } from "../env";
import { errors } from "../errors";
import { logger } from "../log";

/**
 * Email delivery behind one interface.
 *  - capture  (development/test only): stored in memory and in .local/mail as
 *             JSON, viewable at /dev/mailbox in development. Never leaves the machine.
 *  - resend / postmark (production): HTTPS API with a server-side key.
 * Production refuses `capture` at configuration time, so mail can't be
 * silently swallowed, and a missing provider fails closed.
 */

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Short label for logs and the dev mailbox, e.g. "verify_email". */
  kind: string;
}

export interface CapturedEmail extends Email {
  id: string;
  at: string;
}

const MAIL_DIR = resolve(".local/mail");
const memory: CapturedEmail[] = [];

type Transport = "capture" | "resend" | "postmark";

function transport(): Transport | null {
  const env = getEnv();
  if (env.EMAIL_TRANSPORT) return env.EMAIL_TRANSPORT;
  return env.APP_ENV === "development" || env.APP_ENV === "test" ? "capture" : null;
}

export const emailConfigured = () => transport() !== null;

const mask = (email: string) => email.replace(/^(.).*?(@.*)$/, "$1***$2");

export async function sendEmail(message: Email): Promise<void> {
  const env = getEnv();
  const t = transport();
  if (!t) throw errors.unavailable("Email isn't available right now.");
  if (t === "capture") {
    if (env.APP_ENV === "production") throw errors.unavailable("Email isn't available right now.");
    const item: CapturedEmail = { ...message, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString() };
    memory.push(item);
    if (env.APP_ENV !== "test") {
      mkdirSync(MAIL_DIR, { recursive: true });
      writeFileSync(join(MAIL_DIR, `${item.id}.json`), JSON.stringify(item, null, 2));
    }
    logger().info({ kind: message.kind, to: mask(message.to) }, "email captured (not sent)");
    return;
  }
  const from = env.EMAIL_FROM!;
  const key = env.EMAIL_API_KEY!;
  const request =
    t === "resend"
      ? fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
          signal: AbortSignal.timeout(10_000),
        })
      : fetch("https://api.postmarkapp.com/email", {
          method: "POST",
          headers: { "x-postmark-server-token": key, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ From: from, To: message.to, Subject: message.subject, HtmlBody: message.html, TextBody: message.text, MessageStream: "outbound" }),
          signal: AbortSignal.timeout(10_000),
        });
  const res = await request.catch((err: unknown) => {
    logger().error({ err, kind: message.kind }, "email provider unreachable");
    return null;
  });
  if (!res?.ok) {
    logger().error({ status: res?.status, kind: message.kind, to: mask(message.to) }, "email provider rejected message");
    throw errors.unavailable("We couldn't send the email. Please try again shortly.");
  }
  logger().info({ kind: message.kind, to: mask(message.to) }, "email sent");
}

/** Development and tests only: captured messages, newest first. */
export function capturedEmails(): CapturedEmail[] {
  const env = getEnv();
  if (env.APP_ENV === "production" || env.APP_ENV === "preview") return [];
  if (env.APP_ENV === "test") return [...memory].reverse();
  try {
    return readdirSync(MAIL_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, 50)
      .map((f) => JSON.parse(readFileSync(join(MAIL_DIR, f), "utf8")) as CapturedEmail);
  } catch {
    return [];
  }
}

/** Tests only. */
export function clearCapturedEmails() {
  memory.length = 0;
}
