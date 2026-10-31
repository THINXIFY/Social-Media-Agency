import { connection } from "next/server";
import { type CatalogQuery, listPublicServices } from "@/server/catalog/catalog";
import { getDb } from "@/server/db/client";
import { route } from "@/server/http";

/** Public catalog: customer-safe fields only, paginated (max 48 per page). */
export const GET = route(async (request) => {
  await connection();
  const p = new URL(request.url).searchParams;
  const query = Object.fromEntries([...p.entries()].filter(([, v]) => v !== "")) as CatalogQuery;
  const result = await listPublicServices(getDb(), query);
  return Response.json(result, { headers: { "cache-control": "public, max-age=60" } });
});
