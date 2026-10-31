CREATE TABLE "rate_limit_buckets" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_buckets_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
DROP INDEX "sessions_user_idx";--> statement-breakpoint
ALTER TABLE "mfa_factors" ADD COLUMN "last_used_step" bigint;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "reauthenticated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_window_idx" ON "rate_limit_buckets" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id","kind");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_name_check" CHECK (length("users"."name") <= 80);