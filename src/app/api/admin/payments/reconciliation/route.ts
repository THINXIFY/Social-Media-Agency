import { requireStaff } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { privateJson, route } from "@/server/http";
import { reconcile } from "@/server/payments/reconcile";

/** Run the read-only reconciliation now (Payments: View). Never changes a balance. */
export const GET = route(async () => {
  await requireStaff("payments:view");
  return privateJson(await reconcile(getDb()));
});
