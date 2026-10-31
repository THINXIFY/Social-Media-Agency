import { describe, expect, it } from "vitest";
import { AI_TOOL_BY_ID } from "@/lib/ai/registry";
import { type CustomerOrder } from "@/lib/orders";
import { ORDER_SUPPORT } from "@/server/ai/generators";
import { decideQuantity } from "@/server/ai/generators/order-assistant";
import { orderExplanationGenerator } from "@/server/ai/generators/order-explanation";
import { OutputRuleError } from "@/server/ai/generators/shared";
import { checkSupportAnswer } from "@/server/ai/generators/support";
import { humanSupportFact, SUPPORT_TICKETS_CONNECTED } from "@/server/ai/knowledge";
import { checkOrderAnswer, orderFactSheet } from "@/server/ai/order-context";
import { allowanceFor, allowanceOverrides } from "@/server/ai/run";
import { envSchema } from "@/server/env";

/* AI-05 pure logic: registry and quotas, order facts and answer rules, quantity decisions, support honesty. */

const order = (over: Partial<CustomerOrder> = {}): CustomerOrder => ({
  reference: "ORD-ABC123",
  service: { id: "instagram-followers", name: "Instagram Followers", platform: "Instagram", category: "Audience" },
  quantity: 1000,
  link: "https://instagram.com/secret-handle",
  details: { notes: "my private note" },
  totalCents: 250,
  currency: "USD",
  unitPrice: { micros: 2_500_000, unit: "per 1,000" },
  status: "pending_review",
  statusReason: null,
  paymentStatus: "charged",
  placedAt: "2026-10-30T10:00:00.000Z",
  startedAt: null,
  completedAt: null,
  closedAt: null,
  canCancel: true,
  canUpdateDetails: false,
  events: [{ type: "created", label: "Order placed", detail: null, at: "2026-10-30T10:00:00.000Z", actor: "you" }],
  ...over,
});

describe("registry ↔ Order & Support Intelligence", () => {
  it("implements the three AI-05 tools, account only, with the proposed allowances", () => {
    expect(Object.keys(ORDER_SUPPORT).sort()).toEqual(["order-assistant", "order-explanation", "support-assistant"]);
    expect(AI_TOOL_BY_ID["order-assistant"]).toMatchObject({ phase: "AI-05", auth: "account", slug: "smart-order-assistant", free: { anonymousPerDay: 0, signedInPerDay: 10 } });
    expect(AI_TOOL_BY_ID["order-explanation"]).toMatchObject({ phase: "AI-05", auth: "account", free: { anonymousPerDay: 0, signedInPerDay: 20 } });
    expect(AI_TOOL_BY_ID["support-assistant"]).toMatchObject({ phase: "AI-05", auth: "account", free: { anonymousPerDay: 0, signedInPerDay: 15 } });
  });

  it("lets operators override signed-in allowances, ignoring unknown tools and malformed entries", () => {
    expect(allowanceOverrides("order-explanation=5, support-assistant = 40,nope=3,assistant=x,caption-generator=99999")).toEqual({ "order-explanation": 5, "support-assistant": 40 });
    expect(allowanceOverrides(undefined)).toEqual({});
    const env = envSchema.parse({ ...process.env, AI_DAILY_ALLOWANCES: "order-explanation=3" });
    const tool = AI_TOOL_BY_ID["order-explanation"];
    expect(allowanceFor(tool, { kind: "account", userId: "u" }, env)).toBe(3);
    expect(allowanceFor(tool, { kind: "anonymous", ip: null }, env)).toBe(0);
    expect(allowanceFor(AI_TOOL_BY_ID["support-assistant"], { kind: "account", userId: "u" }, env)).toBe(15);
  });
});

describe("order explanation input", () => {
  it("accepts one order reference and an optional short question", () => {
    expect(orderExplanationGenerator.input.parse({ reference: " ord-abc123 ", question: "" })).toEqual({ reference: "ORD-ABC123", question: undefined });
    expect(() => orderExplanationGenerator.input.parse({ reference: "12345" })).toThrow();
    expect(() => orderExplanationGenerator.input.parse({ reference: "ORD-ABC123", question: "x".repeat(301) })).toThrow();
    expect(() => orderExplanationGenerator.input.parse({ reference: "ORD-ABC123", customerId: "someone-else" })).toThrow();
  });
});

describe("order fact sheet", () => {
  it("is minimal and customer-safe: no target link, submitted details or times", () => {
    const { sheet, amounts } = orderFactSheet(order({ statusReason: "Please make your profile public." }));
    expect(sheet).toContain("Awaiting review");
    expect(sheet).toContain("$2.50");
    expect(sheet).toContain("Please make your profile public.");
    expect(sheet).toContain("cancel the order");
    expect(sheet).not.toMatch(/secret-handle|instagram\.com|private note|2026-10-30/);
    expect(amounts).toEqual([2.5]);
  });
  it("describes refund review without implying a refund", () => {
    const { sheet } = orderFactSheet(order({ status: "failed", paymentStatus: "refund_review", canCancel: false }));
    expect(sheet).toContain("No refund has been decided");
    expect(sheet).not.toContain("cancel the order and get");
  });
});

describe("order answer rules", () => {
  const o = order();
  const bad = [
    "It should arrive within 3 days.",
    "It'll take a few hours.",
    "Expect it by Friday.",
    "Expect it around Oct 31.",
    "It will be done on 31/10.",
    "It's about 40% complete.",
    "It will start soon.",
    "I've escalated it to the team.",
    "We will prioritise your order.",
    "Your order has been completed.",
    "You will get a full refund.",
    "The money was returned to your wallet.",
    "Your total of $9.99 is held.",
    "Delivery is guaranteed.",
  ];
  it("rejects invented dates, durations, progress, actions, outcomes and amounts", () => {
    for (const t of bad) expect(() => checkOrderAnswer(t, o, [2.5]), t).toThrow(OutputRuleError);
  });
  it("allows plain explanations within the facts", () => {
    for (const t of ["Your order is waiting for the team's review.", "The total of $2.50 is held for this order.", "You can still cancel it from the order's panel.", "Nothing is needed from you right now."]) expect(() => checkOrderAnswer(t, o, [2.5]), t).not.toThrow();
  });
  it("ties claims to the order's real state", () => {
    const running = order({ status: "in_progress", canCancel: false });
    expect(() => checkOrderAnswer("You can still cancel it.", running, [2.5])).toThrow(OutputRuleError);
    expect(() => checkOrderAnswer("You can update the details now.", running, [2.5])).toThrow(OutputRuleError);
    expect(() => checkOrderAnswer("Your order has been completed.", order({ status: "completed", canCancel: false, completedAt: "2026-10-30T12:00:00.000Z" }), [2.5])).not.toThrow();
    expect(() => checkOrderAnswer("The full amount was returned to your wallet.", order({ status: "cancelled", paymentStatus: "released", canCancel: false }), [2.5])).not.toThrow();
    expect(() => checkOrderAnswer("You can update the details the team asked for.", order({ status: "needs_customer_action", canUpdateDetails: true }), [2.5])).not.toThrow();
  });
});

describe("order assistant quantity", () => {
  const svc = { limits: { min: 100, max: 10_000 } };
  it("uses the customer's quantity only when it fits the limits", () => {
    expect(decideQuantity(svc, 500, null, "")).toMatchObject({ quantity: 500 });
    expect(decideQuantity(svc, 50, 400, "")).toMatchObject({ quantity: null, note: expect.stringContaining("outside this service's limits (100–10,000)") });
  });
  it("uses the model's suggestion only within the limits", () => {
    expect(decideQuantity(svc, undefined, 1000, "A modest start.")).toEqual({ quantity: 1000, note: "A modest start." });
    expect(decideQuantity(svc, undefined, 50_000, "Big")).toMatchObject({ quantity: null });
    expect(decideQuantity({ limits: null }, 500, 500, "")).toMatchObject({ quantity: null, note: expect.stringContaining("doesn't use a quantity") });
  });
});

describe("support honesty", () => {
  it("never claims it created a ticket, handed off or will call back", () => {
    // Tickets exist (5G-A), but only the customer can open one; the assistant only links to the form.
    expect(SUPPORT_TICKETS_CONNECTED).toBe(true);
    for (const t of ["Your request has been submitted.", "I have forwarded this to support.", "The team will reach out to you.", "Our team will get back to you shortly.", "Please send me your password."]) expect(() => checkSupportAnswer(t, []), t).toThrow(OutputRuleError);
    for (const t of ["Support tickets aren't connected yet, so I can't send this to the team.", "You can cancel from My orders while the order is awaiting review."]) expect(() => checkSupportAnswer(t, []), t).not.toThrow();
  });
  it("states the human-support channel exactly", () => {
    expect(humanSupportFact({ supportEmail: null })).toMatch(/open a support ticket from the Support page.*Nothing typed to an AI assistant is sent to the team.$/);
    expect(humanSupportFact({ supportEmail: "help@socivanta.example" })).toContain("email the SociVanta team at help@socivanta.example");
  });
});
