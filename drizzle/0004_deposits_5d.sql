ALTER TABLE "deposits" DROP CONSTRAINT "deposits_status_check";--> statement-breakpoint
ALTER TABLE "deposits" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "deposits" ADD COLUMN "asset" text;--> statement-breakpoint
ALTER TABLE "deposits" ADD COLUMN "network" text;--> statement-breakpoint
ALTER TABLE "deposits" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "deposits" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "deposits" ADD COLUMN "status_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX "deposits_idempotency_key" ON "deposits" USING btree ("customer_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_currency_check" CHECK ("deposits"."currency" = 'USD');--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_status_reason_check" CHECK ("deposits"."status_reason" is null or length("deposits"."status_reason") between 3 and 300);--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_status_check" CHECK ("deposits"."status" in ('created', 'awaiting_payment', 'settling', 'settled', 'under_review', 'credited', 'rejected', 'expired', 'failed', 'cancelled'));--> statement-breakpoint
-- Deposit safeguards (Phase 5D) — SQLSTATE SV010 ----------------------------
-- Defence in depth for the deposit state machine: only these transitions are
-- possible, identity/amount/customer never change, terminal states are final,
-- and "credited" must point at a deposit_credit entry that pays exactly the
-- deposit amount into this customer's wallet.
CREATE FUNCTION sv_check_deposit_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed boolean;
  wallet_credit bigint;
BEGIN
  IF NEW.public_ref <> OLD.public_ref OR NEW.customer_id <> OLD.customer_id OR NEW.amount_cents <> OLD.amount_cents
     OR NEW.currency <> OLD.currency OR NEW.method <> OLD.method OR NEW.processor <> OLD.processor
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.requested_at <> OLD.requested_at THEN
    RAISE EXCEPTION 'deposit identity, customer and amount cannot change' USING ERRCODE = 'SV010';
  END IF;
  IF OLD.processor_ref IS NOT NULL AND NEW.processor_ref IS DISTINCT FROM OLD.processor_ref THEN
    RAISE EXCEPTION 'recorded payment reference cannot change' USING ERRCODE = 'SV010';
  END IF;
  IF NEW.status <> OLD.status THEN
    allowed := CASE OLD.status
      WHEN 'created' THEN NEW.status IN ('awaiting_payment', 'cancelled', 'failed')
      WHEN 'awaiting_payment' THEN NEW.status IN ('settling', 'under_review', 'expired', 'cancelled', 'failed', 'rejected')
      WHEN 'settling' THEN NEW.status IN ('settled', 'failed')
      WHEN 'settled' THEN NEW.status IN ('credited', 'under_review')
      WHEN 'expired' THEN NEW.status IN ('under_review')
      WHEN 'under_review' THEN NEW.status IN ('credited', 'rejected')
      ELSE false
    END;
    IF NOT allowed THEN
      RAISE EXCEPTION 'deposit cannot move from % to %', OLD.status, NEW.status USING ERRCODE = 'SV010';
    END IF;
  ELSIF OLD.status IN ('credited', 'rejected', 'cancelled', 'failed') AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
    RAISE EXCEPTION 'a closed deposit cannot change' USING ERRCODE = 'SV010';
  END IF;
  IF NEW.status = 'credited' AND OLD.status <> 'credited' THEN
    SELECT -l.amount_cents INTO wallet_credit
      FROM journal_entries e
      JOIN journal_lines l ON l.entry_id = e.id
      JOIN ledger_accounts a ON a.id = l.account_id
     WHERE e.id = NEW.credited_entry_id AND e.kind = 'deposit_credit'
       AND a.code = 'wallet:' || lower(NEW.customer_id::text);
    IF wallet_credit IS NULL OR wallet_credit <> NEW.amount_cents THEN
      RAISE EXCEPTION 'credited deposit must match a deposit_credit entry for the same customer and amount' USING ERRCODE = 'SV010';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER deposits_change_check BEFORE UPDATE ON deposits FOR EACH ROW EXECUTE FUNCTION sv_check_deposit_change();
--> statement-breakpoint
CREATE TRIGGER deposits_no_delete BEFORE DELETE ON deposits FOR EACH ROW EXECUTE FUNCTION sv_forbid_mutation();
