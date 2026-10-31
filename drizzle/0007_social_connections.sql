CREATE TABLE "social_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"display_name" text NOT NULL,
	"handle" text,
	"profile_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"granted_scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"access_token_ciphertext" text,
	"refresh_token_ciphertext" text,
	"token_expires_at" timestamp with time zone,
	"metrics" jsonb,
	"last_sync_at" timestamp with time zone,
	"last_sync_attempt_at" timestamp with time zone,
	"last_sync_ok" text,
	"last_error_code" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone,
	"revocation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_connections_provider_check" CHECK ("social_connections"."provider" in ('instagram', 'facebook', 'tiktok', 'youtube', 'x', 'linkedin')),
	CONSTRAINT "social_connections_status_check" CHECK ("social_connections"."status" in ('active', 'needs_reauth', 'disconnected')),
	CONSTRAINT "social_connections_revocation_check" CHECK ("social_connections"."revocation" is null or "social_connections"."revocation" in ('revoked', 'failed', 'not_supported')),
	CONSTRAINT "social_connections_sync_ok_check" CHECK ("social_connections"."last_sync_ok" is null or "social_connections"."last_sync_ok" in ('ok', 'failed')),
	CONSTRAINT "social_connections_tokens_check" CHECK ("social_connections"."status" <> 'disconnected' or ("social_connections"."access_token_ciphertext" is null and "social_connections"."refresh_token_ciphertext" is null))
);
--> statement-breakpoint
CREATE TABLE "social_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"connection_id" uuid,
	"provider" text NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_events_provider_check" CHECK ("social_events"."provider" in ('instagram', 'facebook', 'tiktok', 'youtube', 'x', 'linkedin')),
	CONSTRAINT "social_events_type_check" CHECK ("social_events"."type" in ('connect_started', 'connected', 'reconnected', 'connect_failed', 'sync_succeeded', 'sync_failed', 'access_renewed', 'access_expired', 'disconnected'))
);
--> statement-breakpoint
CREATE TABLE "social_oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_hash" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_verifier_ciphertext" text,
	"connection_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_oauth_states_provider_check" CHECK ("social_oauth_states"."provider" in ('instagram', 'facebook', 'tiktok', 'youtube', 'x', 'linkedin'))
);
--> statement-breakpoint
ALTER TABLE "social_connections" ADD CONSTRAINT "social_connections_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_events" ADD CONSTRAINT "social_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_events" ADD CONSTRAINT "social_events_connection_id_social_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."social_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_oauth_states" ADD CONSTRAINT "social_oauth_states_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_connections_customer_idx" ON "social_connections" USING btree ("customer_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "social_connections_live_idx" ON "social_connections" USING btree ("provider","external_id") WHERE "social_connections"."status" <> 'disconnected';--> statement-breakpoint
CREATE INDEX "social_events_customer_idx" ON "social_events" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "social_events_connection_idx" ON "social_events" USING btree ("connection_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "social_oauth_states_hash_idx" ON "social_oauth_states" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "social_oauth_states_customer_idx" ON "social_oauth_states" USING btree ("customer_id","created_at");