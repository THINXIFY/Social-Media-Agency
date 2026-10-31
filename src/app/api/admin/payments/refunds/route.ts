import { requireStaff } from "@/server/auth";
import { requireRecentReauth } from "@/server/auth/staff";
import { assertSameOrigin, route } from "@/server/http";
import { requestRefund } from "@/server/payments/adjustments";

/** Prepared but switched off: validates the request, checks permission and re-authentication, then refuses (503). */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const actor = await requireStaff("issueRefunds");
  requireRecentReauth(actor.context.session);
  requestRefund(await request.json().catch(() => ({})));
  throw new Error("unreachable");
});
