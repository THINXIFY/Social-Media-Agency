-- Rollback for 0016_reports_5h (development and test only). Indexes only; no data changes.
DROP INDEX IF EXISTS deposits_requested_idx;
DROP INDEX IF EXISTS referrals_attributed_idx;
DROP INDEX IF EXISTS tickets_created_idx;
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
