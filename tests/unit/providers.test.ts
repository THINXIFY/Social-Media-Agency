import { describe, expect, it } from "vitest";
import { ERROR_MESSAGE, normalizeStatus, providerOrderSchema, submitRequestSchema } from "@/server/providers/adapter";
import { ADAPTERS, SUBMISSIONS_ENABLED } from "@/server/providers/registry";
import { JOBS } from "@/server/jobs/definitions";
import { HANDLERS } from "@/server/jobs/handlers";

/* Phase 5F pure logic: status normalisation, validated schemas and the disabled posture. */

describe("status normalisation", () => {
  it("maps common provider wording and leaves anything unfamiliar for a person", () => {
    expect(normalizeStatus("Pending")).toBe("submitted");
    expect(normalizeStatus("In progress")).toBe("in_progress");
    expect(normalizeStatus("in_progress")).toBe("in_progress");
    expect(normalizeStatus("PROCESSING")).toBe("in_progress");
    expect(normalizeStatus("Partial")).toBe("partial");
    expect(normalizeStatus("Completed")).toBe("completed");
    expect(normalizeStatus("Canceled")).toBe("cancelled");
    expect(normalizeStatus("Refunded")).toBe("cancelled");
    expect(normalizeStatus("Awaiting moon phase")).toBeNull();
    expect(normalizeStatus("")).toBeNull();
  });
});

describe("validated schemas", () => {
  it("submission requests carry a well-formed idempotency key and no extra fields", () => {
    const ok = { idempotencyKey: `ful_${"a".repeat(32)}`, providerServiceRef: "svc-1", link: "https://x.example", quantity: 100 };
    expect(submitRequestSchema.safeParse(ok).success).toBe(true);
    expect(submitRequestSchema.safeParse({ ...ok, idempotencyKey: "anything" }).success).toBe(false);
    expect(submitRequestSchema.safeParse({ ...ok, quantity: 0 }).success).toBe(false);
    expect(submitRequestSchema.safeParse({ ...ok, cost: 5 }).success).toBe(false);
  });
  it("provider replies must name an order and a status", () => {
    expect(providerOrderSchema.safeParse({ providerOrderId: "A1", status: "Pending" }).success).toBe(true);
    expect(providerOrderSchema.safeParse({ status: "Pending" }).success).toBe(false);
    expect(providerOrderSchema.safeParse({ providerOrderId: "A1", status: "Pending", delivered: -1 }).success).toBe(false);
  });
});

describe("disabled posture", () => {
  it("no integration installed, submission off, background polling off", () => {
    expect(Object.keys(ADAPTERS)).toEqual([]);
    expect(SUBMISSIONS_ENABLED).toBe(false);
    expect(JOBS["providers.poll-fulfillment"].enabled).toBe(false);
    expect(HANDLERS["providers.poll-fulfillment"]).toBeUndefined();
  });
  it("staff messages are plain language and never echo provider text", () => {
    for (const m of Object.values(ERROR_MESSAGE)) {
      expect(m.length).toBeLessThan(140);
      expect(m).not.toMatch(/http|stack|exception|undefined/i);
    }
  });
});
