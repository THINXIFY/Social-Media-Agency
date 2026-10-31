import { clientInfo, requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { createOrder, listOwnOrders } from "@/server/orders/orders";

/** The caller's own orders (newest first). */
export const GET = route(async (request) => {
  const actor = await requireCustomer();
  const p = new URL(request.url).searchParams;
  return privateJson(await listOwnOrders(getDb(), actor.customerId, Object.fromEntries([...p.entries()].filter(([, v]) => v !== ""))));
});

/**
 * Place an order. Refused (503) while checkout is switched off or the service
 * has not passed every eligibility gate, which is the case in every real
 * environment during Phase 5E. Requires an `Idempotency-Key` header.
 */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  const result = await createOrder(getDb(), actor, await request.json().catch(() => ({})), request.headers.get("idempotency-key"), await clientInfo());
  return privateJson(result, { status: result.replayed ? 200 : 201 });
});
