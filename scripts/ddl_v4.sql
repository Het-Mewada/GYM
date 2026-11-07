-- ============================================================================
-- DDL v4 - Multi-Tenant Gym Management SaaS Schema
-- Target: PostgreSQL 16
-- ============================================================================

-- 0. EXTENSIONS
-- Native gen_random_uuid() is built into PostgreSQL 16. uuid-ossp dropped.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. ROLES SETUP
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN PASSWORD 'dev_app_password_only' NOBYPASSRLS;
  ELSE
    ALTER ROLE app_user NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'retention_worker') THEN
    CREATE ROLE retention_worker WITH LOGIN PASSWORD 'dev_retention_password_only' NOBYPASSRLS;
  ELSE
    ALTER ROLE retention_worker NOBYPASSRLS;
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

-- refresh_tokens has gym_id and user_id, with user_id-keyed RLS
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  family_id UUID NOT NULL DEFAULT gen_random_uuid(),
  is_revoked BOOLEAN NOT NULL DEFAULT false,
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
  CONSTRAINT check_freeze_dates CHECK (freeze_end >= freeze_start)
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

-- Guard: Subscription Overlap Prevention Trigger
CREATE OR REPLACE FUNCTION validate_subscription_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_overlapping_id UUID;
BEGIN
  IF NEW.status IN ('active', 'queued') THEN
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

-- Guard: Refund Advisory Lock + Parent Verification + Cumulative Limit
CREATE OR REPLACE FUNCTION validate_refund_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_amount BIGINT;
  v_parent_type VARCHAR(20);
  v_total_refunded BIGINT;
  v_lock_key BIGINT;
BEGIN
  IF NEW.type IN ('refund', 'reversal') THEN
    -- Advisory xact lock on hash of parent transaction ID to serialize concurrent refunds
    v_lock_key := ('x' || substr(md5(NEW.parent_transaction_id::text), 1, 15))::bit(60)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);

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

-- ============================================================================
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
-- Owned by postgres (superuser / BYPASSRLS)
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
SET search_path = public
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
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.password_hash, u.full_name, u.is_platform_admin
  FROM users u
  WHERE u.phone = p_phone;
END;
$$;

-- Function 2: Complete Password Reset
CREATE OR REPLACE FUNCTION auth_complete_password_reset(
  p_token_hash VARCHAR,
  p_new_password_hash VARCHAR
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
SET search_path = public
AS $$
DECLARE
  v_gym_id UUID;
BEGIN
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
SET search_path = public
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

-- Function 5: Claim Staff Invitation (Guards against changing existing membership)
CREATE OR REPLACE FUNCTION claim_staff_invitation(
  p_token_hash VARCHAR(64),
  p_user_id UUID
)
RETURNS TABLE (out_gym_id UUID, out_role VARCHAR(20))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
  v_existing_membership UUID;
BEGIN
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

-- Function 6: Generate Receipt Number (Uses Gym-Local Timezone for Month Prefix)
CREATE OR REPLACE FUNCTION generate_next_receipt_number(p_gym_id UUID)
RETURNS VARCHAR(50)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Month prefix determined by gym's local timezone
  SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE v_tz, 'YYYYMM') INTO v_ym;

  UPDATE receipt_sequences
  SET last_receipt_number = last_receipt_number + 1
  WHERE gym_id = p_gym_id
  RETURNING last_receipt_number INTO v_next_num;

  RETURN 'REC-' || v_ym || '-' || lpad(v_next_num::TEXT, 6, '0');
END;
$$;

-- Function 7: Generate Monotonic Member Identifier
CREATE OR REPLACE FUNCTION generate_next_member_number(p_gym_id UUID)
RETURNS VARCHAR(50)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Function 8: Void Attendance Record (Definer function with audit trail)
CREATE OR REPLACE FUNCTION void_attendance_record(
  p_gym_id UUID,
  p_attendance_id UUID,
  p_void_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF p_gym_id <> NULLIF(current_setting('app.gym_id', true), '')::uuid THEN
    RAISE EXCEPTION 'Access denied: p_gym_id does not match active session tenant.';
  END IF;

  v_user_id := NULLIF(current_setting('app.user_id', true), '')::uuid;

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

-- ============================================================================
-- 7. PERMISSIONS & GRANTS
-- ============================================================================

-- app_user has NO broad SELECT or UPDATE on users or tenants
REVOKE ALL ON users, tenants FROM app_user;

-- Grants on tenant-scoped tables
GRANT SELECT, INSERT, UPDATE, DELETE ON members, membership_plans, subscriptions, subscription_freezes, csv_import_jobs, staff_invitations, user_gym_memberships TO app_user;
GRANT SELECT, INSERT, UPDATE ON refresh_tokens TO app_user;
GRANT SELECT, INSERT ON payment_transactions, attendance_logs, notification_logs, audit_logs TO app_user;
REVOKE UPDATE, DELETE, TRUNCATE ON payment_transactions, attendance_logs, audit_logs, notification_logs FROM app_user;

-- Grants for retention_worker role
GRANT SELECT, DELETE ON notification_logs, csv_import_jobs TO retention_worker;

-- Execute permissions on SECURITY DEFINER functions
GRANT EXECUTE ON FUNCTION auth_register_user TO app_user;
GRANT EXECUTE ON FUNCTION auth_lookup_user_by_phone TO app_user;
GRANT EXECUTE ON FUNCTION auth_complete_password_reset TO app_user;
GRANT EXECUTE ON FUNCTION provision_gym TO app_user;
GRANT EXECUTE ON FUNCTION update_tenant_settings TO app_user;
GRANT EXECUTE ON FUNCTION claim_staff_invitation TO app_user;
GRANT EXECUTE ON FUNCTION generate_next_receipt_number TO app_user;
GRANT EXECUTE ON FUNCTION generate_next_member_number TO app_user;
GRANT EXECUTE ON FUNCTION void_attendance_record TO app_user;
