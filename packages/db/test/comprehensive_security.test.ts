import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type pg from 'pg';
import crypto from 'node:crypto';
import { createPool } from '../src/client.js';
import { assertDatabaseRole } from '../src/assertRole.js';

describe('Comprehensive Database Security & Isolation Suite (TypeScript Native)', () => {
  let pool: pg.Pool;

  let ownerUserId: string;
  let nonOwnerUserId: string;
  let testGymId: string;
  let testPlanId: string;
  let testMemberId: string;
  let testSubId: string;

  beforeAll(async () => {
    pool = createPool();
    await assertDatabaseRole(pool);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Register owner user
      const ownerPhone = `+91998${Date.now().toString().slice(-7)}`;
      const regOwner = await client.query<{ auth_register_user: string }>(
        'SELECT auth_register_user($1, $2, $3) as auth_register_user;',
        [ownerPhone, 'hash_placeholder_123', 'Sec Owner']
      );
      ownerUserId = regOwner.rows[0].auth_register_user;

      // Register non-owner user
      const nonOwnerPhone = `+91997${Date.now().toString().slice(-7)}`;
      const regNonOwner = await client.query<{ auth_register_user: string }>(
        'SELECT auth_register_user($1, $2, $3) as auth_register_user;',
        [nonOwnerPhone, 'hash_placeholder_456', 'Sec NonOwner']
      );
      nonOwnerUserId = regNonOwner.rows[0].auth_register_user;

      // Provision gym as ownerUser
      await client.query("SELECT set_config('app.user_id', $1, true);", [ownerUserId]);
      const provRes = await client.query<{ provision_gym: string }>(
        'SELECT provision_gym($1, $2, $3, $4, $5, $6, $7) as provision_gym;',
        [ownerUserId, 'Security Gym', `sec-gym-${Date.now()}`, 'IN', 'Asia/Kolkata', 'INR', 0]
      );
      testGymId = provRes.rows[0].provision_gym;

      // Set tenant context
      await client.query("SELECT set_config('app.gym_id', $1, true);", [testGymId]);

      // Create membership plan
      const planRes = await client.query<{ id: string }>(`
        INSERT INTO membership_plans (gym_id, name, duration_days, price_cents)
        VALUES ($1, 'Standard Monthly', 30, 5000)
        RETURNING id;
      `, [testGymId]);
      testPlanId = planRes.rows[0].id;

      // Create member
      const memberRes = await client.query<{ id: string }>(`
        INSERT INTO members (gym_id, member_number, first_name, phone)
        VALUES ($1, 'MEM-0001', 'TestMember', '+919960000001')
        RETURNING id;
      `, [testGymId]);
      testMemberId = memberRes.rows[0].id;

      // Create active subscription
      const subRes = await client.query<{ id: string }>(`
        INSERT INTO subscriptions (gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
        VALUES ($1, $2, $3, 'active', '2026-11-01', '2026-11-30', 5000)
        RETURNING id;
      `, [testGymId, testMemberId, testPlanId]);
      testSubId = subRes.rows[0].id;

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it('1. provision_gym rejects mismatched owner (app.user_id != p_owner_id)', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id', $1, true);", ['11111111-1111-1111-1111-111111111111']);

      await expect(
        client.query('SELECT provision_gym($1, $2, $3, $4, $5, $6, $7);', [
          '22222222-2222-2222-2222-222222222222', // mismatched!
          'Spoofed Gym',
          `spoofed-${Date.now()}`,
          'IN',
          'Asia/Kolkata',
          'INR',
          0
        ])
      ).rejects.toThrow(/does not match active session user/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('2. claim_staff_invitation rejects mismatched user (app.user_id != p_user_id)', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id', $1, true);", ['11111111-1111-1111-1111-111111111111']);

      await expect(
        client.query('SELECT * FROM claim_staff_invitation($1, $2);', [
          'fake_token_hash_value_here',
          '22222222-2222-2222-2222-222222222222' // mismatched!
        ])
      ).rejects.toThrow(/does not match active session user/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('3. app_user is denied direct execution of _generate_next_receipt_number_internal', async () => {
    const client = await pool.connect();
    try {
      await expect(
        client.query('SELECT _generate_next_receipt_number_internal($1, $2);', [
          testGymId,
          '2026-11-08T10:00:00Z'
        ])
      ).rejects.toThrow(/permission denied/i);
    } finally {
      client.release();
    }
  });

  it('4. app_user is denied direct SELECT on users.password_hash', async () => {
    const client = await pool.connect();
    try {
      await expect(
        client.query('SELECT password_hash FROM users;')
      ).rejects.toThrow(/permission denied/i);
    } finally {
      client.release();
    }
  });

  it('5. app_user is denied direct UPDATE on payment_transactions (immutable ledger)', async () => {
    const client = await pool.connect();
    try {
      await expect(
        client.query('UPDATE payment_transactions SET amount_cents = 0;')
      ).rejects.toThrow(/permission denied/i);
    } finally {
      client.release();
    }
  });

  it('6. app_user is denied direct UPDATE on tenants', async () => {
    const client = await pool.connect();
    try {
      await expect(
        client.query("UPDATE tenants SET name = 'Hacked';")
      ).rejects.toThrow(/permission denied/i);
    } finally {
      client.release();
    }
  });

  it('7. app_user is denied direct DELETE on audit_logs (append-only audit trail)', async () => {
    const client = await pool.connect();
    try {
      await expect(
        client.query('DELETE FROM audit_logs;')
      ).rejects.toThrow(/permission denied/i);
    } finally {
      client.release();
    }
  });

  it('8. check_days_frozen_match constraint rejects mismatched days_frozen', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.gym_id', $1, true);", [testGymId]);
      await client.query("SELECT set_config('app.user_id', $1, true);", [ownerUserId]);

      // 2026-12-01 to 2026-12-10 is 10 days. Attempt inserting 5 days -> Check constraint violation!
      await expect(
        client.query(`
          INSERT INTO subscription_freezes (gym_id, subscription_id, freeze_start, freeze_end, days_frozen, reason, approved_by_user_id)
          VALUES ($1, $2, '2026-12-01', '2026-12-10', 5, 'Invalid days test', $3);
        `, [testGymId, testSubId, ownerUserId])
      ).rejects.toThrow(/check_days_frozen_match/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('9. UPDATE on subscription_adjustments is rejected (append-only table)', async () => {
    const client = await pool.connect();
    try {
      await expect(
        client.query("UPDATE subscription_adjustments SET reason = 'Tampered';")
      ).rejects.toThrow(/permission denied|append-only/i);
    } finally {
      client.release();
    }
  });

  it('10. void_attendance_record rejects execution when actor is not an owner', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.gym_id', $1, true);", [testGymId]);
      // Set nonOwnerUserId context
      await client.query("SELECT set_config('app.user_id', $1, true);", [nonOwnerUserId]);

      await expect(
        client.query('SELECT void_attendance_record($1, $2, $3);', [
          testGymId,
          '00000000-0000-0000-0000-000000000000',
          'Accidental check-in'
        ])
      ).rejects.toThrow(/not authorized to void attendance/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('11. refund guard rejects refund on active subscription without price adjustment', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.gym_id', $1, true);", [testGymId]);
      await client.query("SELECT set_config('app.user_id', $1, true);", [ownerUserId]);

      // Record a payment for the active subscription
      const pRes = await client.query<{ id: string }>(`
        INSERT INTO payment_transactions (gym_id, member_id, subscription_id, idempotency_key, type, method, amount_cents, receipt_number, recorded_by_user_id)
        VALUES ($1, $2, $3, $4, 'payment', 'cash', 5000, 'REC-SEC-001', $5)
        RETURNING id;
      `, [testGymId, testMemberId, testSubId, crypto.randomUUID(), ownerUserId]);
      const paymentId = pRes.rows[0].id;

      // Attempt refund without adjusting the active subscription -> rejected!
      await expect(
        client.query(`
          INSERT INTO payment_transactions (gym_id, member_id, subscription_id, idempotency_key, type, method, amount_cents, parent_transaction_id, receipt_number, recorded_by_user_id)
          VALUES ($1, $2, $3, $4, 'refund', 'cash', -2000, $5, 'REC-SEC-REF-001', $6);
        `, [testGymId, testMemberId, testSubId, crypto.randomUUID(), paymentId, ownerUserId])
      ).rejects.toThrow(/price adjustment/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('12. overlap guard prevents active subscription collision on status transition', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.gym_id', $1, true);", [testGymId]);
      await client.query("SELECT set_config('app.user_id', $1, true);", [ownerUserId]);

      // Create a pending subscription that overlaps with testSubId (2026-11-01 to 2026-11-30)
      const pendingRes = await client.query<{ id: string }>(`
        INSERT INTO subscriptions (gym_id, member_id, plan_id, status, start_date, end_date, total_price_cents)
        VALUES ($1, $2, $3, 'pending', '2026-11-15', '2026-12-14', 5000)
        RETURNING id;
      `, [testGymId, testMemberId, testPlanId]);
      const pendingSubId = pendingRes.rows[0].id;

      // Flipping pending to active when it overlaps with another active sub must be rejected!
      await expect(
        client.query(`
          UPDATE subscriptions SET status = 'active' WHERE id = $1;
        `, [pendingSubId])
      ).rejects.toThrow(/overlap/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
