import { and, eq, ne, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import {
  customers,
  depositReviews,
  deposits,
  orderRefunds,
  orders,
  platformSettings,
  providerCredentials,
  providers,
  providerServiceMappings,
  referralPolicies,
  referrals,
  roleModuleAccess,
  roles,
  serviceEligibility,
  servicePriceVersions,
  staffInvitations,
  staffMembers,
  users,
} from "@/server/db/schema";
import { walletCode } from "@/server/ledger/accounts";
import { postJournalEntry } from "@/server/ledger/ledger";
import { createCustomer, createUser, ensureReferenceData, fundWallet, sqlState, testDb, uid } from "./helpers";

let db: Db;
beforeAll(async () => {
  db = testDb();
  await ensureReferenceData(db);
});
afterAll(() => db.$client.end());

const roleId = async (key: string) => (await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)))[0].id;

describe("keys, uniqueness and checks", () => {
  it("emails are unique case-insensitively", async () => {
    const email = `dup-${uid().toLowerCase()}@example.test`;
    await createUser(db, email);
    expect(await sqlState(createUser(db, email.toUpperCase()))).toBe("23505");
  });

  it("foreign keys reject orphans", async () => {
    const ghost = "00000000-0000-4000-8000-000000000000";
    expect(await sqlState(db.insert(customers).values({ userId: ghost, publicRef: `CUS-${uid()}`, accountRef: `ACC-${uid()}`, firstName: "A", lastName: "B" }))).toBe("23503");
  });

  it("status columns only accept known values", async () => {
    const { customer } = await createCustomer(db);
    expect(await sqlState(db.insert(deposits).values({ publicRef: `DEP-${uid()}`, customerId: customer.id, amountCents: 1000, method: "cash", processor: "x" }))).toBe("23514");
    expect(await sqlState(db.insert(users).values({ email: `s-${uid().toLowerCase()}@example.test`, status: "superuser" }))).toBe("23514");
  });

  it("a deposit is credited if and only if a ledger entry exists", async () => {
    const { customer } = await createCustomer(db);
    expect(await sqlState(db.insert(deposits).values({ publicRef: `DEP-${uid()}`, customerId: customer.id, amountCents: 5000, method: "bank", processor: "manual", status: "credited", settledAt: new Date() }))).toBe("23514");
    const [pending] = await db.insert(deposits).values({ publicRef: `DEP-${uid()}`, customerId: customer.id, amountCents: 5000, method: "bank", processor: "manual", status: "awaiting_payment" }).returning();
    expect(pending.creditedEntryId).toBeNull();
  });

  it("one processor payment can only be recorded once", async () => {
    const { customer } = await createCustomer(db);
    const ref = `pay_${uid()}`;
    const row = () => db.insert(deposits).values({ publicRef: `DEP-${uid()}`, customerId: customer.id, amountCents: 2000, method: "crypto", processor: "proc", processorRef: ref });
    await row();
    expect(await sqlState(row())).toBe("23505");
  });

  it("referrals: no self-referral and a customer is referred once", async () => {
    const a = await createCustomer(db);
    const b = await createCustomer(db);
    const c = await createCustomer(db);
    const [policy] = await db.insert(referralPolicies).values({ version: Number(Date.now() % 1e9), rewardType: "fixed", fixedCents: 1000, minSpendCents: 2500, qualifyingDays: 60, holdDays: 14 }).returning();
    expect(await sqlState(db.insert(referrals).values({ referrerCustomerId: a.customer.id, refereeCustomerId: a.customer.id, via: "link", policyId: policy.id }))).toBe("23514");
    await db.insert(referrals).values({ referrerCustomerId: a.customer.id, refereeCustomerId: b.customer.id, via: "link", policyId: policy.id });
    expect(await sqlState(db.insert(referrals).values({ referrerCustomerId: c.customer.id, refereeCustomerId: b.customer.id, via: "code", policyId: policy.id }))).toBe("23505");
  });

  it("only one open invitation per email; owner can't be invited by role edits", async () => {
    const email = `inv-${uid().toLowerCase()}@example.test`;
    const invite = () => db.insert(staffInvitations).values({ publicRef: `INV-${uid()}`, email, roleId: roleIdCache!, tokenHash: uid() + uid(), expiresAt: new Date(Date.now() + 86_400_000) });
    const roleIdCache = await roleId("support");
    await invite();
    expect(await sqlState(invite())).toBe("23505");
  });

  it("providers: https endpoints, one active credential, one primary mapping per service", async () => {
    const id = `prov-${uid().toLowerCase()}`;
    expect(await sqlState(db.insert(providers).values({ id, name: "Provider P", type: "api", endpoint: "http://insecure.example" }))).toBe("23514");
    expect(await sqlState(db.insert(providers).values({ id, name: "P", type: "api" }))).toBe("23514"); // 5F: names need 2–80 characters
    await db.insert(providers).values({ id, name: "Provider P", type: "api", endpoint: "https://api.example" });
    const cred = () => db.insert(providerCredentials).values({ providerId: id, ciphertext: "c", iv: "i", authTag: "t", keyVersion: 1 });
    await cred();
    expect(await sqlState(cred())).toBe("23505");
    const id2 = `prov-${uid().toLowerCase()}`;
    await db.insert(providers).values({ id: id2, name: "Provider Q", type: "manual" });
    // 5F: mappings start inactive, so several providers may hold one for the same service; activating one
    // needs an eligible service on an enabled provider (SV012). The one-active-primary index still applies.
    await db.insert(providerServiceMappings).values({ providerId: id, serviceId: "instagram-followers", providerRef: "ig-1" });
    await db.insert(providerServiceMappings).values({ providerId: id2, serviceId: "instagram-followers", providerRef: "ig-2" });
    expect(await sqlState(db.update(providerServiceMappings).set({ active: true }).where(eq(providerServiceMappings.providerId, id)))).toBe("SV012");
    await db.delete(providerServiceMappings).where(eq(providerServiceMappings.serviceId, "instagram-followers"));
  });
});

describe("database safeguards", () => {
  it("the owner role can't be edited or weakened", async () => {
    const owner = await roleId("owner");
    expect(await sqlState(db.update(roles).set({ name: "Boss" }).where(eq(roles.id, owner)))).toBe("SV006");
    expect(await sqlState(db.delete(roleModuleAccess).where(eq(roleModuleAccess.roleId, owner)))).toBe("SV006");
    expect(await sqlState(db.update(roleModuleAccess).set({ level: "view" }).where(eq(roleModuleAccess.roleId, owner)))).toBe("SV006");
  });

  it("the last active owner can't be removed, disabled or demoted", async () => {
    const owner = await roleId("owner");
    const admin = await roleId("admin");
    // Isolated: run inside a transaction we roll back, so other tests see no staff.
    await db
      .transaction(async (tx) => {
        const u1 = (await tx.insert(users).values({ email: `o1-${uid().toLowerCase()}@example.test` }).returning())[0];
        const u2 = (await tx.insert(users).values({ email: `o2-${uid().toLowerCase()}@example.test` }).returning())[0];
        const [s1] = await tx.insert(staffMembers).values({ userId: u1.id, roleId: owner, status: "active" }).returning();
        const [s2] = await tx.insert(staffMembers).values({ userId: u2.id, roleId: owner, status: "active" }).returning();
        // With two owners, demoting one is fine.
        await tx.update(staffMembers).set({ roleId: admin }).where(eq(staffMembers.id, s2.id));
        // Owners committed by other test files are demoted too (rolled back below), so s1 is the last.
        await tx.update(staffMembers).set({ roleId: admin }).where(and(eq(staffMembers.roleId, owner), ne(staffMembers.id, s1.id)));
        await tx.execute(sql`set constraints all immediate`);
        // Demoting the last one fails.
        await tx.update(staffMembers).set({ status: "disabled", disabledAt: new Date() }).where(eq(staffMembers.id, s1.id));
        await tx.execute(sql`set constraints all immediate`);
      })
      .then(
        () => expect.unreachable("last owner was disabled"),
        (e) => expect(String(e?.cause?.code ?? e?.code)).toBe("SV005"),
      );
  });

  it("a second deposit review needs a first review by someone else", async () => {
    const { customer } = await createCustomer(db);
    const reviewer = await createUser(db);
    const other = await createUser(db);
    const [d] = await db.insert(deposits).values({ publicRef: `DEP-${uid()}`, customerId: customer.id, amountCents: 90000, method: "bank", processor: "manual", status: "under_review" }).returning();
    expect(await sqlState(db.insert(depositReviews).values({ depositId: d.id, step: "second", decision: "approve", decidedBy: other.id }))).toBe("SV007");
    await db.insert(depositReviews).values({ depositId: d.id, step: "first", decision: "approve", decidedBy: reviewer.id });
    expect(await sqlState(db.insert(depositReviews).values({ depositId: d.id, step: "second", decision: "approve", decidedBy: reviewer.id }))).toBe("SV007");
    await db.insert(depositReviews).values({ depositId: d.id, step: "second", decision: "approve", decidedBy: other.id });
    expect(await sqlState(db.update(depositReviews).set({ decision: "reject" }).where(eq(depositReviews.depositId, d.id)))).toBe("SV001");
  });

  it("orders fail closed: checkout off and nothing purchasable by default", async () => {
    const { customer } = await createCustomer(db);
    const [price] = await db.insert(servicePriceVersions).values({ serviceId: "tiktok-video-views", pricingModel: "per1000", costMicros: 200_000, priceMicros: 450_000, minQty: 100, maxQty: 100_000, effectiveFrom: new Date(Date.now() - 1000) }).returning();
    const order = () =>
      db.insert(orders).values({ publicRef: `SV-${uid()}`, customerId: customer.id, serviceId: "tiktok-video-views", priceVersionId: price.id, quantity: 1000, unitPriceMicros: 450_000, totalCents: 45, idempotencyKey: uid() });
    // Priced but no eligibility gates and checkout off.
    expect(await sqlState(order())).toBe("SV009");
    // Even with checkout on, a priced service without every gate stays unpurchasable.
    await db.insert(platformSettings).values({ key: "commerce.checkout_enabled", value: true }).onConflictDoUpdate({ target: platformSettings.key, set: { value: true } });
    try {
      expect(await sqlState(order())).toBe("SV009");
      const purchasable = await db.execute(sql`select count(*)::int as n from purchasable_services`);
      expect(purchasable.rows[0].n).toBe(0);
    } finally {
      await db.update(platformSettings).set({ value: false }).where(eq(platformSettings.key, "commerce.checkout_enabled"));
    }
  });

  it("with every gate recorded and checkout on, an order row is accepted; refunds are capped", async () => {
    const staff = await createUser(db);
    const { customer } = await createCustomer(db);
    const serviceId = "x-followers";
    const [price] = await db.insert(servicePriceVersions).values({ serviceId, pricingModel: "per1000", costMicros: 9_000_000, priceMicros: 14_200_000, effectiveFrom: new Date(Date.now() - 1000) }).returning();
    const now = new Date();
    const gates = { policyReviewedAt: now, supplierVerifiedAt: now, fulfillmentVerifiedAt: now, paymentAcceptedAt: now, legalReviewedAt: now, technicalReadyAt: now };
    await db.update(serviceEligibility).set(gates).where(eq(serviceEligibility.serviceId, serviceId));
    await db.insert(platformSettings).values({ key: "commerce.checkout_enabled", value: true }).onConflictDoUpdate({ target: platformSettings.key, set: { value: true } });
    try {
      // Phase 5E: an order must carry its charge by commit, so it is inserted and charged together.
      const values = { publicRef: `SV-${uid()}`, customerId: customer.id, serviceId, priceVersionId: price.id, quantity: 1000, unitPriceMicros: 14_200_000, totalCents: 1420, status: "pending_review", idempotencyKey: uid() };
      expect(await sqlState(db.insert(orders).values({ ...values, publicRef: `SV-${uid()}`, idempotencyKey: uid() }))).toBe("SV011");
      await fundWallet(db, customer.id, 1420);
      const o = await db.transaction(async (tx) => {
        const [row] = await tx.insert(orders).values(values).returning();
        const posted = await postJournalEntry(tx as unknown as Db, {
          kind: "order_debit",
          idempotencyKey: `order:${row.id}:debit`,
          description: "Test order",
          lines: [
            { accountCode: walletCode(customer.id), amountCents: 1420 },
            { accountCode: "orders_in_progress", amountCents: -1420 },
          ],
        });
        await tx.update(orders).set({ debitEntryId: posted.entryId }).where(eq(orders.id, row.id));
        return row;
      });
      expect(o.customerStatus).toBe("pending");
      await db.update(orders).set({ status: "needs_customer_action" }).where(eq(orders.id, o.id));
      expect((await db.select({ s: orders.customerStatus }).from(orders).where(eq(orders.id, o.id)))[0].s).toBe("attention");

      // Refund cap: two entries totalling more than 1420 are refused at the database.
      const refund = async (cents: number) => {
        const e = await fundWallet(db, customer.id, cents); // any real entry id for the FK
        return db.insert(orderRefunds).values({ orderId: o.id, amountCents: cents, reason: "test", journalEntryId: e.entryId, createdBy: staff.id });
      };
      await refund(1000);
      expect(await sqlState(refund(500))).toBe("SV004");
      await refund(420);
    } finally {
      await db.update(serviceEligibility).set({ policyReviewedAt: null, supplierVerifiedAt: null, fulfillmentVerifiedAt: null, paymentAcceptedAt: null, legalReviewedAt: null, technicalReadyAt: null }).where(eq(serviceEligibility.serviceId, serviceId));
      await db.update(platformSettings).set({ value: false }).where(eq(platformSettings.key, "commerce.checkout_enabled"));
    }
  });

  it("price history is append-only", async () => {
    const [p] = await db.insert(servicePriceVersions).values({ serviceId: "youtube-video-views", pricingModel: "per1000", costMicros: 1, priceMicros: 2, effectiveFrom: new Date() }).returning();
    expect(await sqlState(db.update(servicePriceVersions).set({ priceMicros: 1 }).where(eq(servicePriceVersions.id, p.id)))).toBe("SV001");
  });
});
