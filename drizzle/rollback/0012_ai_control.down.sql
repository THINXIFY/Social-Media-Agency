-- Rollback for 0012_ai_control (development and test only).
DROP TRIGGER IF EXISTS ai_credentials_guard ON ai_credentials;
DROP FUNCTION IF EXISTS sv_ai_credentials_guard();
DROP TABLE IF EXISTS ai_tool_assignments;
DROP TABLE IF EXISTS ai_models;
DROP TABLE IF EXISTS ai_credentials;
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
