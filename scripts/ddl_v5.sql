-- ============================================================================
-- DDL v5 - Multi-Tenant Gym Management SaaS Schema
-- Target: PostgreSQL 16
-- ============================================================================

-- 0. EXTENSIONS
-- Only extensions actually required. Native gen_random_uuid() is built-in.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 1. ROLES SETUP
-- definer_admin: Dedicated NOLOGIN role with BYPASSRLS to own all definer functions
-- app_user: Runtime API connection role (LOGIN, NOBYPASSRLS, NOT superuser)
-- retention_worker: Dedicated batch purge role (LOGIN, NOBYPASSRLS, NOT superuser)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'definer_admin') THEN
    CREATE ROLE definer_admin WITH NOLOGIN BYPASSRLS;
  ELSE
    ALTER ROLE definer_admin WITH NOLOGIN BYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN PASSWORD 'dev_app_password_only' NOBYPASSRLS;
  ELSE
    ALTER ROLE app_user WITH NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'retention_worker') THEN
    CREATE ROLE retention_worker WITH LOGIN PASSWORD 'dev_retention_password_only' NOBYPASSRLS;
  ELSE
    ALTER ROLE retention_worker WITH NOBYPASSRLS;
  END IF;
END $$;

-- 2. GLOBAL TABLES (Pre-Tenant Context)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL UNIQUE,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  is_platform_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,
  default_country VARCHAR(2) NOT NULL DEFAULT 'IN',
  timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  tax_rate_basis_points BIGINT NOT NULL DEFAULT 0,
  tax_is_inclusive BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'past_due', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE account_login_attempts (
  account_key VARCHAR(50) PRIMARY KEY,
  failed_attempts INT NOT NULL DEFAULT 1,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_until TIMESTAMPTZ
);

-- refresh_tokens has gym_id and user_id, with user_id-keyed RLS
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  family_id UUID NOT NULL DEFAULT gen_random_uuid(),
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX idx_refresh_tokens_gym_user ON refresh_tokens(gym_id, user_id);

CREATE TABLE user_gym_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'manager', 'staff', 'trainer')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_user_gym UNIQUE (gym_id, user_id)
);
CREATE INDEX idx_memberships_user ON user_gym_memberships(user_id);
CREATE INDEX idx_memberships_gym ON user_gym_memberships(gym_id);

-- Sequence counters (Tenant tables, FORCE RLS enabled)
CREATE TABLE receipt_sequences (
  gym_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  last_receipt_number BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE member_sequences (
  gym_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  last_member_number BIGINT NOT NULL DEFAULT 0
);

-- 3. TENANT TABLES (Enforced by gym_id + Composite FKs + FORCE RLS)

CREATE TABLE staff_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('manager', 'staff', 'trainer')),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_staff_invitations_gym_id UNIQUE (gym_id, id)
);

CREATE TABLE membership_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  price_cents BIGINT NOT NULL CHECK (price_cents >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_membership_plans_gym_id UNIQUE (gym_id, id)
);

CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  member_number VARCHAR(50) NOT NULL,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50), -- Nullable for single-name members
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  gender VARCHAR(20) DEFAULT 'unspecified',
  date_of_birth DATE,
  emergency_contact_name VARCHAR(100),
  emergency_contact_phone VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'banned')),
  joined_date DATE NOT NULL DEFAULT CURRENT_DATE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_members_gym_id UNIQUE (gym_id, id),
  CONSTRAINT uq_members_gym_member_number UNIQUE (gym_id, member_number)
);
CREATE INDEX idx_members_name_trgm ON members USING gin ((first_name || ' ' || COALESCE(last_name, '')) gin_trgm_ops);
CREATE INDEX idx_members_gym_phone ON members(gym_id, phone);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL,
  member_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'active', 'cancelled')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_price_cents BIGINT NOT NULL CHECK (total_price_cents >= 0),
  discount_cents BIGINT NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_subscriptions_gym_id UNIQUE (gym_id, id),
  CONSTRAINT fk_sub_gym_member FOREIGN KEY (gym_id, member_id) REFERENCES members(gym_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_sub_gym_plan FOREIGN KEY (gym_id, plan_id) REFERENCES membership_plans(gym_id, id) ON DELETE RESTRICT,
  CONSTRAINT check_sub_dates CHECK (end_date >= start_date),
  CONSTRAINT check_sub_discount CHECK (discount_cents <= total_price_cents)
);
CREATE INDEX idx_subscriptions_gym_member ON subscriptions(gym_id, member_id);
CREATE INDEX idx_subscriptions_gym_end_date ON subscriptions(gym_id, end_date);

-- Append-Only Price Adjustments / Goodwill Credits
CREATE TABLE subscription_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL,
  subscription_id UUID NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT uq_sub_adjustments_gym_id UNIQUE (gym_id, id),
  CONSTRAINT fk_adj_gym_sub FOREIGN KEY (gym_id, subscription_id) REFERENCES subscriptions(gym_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_sub_adjustments_gym_sub ON subscription_adjustments(gym_id, subscription_id);

CREATE TABLE subscription_freezes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL,
  subscription_id UUID NOT NULL,
  freeze_start DATE NOT NULL,
  freeze_end DATE NOT NULL,
  days_frozen INTEGER NOT NULL CHECK (days_frozen > 0),
  reason TEXT NOT NULL,
  approved_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_subscription_freezes_gym_id UNIQUE (gym_id, id),
  CONSTRAINT fk_freeze_gym_sub FOREIGN KEY (gym_id, subscription_id) REFERENCES subscriptions(gym_id, id) ON DELETE RESTRICT,
  CONSTRAINT check_freeze_dates CHECK (freeze_end >= freeze_start),
  CONSTRAINT check_days_frozen_match CHECK (days_frozen = (freeze_end - freeze_start + 1))
);

CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL,
  member_id UUID NOT NULL,
  subscription_id UUID,
  idempotency_key UUID NOT NULL,
  receipt_number VARCHAR(50), -- NULL for opening_balance
  type VARCHAR(20) NOT NULL CHECK (type IN ('payment', 'refund', 'reversal', 'opening_balance')),
  method VARCHAR(20) NOT NULL CHECK (method IN ('cash', 'upi', 'card_pos', 'bank_transfer')),
  amount_cents BIGINT NOT NULL,
  tax_cents BIGINT NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  external_reference VARCHAR(100),
  parent_transaction_id UUID,
  notes TEXT,
  recorded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_payment_transactions_gym_id UNIQUE (gym_id, id),
  CONSTRAINT uq_payment_idempotency UNIQUE (gym_id, idempotency_key),
  CONSTRAINT uq_payment_receipt UNIQUE (gym_id, receipt_number),
  CONSTRAINT fk_payment_gym_member FOREIGN KEY (gym_id, member_id) REFERENCES members(gym_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_payment_gym_sub FOREIGN KEY (gym_id, subscription_id) REFERENCES subscriptions(gym_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_payment_gym_parent FOREIGN KEY (gym_id, parent_transaction_id) REFERENCES payment_transactions(gym_id, id) ON DELETE RESTRICT,
  CONSTRAINT check_payment_type_amount_sign CHECK (
    (type IN ('payment', 'opening_balance') AND amount_cents > 0 AND tax_cents >= 0) OR
    (type IN ('refund', 'reversal') AND amount_cents < 0 AND tax_cents <= 0)
  ),
  CONSTRAINT check_refund_requires_parent CHECK (
    (type NOT IN ('refund', 'reversal')) OR (parent_transaction_id IS NOT NULL)
  ),
  CONSTRAINT check_receipt_number_requirement CHECK (
    (type = 'opening_balance') OR (receipt_number IS NOT NULL)
  )
);
CREATE INDEX idx_payments_gym_sub ON payment_transactions(gym_id, subscription_id);
CREATE INDEX idx_payments_gym_created ON payment_transactions(gym_id, created_at);
CREATE INDEX idx_payments_gym_effective_date ON payment_transactions(gym_id, effective_date);

CREATE TABLE attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL,
  member_id UUID NOT NULL,
  attendance_date DATE NOT NULL,
  check_in_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  method VARCHAR(20) NOT NULL DEFAULT 'staff_manual' CHECK (method IN ('staff_manual', 'qr_kiosk')),
  recorded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  was_override BOOLEAN NOT NULL DEFAULT false,
  override_reason VARCHAR(50) CHECK (
    override_reason IS NULL OR override_reason IN (
      'medical_clearance_pending',
      'payment_promised_today',
      'forgot_wallet',
      'guest_pass',
      'other_owner_approved'
    )
  ),
  is_voided BOOLEAN NOT NULL DEFAULT false,
  voided_at TIMESTAMPTZ,
  voided_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_attendance_logs_gym_id UNIQUE (gym_id, id),
  CONSTRAINT fk_attendance_gym_member FOREIGN KEY (gym_id, member_id) REFERENCES members(gym_id, id) ON DELETE RESTRICT
);
-- Partial unique index: allows re-check-in if previous attendance was voided
CREATE UNIQUE INDEX uq_member_daily_attendance ON attendance_logs (gym_id, member_id, attendance_date) WHERE (is_voided = false);
CREATE INDEX idx_attendance_gym_date ON attendance_logs(gym_id, attendance_date);

CREATE TABLE csv_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_sha256 VARCHAR(64) NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors_json JSONB NOT NULL DEFAULT '[]'::jsonb, -- PII-free: [{row: 1, field: 'phone', code: 'INVALID'}]
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  CONSTRAINT uq_csv_import_jobs_gym_id UNIQUE (gym_id, id),
  CONSTRAINT uq_csv_import_file_hash UNIQUE (gym_id, file_sha256)
);

CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL,
  member_id UUID NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'whatsapp_click')),
  template VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'clicked', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_notification_logs_gym_id UNIQUE (gym_id, id),
  CONSTRAINT fk_notif_gym_member FOREIGN KEY (gym_id, member_id) REFERENCES members(gym_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_notification_logs_retention ON notification_logs(sent_at);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE RESTRICT, -- NULL for system actor
  actor_type VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'system')),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  changed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb, -- PII-free
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_audit_logs_gym_id UNIQUE (gym_id, id)
);

-- ============================================================================
-- 4. TRIGGERS: IMMUTABILITY, OVERLAP & REFUND CONCURRENCY
-- ============================================================================

CREATE OR REPLACE FUNCTION reject_table_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table % is strictly append-only; mutations are forbidden.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_transactions_immutable
BEFORE UPDATE OR DELETE ON payment_transactions
FOR EACH ROW EXECUTE FUNCTION reject_table_mutation();

CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION reject_table_mutation();

CREATE TRIGGER trg_subscription_adjustments_immutable
BEFORE UPDATE OR DELETE ON subscription_adjustments
FOR EACH ROW EXECUTE FUNCTION reject_table_mutation();

-- Guard: Subscription Overlap Prevention Trigger using two-key advisory lock
CREATE OR REPLACE FUNCTION validate_subscription_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_overlapping_id UUID;
  v_lock_key1 INT;
  v_lock_key2 INT;
BEGIN
  -- Bypass check if executing within cascading trigger (e.g. freeze shift trigger stack)
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('active', 'queued') THEN
    -- Two-key advisory transaction lock per member to serialize concurrent subscription creations
    v_lock_key1 := hashtext('sub_overlap_' || NEW.gym_id::text);
    v_lock_key2 := ('x' || substr(md5(NEW.member_id::text), 1, 8))::bit(32)::int;
    PERFORM pg_advisory_xact_lock(v_lock_key1, v_lock_key2);

    SELECT s.id INTO v_overlapping_id
    FROM subscriptions s
    WHERE s.gym_id = NEW.gym_id
      AND s.member_id = NEW.member_id
      AND s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND s.status IN ('active', 'queued')
      AND (NEW.start_date <= s.end_date AND NEW.end_date >= s.start_date)
    LIMIT 1;

    IF v_overlapping_id IS NOT NULL THEN
      RAISE EXCEPTION 'Subscription dates [% to %] overlap with existing subscription %',
        NEW.start_date, NEW.end_date, v_overlapping_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_subscriptions_overlap
BEFORE INSERT OR UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION validate_subscription_overlap();

-- Guard: Refund Two-Key Advisory Lock + Parent Verification + Cumulative Limit
CREATE OR REPLACE FUNCTION validate_refund_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_amount BIGINT;
  v_parent_type VARCHAR(20);
  v_total_refunded BIGINT;
  v_lock_key1 INT;
  v_lock_key2 INT;
BEGIN
  IF NEW.type IN ('refund', 'reversal') THEN
    -- Two-key advisory transaction lock on parent transaction to serialize concurrent refunds
    v_lock_key1 := hashtext('refund_' || NEW.gym_id::text);
    v_lock_key2 := ('x' || substr(md5(NEW.parent_transaction_id::text), 1, 8))::bit(32)::int;
    PERFORM pg_advisory_xact_lock(v_lock_key1, v_lock_key2);

    SELECT amount_cents, type INTO v_parent_amount, v_parent_type
    FROM payment_transactions
    WHERE gym_id = NEW.gym_id AND id = NEW.parent_transaction_id;

    IF v_parent_amount IS NULL THEN
      RAISE EXCEPTION 'Parent payment transaction % not found for gym.', NEW.parent_transaction_id;
    END IF;

    IF v_parent_type <> 'payment' THEN
      RAISE EXCEPTION 'Cannot refund a transaction of type %. Parent must be payment.', v_parent_type;
    END IF;

    SELECT COALESCE(SUM(ABS(amount_cents)), 0) INTO v_total_refunded
    FROM payment_transactions
    WHERE gym_id = NEW.gym_id
      AND parent_transaction_id = NEW.parent_transaction_id
      AND type IN ('refund', 'reversal');

    IF (v_total_refunded + ABS(NEW.amount_cents)) > v_parent_amount THEN
      RAISE EXCEPTION 'Cumulative refund amount (%) exceeds original payment (%).', 
        (v_total_refunded + ABS(NEW.amount_cents)), v_parent_amount;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_refund_limit
BEFORE INSERT ON payment_transactions
FOR EACH ROW EXECUTE FUNCTION validate_refund_limit();

-- Guard: Refund Semantics (Cancelled allow, Pending reject, Active require adjustment, Null pass)
CREATE OR REPLACE FUNCTION validate_subscription_refund_semantics()
RETURNS TRIGGER AS $$
DECLARE
  v_sub_status VARCHAR(20);
  v_sub_total_price BIGINT;
  v_sub_discount BIGINT;
  v_sub_adjustments BIGINT;
  v_sub_net_price BIGINT;
  v_sub_paid BIGINT;
BEGIN
  IF NEW.type IN ('refund', 'reversal') THEN
    -- Direct payment refund not tied to subscription: dues logic does not apply
    IF NEW.subscription_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT status, total_price_cents, discount_cents
    INTO v_sub_status, v_sub_total_price, v_sub_discount
    FROM subscriptions
    WHERE gym_id = NEW.gym_id AND id = NEW.subscription_id;

    IF v_sub_status IS NULL THEN
      RAISE EXCEPTION 'Subscription % not found for gym.', NEW.subscription_id;
    END IF;

    -- If subscription is cancelled, full or partial refund is always permitted
    IF v_sub_status = 'cancelled' THEN
      RETURN NEW;
    END IF;

    -- If subscription is pending, refunds are rejected unless cancelled
    IF v_sub_status = 'pending' THEN
      RAISE EXCEPTION 'Invalid refund semantics: cannot refund a pending subscription. Cancel the subscription first.';
    END IF;

    IF v_sub_status = 'active' THEN
      SELECT COALESCE(SUM(amount_cents), 0) INTO v_sub_adjustments
      FROM subscription_adjustments
      WHERE gym_id = NEW.gym_id AND subscription_id = NEW.subscription_id;

      v_sub_net_price := v_sub_total_price - v_sub_discount - v_sub_adjustments;

      SELECT COALESCE(SUM(amount_cents), 0) INTO v_sub_paid
      FROM payment_transactions
      WHERE gym_id = NEW.gym_id AND subscription_id = NEW.subscription_id;

      -- If after this refund, total paid would drop below net price without price adjustment:
      IF (v_sub_paid + NEW.amount_cents) < v_sub_net_price THEN
        RAISE EXCEPTION 'Invalid refund semantics: refund on active subscription requires either cancelling the subscription or recording a price adjustment in subscription_adjustments so dues do not reappear.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_refund_semantics
BEFORE INSERT ON payment_transactions
FOR EACH ROW EXECUTE FUNCTION validate_subscription_refund_semantics();

-- Shift Rule: Freeze on Active Subscription Extends It and Shifts All Queued Renewals (Uses pg_trigger_depth)
CREATE OR REPLACE FUNCTION apply_subscription_freeze_shift()
RETURNS TRIGGER AS $$
DECLARE
  v_sub_status VARCHAR(20);
  v_member_id UUID;
  v_start_date DATE;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_active = true THEN
    SELECT status, member_id, start_date
    INTO v_sub_status, v_member_id, v_start_date
    FROM subscriptions
    WHERE gym_id = NEW.gym_id AND id = NEW.subscription_id;

    IF v_sub_status <> 'active' THEN
      RAISE EXCEPTION 'Cannot freeze subscription with status %. Only active subscriptions may be frozen.', v_sub_status;
    END IF;

    -- 1. Shift all subsequent queued subscriptions forward by days_frozen
    UPDATE subscriptions
    SET start_date = start_date + NEW.days_frozen,
        end_date = end_date + NEW.days_frozen
    WHERE gym_id = NEW.gym_id
      AND member_id = v_member_id
      AND status = 'queued'
      AND start_date > v_start_date;

    -- 2. Extend active subscription end_date by days_frozen
    UPDATE subscriptions
    SET end_date = end_date + NEW.days_frozen
    WHERE gym_id = NEW.gym_id AND id = NEW.subscription_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_subscription_freeze_shift
AFTER INSERT ON subscription_freezes
FOR EACH ROW EXECUTE FUNCTION apply_subscription_freeze_shift();
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Global tables with tenant/user keys
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_refresh_tokens ON refresh_tokens
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE user_gym_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_gym_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_user_gym_memberships ON user_gym_memberships
  FOR ALL TO app_user
  USING (
    user_id = NULLIF(current_setting('app.user_id', true), '')::uuid OR
    gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid
  )
  WITH CHECK (
    gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid
  );

-- All tenant-owned tables
ALTER TABLE receipt_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_sequences FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_receipt_sequences ON receipt_sequences
  FOR ALL TO app_user
  USING (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid);

ALTER TABLE member_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_sequences FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_member_sequences ON member_sequences
  FOR ALL TO app_user
  USING (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid);

ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_staff_invitations ON staff_invitations
  FOR ALL TO app_user
  USING (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid);

ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_membership_plans ON membership_plans
  FOR ALL TO app_user
  USING (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid);

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE members FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_members ON members
  FOR ALL TO app_user
  USING (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_subscriptions ON subscriptions
  FOR ALL TO app_user
  USING (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid);

ALTER TABLE subscription_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_adjustments FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_subscription_adjustments ON subscription_adjustments
  FOR ALL TO app_user
  USING (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid);

ALTER TABLE subscription_freezes ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_freezes FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_subscription_freezes ON subscription_freezes
  FOR ALL TO app_user
  USING (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid);

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_payment_transactions ON payment_transactions
  FOR ALL TO app_user
  USING (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid);

ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_attendance_logs ON attendance_logs
  FOR ALL TO app_user
  USING (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid);

ALTER TABLE csv_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE csv_import_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_csv_import_jobs ON csv_import_jobs
  FOR ALL TO app_user
  USING (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_notification_logs ON notification_logs
  FOR ALL TO app_user
  USING (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_audit_logs ON audit_logs
  FOR ALL TO app_user
  USING (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid)
  WITH CHECK (gym_id = NULLIF(current_setting('app.gym_id', true), '')::uuid);

-- ============================================================================
-- 6. SECURITY DEFINER FUNCTIONS (Explicit Ownership & Parameter Validation)
-- Owned by dedicated NOLOGIN role: definer_admin (rolbypassrls = true)
-- ============================================================================

-- Function 0: Register User (Enables signup without direct INSERT on users)
CREATE OR REPLACE FUNCTION auth_register_user(
  p_phone VARCHAR,
  p_password_hash VARCHAR,
  p_full_name VARCHAR,
  p_email VARCHAR DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  INSERT INTO users (phone, password_hash, full_name, email)
  VALUES (p_phone, p_password_hash, p_full_name, p_email)
  RETURNING id INTO v_user_id;

  RETURN v_user_id;
END;
$$;
ALTER FUNCTION auth_register_user OWNER TO definer_admin;

-- Function 1: Auth Lookup User (No broad SELECT on users)
CREATE OR REPLACE FUNCTION auth_lookup_user_by_phone(p_phone VARCHAR)
RETURNS TABLE (
  out_user_id UUID,
  out_password_hash VARCHAR,
  out_full_name VARCHAR,
  out_is_platform_admin BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.password_hash, u.full_name, u.is_platform_admin
  FROM users u
  WHERE u.phone = p_phone;
END;
$$;
ALTER FUNCTION auth_lookup_user_by_phone OWNER TO definer_admin;

-- Function 2: Complete Password Reset
CREATE OR REPLACE FUNCTION auth_complete_password_reset(
  p_token_hash VARCHAR,
  p_new_password_hash VARCHAR
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_reset_id UUID;
BEGIN
  SELECT id, user_id INTO v_reset_id, v_user_id
  FROM password_resets
  WHERE token_hash = p_token_hash
    AND used_at IS NULL
    AND expires_at > CURRENT_TIMESTAMP
  FOR UPDATE;

  IF v_reset_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = v_reset_id;
  UPDATE users SET password_hash = p_new_password_hash, updated_at = CURRENT_TIMESTAMP WHERE id = v_user_id;

  -- Revoke existing refresh tokens
  UPDATE refresh_tokens SET is_revoked = true WHERE user_id = v_user_id;

  RETURN true;
END;
$$;
ALTER FUNCTION auth_complete_password_reset OWNER TO definer_admin;

-- Function 2b: Request Password Reset
CREATE OR REPLACE FUNCTION auth_request_password_reset(
  p_phone VARCHAR,
  p_token_hash VARCHAR,
  p_expires_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE phone = p_phone;
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO password_resets (user_id, token_hash, expires_at)
  VALUES (v_user_id, p_token_hash, p_expires_at);

  RETURN true;
END;
$$;
ALTER FUNCTION auth_request_password_reset OWNER TO definer_admin;

-- Function 2c: Owner-Initiated Staff Password Reset (Owner only, cannot reset another owner)
CREATE OR REPLACE FUNCTION auth_create_staff_password_reset(
  p_owner_id UUID,
  p_gym_id UUID,
  p_target_user_id UUID,
  p_token_hash VARCHAR,
  p_expires_at TIMESTAMPTZ
)
RETURNS TABLE (
  out_user_id UUID,
  out_phone VARCHAR,
  out_full_name VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_context_gym_id UUID;
  v_context_user_id UUID;
  v_caller_role VARCHAR;
  v_target_role VARCHAR;
  v_target_is_active BOOLEAN;
  v_target_phone VARCHAR;
  v_target_name VARCHAR;
BEGIN
  -- 1. Verify tenant & user session context
  v_context_gym_id := NULLIF(current_setting('app.gym_id', true), '')::uuid;
  v_context_user_id := NULLIF(current_setting('app.user_id', true), '')::uuid;

  IF v_context_gym_id IS NULL OR v_context_gym_id != p_gym_id THEN
    RAISE EXCEPTION 'Security context violation: app.gym_id does not match p_gym_id';
  END IF;

  IF v_context_user_id IS NULL OR v_context_user_id != p_owner_id THEN
    RAISE EXCEPTION 'Security context violation: app.user_id does not match p_owner_id';
  END IF;

  -- 2. Caller must be an active owner of p_gym_id
  SELECT role INTO v_caller_role
  FROM user_gym_memberships
  WHERE gym_id = p_gym_id AND user_id = p_owner_id AND is_active = true;

  IF v_caller_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Forbidden: Only gym owners can initiate staff password resets';
  END IF;

  -- 3. Target user cannot be the caller
  IF p_target_user_id = p_owner_id THEN
    RAISE EXCEPTION 'Invalid request: Cannot initiate owner reset via staff reset procedure';
  END IF;

  -- 4. Target user must be an active member of this gym
  SELECT role, is_active INTO v_target_role, v_target_is_active
  FROM user_gym_memberships
  WHERE gym_id = p_gym_id AND user_id = p_target_user_id;

  IF v_target_role IS NULL OR v_target_is_active = false THEN
    RAISE EXCEPTION 'Not found: Target staff member is not active in this gym';
  END IF;

  -- 5. Target user CANNOT be another owner (requirement 3: "owner only, cannot reset another owner")
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Forbidden: Owners cannot reset passwords of other owners';
  END IF;

  -- 6. Insert password reset record
  INSERT INTO password_resets (user_id, token_hash, expires_at)
  VALUES (p_target_user_id, p_token_hash, p_expires_at);

  -- 7. Fetch user phone and name (safe projection, no password_hash)
  SELECT phone, full_name INTO v_target_phone, v_target_name
  FROM users
  WHERE id = p_target_user_id;

  RETURN QUERY SELECT p_target_user_id, v_target_phone, v_target_name;
END;
$$;
ALTER FUNCTION auth_create_staff_password_reset OWNER TO definer_admin;

-- Function 2d: Database-Backed Login Throttling (Per-Account Lockout Counter)
CREATE OR REPLACE FUNCTION auth_record_failed_login(
  p_phone VARCHAR,
  p_max_attempts INT DEFAULT 5,
  p_lockout_seconds INT DEFAULT 300
)
RETURNS TABLE (
  out_failed_attempts INT,
  out_is_locked BOOLEAN,
  out_remaining_seconds INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempts INT := 1;
  v_locked_until TIMESTAMPTZ := NULL;
  v_is_locked BOOLEAN := false;
  v_remaining INT := 0;
  v_now TIMESTAMPTZ := CURRENT_TIMESTAMP;
  v_rec RECORD;
BEGIN
  SELECT * INTO v_rec FROM account_login_attempts WHERE account_key = p_phone FOR UPDATE;

  IF v_rec.account_key IS NOT NULL THEN
    IF v_rec.locked_until IS NOT NULL AND v_rec.locked_until > v_now THEN
      -- Already locked out
      v_remaining := GREATEST(1, EXTRACT(EPOCH FROM (v_rec.locked_until - v_now))::int);
      RETURN QUERY SELECT v_rec.failed_attempts, true, v_remaining;
      RETURN;
    ELSIF v_rec.locked_until IS NOT NULL AND v_rec.locked_until <= v_now THEN
      -- Lockout expired: reset counter to 1
      v_attempts := 1;
      v_locked_until := NULL;
      v_is_locked := false;
    ELSE
      -- Increment attempts
      v_attempts := v_rec.failed_attempts + 1;
      IF v_attempts >= p_max_attempts THEN
        v_locked_until := v_now + (p_lockout_seconds || ' seconds')::interval;
        v_is_locked := true;
        v_remaining := p_lockout_seconds;
      END IF;
    END IF;

    UPDATE account_login_attempts
    SET failed_attempts = v_attempts,
        last_attempt_at = v_now,
        locked_until = v_locked_until
    WHERE account_key = p_phone;
  ELSE
    -- First failure
    IF p_max_attempts <= 1 THEN
      v_locked_until := v_now + (p_lockout_seconds || ' seconds')::interval;
      v_is_locked := true;
      v_remaining := p_lockout_seconds;
    END IF;

    INSERT INTO account_login_attempts (account_key, failed_attempts, last_attempt_at, locked_until)
    VALUES (p_phone, v_attempts, v_now, v_locked_until);
  END IF;

  RETURN QUERY SELECT v_attempts, v_is_locked, v_remaining;
END;
$$;
ALTER FUNCTION auth_record_failed_login OWNER TO definer_admin;

CREATE OR REPLACE FUNCTION auth_is_account_locked(p_phone VARCHAR)
RETURNS TABLE (
  out_is_locked BOOLEAN,
  out_remaining_seconds INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec RECORD;
  v_now TIMESTAMPTZ := CURRENT_TIMESTAMP;
BEGIN
  SELECT * INTO v_rec FROM account_login_attempts WHERE account_key = p_phone;

  IF v_rec.account_key IS NOT NULL AND v_rec.locked_until IS NOT NULL AND v_rec.locked_until > v_now THEN
    RETURN QUERY SELECT true, GREATEST(1, EXTRACT(EPOCH FROM (v_rec.locked_until - v_now))::int);
  ELSE
    RETURN QUERY SELECT false, 0;
  END IF;
END;
$$;
ALTER FUNCTION auth_is_account_locked OWNER TO definer_admin;

CREATE OR REPLACE FUNCTION auth_clear_account_lockout(p_phone VARCHAR)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM account_login_attempts WHERE account_key = p_phone;
END;
$$;
ALTER FUNCTION auth_clear_account_lockout OWNER TO definer_admin;

CREATE OR REPLACE FUNCTION auth_reset_account_throttler()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM account_login_attempts;
END;
$$;
ALTER FUNCTION auth_reset_account_throttler OWNER TO definer_admin;

-- Function 3: Provision Gym Tenant
CREATE OR REPLACE FUNCTION provision_gym(
  p_owner_id UUID,
  p_name VARCHAR(100),
  p_slug VARCHAR(50),
  p_country VARCHAR(2),
  p_timezone VARCHAR(50),
  p_currency VARCHAR(3),
  p_tax_basis_points BIGINT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gym_id UUID;
  v_session_user_id UUID;
BEGIN
  v_session_user_id := NULLIF(current_setting('app.user_id', true), '')::uuid;
  IF v_session_user_id IS NULL OR p_owner_id <> v_session_user_id THEN
    RAISE EXCEPTION 'Access denied: p_owner_id does not match active session user.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) THEN
    RAISE EXCEPTION 'Invalid IANA timezone: %', p_timezone;
  END IF;

  INSERT INTO tenants (name, slug, default_country, timezone, currency, tax_rate_basis_points)
  VALUES (p_name, p_slug, p_country, p_timezone, p_currency, p_tax_basis_points)
  RETURNING id INTO v_gym_id;

  INSERT INTO receipt_sequences (gym_id, last_receipt_number) VALUES (v_gym_id, 0);
  INSERT INTO member_sequences (gym_id, last_member_number) VALUES (v_gym_id, 0);

  INSERT INTO user_gym_memberships (gym_id, user_id, role)
  VALUES (v_gym_id, p_owner_id, 'owner');

  RETURN v_gym_id;
END;
$$;
ALTER FUNCTION provision_gym OWNER TO definer_admin;

-- Function 4: Update Tenant Settings (Validates p_gym_id equals app.gym_id + timezone check)
CREATE OR REPLACE FUNCTION update_tenant_settings(
  p_gym_id UUID,
  p_name VARCHAR(100),
  p_timezone VARCHAR(50),
  p_currency VARCHAR(3),
  p_tax_basis_points BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_gym_id <> NULLIF(current_setting('app.gym_id', true), '')::uuid THEN
    RAISE EXCEPTION 'Access denied: p_gym_id does not match active session tenant.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) THEN
    RAISE EXCEPTION 'Invalid IANA timezone: %', p_timezone;
  END IF;

  UPDATE tenants
  SET name = p_name,
      timezone = p_timezone,
      currency = p_currency,
      tax_rate_basis_points = p_tax_basis_points,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_gym_id;
END;
$$;
ALTER FUNCTION update_tenant_settings OWNER TO definer_admin;

-- Function 4b: Get Tenant Settings (Safe Definer Lookup for Active Gym)
CREATE OR REPLACE FUNCTION get_tenant_settings(p_gym_id UUID)
RETURNS TABLE (
  out_id UUID,
  out_name VARCHAR(100),
  out_slug VARCHAR(50),
  out_country VARCHAR(2),
  out_timezone VARCHAR(50),
  out_currency VARCHAR(3),
  out_tax_rate_basis_points BIGINT,
  out_tax_is_inclusive BOOLEAN,
  out_status VARCHAR(20)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_gym_id <> NULLIF(current_setting('app.gym_id', true), '')::uuid THEN
    RAISE EXCEPTION 'Access denied: p_gym_id does not match active session tenant.';
  END IF;

  RETURN QUERY
  SELECT t.id, t.name, t.slug, t.default_country, t.timezone, t.currency, t.tax_rate_basis_points, t.tax_is_inclusive, t.status
  FROM tenants t
  WHERE t.id = p_gym_id;
END;
$$;
ALTER FUNCTION get_tenant_settings OWNER TO definer_admin;

-- Function 5: Claim Staff Invitation (Guards against changing existing membership)
CREATE OR REPLACE FUNCTION claim_staff_invitation(
  p_token_hash VARCHAR(64),
  p_user_id UUID
)
RETURNS TABLE (out_gym_id UUID, out_role VARCHAR(20))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite RECORD;
  v_existing_membership UUID;
  v_session_user_id UUID;
BEGIN
  v_session_user_id := NULLIF(current_setting('app.user_id', true), '')::uuid;
  IF v_session_user_id IS NULL OR p_user_id <> v_session_user_id THEN
    RAISE EXCEPTION 'Access denied: p_user_id does not match active session user.';
  END IF;

  SELECT i.id, i.gym_id, i.role, i.expires_at, i.used_at
  INTO v_invite
  FROM staff_invitations i
  WHERE i.token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invitation token.';
  END IF;

  IF v_invite.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation token has already been claimed.';
  END IF;

  IF CURRENT_TIMESTAMP > v_invite.expires_at THEN
    RAISE EXCEPTION 'Invitation token has expired.';
  END IF;

  -- Guard: NEVER alter an existing membership (especially owner!)
  SELECT id INTO v_existing_membership
  FROM user_gym_memberships
  WHERE gym_id = v_invite.gym_id AND user_id = p_user_id;

  IF v_existing_membership IS NOT NULL THEN
    RAISE EXCEPTION 'User already holds an active membership in this gym tenant.';
  END IF;

  UPDATE staff_invitations SET used_at = CURRENT_TIMESTAMP WHERE id = v_invite.id;

  INSERT INTO user_gym_memberships (gym_id, user_id, role)
  VALUES (v_invite.gym_id, p_user_id, v_invite.role);

  RETURN QUERY SELECT v_invite.gym_id, v_invite.role;
END;
$$;
ALTER FUNCTION claim_staff_invitation OWNER TO definer_admin;

-- Function 6a: Internal timestamped generator (only for definer_admin / maintenance / tests)
CREATE OR REPLACE FUNCTION _generate_next_receipt_number_internal(
  p_gym_id UUID,
  p_at TIMESTAMPTZ
)
RETURNS VARCHAR(50)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next_num BIGINT;
  v_tz VARCHAR(50);
  v_ym VARCHAR(6);
BEGIN
  IF p_gym_id <> NULLIF(current_setting('app.gym_id', true), '')::uuid THEN
    RAISE EXCEPTION 'Access denied: p_gym_id does not match active session tenant.';
  END IF;

  SELECT timezone INTO v_tz FROM tenants WHERE id = p_gym_id;
  IF v_tz IS NULL THEN
    RAISE EXCEPTION 'Tenant timezone not configured.';
  END IF;

  -- Month prefix determined by timestamp evaluated in gym's local timezone
  SELECT to_char(p_at AT TIME ZONE v_tz, 'YYYYMM') INTO v_ym;

  UPDATE receipt_sequences
  SET last_receipt_number = last_receipt_number + 1
  WHERE gym_id = p_gym_id
  RETURNING last_receipt_number INTO v_next_num;

  RETURN 'REC-' || v_ym || '-' || lpad(v_next_num::TEXT, 6, '0');
END;
$$;
ALTER FUNCTION _generate_next_receipt_number_internal OWNER TO definer_admin;

-- Function 6b: Public wrapper for app_user (no timestamp parameter!)
CREATE OR REPLACE FUNCTION generate_next_receipt_number(p_gym_id UUID)
RETURNS VARCHAR(50)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN _generate_next_receipt_number_internal(p_gym_id, CURRENT_TIMESTAMP);
END;
$$;
ALTER FUNCTION generate_next_receipt_number(UUID) OWNER TO definer_admin;

-- Function 7: Generate Monotonic Member Identifier
CREATE OR REPLACE FUNCTION generate_next_member_number(p_gym_id UUID)
RETURNS VARCHAR(50)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next_num BIGINT;
BEGIN
  IF p_gym_id <> NULLIF(current_setting('app.gym_id', true), '')::uuid THEN
    RAISE EXCEPTION 'Access denied: p_gym_id does not match active session tenant.';
  END IF;

  UPDATE member_sequences
  SET last_member_number = last_member_number + 1
  WHERE gym_id = p_gym_id
  RETURNING last_member_number INTO v_next_num;

  RETURN 'MEM-' || lpad(v_next_num::TEXT, 5, '0');
END;
$$;
ALTER FUNCTION generate_next_member_number OWNER TO definer_admin;

-- Function 8: Void Attendance Record (Definer function with role authorization, ADR-009)
CREATE OR REPLACE FUNCTION void_attendance_record(
  p_gym_id UUID,
  p_attendance_id UUID,
  p_void_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_role VARCHAR(20);
BEGIN
  IF p_gym_id <> NULLIF(current_setting('app.gym_id', true), '')::uuid THEN
    RAISE EXCEPTION 'Access denied: p_gym_id does not match active session tenant.';
  END IF;

  v_user_id := NULLIF(current_setting('app.user_id', true), '')::uuid;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Active session user not set.';
  END IF;

  -- Role authorization check enforced in DB function (ADR-009)
  SELECT role INTO v_user_role
  FROM user_gym_memberships
  WHERE gym_id = p_gym_id AND user_id = v_user_id AND is_active = true;

  IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Access denied: role % is not authorized to void attendance. Required: owner or manager.', COALESCE(v_user_role, 'none');
  END IF;

  UPDATE attendance_logs
  SET is_voided = true,
      voided_at = CURRENT_TIMESTAMP,
      voided_by_user_id = v_user_id,
      void_reason = p_void_reason
  WHERE gym_id = p_gym_id AND id = p_attendance_id AND is_voided = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active attendance log record % not found.', p_attendance_id;
  END IF;
END;
$$;
ALTER FUNCTION void_attendance_record OWNER TO definer_admin;

-- ============================================================================
-- 7. PERMISSIONS & GRANTS
-- ============================================================================

-- definer_admin needs table and sequence permissions because BYPASSRLS only bypasses RLS, not DAC
GRANT USAGE ON SCHEMA public TO definer_admin;
GRANT ALL ON ALL TABLES IN SCHEMA public TO definer_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO definer_admin;

-- app_user has NO broad SELECT or UPDATE on users or tenants
REVOKE ALL ON users, tenants FROM app_user;

-- Grants on tenant-scoped tables
GRANT SELECT, INSERT, UPDATE, DELETE ON members, membership_plans, subscriptions, subscription_freezes, csv_import_jobs, staff_invitations, user_gym_memberships TO app_user;
GRANT SELECT, INSERT, UPDATE ON refresh_tokens TO app_user;
GRANT SELECT, INSERT ON payment_transactions, attendance_logs, notification_logs, audit_logs, subscription_adjustments TO app_user;
REVOKE UPDATE, DELETE, TRUNCATE ON payment_transactions, attendance_logs, audit_logs, notification_logs, subscription_adjustments FROM app_user;

-- Grants for retention_worker role
GRANT SELECT, DELETE ON notification_logs, csv_import_jobs TO retention_worker;

-- Revoke internal generator from PUBLIC and app_user (Gate item 6)
REVOKE ALL ON FUNCTION _generate_next_receipt_number_internal(UUID, TIMESTAMPTZ) FROM PUBLIC, app_user;
GRANT EXECUTE ON FUNCTION _generate_next_receipt_number_internal(UUID, TIMESTAMPTZ) TO definer_admin;

-- Execute permissions on SECURITY DEFINER functions
GRANT EXECUTE ON FUNCTION auth_register_user TO app_user;
GRANT EXECUTE ON FUNCTION auth_lookup_user_by_phone TO app_user;
GRANT EXECUTE ON FUNCTION auth_complete_password_reset TO app_user;
GRANT EXECUTE ON FUNCTION auth_request_password_reset TO app_user;
GRANT EXECUTE ON FUNCTION auth_create_staff_password_reset TO app_user;
GRANT EXECUTE ON FUNCTION auth_record_failed_login TO app_user;
GRANT EXECUTE ON FUNCTION auth_is_account_locked TO app_user;
GRANT EXECUTE ON FUNCTION auth_clear_account_lockout TO app_user;
GRANT EXECUTE ON FUNCTION auth_reset_account_throttler TO app_user;
GRANT EXECUTE ON FUNCTION provision_gym TO app_user;
GRANT EXECUTE ON FUNCTION update_tenant_settings TO app_user;
GRANT EXECUTE ON FUNCTION get_tenant_settings TO app_user;
GRANT EXECUTE ON FUNCTION claim_staff_invitation TO app_user;
GRANT EXECUTE ON FUNCTION generate_next_receipt_number(UUID) TO app_user;
GRANT EXECUTE ON FUNCTION generate_next_member_number(UUID) TO app_user;
GRANT EXECUTE ON FUNCTION void_attendance_record TO app_user;

-- account_login_attempts table owned by definer_admin, revoked from app_user
ALTER TABLE account_login_attempts OWNER TO definer_admin;
REVOKE ALL ON account_login_attempts FROM PUBLIC, app_user;
