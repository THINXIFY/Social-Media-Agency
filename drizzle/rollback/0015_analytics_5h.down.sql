-- Rollback for 0015_analytics_5h (development and test only). Indexes only; no data changes.
DROP INDEX IF EXISTS automation_runs_started_idx;
DROP INDEX IF EXISTS journal_entries_kind_created_idx;
DROP INDEX IF EXISTS customers_created_idx;
DROP INDEX IF EXISTS audit_log_at_idx;
DROP INDEX IF EXISTS orders_placed_idx;
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
