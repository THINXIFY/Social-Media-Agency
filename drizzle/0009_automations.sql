CREATE TABLE "automation_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"automation_name" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"draft_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_inbox_kind_check" CHECK ("automation_inbox"."kind" in ('reminder', 'checklist', 'draft_review', 'health_warning', 'suggestion')),
	CONSTRAINT "automation_inbox_status_check" CHECK ("automation_inbox"."status" in ('open', 'done', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"automation_id" uuid,
	"automation_name" text NOT NULL,
	"automation_version" integer NOT NULL,
	"trigger_label" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"outcome" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"retry_of" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "automation_runs_status_check" CHECK ("automation_runs"."status" in ('running', 'succeeded', 'skipped', 'failed')),
	CONSTRAINT "automation_runs_attempts_check" CHECK ("automation_runs"."attempts" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"template_id" text,
	"timezone" text NOT NULL,
	"trigger" jsonb NOT NULL,
	"action" jsonb NOT NULL,
	"only_if_found" text DEFAULT 'true' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"authorized_at" timestamp with time zone,
	"authorized_version" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automations_status_check" CHECK ("automations"."status" in ('draft', 'active', 'paused', 'completed')),
	CONSTRAINT "automations_text_check" CHECK (char_length("automations"."name") between 1 and 80 and char_length("automations"."description") <= 200),
	CONSTRAINT "automations_active_check" CHECK ("automations"."status" <> 'active' or ("automations"."authorized_at" is not null and "automations"."authorized_version" = "automations"."version"))
);
--> statement-breakpoint
ALTER TABLE "automation_inbox" ADD CONSTRAINT "automation_inbox_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_inbox" ADD CONSTRAINT "automation_inbox_run_id_automation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."automation_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_inbox_run_idx" ON "automation_inbox" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "automation_inbox_customer_idx" ON "automation_inbox" USING btree ("customer_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_key_idx" ON "automation_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "automation_runs_customer_idx" ON "automation_runs" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_runs_automation_idx" ON "automation_runs" USING btree ("automation_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_runs_running_idx" ON "automation_runs" USING btree ("status","lease_until");--> statement-breakpoint
CREATE INDEX "automations_customer_idx" ON "automations" USING btree ("customer_id","updated_at");--> statement-breakpoint
CREATE INDEX "automations_due_idx" ON "automations" USING btree ("status","next_run_at");--> statement-breakpoint
-- Finished runs are history: they can't be deleted or rewritten (only the automation link may be cleared when an automation is deleted).
CREATE OR REPLACE FUNCTION automation_runs_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'automation run history is append-only' USING ERRCODE = 'SV001';
  END IF;
  IF OLD.status <> 'running' AND (
    NEW.status IS DISTINCT FROM OLD.status OR NEW.outcome IS DISTINCT FROM OLD.outcome OR NEW.finished_at IS DISTINCT FROM OLD.finished_at
    OR NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.automation_name IS DISTINCT FROM OLD.automation_name
    OR NEW.attempts IS DISTINCT FROM OLD.attempts OR (NEW.automation_id IS NOT NULL AND NEW.automation_id IS DISTINCT FROM OLD.automation_id)
  ) THEN
    RAISE EXCEPTION 'automation run history is append-only' USING ERRCODE = 'SV001';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER automation_runs_append_only BEFORE UPDATE OR DELETE ON automation_runs FOR EACH ROW EXECUTE FUNCTION automation_runs_guard();
