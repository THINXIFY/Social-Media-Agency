import { requireStaff } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { privateJson, route } from "@/server/http";
import { supportAssignees } from "@/server/support/tickets";

/** Active staff who can manage support. */
export const GET = route(async () => {
  await requireStaff("support:view");
  return privateJson({ staff: await supportAssignees(getDb()) });
});
