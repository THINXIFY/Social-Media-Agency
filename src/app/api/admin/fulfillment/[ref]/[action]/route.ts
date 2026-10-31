import { z } from "zod";
import { authorize, clientInfo, requireStaff } from "@/server/auth";
import { requireRecentReauth } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { cancelAttempt, fulfillmentDetail, prepareAttempt, reconcileAttempt, resolveUnknown, submitAttempt } from "@/server/providers/fulfillment";

const AttemptBody = z.object({ attemptId: z.string().uuid() });
const ACTIONS = ["prepare", "cancel", "reconcile", "resolve", "submit"];

/**
 * Provider fulfilment actions (Orders: Manage and Providers: View). Resolving
 * an uncertain outcome needs a fresh re-authentication. Submission is refused
 * in this phase before anything else happens.
 */
export const POST = route<{ params: Promise<{ ref: string; action: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const { ref, action } = await params;
  if (!ACTIONS.includes(action)) throw errors.notFound("That action");
  const actor = await requireStaff("orders:manage");
  await authorize(actor, "providers:view");
  const body = await request.json().catch(() => ({}));
  const db = getDb();
  const client = await clientInfo();
  if (action === "prepare") await prepareAttempt(db, actor, ref, body, client);
  else if (action === "cancel") await cancelAttempt(db, actor, ref, body, client);
  else if (action === "resolve") {
    requireRecentReauth(actor.context.session);
    await resolveUnknown(db, actor, ref, body, client);
  } else {
    const { attemptId } = AttemptBody.parse(body);
    const detail = await fulfillmentDetail(db, ref);
    if (!detail?.attempts.some((a) => a.id === attemptId)) throw errors.notFound("That attempt");
    if (action === "submit") await submitAttempt(db, attemptId);
    else await reconcileAttempt(db, attemptId);
  }
  return privateJson({ order: await fulfillmentDetail(db, ref) });
});
