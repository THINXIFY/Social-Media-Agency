-- Reverts drizzle/0002_auth.sql (development/test only).
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_name_check";
DROP INDEX IF EXISTS "sessions_user_idx";
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");
ALTER TABLE "users" DROP COLUMN IF EXISTS "name";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "reauthenticated_at";
ALTER TABLE "mfa_factors" DROP COLUMN IF EXISTS "last_used_step";
DROP TABLE IF EXISTS "rate_limit_buckets";
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
