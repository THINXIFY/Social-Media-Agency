-- Rollback for 0010_ai_profiles (development and test only).
DROP TABLE IF EXISTS ai_profiles;
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
