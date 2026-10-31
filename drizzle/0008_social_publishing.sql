CREATE TABLE "social_post_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"external_id" text,
	"external_url" text,
	"last_error_code" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_post_targets_status_check" CHECK ("social_post_targets"."status" in ('scheduled', 'publishing', 'published', 'failed', 'cancelled', 'reconciliation_required')),
	CONSTRAINT "social_post_targets_provider_check" CHECK ("social_post_targets"."provider" in ('instagram', 'facebook', 'tiktok', 'youtube', 'x', 'linkedin')),
	CONSTRAINT "social_post_targets_attempts_check" CHECK ("social_post_targets"."attempts" >= 0 and "social_post_targets"."attempts" <= 10)
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"title" text,
	"body" text DEFAULT '' NOT NULL,
	"variants" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"providers" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"planned_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_posts_status_check" CHECK ("social_posts"."status" in ('draft', 'scheduled', 'cancelled')),
	CONSTRAINT "social_posts_body_check" CHECK (char_length("social_posts"."body") <= 5000 and ("social_posts"."title" is null or char_length("social_posts"."title") <= 100)),
	CONSTRAINT "social_posts_scheduled_check" CHECK ("social_posts"."status" <> 'scheduled' or ("social_posts"."scheduled_at" is not null and "social_posts"."approved_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "social_events" DROP CONSTRAINT "social_events_type_check";--> statement-breakpoint
ALTER TABLE "social_post_targets" ADD CONSTRAINT "social_post_targets_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_post_targets" ADD CONSTRAINT "social_post_targets_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_post_targets" ADD CONSTRAINT "social_post_targets_connection_id_social_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."social_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "social_post_targets_key_idx" ON "social_post_targets" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "social_post_targets_live_idx" ON "social_post_targets" USING btree ("post_id","connection_id") WHERE "social_post_targets"."status" in ('scheduled', 'publishing', 'published', 'reconciliation_required');--> statement-breakpoint
CREATE INDEX "social_post_targets_due_idx" ON "social_post_targets" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "social_post_targets_customer_idx" ON "social_post_targets" USING btree ("customer_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "social_posts_customer_idx" ON "social_posts" USING btree ("customer_id","updated_at");--> statement-breakpoint
ALTER TABLE "social_events" ADD CONSTRAINT "social_events_type_check" CHECK ("social_events"."type" in ('connect_started', 'connected', 'reconnected', 'connect_failed', 'sync_succeeded', 'sync_failed', 'access_renewed', 'access_expired', 'disconnected', 'post_scheduled', 'post_cancelled', 'post_published', 'post_failed', 'post_unconfirmed'));