ALTER TABLE "services" ADD COLUMN "instructions" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "internal_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "fulfillment_type" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "fulfillment_provider_ref" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "fulfillment_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "min_qty" integer;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "max_qty" integer;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "draft" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_qty_check" CHECK (("services"."min_qty" is null or "services"."min_qty" >= 1) and ("services"."max_qty" is null or "services"."max_qty" >= 1) and ("services"."min_qty" is null or "services"."max_qty" is null or "services"."max_qty" >= "services"."min_qty"));--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_fulfillment_type_check" CHECK ("services"."fulfillment_type" in ('manual', 'provider'));--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_text_lengths_check" CHECK (length("services"."name") between 3 and 120 and length("services"."description") <= 1000 and length("services"."instructions") <= 1000 and length("services"."internal_notes") <= 1000 and length("services"."fulfillment_notes") <= 1000 and length("services"."fulfillment_provider_ref") <= 40);
--> statement-breakpoint
-- Every customer has exactly one USD wallet (a liability that can never go negative),
-- opened when the customer row is created. Balance starts at zero: no ledger entry.
CREATE FUNCTION sv_open_customer_wallet() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO ledger_accounts (code, type, customer_id, currency, is_system, allow_negative)
  VALUES ('wallet:' || lower(NEW.id::text), 'liability', NEW.id, 'USD', false, false)
  ON CONFLICT (code) DO NOTHING;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER customers_open_wallet AFTER INSERT ON customers FOR EACH ROW EXECUTE FUNCTION sv_open_customer_wallet();
--> statement-breakpoint
-- Backfill wallets for customers created before this migration (idempotent).
INSERT INTO ledger_accounts (code, type, customer_id, currency, is_system, allow_negative)
SELECT 'wallet:' || lower(c.id::text), 'liability', c.id, 'USD', false, false
FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM ledger_accounts a WHERE a.code = 'wallet:' || lower(c.id::text));
