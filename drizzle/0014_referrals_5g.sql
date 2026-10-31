ALTER TABLE "referrals" ALTER COLUMN "policy_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "referrals" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "referrals" ADD COLUMN "flags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "referrals" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "referrals" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referrals_code_attributed_idx" ON "referrals" USING btree ("code_id","attributed_at");--> statement-breakpoint
-- 5G-B: reward activation stays blocked until approved rules and accounting controls exist.
-- Lifting this guard needs its own reviewed migration.
CREATE FUNCTION sv_referral_policy_locked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'active' THEN
    RAISE EXCEPTION 'sv:referrals: reward policies cannot be activated' USING ERRCODE = 'SV014';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION sv_referral_reward_locked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sv:referrals: rewards are not enabled' USING ERRCODE = 'SV014';
END $$;
--> statement-breakpoint
CREATE FUNCTION sv_referral_qualify_locked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'qualified' AND NEW.policy_id IS NULL THEN
    RAISE EXCEPTION 'sv:referrals: qualification needs an approved policy' USING ERRCODE = 'SV014';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER referral_policies_locked BEFORE INSERT OR UPDATE ON referral_policies FOR EACH ROW EXECUTE FUNCTION sv_referral_policy_locked();
--> statement-breakpoint
CREATE TRIGGER referral_rewards_locked BEFORE INSERT ON referral_rewards FOR EACH ROW EXECUTE FUNCTION sv_referral_reward_locked();
--> statement-breakpoint
CREATE TRIGGER referrals_qualify_locked BEFORE INSERT OR UPDATE ON referrals FOR EACH ROW EXECUTE FUNCTION sv_referral_qualify_locked();
