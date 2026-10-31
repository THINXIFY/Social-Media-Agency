import "server-only";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "../db/client";
import { notifications } from "../db/schema";

/* In-app notifications for the signed-in user (5G-A). Real persisted rows only; nothing is emailed. */

export async function listNotifications(db: Executor, userId: string) {
  const [rows, [{ unread }]] = await Promise.all([
    db.select().from(notifications).where(eq(notifications.recipientUserId, userId)).orderBy(desc(notifications.createdAt)).limit(20),
    db.select({ unread: count() }).from(notifications).where(and(eq(notifications.recipientUserId, userId), isNull(notifications.readAt))),
  ]);
  return { unread, items: rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, read: Boolean(n.readAt), at: n.createdAt.toISOString() })) };
}

export const markReadSchema = z.strictObject({ ids: z.array(z.string().uuid()).max(50).optional(), all: z.boolean().optional() });

/** Marks the user's own notifications read; ids belonging to someone else are simply not matched. */
export async function markRead(db: Executor, userId: string, raw: unknown) {
  const { ids, all } = markReadSchema.parse(raw);
  const mine = and(eq(notifications.recipientUserId, userId), isNull(notifications.readAt));
  if (all) await db.update(notifications).set({ readAt: new Date() }).where(mine);
  else if (ids?.length) await db.update(notifications).set({ readAt: new Date() }).where(and(mine, inArray(notifications.id, ids)));
}
