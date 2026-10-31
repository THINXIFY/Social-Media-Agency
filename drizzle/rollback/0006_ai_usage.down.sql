-- Rollback for 0006_ai_usage (development and test only).
DROP TABLE IF EXISTS ai_usage_events;
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
