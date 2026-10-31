import { connection } from "next/server";
import { checkHealth } from "@/server/health";
import { route } from "@/server/http";

/** Readiness probe for load balancers and uptime checks. Never cached. */
export const GET = route(async () => {
  await connection();
  const health = await checkHealth();
  return Response.json(health, { status: health.status === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } });
});
