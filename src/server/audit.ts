import "server-only";
import type { Executor } from "./db/client";
import { auditLog } from "./db/schema";

/** Append-only business audit. Never put passwords, tokens, codes or secrets in `before`/`after`. */
export async function audit(
  db: Executor,
  entry: {
    actorUserId?: string | null;
    actorType: "customer" | "staff" | "system";
    action: string;
    targetType: string;
    targetId?: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    ip?: string | null;
    userAgent?: string | null;
  },
) {
  await db.insert(auditLog).values({
    actorUserId: entry.actorUserId ?? null,
    actorType: entry.actorType,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.ip?.slice(0, 64) ?? null,
    userAgent: entry.userAgent?.slice(0, 300) ?? null,
  });
}
