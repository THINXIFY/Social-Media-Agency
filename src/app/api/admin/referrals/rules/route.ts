import { clientInfo, requireStaff } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { createDraftPolicy, listPolicies } from "@/server/referrals/referrals";

/** Reward rule drafts (Referrals: View). None can be active in this phase. */
export const GET = route(async () => {
  await requireStaff("referrals:view");
  return privateJson({ rules: await listPolicies(getDb()), activationBlocked: true });
});

/** Saves a draft rule for later approval (Referrals: Manage). Drafts never apply to anyone. */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const actor = await requireStaff("referrals:manage");
  const db = getDb();
  const rule = await createDraftPolicy(db, actor, await request.json().catch(() => ({})), await clientInfo());
  return privateJson({ rule, rules: await listPolicies(db) }, { status: 201 });
});
