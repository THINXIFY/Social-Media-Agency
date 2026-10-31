CREATE TABLE "provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"actor_user_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_events_type_check" CHECK ("provider_events"."type" in ('created', 'updated', 'archived', 'credential_set', 'credential_removed', 'health_checked', 'mapping_saved', 'mapping_activated', 'mapping_deactivated', 'mapping_removed', 'attempt_prepared', 'attempt_submitted', 'attempt_failed', 'attempt_unknown', 'attempt_reconciled', 'attempt_resolved', 'attempt_cancelled'))
);
--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" DROP CONSTRAINT "fulfillment_attempts_status_check";--> statement-breakpoint
DROP INDEX "fulfillment_attempts_one_active_key";--> statement-breakpoint
ALTER TABLE "provider_service_mappings" ALTER COLUMN "active" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD COLUMN "submit_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD COLUMN "provider_status" text;--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD COLUMN "prepared_by" uuid;--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD COLUMN "resolved_by" uuid;--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD COLUMN "resolution" text;--> statement-breakpoint
ALTER TABLE "provider_service_mappings" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_service_mappings" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "provider_service_mappings" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "adapter" text;--> statement-breakpoint
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_events_recent_idx" ON "provider_events" USING btree ("provider_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD CONSTRAINT "fulfillment_attempts_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD CONSTRAINT "fulfillment_attempts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_service_mappings" ADD CONSTRAINT "provider_service_mappings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_attempts_idempotency_key" ON "fulfillment_attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_attempts_one_active_key" ON "fulfillment_attempts" USING btree ("order_id") WHERE "fulfillment_attempts"."status" in ('queued', 'submitted', 'in_progress', 'unknown');--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD CONSTRAINT "fulfillment_attempts_submit_count_check" CHECK ("fulfillment_attempts"."submit_count" between 0 and 1);--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD CONSTRAINT "fulfillment_attempts_status_check" CHECK ("fulfillment_attempts"."status" in ('queued', 'submitted', 'in_progress', 'partial', 'completed', 'failed', 'cancelled', 'unknown'));--> statement-breakpoint
ALTER TABLE "provider_service_mappings" ADD CONSTRAINT "provider_service_mappings_note_check" CHECK (char_length("provider_service_mappings"."note") <= 300);--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_adapter_check" CHECK ("providers"."adapter" is null or "providers"."adapter" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_enable_check" CHECK (not "providers"."enabled" or ("providers"."supplier_reviewed_at" is not null and "providers"."adapter" is not null and "providers"."archived_at" is null));--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_text_check" CHECK (char_length("providers"."name") between 2 and 80 and char_length("providers"."description") <= 500 and char_length("providers"."limitations") <= 500);--> statement-breakpoint

-- 5F safeguards. Mappings never grant purchase permission (purchasable_services ignores them);
-- they can only be active for a service with all six eligibility gates on an enabled provider.
CREATE FUNCTION sv_check_mapping_active() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.active THEN
    IF NOT EXISTS (
      SELECT 1 FROM services s JOIN service_eligibility e ON e.service_id = s.id
      WHERE s.id = NEW.service_id AND s.archived_at IS NULL
        AND e.policy_reviewed_at IS NOT NULL AND e.supplier_verified_at IS NOT NULL AND e.fulfillment_verified_at IS NOT NULL
        AND e.payment_accepted_at IS NOT NULL AND e.legal_reviewed_at IS NOT NULL AND e.technical_ready_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'sv:mapping_not_allowed: service is not eligible' USING ERRCODE = 'SV012';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM providers p WHERE p.id = NEW.provider_id AND p.enabled AND p.archived_at IS NULL) THEN
      RAISE EXCEPTION 'sv:mapping_not_allowed: provider is not enabled' USING ERRCODE = 'SV012';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER provider_service_mappings_active_guard BEFORE INSERT OR UPDATE ON provider_service_mappings
  FOR EACH ROW EXECUTE FUNCTION sv_check_mapping_active();
--> statement-breakpoint

-- Losing an eligibility gate, or disabling/archiving a provider, switches its mappings off.
CREATE FUNCTION sv_deactivate_mappings_on_gate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.policy_reviewed_at IS NULL OR NEW.supplier_verified_at IS NULL OR NEW.fulfillment_verified_at IS NULL
     OR NEW.payment_accepted_at IS NULL OR NEW.legal_reviewed_at IS NULL OR NEW.technical_ready_at IS NULL THEN
    UPDATE provider_service_mappings SET active = false, updated_at = now() WHERE service_id = NEW.service_id AND active;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER service_eligibility_mapping_sync AFTER UPDATE ON service_eligibility
  FOR EACH ROW EXECUTE FUNCTION sv_deactivate_mappings_on_gate();
--> statement-breakpoint
CREATE FUNCTION sv_deactivate_mappings_on_provider() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT NEW.enabled OR NEW.archived_at IS NOT NULL THEN
    UPDATE provider_service_mappings SET active = false, updated_at = now() WHERE provider_id = NEW.id AND active;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER providers_mapping_sync AFTER UPDATE ON providers
  FOR EACH ROW EXECUTE FUNCTION sv_deactivate_mappings_on_provider();
--> statement-breakpoint

-- Fulfilment attempts: prepared only for approved, paid orders with an active mapping; submitted only to an
-- enabled provider; at most one submission; finished attempts never change status.
CREATE FUNCTION sv_check_fulfillment_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'queued' OR NEW.submit_count <> 0 OR NEW.provider_order_id IS NOT NULL THEN
      RAISE EXCEPTION 'sv:attempt_invalid: attempts start queued and unsubmitted' USING ERRCODE = 'SV013';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = NEW.order_id AND o.status = 'queued' AND o.payment_status = 'charged') THEN
      RAISE EXCEPTION 'sv:attempt_invalid: order is not approved and paid' USING ERRCODE = 'SV013';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM orders o JOIN provider_service_mappings m ON m.service_id = o.service_id
      WHERE o.id = NEW.order_id AND m.provider_id = NEW.provider_id AND m.active AND m.provider_ref = NEW.provider_service_ref
    ) THEN
      RAISE EXCEPTION 'sv:attempt_invalid: no active mapping' USING ERRCODE = 'SV013';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status IN ('completed', 'failed', 'cancelled', 'partial') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'sv:attempt_invalid: finished attempts cannot change' USING ERRCODE = 'SV013';
  END IF;
  IF NEW.submit_count < OLD.submit_count OR NEW.order_id <> OLD.order_id OR NEW.provider_id <> OLD.provider_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR (OLD.provider_order_id IS NOT NULL AND NEW.provider_order_id IS DISTINCT FROM OLD.provider_order_id) THEN
    RAISE EXCEPTION 'sv:attempt_invalid: attempt identity cannot change' USING ERRCODE = 'SV013';
  END IF;
  IF NEW.submit_count > OLD.submit_count AND NOT EXISTS (SELECT 1 FROM providers p WHERE p.id = NEW.provider_id AND p.enabled AND p.archived_at IS NULL) THEN
    RAISE EXCEPTION 'sv:attempt_invalid: provider is not enabled' USING ERRCODE = 'SV013';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER fulfillment_attempts_guard BEFORE INSERT OR UPDATE ON fulfillment_attempts
  FOR EACH ROW EXECUTE FUNCTION sv_check_fulfillment_attempt();
--> statement-breakpoint

-- Provider history is append-only.
CREATE FUNCTION sv_provider_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sv:history: provider events are append-only' USING ERRCODE = 'SV001';
END $$;
--> statement-breakpoint
CREATE TRIGGER provider_events_append_only BEFORE UPDATE ON provider_events
  FOR EACH ROW EXECUTE FUNCTION sv_provider_events_append_only();
