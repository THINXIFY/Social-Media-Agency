-- Reverts drizzle/0003_catalog_wallets.sql (development/test only). Wallet accounts are kept
-- (ledger accounts are immutable by design); only the trigger and the service columns go.
DROP TRIGGER IF EXISTS customers_open_wallet ON customers;
DROP FUNCTION IF EXISTS sv_open_customer_wallet();
ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "services_text_lengths_check";
ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "services_fulfillment_type_check";
ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "services_updated_by_users_id_fk";
ALTER TABLE "services" DROP COLUMN IF EXISTS "updated_by";
ALTER TABLE "services" DROP COLUMN IF EXISTS "version";
ALTER TABLE "services" DROP COLUMN IF EXISTS "draft";
ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "services_qty_check";
ALTER TABLE "services" DROP COLUMN IF EXISTS "max_qty";
ALTER TABLE "services" DROP COLUMN IF EXISTS "min_qty";
ALTER TABLE "services" DROP COLUMN IF EXISTS "fulfillment_notes";
ALTER TABLE "services" DROP COLUMN IF EXISTS "fulfillment_provider_ref";
ALTER TABLE "services" DROP COLUMN IF EXISTS "fulfillment_type";
ALTER TABLE "services" DROP COLUMN IF EXISTS "internal_notes";
ALTER TABLE "services" DROP COLUMN IF EXISTS "instructions";
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
