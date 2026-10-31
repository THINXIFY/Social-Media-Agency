CREATE TABLE "ai_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text NOT NULL,
	"version" integer NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer NOT NULL,
	"hint" text NOT NULL,
	"status" text DEFAULT 'saved' NOT NULL,
	"verified_at" timestamp with time zone,
	"last_test_at" timestamp with time zone,
	"last_test_code" text,
	"last_test_billable" boolean,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	CONSTRAINT "ai_credentials_status_check" CHECK ("ai_credentials"."status" in ('saved', 'verified', 'failed', 'active', 'retired', 'disabled')),
	CONSTRAINT "ai_credentials_provider_check" CHECK ("ai_credentials"."provider_id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "ai_credentials_hint_check" CHECK (char_length("ai_credentials"."hint") <= 16),
	CONSTRAINT "ai_credentials_active_check" CHECK ("ai_credentials"."status" <> 'active' or "ai_credentials"."verified_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "ai_models" (
	"provider_id" text NOT NULL,
	"model_id" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'unverified' NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"context_tokens" integer,
	"max_output_tokens" integer,
	"price_input_per_mtok" numeric(12, 6),
	"price_output_per_mtok" numeric(12, 6),
	"price_source" text,
	"price_checked_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_models_provider_id_model_id_pk" PRIMARY KEY("provider_id","model_id"),
	CONSTRAINT "ai_models_status_check" CHECK ("ai_models"."status" in ('available', 'unverified', 'deprecated', 'unavailable')),
	CONSTRAINT "ai_models_source_check" CHECK ("ai_models"."source" in ('catalog', 'discovered', 'manual')),
	CONSTRAINT "ai_models_id_check" CHECK (char_length("ai_models"."model_id") between 1 and 120 and "ai_models"."model_id" ~ '^[A-Za-z0-9._:/@-]+$'),
	CONSTRAINT "ai_models_price_check" CHECK (("ai_models"."price_input_per_mtok" is null) = ("ai_models"."price_output_per_mtok" is null) and ("ai_models"."price_input_per_mtok" is null or ("ai_models"."price_input_per_mtok" >= 0 and "ai_models"."price_output_per_mtok" >= 0 and "ai_models"."price_source" is not null)))
);
--> statement-breakpoint
CREATE TABLE "ai_tool_assignments" (
	"tool_id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"model_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"tested_at" timestamp with time zone,
	"test_passed" boolean,
	"test_note" text,
	"updated_by" uuid,
	"activated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_tool_assignments_status_check" CHECK ("ai_tool_assignments"."status" in ('draft', 'active', 'disabled')),
	CONSTRAINT "ai_tool_assignments_active_check" CHECK ("ai_tool_assignments"."status" <> 'active' or "ai_tool_assignments"."test_passed" is true),
	CONSTRAINT "ai_tool_assignments_tool_check" CHECK ("ai_tool_assignments"."tool_id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "ai_credentials" ADD CONSTRAINT "ai_credentials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_assignments" ADD CONSTRAINT "ai_tool_assignments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_credentials_version_key" ON "ai_credentials" USING btree ("provider_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_credentials_one_active_key" ON "ai_credentials" USING btree ("provider_id") WHERE "ai_credentials"."status" = 'active';--> statement-breakpoint

-- A stored credential never changes: replacing a key creates a new version, so a failed
-- rotation can never overwrite the working key. Rows are retired, never deleted.
CREATE FUNCTION sv_ai_credentials_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'sv:history: credentials are retired, not deleted' USING ERRCODE = 'SV001';
  END IF;
  IF NEW.ciphertext <> OLD.ciphertext OR NEW.iv <> OLD.iv OR NEW.auth_tag <> OLD.auth_tag OR NEW.key_version <> OLD.key_version
     OR NEW.provider_id <> OLD.provider_id OR NEW.version <> OLD.version OR NEW.hint <> OLD.hint THEN
    RAISE EXCEPTION 'sv:history: a stored credential cannot be changed' USING ERRCODE = 'SV001';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ai_credentials_guard BEFORE UPDATE OR DELETE ON ai_credentials
  FOR EACH ROW EXECUTE FUNCTION sv_ai_credentials_guard();
