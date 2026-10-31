import { requireStaff } from "@/server/auth";
import { allows } from "@/server/auth/permissions";
import { getDb } from "@/server/db/client";
import { privateJson, route } from "@/server/http";
import { methodReadiness } from "@/server/payments/methods";
import { financialSummary } from "@/server/payments/reconcile";

/** Financial overview for Payments (Payments: View): liabilities, deposits by state, method readiness and what this viewer may do. */
export const GET = route(async () => {
  const actor = await requireStaff("payments:view");
  const access = actor.context.access!;
  return privateJson({
    summary: await financialSummary(getDb()),
    methods: methodReadiness(),
    can: { manage: allows(access, "payments:manage"), approveDeposits: allows(access, "approveDeposits"), issueRefunds: allows(access, "issueRefunds"), adjustWallets: allows(access, "adjustWallets") },
  });
});
