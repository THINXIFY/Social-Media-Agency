import "server-only";
import { eq } from "drizzle-orm";
import type { Executor } from "../db/client";
import { roleModuleAccess, roleSensitivePermissions, roles } from "../db/schema";
import { ROLE_TEMPLATES } from "./role-templates";

/**
 * Idempotently creates the five system roles from the approved templates.
 * Existing roles are never overwritten (owner is immutable at the database level anyway).
 */
export async function ensureSystemRoles(db: Executor) {
  for (const t of ROLE_TEMPLATES) {
    const [role] = await db.insert(roles).values({ key: t.key, name: t.name, isSystem: true }).onConflictDoNothing({ target: roles.key }).returning({ id: roles.id });
    if (!role) continue;
    await db.insert(roleModuleAccess).values(Object.entries(t.access.modules).map(([module, level]) => ({ roleId: role.id, module, level })));
    const granted = Object.entries(t.access.sensitive).filter(([, on]) => on);
    if (granted.length) await db.insert(roleSensitivePermissions).values(granted.map(([permission]) => ({ roleId: role.id, permission })));
  }
}

export async function roleByKey(db: Executor, key: string) {
  const [role] = await db.select().from(roles).where(eq(roles.key, key)).limit(1);
  return role ?? null;
}
