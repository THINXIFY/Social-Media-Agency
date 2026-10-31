import { z } from "zod";
import { clientInfo, requireStaff } from "@/server/auth";
import { allows } from "@/server/auth/permissions";
import { bulkUpdateServices, createService, listAdminServices } from "@/server/catalog/catalog";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";

/** Every service record for staff (Services & Pricing: View). */
export const GET = route(async () => {
  await requireStaff("services:view");
  return privateJson({ services: await listAdminServices(getDb()) });
});

/** Create a custom service (Services & Pricing: Manage; a price also needs "Change service prices"). */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const actor = await requireStaff("services:manage");
  const record = await createService(
    getDb(),
    { userId: actor.userId, canChangePrices: allows(actor.context.access!, "changePrices"), client: await clientInfo() },
    await request.json().catch(() => ({})),
  );
  return privateJson({ service: record }, { status: 201 });
});

const bulk = z
  .object({
    items: z
      .array(z.object({ id: z.string().max(80), version: z.number().int().min(1) }))
      .min(1)
      .max(200),
    patch: z.union([z.object({ visible: z.boolean() }).strict(), z.object({ archived: z.boolean() }).strict()]),
  })
  .strict();

/** Show/hide or archive/restore several services (all or nothing, version-checked). */
export const PATCH = route(async (request) => {
  assertSameOrigin(request);
  const actor = await requireStaff("services:manage");
  const input = bulk.parse(await request.json().catch(() => ({})));
  const records = await bulkUpdateServices(getDb(), { userId: actor.userId, canChangePrices: false, client: await clientInfo() }, input.items, input.patch);
  return privateJson({ services: records });
});
