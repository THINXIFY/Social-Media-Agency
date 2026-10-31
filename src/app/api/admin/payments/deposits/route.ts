import { requireStaff } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { privateJson, route } from "@/server/http";
import { listDepositsForStaff } from "@/server/payments/deposits";

export const GET = route(async (request) => {
  await requireStaff("payments:view");
  const p = new URL(request.url).searchParams;
  return privateJson(await listDepositsForStaff(getDb(), Object.fromEntries([...p.entries()].filter(([, v]) => v !== ""))));
});
