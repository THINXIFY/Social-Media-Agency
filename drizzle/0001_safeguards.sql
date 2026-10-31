-- Phase 5A safeguards: invariants enforced by PostgreSQL itself, so no code
-- path (including a buggy one) can violate them.
--
-- Error codes (SQLSTATE, class "SV"):
--   SV001 append-only row changed          SV006 owner role edited
--   SV002 unbalanced journal entry         SV007 deposit second review invalid
--   SV003 insufficient funds               SV008 balance written directly
--   SV004 refund exceeds amount paid       SV009 order for a non-purchasable service
--   SV005 last active owner removed
-- Rollback: drizzle/rollback/0001_safeguards.down.sql

-- 1. Append-only tables ------------------------------------------------------
CREATE FUNCTION sv_forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sv:append_only: % rows cannot be changed (%)', TG_TABLE_NAME, lower(TG_OP) USING ERRCODE = 'SV001';
END $$;
--> statement-breakpoint
CREATE TRIGGER journal_entries_append_only BEFORE UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION sv_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER journal_entries_no_truncate BEFORE TRUNCATE ON journal_entries FOR EACH STATEMENT EXECUTE FUNCTION sv_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER journal_lines_append_only BEFORE UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION sv_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER journal_lines_no_truncate BEFORE TRUNCATE ON journal_lines FOR EACH STATEMENT EXECUTE FUNCTION sv_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER ledger_accounts_immutable BEFORE UPDATE OR DELETE ON ledger_accounts FOR EACH ROW EXECUTE FUNCTION sv_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER ledger_accounts_no_truncate BEFORE TRUNCATE ON ledger_accounts FOR EACH STATEMENT EXECUTE FUNCTION sv_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER order_events_append_only BEFORE UPDATE OR DELETE ON order_events FOR EACH ROW EXECUTE FUNCTION sv_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER order_refunds_append_only BEFORE UPDATE OR DELETE ON order_refunds FOR EACH ROW EXECUTE FUNCTION sv_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER deposit_reviews_append_only BEFORE UPDATE OR DELETE ON deposit_reviews FOR EACH ROW EXECUTE FUNCTION sv_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER referral_events_append_only BEFORE UPDATE OR DELETE ON referral_events FOR EACH ROW EXECUTE FUNCTION sv_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION sv_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION sv_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER service_price_versions_append_only BEFORE UPDATE OR DELETE ON service_price_versions FOR EACH ROW EXECUTE FUNCTION sv_forbid_mutation();
--> statement-breakpoint

-- 2. Every journal entry has >= 2 lines summing to zero (checked at commit) ---
CREATE FUNCTION sv_check_entry_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target uuid;
  total bigint;
  n int;
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    target := NEW.id;
  ELSE
    target := NEW.entry_id;
  END IF;
  SELECT coalesce(sum(amount_cents), 0), count(*) INTO total, n FROM journal_lines WHERE entry_id = target;
  IF n < 2 OR total <> 0 THEN
    RAISE EXCEPTION 'sv:unbalanced_entry: entry % has % line(s) summing to % cents', target, n, total USING ERRCODE = 'SV002';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_lines_balanced AFTER INSERT ON journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sv_check_entry_balanced();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_entries_have_lines AFTER INSERT ON journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sv_check_entry_balanced();
--> statement-breakpoint

-- 3. Balances: maintained only here; wallets can never go negative -----------
CREATE FUNCTION sv_apply_journal_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  acct ledger_accounts%ROWTYPE;
  delta bigint;
  new_balance bigint;
BEGIN
  SELECT * INTO acct FROM ledger_accounts WHERE id = NEW.account_id;
  -- Normal-side balance: credit-normal for liabilities and revenue, debit-normal otherwise.
  IF acct.type IN ('liability', 'revenue') THEN
    delta := -NEW.amount_cents;
  ELSE
    delta := NEW.amount_cents;
  END IF;
  INSERT INTO account_balances AS b (account_id, balance_cents, version, updated_at)
  VALUES (NEW.account_id, delta, 1, now())
  ON CONFLICT (account_id) DO UPDATE
    SET balance_cents = b.balance_cents + EXCLUDED.balance_cents, version = b.version + 1, updated_at = now()
  RETURNING b.balance_cents INTO new_balance;
  IF new_balance < 0 AND NOT acct.allow_negative THEN
    RAISE EXCEPTION 'sv:insufficient_funds: account % would fall to % cents', acct.code, new_balance USING ERRCODE = 'SV003';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER journal_lines_apply AFTER INSERT ON journal_lines FOR EACH ROW EXECUTE FUNCTION sv_apply_journal_line();
--> statement-breakpoint
CREATE FUNCTION sv_guard_balances() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') OR pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'sv:balance_direct_write: account_balances is maintained by the ledger only' USING ERRCODE = 'SV008';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER account_balances_guard BEFORE INSERT OR UPDATE OR DELETE ON account_balances FOR EACH ROW EXECUTE FUNCTION sv_guard_balances();
--> statement-breakpoint
CREATE TRIGGER account_balances_no_truncate BEFORE TRUNCATE ON account_balances FOR EACH STATEMENT EXECUTE FUNCTION sv_guard_balances();
--> statement-breakpoint

-- 4. Refunds can never exceed what the order cost ----------------------------
CREATE FUNCTION sv_check_refund_cap() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  paid bigint;
  refunded bigint;
BEGIN
  -- Lock the order so concurrent refunds are serialised.
  SELECT total_cents INTO paid FROM orders WHERE id = NEW.order_id FOR UPDATE;
  SELECT coalesce(sum(amount_cents), 0) INTO refunded FROM order_refunds WHERE order_id = NEW.order_id;
  IF refunded + NEW.amount_cents > paid THEN
    RAISE EXCEPTION 'sv:refund_exceeds_paid: % + % > % cents', refunded, NEW.amount_cents, paid USING ERRCODE = 'SV004';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER order_refunds_cap BEFORE INSERT ON order_refunds FOR EACH ROW EXECUTE FUNCTION sv_check_refund_cap();
--> statement-breakpoint

-- 5. Owner protection --------------------------------------------------------
CREATE FUNCTION sv_keep_an_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  owners int;
BEGIN
  IF OLD.status <> 'active' OR NOT EXISTS (SELECT 1 FROM roles WHERE id = OLD.role_id AND key = 'owner') THEN
    RETURN NULL;
  END IF;
  -- Serialise concurrent owner changes so two demotions can't both pass.
  PERFORM 1 FROM roles WHERE key = 'owner' FOR UPDATE;
  SELECT count(*) INTO owners FROM staff_members s JOIN roles r ON r.id = s.role_id WHERE r.key = 'owner' AND s.status = 'active';
  IF owners = 0 THEN
    RAISE EXCEPTION 'sv:last_owner: at least one active owner is required' USING ERRCODE = 'SV005';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER staff_members_keep_owner AFTER UPDATE OR DELETE ON staff_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sv_keep_an_owner();
--> statement-breakpoint
CREATE FUNCTION sv_protect_owner_role() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  rid uuid;
BEGIN
  IF TG_TABLE_NAME = 'roles' THEN
    IF OLD.key = 'owner' THEN
      RAISE EXCEPTION 'sv:owner_role_protected: the owner role cannot be changed' USING ERRCODE = 'SV006';
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN
      rid := NEW.role_id;
    ELSE
      rid := OLD.role_id;
    END IF;
    IF EXISTS (SELECT 1 FROM roles WHERE id = rid AND key = 'owner') THEN
      IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'sv:owner_role_protected: owner permissions cannot be reduced' USING ERRCODE = 'SV006';
      END IF;
      IF TG_TABLE_NAME = 'role_module_access' THEN
        IF NEW.level <> 'manage' THEN
          RAISE EXCEPTION 'sv:owner_role_protected: owner must manage every module' USING ERRCODE = 'SV006';
        END IF;
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER roles_protect_owner BEFORE UPDATE OR DELETE ON roles FOR EACH ROW EXECUTE FUNCTION sv_protect_owner_role();
--> statement-breakpoint
CREATE TRIGGER role_module_access_protect_owner BEFORE INSERT OR UPDATE OR DELETE ON role_module_access FOR EACH ROW EXECUTE FUNCTION sv_protect_owner_role();
--> statement-breakpoint
CREATE TRIGGER role_sensitive_permissions_protect_owner BEFORE INSERT OR UPDATE OR DELETE ON role_sensitive_permissions FOR EACH ROW EXECUTE FUNCTION sv_protect_owner_role();
--> statement-breakpoint

-- 6. Deposit second review: needs a first review by someone else -------------
CREATE FUNCTION sv_check_second_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.step = 'second' THEN
    IF NOT EXISTS (SELECT 1 FROM deposit_reviews WHERE deposit_id = NEW.deposit_id AND step = 'first') THEN
      RAISE EXCEPTION 'sv:second_review_invalid: a first review is required' USING ERRCODE = 'SV007';
    END IF;
    IF EXISTS (SELECT 1 FROM deposit_reviews WHERE deposit_id = NEW.deposit_id AND step = 'first' AND decided_by = NEW.decided_by) THEN
      RAISE EXCEPTION 'sv:second_review_invalid: the second reviewer must be a different person' USING ERRCODE = 'SV007';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER deposit_reviews_second_check BEFORE INSERT ON deposit_reviews FOR EACH ROW EXECUTE FUNCTION sv_check_second_review();
--> statement-breakpoint

-- 7. Purchasability: every gate recorded + a current price -------------------
CREATE VIEW purchasable_services AS
SELECT s.id AS service_id, pv.id AS price_version_id
FROM services s
JOIN service_eligibility e ON e.service_id = s.id
JOIN LATERAL (
  SELECT v.id FROM service_price_versions v
  WHERE v.service_id = s.id AND v.effective_from <= now()
  ORDER BY v.effective_from DESC
  LIMIT 1
) pv ON true
WHERE s.visible
  AND s.archived_at IS NULL
  AND e.policy_reviewed_at IS NOT NULL
  AND e.supplier_verified_at IS NOT NULL
  AND e.fulfillment_verified_at IS NOT NULL
  AND e.payment_accepted_at IS NOT NULL
  AND e.legal_reviewed_at IS NOT NULL
  AND e.technical_ready_at IS NOT NULL;
--> statement-breakpoint

-- 8. Orders fail closed: checkout switch + purchasable service + current price
CREATE FUNCTION sv_check_order_allowed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_settings WHERE key = 'commerce.checkout_enabled' AND value = 'true'::jsonb) THEN
    RAISE EXCEPTION 'sv:order_not_allowed: checkout is disabled' USING ERRCODE = 'SV009';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM purchasable_services p WHERE p.service_id = NEW.service_id AND p.price_version_id = NEW.price_version_id) THEN
    RAISE EXCEPTION 'sv:order_not_allowed: service % is not purchasable at this price', NEW.service_id USING ERRCODE = 'SV009';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER orders_allowed BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION sv_check_order_allowed();
