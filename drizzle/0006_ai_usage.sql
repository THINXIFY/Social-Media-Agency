CREATE TABLE "ai_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_id" text NOT NULL,
	"subject_hash" text NOT NULL,
	"subject_kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text,
	"model" text,
	"input_chars" integer DEFAULT 0 NOT NULL,
	"output_chars" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ai_usage_status_check" CHECK ("ai_usage_events"."status" in ('pending', 'ok', 'rejected_quota', 'rejected_budget', 'provider_error', 'timeout', 'invalid_output')),
	CONSTRAINT "ai_usage_subject_kind_check" CHECK ("ai_usage_events"."subject_kind" in ('account', 'anonymous')),
	CONSTRAINT "ai_usage_tool_check" CHECK ("ai_usage_events"."tool_id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "ai_usage_amounts_check" CHECK ("ai_usage_events"."input_chars" >= 0 and "ai_usage_events"."output_chars" >= 0 and "ai_usage_events"."cost_micros" >= 0)
);
--> statement-breakpoint
CREATE INDEX "ai_usage_subject_idx" ON "ai_usage_events" USING btree ("subject_hash","tool_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage_events" USING btree ("created_at");