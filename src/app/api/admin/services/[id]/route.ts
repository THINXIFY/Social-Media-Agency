import { z } from "zod";
import { clientInfo, requireStaff } from "@/server/auth";
import { allows } from "@/server/auth/permissions";
import { getAdminService, updateService } from "@/server/catalog/catalog";
import { getDb } from "@/server/db/client";
import { errors } from "@/server/errors";
import { assertSameOrigin, privateJson, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_request, { params }) => {
  await requireStaff("services:view");
  const record = await getAdminService(getDb(), (await params).id);
  if (!record) throw errors.notFound("That service");
  return privateJson({ service: record });
});

const body = z.object({ version: z.number().int().min(1), record: z.unknown() }).strict();

/**
 * Save a service. The request names the version it was based on; a stale
 * version is refused (409) so concurrent edits never overwrite each other.
 */
export const PATCH = route<Ctx>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireStaff("services:manage");
  const input = body.parse(await request.json().catch(() => ({})));
  const record = await updateService(
    getDb(),
    { userId: actor.userId, canChangePrices: allows(actor.context.access!, "changePrices"), client: await clientInfo() },
    (await params).id,
    input.record,
    input.version,
  );
  return privateJson({ service: record });
});
