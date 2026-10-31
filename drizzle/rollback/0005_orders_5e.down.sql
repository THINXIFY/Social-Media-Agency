-- Rollback for 0005_orders_5e (development and test only).
DROP TRIGGER IF EXISTS orders_paid_check ON orders;
DROP TRIGGER IF EXISTS orders_no_delete ON orders;
DROP TRIGGER IF EXISTS orders_change_check ON orders;
DROP FUNCTION IF EXISTS sv_check_order_paid();
DROP FUNCTION IF EXISTS sv_check_order_change();
DROP FUNCTION IF EXISTS sv_wallet_line(uuid, uuid, text);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check, DROP CONSTRAINT IF EXISTS orders_recognized_check, DROP CONSTRAINT IF EXISTS orders_released_check,
  DROP CONSTRAINT IF EXISTS orders_text_lengths_check, DROP CONSTRAINT IF EXISTS orders_fulfillment_method_check, DROP CONSTRAINT IF EXISTS orders_revenue_status_check,
  DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE order_events DROP CONSTRAINT IF EXISTS order_events_status_check;
DROP INDEX IF EXISTS orders_assigned_idx;
DROP INDEX IF EXISTS orders_recognition_entry_key;
DROP INDEX IF EXISTS orders_release_entry_key;
ALTER TABLE orders DROP COLUMN IF EXISTS closed_at, DROP COLUMN IF EXISTS completed_at, DROP COLUMN IF EXISTS started_at, DROP COLUMN IF EXISTS fulfillment_ref,
  DROP COLUMN IF EXISTS fulfillment_method, DROP COLUMN IF EXISTS assigned_to, DROP COLUMN IF EXISTS status_reason, DROP COLUMN IF EXISTS price_snapshot,
  DROP COLUMN IF EXISTS recognition_entry_id, DROP COLUMN IF EXISTS release_entry_id, DROP COLUMN IF EXISTS revenue_status, DROP COLUMN IF EXISTS payment_status,
  DROP COLUMN IF EXISTS request_hash;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status in ('pending_review', 'queued', 'in_progress', 'partial', 'needs_customer_action', 'completed', 'cancelled', 'failed', 'refunded'));
ALTER TABLE order_events ADD CONSTRAINT order_events_status_check CHECK ((from_status is null or from_status in ('pending_review', 'queued', 'in_progress', 'partial', 'needs_customer_action', 'completed', 'cancelled', 'failed', 'refunded')) and (to_status is null or to_status in ('pending_review', 'queued', 'in_progress', 'partial', 'needs_customer_action', 'completed', 'cancelled', 'failed', 'refunded')));
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
