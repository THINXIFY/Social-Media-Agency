-- Rollback for 0004_deposits_5d (development and test only).
DROP TRIGGER IF EXISTS deposits_no_delete ON deposits;
DROP TRIGGER IF EXISTS deposits_change_check ON deposits;
DROP FUNCTION IF EXISTS sv_check_deposit_change();
ALTER TABLE deposits DROP CONSTRAINT IF EXISTS deposits_status_check;
ALTER TABLE deposits DROP CONSTRAINT IF EXISTS deposits_status_reason_check;
ALTER TABLE deposits DROP CONSTRAINT IF EXISTS deposits_currency_check;
DROP INDEX IF EXISTS deposits_idempotency_key;
ALTER TABLE deposits DROP COLUMN IF EXISTS status_reason, DROP COLUMN IF EXISTS request_hash, DROP COLUMN IF EXISTS idempotency_key,
  DROP COLUMN IF EXISTS network, DROP COLUMN IF EXISTS asset, DROP COLUMN IF EXISTS currency;
ALTER TABLE deposits ADD CONSTRAINT deposits_status_check CHECK (status in ('created', 'awaiting_payment', 'settling', 'settled', 'under_review', 'credited', 'rejected', 'expired', 'failed'));
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
