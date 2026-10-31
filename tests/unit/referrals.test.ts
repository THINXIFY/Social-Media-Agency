import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FLAG_LABEL, REFERRAL_FLAGS, REFERRAL_STATUS_META, REFERRAL_STATUSES } from "@/lib/referrals";
import { REFERRAL_STATUS } from "@/server/db/schema/enums";
import { canonicalEmail, newCode, normalizeCode, shortName } from "@/server/referrals/referrals";

/* Phase 5G-B referral helpers and the customer-facing copy. */

describe("referral codes", () => {
  it("are SV- plus 8 unambiguous characters and don't repeat", () => {
    const codes = Array.from({ length: 2000 }, newCode);
    for (const c of codes) expect(c).toMatch(/^SV-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("normalise input and reject anything that isn't a code", () => {
    expect(normalizeCode("  sv-7k2m9qxa ")).toBe("SV-7K2M9QXA");
    for (const bad of ["", "abc", "<script>", "SV 7K2M", "x".repeat(40), null, 42, ["SV-7K2M9QXA"]]) expect(normalizeCode(bad)).toBeNull();
  });
});

describe("privacy and abuse helpers", () => {
  it("compares obvious variants of one inbox as equal", () => {
    expect(canonicalEmail("Jane.Doe+x@gmail.com")).toBe(canonicalEmail("janedoe@googlemail.com"));
    expect(canonicalEmail("jane.doe+x@example.com")).toBe("jane.doe@example.com");
    expect(canonicalEmail("jane@example.com")).not.toBe(canonicalEmail("jane@example.org"));
  });

  it("shows referrers a first name and last initial only", () => {
    expect(shortName("Grace", "Hopper")).toBe("Grace H.");
    expect(shortName("Cher", "")).toBe("Cher");
    expect(shortName(" ", "Smith")).toBe("New member");
  });
});

describe("statuses and copy", () => {
  it("matches the database statuses and has no Invited state", () => {
    expect([...REFERRAL_STATUSES]).toEqual([...REFERRAL_STATUS]);
    expect(Object.values(REFERRAL_STATUS_META).map((m) => m.label)).toEqual(["Signed up", "Under review", "Qualified", "Rejected"]);
    for (const f of REFERRAL_FLAGS) expect(FLAG_LABEL[f].detail.length).toBeGreaterThan(20);
  });

  it("customer page promises no reward amounts, balances or payout dates", () => {
    const ui = readFileSync("src/components/dashboard/live-referrals.tsx", "utf8");
    expect(ui).toContain("Share Sociotix. Grow Together.");
    expect(ui).toContain("Rewards coming soon");
    expect(ui).not.toMatch(/\$\d|usd\(|formatMoney|earn \d|paid within|payout|cash out|withdraw/i);
  });

  it("keeps rewards locked in the database", () => {
    const sql = readFileSync("drizzle/0014_referrals_5g.sql", "utf8");
    expect(sql).toMatch(/referral_policies_locked/);
    expect(sql).toMatch(/referral_rewards_locked/);
    expect(sql).toMatch(/referrals_qualify_locked/);
    expect(sql.match(/SV014/g)).toHaveLength(3);
  });
});
