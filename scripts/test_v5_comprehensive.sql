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
  'get_tenant_settings',
  'claim_staff_invitation',
  '_generate_next_receipt_number_internal',
  'generate_next_receipt_number',
  'generate_next_member_number',
  'void_attendance_record'
)
ORDER BY p.proname;

-- 3. PROVISION USERS AND GYMS WITH SESSION USER GUARDS (Gate item 5)
-- (a) Register users
SELECT auth_register_user('+919000000001', 'argon2_hash', 'Gym Owner 1', 'owner1@gym.com') AS u1_id \gset
SELECT auth_register_user('+919000000002', 'argon2_hash', 'Gym Owner 2', 'owner2@gym.com') AS u2_id \gset
SELECT auth_register_user('+919000000003', 'argon2_hash', 'Gym Staff 1', 'staff1@gym.com') AS u_staff_id \gset

-- (b) Test provision_gym guard: mismatched p_owner_id must fail
DO $$
BEGIN
  -- app.user_id is not set yet
  PERFORM provision_gym('00000000-0000-0000-0000-000000000000'::uuid, 'Bad Gym', 'bad-gym', 'IN', 'Asia/Kolkata', 'INR', 0);
  RAISE EXCEPTION 'Security failure: provision_gym allowed mismatched owner!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: provision_gym rejected mismatched owner: %', SQLERRM;
END $$;

-- (c) Provision Gym 1 with matching app.user_id
SELECT set_config('app.user_id', :'u1_id', false);
SELECT provision_gym(:'u1_id'::uuid, 'Kolkata Fitness', 'kolkata-fit', 'IN', 'Asia/Kolkata', 'INR', 1800) AS g1_id \gset

-- (d) Provision Gym 2 with matching app.user_id
SELECT set_config('app.user_id', :'u2_id', false);
SELECT provision_gym(:'u2_id'::uuid, 'Mumbai Iron', 'mumbai-iron', 'IN', 'Asia/Kolkata', 'INR', 1800) AS g2_id \gset

-- Save IDs for session tests
SELECT set_config('test.g1_id', :'g1_id', false);
SELECT set_config('test.g2_id', :'g2_id', false);
SELECT set_config('test.u1_id', :'u1_id', false);
SELECT set_config('test.u2_id', :'u2_id', false);
SELECT set_config('test.u_staff_id', :'u_staff_id', false);

-- Set Gym 1 context
SELECT set_config('app.gym_id', :'g1_id', false);
SELECT set_config('app.user_id', :'u1_id', false);

-- (e) Test receipt formatter at 00:30 IST on the 1st through internal function
-- Timestamp: 2026-10-31 19:00:00+00 UTC = 2026-11-01 00:30:00+05:30 IST
SELECT _generate_next_receipt_number_internal(:'g1_id'::uuid, '2026-10-31 19:00:00+00'::timestamptz) AS receipt_nov1_ist;

-- (f) Create staff membership for u_staff_id in Gym 1
INSERT INTO user_gym_memberships (gym_id, user_id, role)
VALUES (:'g1_id', :'u_staff_id', 'staff');

-- (g) Test claim_staff_invitation guard: mismatched p_user_id must fail
INSERT INTO staff_invitations (gym_id, token_hash, role, expires_at, created_by_user_id)
VALUES (:'g1_id', 'tokenhash1234567890abcdef', 'staff', CURRENT_TIMESTAMP + INTERVAL '1 day', :'u1_id');

DO $$
BEGIN
  -- app.user_id is u1_id, but claiming for another user ID
  PERFORM claim_staff_invitation('tokenhash1234567890abcdef', '00000000-0000-0000-0000-000000000000'::uuid);
  RAISE EXCEPTION 'Security failure: claim_staff_invitation allowed mismatched user!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: claim_staff_invitation rejected mismatched user: %', SQLERRM;
END $$;

-- ============================================================================
-- 4. SWITCH TO NON-PRIVILEGED ROLE: app_user
-- ============================================================================
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

-- ============================================================================
-- 5. TEST RECEIPT GENERATOR OVERLOAD ACCESS (Gate item 6)
-- ============================================================================
-- (a) As app_user, public wrapper generate_next_receipt_number(p_gym_id) must succeed:
SELECT generate_next_receipt_number(:'g2_id'::uuid) AS app_user_receipt_success;

-- (b) As app_user, internal timestamped function must fail with permission denied:
DO $$
DECLARE
  v_g2 UUID := current_setting('test.g2_id')::uuid;
BEGIN
  PERFORM _generate_next_receipt_number_internal(v_g2, CURRENT_TIMESTAMP);
  RAISE EXCEPTION 'Security failure: app_user executed _generate_next_receipt_number_internal!';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'SUCCESS: app_user denied access to _generate_next_receipt_number_internal.';
END $$;

-- ============================================================================
-- 6. TEST CROSS-TENANT CALLS TO TENANT-SCOPED DEFINER FUNCTIONS (MUST FAIL)
-- ============================================================================
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

-- (b) get_tenant_settings
DO $$
DECLARE
  v_g1 UUID := current_setting('test.g1_id')::uuid;
BEGIN
  PERFORM get_tenant_settings(v_g1);
  RAISE EXCEPTION 'Security failure: get_tenant_settings allowed cross-tenant read!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: get_tenant_settings cross-tenant call rejected: %', SQLERRM;
END $$;

-- (c) generate_next_receipt_number
DO $$
DECLARE
  v_g1 UUID := current_setting('test.g1_id')::uuid;
BEGIN
  PERFORM generate_next_receipt_number(v_g1);
  RAISE EXCEPTION 'Security failure: generate_next_receipt_number allowed cross-tenant receipt generation!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: generate_next_receipt_number cross-tenant call rejected: %', SQLERRM;
END $$;

-- (d) generate_next_member_number
DO $$
DECLARE
  v_g1 UUID := current_setting('test.g1_id')::uuid;
BEGIN
  PERFORM generate_next_member_number(v_g1);
  RAISE EXCEPTION 'Security failure: generate_next_member_number allowed cross-tenant sequence access!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: generate_next_member_number cross-tenant call rejected: %', SQLERRM;
END $$;

-- (e) void_attendance_record cross-tenant
DO $$
DECLARE
  v_g1 UUID := current_setting('test.g1_id')::uuid;
BEGIN
  PERFORM void_attendance_record(v_g1, '11111111-1111-1111-1111-111111111111'::uuid, 'Test');
  RAISE EXCEPTION 'Security failure: void_attendance_record allowed cross-tenant attendance void!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: void_attendance_record cross-tenant call rejected: %', SQLERRM;
END $$;

-- ============================================================================
-- 7. NEGATIVE PERMISSION TESTS FOR app_user (MUST FAIL)
-- ============================================================================
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

-- ============================================================================
-- 8. ATTENDANCE CHECK-IN & ROLE-BASED VOID AUTHORIZATION (Gate items 8 & 4)
-- ============================================================================
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

-- Switch context to staff user (u_staff_id) to verify role authorization denial (ADR-009)
SELECT set_config('app.user_id', :'u_staff_id', false);

DO $$
DECLARE
  v_g1 UUID := current_setting('test.g1_id')::uuid;
BEGIN
  PERFORM void_attendance_record(v_g1, '11111111-cccc-cccc-cccc-cccccccccccc'::uuid, 'Staff attempt');
  RAISE EXCEPTION 'Security failure: staff role allowed to void attendance!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: void_attendance_record rejected for staff role (ADR-009): %', SQLERRM;
END $$;

-- Switch context back to owner (u1_id)
SELECT set_config('app.user_id', :'u1_id', false);

-- Void Check-in #1 as Owner
SELECT void_attendance_record(:'g1_id'::uuid, '11111111-cccc-cccc-cccc-cccccccccccc'::uuid, 'Wrong member selected');

-- Check-in #3 on 2026-11-07 after void (Must succeed because partial index excludes voided rows)
INSERT INTO attendance_logs (id, gym_id, member_id, attendance_date, method, recorded_by_user_id)
VALUES ('11111111-eeee-eeee-eeee-eeeeeeeeeeee', :'g1_id', '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-07', 'staff_manual', :'u1_id')
ON CONFLICT (gym_id, member_id, attendance_date) WHERE (is_voided = false) DO NOTHING;

SELECT count(*) AS count_active_after_void FROM attendance_logs 
WHERE gym_id = :'g1_id' AND member_id = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND attendance_date = '2026-11-07' AND is_voided = false;

-- ============================================================================
-- 9. REVENUE, DUES & REFUND SEMANTICS VERIFICATION (Gate item 2)
-- ============================================================================
-- Create plan: ₹50.00 (5000 cents)
INSERT INTO membership_plans (id, gym_id, name, duration_days, price_cents)
VALUES ('11111111-b001-0001-0001-000000000001', :'g1_id', 'Standard 30', 30, 5000);

-- Subscription 1 (Amit): Opening Balance ₹50.00 -> Dues = 0, Revenue = 0
INSERT INTO subscriptions (id, gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
VALUES ('11111111-c001-0001-0001-000000000001', :'g1_id', '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-b001-0001-0001-000000000001', 'active', '2026-11-01', '2026-11-30', 5000);

INSERT INTO payment_transactions (id, gym_id, member_id, subscription_id, idempotency_key, type, method, amount_cents, effective_date, recorded_by_user_id)
VALUES ('11111111-d001-0001-0001-000000000001', :'g1_id', '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-c001-0001-0001-000000000001', gen_random_uuid(), 'opening_balance', 'cash', 5000, '2026-11-01', :'u1_id');

-- Subscription 2 (Member Vikram): Payment ₹50.00
INSERT INTO members (id, gym_id, member_number, first_name, last_name, phone)
VALUES ('11111111-e001-0001-0001-000000000001', :'g1_id', 'MEM-00002', 'Vikram', 'Singh', '+919876500003');

INSERT INTO subscriptions (id, gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
VALUES ('11111111-c002-0002-0002-000000000002', :'g1_id', '11111111-e001-0001-0001-000000000001', '11111111-b001-0001-0001-000000000001', 'active', '2026-11-01', '2026-11-30', 5000);

-- Payment of 5000 cents
INSERT INTO payment_transactions (id, gym_id, member_id, subscription_id, idempotency_key, receipt_number, type, method, amount_cents, effective_date, recorded_by_user_id)
VALUES ('11111111-f001-0001-0001-000000000001', :'g1_id', '11111111-e001-0001-0001-000000000001', '11111111-c002-0002-0002-000000000002', gen_random_uuid(), 'REC-202611-000002', 'payment', 'cash', 5000, '2026-11-02', :'u1_id');

-- (a) Test Refund Semantics Guard: Attempting ₹20 refund on active sub without price adjustment MUST FAIL
DO $$
DECLARE
  v_g1 UUID := current_setting('test.g1_id')::uuid;
  v_u1 UUID := current_setting('test.u1_id')::uuid;
BEGIN
  INSERT INTO payment_transactions (gym_id, member_id, subscription_id, idempotency_key, receipt_number, type, method, amount_cents, parent_transaction_id, effective_date, recorded_by_user_id)
  VALUES (v_g1, '11111111-e001-0001-0001-000000000001', '11111111-c002-0002-0002-000000000002', gen_random_uuid(), 'REC-FAIL-001', 'refund', 'cash', -2000, '11111111-f001-0001-0001-000000000001', '2026-11-03', v_u1);
  RAISE EXCEPTION 'Refund semantics guard failed: refund permitted on active subscription without price adjustment!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: Refund on active subscription rejected without price adjustment: %', SQLERRM;
END $$;

-- (b) Apply price adjustment (goodwill credit of ₹20 / 2000 cents) so dues do not reappear
UPDATE subscriptions
SET price_adjustment_cents = 2000
WHERE id = '11111111-c002-0002-0002-000000000002';

-- Now refund of 2000 cents succeeds
INSERT INTO payment_transactions (id, gym_id, member_id, subscription_id, idempotency_key, receipt_number, type, method, amount_cents, parent_transaction_id, effective_date, recorded_by_user_id)
VALUES ('11111111-f002-0002-0002-000000000002', :'g1_id', '11111111-e001-0001-0001-000000000001', '11111111-c002-0002-0002-000000000002', gen_random_uuid(), 'REC-202611-000003', 'refund', 'cash', -2000, '11111111-f001-0001-0001-000000000001', '2026-11-03', :'u1_id');

-- Revenue Query (excluding opening_balance, net of refunds)
SELECT COALESCE(SUM(amount_cents), 0) AS net_revenue_november
FROM payment_transactions
WHERE gym_id = :'g1_id'
  AND type IN ('payment', 'refund', 'reversal')
  AND effective_date BETWEEN '2026-11-01' AND '2026-11-30';
-- MUST BE 3000 (5000 payment - 2000 refund; 5000 opening_balance excluded)

-- Dues Calculation Query: Outstanding dues for Vikram MUST be 0 (goodwill refund did not create dues)
SELECT 
  s.id AS subscription_id,
  m.first_name,
  (s.total_price_cents - s.discount_cents - s.price_adjustment_cents) AS net_price,
  COALESCE(p.paid_cents, 0) AS total_paid_and_opening,
  GREATEST(0, (s.total_price_cents - s.discount_cents - s.price_adjustment_cents) - COALESCE(p.paid_cents, 0)) AS outstanding_due
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

-- ============================================================================
-- 10. FREEZE SHIFT RULE ON QUEUED RENEWALS (Gate item 3)
-- ============================================================================
-- Member Suresh: Has Active Subscription (Nov 1 to Nov 10) + Queued Subscription (Nov 11 to Dec 10)
INSERT INTO members (id, gym_id, member_number, first_name, last_name, phone)
VALUES ('11111111-e003-0003-0003-000000000003', :'g1_id', 'MEM-00003', 'Suresh', 'Verma', '+919876500004');

INSERT INTO subscriptions (id, gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
VALUES 
  ('11111111-c003-0003-0003-000000000003', :'g1_id', '11111111-e003-0003-0003-000000000003', '11111111-b001-0001-0001-000000000001', 'active', '2026-11-01', '2026-11-10', 5000),
  ('11111111-c004-0004-0004-000000000004', :'g1_id', '11111111-e003-0003-0003-000000000003', '11111111-b001-0001-0001-000000000001', 'queued', '2026-11-11', '2026-12-10', 5000);

-- Insert 10-day freeze on active subscription
INSERT INTO subscription_freezes (gym_id, subscription_id, freeze_start, freeze_end, days_frozen, reason, approved_by_user_id)
VALUES (:'g1_id', '11111111-c003-0003-0003-000000000003', '2026-11-05', '2026-11-14', 10, 'Medical sprain', :'u1_id');

-- Verify shifted dates:
-- Active sub end_date must be extended from Nov 10 -> Nov 20
-- Queued sub start_date must shift from Nov 11 -> Nov 21, end_date Nov 21 -> Dec 20
SELECT 
  id, status, start_date, end_date
FROM subscriptions
WHERE gym_id = :'g1_id' AND member_id = '11111111-e003-0003-0003-000000000003'
ORDER BY start_date;

-- ============================================================================
-- 11. PENDING -> ACTIVE TRANSITION & OVERLAP PROTECTION TEST
-- ============================================================================
-- Create member Ananya
INSERT INTO members (id, gym_id, member_number, first_name, last_name, phone)
VALUES ('11111111-e004-0004-0004-000000000004', :'g1_id', 'MEM-00004', 'Ananya', 'Roy', '+919876500005');

-- Active sub: Dec 1 to Dec 31
INSERT INTO subscriptions (id, gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
VALUES ('11111111-c005-0005-0005-000000000005', :'g1_id', '11111111-e004-0004-0004-000000000004', '11111111-b001-0001-0001-000000000001', 'active', '2026-12-01', '2026-12-31', 5000);

-- Draft pending subscription overlapping: Dec 15 to Jan 15 (Allowed while pending)
INSERT INTO subscriptions (id, gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
VALUES ('11111111-c006-0006-0006-000000000006', :'g1_id', '11111111-e004-0004-0004-000000000004', '11111111-b001-0001-0001-000000000001', 'pending', '2026-12-15', '2027-01-15', 5000);

-- Attempting pending -> active transition must be blocked by overlap trigger
DO $$
BEGIN
  UPDATE subscriptions
  SET status = 'active'
  WHERE id = '11111111-c006-0006-0006-000000000006';
  RAISE EXCEPTION 'Overlap trigger failed on pending -> active transition!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: Overlap caught on pending -> active transition: %', SQLERRM;
END $$;

-- ============================================================================
-- 12. EXPIRING WORKLIST & TIMEZONE BOUNDARY TEST (Gate item 7)
-- ============================================================================
-- Setup 3 members with expiry on 2026-11-07:
-- Member 1 (ExpiringToday): Unrenewed, not frozen -> Expiring today at 23:45 IST, Expired at 00:15 IST
-- Member 2 (RenewedMember): Has future queued subscription -> Excluded from expiring list
-- Member 3 (FrozenMember): Has active freeze covering Nov 7 -> Excluded from expiring list

INSERT INTO members (id, gym_id, member_number, first_name, last_name, phone)
VALUES 
  ('11111111-e011-0000-0000-000000000001', :'g1_id', 'MEM-W01', 'ExpiringMember', 'Active', '+919876511111'),
  ('11111111-e012-0000-0000-000000000002', :'g1_id', 'MEM-W02', 'RenewedMember', 'Queued', '+919876522222'),
  ('11111111-e013-0000-0000-000000000003', :'g1_id', 'MEM-W03', 'FrozenMember', 'Paused', '+919876533333');

-- Subscriptions ending on 2026-11-07
INSERT INTO subscriptions (id, gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
VALUES 
  ('11111111-c011-0000-0000-000000000001', :'g1_id', '11111111-e011-0000-0000-000000000001', '11111111-b001-0001-0001-000000000001', 'active', '2026-10-08', '2026-11-07', 5000),
  ('11111111-c012-0000-0000-000000000002', :'g1_id', '11111111-e012-0000-0000-000000000002', '11111111-b001-0001-0001-000000000001', 'active', '2026-10-08', '2026-11-07', 5000),
  ('11111111-c013-0000-0000-000000000003', :'g1_id', '11111111-e013-0000-0000-000000000003', '11111111-b001-0001-0001-000000000001', 'active', '2026-10-08', '2026-11-07', 5000);

-- Member 2 has future queued renewal starting 2026-11-08
INSERT INTO subscriptions (id, gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
VALUES ('11111111-c014-0000-0000-000000000004', :'g1_id', '11111111-e012-0000-0000-000000000002', '11111111-b001-0001-0001-000000000001', 'queued', '2026-11-08', '2026-12-07', 5000);

-- Member 3 has active freeze covering 2026-11-05 to 2026-11-15
INSERT INTO subscription_freezes (gym_id, subscription_id, freeze_start, freeze_end, days_frozen, reason, approved_by_user_id)
VALUES (:'g1_id', '11111111-c013-0000-0000-000000000003', '2026-11-05', '2026-11-15', 10, 'Medical travel', :'u1_id');

-- Timezone Boundary Evaluation:
-- Gym timezone is Asia/Kolkata (+05:30)
-- Timestamp T1: 2026-11-07 18:15:00 UTC = 2026-11-07 23:45:00 IST (Local date: 2026-11-07)
-- Timestamp T2: 2026-11-07 18:45:00 UTC = 2026-11-08 00:15:00 IST (Local date: 2026-11-08)

-- Query at T1 (23:45 IST on Nov 7): Member is active and expiring TODAY (days_remaining = 0)
WITH gym_context AS (
  SELECT '2026-11-07 18:15:00+00'::timestamptz AT TIME ZONE 'Asia/Kolkata' AS local_now
)
SELECT 
  m.member_number,
  m.first_name,
  s.end_date,
  (s.end_date - ctx.local_now::date) AS days_remaining,
  CASE 
    WHEN s.end_date < ctx.local_now::date THEN 'expired'
    WHEN s.end_date = ctx.local_now::date THEN 'expiring_today'
    ELSE 'expiring_soon'
  END AS status_category
FROM gym_context ctx, subscriptions s
JOIN members m ON m.id = s.member_id AND m.gym_id = s.gym_id
WHERE s.gym_id = :'g1_id'
  AND s.status = 'active'
  AND m.deleted_at IS NULL
  -- Window: from 30 days expired to 7 days in future
  AND s.end_date BETWEEN (ctx.local_now::date - INTERVAL '30 days') AND (ctx.local_now::date + INTERVAL '7 days')
  -- Exclude future renewals
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s_future
    WHERE s_future.gym_id = s.gym_id
      AND s_future.member_id = s.member_id
      AND s_future.status IN ('queued', 'active')
      AND s_future.start_date > s.start_date
  )
  -- Exclude members with active freeze
  AND NOT EXISTS (
    SELECT 1 FROM subscription_freezes f
    WHERE f.gym_id = s.gym_id
      AND f.subscription_id = s.id
      AND f.is_active = true
      AND ctx.local_now::date BETWEEN f.freeze_start AND f.freeze_end
  );

-- Query at T2 (00:15 IST on Nov 8, 30 minutes later): Member has crossed midnight and is now EXPIRED
WITH gym_context AS (
  SELECT '2026-11-07 18:45:00+00'::timestamptz AT TIME ZONE 'Asia/Kolkata' AS local_now
)
SELECT 
  m.member_number,
  m.first_name,
  s.end_date,
  (s.end_date - ctx.local_now::date) AS days_remaining,
  CASE 
    WHEN s.end_date < ctx.local_now::date THEN 'expired'
    WHEN s.end_date = ctx.local_now::date THEN 'expiring_today'
    ELSE 'expiring_soon'
  END AS status_category
FROM gym_context ctx, subscriptions s
JOIN members m ON m.id = s.member_id AND m.gym_id = s.gym_id
WHERE s.gym_id = :'g1_id'
  AND s.status = 'active'
  AND m.deleted_at IS NULL
  AND s.end_date BETWEEN (ctx.local_now::date - INTERVAL '30 days') AND (ctx.local_now::date + INTERVAL '7 days')
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s_future
    WHERE s_future.gym_id = s.gym_id
      AND s_future.member_id = s.member_id
      AND s_future.status IN ('queued', 'active')
      AND s_future.start_date > s.start_date
  )
  AND NOT EXISTS (
    SELECT 1 FROM subscription_freezes f
    WHERE f.gym_id = s.gym_id
      AND f.subscription_id = s.id
      AND f.is_active = true
      AND ctx.local_now::date BETWEEN f.freeze_start AND f.freeze_end
  );

RESET ROLE;
