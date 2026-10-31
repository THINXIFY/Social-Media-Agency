import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { privateJson, route } from "@/server/http";
import { walletSummary } from "@/server/wallet/wallet";

/** Read-only wallet summary from the ledger. There is no write endpoint. */
export const GET = route(async () => {
  const actor = await requireCustomer();
  return privateJson(await walletSummary(getDb(), actor.customerId));
});
