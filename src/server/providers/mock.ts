import "server-only";
import { ProviderCallError, type ProviderAdapter, type SubmitRequest } from "./adapter";

/*
 * A scriptable in-memory adapter for tests only (Phase 5F). It is never
 * registered in ADAPTERS, makes no network calls and holds no credentials.
 */

export type MockBehaviour = "ok" | "reject" | "unavailable" | "timeout" | "garbage" | "accept_then_drop";

export function createMockAdapter(opts: { needsCredential?: boolean } = {}) {
  const orders = new Map<string, { providerOrderId: string; status: string; delivered: number | null; quantity: number }>();
  const calls = { health: 0, submit: 0, status: 0, lookup: 0 };
  const seen: { credential: string | null }[] = [];
  let next: MockBehaviour = "ok";
  let counter = 0;

  const misbehave = async (b: MockBehaviour, signal: AbortSignal) => {
    if (b === "reject") throw new ProviderCallError("rejected", "Refused by the provider.", "invalid_link");
    if (b === "unavailable") throw new ProviderCallError("unavailable", "Provider busy.", "http_503");
    if (b === "timeout") await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
  };

  const adapter: ProviderAdapter = {
    id: "mock",
    name: "Test provider (mock)",
    capabilities: { submit: true, status: true, lookupByKey: true, balance: true },
    needsCredential: opts.needsCredential ?? true,
    async health(ctx) {
      calls.health++;
      seen.push({ credential: ctx.credential });
      await misbehave(next, ctx.signal);
      return next === "garbage" ? { nope: true } : { ok: true, balanceCents: 12_345 };
    },
    async submit(req: SubmitRequest, ctx) {
      calls.submit++;
      seen.push({ credential: ctx.credential });
      const existing = orders.get(req.idempotencyKey);
      if (existing) return { providerOrderId: existing.providerOrderId, status: existing.status };
      await misbehave(next, ctx.signal);
      const o = { providerOrderId: `MOCK-${++counter}`, status: "Pending", delivered: null, quantity: req.quantity };
      orders.set(req.idempotencyKey, o);
      // The provider accepted the order, but the reply never arrives.
      if (next === "accept_then_drop") throw new Error("socket hang up");
      if (next === "garbage") return { weird: "reply" };
      return { providerOrderId: o.providerOrderId, status: o.status };
    },
    async status(providerOrderId, ctx) {
      calls.status++;
      await misbehave(next, ctx.signal);
      const o = [...orders.values()].find((x) => x.providerOrderId === providerOrderId);
      if (!o) throw new ProviderCallError("rejected", "Unknown order.", "not_found");
      return { providerOrderId, status: o.status, delivered: o.delivered };
    },
    async lookup(idempotencyKey, ctx) {
      calls.lookup++;
      await misbehave(next, ctx.signal);
      const o = orders.get(idempotencyKey);
      return o ? { providerOrderId: o.providerOrderId, status: o.status, delivered: o.delivered } : null;
    },
  };

  return {
    adapter,
    calls,
    seen,
    orders,
    /** The behaviour of the next calls until changed. */
    behave(b: MockBehaviour) {
      next = b;
    },
    /** Simulates the provider moving an order along. */
    progress(providerOrderId: string, status: string, delivered: number | null = null) {
      const o = [...orders.values()].find((x) => x.providerOrderId === providerOrderId);
      if (o) Object.assign(o, { status, delivered });
    },
  };
}
