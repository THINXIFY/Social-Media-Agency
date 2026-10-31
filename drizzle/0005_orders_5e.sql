ALTER TABLE "order_events" DROP CONSTRAINT "order_events_status_check";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_status_check";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_status" text DEFAULT 'charged' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "revenue_status" text DEFAULT 'deferred' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "release_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "recognition_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "price_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "assigned_to" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment_method" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment_ref" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_release_entry_id_journal_entries_id_fk" FOREIGN KEY ("release_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_recognition_entry_id_journal_entries_id_fk" FOREIGN KEY ("recognition_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_release_entry_key" ON "orders" USING btree ("release_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_recognition_entry_key" ON "orders" USING btree ("recognition_entry_id");--> statement-breakpoint
CREATE INDEX "orders_assigned_idx" ON "orders" USING btree ("assigned_to");--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_status_check" CHECK (("order_events"."from_status" is null or "order_events"."from_status" in ('pending_review', 'queued', 'in_progress', 'partial', 'needs_customer_action', 'completed', 'cancelled', 'failed', 'refunded', 'rejected')) and ("order_events"."to_status" is null or "order_events"."to_status" in ('pending_review', 'queued', 'in_progress', 'partial', 'needs_customer_action', 'completed', 'cancelled', 'failed', 'refunded', 'rejected')));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_status_check" CHECK ("orders"."payment_status" in ('charged', 'released', 'refund_review', 'refunded'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_revenue_status_check" CHECK ("orders"."revenue_status" in ('deferred', 'recognized', 'reversed'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfillment_method_check" CHECK ("orders"."fulfillment_method" is null or "orders"."fulfillment_method" = 'manual');--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_text_lengths_check" CHECK (("orders"."status_reason" is null or length("orders"."status_reason") between 3 and 500) and ("orders"."fulfillment_ref" is null or length("orders"."fulfillment_ref") between 2 and 80) and ("orders"."link" is null or length("orders"."link") <= 500));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_released_check" CHECK (("orders"."payment_status" = 'released') = ("orders"."release_entry_id" is not null));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_recognized_check" CHECK (("orders"."revenue_status" = 'recognized') = ("orders"."recognition_entry_id" is not null));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_check" CHECK ("orders"."status" in ('pending_review', 'queued', 'in_progress', 'partial', 'needs_customer_action', 'completed', 'cancelled', 'failed', 'refunded', 'rejected'));
--> statement-breakpoint
-- Order safeguards (Phase 5E) — SQLSTATE SV011 -------------------------------
-- Second line of defence for the order lifecycle and its money:
--  * only these status transitions; terminal orders never change;
--  * identity, customer, service, price snapshot and amounts never change;
--  * the charge is set once and must be an order_debit taking exactly the total
--    from this customer's wallet; a release must return exactly the total;
--  * cancelled/rejected orders must have released their funds;
--  * completion needs recorded fulfilment (start time, reference, completion time);
--  * link and details can change only while the customer is asked for them;
--  * by commit, every order carries its charge (no unpaid orders).
CREATE FUNCTION sv_wallet_line(entry uuid, customer uuid, want_kind text) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT l.amount_cents FROM journal_entries e
    JOIN journal_lines l ON l.entry_id = e.id
    JOIN ledger_accounts a ON a.id = l.account_id
   WHERE e.id = entry AND e.kind = want_kind AND a.code = 'wallet:' || lower(customer::text)
$$;
--> statement-breakpoint
CREATE FUNCTION sv_check_order_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed boolean;
BEGIN
  IF NEW.public_ref <> OLD.public_ref OR NEW.customer_id <> OLD.customer_id OR NEW.service_id <> OLD.service_id
     OR NEW.price_version_id <> OLD.price_version_id OR NEW.quantity <> OLD.quantity OR NEW.unit_price_micros <> OLD.unit_price_micros
     OR NEW.total_cents <> OLD.total_cents OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
     OR NEW.placed_at <> OLD.placed_at OR NEW.price_snapshot <> OLD.price_snapshot THEN
    RAISE EXCEPTION 'order identity, price and amounts cannot change' USING ERRCODE = 'SV011';
  END IF;
  IF (OLD.debit_entry_id IS NOT NULL AND NEW.debit_entry_id IS DISTINCT FROM OLD.debit_entry_id)
     OR (OLD.release_entry_id IS NOT NULL AND NEW.release_entry_id IS DISTINCT FROM OLD.release_entry_id)
     OR (OLD.recognition_entry_id IS NOT NULL AND NEW.recognition_entry_id IS DISTINCT FROM OLD.recognition_entry_id) THEN
    RAISE EXCEPTION 'recorded ledger references cannot change' USING ERRCODE = 'SV011';
  END IF;
  IF OLD.status IN ('completed', 'cancelled', 'rejected', 'refunded') AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
    -- The one permitted change to a completed order: recognising its revenue once.
    IF NOT (OLD.status = 'completed' AND NEW.status = 'completed' AND OLD.recognition_entry_id IS NULL AND NEW.recognition_entry_id IS NOT NULL) THEN
      RAISE EXCEPTION 'a closed order cannot change' USING ERRCODE = 'SV011';
    END IF;
  END IF;
  IF (NEW.link IS DISTINCT FROM OLD.link OR NEW.field_values <> OLD.field_values) AND OLD.status <> 'needs_customer_action' THEN
    RAISE EXCEPTION 'order details can change only while information is requested' USING ERRCODE = 'SV011';
  END IF;
  IF NEW.status <> OLD.status THEN
    allowed := CASE OLD.status
      WHEN 'pending_review' THEN NEW.status IN ('queued', 'rejected', 'cancelled', 'needs_customer_action')
      WHEN 'needs_customer_action' THEN NEW.status IN ('pending_review', 'rejected', 'cancelled')
      WHEN 'queued' THEN NEW.status IN ('in_progress', 'cancelled', 'needs_customer_action', 'failed')
      WHEN 'in_progress' THEN NEW.status IN ('completed', 'failed', 'partial')
      WHEN 'partial' THEN NEW.status IN ('completed', 'failed')
      WHEN 'failed' THEN NEW.status IN ('refunded')
      ELSE false
    END;
    IF NOT allowed THEN
      RAISE EXCEPTION 'order cannot move from % to %', OLD.status, NEW.status USING ERRCODE = 'SV011';
    END IF;
  END IF;
  IF NEW.status = 'completed' AND (NEW.started_at IS NULL OR NEW.completed_at IS NULL OR NEW.fulfillment_ref IS NULL) THEN
    RAISE EXCEPTION 'completion needs recorded fulfilment' USING ERRCODE = 'SV011';
  END IF;
  IF NEW.status IN ('cancelled', 'rejected') AND NEW.payment_status <> 'released' THEN
    RAISE EXCEPTION 'cancelled or rejected orders must release their funds' USING ERRCODE = 'SV011';
  END IF;
  IF NEW.debit_entry_id IS NOT NULL AND OLD.debit_entry_id IS NULL
     AND sv_wallet_line(NEW.debit_entry_id, NEW.customer_id, 'order_debit') IS DISTINCT FROM NEW.total_cents THEN
    RAISE EXCEPTION 'the charge must take exactly the order total from the customer wallet' USING ERRCODE = 'SV011';
  END IF;
  IF NEW.release_entry_id IS NOT NULL AND OLD.release_entry_id IS NULL
     AND sv_wallet_line(NEW.release_entry_id, NEW.customer_id, 'order_cancel') IS DISTINCT FROM -NEW.total_cents THEN
    RAISE EXCEPTION 'the release must return exactly the order total to the customer wallet' USING ERRCODE = 'SV011';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER orders_change_check BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION sv_check_order_change();
--> statement-breakpoint
CREATE TRIGGER orders_no_delete BEFORE DELETE ON orders FOR EACH ROW EXECUTE FUNCTION sv_forbid_mutation();
--> statement-breakpoint
CREATE FUNCTION sv_check_order_paid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM orders WHERE id = NEW.id AND debit_entry_id IS NULL) THEN
    RAISE EXCEPTION 'an order must be charged in the same transaction it is created' USING ERRCODE = 'SV011';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER orders_paid_check AFTER INSERT ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sv_check_order_paid();
