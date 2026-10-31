import "server-only";
import { and, asc, count, desc, eq, ilike, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { COUNTRIES, TIMEZONES, validateProfile } from "@/lib/account";
import { audit } from "../audit";
import type { Db, Executor } from "../db/client";
import { accountBalances, customerFlags, customerPreferences, customers, ledgerAccounts, orders, users } from "../db/schema";
import { DATE_FORMAT, DISPLAY_CURRENCY } from "../db/schema/enums";
import { AppError, errors } from "../errors";

import { walletSummary } from "../wallet/wallet";

/**
 * Real customer profiles. Customers read and edit only their own record
 * (the id always comes from the session); staff read through permission
 * checks in the route layer. Nothing here is fabricated: every figure comes
 * from a stored record.
 */

export interface CustomerProfile {
  accountRef: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  country: string;
  accountType: "personal" | "business";
  businessName: string;
  website: string;
  createdAt: string;
}

export async function getOwnProfile(db: Executor, customerId: string): Promise<CustomerProfile> {
  const [row] = await db
    .select({ c: customers, email: users.email, verified: users.emailVerifiedAt })
    .from(customers)
    .innerJoin(users, eq(users.id, customers.userId))
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!row) throw errors.notFound("Your profile");
  const { c } = row;
  return {
    accountRef: c.accountRef,
    email: row.email,
    emailVerified: Boolean(row.verified),
    firstName: c.firstName,
    lastName: c.lastName,
    displayName: c.displayName ?? c.firstName,
    phone: c.phone ?? "",
    country: c.country ?? "",
    accountType: c.accountType === "business" ? "business" : "personal",
    businessName: c.businessName ?? "",
    website: c.website ?? "",
    createdAt: c.createdAt.toISOString(),
  };
}

export const profileInputSchema = z
  .object({
    firstName: z.string().max(80),
    lastName: z.string().max(80),
    displayName: z.string().max(80),
    phone: z.string().max(40).default(""),
    country: z.string().max(80).default(""),
    accountType: z.enum(["personal", "business"]),
    businessName: z.string().max(120).default(""),
    website: z.string().max(200).default(""),
  })
  .strict();

/** Updates the permitted profile fields. Email changes are not allowed here (they need re-verification). */
export async function updateOwnProfile(db: Db, actor: { userId: string; customerId: string }, raw: unknown, client: { ip?: string | null; userAgent?: string | null } = {}) {
  const input = profileInputSchema.parse(raw);
  const current = await getOwnProfile(db, actor.customerId);
  const problems = validateProfile({
    firstName: input.firstName,
    lastName: input.lastName,
    displayName: input.displayName,
    email: current.email,
    phone: input.phone,
    country: input.country,
    timezone: "UTC",
    accountType: input.accountType,
    business: { name: input.businessName, website: input.website, country: input.country, reference: "" },
  });
  const first = Object.entries(problems).find(([, v]) => v);
  if (first) throw new AppError("VALIDATION_FAILED", first[1]!, { details: { field: first[0] === "businessName" ? "businessName" : first[0] } });
  if (input.country && !COUNTRIES.includes(input.country)) throw new AppError("VALIDATION_FAILED", "Choose a country from the list.", { details: { field: "country" } });

  const business = input.accountType === "business";
  await db.transaction(async (tx) => {
    await tx
      .update(customers)
      .set({
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        displayName: input.displayName.trim(),
        phone: input.phone.trim() || null,
        country: input.country || null,
        accountType: input.accountType,
        businessName: business ? input.businessName.trim() : null,
        website: business ? input.website.trim() || null : null,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, actor.customerId));
    await tx.update(users).set({ name: input.displayName.trim().slice(0, 80), updatedAt: new Date() }).where(eq(users.id, actor.userId));
    await audit(tx, { actorUserId: actor.userId, actorType: "customer", action: "customer.profile_updated", targetType: "customer", targetId: actor.customerId, ip: client.ip, userAgent: client.userAgent });
  });
  return getOwnProfile(db, actor.customerId);
}

/* Preferences --------------------------------------------------------------- */

export const preferencesSchema = z
  .object({
    displayCurrency: z.enum(DISPLAY_CURRENCY),
    timezone: z.string().refine((v) => TIMEZONES.some((t) => t.id === v), "Choose a time zone from the list."),
    dateFormat: z.enum(DATE_FORMAT),
    reduceMotion: z.boolean(),
  })
  .strict();

export async function getPreferences(db: Executor, customerId: string) {
  const [p] = await db.select().from(customerPreferences).where(eq(customerPreferences.customerId, customerId)).limit(1);
  return {
    language: p?.language ?? "en",
    displayCurrency: (p?.displayCurrency ?? "USD") as (typeof DISPLAY_CURRENCY)[number],
    timezone: p?.timezone ?? "UTC",
    dateFormat: (p?.dateFormat ?? "mdy") as (typeof DATE_FORMAT)[number],
    reduceMotion: p?.reduceMotion ?? false,
  };
}

export async function updatePreferences(db: Db, actor: { userId: string; customerId: string }, raw: unknown) {
  const input = preferencesSchema.parse(raw);
  await db
    .insert(customerPreferences)
    .values({ customerId: actor.customerId, ...input })
    .onConflictDoUpdate({ target: customerPreferences.customerId, set: { ...input, updatedAt: new Date() } });
  return getPreferences(db, actor.customerId);
}

/* Staff directory ----------------------------------------------------------- */

export const directoryQuerySchema = z.object({
  q: z.string().trim().max(80).optional().default(""),
  verified: z.enum(["yes", "no"]).optional(),
  status: z.enum(["active", "locked", "disabled"]).optional(),
  sort: z.enum(["newest", "oldest", "name"]).optional().default("newest"),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
});

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listCustomers(db: Db, raw: z.input<typeof directoryQuerySchema>) {
  const q = directoryQuerySchema.parse(raw);
  const conds: SQL[] = [];
  for (const term of q.q.split(/\s+/).filter(Boolean).slice(0, 5)) {
    const p = `%${likeEscape(term)}%`;
    conds.push(or(ilike(customers.firstName, p), ilike(customers.lastName, p), ilike(customers.displayName, p), ilike(users.email, p), ilike(customers.publicRef, p), ilike(customers.accountRef, p))!);
  }
  if (q.verified === "yes") conds.push(isNotNull(users.emailVerifiedAt));
  if (q.verified === "no") conds.push(isNull(users.emailVerifiedAt));
  if (q.status) conds.push(eq(users.status, q.status));
  const where = conds.length ? and(...conds) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(customers).innerJoin(users, eq(users.id, customers.userId)).where(where);
  const rows = await db
    .select({
      id: customers.id,
      publicRef: customers.publicRef,
      accountRef: customers.accountRef,
      firstName: customers.firstName,
      lastName: customers.lastName,
      displayName: customers.displayName,
      country: customers.country,
      createdAt: customers.createdAt,
      email: users.email,
      verified: users.emailVerifiedAt,
      status: users.status,
      balanceCents: sql<number>`coalesce((select b.balance_cents from ${accountBalances} b join ${ledgerAccounts} a on a.id = b.account_id where a.code = 'wallet:' || lower(${customers.id}::text)), 0)::bigint`.mapWith(Number),
      orderCount: sql<number>`(select count(*) from ${orders} o where o.customer_id = ${customers.id})::int`.mapWith(Number),
      lastSignInAt: sql<string | null>`(select max(l.at) from audit_log l where l.actor_user_id = ${users.id} and l.action = 'auth.login')`,
    })
    .from(customers)
    .innerJoin(users, eq(users.id, customers.userId))
    .where(where)
    .orderBy(...(q.sort === "name" ? [asc(customers.firstName), asc(customers.lastName)] : q.sort === "oldest" ? [asc(customers.createdAt)] : [desc(customers.createdAt)]))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  return {
    items: rows.map((r) => ({
      publicRef: r.publicRef,
      accountRef: r.accountRef,
      name: r.displayName || `${r.firstName} ${r.lastName}`.trim(),
      email: r.email,
      country: r.country,
      createdAt: r.createdAt.toISOString(),
      emailVerified: Boolean(r.verified),
      status: r.status,
      balanceCents: r.balanceCents,
      orderCount: r.orderCount,
      lastSignInAt: r.lastSignInAt ? new Date(r.lastSignInAt).toISOString() : null,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
    pages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

export async function getCustomerForStaff(db: Db, publicRef: string) {
  if (!/^CUS-[A-Z0-9]{1,20}$/.test(publicRef)) return null;
  const [row] = await db.select({ c: customers, u: users }).from(customers).innerJoin(users, eq(users.id, customers.userId)).where(eq(customers.publicRef, publicRef)).limit(1);
  if (!row) return null;
  const { c, u } = row;
  const [wallet, [{ orderCount }], [{ openFlags }], [last]] = await Promise.all([
    walletSummary(db, c.id),
    db.select({ orderCount: count() }).from(orders).where(eq(orders.customerId, c.id)),
    db.select({ openFlags: count() }).from(customerFlags).where(and(eq(customerFlags.customerId, c.id), isNull(customerFlags.resolvedAt))),
    db.execute<{ at: string | null }>(sql`select max(at) as at from audit_log where actor_user_id = ${u.id} and action = 'auth.login'`).then((r) => r.rows),
  ]);
  return {
    publicRef: c.publicRef,
    accountRef: c.accountRef,
    name: c.displayName || `${c.firstName} ${c.lastName}`.trim(),
    firstName: c.firstName,
    lastName: c.lastName,
    email: u.email,
    emailVerified: Boolean(u.emailVerifiedAt),
    status: u.status,
    phone: c.phone,
    country: c.country,
    accountType: c.accountType,
    businessName: c.businessName,
    website: c.website,
    createdAt: c.createdAt.toISOString(),
    lastSignInAt: last?.at ? new Date(last.at).toISOString() : null,
    wallet,
    orderCount,
    openFlags,
  };
}

/* Signed-in customer snapshot ----------------------------------------------- */

/** Everything the live dashboard shell needs for the signed-in customer, from stored records only. */
export async function accountSnapshot(db: Executor, customerId: string) {
  const [profile, wallet, preferences, [{ n }]] = await Promise.all([
    getOwnProfile(db, customerId),
    walletSummary(db, customerId),
    getPreferences(db, customerId),
    db.select({ n: count() }).from(orders).where(eq(orders.customerId, customerId)),
  ]);
  return { profile, wallet, preferences, orderCount: Number(n) };
}
