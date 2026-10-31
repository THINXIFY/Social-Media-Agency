CREATE TABLE "platforms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon_key" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platforms_id_check" CHECK ("platforms"."id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "service_eligibility" (
	"service_id" text PRIMARY KEY NOT NULL,
	"policy_reviewed_at" timestamp with time zone,
	"policy_reviewed_by" uuid,
	"supplier_verified_at" timestamp with time zone,
	"supplier_verified_by" uuid,
	"fulfillment_verified_at" timestamp with time zone,
	"fulfillment_verified_by" uuid,
	"payment_accepted_at" timestamp with time zone,
	"payment_accepted_by" uuid,
	"legal_reviewed_at" timestamp with time zone,
	"legal_reviewed_by" uuid,
	"technical_ready_at" timestamp with time zone,
	"technical_ready_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_order_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" text,
	"category" text,
	"field_key" text NOT NULL,
	"kind" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "service_order_fields_scope_check" CHECK (("service_order_fields"."service_id" is null) <> ("service_order_fields"."category" is null)),
	CONSTRAINT "service_order_fields_kind_check" CHECK ("service_order_fields"."kind" in ('link', 'quantity', 'budget', 'text', 'textarea', 'date', 'select', 'consent')),
	CONSTRAINT "service_order_fields_category_check" CHECK ("service_order_fields"."category" is null or "service_order_fields"."category" in ('audience', 'engagement', 'views', 'comments', 'promotion', 'advertising', 'messaging', 'seo', 'community', 'music'))
);
--> statement-breakpoint
CREATE TABLE "service_price_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" text NOT NULL,
	"pricing_model" text NOT NULL,
	"cost_micros" bigint NOT NULL,
	"price_micros" bigint NOT NULL,
	"min_qty" integer,
	"max_qty" integer,
	"effective_from" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_price_versions_model_check" CHECK ("service_price_versions"."pricing_model" in ('per1000', 'unit', 'fixed', 'fee')),
	CONSTRAINT "service_price_versions_amounts_check" CHECK ("service_price_versions"."cost_micros" >= 0 and "service_price_versions"."price_micros" > 0),
	CONSTRAINT "service_price_versions_qty_check" CHECK (("service_price_versions"."min_qty" is null or "service_price_versions"."min_qty" >= 1) and ("service_price_versions"."max_qty" is null or "service_price_versions"."min_qty" is null or "service_price_versions"."max_qty" > "service_price_versions"."min_qty"))
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" text PRIMARY KEY NOT NULL,
	"platform_id" text NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"origin" text DEFAULT 'catalog' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_id_check" CHECK ("services"."id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "services_category_check" CHECK ("services"."category" in ('audience', 'engagement', 'views', 'comments', 'promotion', 'advertising', 'messaging', 'seo', 'community', 'music')),
	CONSTRAINT "services_origin_check" CHECK ("services"."origin" in ('catalog', 'custom'))
);
--> statement-breakpoint
CREATE TABLE "deposit_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deposit_id" uuid NOT NULL,
	"step" text NOT NULL,
	"decision" text NOT NULL,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decided_by" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposit_reviews_step_check" CHECK ("deposit_reviews"."step" in ('first', 'second')),
	CONSTRAINT "deposit_reviews_decision_check" CHECK ("deposit_reviews"."decision" in ('approve', 'reject'))
);
--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_ref" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"method" text NOT NULL,
	"processor" text NOT NULL,
	"processor_ref" text,
	"status" text DEFAULT 'created' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"credited_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposits_public_ref_check" CHECK ("deposits"."public_ref" ~ '^DEP-[A-Z0-9]+$'),
	CONSTRAINT "deposits_amount_check" CHECK ("deposits"."amount_cents" > 0),
	CONSTRAINT "deposits_method_check" CHECK ("deposits"."method" in ('crypto', 'card', 'bank', 'paypal')),
	CONSTRAINT "deposits_status_check" CHECK ("deposits"."status" in ('created', 'awaiting_payment', 'settling', 'settled', 'under_review', 'credited', 'rejected', 'expired', 'failed')),
	CONSTRAINT "deposits_credited_check" CHECK (("deposits"."status" = 'credited') = ("deposits"."credited_entry_id" is not null)),
	CONSTRAINT "deposits_settled_check" CHECK ("deposits"."status" not in ('settled', 'credited') or "deposits"."settled_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "fulfillment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"provider_service_ref" text,
	"provider_order_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"delivered_qty" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint,
	"request_hash" text,
	"submitted_at" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fulfillment_attempts_status_check" CHECK ("fulfillment_attempts"."status" in ('queued', 'submitted', 'in_progress', 'partial', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "fulfillment_attempts_delivered_check" CHECK ("fulfillment_attempts"."delivered_qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_events_actor_check" CHECK ("order_events"."actor_type" in ('customer', 'staff', 'system', 'provider')),
	CONSTRAINT "order_events_status_check" CHECK (("order_events"."from_status" is null or "order_events"."from_status" in ('pending_review', 'queued', 'in_progress', 'partial', 'needs_customer_action', 'completed', 'cancelled', 'failed', 'refunded')) and ("order_events"."to_status" is null or "order_events"."to_status" in ('pending_review', 'queued', 'in_progress', 'partial', 'needs_customer_action', 'completed', 'cancelled', 'failed', 'refunded')))
);
--> statement-breakpoint
CREATE TABLE "order_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"reason" text NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_refunds_amount_check" CHECK ("order_refunds"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_reviews" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"decision" text NOT NULL,
	"reason" text,
	"decided_by" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_reviews_decision_check" CHECK ("order_reviews"."decision" in ('approved', 'rejected')),
	CONSTRAINT "order_reviews_reason_check" CHECK ("order_reviews"."decision" <> 'rejected' or "order_reviews"."reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_ref" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"service_id" text NOT NULL,
	"price_version_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"link" text,
	"field_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"unit_price_micros" bigint NOT NULL,
	"total_cents" bigint NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"customer_status" text GENERATED ALWAYS AS (case
          when status in ('pending_review', 'queued') then 'pending'
          when status in ('in_progress', 'partial') then 'processing'
          when status = 'needs_customer_action' then 'attention'
          when status = 'completed' then 'completed'
          else 'cancelled' end) STORED NOT NULL,
	"review_required" boolean DEFAULT true NOT NULL,
	"idempotency_key" text NOT NULL,
	"debit_entry_id" uuid,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" in ('pending_review', 'queued', 'in_progress', 'partial', 'needs_customer_action', 'completed', 'cancelled', 'failed', 'refunded')),
	CONSTRAINT "orders_quantity_check" CHECK ("orders"."quantity" > 0),
	CONSTRAINT "orders_total_check" CHECK ("orders"."total_cents" > 0 and "orders"."unit_price_micros" > 0),
	CONSTRAINT "orders_link_check" CHECK ("orders"."link" is null or "orders"."link" ~ '^https://')
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"processor" text NOT NULL,
	"event_id" text NOT NULL,
	"signature_valid" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer NOT NULL,
	"last4" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	CONSTRAINT "provider_credentials_last4_check" CHECK ("provider_credentials"."last4" is null or length("provider_credentials"."last4") <= 4)
);
--> statement-breakpoint
CREATE TABLE "provider_health_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text NOT NULL,
	"ok" boolean NOT NULL,
	"latency_ms" integer,
	"balance_cents" bigint,
	"error" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_service_mappings" (
	"provider_id" text NOT NULL,
	"service_id" text NOT NULL,
	"provider_ref" text NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_service_mappings_provider_id_service_id_pk" PRIMARY KEY("provider_id","service_id"),
	CONSTRAINT "provider_service_mappings_priority_check" CHECK ("provider_service_mappings"."priority" >= 1),
	CONSTRAINT "provider_service_mappings_ref_check" CHECK (length("provider_service_mappings"."provider_ref") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"endpoint" text,
	"auth_method" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"supplier_reviewed_at" timestamp with time zone,
	"supplier_reviewed_by" uuid,
	"fallback_provider_id" text,
	"limitations" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "providers_id_check" CHECK ("providers"."id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "providers_type_check" CHECK ("providers"."type" in ('manual', 'api')),
	CONSTRAINT "providers_auth_check" CHECK ("providers"."auth_method" is null or "providers"."auth_method" in ('api_key', 'oauth', 'basic', 'none')),
	CONSTRAINT "providers_endpoint_check" CHECK ("providers"."endpoint" is null or "providers"."endpoint" ~ '^https://'),
	CONSTRAINT "providers_fallback_check" CHECK ("providers"."fallback_provider_id" is null or "providers"."fallback_provider_id" <> "providers"."id")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"scan_status" text DEFAULT 'pending' NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_owner_check" CHECK ("attachments"."owner_type" in ('ticket_message', 'customer_avatar')),
	CONSTRAINT "attachments_mime_check" CHECK ("attachments"."mime" in ('image/png', 'image/jpeg', 'application/pdf')),
	CONSTRAINT "attachments_size_check" CHECK ("attachments"."size_bytes" between 1 and 10485760),
	CONSTRAINT "attachments_scan_check" CHECK ("attachments"."scan_status" in ('pending', 'clean', 'infected'))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"user_agent" text,
	"request_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_actor_check" CHECK ("audit_log"."actor_type" in ('customer', 'staff', 'system')),
	CONSTRAINT "audit_log_action_check" CHECK ("audit_log"."action" ~ '^[a-z_]+\.[a-z_]+$')
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"to_address" text NOT NULL,
	"template" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_message_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "email_outbox_status_check" CHECK ("email_outbox"."status" in ('queued', 'sending', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean NOT NULL,
	CONSTRAINT "notification_preferences_user_id_kind_channel_pk" PRIMARY KEY("user_id","kind","channel"),
	CONSTRAINT "notification_preferences_channel_check" CHECK ("notification_preferences"."channel" in ('in_app', 'email'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_link_check" CHECK ("notifications"."link" is null or "notifications"."link" ~ '^/')
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_settings_key_check" CHECK ("platform_settings"."key" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "referral_codes_format_check" CHECK ("referral_codes"."code" ~ '^[A-Z0-9-]{6,32}$')
);
--> statement-breakpoint
CREATE TABLE "referral_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_events_actor_check" CHECK ("referral_events"."actor_type" in ('customer', 'staff', 'system'))
);
--> statement-breakpoint
CREATE TABLE "referral_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"reward_type" text NOT NULL,
	"fixed_cents" bigint,
	"percent_bp" integer,
	"cap_cents" bigint,
	"min_spend_cents" bigint NOT NULL,
	"qualifying_days" integer NOT NULL,
	"hold_days" integer NOT NULL,
	"min_orders" integer DEFAULT 1 NOT NULL,
	"count_refunded" boolean DEFAULT false NOT NULL,
	"max_per_referrer" integer,
	"destination" text DEFAULT 'rewards' NOT NULL,
	"distribution" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"effective_from" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_policies_type_check" CHECK ("referral_policies"."reward_type" in ('fixed', 'percent')),
	CONSTRAINT "referral_policies_amount_check" CHECK (("referral_policies"."reward_type" = 'fixed' and "referral_policies"."fixed_cents" > 0) or ("referral_policies"."reward_type" = 'percent' and "referral_policies"."percent_bp" between 1 and 10000)),
	CONSTRAINT "referral_policies_ranges_check" CHECK ("referral_policies"."min_spend_cents" >= 0 and "referral_policies"."qualifying_days" between 1 and 365 and "referral_policies"."hold_days" between 0 and 90 and "referral_policies"."min_orders" between 1 and 100),
	CONSTRAINT "referral_policies_destination_check" CHECK ("referral_policies"."destination" in ('rewards', 'wallet')),
	CONSTRAINT "referral_policies_distribution_check" CHECK ("referral_policies"."distribution" in ('manual', 'auto')),
	CONSTRAINT "referral_policies_status_check" CHECK ("referral_policies"."status" in ('draft', 'active', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "referral_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"hold_until" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"credited_entry_id" uuid,
	"reversed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_rewards_amount_check" CHECK ("referral_rewards"."amount_cents" > 0),
	CONSTRAINT "referral_rewards_status_check" CHECK ("referral_rewards"."status" in ('pending', 'holding', 'awaiting_approval', 'approved', 'credited', 'reversed')),
	CONSTRAINT "referral_rewards_credited_check" CHECK (("referral_rewards"."status" = 'credited') = ("referral_rewards"."credited_entry_id" is not null)),
	CONSTRAINT "referral_rewards_approved_check" CHECK ("referral_rewards"."status" not in ('approved', 'credited') or "referral_rewards"."approved_by" is not null)
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_customer_id" uuid NOT NULL,
	"referee_customer_id" uuid NOT NULL,
	"code_id" uuid,
	"via" text NOT NULL,
	"policy_id" uuid NOT NULL,
	"status" text DEFAULT 'signed_up' NOT NULL,
	"ineligible_reason" text,
	"attributed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"qualified_at" timestamp with time zone,
	CONSTRAINT "referrals_self_check" CHECK ("referrals"."referrer_customer_id" <> "referrals"."referee_customer_id"),
	CONSTRAINT "referrals_via_check" CHECK ("referrals"."via" in ('link', 'code')),
	CONSTRAINT "referrals_status_check" CHECK ("referrals"."status" in ('signed_up', 'pending', 'qualified', 'ineligible')),
	CONSTRAINT "referrals_ineligible_check" CHECK ("referrals"."status" <> 'ineligible' or "referrals"."ineligible_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "staff_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_notes_target_check" CHECK ("staff_notes"."target_type" in ('order', 'customer', 'deposit', 'ticket', 'referral', 'referrer')),
	CONSTRAINT "staff_notes_body_check" CHECK (length("staff_notes"."body") between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "ticket_internal_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_internal_notes_body_check" CHECK (length("ticket_internal_notes"."body") between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_type" text NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_messages_author_check" CHECK ("ticket_messages"."author_type" in ('customer', 'staff', 'system')),
	CONSTRAINT "ticket_messages_body_check" CHECK (length("ticket_messages"."body") between 1 and 5000)
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_ref" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"category" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'awaiting' NOT NULL,
	"order_id" uuid,
	"deposit_id" uuid,
	"assigned_to" uuid,
	"last_customer_message_at" timestamp with time zone,
	"last_staff_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_public_ref_check" CHECK ("tickets"."public_ref" ~ '^TCK-[A-Z0-9]+$'),
	CONSTRAINT "tickets_subject_check" CHECK (length("tickets"."subject") between 1 and 150),
	CONSTRAINT "tickets_category_check" CHECK ("tickets"."category" in ('order', 'payment', 'refund', 'service', 'account', 'technical', 'other')),
	CONSTRAINT "tickets_priority_check" CHECK ("tickets"."priority" in ('normal', 'urgent')),
	CONSTRAINT "tickets_status_check" CHECK ("tickets"."status" in ('awaiting', 'waiting', 'resolved', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_purpose_check" CHECK ("auth_tokens"."purpose" in ('verify_email', 'reset_password', 'staff_invite'))
);
--> statement-breakpoint
CREATE TABLE "customer_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customer_preferences" (
	"customer_id" uuid PRIMARY KEY NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"display_currency" text DEFAULT 'USD' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"date_format" text DEFAULT 'mdy' NOT NULL,
	"reduce_motion" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_preferences_currency_check" CHECK ("customer_preferences"."display_currency" in ('USD', 'EUR', 'GBP', 'PKR', 'AED', 'SAR', 'INR', 'CAD')),
	CONSTRAINT "customer_preferences_date_format_check" CHECK ("customer_preferences"."date_format" in ('mdy', 'dmy', 'iso'))
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"public_ref" text NOT NULL,
	"account_ref" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"display_name" text,
	"country" text,
	"account_type" text DEFAULT 'personal' NOT NULL,
	"business_name" text,
	"website" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_public_ref_check" CHECK ("customers"."public_ref" ~ '^CUS-[A-Z0-9]+$'),
	CONSTRAINT "customers_account_ref_check" CHECK ("customers"."account_ref" ~ '^ACC-[A-Z0-9]+$'),
	CONSTRAINT "customers_account_type_check" CHECK ("customers"."account_type" in ('personal', 'business')),
	CONSTRAINT "customers_business_name_check" CHECK ("customers"."account_type" <> 'business' or "customers"."business_name" is not null)
);
--> statement-breakpoint
CREATE TABLE "mfa_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text DEFAULT 'totp' NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mfa_factors_type_check" CHECK ("mfa_factors"."type" in ('totp'))
);
--> statement-breakpoint
CREATE TABLE "mfa_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_module_access" (
	"role_id" uuid NOT NULL,
	"module" text NOT NULL,
	"level" text NOT NULL,
	CONSTRAINT "role_module_access_role_id_module_pk" PRIMARY KEY("role_id","module"),
	CONSTRAINT "role_module_access_module_check" CHECK ("role_module_access"."module" in ('overview', 'orders', 'customers', 'services', 'payments', 'providers', 'support', 'referrals', 'settings', 'staff')),
	CONSTRAINT "role_module_access_level_check" CHECK ("role_module_access"."level" in ('none', 'view', 'manage'))
);
--> statement-breakpoint
CREATE TABLE "role_sensitive_permissions" (
	"role_id" uuid NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "role_sensitive_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission"),
	CONSTRAINT "role_sensitive_permissions_check" CHECK ("role_sensitive_permissions"."permission" in ('approveDeposits', 'issueRefunds', 'adjustWallets', 'changePrices', 'configureProviders', 'approveRewards', 'manageStaff', 'securitySettings'))
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_format_check" CHECK ("roles"."key" ~ '^[a-z][a-z0-9_]{1,39}$')
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"mfa_verified_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	CONSTRAINT "sessions_kind_check" CHECK ("sessions"."kind" in ('customer', 'staff'))
);
--> statement-breakpoint
CREATE TABLE "staff_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_ref" text NOT NULL,
	"email" text NOT NULL,
	"role_id" uuid NOT NULL,
	"message" text,
	"invited_by" uuid,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_invitations_public_ref_check" CHECK ("staff_invitations"."public_ref" ~ '^INV-[A-Z0-9]{6,}$'),
	CONSTRAINT "staff_invitations_message_check" CHECK ("staff_invitations"."message" is null or length("staff_invitations"."message") <= 300)
);
--> statement-breakpoint
CREATE TABLE "staff_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"disabled_at" timestamp with time zone,
	"disabled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_members_status_check" CHECK ("staff_members"."status" in ('invited', 'active', 'disabled')),
	CONSTRAINT "staff_members_disabled_check" CHECK (("staff_members"."status" = 'disabled') = ("staff_members"."disabled_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"password_hash" text,
	"status" text DEFAULT 'active' NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'locked', 'disabled')),
	CONSTRAINT "users_email_format_check" CHECK ("users"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length("users"."email") <= 254)
);
--> statement-breakpoint
CREATE TABLE "account_balances" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"balance_cents" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"description" text NOT NULL,
	"created_by" uuid,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_kind_check" CHECK ("journal_entries"."kind" in ('deposit_credit', 'order_debit', 'order_revenue', 'order_cancel', 'refund', 'reward_credit', 'provider_cost', 'adjustment', 'reversal')),
	CONSTRAINT "journal_entries_idempotency_check" CHECK (length("journal_entries"."idempotency_key") between 8 and 200),
	CONSTRAINT "journal_entries_four_eyes_check" CHECK ("journal_entries"."approved_by" is null or "journal_entries"."created_by" is null or "journal_entries"."approved_by" <> "journal_entries"."created_by")
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_lines_nonzero_check" CHECK ("journal_lines"."amount_cents" <> 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"customer_id" uuid,
	"currency" text DEFAULT 'USD' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"allow_negative" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_accounts_type_check" CHECK ("ledger_accounts"."type" in ('asset', 'liability', 'revenue', 'contra_revenue', 'expense')),
	CONSTRAINT "ledger_accounts_currency_check" CHECK ("ledger_accounts"."currency" = 'USD'),
	CONSTRAINT "ledger_accounts_code_check" CHECK ("ledger_accounts"."code" ~ '^[a-z_]+(:[a-z0-9_-]+)?$'),
	CONSTRAINT "ledger_accounts_wallet_check" CHECK ("ledger_accounts"."code" not like 'wallet:%' or ("ledger_accounts"."type" = 'liability' and "ledger_accounts"."customer_id" is not null and not "ledger_accounts"."allow_negative"))
);
--> statement-breakpoint
ALTER TABLE "service_eligibility" ADD CONSTRAINT "service_eligibility_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_eligibility" ADD CONSTRAINT "service_eligibility_policy_reviewed_by_users_id_fk" FOREIGN KEY ("policy_reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_eligibility" ADD CONSTRAINT "service_eligibility_supplier_verified_by_users_id_fk" FOREIGN KEY ("supplier_verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_eligibility" ADD CONSTRAINT "service_eligibility_fulfillment_verified_by_users_id_fk" FOREIGN KEY ("fulfillment_verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_eligibility" ADD CONSTRAINT "service_eligibility_payment_accepted_by_users_id_fk" FOREIGN KEY ("payment_accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_eligibility" ADD CONSTRAINT "service_eligibility_legal_reviewed_by_users_id_fk" FOREIGN KEY ("legal_reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_eligibility" ADD CONSTRAINT "service_eligibility_technical_ready_by_users_id_fk" FOREIGN KEY ("technical_ready_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_fields" ADD CONSTRAINT "service_order_fields_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_price_versions" ADD CONSTRAINT "service_price_versions_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_price_versions" ADD CONSTRAINT "service_price_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_reviews" ADD CONSTRAINT "deposit_reviews_deposit_id_deposits_id_fk" FOREIGN KEY ("deposit_id") REFERENCES "public"."deposits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_reviews" ADD CONSTRAINT "deposit_reviews_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_credited_entry_id_journal_entries_id_fk" FOREIGN KEY ("credited_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD CONSTRAINT "fulfillment_attempts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_attempts" ADD CONSTRAINT "fulfillment_attempts_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_reviews" ADD CONSTRAINT "order_reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_reviews" ADD CONSTRAINT "order_reviews_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_price_version_id_service_price_versions_id_fk" FOREIGN KEY ("price_version_id") REFERENCES "public"."service_price_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_debit_entry_id_journal_entries_id_fk" FOREIGN KEY ("debit_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_health_checks" ADD CONSTRAINT "provider_health_checks_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_service_mappings" ADD CONSTRAINT "provider_service_mappings_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_service_mappings" ADD CONSTRAINT "provider_service_mappings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_supplier_reviewed_by_users_id_fk" FOREIGN KEY ("supplier_reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_fallback_fk" FOREIGN KEY ("fallback_provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_events" ADD CONSTRAINT "referral_events_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_policies" ADD CONSTRAINT "referral_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_credited_entry_id_journal_entries_id_fk" FOREIGN KEY ("credited_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_customer_id_customers_id_fk" FOREIGN KEY ("referrer_customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_customer_id_customers_id_fk" FOREIGN KEY ("referee_customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_code_id_referral_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."referral_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_policy_id_referral_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."referral_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_notes" ADD CONSTRAINT "staff_notes_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_internal_notes" ADD CONSTRAINT "ticket_internal_notes_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_internal_notes" ADD CONSTRAINT "ticket_internal_notes_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_deposit_id_deposits_id_fk" FOREIGN KEY ("deposit_id") REFERENCES "public"."deposits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_to_staff_members_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_flags" ADD CONSTRAINT "customer_flags_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_flags" ADD CONSTRAINT "customer_flags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_preferences" ADD CONSTRAINT "customer_preferences_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_factors" ADD CONSTRAINT "mfa_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_module_access" ADD CONSTRAINT "role_module_access_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_sensitive_permissions" ADD CONSTRAINT "role_sensitive_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_disabled_by_users_id_fk" FOREIGN KEY ("disabled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_order_fields_service_idx" ON "service_order_fields" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "service_price_versions_current_idx" ON "service_price_versions" USING btree ("service_id","effective_from" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "services_platform_idx" ON "services" USING btree ("platform_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_reviews_step_key" ON "deposit_reviews" USING btree ("deposit_id","step");--> statement-breakpoint
CREATE UNIQUE INDEX "deposits_public_ref_key" ON "deposits" USING btree ("public_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "deposits_processor_ref_key" ON "deposits" USING btree ("processor","processor_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "deposits_credited_entry_key" ON "deposits" USING btree ("credited_entry_id");--> statement-breakpoint
CREATE INDEX "deposits_customer_idx" ON "deposits" USING btree ("customer_id","requested_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "deposits_status_idx" ON "deposits" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_attempts_provider_order_key" ON "fulfillment_attempts" USING btree ("provider_id","provider_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_attempts_one_active_key" ON "fulfillment_attempts" USING btree ("order_id") WHERE "fulfillment_attempts"."status" in ('queued', 'submitted', 'in_progress');--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_refunds_entry_key" ON "order_refunds" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE INDEX "order_refunds_order_idx" ON "order_refunds" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_public_ref_key" ON "orders" USING btree ("public_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_customer_idempotency_key" ON "orders" USING btree ("customer_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_debit_entry_key" ON "orders" USING btree ("debit_entry_id");--> statement-breakpoint
CREATE INDEX "orders_customer_placed_idx" ON "orders" USING btree ("customer_id","placed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_events_event_key" ON "payment_webhook_events" USING btree ("processor","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_credentials_active_key" ON "provider_credentials" USING btree ("provider_id") WHERE "provider_credentials"."rotated_at" is null;--> statement-breakpoint
CREATE INDEX "provider_health_checks_recent_idx" ON "provider_health_checks" USING btree ("provider_id","checked_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "provider_service_mappings_primary_key" ON "provider_service_mappings" USING btree ("service_id") WHERE "provider_service_mappings"."active" and "provider_service_mappings"."priority" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_storage_key" ON "attachments" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "attachments_owner_idx" ON "attachments" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_outbox_idempotency_key" ON "email_outbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "email_outbox_status_idx" ON "email_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_one_active_key" ON "referral_codes" USING btree ("customer_id") WHERE "referral_codes"."disabled_at" is null;--> statement-breakpoint
CREATE INDEX "referral_events_referral_idx" ON "referral_events" USING btree ("referral_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_policies_version_key" ON "referral_policies" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_policies_one_active_key" ON "referral_policies" USING btree ("status") WHERE "referral_policies"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "referral_rewards_referral_key" ON "referral_rewards" USING btree ("referral_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_rewards_credited_entry_key" ON "referral_rewards" USING btree ("credited_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_referee_key" ON "referrals" USING btree ("referee_customer_id");--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" USING btree ("referrer_customer_id");--> statement-breakpoint
CREATE INDEX "staff_notes_target_idx" ON "staff_notes" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "ticket_internal_notes_ticket_idx" ON "ticket_internal_notes" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_messages_ticket_idx" ON "ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_public_ref_key" ON "tickets" USING btree ("public_ref");--> statement-breakpoint
CREATE INDEX "tickets_customer_idx" ON "tickets" USING btree ("customer_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tickets_queue_idx" ON "tickets" USING btree ("status","last_customer_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_tokens_user_idx" ON "auth_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customer_flags_customer_idx" ON "customer_flags" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_user_key" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_public_ref_key" ON "customers" USING btree ("public_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_account_ref_key" ON "customers" USING btree ("account_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "mfa_factors_one_totp_key" ON "mfa_factors" USING btree ("user_id") WHERE "mfa_factors"."type" = 'totp';--> statement-breakpoint
CREATE INDEX "mfa_recovery_codes_user_idx" ON "mfa_recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mfa_recovery_codes_hash_key" ON "mfa_recovery_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_key_key" ON "roles" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invitations_public_ref_key" ON "staff_invitations" USING btree ("public_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invitations_token_hash_key" ON "staff_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invitations_open_email_key" ON "staff_invitations" USING btree (lower("email")) WHERE "staff_invitations"."accepted_at" is null and "staff_invitations"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_members_user_key" ON "staff_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "staff_members_role_idx" ON "staff_members" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_idempotency_key" ON "journal_entries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "journal_entries_reference_idx" ON "journal_entries" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "journal_lines_entry_idx" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_account_idx" ON "journal_lines" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_code_key" ON "ledger_accounts" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_customer_wallet_key" ON "ledger_accounts" USING btree ("customer_id") WHERE "ledger_accounts"."code" like 'wallet:%';