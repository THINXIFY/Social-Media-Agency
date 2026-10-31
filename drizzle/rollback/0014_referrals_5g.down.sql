-- Rollback for 0014_referrals_5g (development and test only).
DROP TRIGGER IF EXISTS referrals_qualify_locked ON referrals;
DROP TRIGGER IF EXISTS referral_rewards_locked ON referral_rewards;
DROP TRIGGER IF EXISTS referral_policies_locked ON referral_policies;
DROP FUNCTION IF EXISTS sv_referral_qualify_locked();
DROP FUNCTION IF EXISTS sv_referral_reward_locked();
DROP FUNCTION IF EXISTS sv_referral_policy_locked();
DROP INDEX IF EXISTS referrals_code_attributed_idx;
ALTER TABLE referral_events DISABLE TRIGGER referral_events_append_only;
DELETE FROM referral_events WHERE referral_id IN (SELECT id FROM referrals WHERE policy_id IS NULL);
ALTER TABLE referral_events ENABLE TRIGGER referral_events_append_only;
ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_reviewed_by_users_id_fk,
  DROP COLUMN IF EXISTS verified_at, DROP COLUMN IF EXISTS flags, DROP COLUMN IF EXISTS reviewed_by, DROP COLUMN IF EXISTS reviewed_at;
DELETE FROM referrals WHERE policy_id IS NULL;
ALTER TABLE referrals ALTER COLUMN policy_id SET NOT NULL;
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
