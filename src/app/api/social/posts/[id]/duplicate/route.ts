import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { duplicatePost } from "@/server/social/publishing";

export const POST = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  return privateJson({ post: await duplicatePost(getDb(), actor.customerId, (await params).id) }, { status: 201 });
});
