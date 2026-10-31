import { clientInfo, requireStaff } from "@/server/auth";
import { requireRecentReauth } from "@/server/auth/staff";
import type { Db } from "@/server/db/client";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import {
  addOrderNote,
  approveOrder,
  assignOrder,
  cancelOrderByStaff,
  completeOrder,
  failOrder,
  getOrderForStaff,
  recordProgress,
  rejectOrder,
  requestOrderInfo,
  startFulfillment,
} from "@/server/orders/orders";

type Run = (db: Db, staff: { userId: string }, ref: string, body: unknown, client: { ip?: string | null; userAgent?: string | null }) => Promise<unknown>;

/**
 * Staff order actions (all need Orders: Manage). Those that move money or
 * close an order (reject, cancel, fail, complete) also need a fresh
 * re-authentication. Unknown actions are 404.
 */
const ACTIONS: Record<string, { run: Run; reauth: boolean }> = {
  approve: { run: (db, s, r, _b, c) => approveOrder(db, s, r, c), reauth: false },
  "request-info": { run: (db, s, r, b, c) => requestOrderInfo(db, s, r, b, c), reauth: false },
  assign: { run: (db, s, r, b, c) => assignOrder(db, s, r, b, c), reauth: false },
  start: { run: (db, s, r, b, c) => startFulfillment(db, s, r, b, c), reauth: false },
  progress: { run: (db, s, r, b, c) => recordProgress(db, s, r, b, c), reauth: false },
  notes: { run: (db, s, r, b) => addOrderNote(db, s, r, b), reauth: false },
  complete: { run: (db, s, r, b, c) => completeOrder(db, s, r, b, c), reauth: true },
  reject: { run: (db, s, r, b, c) => rejectOrder(db, s, r, b, c), reauth: true },
  cancel: { run: (db, s, r, b, c) => cancelOrderByStaff(db, s, r, b, c), reauth: true },
  fail: { run: (db, s, r, b, c) => failOrder(db, s, r, b, c), reauth: true },
};

export const POST = route<{ params: Promise<{ ref: string; action: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const { ref, action } = await params;
  const def = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : undefined;
  if (!def) throw errors.notFound("That action");
  const actor = await requireStaff("orders:manage");
  if (def.reauth) requireRecentReauth(actor.context.session);
  await def.run(getDb(), actor, ref, await request.json().catch(() => ({})), await clientInfo());
  return privateJson({ order: await getOrderForStaff(getDb(), ref, actor.userId) });
});
