import { connection } from "next/server";
import { AI_TOOL_BY_ID } from "@/lib/ai/registry";
import { getCustomerSession } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { privateJson, route } from "@/server/http";
import { effectiveAvailability, usageToday } from "@/server/ai/run";

/**
 * One tool's live state for the workspace: availability right now, whether
 * the visitor can run it, and today's usage. No provider details or secrets.
 */
export const GET = route<{ params: Promise<{ id: string }> }>(async (_request, { params }) => {
  await connection();
  const tool = AI_TOOL_BY_ID[(await params).id];
  if (!tool) throw errors.notFound("That AI tool");
  const availability = effectiveAvailability(tool);
  const session = await getCustomerSession().catch(() => null);
  const account = !session ? "signed_out" : session.session.user.emailVerifiedAt ? "verified" : "unverified";
  const usage = availability === "available" && account === "verified" ? await usageToday(getDb(), tool, { kind: "account", userId: session!.session.userId }) : null;
  return privateJson({ id: tool.id, availability, account, usage });
});
