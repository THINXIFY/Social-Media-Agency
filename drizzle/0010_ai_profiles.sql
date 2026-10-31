CREATE TABLE "ai_profiles" (
	"customer_id" uuid PRIMARY KEY NOT NULL,
	"persona" text,
	"goals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"onboarding" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_profiles_persona_check" CHECK ("ai_profiles"."persona" is null or "ai_profiles"."persona" in ('creator', 'small_business', 'agency', 'ecommerce', 'freelancer', 'exploring')),
	CONSTRAINT "ai_profiles_onboarding_check" CHECK ("ai_profiles"."onboarding" in ('completed', 'skipped')),
	CONSTRAINT "ai_profiles_goals_check" CHECK (jsonb_typeof("ai_profiles"."goals") = 'array' and jsonb_array_length("ai_profiles"."goals") <= 6)
);
--> statement-breakpoint
ALTER TABLE "ai_profiles" ADD CONSTRAINT "ai_profiles_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;