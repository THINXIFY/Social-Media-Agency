import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { JOURNAL_KIND, LEDGER_ACCOUNT_TYPE } from "./enums";
import { createdAt, oneOf, updatedAt } from "./helpers";
import { customers, users } from "./identity";

/**
 * Double-entry ledger (DATABASE.md §6). Amounts are integer USD cents.
 * Line sign convention: debit = positive, credit = negative; every entry sums to 0.
 *
 * Database triggers (migration 0001) enforce:
 *  - entries and lines are append-only (no UPDATE / DELETE / TRUNCATE);
 *  - every entry has ≥ 2 lines that sum to zero (checked at commit);
 *  - `account_balances` is maintained only by the trigger and can't go below
 *    zero for accounts with `allow_negative = false` (customer wallets).
 */
export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** e.g. `wallet:<customer uuid>`, `revenue:orders`, `processor_clearing:<processor>`. */
    code: text("code").notNull(),
    type: text("type").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "restrict" }),
    currency: text("currency").notNull().default("USD"),
    isSystem: boolean("is_system").notNull().default(false),
    /** Wallets (money owed to a customer) must never go negative. */
    allowNegative: boolean("allow_negative").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("ledger_accounts_code_key").on(t.code),
    uniqueIndex("ledger_accounts_customer_wallet_key")
      .on(t.customerId)
      .where(sql`${t.code} like 'wallet:%'`),
    check("ledger_accounts_type_check", oneOf(t.type, LEDGER_ACCOUNT_TYPE)),
    check("ledger_accounts_currency_check", sql`${t.currency} = 'USD'`),
    check("ledger_accounts_code_check", sql`${t.code} ~ '^[a-z_]+(:[a-z0-9_-]+)?$'`),
    check("ledger_accounts_wallet_check", sql`${t.code} not like 'wallet:%' or (${t.type} = 'liability' and ${t.customerId} is not null and not ${t.allowNegative})`),
  ],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    /** Retries with the same key return the original entry instead of posting twice. */
    idempotencyKey: text("idempotency_key").notNull(),
    /** Hash of the posting request, so a reused key with different content is rejected. */
    requestHash: text("request_hash").notNull(),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    description: text("description").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "restrict" }),
    /** Second person for four-eyes operations. */
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("journal_entries_idempotency_key").on(t.idempotencyKey),
    index("journal_entries_reference_idx").on(t.referenceType, t.referenceId),
    index("journal_entries_kind_created_idx").on(t.kind, t.createdAt),
    check("journal_entries_kind_check", oneOf(t.kind, JOURNAL_KIND)),
    check("journal_entries_idempotency_check", sql`length(${t.idempotencyKey}) between 8 and 200`),
    check("journal_entries_four_eyes_check", sql`${t.approvedBy} is null or ${t.createdBy} is null or ${t.approvedBy} <> ${t.createdBy}`),
  ],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "restrict" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("journal_lines_entry_idx").on(t.entryId), index("journal_lines_account_idx").on(t.accountId), check("journal_lines_nonzero_check", sql`${t.amountCents} <> 0`)],
);

/**
 * Running balance per account on its normal side (assets/expenses: debits − credits;
 * liabilities/revenue: credits − debits). Written only by the ledger trigger and
 * verified nightly against SUM(journal_lines).
 */
export const accountBalances = pgTable("account_balances", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
  balanceCents: bigint("balance_cents", { mode: "number" }).notNull().default(0),
  version: integer("version").notNull().default(0),
  updatedAt: updatedAt(),
});
