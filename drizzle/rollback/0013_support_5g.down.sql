-- Rollback for 0013_support_5g (development and test only).
DROP TRIGGER IF EXISTS ticket_events_append_only ON ticket_events;
DROP TRIGGER IF EXISTS ticket_internal_notes_append_only ON ticket_internal_notes;
DROP TRIGGER IF EXISTS ticket_messages_append_only ON ticket_messages;
DROP FUNCTION IF EXISTS sv_support_append_only();
DROP TABLE IF EXISTS ticket_events;
DROP INDEX IF EXISTS ticket_messages_client_key;
DROP INDEX IF EXISTS tickets_idempotency_key;
ALTER TABLE ticket_messages DROP COLUMN IF EXISTS client_key;
UPDATE tickets SET status = 'awaiting' WHERE status = 'in_progress';
UPDATE tickets SET priority = 'normal' WHERE priority IN ('low', 'high');
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check, DROP CONSTRAINT IF EXISTS tickets_priority_check,
  DROP COLUMN IF EXISTS idempotency_key, DROP COLUMN IF EXISTS resolved_at, DROP COLUMN IF EXISTS closed_at;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check CHECK (status in ('awaiting', 'waiting', 'resolved', 'closed'));
ALTER TABLE tickets ADD CONSTRAINT tickets_priority_check CHECK (priority in ('normal', 'urgent'));
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
