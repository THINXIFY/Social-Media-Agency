import { clientInfo, getCustomerSession } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { type AiSubject, runTool } from "@/server/ai/run";

/**
 * Run an AI tool through the shared pipeline (policy, validation, redaction,
 * quota, budget, timeout, output validation, accounting). Content Studio
 * tools need a signed-in account with a verified email. The customer id
 * comes from the session only, so order tools (AI-05) can read nothing but
 * the caller's own orders. While generation is
 * switched off this answers 503 with an honest message.
 */
export const POST = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const session = await getCustomerSession().catch(() => null);
  if (session && !session.session.user.emailVerifiedAt) throw new AppError("FORBIDDEN", "Verify your email address to use Sociotix AI.");
  const subject: AiSubject = session ? { kind: "account", userId: session.session.userId, customerId: session.customer.id } : { kind: "anonymous", ip: (await clientInfo()).ip ?? null };
  const result = await runTool(getDb(), (await params).id, await request.json().catch(() => ({})), subject, { signal: request.signal });
  return privateJson(result);
});
