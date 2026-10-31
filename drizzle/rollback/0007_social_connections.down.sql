-- Rollback for 0007_social_connections (development and test only).
DROP TABLE IF EXISTS social_events;
DROP TABLE IF EXISTS social_oauth_states;
DROP TABLE IF EXISTS social_connections;
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
