import { requireStaffSession } from "@/server/auth";
import { privateJson, route } from "@/server/http";

/** The signed-in staff member and their current permissions (two-step verified sessions only). */
export const GET = route(async () => {
  const ctx = await requireStaffSession();
  return privateJson({ email: ctx.session.user.email, name: ctx.session.user.name, role: ctx.staff.roleKey, access: ctx.access });
});
