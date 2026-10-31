import { requireStaff } from "@/server/auth";
import { listCustomers } from "@/server/customers/customers";
import { getDb } from "@/server/db/client";
import { privateJson, route } from "@/server/http";

/** Real registered customers (Customers: View). Paginated, max 50 per page. */
export const GET = route(async (request) => {
  await requireStaff("customers:view");
  const p = new URL(request.url).searchParams;
  return privateJson(await listCustomers(getDb(), Object.fromEntries([...p.entries()].filter(([, v]) => v !== ""))));
});
