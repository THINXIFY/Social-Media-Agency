import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, scrub } from "@/server/log";
import { assertCents, orderTotalCents } from "@/server/ledger/money";

function capture() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  return { lines, logger: createLogger({ level: "info", destination }) };
}

describe("logging", () => {
  it("redacts secrets at any common depth", () => {
    const { lines, logger } = capture();
    logger.info({ password: "pw-1", user: { token: "tok-2", apiKey: "key-3" }, req: { headers: { authorization: "Bearer abc", cookie: "sid=4" } }, DATABASE_URL: "postgres://u:pw@h/db" }, "event");
    const out = lines.join("");
    for (const s of ["pw-1", "tok-2", "key-3", "Bearer abc", "sid=4", "u:pw@"]) expect(out).not.toContain(s);
    expect(out).toContain("[redacted]");
  });

  it("scrubs credentials inside error messages", () => {
    const { lines, logger } = capture();
    logger.error({ err: new Error("connect failed: postgresql://app:hunter2@db.internal:5432/x") }, "boom");
    expect(lines.join("")).not.toContain("hunter2");
    expect(scrub("Authorization: Bearer abc.def")).toBe("Authorization: Bearer ***");
  });
});

describe("money", () => {
  it("only accepts whole, in-range cents", () => {
    expect(assertCents(1999)).toBe(1999);
    expect(() => assertCents(19.99)).toThrow();
    expect(() => assertCents(Number.MAX_SAFE_INTEGER)).toThrow();
  });

  it("computes order totals exactly and rounds half-up once", () => {
    // $9.20 per 1,000 × 2,000 = $18.40
    expect(orderTotalCents("per1000", 9_200_000, 2000)).toBe(1840);
    // $0.48 per 1,000 × 1,234 = $0.59232 → 59¢
    expect(orderTotalCents("per1000", 480_000, 1234)).toBe(59);
    // $0.005 per unit × 1 = half a cent → rounds up to 1¢
    expect(orderTotalCents("unit", 5_000, 1)).toBe(1);
    expect(orderTotalCents("fixed", 25_000_000, 1)).toBe(2500);
    // No floating-point drift on large quantities.
    expect(orderTotalCents("per1000", 3_333_333, 9_000_000)).toBe(3_000_000);
    expect(() => orderTotalCents("per1000", 0, 10)).toThrow();
    expect(() => orderTotalCents("per1000", 100, -1)).toThrow();
  });
});
