import "server-only";
import { createHash } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { type Db } from "../db/client";
import { accountBalances, journalEntries, journalLines, ledgerAccounts } from "../db/schema";
import { JOURNAL_KIND } from "../db/schema/enums";
import { AppError, errors, fromDatabaseError, pgErrorOf } from "../errors";
import { assertCents } from "./money";

/**
 * The only code that writes to the ledger. Internal: it is called by
 * permission-checked domain services, never directly by a route or action.
 *
 * Guarantees (backed by database triggers as a second line of defence):
 *  - entries balance (sum of lines = 0) and have ≥ 2 lines;
 *  - entries are immutable; corrections are new `reversal` entries;
 *  - the same idempotency key never posts twice (a retry returns the original);
 *  - accounts that can't go negative (wallets) are locked and checked first,
 *    so concurrent debits are serialised and can't overdraw.
 */

const postingSchema = z.object({
  kind: z.enum(JOURNAL_KIND),
  idempotencyKey: z.string().min(8).max(200),
  description: z.string().trim().min(1).max(300),
  reference: z.object({ type: z.string().min(1).max(40), id: z.string().min(1).max(80) }).optional(),
  createdBy: z.string().uuid().nullable().optional(),
  approvedBy: z.string().uuid().nullable().optional(),
  lines: z
    .array(z.object({ accountCode: z.string().min(1).max(120), amountCents: z.number().int().refine((n) => n !== 0, "must not be zero") }))
    .min(2)
    .max(20),
});

export type PostingRequest = z.input<typeof postingSchema>;
export interface PostingResult {
  entryId: string;
  /** True when this idempotency key was already posted and the original entry is returned. */
  replayed: boolean;
}

const hashOf = (p: z.output<typeof postingSchema>) =>
  createHash("sha256")
    .update(JSON.stringify({ k: p.kind, d: p.description, r: p.reference ?? null, c: p.createdBy ?? null, a: p.approvedBy ?? null, l: [...p.lines].sort((x, y) => x.accountCode.localeCompare(y.accountCode)) }))
    .digest("hex");

export async function postJournalEntry(db: Db, request: PostingRequest): Promise<PostingResult> {
  const p = postingSchema.parse(request);
  for (const l of p.lines) assertCents(l.amountCents, "line amount");
  if (p.lines.reduce((s, l) => s + l.amountCents, 0) !== 0) throw errors.ledger("Ledger entries must balance.");
  if (new Set(p.lines.map((l) => l.accountCode)).size !== p.lines.length) throw errors.ledger("Each account may appear once per entry.");
  if (p.createdBy && p.approvedBy && p.createdBy === p.approvedBy) throw errors.conflict("The approver must be a different person.");
  const requestHash = hashOf(p);

  const replay = async (): Promise<PostingResult | null> => {
    const [existing] = await db.select({ id: journalEntries.id, requestHash: journalEntries.requestHash }).from(journalEntries).where(eq(journalEntries.idempotencyKey, p.idempotencyKey)).limit(1);
    if (!existing) return null;
    if (existing.requestHash !== requestHash) throw errors.idempotencyConflict();
    return { entryId: existing.id, replayed: true };
  };

  const earlier = await replay();
  if (earlier) return earlier;

  try {
    return await db.transaction(async (tx) => {
      const codes = p.lines.map((l) => l.accountCode);
      // Lock in a stable order (by id) to avoid deadlocks between concurrent postings.
      const accounts = await tx
        .select({ id: ledgerAccounts.id, code: ledgerAccounts.code, type: ledgerAccounts.type, allowNegative: ledgerAccounts.allowNegative })
        .from(ledgerAccounts)
        .where(inArray(ledgerAccounts.code, codes))
        .orderBy(ledgerAccounts.id)
        .for("update");
      if (accounts.length !== codes.length) throw errors.ledger("Unknown ledger account.");
      const byCode = new Map(accounts.map((a) => [a.code, a]));

      const guarded = accounts.filter((a) => !a.allowNegative);
      if (guarded.length) {
        const balances = await tx
          .select()
          .from(accountBalances)
          .where(
            inArray(
              accountBalances.accountId,
              guarded.map((a) => a.id),
            ),
          );
        const current = new Map(balances.map((b) => [b.accountId, b.balanceCents]));
        for (const a of guarded) {
          const line = p.lines.find((l) => l.accountCode === a.code)!;
          const delta = a.type === "liability" || a.type === "revenue" ? -line.amountCents : line.amountCents;
          if ((current.get(a.id) ?? 0) + delta < 0) throw errors.insufficientFunds();
        }
      }

      const [entry] = await tx
        .insert(journalEntries)
        .values({
          kind: p.kind,
          idempotencyKey: p.idempotencyKey,
          requestHash,
          description: p.description,
          referenceType: p.reference?.type,
          referenceId: p.reference?.id,
          createdBy: p.createdBy ?? null,
          approvedBy: p.approvedBy ?? null,
        })
        .returning({ id: journalEntries.id });
      await tx.insert(journalLines).values(p.lines.map((l) => ({ entryId: entry.id, accountId: byCode.get(l.accountCode)!.id, amountCents: l.amountCents })));
      return { entryId: entry.id, replayed: false };
    });
  } catch (e) {
    // A concurrent request with the same key won the race: return its entry.
    const pg = pgErrorOf(e);
    if (pg?.code === "23505" && pg.constraint === "journal_entries_idempotency_key") {
      const winner = await replay();
      if (winner) return winner;
    }
    if (e instanceof AppError) throw e;
    throw fromDatabaseError(e) ?? e;
  }
}

/** Normal-side balance of an account, in cents (0 when it has no postings). */
export async function balanceOf(db: Db, accountCode: string): Promise<number> {
  const [row] = await db
    .select({ balance: accountBalances.balanceCents })
    .from(ledgerAccounts)
    .leftJoin(accountBalances, eq(accountBalances.accountId, ledgerAccounts.id))
    .where(eq(ledgerAccounts.code, accountCode))
    .limit(1);
  if (!row) throw errors.notFound("That ledger account");
  return row.balance ?? 0;
}

export interface LedgerCheck {
  ok: boolean;
  unbalancedEntries: number;
  balanceMismatches: { code: string; stored: number; computed: number }[];
}

/** Recomputes every balance from the lines and checks every entry balances. Read-only. */
export async function verifyLedger(db: Db): Promise<LedgerCheck> {
  const unbalanced = await db.execute<{ n: string }>(sql`
    select count(*)::text as n from (
      select e.id from journal_entries e left join journal_lines l on l.entry_id = e.id
      group by e.id having count(l.id) < 2 or coalesce(sum(l.amount_cents), 0) <> 0
    ) x`);
  const mismatches = await db.execute<{ code: string; stored: string; computed: string }>(sql`
    select a.code,
           coalesce(b.balance_cents, 0)::text as stored,
           (case when a.type in ('liability', 'revenue') then -1 else 1 end * coalesce(sum(l.amount_cents), 0))::text as computed
    from ledger_accounts a
    left join account_balances b on b.account_id = a.id
    left join journal_lines l on l.account_id = a.id
    group by a.id, a.code, a.type, b.balance_cents
    having coalesce(b.balance_cents, 0) <> case when a.type in ('liability', 'revenue') then -1 else 1 end * coalesce(sum(l.amount_cents), 0)`);
  const balanceMismatches = mismatches.rows.map((r) => ({ code: r.code, stored: Number(r.stored), computed: Number(r.computed) }));
  const unbalancedEntries = Number(unbalanced.rows[0]?.n ?? 0);
  return { ok: unbalancedEntries === 0 && balanceMismatches.length === 0, unbalancedEntries, balanceMismatches };
}
