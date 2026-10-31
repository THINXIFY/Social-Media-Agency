import { requireStaff } from "@/server/auth";
import { getCustomerForStaff } from "@/server/customers/customers";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { privateJson, route } from "@/server/http";

export const GET = route<{ params: Promise<{ ref: string }> }>(async (_request, { params }) => {
  await requireStaff("customers:view");
  const customer = await getCustomerForStaff(getDb(), (await params).ref);
  if (!customer) throw errors.notFound("That customer");
  return privateJson({ customer });
});
