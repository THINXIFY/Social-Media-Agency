-- Rollback for 0008_social_publishing (development and test only).
DROP TABLE IF EXISTS social_post_targets;
DROP TABLE IF EXISTS social_posts;
DELETE FROM social_events WHERE type LIKE 'post\_%';
ALTER TABLE social_events DROP CONSTRAINT IF EXISTS social_events_type_check;
ALTER TABLE social_events ADD CONSTRAINT social_events_type_check CHECK (type in ('connect_started', 'connected', 'reconnected', 'connect_failed', 'sync_succeeded', 'sync_failed', 'access_renewed', 'access_expired', 'disconnected'));
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
