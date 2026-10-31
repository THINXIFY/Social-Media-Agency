import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { privateJson, route } from "@/server/http";
import { getOwnDeposit } from "@/server/payments/deposits";

export const GET = route<{ params: Promise<{ ref: string }> }>(async (_request, { params }) => {
  const actor = await requireCustomer();
  const deposit = await getOwnDeposit(getDb(), actor.customerId, (await params).ref);
  if (!deposit) throw errors.notFound("That deposit");
  return privateJson({ deposit });
});
