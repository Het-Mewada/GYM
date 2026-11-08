import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import { createPool } from '@gym/db';
import type pg from 'pg';
import { resetAccountThrottler } from '../src/auth/routes.js';
import { hashPassword } from '../src/auth/crypto.js';

describe('Auth & Session System', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;

  const testPhone = `+91987${Math.floor(1000000 + Math.random() * 9000000)}`;
  const testPassword = 'StrongPassword123!';
  let userId: string;
  let refreshTokenCookie: string;
  let accessToken: string;

  beforeAll(async () => {
    pool = createPool();
    await resetAccountThrottler(pool);
    app = buildApp(pool);
    await app.ready();

    // Direct DB registration for owner test fixture (pilot has open registration closed)
    const passHash = await hashPassword(testPassword);
    const regRes = await pool.query<{ auth_register_user: string }>(
      'SELECT auth_register_user($1, $2, $3) as auth_register_user;',
      [testPhone, passHash, 'Test Owner']
    );
    userId = regRes.rows[0].auth_register_user;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. rejects open registration as invite-only for pilot', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        phone: `+91988${Math.floor(1000000 + Math.random() * 9000000)}`,
        password: testPassword,
        fullName: 'Uninvited User'
      }
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toContain('Registration is invite-only for the pilot');
  });

  it('2. enforces database-backed per-account login throttling after 5 failed attempts', async () => {
    const attackPhone = `+91989${Math.floor(1000000 + Math.random() * 9000000)}`;

    // Seed account in DB
    const passHash = await hashPassword('RealPassword123!');
    await pool.query('SELECT auth_register_user($1, $2, $3);', [attackPhone, passHash, 'Target User']);

    // 4 failed attempts should return 401
    for (let i = 0; i < 4; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { phone: attackPhone, password: 'BadPassword!' }
      });
      expect(res.statusCode).toBe(401);
    }

    // 5th failed attempt triggers 429 Account Lockout
    const lockRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: attackPhone, password: 'BadPassword!' }
    });
    expect(lockRes.statusCode).toBe(429);
    expect(lockRes.json().error).toContain('Too many failed login attempts for this account');

    // Verify counter lives in database via security definer check
    const lockStatus = await pool.query<{ out_is_locked: boolean; out_remaining_seconds: number }>(
      'SELECT * FROM auth_is_account_locked($1);',
      [attackPhone]
    );
    expect(lockStatus.rows[0].out_is_locked).toBe(true);
    expect(lockStatus.rows[0].out_remaining_seconds).toBeGreaterThan(0);

    // 6th attempt even with correct password is still rejected with 429
    const lockedValidRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: attackPhone, password: 'RealPassword123!' }
    });
    expect(lockedValidRes.statusCode).toBe(429);
  });

  it('3. logs in with Argon2id verification and receives tokens + HttpOnly cookie', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        phone: testPhone,
        password: testPassword
      }
    });

    expect(loginRes.statusCode).toBe(200);
    const body = loginRes.json();
    expect(body.accessToken).toBeDefined();
    expect(body.user.id).toBe(userId);
    accessToken = body.accessToken;

    const cookies = loginRes.cookies;
    const rfCookie = cookies.find(c => c.name === 'refresh_token');
    expect(rfCookie).toBeDefined();
    expect(rfCookie?.httpOnly).toBe(true);
    expect(rfCookie?.sameSite).toBe('Strict');
    expect(rfCookie?.value).toContain(userId);
    refreshTokenCookie = rfCookie!.value;
  });

  it('4. rotates refresh token and tolerates near-simultaneous refreshes within grace window', async () => {
    // First legitimate refresh: rotates token
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `refresh_token=${refreshTokenCookie}` }
    });

    expect(refreshRes.statusCode).toBe(200);
    const body = refreshRes.json();
    expect(body.accessToken).toBeDefined();

    const newRfCookie = refreshRes.cookies.find(c => c.name === 'refresh_token');
    expect(newRfCookie).toBeDefined();
    expect(newRfCookie?.value).not.toBe(refreshTokenCookie);

    const oldSpentCookie = refreshTokenCookie;
    const newActiveCookie = newRfCookie!.value;

    // CONCURRENT REFRESH: Presenting old spent cookie within 10s grace window MUST succeed!
    const concurrentRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `refresh_token=${oldSpentCookie}` }
    });

    expect(concurrentRes.statusCode).toBe(200);
    expect(concurrentRes.json().accessToken).toBeDefined();

    // Now simulate token reuse outside the grace window by backdating revoked_at > 10 seconds ago
    // (Must run under app.user_id context to satisfy RLS)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.user_id', $1, true);", [userId]);
      await client.query(`
        UPDATE refresh_tokens
        SET revoked_at = NOW() - INTERVAL '30 seconds'
        WHERE user_id = $1 AND is_revoked = true;
      `, [userId]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    // Presenting spent cookie outside grace window must trigger reuse detection and revoke family
    const reuseAttackRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `refresh_token=${oldSpentCookie}` }
    });

    expect(reuseAttackRes.statusCode).toBe(401);
    expect(reuseAttackRes.json().error).toContain('reuse detected');

    // And now the previously active cookie must ALSO be invalidated
    const subsequentRes = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `refresh_token=${newActiveCookie}` }
    });
    expect(subsequentRes.statusCode).toBe(401);
  });

  it('5. password reset request returns uniform response without user enumeration', async () => {
    // Non-existent phone
    const nonExistentRes = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/request',
      payload: { phone: '+910000000000' }
    });
    expect(nonExistentRes.statusCode).toBe(200);
    expect(nonExistentRes.json().message).toContain('If an account exists');

    // Existing phone
    const existingRes = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/request',
      payload: { phone: testPhone }
    });
    expect(existingRes.statusCode).toBe(200);
    expect(existingRes.json().message).toContain('If an account exists');
  });

  it('6. owner-initiated staff password reset (owner only, cannot reset another owner)', async () => {
    // Re-login to get fresh tokens
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: testPhone, password: testPassword }
    });
    const ownerToken = loginRes.json().accessToken;

    // Provision a gym
    const gymRes = await app.inject({
      method: 'POST',
      url: '/api/gyms',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Iron Palace', slug: `iron-palace-${Date.now()}` }
    });
    const gymId = gymRes.json().gymId;

    // Register a staff user in DB and link as staff in gym
    const staffPhone = `+91771${Date.now().toString().slice(-7)}`;
    const passHash = await hashPassword('OldStaffPass123!');
    const staffUserRes = await pool.query<{ auth_register_user: string }>(
      'SELECT auth_register_user($1, $2, $3) as auth_register_user;',
      [staffPhone, passHash, 'Gym Staff']
    );
    const staffUserId = staffUserRes.rows[0].auth_register_user;

    const linkUserToGym = async (gId: string, uId: string, role: string) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.gym_id', $1, true);", [gId]);
        await client.query(
          "INSERT INTO user_gym_memberships (gym_id, user_id, role, is_active) VALUES ($1, $2, $3, true);",
          [gId, uId, role]
        );
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    };

    await linkUserToGym(gymId, staffUserId, 'staff');

    // Register another owner in DB and link as co-owner in gym
    const coOwnerPhone = `+91772${Date.now().toString().slice(-7)}`;
    const coOwnerRes = await pool.query<{ auth_register_user: string }>(
      'SELECT auth_register_user($1, $2, $3) as auth_register_user;',
      [coOwnerPhone, passHash, 'Co Owner']
    );
    const coOwnerUserId = coOwnerRes.rows[0].auth_register_user;

    await linkUserToGym(gymId, coOwnerUserId, 'owner');

    // 6a. Owner generates reset link for staff member (Must succeed)
    const resetGenRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/staff/${staffUserId}/reset-password`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(resetGenRes.statusCode).toBe(200);
    const resetBody = resetGenRes.json();
    expect(resetBody.userId).toBe(staffUserId);
    expect(resetBody.resetToken).toBeDefined();
    expect(resetBody.resetUrl).toContain(resetBody.resetToken);

    // 6b. Complete password reset using the token
    const newStaffPass = 'NewStaffPass1234!';
    const compRes = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/complete',
      payload: {
        token: resetBody.resetToken,
        newPassword: newStaffPass
      }
    });
    expect(compRes.statusCode).toBe(200);

    // Staff logs in with new password
    const staffLoginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: staffPhone, password: newStaffPass }
    });
    expect(staffLoginRes.statusCode).toBe(200);
    const staffToken = staffLoginRes.json().accessToken;

    // 6c. Owner CANNOT reset another owner (Must be rejected with 403)
    const resetCoOwnerRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/staff/${coOwnerUserId}/reset-password`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(resetCoOwnerRes.statusCode).toBe(403);
    expect(resetCoOwnerRes.json().error).toContain('Owners cannot reset passwords of other owners');

    // 6d. Non-owner (staff) CANNOT initiate reset for anyone (Must be rejected with 403)
    const staffAttemptRes = await app.inject({
      method: 'POST',
      url: `/api/gyms/${gymId}/staff/${staffUserId}/reset-password`,
      headers: { authorization: `Bearer ${staffToken}` }
    });
    expect(staffAttemptRes.statusCode).toBe(403);
    expect(staffAttemptRes.json().error).toContain('Only gym owners can initiate staff password resets');
  });

  it('7. login for unknown vs known phone returns identical status/body and comparable timing (dummy hash defense)', async () => {
    const unknownPhone = `+91900${Math.floor(1000000 + Math.random() * 9000000)}`;

    // Unknown phone attempt
    const t0 = performance.now();
    const resUnknown = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: unknownPhone, password: 'RandomPassword123!' }
    });
    const tUnknown = performance.now() - t0;

    // Known phone with wrong password attempt
    const t1 = performance.now();
    const resKnown = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { phone: testPhone, password: 'WrongPassword123!' }
    });
    const tKnown = performance.now() - t1;

    // 1. Status codes must be identical 401
    expect(resUnknown.statusCode).toBe(401);
    expect(resKnown.statusCode).toBe(401);

    // 2. Response body must be identical (no enumeration)
    expect(resUnknown.json()).toEqual(resKnown.json());
    expect(resUnknown.json()).toEqual({ error: 'Invalid phone number or password' });

    // 3. Execution time: both must execute Argon2id computation
    // Both take substantial CPU time due to Argon2id (64MB, 3 iterations)
    expect(tUnknown).toBeGreaterThan(15);
    expect(tKnown).toBeGreaterThan(15);
  });
});
