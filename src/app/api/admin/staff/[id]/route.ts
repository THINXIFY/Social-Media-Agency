import { z } from "zod";
import { clientInfo, requireStaff } from "@/server/auth";
import { changeStaffRole, setStaffDisabled } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";

const body = z.union([z.object({ role: z.enum(["owner", "admin", "support", "orders", "finance"]) }).strict(), z.object({ disabled: z.boolean() }).strict()]);

/**
 * Change a staff member's role or disable/enable them. Needs the sensitive
 * "Manage staff roles" permission plus a recent re-authentication. The
 * database still refuses to remove the last active owner.
 */
export const PATCH = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireStaff("manageStaff");
  const { id } = await params;
  const input = body.parse(await request.json().catch(() => ({})));
  const who = { userId: actor.userId, session: actor.context.session };
  const result = "role" in input ? await changeStaffRole(getDb(), who, id, input.role, await clientInfo()) : await setStaffDisabled(getDb(), who, id, input.disabled, await clientInfo());
  return privateJson(result);
});
