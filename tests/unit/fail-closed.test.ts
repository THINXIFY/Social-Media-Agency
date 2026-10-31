import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentActor, requireCustomer, requireStaff } from "@/server/auth";
import { resetEnvCache } from "@/server/env";
import { AppError } from "@/server/errors";
import { JOB_NAMES, JOBS } from "@/server/jobs/definitions";
import { enqueue } from "@/server/jobs/queue";
import { adjustWallet, chargeOrder, creditDeposit, FINANCIAL_OPERATIONS_ENABLED, refundOrder } from "@/server/ledger/operations";

vi.mock("next/server", () => ({ connection: async () => {} }));

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof AppError ? e.code : `non-app-error: ${String(e)}`;
  }
  return "resolved";
};

describe("fail-closed security", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  it("has no current actor until Phase 5B sessions exist", async () => {
    expect(await getCurrentActor()).toBeNull();
    expect(await codeOf(requireCustomer())).toBe("UNAUTHENTICATED");
    expect(await codeOf(requireStaff("orders:view"))).toBe("UNAUTHENTICATED");
    expect(await codeOf(requireStaff("manageStaff"))).toBe("UNAUTHENTICATED");
  });

  it("keeps every money-moving operation disabled", async () => {
    expect(FINANCIAL_OPERATIONS_ENABLED).toBe(false);
    expect(await codeOf(creditDeposit("x"))).toBe("FEATURE_DISABLED");
    expect(await codeOf(chargeOrder("x"))).toBe("FEATURE_DISABLED");
    expect(await codeOf(refundOrder("x", 100))).toBe("FEATURE_DISABLED");
    expect(await codeOf(adjustWallet("x", 100, "reason"))).toBe("FEATURE_DISABLED");
  });

  it("refuses to queue jobs for features that don't exist yet", async () => {
    const boss = { send: vi.fn() } as never;
    const disabled = JOB_NAMES.filter((n) => !JOBS[n].enabled);
    // Phase 5D enabled deposits.expire and deposits.reconcile (internal, no external calls).
    expect(disabled).toEqual(["orders.sync-status", "providers.poll-fulfillment", "referrals.qualify", "notifications.send"]);
    for (const name of disabled) expect(await codeOf(enqueue(boss, name, {}, { idempotencyKey: "key-12345678" }))).toBe("FEATURE_DISABLED");
    expect((boss as unknown as { send: ReturnType<typeof vi.fn> }).send).not.toHaveBeenCalled();
  });

  it("health check reports a missing database instead of pretending", async () => {
    vi.stubEnv("DATABASE_URL", "");
    resetEnvCache();
    const { GET } = await import("@/app/api/health/route");
    const res = await GET(new Request("http://localhost/api/health"), {});
    const json = (await res.json()) as { status: string; checks: { database: string } };
    expect(res.status).toBe(503);
    expect(json.status).toBe("degraded");
    expect(json.checks.database).toBe("not_configured");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("health check reports invalid configuration without details", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://nope");
    resetEnvCache();
    const { GET } = await import("@/app/api/health/route");
    const res = await GET(new Request("http://localhost/api/health"), {});
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(text).toContain('"config":"invalid"');
    expect(text).not.toContain("mysql");
  });
});
