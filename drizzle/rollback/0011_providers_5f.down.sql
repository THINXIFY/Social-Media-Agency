-- Rollback for 0011_providers_5f (development and test only).
DROP TRIGGER IF EXISTS provider_events_append_only ON provider_events;
DROP TRIGGER IF EXISTS fulfillment_attempts_guard ON fulfillment_attempts;
DROP TRIGGER IF EXISTS providers_mapping_sync ON providers;
DROP TRIGGER IF EXISTS service_eligibility_mapping_sync ON service_eligibility;
DROP TRIGGER IF EXISTS provider_service_mappings_active_guard ON provider_service_mappings;
DROP FUNCTION IF EXISTS sv_provider_events_append_only();
DROP FUNCTION IF EXISTS sv_check_fulfillment_attempt();
DROP FUNCTION IF EXISTS sv_deactivate_mappings_on_provider();
DROP FUNCTION IF EXISTS sv_deactivate_mappings_on_gate();
DROP FUNCTION IF EXISTS sv_check_mapping_active();
DROP TABLE IF EXISTS provider_events;
ALTER TABLE providers DROP CONSTRAINT IF EXISTS providers_text_check, DROP CONSTRAINT IF EXISTS providers_enable_check, DROP CONSTRAINT IF EXISTS providers_adapter_check, DROP COLUMN IF EXISTS adapter;
ALTER TABLE provider_service_mappings DROP CONSTRAINT IF EXISTS provider_service_mappings_note_check, DROP COLUMN IF EXISTS note, DROP COLUMN IF EXISTS created_by, DROP COLUMN IF EXISTS created_at, ALTER COLUMN active SET DEFAULT true;
DROP INDEX IF EXISTS fulfillment_attempts_one_active_key;
DROP INDEX IF EXISTS fulfillment_attempts_idempotency_key;
ALTER TABLE fulfillment_attempts DROP CONSTRAINT IF EXISTS fulfillment_attempts_status_check, DROP CONSTRAINT IF EXISTS fulfillment_attempts_submit_count_check,
  DROP COLUMN IF EXISTS idempotency_key, DROP COLUMN IF EXISTS submit_count, DROP COLUMN IF EXISTS provider_status, DROP COLUMN IF EXISTS error_code,
  DROP COLUMN IF EXISTS prepared_by, DROP COLUMN IF EXISTS resolved_by, DROP COLUMN IF EXISTS resolution;
ALTER TABLE fulfillment_attempts ADD CONSTRAINT fulfillment_attempts_status_check CHECK (status in ('queued', 'submitted', 'in_progress', 'partial', 'completed', 'failed', 'cancelled'));
CREATE UNIQUE INDEX fulfillment_attempts_one_active_key ON fulfillment_attempts (order_id) WHERE status in ('queued', 'submitted', 'in_progress');
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
