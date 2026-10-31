-- Rollback for 0009_automations (development and test only).
DROP TABLE IF EXISTS automation_inbox;
DROP TABLE IF EXISTS automation_runs;
DROP TABLE IF EXISTS automations;
DROP FUNCTION IF EXISTS automation_runs_guard();
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
