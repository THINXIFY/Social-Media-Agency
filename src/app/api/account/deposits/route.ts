import { clientInfo, requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { createDeposit, listOwnDeposits } from "@/server/payments/deposits";

/** The caller's own deposit requests (newest first). */
export const GET = route(async (request) => {
  const actor = await requireCustomer();
  const p = new URL(request.url).searchParams;
  return privateJson(await listOwnDeposits(getDb(), actor.customerId, Number(p.get("page") ?? 1), Number(p.get("pageSize") ?? 20)));
});

/**
 * Create a deposit request (never a payment, never a balance change).
 * Requires an `Idempotency-Key` header; a retry returns the original request.
 */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  const result = await createDeposit(getDb(), actor, await request.json().catch(() => ({})), request.headers.get("idempotency-key"), await clientInfo());
  return privateJson(result, { status: result.replayed ? 200 : 201 });
});
