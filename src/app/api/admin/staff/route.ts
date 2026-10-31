import { requireStaff } from "@/server/auth";
import { listStaff } from "@/server/auth/staff";
import { getDb } from "@/server/db/client";
import { privateJson, route } from "@/server/http";

/** Staff directory — needs Staff & Permissions: View. */
export const GET = route(async () => {
  await requireStaff("staff:view");
  return privateJson({ staff: await listStaff(getDb()) });
});
