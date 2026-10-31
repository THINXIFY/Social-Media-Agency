import { z } from "zod";
import { clientInfo, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { listPolicies, retirePolicy } from "@/server/referrals/referrals";

const Body = z.strictObject({ action: z.enum(["retire", "activate"]) });

/** Retires a draft rule (Referrals: Manage). Activation is always refused until approved rules and accounting controls exist. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireStaff("referrals:manage");
  const { action } = Body.parse(await request.json().catch(() => ({})));
  if (action === "activate") throw errors.conflict("Reward rules can't be activated yet. Activation needs separate approval and accounting controls.");
  const db = getDb();
  await retirePolicy(db, actor, (await params).id, await clientInfo());
  return privateJson({ rules: await listPolicies(db) });
});
