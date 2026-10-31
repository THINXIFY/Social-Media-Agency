CREATE TABLE "ticket_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"type" text NOT NULL,
	"from_value" text,
	"to_value" text,
	"actor_type" text NOT NULL,
	"actor_user_id" uuid,
	"customer_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_events_type_check" CHECK ("ticket_events"."type" in ('created', 'customer_replied', 'staff_replied', 'status_changed', 'priority_changed', 'assigned', 'closed_by_customer', 'reopened')),
	CONSTRAINT "ticket_events_actor_check" CHECK ("ticket_events"."actor_type" in ('customer', 'staff', 'system'))
);
--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_priority_check";--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_status_check";--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD COLUMN "client_key" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_events_ticket_idx" ON "ticket_events" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_messages_client_key" ON "ticket_messages" USING btree ("ticket_id","client_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_idempotency_key" ON "tickets" USING btree ("customer_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_priority_check" CHECK ("tickets"."priority" in ('low', 'normal', 'high', 'urgent'));--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_status_check" CHECK ("tickets"."status" in ('awaiting', 'in_progress', 'waiting', 'resolved', 'closed'));--> statement-breakpoint

-- Support history is append-only (5G-A): messages, internal notes and activity can't be edited or
-- deleted. Removing support records needs a reviewed retention procedure, not application code.
CREATE FUNCTION sv_support_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sv:history: support history is append-only' USING ERRCODE = 'SV001';
END $$;
--> statement-breakpoint
CREATE TRIGGER ticket_messages_append_only BEFORE UPDATE OR DELETE ON ticket_messages FOR EACH ROW EXECUTE FUNCTION sv_support_append_only();
--> statement-breakpoint
CREATE TRIGGER ticket_internal_notes_append_only BEFORE UPDATE OR DELETE ON ticket_internal_notes FOR EACH ROW EXECUTE FUNCTION sv_support_append_only();
--> statement-breakpoint
CREATE TRIGGER ticket_events_append_only BEFORE UPDATE OR DELETE ON ticket_events FOR EACH ROW EXECUTE FUNCTION sv_support_append_only();
