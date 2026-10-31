import { requireStaff } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { privateJson, route } from "@/server/http";
import { assignableStaff } from "@/server/orders/orders";

export const GET = route(async () => {
  await requireStaff("orders:view");
  return privateJson({ staff: await assignableStaff(getDb()) });
});
