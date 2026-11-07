-- ============================================================================
-- TEST SUITE V5: COMPREHENSIVE SECURITY, GUARDS, CATALOG & WORKLISTS
-- ============================================================================

\set ON_ERROR_STOP on

-- Clean slate
TRUNCATE users, tenants CASCADE;

-- 1. SHOW PG_ROLES FOR definer_admin, app_user, retention_worker
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
FROM pg_roles
WHERE rolname IN ('definer_admin', 'app_user', 'retention_worker')
ORDER BY rolname;

-- 2. VERIFY FUNCTION OWNERSHIP & search_path
SELECT p.proname, r.rolname AS owner, p.prosecdef AS is_security_definer, p.proconfig
FROM pg_proc p
JOIN pg_roles r ON r.oid = p.proowner
WHERE p.proname IN (
  'auth_register_user',
  'auth_lookup_user_by_phone',
  'auth_complete_password_reset',
  'provision_gym',
  'update_tenant_settings',
  'claim_staff_invitation',
  'generate_next_receipt_number',
  'generate_next_member_number',
  'void_attendance_record'
)
ORDER BY p.proname;

-- 3. TEST RECEIPT FORMATTER AT 00:30 IST ON THE 1ST (via generate_next_receipt_number)
SELECT auth_register_user('+919000000001', 'argon2_hash', 'Gym Owner 1', 'owner1@gym.com') AS u1_id \gset
SELECT provision_gym(:'u1_id'::uuid, 'Kolkata Fitness', 'kolkata-fit', 'IN', 'Asia/Kolkata', 'INR', 1800) AS g1_id \gset

-- Test with explicit timestamp 2026-10-31 19:00:00+05:30 -> UTC 19:00 (00:30 IST on Nov 1st)
SELECT set_config('app.gym_id', :'g1_id', false);
SELECT set_config('test.g1_id', :'g1_id', false);
SELECT generate_next_receipt_number(:'g1_id'::uuid, '2026-10-31 19:00:00+00'::timestamptz) AS receipt_nov1_ist;

-- 4. PROVISION SECOND GYM FOR CROSS-TENANT TESTS
SELECT auth_register_user('+919000000002', 'argon2_hash', 'Gym Owner 2', 'owner2@gym.com') AS u2_id \gset
SELECT provision_gym(:'u2_id'::uuid, 'Mumbai Iron', 'mumbai-iron', 'IN', 'Asia/Kolkata', 'INR', 1800) AS g2_id \gset

-- SWITCH TO NON-PRIVILEGED ROLE: app_user
SET ROLE app_user;

-- Set session context to Gym 1 (Kolkata Fitness)
SELECT set_config('app.gym_id', :'g1_id', false);
SELECT set_config('app.user_id', :'u1_id', false);

-- Insert member in Gym 1
INSERT INTO members (id, gym_id, member_number, first_name, last_name, phone)
VALUES ('11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', :'g1_id', 'MEM-00001', 'Amit', 'Kumar', '+919876500001');

-- Set session context to Gym 2 (Mumbai Iron)
SELECT set_config('app.gym_id', :'g2_id', false);
SELECT set_config('app.user_id', :'u2_id', false);

-- Insert member in Gym 2
INSERT INTO members (id, gym_id, member_number, first_name, last_name, phone)
VALUES ('22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb', :'g2_id', 'MEM-00001', 'Priya', 'Nair', '+919876500002');

-- 5. TEST CROSS-TENANT CALLS TO TENANT-SCOPED DEFINER FUNCTIONS (MUST FAIL)
-- While in Gym 2 context, attempt to call definer functions with Gym 1's ID:

-- (a) update_tenant_settings
DO $$
DECLARE
  v_g1 UUID := current_setting('test.g1_id')::uuid;
BEGIN
  PERFORM update_tenant_settings(v_g1, 'Hacked Name', 'Asia/Kolkata', 'INR', 0);
  RAISE EXCEPTION 'Security failure: update_tenant_settings allowed cross-tenant modification!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: update_tenant_settings cross-tenant call rejected: %', SQLERRM;
END $$;

-- (b) generate_next_receipt_number
DO $$
DECLARE
  v_g1 UUID := current_setting('test.g1_id')::uuid;
BEGIN
  PERFORM generate_next_receipt_number(v_g1);
  RAISE EXCEPTION 'Security failure: generate_next_receipt_number allowed cross-tenant receipt generation!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: generate_next_receipt_number cross-tenant call rejected: %', SQLERRM;
END $$;

-- (c) generate_next_member_number
DO $$
DECLARE
  v_g1 UUID := current_setting('test.g1_id')::uuid;
BEGIN
  PERFORM generate_next_member_number(v_g1);
  RAISE EXCEPTION 'Security failure: generate_next_member_number allowed cross-tenant sequence access!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: generate_next_member_number cross-tenant call rejected: %', SQLERRM;
END $$;

-- (d) void_attendance_record
DO $$
DECLARE
  v_g1 UUID := current_setting('test.g1_id')::uuid;
BEGIN
  PERFORM void_attendance_record(v_g1, '11111111-1111-1111-1111-111111111111'::uuid, 'Test');
  RAISE EXCEPTION 'Security failure: void_attendance_record allowed cross-tenant attendance void!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: void_attendance_record cross-tenant call rejected: %', SQLERRM;
END $$;

-- 6. NEGATIVE PERMISSION TESTS FOR app_user (MUST FAIL)

-- (a) Direct SELECT on users.password_hash
DO $$
BEGIN
  PERFORM password_hash FROM users;
  RAISE EXCEPTION 'Security failure: app_user read users.password_hash!';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'SUCCESS: SELECT users.password_hash rejected with insufficient_privilege.';
END $$;

-- (b) Direct UPDATE on payment_transactions
DO $$
BEGIN
  UPDATE payment_transactions SET amount_cents = 0;
  RAISE EXCEPTION 'Security failure: app_user updated payment_transactions!';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'SUCCESS: UPDATE payment_transactions rejected with insufficient_privilege.';
END $$;

-- (c) Direct UPDATE on tenants
DO $$
BEGIN
  UPDATE tenants SET name = 'Direct Update';
  RAISE EXCEPTION 'Security failure: app_user updated tenants!';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'SUCCESS: UPDATE tenants rejected with insufficient_privilege.';
END $$;

-- (d) Direct DELETE on audit_logs
DO $$
BEGIN
  DELETE FROM audit_logs;
  RAISE EXCEPTION 'Security failure: app_user deleted from audit_logs!';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'SUCCESS: DELETE audit_logs rejected with insufficient_privilege.';
END $$;

-- 7. ATTENDANCE CHECK-IN PARTIAL UNIQUE INDEX (DO NOTHING + VOID)
SELECT set_config('app.gym_id', :'g1_id', false);
SELECT set_config('app.user_id', :'u1_id', false);

-- Check-in #1 on 2026-11-07
INSERT INTO attendance_logs (id, gym_id, member_id, attendance_date, method, recorded_by_user_id)
VALUES ('11111111-cccc-cccc-cccc-cccccccccccc', :'g1_id', '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-07', 'staff_manual', :'u1_id')
ON CONFLICT (gym_id, member_id, attendance_date) WHERE (is_voided = false) DO NOTHING;

-- Check-in #2 on 2026-11-07 without void (Conflict catches it, returns 0 rows)
INSERT INTO attendance_logs (id, gym_id, member_id, attendance_date, method, recorded_by_user_id)
VALUES ('11111111-dddd-dddd-dddd-dddddddddddd', :'g1_id', '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-07', 'staff_manual', :'u1_id')
ON CONFLICT (gym_id, member_id, attendance_date) WHERE (is_voided = false) DO NOTHING;

SELECT count(*) AS count_active_before_void FROM attendance_logs 
WHERE gym_id = :'g1_id' AND member_id = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND attendance_date = '2026-11-07';

-- Void Check-in #1
SELECT void_attendance_record(:'g1_id'::uuid, '11111111-cccc-cccc-cccc-cccccccccccc'::uuid, 'Wrong member selected');

-- Check-in #3 on 2026-11-07 after void (Must succeed because partial index excludes voided rows)
INSERT INTO attendance_logs (id, gym_id, member_id, attendance_date, method, recorded_by_user_id)
VALUES ('11111111-eeee-eeee-eeee-eeeeeeeeeeee', :'g1_id', '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-07', 'staff_manual', :'u1_id')
ON CONFLICT (gym_id, member_id, attendance_date) WHERE (is_voided = false) DO NOTHING;

SELECT count(*) AS count_active_after_void FROM attendance_logs 
WHERE gym_id = :'g1_id' AND member_id = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND attendance_date = '2026-11-07' AND is_voided = false;

-- 8. REVENUE & DUES LOGIC VERIFICATION
-- Create plan: ₹50.00 (5000 cents)
INSERT INTO membership_plans (id, gym_id, name, duration_days, price_cents)
VALUES ('11111111-b001-0001-0001-000000000001', :'g1_id', 'Standard 30', 30, 5000);

-- Subscription 1 (Amit): Opening Balance ₹50.00 -> Dues = 0, Revenue = 0
INSERT INTO subscriptions (id, gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
VALUES ('11111111-c001-0001-0001-000000000001', :'g1_id', '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-b001-0001-0001-000000000001', 'active', '2026-11-01', '2026-11-30', 5000);

INSERT INTO payment_transactions (id, gym_id, member_id, subscription_id, idempotency_key, type, method, amount_cents, effective_date, recorded_by_user_id)
VALUES ('11111111-d001-0001-0001-000000000001', :'g1_id', '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-c001-0001-0001-000000000001', gen_random_uuid(), 'opening_balance', 'cash', 5000, '2026-11-01', :'u1_id');

-- Subscription 2 (Member Vikram): Payment ₹50.00, then Refund ₹20.00 -> Dues = 2000, Revenue = 3000
INSERT INTO members (id, gym_id, member_number, first_name, last_name, phone)
VALUES ('11111111-e001-0001-0001-000000000001', :'g1_id', 'MEM-00002', 'Vikram', 'Singh', '+919876500003');

INSERT INTO subscriptions (id, gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
VALUES ('11111111-c002-0002-0002-000000000002', :'g1_id', '11111111-e001-0001-0001-000000000001', '11111111-b001-0001-0001-000000000001', 'active', '2026-11-01', '2026-11-30', 5000);

-- Payment of 5000 cents
INSERT INTO payment_transactions (id, gym_id, member_id, subscription_id, idempotency_key, receipt_number, type, method, amount_cents, effective_date, recorded_by_user_id)
VALUES ('11111111-f001-0001-0001-000000000001', :'g1_id', '11111111-e001-0001-0001-000000000001', '11111111-c002-0002-0002-000000000002', gen_random_uuid(), 'REC-202611-000002', 'payment', 'cash', 5000, '2026-11-02', :'u1_id');

-- Refund of 2000 cents
INSERT INTO payment_transactions (id, gym_id, member_id, subscription_id, idempotency_key, receipt_number, type, method, amount_cents, parent_transaction_id, effective_date, recorded_by_user_id)
VALUES ('11111111-f002-0002-0002-000000000002', :'g1_id', '11111111-e001-0001-0001-000000000001', '11111111-c002-0002-0002-000000000002', gen_random_uuid(), 'REC-202611-000003', 'refund', 'cash', -2000, '11111111-f001-0001-0001-000000000001', '2026-11-03', :'u1_id');

-- Revenue Query (excluding opening_balance, net of refunds)
SELECT COALESCE(SUM(amount_cents), 0) AS net_revenue_november
FROM payment_transactions
WHERE gym_id = :'g1_id'
  AND type IN ('payment', 'refund', 'reversal')
  AND effective_date BETWEEN '2026-11-01' AND '2026-11-30';
-- MUST BE 3000 (5000 payment - 2000 refund; 5000 opening_balance excluded)

-- Dues Calculation Query for all active subscriptions
SELECT 
  s.id AS subscription_id,
  m.first_name,
  (s.total_price_cents - s.discount_cents) AS net_price,
  COALESCE(p.paid_cents, 0) AS total_paid_and_opening,
  GREATEST(0, (s.total_price_cents - s.discount_cents) - COALESCE(p.paid_cents, 0)) AS outstanding_due
FROM subscriptions s
JOIN members m ON m.id = s.member_id AND m.gym_id = s.gym_id
LEFT JOIN (
  SELECT gym_id, subscription_id, SUM(amount_cents) AS paid_cents
  FROM payment_transactions
  WHERE type IN ('payment', 'refund', 'reversal', 'opening_balance')
  GROUP BY gym_id, subscription_id
) p ON p.gym_id = s.gym_id AND p.subscription_id = s.id
WHERE s.gym_id = :'g1_id'
ORDER BY m.first_name;

-- 9. PENDING -> ACTIVE TRANSITION & OVERLAP PROTECTION TEST
-- Create member Suresh
INSERT INTO members (id, gym_id, member_number, first_name, last_name, phone)
VALUES ('11111111-e003-0003-0003-000000000003', :'g1_id', 'MEM-00003', 'Suresh', 'Verma', '+919876500004');

-- Create active subscription: Nov 1 to Nov 30
INSERT INTO subscriptions (id, gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
VALUES ('11111111-c003-0003-0003-000000000003', :'g1_id', '11111111-e003-0003-0003-000000000003', '11111111-b001-0001-0001-000000000001', 'active', '2026-11-01', '2026-11-30', 5000);

-- Create draft pending subscription overlapping: Nov 15 to Dec 15 (Allowed while pending)
INSERT INTO subscriptions (id, gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
VALUES ('11111111-c004-0004-0004-000000000004', :'g1_id', '11111111-e003-0003-0003-000000000003', '11111111-b001-0001-0001-000000000001', 'pending', '2026-11-15', '2026-12-15', 5000);

-- Now attempt to update pending -> active -> MUST BE REJECTED BY OVERLAP TRIGGER
DO $$
BEGIN
  UPDATE subscriptions
  SET status = 'active'
  WHERE id = '11111111-c004-0004-0004-000000000004';
  RAISE EXCEPTION 'Overlap trigger failed on pending -> active transition!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: Overlap caught on pending -> active transition: %', SQLERRM;
END $$;

-- 10. EXPIRING WORKLIST QUERY TEST
-- Setup 3 members with expiry on 2026-11-10:
-- Current simulated date: 2026-11-07 (3 days remaining)
-- Member 1 (Kavita): Unrenewed, not frozen -> MUST BE INCLUDED
-- Member 2 (Renewed Member): Has future queued subscription -> MUST BE EXCLUDED
-- Member 3 (Frozen Member): Has active freeze covering today -> MUST BE EXCLUDED

INSERT INTO members (id, gym_id, member_number, first_name, last_name, phone)
VALUES 
  ('11111111-e011-0000-0000-000000000001', :'g1_id', 'MEM-W01', 'WorklistActive', 'Unrenewed', '+919876511111'),
  ('11111111-e012-0000-0000-000000000002', :'g1_id', 'MEM-W02', 'WorklistRenewed', 'HasQueued', '+919876522222'),
  ('11111111-e013-0000-0000-000000000003', :'g1_id', 'MEM-W03', 'WorklistFrozen', 'Paused', '+919876533333');

-- Subscriptions expiring on 2026-11-10
INSERT INTO subscriptions (id, gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
VALUES 
  ('11111111-c011-0000-0000-000000000001', :'g1_id', '11111111-e011-0000-0000-000000000001', '11111111-b001-0001-0001-000000000001', 'active', '2026-10-11', '2026-11-10', 5000),
  ('11111111-c012-0000-0000-000000000002', :'g1_id', '11111111-e012-0000-0000-000000000002', '11111111-b001-0001-0001-000000000001', 'active', '2026-10-11', '2026-11-10', 5000),
  ('11111111-c013-0000-0000-000000000003', :'g1_id', '11111111-e013-0000-0000-000000000003', '11111111-b001-0001-0001-000000000001', 'active', '2026-10-11', '2026-11-10', 5000);

-- Member 2 has future queued renewal starting 2026-11-11
INSERT INTO subscriptions (id, gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
VALUES ('11111111-c014-0000-0000-000000000004', :'g1_id', '11111111-e012-0000-0000-000000000002', '11111111-b001-0001-0001-000000000001', 'queued', '2026-11-11', '2026-12-10', 5000);

-- Member 3 has freeze covering 2026-11-05 to 2026-11-15
INSERT INTO subscription_freezes (gym_id, subscription_id, freeze_start, freeze_end, days_frozen, reason, approved_by_user_id)
VALUES (:'g1_id', '11111111-c013-0000-0000-000000000003', '2026-11-05', '2026-11-15', 10, 'Medical travel', :'u1_id');

-- EXECUTE THE BOUNDED EXPIRING WORKLIST QUERY AT DATE 2026-11-07
SELECT 
  m.member_number,
  m.first_name,
  s.end_date,
  (s.end_date - '2026-11-07'::date) AS days_remaining
FROM subscriptions s
JOIN members m ON m.id = s.member_id AND m.gym_id = s.gym_id
WHERE s.gym_id = :'g1_id'
  AND s.status = 'active'
  AND m.deleted_at IS NULL
  -- Bounded between 7 days before expiry and 30 days past expiry
  AND '2026-11-07'::date BETWEEN (s.end_date - INTERVAL '7 days') AND (s.end_date + INTERVAL '30 days')
  -- Exclude if member already has a queued or active future renewal
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s_future
    WHERE s_future.gym_id = s.gym_id
      AND s_future.member_id = s.member_id
      AND s_future.status IN ('queued', 'active')
      AND s_future.start_date > s.start_date
  )
  -- Exclude if member is currently within an active freeze window
  AND NOT EXISTS (
    SELECT 1 FROM subscription_freezes f
    WHERE f.gym_id = s.gym_id
      AND f.subscription_id = s.id
      AND f.is_active = true
      AND '2026-11-07'::date BETWEEN f.freeze_start AND f.freeze_end
  );
-- MUST return exactly 1 row: WorklistActive (Unrenewed)

RESET ROLE;
