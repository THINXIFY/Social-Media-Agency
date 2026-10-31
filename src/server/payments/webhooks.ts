import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Payment webhook verification architecture (Phase 5D).
 *
 * No processor is approved or connected, so every webhook is refused before
 * its body is trusted or stored (fail closed). When a processor is approved,
 * it gets an adapter here that supplies its signing secret and event parser;
 * the shared checks below stay the same:
 *  - HMAC-SHA256 over `${timestamp}.${rawBody}`, compared in constant time;
 *  - timestamps outside a 5-minute window are rejected (replay window);
 *  - `payment_webhook_events (processor, event_id)` is unique, so a replayed
 *    event inside the window is recorded once and processed once;
 *  - a verified event can only move a deposit along the database-enforced
 *    state machine, and credits go through the same idempotent ledger posting.
 */

export const WEBHOOK_TOLERANCE_SECONDS = 300;

export interface ProcessorAdapter {
  processor: string;
  /** Signing secret from the environment; missing means the adapter is unusable. */
  secret: () => string | null;
}

/** Approved, built processor adapters. Empty until a processor is approved (OPEN_DECISIONS D3). */
export const ADAPTERS: Record<string, ProcessorAdapter> = {};

export type SignatureCheck = { ok: true } | { ok: false; reason: "missing" | "malformed" | "stale" | "mismatch" };

/** Verifies `t=<unix seconds>,v1=<hex hmac>` against the raw request body. */
export function verifySignature(rawBody: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): SignatureCheck {
  if (!header) return { ok: false, reason: "missing" };
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const sig = parts.v1;
  if (!Number.isInteger(t) || !sig || !/^[0-9a-f]{64}$/i.test(sig)) return { ok: false, reason: "malformed" };
  if (Math.abs(nowSeconds - t) > WEBHOOK_TOLERANCE_SECONDS) return { ok: false, reason: "stale" };
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  const given = Buffer.from(sig, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected) ? { ok: true } : { ok: false, reason: "mismatch" };
}

/** Signs a body the same way (for tests and future adapter fixtures). */
export function signPayload(rawBody: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")}`;
}

/** Which adapter, if any, may handle this processor right now. */
export function adapterFor(processor: string): ProcessorAdapter | null {
  const a = Object.hasOwn(ADAPTERS, processor) ? ADAPTERS[processor] : undefined;
  return a && a.secret() ? a : null;
}
