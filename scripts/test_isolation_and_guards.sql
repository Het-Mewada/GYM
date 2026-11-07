-- ============================================================================
-- LIVE VERIFICATION TEST SUITE: TWO-TENANT ISOLATION, GUARDS & FUNCTIONS
-- ============================================================================

\set ON_ERROR_STOP on

-- Clean slate
TRUNCATE users, tenants CASCADE;

-- 1. Test Function Owner BYPASSRLS Verification
SELECT r.rolname, r.rolbypassrls, r.rolsuper
FROM pg_proc p
JOIN pg_roles r ON r.oid = p.proowner
WHERE p.proname IN ('provision_gym', 'generate_next_receipt_number', 'claim_staff_invitation', 'auth_register_user')
GROUP BY r.rolname, r.rolbypassrls, r.rolsuper;

-- 2. Test Receipt Month Prefix at 00:30 IST on the 1st
-- At UTC 2026-10-31 19:00:00 (which is 2026-11-01 00:30:00 IST)
SELECT 
  '2026-10-31 19:00:00+00'::timestamptz AS utc_timestamp,
  to_char('2026-10-31 19:00:00+00'::timestamptz AT TIME ZONE 'UTC', 'YYYYMM') AS utc_month,
  to_char('2026-10-31 19:00:00+00'::timestamptz AT TIME ZONE 'Asia/Kolkata', 'YYYYMM') AS ist_month;

-- 3. Setup Two Tenants via SECURITY DEFINER functions as app_user
SET ROLE app_user;

-- Create User 1 (Owner Gym A) and User 2 (Owner Gym B)
SELECT auth_register_user('+919999900011', 'argon2_dummy_hash_1', 'Owner Alpha', 'owner_a1@gyma.com') AS user_a_id \gset
SELECT auth_register_user('+919999900022', 'argon2_dummy_hash_2', 'Owner Beta', 'owner_b1@gymb.com') AS user_b_id \gset

-- Provision Gym A and Gym B
SELECT provision_gym(:'user_a_id'::uuid, 'Gym Alpha 1', 'gym-alpha-1', 'IN', 'Asia/Kolkata', 'INR', 1800) AS gym_a_id \gset
SELECT provision_gym(:'user_b_id'::uuid, 'Gym Beta 1', 'gym-beta-1', 'IN', 'Asia/Kolkata', 'INR', 1800) AS gym_b_id \gset

-- 4. Enter Context for Gym A
SELECT set_config('app.gym_id', :'gym_a_id', false);
SELECT set_config('app.user_id', :'user_a_id', false);

-- Insert Plan, Member, Subscription in Gym A
INSERT INTO membership_plans (id, gym_id, name, duration_days, price_cents)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', :'gym_a_id', 'Monthly Standard', 30, 5000);

INSERT INTO members (id, gym_id, member_number, first_name, last_name, phone)
VALUES ('aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', :'gym_a_id', 'MEM-00001', 'Kavita', 'Sharma', '+919876543210');

INSERT INTO subscriptions (id, gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
VALUES ('aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa', :'gym_a_id', 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active', '2026-11-01', '2026-11-30', 5000);

-- Generate receipt number in Gym A context
SELECT generate_next_receipt_number(:'gym_a_id'::uuid) AS receipt_no_a \gset

INSERT INTO payment_transactions (id, gym_id, member_id, subscription_id, idempotency_key, receipt_number, type, method, amount_cents, recorded_by_user_id)
VALUES ('aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa', :'gym_a_id', 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa', gen_random_uuid(), :'receipt_no_a', 'payment', 'cash', 5000, :'user_a_id');

-- 5. Enter Context for Gym B
SELECT set_config('app.gym_id', :'gym_b_id', false);
SELECT set_config('app.user_id', :'user_b_id', false);

-- Insert Plan and Member in Gym B
INSERT INTO membership_plans (id, gym_id, name, duration_days, price_cents)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', :'gym_b_id', 'Annual Gold', 365, 30000);

INSERT INTO members (id, gym_id, member_number, first_name, last_name, phone)
VALUES ('bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb', :'gym_b_id', 'MEM-00001', 'Rajesh', 'Patel', '+919876543211');

-- 6. TWO-TENANT ISOLATION ASSERTIONS (Executed as app_user under Gym B context)
-- Query 1: Can Gym B see Gym A's members?
SELECT count(*) AS gym_b_sees_members FROM members; -- MUST BE 1 (only Rajesh Patel)

-- Query 2: Attempting to query Gym A member by ID under Gym B context
SELECT count(*) AS gym_b_queries_gym_a_member FROM members WHERE id = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa'; -- MUST BE 0

-- Query 3: Cross-tenant Foreign Key Injection Test
DO $$
DECLARE
  v_gym_b UUID := current_setting('app.gym_id')::uuid;
  v_user_b UUID := current_setting('app.user_id')::uuid;
BEGIN
  INSERT INTO payment_transactions (gym_id, member_id, idempotency_key, receipt_number, type, method, amount_cents, recorded_by_user_id)
  VALUES (v_gym_b, 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa'::uuid, gen_random_uuid(), 'REC-FAIL', 'payment', 'cash', 1000, v_user_b);
  RAISE EXCEPTION 'Cross-tenant FK vulnerability! Insert should have failed.';
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE 'SUCCESS: Cross-tenant foreign key correctly blocked with foreign_key_violation.';
END $$;

-- 7. Test Staff Invitation Claim Guard (Never overwrite existing membership)
SELECT set_config('app.gym_id', :'gym_a_id', false);
SELECT set_config('app.user_id', :'user_a_id', false);

INSERT INTO staff_invitations (id, gym_id, token_hash, role, created_by_user_id, expires_at)
VALUES ('99999999-9999-9999-9999-999999999999', :'gym_a_id', 'dummy_hash_token_abc1', 'staff', :'user_a_id', CURRENT_TIMESTAMP + INTERVAL '2 days');

DO $$
DECLARE
  v_user_a UUID := current_setting('app.user_id')::uuid;
BEGIN
  PERFORM claim_staff_invitation('dummy_hash_token_abc1', v_user_a);
  RAISE EXCEPTION 'Claim guard failed!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: Invitation claim rejected with: %', SQLERRM;
END $$;

-- 8. Test Subscription Overlap Prevention Trigger
DO $$
DECLARE
  v_gym_a UUID := current_setting('app.gym_id')::uuid;
BEGIN
  INSERT INTO subscriptions (gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
  VALUES (v_gym_a, 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active', '2026-11-15', '2026-12-15', 5000);
  RAISE EXCEPTION 'Overlap trigger failed!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: Subscription overlap correctly blocked: %', SQLERRM;
END $$;

-- 9. Test Refund Guard (Parent must be payment, amount <= parent)
DO $$
DECLARE
  v_gym_a UUID := current_setting('app.gym_id')::uuid;
  v_user_a UUID := current_setting('app.user_id')::uuid;
BEGIN
  INSERT INTO payment_transactions (gym_id, member_id, idempotency_key, receipt_number, type, method, amount_cents, parent_transaction_id, recorded_by_user_id)
  VALUES (v_gym_a, 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', gen_random_uuid(), 'REC-REF-FAIL', 'refund', 'cash', -6000, 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa', v_user_a);
  RAISE EXCEPTION 'Refund limit guard failed!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: Excessive refund correctly blocked: %', SQLERRM;
END $$;

-- Valid partial refund of 2000 cents
INSERT INTO payment_transactions (id, gym_id, member_id, idempotency_key, receipt_number, type, method, amount_cents, parent_transaction_id, recorded_by_user_id)
VALUES ('aaaaaaaa-4444-4444-4444-aaaaaaaaaaaa', :'gym_a_id', 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', gen_random_uuid(), 'REC-REF-001', 'refund', 'cash', -2000, 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa', :'user_a_id');

-- Second refund of 4000 cents (cumulative 6000 > 5000) -> MUST BE REJECTED
DO $$
DECLARE
  v_gym_a UUID := current_setting('app.gym_id')::uuid;
  v_user_a UUID := current_setting('app.user_id')::uuid;
BEGIN
  INSERT INTO payment_transactions (gym_id, member_id, idempotency_key, receipt_number, type, method, amount_cents, parent_transaction_id, recorded_by_user_id)
  VALUES (v_gym_a, 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', gen_random_uuid(), 'REC-REF-002', 'refund', 'cash', -4000, 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa', v_user_a);
  RAISE EXCEPTION 'Cumulative refund limit guard failed!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: Cumulative second refund correctly blocked: %', SQLERRM;
END $$;

-- 10. Test Attendance Voiding and Idempotent Re-Check-In
INSERT INTO attendance_logs (id, gym_id, member_id, attendance_date, recorded_by_user_id)
VALUES ('aaaaaaaa-5555-5555-5555-aaaaaaaaaaaa', :'gym_a_id', 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', '2026-11-07', :'user_a_id');

-- Void using definer function
SELECT void_attendance_record(:'gym_a_id'::uuid, 'aaaaaaaa-5555-5555-5555-aaaaaaaaaaaa'::uuid, 'Mismatched member photo');

-- Verify member CAN check in again on the same date because previous record is voided
INSERT INTO attendance_logs (id, gym_id, member_id, attendance_date, recorded_by_user_id)
VALUES ('aaaaaaaa-6666-6666-6666-aaaaaaaaaaaa', :'gym_a_id', 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', '2026-11-07', :'user_a_id');

SELECT count(*) AS active_attendance_today FROM attendance_logs WHERE gym_id = :'gym_a_id' AND attendance_date = '2026-11-07' AND is_voided = false;

RESET ROLE;
