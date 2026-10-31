import { requireCustomer } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, privateJson, route } from "@/server/http";
import { deletePost, saveDraft } from "@/server/social/publishing";

type Ctx = { params: Promise<{ id: string }> };

/** Updates one of the caller's own drafts (scheduled posts must be cancelled first). */
export const PATCH = route<Ctx>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  return privateJson({ post: await saveDraft(getDb(), actor.customerId, (await params).id, await request.json().catch(() => ({}))) });
});

/** Deletes one of the caller's own drafts or cancelled posts that never reached a platform. */
export const DELETE = route<Ctx>(async (request, { params }) => {
  assertSameOrigin(request);
  const actor = await requireCustomer();
  await deletePost(getDb(), actor.customerId, (await params).id);
  return privateJson({ deleted: true });
});
