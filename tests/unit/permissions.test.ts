import { describe, expect, it } from "vitest";
import { allows, isPermission, type RoleAccess } from "@/server/auth/permissions";
import { ROLE_TEMPLATES } from "@/server/auth/role-templates";
import { MODULE, SENSITIVE_PERMISSION } from "@/server/db/schema/enums";
import { DEFAULT_ACCESS, MODULES, SENSITIVE } from "@/lib/admin-staff";

const role = (key: string) => ROLE_TEMPLATES.find((r) => r.key === key)!.access;

describe("permission model", () => {
  it("matches the modules and sensitive permissions designed in the admin UI", () => {
    expect([...MODULE].sort()).toEqual(MODULES.map((m) => m.id).sort());
    expect([...SENSITIVE_PERMISSION].sort()).toEqual(SENSITIVE.map((s) => s.id).sort());
  });

  it("server role templates equal the approved admin templates", () => {
    for (const t of ROLE_TEMPLATES) expect(t.access).toEqual(DEFAULT_ACCESS[t.key as keyof typeof DEFAULT_ACCESS]);
  });

  it("checks module levels: manage implies view", () => {
    expect(allows(role("support"), "support:manage")).toBe(true);
    expect(allows(role("support"), "orders:view")).toBe(true);
    expect(allows(role("support"), "orders:manage")).toBe(false);
    expect(allows(role("support"), "payments:view")).toBe(false);
  });

  it("sensitive permissions need the grant and Manage on their module", () => {
    expect(allows(role("finance"), "approveDeposits")).toBe(true);
    expect(allows(role("finance"), "adjustWallets")).toBe(false);
    expect(allows(role("admin"), "manageStaff")).toBe(false);
    const tampered: RoleAccess = { ...role("support"), sensitive: { ...role("support").sensitive, issueRefunds: true } };
    expect(allows(tampered, "issueRefunds")).toBe(false); // granted, but payments isn't Manage
  });

  it("denies unknown permissions", () => {
    expect(isPermission("orders:delete")).toBe(false);
    expect(allows(role("owner"), "orders:delete" as never)).toBe(false);
    expect(allows(role("owner"), "launchMissiles" as never)).toBe(false);
  });
});
